class_name MCPEnums

enum BindMode { LOCALHOST, WSL, CUSTOM }

static func get_mode_name(mode: BindMode) -> String:
	match mode:
		BindMode.LOCALHOST: return "Localhost"
		BindMode.WSL:       return "WSL"
		BindMode.CUSTOM:    return "Custom"
		_:                  return "Unknown"