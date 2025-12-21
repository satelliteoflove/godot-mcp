import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

const AnimationQuerySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_players'),
    root_path: z.string().optional().describe('Starting node path, defaults to scene root'),
  }),
  z.object({
    action: z.literal('get_info'),
    node_path: z.string().describe('Path to AnimationPlayer node'),
  }),
  z.object({
    action: z.literal('get_details'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation name (format: "library/anim" or just "anim")'),
  }),
  z.object({
    action: z.literal('get_keyframes'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation name'),
    track_index: z.number().describe('Track index'),
  }),
]);

export const animationQuery = defineTool({
  name: 'animation_query',
  description:
    'Query animation data. Actions: list_players (find AnimationPlayers), get_info (player state), get_details (animation tracks/length), get_keyframes (track keyframes)',
  schema: AnimationQuerySchema,
  async execute(args, { godot }) {
    switch (args.action) {
      case 'list_players': {
        const result = await godot.sendCommand<{
          animation_players: Array<{ path: string; name: string }>;
        }>('list_animation_players', { root_path: args.root_path });
        if (result.animation_players.length === 0) {
          return 'No AnimationPlayer nodes found in scene';
        }
        return `Found ${result.animation_players.length} AnimationPlayer(s):\n${result.animation_players.map((p) => `  - ${p.path}`).join('\n')}`;
      }
      case 'get_info': {
        const result = await godot.sendCommand<{
          current_animation: string;
          is_playing: boolean;
          current_position: number;
          speed_scale: number;
          libraries: Record<string, string[]>;
          animation_count: number;
        }>('get_animation_player_info', { node_path: args.node_path });
        return JSON.stringify(result, null, 2);
      }
      case 'get_details': {
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
        }>('get_animation_details', {
          node_path: args.node_path,
          animation_name: args.animation_name,
        });
        return JSON.stringify(result, null, 2);
      }
      case 'get_keyframes': {
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
        }>('get_track_keyframes', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          track_index: args.track_index,
        });
        return JSON.stringify(result, null, 2);
      }
    }
  },
});

const AnimationPlaybackSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('play'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to play'),
    custom_blend: z.number().optional().describe('Custom blend time (-1 for default)'),
    custom_speed: z.number().optional().describe('Playback speed (1.0 default)'),
    from_end: z.boolean().optional().describe('Play from end (for reverse)'),
  }),
  z.object({
    action: z.literal('stop'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    keep_state: z.boolean().optional().describe('Keep current animation state'),
  }),
  z.object({
    action: z.literal('pause'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    paused: z.boolean().describe('True to pause, false to unpause'),
  }),
  z.object({
    action: z.literal('seek'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    seconds: z.number().describe('Position to seek to'),
    update: z.boolean().optional().describe('Update node immediately (default true)'),
  }),
  z.object({
    action: z.literal('queue'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to queue'),
  }),
  z.object({
    action: z.literal('clear_queue'),
    node_path: z.string().describe('Path to AnimationPlayer'),
  }),
]);

export const animationPlayback = defineTool({
  name: 'animation_playback',
  description:
    'Control animation playback. Actions: play, stop, pause, seek, queue, clear_queue',
  schema: AnimationPlaybackSchema,
  async execute(args, { godot }) {
    switch (args.action) {
      case 'play': {
        const result = await godot.sendCommand<{ playing: string; from_position: number }>(
          'play_animation',
          {
            node_path: args.node_path,
            animation_name: args.animation_name,
            custom_blend: args.custom_blend,
            custom_speed: args.custom_speed,
            from_end: args.from_end,
          }
        );
        return `Playing animation: ${result.playing}`;
      }
      case 'stop': {
        await godot.sendCommand('stop_animation', {
          node_path: args.node_path,
          keep_state: args.keep_state,
        });
        return 'Animation stopped';
      }
      case 'pause': {
        await godot.sendCommand('pause_animation', {
          node_path: args.node_path,
          paused: args.paused,
        });
        return args.paused ? 'Animation paused' : 'Animation unpaused';
      }
      case 'seek': {
        const result = await godot.sendCommand<{ position: number }>('seek_animation', {
          node_path: args.node_path,
          seconds: args.seconds,
          update: args.update,
        });
        return `Seeked to position: ${result.position}`;
      }
      case 'queue': {
        const result = await godot.sendCommand<{ queued: string; queue_length: number }>(
          'queue_animation',
          {
            node_path: args.node_path,
            animation_name: args.animation_name,
          }
        );
        return `Queued animation: ${result.queued} (queue length: ${result.queue_length})`;
      }
      case 'clear_queue': {
        await godot.sendCommand('clear_animation_queue', { node_path: args.node_path });
        return 'Animation queue cleared';
      }
    }
  },
});

const LoopModeEnum = z.enum(['none', 'linear', 'pingpong']);
const TrackTypeEnum = z.enum([
  'value',
  'position_3d',
  'rotation_3d',
  'scale_3d',
  'blend_shape',
  'method',
  'bezier',
  'audio',
  'animation',
]);

const AnimationEditSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('create'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Name for new animation'),
    library_name: z.string().optional().describe('Library to add to (default "")'),
    length: z.number().optional().describe('Animation length in seconds (default 1.0)'),
    loop_mode: LoopModeEnum.optional().describe('Loop mode (default "none")'),
    step: z.number().optional().describe('Step value for keyframe snapping'),
  }),
  z.object({
    action: z.literal('delete'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to delete'),
    library_name: z.string().optional().describe('Library containing animation'),
  }),
  z.object({
    action: z.literal('rename'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    old_name: z.string().describe('Current animation name'),
    new_name: z.string().describe('New animation name'),
    library_name: z.string().optional().describe('Library containing animation'),
  }),
  z.object({
    action: z.literal('update_props'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to update'),
    length: z.number().optional().describe('New length'),
    loop_mode: LoopModeEnum.optional().describe('New loop mode'),
    step: z.number().optional().describe('New step value'),
  }),
  z.object({
    action: z.literal('add_track'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_type: TrackTypeEnum.describe('Type of track'),
    track_path: z.string().describe('Node path and property (e.g., "Sprite2D:frame")'),
    insert_at: z.number().optional().describe('Track index to insert at (-1 for end)'),
  }),
  z.object({
    action: z.literal('remove_track'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Index of track to remove'),
  }),
  z.object({
    action: z.literal('add_keyframe'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    time: z.number().describe('Keyframe time in seconds'),
    value: z.unknown().optional().describe('Keyframe value (type depends on track type)'),
    transition: z.number().optional().describe('Transition curve (1.0 = linear)'),
    method_name: z.string().optional().describe('Method name (for method tracks)'),
    args: z.array(z.unknown()).optional().describe('Method arguments'),
  }),
  z.object({
    action: z.literal('remove_keyframe'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    keyframe_index: z.number().describe('Index of keyframe to remove'),
  }),
  z.object({
    action: z.literal('update_keyframe'),
    node_path: z.string().describe('Path to AnimationPlayer'),
    animation_name: z.string().describe('Animation to modify'),
    track_index: z.number().describe('Track index'),
    keyframe_index: z.number().describe('Keyframe index'),
    time: z.number().optional().describe('New time'),
    value: z.unknown().optional().describe('New value'),
    transition: z.number().optional().describe('New transition curve'),
  }),
]);

export const animationEdit = defineTool({
  name: 'animation_edit',
  description:
    'Edit animations. Actions: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe',
  schema: AnimationEditSchema,
  async execute(args, { godot }) {
    switch (args.action) {
      case 'create': {
        const result = await godot.sendCommand<{ created: string; library: string }>(
          'create_animation',
          {
            node_path: args.node_path,
            animation_name: args.animation_name,
            library_name: args.library_name,
            length: args.length,
            loop_mode: args.loop_mode,
            step: args.step,
          }
        );
        return `Created animation: ${result.created}${result.library ? ` in library: ${result.library}` : ''}`;
      }
      case 'delete': {
        const result = await godot.sendCommand<{ deleted: string }>('delete_animation', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          library_name: args.library_name,
        });
        return `Deleted animation: ${result.deleted}`;
      }
      case 'rename': {
        const result = await godot.sendCommand<{ renamed: { from: string; to: string } }>(
          'rename_animation',
          {
            node_path: args.node_path,
            old_name: args.old_name,
            new_name: args.new_name,
            library_name: args.library_name,
          }
        );
        return `Renamed animation: ${result.renamed.from} -> ${result.renamed.to}`;
      }
      case 'update_props': {
        const result = await godot.sendCommand<{
          updated: string;
          properties: Record<string, unknown>;
        }>('update_animation_properties', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          length: args.length,
          loop_mode: args.loop_mode,
          step: args.step,
        });
        return `Updated animation: ${result.updated}\nProperties: ${JSON.stringify(result.properties)}`;
      }
      case 'add_track': {
        const result = await godot.sendCommand<{
          track_index: number;
          track_path: string;
          track_type: string;
        }>('add_animation_track', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          track_type: args.track_type,
          track_path: args.track_path,
          insert_at: args.insert_at,
        });
        return `Added track ${result.track_index}: ${result.track_type} -> ${result.track_path}`;
      }
      case 'remove_track': {
        const result = await godot.sendCommand<{ removed_track: number }>(
          'remove_animation_track',
          {
            node_path: args.node_path,
            animation_name: args.animation_name,
            track_index: args.track_index,
          }
        );
        return `Removed track: ${result.removed_track}`;
      }
      case 'add_keyframe': {
        const result = await godot.sendCommand<{
          keyframe_index: number;
          time: number;
          value: unknown;
        }>('add_keyframe', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          track_index: args.track_index,
          time: args.time,
          value: args.value,
          transition: args.transition,
          method_name: args.method_name,
          args: args.args,
        });
        return `Added keyframe ${result.keyframe_index} at ${result.time}s`;
      }
      case 'remove_keyframe': {
        const result = await godot.sendCommand<{ removed_keyframe: number; track_index: number }>(
          'remove_keyframe',
          {
            node_path: args.node_path,
            animation_name: args.animation_name,
            track_index: args.track_index,
            keyframe_index: args.keyframe_index,
          }
        );
        return `Removed keyframe ${result.removed_keyframe} from track ${result.track_index}`;
      }
      case 'update_keyframe': {
        const result = await godot.sendCommand<{
          updated_keyframe: number;
          changes: Record<string, unknown>;
        }>('update_keyframe', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          track_index: args.track_index,
          keyframe_index: args.keyframe_index,
          time: args.time,
          value: args.value,
          transition: args.transition,
        });
        return `Updated keyframe ${result.updated_keyframe}: ${JSON.stringify(result.changes)}`;
      }
    }
  },
});

export const animationTools = [
  animationQuery,
  animationPlayback,
  animationEdit,
] as AnyToolDefinition[];
