extends SceneTree

## Regression guard for multi-client support in MCPWebSocketServer.
## Drives the REAL server node with two live WebSocketPeer clients.
##
## THE BUG: the server held one client and closed any second connection with 4001,
## so a second concurrently-running MCP client retried forever and never got in.
##
## THE FIX: per-connection state keyed by a monotonic conn_id, with 4001 demoted to
## an overflow-only path past MAX_CONNECTIONS.
##
## Both clients deliberately send the SAME request id, the realistic case since
## independent clients each count their ids from 1, and the reply marker comes from
## the server-side conn_id rather than from params, so a pass proves routing by
## connection identity instead of echoing caller data back.
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/websocket_multi_client_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const TEST_PORT := 6599
const POLL_TIMEOUT_FRAMES := 300  # ~5s at 60Hz; generous for local loopback

var _count := 0
var _failures := 0

var _server: MCPWebSocketServer
# Order conn_ids reached STATE_OPEN in. TCPServer accepts are FIFO, so this maps back
# to "client A" / "client B" without trusting anything the client claims about itself.
var _connect_order: Array[int] = []
var _count_at_disconnect := -1


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n===================== WEBSOCKET MULTI-CLIENT TEST =====================\n")

	_server = MCPWebSocketServer.new()
	root.add_child(_server)
	_server.command_received.connect(_on_command_received)
	_server.client_connected.connect(_on_client_connected)
	_server.client_disconnected.connect(_on_client_disconnected)

	var start_err := _server.start_server(TEST_PORT, "127.0.0.1")
	_check("server starts on port %d" % TEST_PORT, start_err, OK)
	if start_err != OK:
		_finish()
		return

	var client_a := WebSocketPeer.new()
	var client_b := WebSocketPeer.new()
	_check("client A initiates connection", client_a.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)
	_check("client B initiates connection", client_b.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)

	var both_open := await _step_until_polling([client_a, client_b], func() -> bool:
		return client_a.get_ready_state() == WebSocketPeer.STATE_OPEN and client_b.get_ready_state() == WebSocketPeer.STATE_OPEN
	)
	_check("both clients reach STATE_OPEN (neither rejected with 4001)", both_open, true)
	_check("server reports 2 connections", _server.get_connection_count(), 2)
	_check("client_connected fired for both connections", _connect_order.size(), 2)
	if _connect_order.size() != 2:
		_finish()
		return
	var conn_id_a: int = _connect_order[0]
	var conn_id_b: int = _connect_order[1]

	client_a.send_text(JSON.stringify({"id": "1", "command": "ping", "params": {}}))
	client_b.send_text(JSON.stringify({"id": "1", "command": "ping", "params": {}}))

	# Mutable state lives in a Dictionary (a reference type): GDScript lambdas snapshot
	# captured locals by value, so writes to a captured local would not be visible here.
	var replies: Dictionary = {"a": null, "b": null}
	await _step_until_polling([client_a, client_b], func() -> bool:
		if replies["a"] == null:
			replies["a"] = _drain_reply(client_a)
		if replies["b"] == null:
			replies["b"] = _drain_reply(client_b)
		return replies["a"] != null and replies["b"] != null
	)

	_check("client A received a reply", replies["a"] != null, true)
	_check("client B received a reply", replies["b"] != null, true)
	if replies["a"] != null:
		_check("client A got its own reply, not B's", replies["a"].get("marker", ""), "reply-for-conn-%d" % conn_id_a)
	if replies["b"] != null:
		_check("client B got its own reply, not A's", replies["b"].get("marker", ""), "reply-for-conn-%d" % conn_id_b)

	client_a.close()
	await _step_until_polling([client_b], func() -> bool:
		return _count_at_disconnect >= 0
	)
	_check("count is already decremented inside the client_disconnected handler", _count_at_disconnect, 1)
	_check("connection count drops to 1 after client A closes", _server.get_connection_count(), 1)
	_check("client B still open after client A closed", client_b.get_ready_state(), WebSocketPeer.STATE_OPEN)

	client_b.send_text(JSON.stringify({"id": "2", "command": "ping", "params": {}}))
	var reply_b2: Dictionary = {"value": null}
	await _step_until_polling([client_b], func() -> bool:
		if reply_b2["value"] == null:
			reply_b2["value"] = _drain_reply(client_b)
		return reply_b2["value"] != null
	)
	_check("surviving client B still served after A disconnected",
		reply_b2["value"] != null and reply_b2["value"].get("marker", "") == "reply-for-conn-%d" % conn_id_b, true)

	client_b.close()
	_server.stop_server()
	root.remove_child(_server)
	_server.free()
	_finish()


func _on_command_received(conn_id: int, id: String, _command: String, _params: Dictionary) -> void:
	_server.send_response(conn_id, {"id": id, "status": "ok", "marker": "reply-for-conn-%d" % conn_id})


func _on_client_connected(conn_id: int) -> void:
	_connect_order.append(conn_id)


func _on_client_disconnected(_conn_id: int) -> void:
	# Reading from inside the handler, before pruning, is what caught a
	# get_connection_count() off-by-one against a closed-but-not-yet-removed entry.
	_count_at_disconnect = _server.get_connection_count()


func _drain_reply(ws: WebSocketPeer) -> Variant:
	if ws.get_available_packet_count() == 0:
		return null
	var packet := ws.get_packet()
	var json := JSON.new()
	if json.parse(packet.get_string_from_utf8()) != OK:
		return null
	return json.data


# WebSocketPeer only advances its handshake/close state machine while polled, and the
# server node only advances on its own _process, so both sides need pumping each frame.
func _step_until_polling(peers: Array, predicate: Callable) -> bool:
	for _i in POLL_TIMEOUT_FRAMES:
		for peer: WebSocketPeer in peers:
			peer.poll()
		if predicate.call():
			return true
		await process_frame
	return predicate.call()


func _check(label: String, got: Variant, expected: Variant) -> void:
	_count += 1
	if got == expected:
		print("ok %d - %s (= %s)" % [_count, label, str(got)])
	else:
		_failures += 1
		printerr("not ok %d - %s : expected %s, got %s" % [_count, label, str(expected), str(got)])


func _finish() -> void:
	print("\n1..%d" % _count)
	if _failures == 0:
		print("ALL PASS — %d checks" % _count)
	else:
		printerr("FAILED — %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)
