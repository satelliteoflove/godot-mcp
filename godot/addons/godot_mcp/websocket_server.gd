@tool
extends Node
class_name MCPWebSocketServer

signal command_received(id: String, command: String, params: Dictionary)
signal client_connected()
signal client_disconnected()

const DEFAULT_PORT := 6550
const STALE_CONNECTION_TIMEOUT_MSEC := 45000
# Upper bound on how long a rejected newcomer is kept around while we hand it a
# clean 4001 close. Caps the whole reject lifecycle (handshake + close flush) so
# a peer that never upgrades or never finishes closing can't leak.
const REJECT_TIMEOUT_MSEC := 5000
const CLOSE_CODE_STALE := 4002
const CLOSE_REASON_STALE := "Connection timed out (no activity)"
const CLOSE_CODE_ALREADY_CONNECTED := 4001
const CLOSE_REASON_ALREADY_CONNECTED := "Another client is already connected"

var _server: TCPServer
var _peer: StreamPeerTCP
var _ws_peer: WebSocketPeer
var _is_connected := false
var _connected_host: String = ""
var _connected_port: int = 0
var _last_activity_msec: int = 0
var _stale_reason: String = ""
# Newcomers that arrived while a live client already held the bridge. Each entry
# is { "ws": WebSocketPeer, "tcp": StreamPeerTCP, "since_msec": int, "close_sent": bool }.
# They are handshaked just far enough to receive a clean 4001 close, then dropped.
var _rejecting_peers: Array = []


func _process(_delta: float) -> void:
	if not _server:
		return

	if _server.is_connection_available():
		_accept_connection()

	if _ws_peer:
		_ws_peer.poll()
		_process_websocket()

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
	if _ws_peer:
		_ws_peer.close()
		_ws_peer = null

	if _peer:
		_peer.disconnect_from_host()
		_peer = null

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

	_is_connected = false
	_connected_host = ""
	_connected_port = 0
	_last_activity_msec = 0


func get_connected_host() -> String:
	return _connected_host


func get_connected_port() -> int:
	return _connected_port


func send_response(response: Dictionary) -> void:
	if not _ws_peer or _ws_peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		MCPLog.warn("Cannot send response: not connected")
		return

	var json := JSON.stringify(response)
	_ws_peer.send_text(json)


func _accept_connection() -> void:
	var incoming := _server.take_connection()
	if not incoming:
		return

	if _ws_peer != null:
		if _is_stale_connection():
			# The incumbent looks dead (TCP dropped, or no activity past the
			# timeout). Hand the bridge to the newcomer so a crashed client can
			# never permanently block reconnection.
			MCPLog.warn("Replacing stale connection with new client (%s)" % _stale_reason)
			_force_close_connection()
		else:
			# A live client already holds the bridge. Protect the incumbent and
			# reject the newcomer with a clean close code instead of displacing
			# it. This keeps a transient second client (e.g. a subagent that
			# inherited the same MCP config) from bricking the active session.
			MCPLog.warn("Rejecting new connection from %s:%d: another client is already connected" % [incoming.get_connected_host(), incoming.get_connected_port()])
			_begin_reject(incoming)
			return

	_peer = incoming
	_ws_peer = WebSocketPeer.new()
	_ws_peer.outbound_buffer_size = 16 * 1024 * 1024  # 16MB for screenshot data
	var err := _ws_peer.accept_stream(_peer)
	if err != OK:
		MCPLog.error("Failed to accept WebSocket stream: %s" % error_string(err))
		_ws_peer = null
		_peer = null
		return

	_connected_host = _peer.get_connected_host()
	_connected_port = _peer.get_connected_port()
	_last_activity_msec = Time.get_ticks_msec()

	MCPLog.info("TCP connection received from %s:%d, awaiting WebSocket handshake..." % [_connected_host, _connected_port])


func _begin_reject(incoming: StreamPeerTCP) -> void:
	# Complete just enough of the WebSocket handshake on a throwaway peer to send
	# a proper coded close frame (4001), so the rejected client gets a clear
	# diagnostic rather than an opaque TCP reset. The incumbent's peer is never
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
					ws.close(CLOSE_CODE_ALREADY_CONNECTED, CLOSE_REASON_ALREADY_CONNECTED)
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


func _process_websocket() -> void:
	if not _ws_peer:
		return

	var state := _ws_peer.get_ready_state()

	match state:
		WebSocketPeer.STATE_CONNECTING:
			pass

		WebSocketPeer.STATE_OPEN:
			if not _is_connected:
				_is_connected = true
				_last_activity_msec = Time.get_ticks_msec()
				client_connected.emit()
				MCPLog.info("WebSocket handshake complete")

			if _is_stale_connection():
				MCPLog.warn("Closing stale connection (%s)" % _stale_reason)
				_ws_peer.close(CLOSE_CODE_STALE, CLOSE_REASON_STALE)
				return

			while _ws_peer.get_available_packet_count() > 0:
				_last_activity_msec = Time.get_ticks_msec()
				var packet := _ws_peer.get_packet()
				_handle_packet(packet)

		WebSocketPeer.STATE_CLOSING:
			pass

		WebSocketPeer.STATE_CLOSED:
			if _is_connected:
				_is_connected = false
				client_disconnected.emit()
			_ws_peer = null
			_peer = null


func _force_close_connection(close_code: int = CLOSE_CODE_STALE, close_reason: String = CLOSE_REASON_STALE) -> void:
	if _ws_peer:
		_ws_peer.close(close_code, close_reason)
		_ws_peer = null
	if _peer:
		_peer.disconnect_from_host()
		_peer = null
	if _is_connected:
		_is_connected = false
		client_disconnected.emit()
	_last_activity_msec = 0
	_connected_host = ""
	_connected_port = 0


func _is_stale_connection() -> bool:
	if _last_activity_msec == 0:
		return false
	if _peer and _peer.get_status() != StreamPeerTCP.STATUS_CONNECTED:
		_stale_reason = "TCP peer disconnected"
		return true
	if Time.get_ticks_msec() - _last_activity_msec > STALE_CONNECTION_TIMEOUT_MSEC:
		_stale_reason = "no activity for %ds" % (STALE_CONNECTION_TIMEOUT_MSEC / 1000)
		return true
	return false


func _handle_packet(packet: PackedByteArray) -> void:
	var text := packet.get_string_from_utf8()

	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		MCPLog.error("Failed to parse command: %s" % json.get_error_message())
		_send_error_response("", "PARSE_ERROR", "Invalid JSON: %s" % json.get_error_message())
		return

	if not json.data is Dictionary:
		MCPLog.error("Invalid command format: expected JSON object")
		_send_error_response("", "INVALID_FORMAT", "Expected JSON object")
		return

	var data: Dictionary = json.data
	if not data.has("id") or not data.has("command"):
		MCPLog.error("Invalid command format")
		_send_error_response(data.get("id", ""), "INVALID_FORMAT", "Missing 'id' or 'command' field")
		return

	var id: String = str(data.get("id"))
	var command: String = data.get("command")
	var params: Dictionary = data.get("params", {})

	command_received.emit(id, command, params)


func _send_error_response(id: String, code: String, message: String) -> void:
	send_response({
		"id": id,
		"status": "error",
		"error": {
			"code": code,
			"message": message
		}
	})
