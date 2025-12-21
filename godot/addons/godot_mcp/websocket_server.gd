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


func _ready() -> void:
	_server = TCPServer.new()


func _process(_delta: float) -> void:
	if not _server:
		return

	if _server.is_connection_available():
		_accept_connection()

	if _ws_peer:
		_ws_peer.poll()
		_process_websocket()


func start_server(port: int = DEFAULT_PORT) -> Error:
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
	print("[godot-mcp] TCP connection received, awaiting WebSocket handshake...")


func _process_websocket() -> void:
	if not _ws_peer:
		return

	var state := _ws_peer.get_ready_state()

	match state:
		WebSocketPeer.STATE_CONNECTING:
			if _peer and _peer.get_status() == StreamPeerTCP.STATUS_CONNECTED:
				_perform_handshake()

		WebSocketPeer.STATE_OPEN:
			if not _is_connected:
				_is_connected = true
				client_connected.emit()

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


func _perform_handshake() -> void:
	var available := _peer.get_available_bytes()
	if available == 0:
		return

	var data := _peer.get_data(available)
	if data[0] != OK:
		return

	var request := (data[1] as PackedByteArray).get_string_from_utf8()
	if not request.begins_with("GET"):
		return

	var key := _extract_websocket_key(request)
	if key.is_empty():
		push_error("[godot-mcp] Invalid WebSocket handshake request")
		return

	var accept := _compute_accept_key(key)
	var response := "HTTP/1.1 101 Switching Protocols\r\n"
	response += "Upgrade: websocket\r\n"
	response += "Connection: Upgrade\r\n"
	response += "Sec-WebSocket-Accept: %s\r\n\r\n" % accept

	_peer.put_data(response.to_utf8_buffer())

	var err := _ws_peer.accept_stream(_peer)
	if err != OK:
		push_error("[godot-mcp] Failed to accept WebSocket stream: %s" % error_string(err))


func _extract_websocket_key(request: String) -> String:
	for line in request.split("\r\n"):
		if line.to_lower().begins_with("sec-websocket-key:"):
			return line.split(":")[1].strip_edges()
	return ""


func _compute_accept_key(key: String) -> String:
	var magic := "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
	var combined := key + magic
	var sha1 := combined.sha1_buffer()
	return Marshalls.raw_to_base64(sha1)


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
