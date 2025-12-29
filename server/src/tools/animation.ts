import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import type { AnyToolDefinition } from '../core/types.js';

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

const AnimationSchema = z
  .object({
    action: z
      .enum([
        'list_players',
        'get_info',
        'get_details',
        'get_keyframes',
        'play',
        'stop',
        'pause',
        'seek',
        'queue',
        'clear_queue',
        'create',
        'delete',
        'rename',
        'update_props',
        'add_track',
        'remove_track',
        'add_keyframe',
        'remove_keyframe',
        'update_keyframe',
      ])
      .describe(
        'Action: list_players, get_info, get_details, get_keyframes (query), play, stop, pause, seek, queue, clear_queue (playback), create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe (edit)'
      ),
    root_path: z.string().optional().describe('Starting node path (list_players only)'),
    node_path: z.string().optional().describe('Path to AnimationPlayer (required except list_players)'),
    animation_name: z.string().optional().describe('Animation name'),
    track_index: z.number().optional().describe('Track index'),
    custom_blend: z.number().optional().describe('Custom blend time, -1 for default (play)'),
    custom_speed: z.number().optional().describe('Playback speed, 1.0 default (play)'),
    from_end: z.boolean().optional().describe('Play from end for reverse (play)'),
    keep_state: z.boolean().optional().describe('Keep current animation state (stop)'),
    paused: z.boolean().optional().describe('True to pause, false to unpause (pause)'),
    seconds: z.number().optional().describe('Position to seek to (seek)'),
    update: z.boolean().optional().describe('Update node immediately, default true (seek)'),
    library_name: z.string().optional().describe('Library name (create, delete, rename)'),
    length: z.number().optional().describe('Animation length in seconds (create, update_props)'),
    loop_mode: LoopModeEnum.optional().describe('Loop mode: none, linear, pingpong (create, update_props)'),
    step: z.number().optional().describe('Step value for keyframe snapping (create, update_props)'),
    old_name: z.string().optional().describe('Current animation name (rename)'),
    new_name: z.string().optional().describe('New animation name (rename)'),
    track_type: TrackTypeEnum.optional().describe('Type of track (add_track)'),
    track_path: z.string().optional().describe('Node path and property, e.g. "Sprite2D:frame" (add_track)'),
    insert_at: z.number().optional().describe('Track index to insert at, -1 for end (add_track)'),
    time: z.number().optional().describe('Keyframe time in seconds (add_keyframe, update_keyframe)'),
    value: z.unknown().optional().describe('Keyframe value (add_keyframe, update_keyframe)'),
    transition: z.number().optional().describe('Transition curve, 1.0 = linear (add_keyframe, update_keyframe)'),
    method_name: z.string().optional().describe('Method name for method tracks (add_keyframe)'),
    args: z.array(z.unknown()).optional().describe('Method arguments (add_keyframe)'),
    keyframe_index: z.number().optional().describe('Keyframe index (remove_keyframe, update_keyframe)'),
  })
  .refine(
    (data) => {
      switch (data.action) {
        case 'list_players':
          return true;
        case 'get_info':
        case 'stop':
        case 'clear_queue':
          return !!data.node_path;
        case 'get_details':
        case 'create':
        case 'delete':
        case 'update_props':
          return !!data.node_path && !!data.animation_name;
        case 'get_keyframes':
          return !!data.node_path && !!data.animation_name && data.track_index !== undefined;
        case 'play':
        case 'queue':
          return !!data.node_path && !!data.animation_name;
        case 'pause':
          return !!data.node_path && data.paused !== undefined;
        case 'seek':
          return !!data.node_path && data.seconds !== undefined;
        case 'rename':
          return !!data.node_path && !!data.old_name && !!data.new_name;
        case 'add_track':
          return !!data.node_path && !!data.animation_name && !!data.track_type && !!data.track_path;
        case 'remove_track':
          return !!data.node_path && !!data.animation_name && data.track_index !== undefined;
        case 'add_keyframe':
          return (
            !!data.node_path &&
            !!data.animation_name &&
            data.track_index !== undefined &&
            data.time !== undefined
          );
        case 'remove_keyframe':
        case 'update_keyframe':
          return (
            !!data.node_path &&
            !!data.animation_name &&
            data.track_index !== undefined &&
            data.keyframe_index !== undefined
          );
        default:
          return false;
      }
    },
    { message: 'Missing required fields for action' }
  );

type AnimationArgs = z.infer<typeof AnimationSchema>;

export const animation = defineTool({
  name: 'animation',
  description:
    'Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, pause, seek, queue, clear_queue. Edit: create, delete, rename, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe',
  schema: AnimationSchema,
  async execute(args: AnimationArgs, { godot }) {
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
        const result = await godot.sendCommand<{ removed_track: number }>('remove_animation_track', {
          node_path: args.node_path,
          animation_name: args.animation_name,
          track_index: args.track_index,
        });
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

export const animationTools = [animation] as AnyToolDefinition[];
