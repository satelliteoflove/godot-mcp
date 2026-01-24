import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { animation } from '../../tools/animation.js';

describe('animation tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('query actions', () => {
    it('list_players returns formatted list or empty message', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ animation_players: [] });
      expect(await animation.execute({ action: 'list_players' }, ctx))
        .toBe('No AnimationPlayer nodes found in scene');

      mock.mockResponse({
        animation_players: [
          { path: '/root/Player/AnimPlayer', name: 'AnimPlayer' },
          { path: '/root/Enemy/AnimPlayer', name: 'AnimPlayer' },
        ],
      });
      const result = await animation.execute({ action: 'list_players' }, ctx);
      expect(result).toContain('Found 2 AnimationPlayer(s)');
      expect(result).toContain('/root/Player/AnimPlayer');
    });

    it('get_info/get_details/get_keyframes return JSON', async () => {
      const ctx = createToolContext(mock);

      const info = { current_animation: 'idle', is_playing: true };
      mock.mockResponse(info);
      expect(JSON.parse(await animation.execute({
        action: 'get_info',
        node_path: '/root/AnimPlayer',
      }, ctx) as string)).toEqual(info);

      const details = { name: 'walk', length: 1.5, track_count: 3 };
      mock.mockResponse(details);
      expect(JSON.parse(await animation.execute({
        action: 'get_details',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
      }, ctx) as string)).toEqual(details);

      const keyframes = { track_path: 'Sprite:frame', keyframes: [{ time: 0, value: 0 }] };
      mock.mockResponse(keyframes);
      expect(JSON.parse(await animation.execute({
        action: 'get_keyframes',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
      }, ctx) as string)).toEqual(keyframes);
    });

    it('propagates errors from Godot', async () => {
      mock.mockError(new Error('Node not found'));
      const ctx = createToolContext(mock);

      await expect(animation.execute({
        action: 'get_info',
        node_path: '/root/Missing',
      }, ctx)).rejects.toThrow('Node not found');
    });
  });

  describe('playback actions', () => {
    it('play/stop/seek return confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ playing: 'run', from_position: 0 });
      expect(await animation.execute({
        action: 'play',
        node_path: '/root/AnimPlayer',
        animation_name: 'run',
      }, ctx)).toBe('Playing animation: run');

      mock.mockResponse({});
      expect(await animation.execute({
        action: 'stop',
        node_path: '/root/AnimPlayer',
      }, ctx)).toBe('Animation stopped');

      mock.mockResponse({ position: 1.5 });
      expect(await animation.execute({
        action: 'seek',
        node_path: '/root/AnimPlayer',
        seconds: 1.5,
      }, ctx)).toBe('Seeked to position: 1.5');
    });

    it('play passes optional speed/blend/from_end params', async () => {
      mock.mockResponse({ playing: 'walk', from_position: 0 });
      const ctx = createToolContext(mock);

      await animation.execute({
        action: 'play',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        custom_speed: 2.0,
        custom_blend: 0.5,
        from_end: true,
      }, ctx);

      expect(mock.calls[0].params.custom_speed).toBe(2.0);
      expect(mock.calls[0].params.custom_blend).toBe(0.5);
      expect(mock.calls[0].params.from_end).toBe(true);
    });
  });

  describe('edit actions', () => {
    it('create/delete return confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ created: 'new_anim', library: '' });
      expect(await animation.execute({
        action: 'create',
        node_path: '/root/AnimPlayer',
        animation_name: 'new_anim',
        length: 2.0,
      }, ctx)).toBe('Created animation: new_anim');

      mock.mockResponse({ created: 'walk', library: 'movement' });
      expect(await animation.execute({
        action: 'create',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        library_name: 'movement',
      }, ctx)).toBe('Created animation: walk in library: movement');

      mock.mockResponse({ deleted: 'old_anim' });
      expect(await animation.execute({
        action: 'delete',
        node_path: '/root/AnimPlayer',
        animation_name: 'old_anim',
      }, ctx)).toBe('Deleted animation: old_anim');
    });

    it('track operations return formatted confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ track_index: 0, track_path: 'Sprite2D:frame', track_type: 'value' });
      expect(await animation.execute({
        action: 'add_track',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_type: 'value',
        track_path: 'Sprite2D:frame',
      }, ctx)).toBe('Added track 0: value -> Sprite2D:frame');

      mock.mockResponse({ removed_track: 2 });
      expect(await animation.execute({
        action: 'remove_track',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 2,
      }, ctx)).toBe('Removed track: 2');
    });

    it('keyframe operations return formatted confirmations', async () => {
      const ctx = createToolContext(mock);

      mock.mockResponse({ keyframe_index: 0, time: 0.5, value: 3 });
      expect(await animation.execute({
        action: 'add_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        time: 0.5,
        value: 3,
      }, ctx)).toBe('Added keyframe 0 at 0.5s');

      mock.mockResponse({ removed_keyframe: 1, track_index: 0 });
      expect(await animation.execute({
        action: 'remove_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        keyframe_index: 1,
      }, ctx)).toBe('Removed keyframe 1 from track 0');

      mock.mockResponse({ updated_keyframe: 0, changes: { time: 0.75, value: 5 } });
      const result = await animation.execute({
        action: 'update_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        keyframe_index: 0,
        time: 0.75,
        value: 5,
      }, ctx);
      expect(result).toContain('Updated keyframe 0');
    });
  });
});
