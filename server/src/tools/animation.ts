import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

export const listAnimationPlayers = defineTool({
  name: 'list_animation_players',
  description: 'Find all AnimationPlayer nodes in the scene',
  schema: z.object({
    root_path: z
      .string()
      .optional()
      .describe('Starting node path, defaults to scene root'),
  }),
  async execute({ root_path }, { godot }) {
    const result = await godot.sendCommand<{
      animation_players: Array<{ path: string; name: string }>;
    }>('list_animation_players', { root_path });

    if (result.animation_players.length === 0) {
      return 'No AnimationPlayer nodes found in scene';
    }
    return `Found ${result.animation_players.length} AnimationPlayer(s):\n${result.animation_players.map((p) => `  - ${p.path}`).join('\n')}`;
  },
});

export const getAnimationPlayerInfo = defineTool({
  name: 'get_animation_player_info',
  description: 'Get AnimationPlayer state and available animations',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer node'),
  }),
  async execute({ node_path }, { godot }) {
    const result = await godot.sendCommand<{
      current_animation: string;
      is_playing: boolean;
      current_position: number;
      speed_scale: number;
      libraries: Record<string, string[]>;
      animation_count: number;
    }>('get_animation_player_info', { node_path });

    return JSON.stringify(result, null, 2);
  },
});

export const getAnimationDetails = defineTool({
  name: 'get_animation_details',
  description: 'Get detailed information about a specific animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z
      .string()
      .describe('Name of animation (format: "library/anim" or just "anim")'),
  }),
  async execute({ node_path, animation_name }, { godot }) {
    const result = await godot.sendCommand<{
      name: string;
      library: string;
      length: number;
      loop_mode: string;
      step: number;
      track_count: number;
      tracks: Array<{
        index: number;
        type: string;
        path: string;
        interpolation: number;
        keyframe_count: number;
      }>;
    }>('get_animation_details', { node_path, animation_name });

    return JSON.stringify(result, null, 2);
  },
});

export const getTrackKeyframes = defineTool({
  name: 'get_track_keyframes',
  description: 'Get all keyframes for a specific track',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation name'),
    track_index: z.number().describe('Track index'),
  }),
  async execute({ node_path, animation_name, track_index }, { godot }) {
    const result = await godot.sendCommand<{
      track_path: string;
      track_type: string;
      keyframes: Array<{
        time: number;
        value?: unknown;
        transition?: number;
        method?: string;
        args?: unknown[];
        in_handle?: { x: number; y: number };
        out_handle?: { x: number; y: number };
      }>;
    }>('get_track_keyframes', { node_path, animation_name, track_index });

    return JSON.stringify(result, null, 2);
  },
});

export const playAnimation = defineTool({
  name: 'play_animation',
  description: 'Play an animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to play'),
    custom_blend: z
      .number()
      .optional()
      .describe('Custom blend time (-1 for default)'),
    custom_speed: z
      .number()
      .optional()
      .describe('Custom playback speed (1.0 default)'),
    from_end: z.boolean().optional().describe('Play from end (for reverse)'),
  }),
  async execute(
    { node_path, animation_name, custom_blend, custom_speed, from_end },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      playing: string;
      from_position: number;
    }>('play_animation', {
      node_path,
      animation_name,
      custom_blend,
      custom_speed,
      from_end,
    });

    return `Playing animation: ${result.playing}`;
  },
});

export const stopAnimation = defineTool({
  name: 'stop_animation',
  description: 'Stop current animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    keep_state: z
      .boolean()
      .optional()
      .describe('Keep current animation state (default false)'),
  }),
  async execute({ node_path, keep_state }, { godot }) {
    await godot.sendCommand('stop_animation', { node_path, keep_state });
    return 'Animation stopped';
  },
});

export const pauseAnimation = defineTool({
  name: 'pause_animation',
  description: 'Pause/unpause animation playback',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    paused: z.boolean().describe('True to pause, false to unpause'),
  }),
  async execute({ node_path, paused }, { godot }) {
    await godot.sendCommand('pause_animation', { node_path, paused });
    return paused ? 'Animation paused' : 'Animation unpaused';
  },
});

export const seekAnimation = defineTool({
  name: 'seek_animation',
  description: 'Seek to a specific position in the animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    seconds: z.number().describe('Position to seek to'),
    update: z
      .boolean()
      .optional()
      .describe('Update node immediately (default true)'),
  }),
  async execute({ node_path, seconds, update }, { godot }) {
    const result = await godot.sendCommand<{ position: number }>(
      'seek_animation',
      { node_path, seconds, update }
    );
    return `Seeked to position: ${result.position}`;
  },
});

export const queueAnimation = defineTool({
  name: 'queue_animation',
  description: 'Queue an animation to play after current one finishes',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to queue'),
  }),
  async execute({ node_path, animation_name }, { godot }) {
    const result = await godot.sendCommand<{
      queued: string;
      queue_length: number;
    }>('queue_animation', { node_path, animation_name });
    return `Queued animation: ${result.queued} (queue length: ${result.queue_length})`;
  },
});

export const clearAnimationQueue = defineTool({
  name: 'clear_animation_queue',
  description: 'Clear the animation queue',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
  }),
  async execute({ node_path }, { godot }) {
    await godot.sendCommand('clear_animation_queue', { node_path });
    return 'Animation queue cleared';
  },
});

export const createAnimation = defineTool({
  name: 'create_animation',
  description: 'Create a new animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Name for new animation'),
    library_name: z
      .string()
      .optional()
      .describe('Library to add to (default "")'),
    length: z
      .number()
      .optional()
      .describe('Animation length in seconds (default 1.0)'),
    loop_mode: z
      .enum(['none', 'linear', 'pingpong'])
      .optional()
      .describe('Loop mode (default "none")'),
    step: z.number().optional().describe('Step value for keyframe snapping'),
  }),
  async execute(
    { node_path, animation_name, library_name, length, loop_mode, step },
    { godot }
  ) {
    const result = await godot.sendCommand<{ created: string; library: string }>(
      'create_animation',
      { node_path, animation_name, library_name, length, loop_mode, step }
    );
    return `Created animation: ${result.created}${result.library ? ` in library: ${result.library}` : ''}`;
  },
});

export const deleteAnimation = defineTool({
  name: 'delete_animation',
  description: 'Delete an animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to delete'),
    library_name: z
      .string()
      .optional()
      .describe('Library containing animation'),
  }),
  async execute({ node_path, animation_name, library_name }, { godot }) {
    const result = await godot.sendCommand<{ deleted: string }>(
      'delete_animation',
      { node_path, animation_name, library_name }
    );
    return `Deleted animation: ${result.deleted}`;
  },
});

export const renameAnimation = defineTool({
  name: 'rename_animation',
  description: 'Rename an animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    old_name: z.string().describe('Current animation name'),
    new_name: z.string().describe('New animation name'),
    library_name: z
      .string()
      .optional()
      .describe('Library containing animation'),
  }),
  async execute({ node_path, old_name, new_name, library_name }, { godot }) {
    const result = await godot.sendCommand<{
      renamed: { from: string; to: string };
    }>('rename_animation', { node_path, old_name, new_name, library_name });
    return `Renamed animation: ${result.renamed.from} -> ${result.renamed.to}`;
  },
});

export const updateAnimationProperties = defineTool({
  name: 'update_animation_properties',
  description: 'Update animation properties (length, loop mode, step)',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to update'),
    length: z.number().optional().describe('New length'),
    loop_mode: z
      .enum(['none', 'linear', 'pingpong'])
      .optional()
      .describe('New loop mode'),
    step: z.number().optional().describe('New step value'),
  }),
  async execute(
    { node_path, animation_name, length, loop_mode, step },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      updated: string;
      properties: Record<string, unknown>;
    }>('update_animation_properties', {
      node_path,
      animation_name,
      length,
      loop_mode,
      step,
    });
    return `Updated animation: ${result.updated}\nProperties: ${JSON.stringify(result.properties)}`;
  },
});

export const addAnimationTrack = defineTool({
  name: 'add_animation_track',
  description: 'Add a new track to an animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_type: z
      .enum([
        'value',
        'position_3d',
        'rotation_3d',
        'scale_3d',
        'blend_shape',
        'method',
        'bezier',
        'audio',
        'animation',
      ])
      .describe('Type of track'),
    track_path: z
      .string()
      .describe('Node path and property (e.g., "Sprite2D:frame")'),
    insert_at: z
      .number()
      .optional()
      .describe('Track index to insert at (-1 for end)'),
  }),
  async execute(
    { node_path, animation_name, track_type, track_path, insert_at },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      track_index: number;
      track_path: string;
      track_type: string;
    }>('add_animation_track', {
      node_path,
      animation_name,
      track_type,
      track_path,
      insert_at,
    });
    return `Added track ${result.track_index}: ${result.track_type} -> ${result.track_path}`;
  },
});

export const removeAnimationTrack = defineTool({
  name: 'remove_animation_track',
  description: 'Remove a track from an animation',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Index of track to remove'),
  }),
  async execute({ node_path, animation_name, track_index }, { godot }) {
    const result = await godot.sendCommand<{ removed_track: number }>(
      'remove_animation_track',
      { node_path, animation_name, track_index }
    );
    return `Removed track: ${result.removed_track}`;
  },
});

export const addKeyframe = defineTool({
  name: 'add_keyframe',
  description: 'Add a keyframe to a track',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    time: z.number().describe('Keyframe time in seconds'),
    value: z.unknown().describe('Keyframe value (type depends on track type)'),
    transition: z
      .number()
      .optional()
      .describe('Transition curve (1.0 = linear)'),
    method_name: z
      .string()
      .optional()
      .describe('Method name (for method tracks)'),
    args: z.array(z.unknown()).optional().describe('Method arguments'),
  }),
  async execute(
    {
      node_path,
      animation_name,
      track_index,
      time,
      value,
      transition,
      method_name,
      args,
    },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      keyframe_index: number;
      time: number;
      value: unknown;
    }>('add_keyframe', {
      node_path,
      animation_name,
      track_index,
      time,
      value,
      transition,
      method_name,
      args,
    });
    return `Added keyframe ${result.keyframe_index} at ${result.time}s`;
  },
});

export const removeKeyframe = defineTool({
  name: 'remove_keyframe',
  description: 'Remove a keyframe from a track',
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    keyframe_index: z.number().describe('Index of keyframe to remove'),
  }),
  async execute(
    { node_path, animation_name, track_index, keyframe_index },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      removed_keyframe: number;
      track_index: number;
    }>('remove_keyframe', {
      node_path,
      animation_name,
      track_index,
      keyframe_index,
    });
    return `Removed keyframe ${result.removed_keyframe} from track ${result.track_index}`;
  },
});

export const updateKeyframe = defineTool({
  name: 'update_keyframe',
  description: "Update an existing keyframe's value or time",
  schema: z.object({
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    keyframe_index: z.number().describe('Keyframe index'),
    time: z.number().optional().describe('New time'),
    value: z.unknown().optional().describe('New value'),
    transition: z.number().optional().describe('New transition curve'),
  }),
  async execute(
    {
      node_path,
      animation_name,
      track_index,
      keyframe_index,
      time,
      value,
      transition,
    },
    { godot }
  ) {
    const result = await godot.sendCommand<{
      updated_keyframe: number;
      changes: Record<string, unknown>;
    }>('update_keyframe', {
      node_path,
      animation_name,
      track_index,
      keyframe_index,
      time,
      value,
      transition,
    });
    return `Updated keyframe ${result.updated_keyframe}: ${JSON.stringify(result.changes)}`;
  },
});

export const animationTools = [
  listAnimationPlayers,
  getAnimationPlayerInfo,
  getAnimationDetails,
  getTrackKeyframes,
  playAnimation,
  stopAnimation,
  pauseAnimation,
  seekAnimation,
  queueAnimation,
  clearAnimationQueue,
  createAnimation,
  deleteAnimation,
  renameAnimation,
  updateAnimationProperties,
  addAnimationTrack,
  removeAnimationTrack,
  addKeyframe,
  removeKeyframe,
  updateKeyframe,
] as AnyToolDefinition[];
