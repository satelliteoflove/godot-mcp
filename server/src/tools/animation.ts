import { z } from 'zod';
import { defineTool } from '../core/define-tool.js';
import { structured } from '../core/structured.js';
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

const nodePathField = z.string().describe('Path to the AnimationPlayer');
const animNameField = z.string().describe('Animation name');
const trackIndexField = z.number().describe('Track index');
const keyframeIndexField = z.number().describe('Keyframe index');

const AnimationSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('list_players').describe('List AnimationPlayer nodes in the scene'),
    root_path: z.string().optional().describe('Starting node path (defaults to scene root)'),
  }),
  z.object({
    action: z.literal('get_info').describe('Get AnimationPlayer state and library list'),
    node_path: nodePathField,
  }),
  z.object({
    action: z.literal('get_details').describe("Get an animation's tracks and properties"),
    node_path: nodePathField,
    animation_name: animNameField,
  }),
  z.object({
    action: z.literal('get_keyframes').describe('Get keyframes for a track'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_index: trackIndexField,
  }),
  z.object({
    action: z.literal('play').describe('Play an animation'),
    node_path: nodePathField,
    animation_name: animNameField,
    custom_blend: z.number().optional().describe('Custom blend time, -1 for default'),
    custom_speed: z.number().optional().describe('Playback speed, 1.0 default'),
    from_end: z.boolean().optional().describe('Play from end for reverse'),
  }),
  z.object({
    action: z.literal('stop').describe('Stop playback'),
    node_path: nodePathField,
    keep_state: z.boolean().optional().describe('Keep current animation state'),
  }),
  z.object({
    action: z.literal('seek').describe('Seek to a position in the current animation'),
    node_path: nodePathField,
    seconds: z.number().describe('Position to seek to'),
    update: z.boolean().optional().describe('Update node immediately, default true'),
  }),
  z.object({
    action: z.literal('create').describe('Create an animation'),
    node_path: nodePathField,
    animation_name: animNameField,
    library_name: z.string().optional().describe('Library name'),
    length: z.number().optional().describe('Animation length in seconds'),
    loop_mode: LoopModeEnum.optional().describe('Loop mode: none, linear, pingpong'),
    step: z.number().optional().describe('Step value for keyframe snapping'),
  }),
  z.object({
    action: z.literal('delete').describe('Delete an animation'),
    node_path: nodePathField,
    animation_name: animNameField,
    library_name: z.string().optional().describe('Library name'),
  }),
  z.object({
    action: z.literal('update_props').describe('Update animation properties'),
    node_path: nodePathField,
    animation_name: animNameField,
    length: z.number().optional().describe('Animation length in seconds'),
    loop_mode: LoopModeEnum.optional().describe('Loop mode: none, linear, pingpong'),
    step: z.number().optional().describe('Step value for keyframe snapping'),
  }),
  z.object({
    action: z.literal('add_track').describe('Add a track to an animation'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_type: TrackTypeEnum.describe('Type of track'),
    track_path: z.string().describe('Node path and property, e.g. "Sprite2D:frame"'),
    insert_at: z.number().optional().describe('Track index to insert at, -1 for end'),
  }),
  z.object({
    action: z.literal('remove_track').describe('Remove a track'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_index: trackIndexField,
  }),
  z.object({
    action: z.literal('add_keyframe').describe('Add a keyframe to a track'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_index: trackIndexField,
    time: z.number().describe('Keyframe time in seconds'),
    value: z.unknown().optional().describe('Keyframe value'),
    transition: z.number().optional().describe('Transition curve, 1.0 = linear'),
    method_name: z.string().optional().describe('Method name for method tracks'),
    args: z.array(z.unknown()).optional().describe('Method arguments'),
  }),
  z.object({
    action: z.literal('remove_keyframe').describe('Remove a keyframe'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_index: trackIndexField,
    keyframe_index: keyframeIndexField,
  }),
  z.object({
    action: z.literal('update_keyframe').describe('Update a keyframe'),
    node_path: nodePathField,
    animation_name: animNameField,
    track_index: trackIndexField,
    keyframe_index: keyframeIndexField,
    time: z.number().optional().describe('Keyframe time in seconds'),
    value: z.unknown().optional().describe('Keyframe value'),
    transition: z.number().optional().describe('Transition curve, 1.0 = linear'),
  }),
]);

type AnimationArgs = z.infer<typeof AnimationSchema>;

export const animation = defineTool({
  name: 'godot_animation',
  annotations: { title: 'Animation', readOnlyHint: false, destructiveHint: true, openWorldHint: false },
  description:
    'Query, control, and edit animations. Query: list_players, get_info, get_details, get_keyframes. Playback: play, stop, seek. Edit: create, delete, update_props, add_track, remove_track, add_keyframe, remove_keyframe, update_keyframe',
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
        return structured(result);
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
        return structured(result);
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
        return structured(result);
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
      case 'seek': {
        const result = await godot.sendCommand<{ position: number }>('seek_animation', {
          node_path: args.node_path,
          seconds: args.seconds,
          update: args.update,
        });
        return `Seeked to position: ${result.position}`;
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
