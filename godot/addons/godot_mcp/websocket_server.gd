@tool
extends Node
class_name MCPWebSocketServer

signal command_received(conn_id: int, id: String, command: String, params: Dictionary)
signal client_connected(conn_id: int)
signal client_disconnected(conn_id: int)

const DEFAULT_PORT := 6550
const STALE_CONNECTION_TIMEOUT_MSEC := 45000
# Upper bound on how long a rejected newcomer is kept around while we hand it a
# clean 4001 close. Caps the whole reject lifecycle (handshake + close flush) so
# a peer that never upgrades or never finishes closing can't leak.
const REJECT_TIMEOUT_MSEC := 5000
const CLOSE_CODE_STALE := 4002
const CLOSE_REASON_STALE := "Connection timed out (no activity)"
const CLOSE_CODE_TOO_MANY := 4001
const CLOSE_REASON_TOO_MANY := "Too many connections (limit reached)"
const CLOSE_CODE_NORMAL := 1000
# Real usage is a handful of concurrent agent sessions; the cap only exists to stop a
# runaway client (a retry loop with no backoff) from spawning unbounded connections.
const MAX_CONNECTIONS := 8
# Without this, a peer that completes TCP but never upgrades sits in STATE_CONNECTING
# forever, holding a MAX_CONNECTIONS slot.
const HANDSHAKE_TIMEOUT_MSEC := 10000

var _server: TCPServer
var _next_conn_id: int = 1
# Each entry: { "conn_id": int, "ws": WebSocketPeer, "tcp": StreamPeerTCP, "host": String,
# "port": int, "last_activity_msec": int, "is_open": bool }.
var _connections: Array[Dictionary] = []
var _stale_reason: String = ""
# Newcomers that arrived while the server was already at MAX_CONNECTIONS. Each entry
# is { "ws": WebSocketPeer, "tcp": StreamPeerTCP, "since_msec": int, "close_sent": bool }.
# They are handshaked just far enough to receive a clean 4001 close, then dropped.
var _rejecting_peers: Array = []


func _process(_delta: float) -> void:
	if not _server:
		return

	# is_connection_available() alone is not a safe loop condition: take_connection()
	# can still return null if the peer dropped mid-accept, spinning this loop forever.
	while _server.is_connection_available():
		if not _accept_connection():
			break

	for entry in _connections:
		_poll_connection(entry)
	_prune_closed_connections()

	if not _rejecting_peers.is_empty():
		_process_rejecting_peers()


func start_server(port: int = DEFAULT_PORT, bind_address: String = "127.0.0.1") -> Error:
	_server = TCPServer.new()
	var err := _server.listen(port, bind_address)
	if err != OK:
		_server = null
		MCPLog.error("Failed to start server on %s:%d: %s" % [bind_address, port, error_string(err)])
		return err

	return OK


func stop_server() -> void:
	for entry in _connections:
		_close_connection(entry, CLOSE_CODE_NORMAL, "")
	_connections.clear()

	for entry in _rejecting_peers:
		var rej_ws: WebSocketPeer = entry.get("ws")
		if rej_ws:
			rej_ws.close()
		var rej_tcp: StreamPeerTCP = entry.get("tcp")
		if rej_tcp:
			rej_tcp.disconnect_from_host()
	_rejecting_peers.clear()

	if _server:
		_server.stop()
		_server = null


func get_connection_count() -> int:
	# client_disconnected fires a frame before the dead entry is pruned, and handlers
	# read this count, so size() would be one too high for the duration of that signal.
	var count := 0
	for entry in _connections:
		if entry["ws"] != null:
			count += 1
	return count


func get_connection_info(conn_id: int) -> Dictionary:
	var entry := _find_connection(conn_id)
	if entry.is_empty():
		return {}
	return {"host": entry["host"], "port": entry["port"]}


func send_response(conn_id: int, response: Dictionary) -> void:
	var entry := _find_connection(conn_id)
	var ws: WebSocketPeer = entry.get("ws")
	if entry.is_empty() or not ws or ws.get_ready_state() != WebSocketPeer.STATE_OPEN:
		MCPLog.warn("Cannot send response to conn %d: not connected" % conn_id)
		return

	var json := JSON.stringify(response)
	ws.send_text(json)


func _accept_connection() -> bool:
	var incoming := _server.take_connection()
	if not incoming:
		return false

	if get_connection_count() >= MAX_CONNECTIONS:
		MCPLog.warn("Rejecting new connection from %s:%d: connection cap (%d) reached" % [incoming.get_connected_host(), incoming.get_connected_port(), MAX_CONNECTIONS])
		_begin_reject(incoming)
		return true

	var ws := WebSocketPeer.new()
	ws.outbound_buffer_size = 16 * 1024 * 1024  # 16MB for screenshot data
	var err := ws.accept_stream(incoming)
	if err != OK:
		MCPLog.error("Failed to accept WebSocket stream: %s" % error_string(err))
		# Nothing tracks this peer, so drop it here or the socket lingers until
		# the last reference happens to be released.
		incoming.disconnect_from_host()
		return true

	var conn_id := _next_conn_id
	_next_conn_id += 1
	var entry: Dictionary = {
		"conn_id": conn_id,
		"ws": ws,
		"tcp": incoming,
		"host": incoming.get_connected_host(),
		"port": incoming.get_connected_port(),
		"last_activity_msec": Time.get_ticks_msec(),
		"is_open": false,
	}
	_connections.append(entry)

	MCPLog.info("TCP connection received from %s:%d (conn %d), awaiting WebSocket handshake..." % [entry["host"], entry["port"], conn_id])
	return true


func _begin_reject(incoming: StreamPeerTCP) -> void:
	# Complete just enough of the WebSocket handshake on a throwaway peer to send
	# a proper coded close frame (4001), so the rejected client gets a clear
	# diagnostic rather than an opaque TCP reset. Live connections are never
	# touched. Driven to completion in _process_rejecting_peers().
	var ws := WebSocketPeer.new()
	var err := ws.accept_stream(incoming)
	if err != OK:
		# Can't speak WebSocket to this peer; just drop the raw TCP connection.
		incoming.disconnect_from_host()
		return
	_rejecting_peers.append({
		"ws": ws,
		"tcp": incoming,
		"since_msec": Time.get_ticks_msec(),
		"close_sent": false,
	})


func _process_rejecting_peers() -> void:
	var keep: Array = []
	var now := Time.get_ticks_msec()
	for entry in _rejecting_peers:
		var ws: WebSocketPeer = entry["ws"]
		ws.poll()
		var state := ws.get_ready_state()

		# Hard lifecycle cap: a reject peer should resolve in milliseconds.
		# Anything still around past the timeout (never upgraded, or stuck
		# mid-close because the client vanished) gets dropped so it can't leak.
		if now - int(entry["since_msec"]) > REJECT_TIMEOUT_MSEC:
			_drop_rejecting_peer(entry)
			continue

		match state:
			WebSocketPeer.STATE_OPEN:
				if not entry["close_sent"]:
					ws.close(CLOSE_CODE_TOO_MANY, CLOSE_REASON_TOO_MANY)
					entry["close_sent"] = true
				# Keep polling so the close frame is actually flushed.
				keep.append(entry)
			WebSocketPeer.STATE_CLOSED:
				_drop_rejecting_peer(entry)
			_:
				# STATE_CONNECTING (awaiting handshake) or STATE_CLOSING
				# (flushing the close frame) - keep polling until the cap.
				keep.append(entry)
	_rejecting_peers = keep


func _drop_rejecting_peer(entry: Dictionary) -> void:
	var tcp: StreamPeerTCP = entry.get("tcp")
	if tcp:
		tcp.disconnect_from_host()
	entry["ws"] = null
	entry["tcp"] = null


func _poll_connection(entry: Dictionary) -> void:
	var ws: WebSocketPeer = entry["ws"]
	ws.poll()
	var state := ws.get_ready_state()
	var conn_id: int = entry["conn_id"]

	match state:
		WebSocketPeer.STATE_CONNECTING:
			var tcp: StreamPeerTCP = entry["tcp"]
			var timed_out: bool = Time.get_ticks_msec() - int(entry["last_activity_msec"]) > HANDSHAKE_TIMEOUT_MSEC
			var tcp_dead: bool = tcp and tcp.get_status() != StreamPeerTCP.STATUS_CONNECTED
			if timed_out or tcp_dead:
				MCPLog.warn("Dropping conn %d: handshake never completed (%s)" % [conn_id, "timed out" if timed_out else "TCP peer disconnected"])
				_close_connection(entry, CLOSE_CODE_STALE, CLOSE_REASON_STALE)

		WebSocketPeer.STATE_OPEN:
			if not entry["is_open"]:
				entry["is_open"] = true
				entry["last_activity_msec"] = Time.get_ticks_msec()
				client_connected.emit(conn_id)
				MCPLog.info("WebSocket handshake complete (conn %d)" % conn_id)

			if _is_stale_connection(entry):
				MCPLog.warn("Closing stale connection (conn %d, %s)" % [conn_id, _stale_reason])
				_close_connection(entry, CLOSE_CODE_STALE, CLOSE_REASON_STALE)
				return

			while ws.get_available_packet_count() > 0:
				entry["last_activity_msec"] = Time.get_ticks_msec()
				var packet := ws.get_packet()
				_handle_packet(conn_id, packet)

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			_mark_closed(entry)


func _prune_closed_connections() -> void:
	var keep: Array[Dictionary] = []
	for entry in _connections:
		if entry["ws"] == null:
			continue
		keep.append(entry)
	_connections = keep


func _mark_closed(entry: Dictionary) -> void:
	# Null out before emitting: get_connection_count() and _find_connection() key off
	# ws == null, so a handler must not see this connection as still live.
	var was_open: bool = entry["is_open"]
	var conn_id: int = entry["conn_id"]
	entry["is_open"] = false
	entry["ws"] = null
	entry["tcp"] = null
	if was_open:
		client_disconnected.emit(conn_id)


func _close_connection(entry: Dictionary, close_code: int, close_reason: String) -> void:
	var ws: WebSocketPeer = entry.get("ws")
	if ws:
		ws.close(close_code, close_reason)
	var tcp: StreamPeerTCP = entry.get("tcp")
	if tcp:
		tcp.disconnect_from_host()
	_mark_closed(entry)


func _is_stale_connection(entry: Dictionary) -> bool:
	var last_activity: int = entry["last_activity_msec"]
	if last_activity == 0:
		return false
	var tcp: StreamPeerTCP = entry["tcp"]
	if tcp and tcp.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		_stale_reason = "TCP peer disconnected"
		return true
	if Time.get_ticks_msec() - last_activity > STALE_CONNECTION_TIMEOUT_MSEC:
		_stale_reason = "no activity for %ds" % (STALE_CONNECTION_TIMEOUT_MSEC / 1000)
		return true
	return false


func _find_connection(conn_id: int) -> Dictionary:
	for entry in _connections:
		if entry["conn_id"] == conn_id and entry["ws"] != null:
			return entry
	return {}


func _handle_packet(conn_id: int, packet: PackedByteArray) -> void:
	var text := packet.get_string_from_utf8()

	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		MCPLog.error("Failed to parse command: %s" % json.get_error_message())
		_send_error_response(conn_id, "", "PARSE_ERROR", "Invalid JSON: %s" % json.get_error_message())
		return

	if not json.data is Dictionary:
		MCPLog.error("Invalid command format: expected JSON object")
		_send_error_response(conn_id, "", "INVALID_FORMAT", "Expected JSON object")
		return

	var data: Dictionary = json.data
	if not data.has("id") or not data.has("command"):
		MCPLog.error("Invalid command format")
		_send_error_response(conn_id, data.get("id", ""), "INVALID_FORMAT", "Missing 'id' or 'command' field")
		return

	var id: String = str(data.get("id"))
	var command: String = data.get("command")
	var params: Dictionary = data.get("params", {})

	command_received.emit(conn_id, id, command, params)


func _send_error_response(conn_id: int, id: String, code: String, message: String) -> void:
	send_response(conn_id, {
		"id": id,
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	})
