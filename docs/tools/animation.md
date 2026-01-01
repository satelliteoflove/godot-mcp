# Animation Tools

Animation query, playback, and editing tools

## Tools

- [animation](#animation)

---

## animation

Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, seek. Edit: create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `list_players`, `get_info`, `get_details`, `get_keyframes`, `play`, `stop`, `seek`, `create`, `delete`, `update_props`, `add_track`, `remove_track`, `add_keyframe`, `remove_keyframe`, `update_keyframe` | Yes | Action: list_players, get_info, get_details, get_keyframes (query), play, stop, seek (playback), create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe (edit) |
| `root_path` | string | list_players | Starting node path |
| `node_path` | string | No | Path to AnimationPlayer (required except list_players) |
| `animation_name` | string | No | Animation name |
| `track_index` | number | No | Track index |
| `custom_blend` | number | No | Custom blend time, -1 for default (play) |
| `custom_speed` | number | No | Playback speed, 1.0 default (play) |
| `from_end` | boolean | No | Play from end for reverse (play) |
| `keep_state` | boolean | No | Keep current animation state (stop) |
| `seconds` | number | No | Position to seek to (seek) |
| `update` | boolean | No | Update node immediately, default true (seek) |
| `library_name` | string | create, delete | Library name |
| `length` | number | create, update_props | Animation length in seconds |
| `loop_mode` | `none`, `linear`, `pingpong` | create, update_props | Loop mode: none, linear, pingpong |
| `step` | number | create, update_props | Step value for keyframe snapping |
| `track_type` | `value`, `position_3d`, `rotation_3d`, `scale_3d`, `blend_shape`, `method`, `bezier`, `audio`, `animation` | No | Type of track (add_track) |
| `track_path` | string | No | Node path and property, e.g. "Sprite2D:frame" (add_track) |
| `insert_at` | number | No | Track index to insert at, -1 for end (add_track) |
| `time` | number | add_keyframe, update_keyframe | Keyframe time in seconds |
| `value` | unknown | add_keyframe, update_keyframe | Keyframe value |
| `transition` | number | add_keyframe, update_keyframe | Transition curve, 1.0 = linear |
| `method_name` | string | No | Method name for method tracks (add_keyframe) |
| `args` | array | No | Method arguments (add_keyframe) |
| `keyframe_index` | number | remove_keyframe, update_keyframe | Keyframe index |

### Actions

#### `list_players`

Parameters: `root_path`*

#### `get_info`

#### `get_details`

#### `get_keyframes`

#### `play`

#### `stop`

#### `seek`

#### `create`

Parameters: `library_name`, `length`, `loop_mode`, `step`

#### `delete`

Parameters: `library_name`

#### `update_props`

Parameters: `length`, `loop_mode`, `step`

#### `add_track`

#### `remove_track`

#### `add_keyframe`

Parameters: `time`, `value`, `transition`

#### `remove_keyframe`

Parameters: `keyframe_index`

#### `update_keyframe`

Parameters: `time`, `value`, `transition`, `keyframe_index`

### Examples

```json
// list_players
{
  "action": "list_players",
  "root_path": "/root/Main"
}
```

```json
// get_info
{
  "action": "get_info"
}
```

```json
// get_details
{
  "action": "get_details"
}
```

*12 more actions available: `get_keyframes`, `play`, `stop`, `seek`, `create`, `delete`, `update_props`, `add_track`, `remove_track`, `add_keyframe`, `remove_keyframe`, `update_keyframe`*

---

