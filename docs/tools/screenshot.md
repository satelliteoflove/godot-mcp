# Screenshot Tools

Screenshot capture tools

## Tools

- [capture_game_screenshot](#capture_game_screenshot)
- [capture_editor_screenshot](#capture_editor_screenshot)

---

## capture_game_screenshot

Capture a screenshot of the running game viewport. The project must be running.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `max_width` | number | No | Maximum width in pixels (image will be scaled down if larger) |

---

## capture_editor_screenshot

Capture a screenshot of the editor 2D or 3D viewport

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `viewport` | `2d`, `3d` | No | Which viewport to capture (defaults to the currently active one) |
| `max_width` | number | No | Maximum width in pixels (image will be scaled down if larger) |

---

