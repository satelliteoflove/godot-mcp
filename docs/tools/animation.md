# Animation Tools

Animation query, playback, and editing tools

## Tools

- [animation_query](#animation_query)
- [animation_playback](#animation_playback)
- [animation_edit](#animation_edit)

---

## animation_query

Query animation data. Actions: list_players (find AnimationPlayers), get_info (player state), get_details (animation tracks/length), get_keyframes (track keyframes)

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | `list_players`, `get_info`, `get_details`, `get_keyframes` | Yes | Action: list_players, get_info, get_details, get_keyframes |
| `root_path` | string | No | Starting node path (list_players only) |
| `node_path` | string | No | Path to AnimationPlayer (required except list_players) |
| `animation_name` | string | No | Animation name (get_details, get_keyframes) |
| `track_index` | number | No | Track index (get_keyframes only) |

---

## animation_playback

Control animation playback. Actions: play, stop, pause, seek, queue, clear_queue

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum (6 values) | Yes | Action: play, stop, pause, seek, queue, clear_queue |
| `node_path` | string | Yes | Path to AnimationPlayer |
| `animation_name` | string | No | Animation name (play, queue) |
| `custom_blend` | number | No | Custom blend time, -1 for default (play) |
| `custom_speed` | number | No | Playback speed, 1.0 default (play) |
| `from_end` | boolean | No | Play from end for reverse (play) |
| `keep_state` | boolean | No | Keep current animation state (stop) |
| `paused` | boolean | No | True to pause, false to unpause (pause) |
| `seconds` | number | No | Position to seek to (seek) |
| `update` | boolean | No | Update node immediately, default true (seek) |

---

## animation_edit

Edit animations. Actions: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | enum (9 values) | Yes | Action: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe |
| `node_path` | string | Yes | Path to AnimationPlayer |
| `animation_name` | string | No | Animation name (most actions) |
| `library_name` | string | No | Library name (create, delete, rename) |
| `length` | number | No | Animation length in seconds (create, update_props) |
| `loop_mode` | `none`, `linear`, `pingpong` | No | Loop mode: none, linear, pingpong (create, update_props) |
| `step` | number | No | Step value for keyframe snapping (create, update_props) |
| `old_name` | string | No | Current animation name (rename) |
| `new_name` | string | No | New animation name (rename) |
| `track_type` | enum (9 values) | No | Type of track (add_track) |
| `track_path` | string | No | Node path and property, e.g. "Sprite2D:frame" (add_track) |
| `insert_at` | number | No | Track index to insert at, -1 for end (add_track) |
| `track_index` | number | No | Track index (remove_track, add/remove/update_keyframe) |
| `time` | number | No | Keyframe time in seconds (add_keyframe, update_keyframe) |
| `value` | unknown | No | Keyframe value (add_keyframe, update_keyframe) |
| `transition` | number | No | Transition curve, 1.0 = linear (add_keyframe, update_keyframe) |
| `method_name` | string | No | Method name for method tracks (add_keyframe) |
| `args` | array | No | Method arguments (add_keyframe) |
| `keyframe_index` | number | No | Keyframe index (remove_keyframe, update_keyframe) |

---

