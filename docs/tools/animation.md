# Animation Tools

Animation query, playback, and editing tools

## Tools

- [godot_animation_read](#godot_animation_read)
- [godot_animation_edit](#godot_animation_edit)

---

## godot_animation_read

Inspect animation data on AnimationPlayer nodes in the editor: list players in the scene, read a player's state and libraries, get an animation's tracks and properties, and read a track's keyframes. Reach for it to verify what the editor actually loaded, including after editing animation resources by hand. It changes and previews nothing; use godot_animation_edit to create, modify, or play animations.

### Actions

#### `list_players`

List AnimationPlayer nodes in the scene

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `root_path` | string | No | Starting node path (defaults to scene root) |

#### `get_info`

Get AnimationPlayer state and library list

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |

#### `get_details`

Get an animation's tracks and properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |

#### `get_keyframes`

Get keyframes for a track

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_index` | number | Yes | Track index |

### Examples

```json
// list_players
{
  "action": "list_players"
}
```

```json
// get_info
{
  "action": "get_info",
  "node_path": "/root/Main/Player"
}
```

```json
// get_details
{
  "action": "get_details",
  "node_path": "/root/Main/Player",
  "animation_name": "idle"
}
```

*1 more actions available: `get_keyframes`*

---

## godot_animation_edit

Create and modify animations on an AnimationPlayer and preview them in the editor: create, delete, or update animations, add and remove tracks and keyframes, and play, stop, or seek the editor's preview (playback controls the editor, not the running game). Pair each change with an immediate play or seek to check the result; this is the only way to verify animation feel without running the whole game. To inspect animation data without changing it, use godot_animation_read.

### Actions

#### `play`

Play an animation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `custom_blend` | number | No | Custom blend time, -1 for default |
| `custom_speed` | number | No | Playback speed, 1.0 default |
| `from_end` | boolean | No | Play from end for reverse |

#### `stop`

Stop playback. Godot leaves the first keyframe values on the nodes unless the player has a RESET animation; the reply warns when it does not.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `keep_state` | boolean | No | Keep the current pose instead of seeking to the first keyframe (default false) |

#### `seek`

Seek to a position in the current animation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `seconds` | number | Yes | Position to seek to |
| `update` | boolean | No | Update node immediately, default true |

#### `create`

Create an animation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `library_name` | string | No | Library name |
| `length` | number | No | Animation length in seconds |
| `loop_mode` | `none`, `linear`, `pingpong` | No | Loop mode: none, linear, pingpong |
| `step` | number | No | Step value for keyframe snapping |

#### `delete`

Delete an animation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `library_name` | string | No | Library name |

#### `update_props`

Update animation properties

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `length` | number | No | Animation length in seconds |
| `loop_mode` | `none`, `linear`, `pingpong` | No | Loop mode: none, linear, pingpong |
| `step` | number | No | Step value for keyframe snapping |

#### `add_track`

Add a track to an animation

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_type` | `value`, `position_3d`, `rotation_3d`, `scale_3d`, `blend_shape`, `method`, `bezier`, `audio`, `animation` | Yes | Type of track |
| `track_path` | string | Yes | Node path and property, e.g. "Sprite2D:frame" |
| `insert_at` | number | No | Track index to insert at, -1 for end |
| `create_reset` | boolean | No | Also key the property's current value into the player's RESET animation (created if missing), as the editor's track panel does, so previews are undone by RESET and save writes the rest pose. Default true. |

#### `remove_track`

Remove a track

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_index` | number | Yes | Track index |

#### `add_keyframe`

Add a keyframe to a track

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_index` | number | Yes | Track index |
| `time` | number | Yes | Keyframe time in seconds |
| `value` | unknown | No | Keyframe value, typed to match the track's target property: numbers and strings as-is; Color as {r, g, b, a}; Vector2 as {x, y}; Vector3 as {x, y, z}; Quaternion/Vector4 as {x, y, z, w} (the same shape get_keyframes and get_properties emit). A bare numeric array of the right length is accepted for those types; any other mismatch is rejected with TYPE_MISMATCH rather than stored and coerced to black/zero at play time. |
| `transition` | number | No | Transition curve, 1.0 = linear |
| `method_name` | string | No | Method name for method tracks |
| `args` | array | No | Method arguments |

#### `remove_keyframe`

Remove a keyframe

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_index` | number | Yes | Track index |
| `keyframe_index` | number | Yes | Keyframe index |

#### `update_keyframe`

Update a keyframe

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `animation_name` | string | Yes | Animation name |
| `track_index` | number | Yes | Track index |
| `keyframe_index` | number | Yes | Keyframe index |
| `time` | number | No | Keyframe time in seconds |
| `value` | unknown | No | Keyframe value, typed to match the track's target property: numbers and strings as-is; Color as {r, g, b, a}; Vector2 as {x, y}; Vector3 as {x, y, z}; Quaternion/Vector4 as {x, y, z, w} (the same shape get_keyframes and get_properties emit). A bare numeric array of the right length is accepted for those types; any other mismatch is rejected with TYPE_MISMATCH rather than stored and coerced to black/zero at play time. |
| `transition` | number | No | Transition curve, 1.0 = linear |

### Examples

```json
// play
{
  "action": "play",
  "node_path": "/root/Main/Player",
  "animation_name": "idle"
}
```

```json
// stop
{
  "action": "stop",
  "node_path": "/root/Main/Player"
}
```

```json
// seek
{
  "action": "seek",
  "node_path": "/root/Main/Player",
  "seconds": 0
}
```

*8 more actions available: `create`, `delete`, `update_props`, `add_track`, `remove_track`, `add_keyframe`, `remove_keyframe`, `update_keyframe`*

---

