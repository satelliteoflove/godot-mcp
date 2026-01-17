@tool
extends Node
class_name MCPWebSocketServer

signal command_received(id: String, command: String, params: Dictionary)
signal client_connected()
signal client_disconnected()

const DEFAULT_PORT := 6550
const CLOSE_CODE_ALREADY_CONNECTED := 4001
const CLOSE_REASON_ALREADY_CONNECTED := "Another client is already connected"

var _server: TCPServer
var _peer: StreamPeerTCP
var _ws_peer: WebSocketPeer
var _is_connected := false
var _rejected_connections := 0
var _pending_rejection: WebSocketPeer = null
var _pending_rejection_peer: StreamPeerTCP = null


func _process(_delta: float) -> void:
	if not _server:
		return

	if _server.is_connection_available():
		_accept_connection()

	if _ws_peer:
		_ws_peer.poll()
		_process_websocket()

	_process_pending_rejection()


func start_server(port: int = DEFAULT_PORT) -> Error:
	_server = TCPServer.new()
	var err := _server.listen(port)
	if err != OK:
		MCPLog.error("Failed to start server on port %d: %s" % [port, error_string(err)])
		return err

	MCPLog.info("Server listening on port %d" % port)
	return OK


func stop_server() -> void:
	if _pending_rejection:
		_pending_rejection.close()
		_pending_rejection = null

	if _pending_rejection_peer:
		_pending_rejection_peer.disconnect_from_host()
		_pending_rejection_peer = null

	if _ws_peer:
		_ws_peer.close()
		_ws_peer = null

	if _peer:
		_peer.disconnect_from_host()
		_peer = null

	if _server:
		_server.stop()

	_is_connected = false
	_rejected_connections = 0


func get_rejected_connection_count() -> int:
	return _rejected_connections


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

	# Reject if we already have an active or pending connection
	if _ws_peer != null:
		_reject_connection(incoming)
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

	MCPLog.info("TCP connection received, awaiting WebSocket handshake...")


func _reject_connection(incoming: StreamPeerTCP) -> void:
	_rejected_connections += 1

	# If we're already processing a rejection, just drop this one at TCP level
	if _pending_rejection != null:
		incoming.disconnect_from_host()
		MCPLog.info("Rejected connection at TCP level (busy processing previous rejection) - total rejections: %d" % _rejected_connections)
		return

	# Accept WebSocket to send proper close code with reason
	_pending_rejection_peer = incoming
	_pending_rejection = WebSocketPeer.new()
	var err := _pending_rejection.accept_stream(_pending_rejection_peer)
	if err != OK:
		# Fall back to TCP disconnect
		incoming.disconnect_from_host()
		_pending_rejection = null
		_pending_rejection_peer = null
		MCPLog.info("Rejected connection at TCP level (WebSocket accept failed) - total rejections: %d" % _rejected_connections)
		return

	MCPLog.info("Rejecting connection (another client already connected) - total rejections: %d" % _rejected_connections)


func _process_pending_rejection() -> void:
	if _pending_rejection == null:
		return

	_pending_rejection.poll()
	var state := _pending_rejection.get_ready_state()

	match state:
		WebSocketPeer.STATE_CONNECTING:
			# Still waiting for handshake, will send close once ready
			pass

		WebSocketPeer.STATE_OPEN:
			# Handshake complete, now send close with our custom code
			_pending_rejection.close(CLOSE_CODE_ALREADY_CONNECTED, CLOSE_REASON_ALREADY_CONNECTED)

		WebSocketPeer.STATE_CLOSING:
			# Waiting for close to complete
			pass

		WebSocketPeer.STATE_CLOSED:
			# Done, clean up
			_pending_rejection = null
			_pending_rejection_peer = null


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
				MCPLog.info("WebSocket handshake complete")

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
		MCPLog.error("Failed to parse command: %s" % json.get_error_message())
		_send_error_response("", "PARSE_ERROR", "Invalid JSON: %s" % json.get_error_message())
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
