# Migrating to godot-mcp 4.0

Version 4.0 reshapes the tool surface around two ideas: agents edit project
files natively (so the bridge no longer duplicates trivial file edits), and
tools are split along the read/write boundary (so clients can safely
auto-allow every observation tool). Tool *names* changed; the wire protocol
between server and addon did not — server and addon still upgrade together as
one release.

Update anything that references tool names: prompts, CLAUDE.md files, and
permission allowlists. The single most useful allowlist change: every
read-only tool now matches `mcp__godot-mcp__godot_*_read` (plus the
single-class read tools listed below), so observation can be auto-allowed
with one rule.

## Renamed tools

Each mixed read/write tool is now a `_read` / `_edit` pair. Actions kept
their names and arguments.

| v3 tool | v4 read tool (actions) | v4 edit tool (actions) |
|---|---|---|
| `godot_node` | `godot_node_read` — get_properties, get_scene_tree (new), find | `godot_node_edit` — update, reparent |
| `godot_editor` | `godot_editor_read` — get_state, get_selection, get_log_messages, get_stack_trace, screenshot_game, screenshot_editor | `godot_editor_edit` — select, run, stop, restart, set_viewport_2d |
| `godot_animation` | `godot_animation_read` — list_players, get_info, get_details, get_keyframes | `godot_animation_edit` — play, stop, seek, create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe |
| `godot_tilemap` | `godot_tilemap_read` — list_layers, get_info, get_tileset_info, get_used_cells, get_cell, get_cells_in_region, convert_coords | `godot_tilemap_edit` — set_cell, erase_cell, clear_layer, set_cells_batch |
| `godot_gridmap` | `godot_gridmap_read` — list, get_info, get_meshlib_info, get_used_cells, get_cell, get_cells_by_item | `godot_gridmap_edit` — set_cell, clear_cell, clear, set_cells_batch |

Unchanged names: `godot_scene`, `godot_project`, `godot_resource`,
`godot_scene3d`, `godot_docs`, `godot_input`, `godot_profiler`,
`godot_runtime_state`, `godot_game_time`, `godot_exec`,
`godot_validate_meshes`.

## Removed actions — and what to do instead

These were one trivial text construct away from a direct file edit, which any
agent does natively. The game always loads from disk, so the run/verify loop
is unaffected.

| Removed | Instead |
|---|---|
| `godot_scene` create | Write the `.tscn` file directly (omit the `uid` attribute; the editor assigns one on import), then `godot_scene` open. |
| `godot_node` create | Add the `[node]` block to the `.tscn`, then verify with `godot_node_read` get_scene_tree. |
| `godot_node` delete | Remove the node's block from the `.tscn`. |
| `godot_node` attach_script / detach_script | One `[ext_resource]` line plus `script = ExtResource("...")` on the node. |
| `godot_node` connect_signal | One `[connection signal=... from=... to=... method=...]` block. |

Kept deliberately: `godot_node_edit` update and reparent (hand-editing a
reparent cascades `parent=` attributes and node-path rewrites — the editor
does this correctly, text edits often don't), all animation authoring (the
parallel-array keyframe format is genuinely error-prone by hand), and all
tilemap/gridmap cell operations (cell data is base64-encoded inside the
`.tscn` — there is no file-editing alternative).

After editing files the editor has open, watch for staleness: the editor
does not reliably rescan externally modified `.gd` files (run
`godot_editor_edit` restart) and never re-reads `project.godot`
(run `godot_project` check_stale).

## Removed MCP resources

All three resources (`godot://scene/current`, `godot://scene/tree`,
`godot://script/current`) are gone, along with the resources capability.

- Scene tree → `godot_node_read` get_scene_tree (the only view that shows
  children inside instanced sub-scenes; a `.tscn` read cannot).
- Current scene → `godot_editor_read` get_state.
- Current script → read the `.gd` file.

## Behavior changes

- **Validation errors are now actionable.** A bad call returns the action's
  contract ("Action \"reparent\" requires node_path, new_parent_path") or the
  valid action list, instead of a raw error dump.
- **Schemas carry per-action guidance.** The published `action` parameter
  describes every action, and each parameter notes which actions require it.
- **The MCP logging capability is gone.** Logs go to stderr;
  `GODOT_MCP_VERBOSE=1` surfaces info/debug lines.
- **`godot_resource` no longer declares an `outputSchema`.** Results are
  unchanged (structured content plus JSON text); the declaration broke the
  tool entirely on schema-strict clients.
- **New `--read-only` flag** (or `GODOT_MCP_READ_ONLY=1`) starts the server
  with only the 12 observation tools registered.

## Allowlist migration example

Claude Code `settings.json`, before:

```json
"allow": ["mcp__godot-mcp__godot_editor", "mcp__godot-mcp__godot_node"]
```

After — auto-allow all observation, approve writes individually:

```json
"allow": [
  "mcp__godot-mcp__godot_node_read",
  "mcp__godot-mcp__godot_editor_read",
  "mcp__godot-mcp__godot_animation_read",
  "mcp__godot-mcp__godot_tilemap_read",
  "mcp__godot-mcp__godot_gridmap_read",
  "mcp__godot-mcp__godot_project",
  "mcp__godot-mcp__godot_resource",
  "mcp__godot-mcp__godot_scene3d",
  "mcp__godot-mcp__godot_docs",
  "mcp__godot-mcp__godot_profiler",
  "mcp__godot-mcp__godot_runtime_state",
  "mcp__godot-mcp__godot_validate_meshes"
]
```
