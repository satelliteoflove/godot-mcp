@tool
extends Node
class_name MCPWebSocketServer

signal command_received(id: String, command: String, params: Dictionary)
signal client_connected()
signal client_disconnected()

const DEFAULT_PORT := 6550

var _server: TCPServer
var _peer: StreamPeerTCP
var _ws_peer: WebSocketPeer
var _is_connected := false


func _process(_delta: float) -> void:
	if not _server:
		return

	if _server.is_connection_available():
		_accept_connection()

	if _ws_peer:
		_ws_peer.poll()
		_process_websocket()


func start_server(port: int = DEFAULT_PORT) -> Error:
	_server = TCPServer.new()
	var err := _server.listen(port)
	if err != OK:
		push_error("[godot-mcp] Failed to start server on port %d: %s" % [port, error_string(err)])
		return err

	print("[godot-mcp] Server listening on port %d" % port)
	return OK


func stop_server() -> void:
	if _ws_peer:
		_ws_peer.close()
		_ws_peer = null

	if _peer:
		_peer.disconnect_from_host()
		_peer = null

	if _server:
		_server.stop()

	_is_connected = false


func send_response(response: Dictionary) -> void:
	if not _ws_peer or _ws_peer.get_ready_state() != WebSocketPeer.STATE_OPEN:
		push_warning("[godot-mcp] Cannot send response: not connected")
		return

	var json := JSON.stringify(response)
	_ws_peer.send_text(json)


func _accept_connection() -> void:
	_peer = _server.take_connection()
	if not _peer:
		return

	_ws_peer = WebSocketPeer.new()
	_ws_peer.outbound_buffer_size = 16 * 1024 * 1024  # 16MB for screenshot data
	var err := _ws_peer.accept_stream(_peer)
	if err != OK:
		push_error("[godot-mcp] Failed to accept WebSocket stream: %s" % error_string(err))
		_ws_peer = null
		_peer = null
		return

	print("[godot-mcp] TCP connection received, awaiting WebSocket handshake...")


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
				client_connected.emit()
				print("[godot-mcp] WebSocket handshake complete")

			while _ws_peer.get_available_packet_count() > 0:
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


func _handle_packet(packet: PackedByteArray) -> void:
	var text := packet.get_string_from_utf8()

	var json := JSON.new()
	var err := json.parse(text)
	if err != OK:
		push_error("[godot-mcp] Failed to parse command: %s" % json.get_error_message())
		_send_error_response("", "PARSE_ERROR", "Invalid JSON: %s" % json.get_error_message())
		return

	var data: Dictionary = json.data
	if not data.has("id") or not data.has("command"):
		push_error("[godot-mcp] Invalid command format")
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
