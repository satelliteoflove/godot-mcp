extends SceneTree

## Regression guard for issue #74 ("awaiting WebSocket handshake" instability),
## re-checked now that MCPWebSocketServer accepts several clients at once.
##
## THE BUG: a newcomer silently took over the single stored peer, so the client
## that was mid-request lost its reply, the console repeated the "TCP connection
## received, awaiting WebSocket handshake" line every second, and the MCP server
## fell into a reconnect loop.
##
## Covered here, in order: a busy single client is never dropped; a reply issued
## after a second client joined still reaches its own sender; connect/disconnect
## churn (including peers that never upgrade) leaves nothing behind; and the
## MAX_CONNECTIONS overflow path hands the newcomer a coded 4001 close and then
## frees the slot again.
##
## Companion to websocket_multi_client_test.gd, which covers the concurrent-connect
## and per-conn_id reply-isolation basics that this file does not repeat.
##   & "<godot.exe>" --headless --path "<project-with-addon>" \
##       --script "res://addons/godot_mcp/test/websocket_connection_churn_test.gd"
## Exit code 0 = all checks passed, 1 = at least one failed.

const TEST_PORT := 6598
const POLL_TIMEOUT_FRAMES := 600  # ~10s at 60Hz; the cap scenario opens 9 peers
const BURST_SIZE := 25
const CHURN_CYCLES := 10

var _count := 0
var _failures := 0

var _server: MCPWebSocketServer
var _connect_order: Array[int] = []
# Set by the "slow" command instead of replying, so the test controls exactly when
# the response is sent relative to another client connecting.
var _deferred: Dictionary = {}


func _initialize() -> void:
	_run()


func _run() -> void:
	for i in 5:
		await process_frame

	print("\n================= WEBSOCKET CONNECTION CHURN TEST =================\n")

	_server = MCPWebSocketServer.new()
	root.add_child(_server)
	_server.command_received.connect(_on_command_received)
	_server.client_connected.connect(_on_client_connected)

	var start_err := _server.start_server(TEST_PORT, "127.0.0.1")
	_check("server starts on port %d" % TEST_PORT, start_err, OK)
	if start_err != OK:
		_finish()
		return

	await _scenario_rapid_burst()
	await _scenario_join_during_inflight_command()
	await _scenario_churn_leaves_nothing_behind()
	await _scenario_connection_cap()

	_server.stop_server()
	root.remove_child(_server)
	_server.free()
	_finish()


# One client, many commands back to back with no waiting in between. The original
# report was a single busy client being knocked offline, so this is the baseline.
func _scenario_rapid_burst() -> void:
	print("\n-- rapid burst on one client --")
	var client := WebSocketPeer.new()
	_check("burst client initiates connection", client.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)
	var opened := await _step_until([client], func() -> bool:
		return client.get_ready_state() == WebSocketPeer.STATE_OPEN
	)
	_check("burst client reaches STATE_OPEN", opened, true)

	for i in BURST_SIZE:
		client.send_text(JSON.stringify({"id": "burst-%d" % i, "command": "ping", "params": {}}))

	var seen: Dictionary = {}
	var duplicates: Dictionary = {"count": 0}
	await _step_until([client], func() -> bool:
		var reply = _drain_reply(client)
		while reply != null:
			var reply_id: String = str(reply.get("id", ""))
			if seen.has(reply_id):
				duplicates["count"] += 1
			seen[reply_id] = true
			reply = _drain_reply(client)
		return seen.size() >= BURST_SIZE
	)

	_check("every command in the burst got a reply", seen.size(), BURST_SIZE)
	_check("no reply arrived twice", duplicates["count"], 0)
	_check("last id in the burst came back", seen.has("burst-%d" % (BURST_SIZE - 1)), true)
	_check("burst client still open after the burst", client.get_ready_state(), WebSocketPeer.STATE_OPEN)
	_check("burst client is still the only connection", _server.get_connection_count(), 1)

	client.close()
	await _step_until([client], func() -> bool:
		return _server.get_connection_count() == 0
	)


# The literal #74 failure: a request is in flight when someone else connects. The
# response is sent after the connection table has changed, and must still land on
# the original sender.
func _scenario_join_during_inflight_command() -> void:
	print("\n-- a second client joins mid-request --")
	_connect_order.clear()
	_deferred = {}

	var client_a := WebSocketPeer.new()
	_check("client A initiates connection", client_a.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)
	await _step_until([client_a], func() -> bool:
		return client_a.get_ready_state() == WebSocketPeer.STATE_OPEN
	)

	client_a.send_text(JSON.stringify({"id": "inflight-1", "command": "slow", "params": {}}))
	var command_arrived := await _step_until([client_a], func() -> bool:
		return not _deferred.is_empty()
	)
	_check("client A's command reached the server and is still unanswered", command_arrived, true)
	if not command_arrived:
		return

	var client_b := WebSocketPeer.new()
	_check("client B initiates connection while A waits", client_b.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)
	var b_open := await _step_until([client_a, client_b], func() -> bool:
		return client_b.get_ready_state() == WebSocketPeer.STATE_OPEN
	)
	_check("client B completes its handshake while A's request is pending", b_open, true)
	_check("client A was not displaced by client B", client_a.get_ready_state(), WebSocketPeer.STATE_OPEN)
	_check("server holds both connections", _server.get_connection_count(), 2)

	var conn_id_a: int = _deferred["conn_id"]
	_server.send_response(conn_id_a, {
		"id": _deferred["id"],
		"status": "ok",
		"marker": "reply-for-conn-%d" % conn_id_a,
	})

	var reply_a: Dictionary = {"value": null}
	await _step_until([client_a, client_b], func() -> bool:
		if reply_a["value"] == null:
			reply_a["value"] = _drain_reply(client_a)
		return reply_a["value"] != null
	)
	_check("client A received its deferred reply", reply_a["value"] != null, true)
	if reply_a["value"] != null:
		_check("the deferred reply carries A's request id", str(reply_a["value"].get("id", "")), "inflight-1")
		_check("the deferred reply is addressed to A's connection",
			reply_a["value"].get("marker", ""), "reply-for-conn-%d" % conn_id_a)

	# Give any stray packet a few frames to show up on B before declaring it clean.
	for _i in 10:
		client_b.poll()
		await process_frame
	_check("client B never saw A's reply", client_b.get_available_packet_count(), 0)

	client_b.send_text(JSON.stringify({"id": "after-1", "command": "ping", "params": {}}))
	var reply_b: Dictionary = {"value": null}
	await _step_until([client_b], func() -> bool:
		if reply_b["value"] == null:
			reply_b["value"] = _drain_reply(client_b)
		return reply_b["value"] != null
	)
	_check("client B is served normally afterwards",
		reply_b["value"] != null and str(reply_b["value"].get("id", "")) == "after-1", true)

	client_a.close()
	client_b.close()
	await _step_until([client_a, client_b], func() -> bool:
		return _server.get_connection_count() == 0
	)


# Repeated connects and drops, mixing clean WebSocket clients with raw TCP peers that
# never send an upgrade request. The raw peers are what produced the repeating
# "awaiting WebSocket handshake" line, so they must be reaped, not accumulated.
func _scenario_churn_leaves_nothing_behind() -> void:
	print("\n-- connect/disconnect churn --")
	var conn_id_before: int = _server._next_conn_id

	for i in CHURN_CYCLES:
		var client := WebSocketPeer.new()
		client.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT)
		await _step_until([client], func() -> bool:
			return client.get_ready_state() == WebSocketPeer.STATE_OPEN
		)
		client.close()
		await _step_until([client], func() -> bool:
			return _server.get_connection_count() == 0
		)

	_check("every churn cycle completed its handshake", _server._next_conn_id - conn_id_before, CHURN_CYCLES)
	_check("no connection entries survive the churn", _server._connections.size(), 0)

	# A peer that opens TCP and then vanishes without ever upgrading. Rather than wait
	# out HANDSHAKE_TIMEOUT_MSEC, drop the socket so the TCP-dead branch reaps it.
	for i in 2:
		var raw := StreamPeerTCP.new()
		_check("raw TCP peer %d connects" % i, raw.connect_to_host("127.0.0.1", TEST_PORT), OK)
		var accepted := await _step_until([], func() -> bool:
			raw.poll()
			return _server._connections.size() == 1
		)
		_check("raw TCP peer %d is tracked while it waits to upgrade" % i, accepted, true)
		_check("a peer that never upgraded is not counted as connected" if i == 0 else
			"a peer that never upgraded is still not counted as connected",
			_server.get_connection_count(), 1)
		raw.disconnect_from_host()
		var reaped := await _step_until([], func() -> bool:
			return _server._connections.size() == 0
		)
		_check("raw TCP peer %d is reaped once its socket dies" % i, reaped, true)

	_check("no rejection peers left over after churn", _server._rejecting_peers.is_empty(), true)


# Past MAX_CONNECTIONS the newcomer is refused. It must get a real coded close rather
# than a bare TCP reset, and the slot must come back once someone leaves.
func _scenario_connection_cap() -> void:
	print("\n-- connection cap and the 4001 rejection --")
	var limit: int = MCPWebSocketServer.MAX_CONNECTIONS
	var clients: Array[WebSocketPeer] = []
	for i in limit:
		var client := WebSocketPeer.new()
		client.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT)
		clients.append(client)

	var all_open := await _step_until(clients, func() -> bool:
		for peer: WebSocketPeer in clients:
			if peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
				return false
		return true
	)
	_check("all %d clients up to the cap connect" % limit, all_open, true)
	_check("server reports %d connections" % limit, _server.get_connection_count(), limit)

	var overflow := WebSocketPeer.new()
	_check("overflow client initiates connection", overflow.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT), OK)
	var closed := await _step_until(clients + [overflow], func() -> bool:
		return overflow.get_ready_state() == WebSocketPeer.STATE_CLOSED
	)
	_check("overflow client is closed rather than served", closed, true)
	_check("overflow client got a coded close, not a reset", overflow.get_close_code(), MCPWebSocketServer.CLOSE_CODE_TOO_MANY)
	_check("the close carries the cap reason", overflow.get_close_reason(), MCPWebSocketServer.CLOSE_REASON_TOO_MANY)
	_check("the cap was never exceeded", _server.get_connection_count(), limit)

	var drained := await _step_until(clients, func() -> bool:
		return _server._rejecting_peers.is_empty()
	)
	_check("the rejected peer is dropped once its close is flushed", drained, true)

	clients[0].close()
	await _step_until(clients, func() -> bool:
		return _server.get_connection_count() == limit - 1
	)

	var latecomer := WebSocketPeer.new()
	latecomer.connect_to_url("ws://127.0.0.1:%d" % TEST_PORT)
	var latecomer_open := await _step_until(clients + [latecomer], func() -> bool:
		return latecomer.get_ready_state() == WebSocketPeer.STATE_OPEN
	)
	_check("a fresh client gets in once a slot frees", latecomer_open, true)
	_check("server is back at the cap", _server.get_connection_count(), limit)

	latecomer.close()
	for peer: WebSocketPeer in clients:
		peer.close()
	await _step_until(clients + [latecomer], func() -> bool:
		return _server.get_connection_count() == 0
	)


func _on_command_received(conn_id: int, id: String, command: String, _params: Dictionary) -> void:
	if command == "slow":
		_deferred = {"conn_id": conn_id, "id": id}
		return
	_server.send_response(conn_id, {"id": id, "status": "ok", "marker": "reply-for-conn-%d" % conn_id})


func _on_client_connected(conn_id: int) -> void:
	_connect_order.append(conn_id)


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
func _step_until(peers: Array, predicate: Callable) -> bool:
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
		print("ALL PASS: %d checks" % _count)
	else:
		printerr("FAILED: %d/%d checks failed" % [_failures, _count])
	quit(1 if _failures > 0 else 0)
