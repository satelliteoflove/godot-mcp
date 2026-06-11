# Animation Tools

Animation query, playback, and editing tools

## Tools

- [godot_animation](#godot_animation)

---

## godot_animation

Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, seek. Edit: create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

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

Stop playback

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `node_path` | string | Yes | Path to the AnimationPlayer |
| `keep_state` | boolean | No | Keep current animation state |

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
| `value` | unknown | No | Keyframe value |
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
| `value` | unknown | No | Keyframe value |
| `transition` | number | No | Transition curve, 1.0 = linear |

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

*12 more actions available: `get_keyframes`, `play`, `stop`, `seek`, `create`, `delete`, `update_props`, `add_track`, `remove_track`, `add_keyframe`, `remove_keyframe`, `update_keyframe`*

---

