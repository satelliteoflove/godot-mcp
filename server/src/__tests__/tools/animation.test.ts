import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { animation, animationTools } from '../../tools/animation.js';

describe('animation tool', () => {
  describe('tool definitions', () => {
    it('exports one tool', () => {
      expect(animationTools).toHaveLength(1);
    });

    it('has animation tool with all action types', () => {
      expect(animation.name).toBe('animation');
      expect(animation.description).toContain('Query');
      expect(animation.description).toContain('Playback');
      expect(animation.description).toContain('Edit');
    });
  });

  describe('query actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('list_players sends command and formats empty result', async () => {
      mock.mockResponse({ animation_players: [] });
      const ctx = createToolContext(mock);

      const result = await animation.execute({ action: 'list_players' }, ctx);

      expect(mock.calls[0].command).toBe('list_animation_players');
      expect(result).toBe('No AnimationPlayer nodes found in scene');
    });

    it('list_players formats found players', async () => {
      mock.mockResponse({
        animation_players: [
          { path: '/root/Player/AnimPlayer', name: 'AnimPlayer' },
          { path: '/root/Enemy/AnimPlayer', name: 'AnimPlayer' },
        ],
      });
      const ctx = createToolContext(mock);

      const result = await animation.execute({ action: 'list_players' }, ctx);

      expect(result).toContain('Found 2 AnimationPlayer(s)');
      expect(result).toContain('/root/Player/AnimPlayer');
    });

    it('get_info sends command and returns JSON', async () => {
      const info = { current_animation: 'idle', is_playing: true, current_position: 0.5 };
      mock.mockResponse(info);
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'get_info',
        node_path: '/root/AnimPlayer',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_animation_player_info');
      expect(mock.calls[0].params.node_path).toBe('/root/AnimPlayer');
      expect(result).toBe(JSON.stringify(info, null, 2));
    });

    it('get_details sends command with animation name', async () => {
      const details = { name: 'walk', length: 1.5, track_count: 3 };
      mock.mockResponse(details);
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'get_details',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
      }, ctx);

      expect(mock.calls[0].command).toBe('get_animation_details');
      expect(mock.calls[0].params.animation_name).toBe('walk');
      expect(result).toBe(JSON.stringify(details, null, 2));
    });

    it('get_keyframes sends command with track index', async () => {
      const keyframes = { track_path: 'Sprite:frame', keyframes: [{ time: 0, value: 0 }] };
      mock.mockResponse(keyframes);
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'get_keyframes',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
      }, ctx);

      expect(mock.calls[0].command).toBe('get_track_keyframes');
      expect(mock.calls[0].params.track_index).toBe(0);
      expect(result).toBe(JSON.stringify(keyframes, null, 2));
    });

    it('throws on error from Godot', async () => {
      mock.mockError(new Error('Node not found'));
      const ctx = createToolContext(mock);

      await expect(animation.execute({
        action: 'get_info',
        node_path: '/root/Missing',
      }, ctx)).rejects.toThrow('Node not found');
    });
  });

  describe('playback actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('play sends command and returns confirmation', async () => {
      mock.mockResponse({ playing: 'run', from_position: 0 });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'play',
        node_path: '/root/AnimPlayer',
        animation_name: 'run',
      }, ctx);

      expect(mock.calls[0].command).toBe('play_animation');
      expect(mock.calls[0].params.animation_name).toBe('run');
      expect(result).toBe('Playing animation: run');
    });

    it('play passes optional params', async () => {
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

    it('stop sends command and returns confirmation', async () => {
      mock.mockResponse({});
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'stop',
        node_path: '/root/AnimPlayer',
      }, ctx);

      expect(mock.calls[0].command).toBe('stop_animation');
      expect(result).toBe('Animation stopped');
    });

    it('seek sends command and returns position', async () => {
      mock.mockResponse({ position: 1.5 });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'seek',
        node_path: '/root/AnimPlayer',
        seconds: 1.5,
      }, ctx);

      expect(mock.calls[0].command).toBe('seek_animation');
      expect(mock.calls[0].params.seconds).toBe(1.5);
      expect(result).toBe('Seeked to position: 1.5');
    });
  });

  describe('edit actions', () => {
    let mock: MockGodotConnection;

    beforeEach(() => {
      mock = createMockGodot();
    });

    it('create sends command and returns confirmation', async () => {
      mock.mockResponse({ created: 'new_anim', library: '' });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'create',
        node_path: '/root/AnimPlayer',
        animation_name: 'new_anim',
        length: 2.0,
      }, ctx);

      expect(mock.calls[0].command).toBe('create_animation');
      expect(mock.calls[0].params.animation_name).toBe('new_anim');
      expect(mock.calls[0].params.length).toBe(2.0);
      expect(result).toBe('Created animation: new_anim');
    });

    it('create includes library in result when provided', async () => {
      mock.mockResponse({ created: 'walk', library: 'movement' });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'create',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        library_name: 'movement',
      }, ctx);

      expect(result).toBe('Created animation: walk in library: movement');
    });

    it('delete sends command and returns confirmation', async () => {
      mock.mockResponse({ deleted: 'old_anim' });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'delete',
        node_path: '/root/AnimPlayer',
        animation_name: 'old_anim',
      }, ctx);

      expect(mock.calls[0].command).toBe('delete_animation');
      expect(result).toBe('Deleted animation: old_anim');
    });

    it('update_props sends command and returns updated properties', async () => {
      mock.mockResponse({ updated: 'walk', properties: { length: 2.0, loop_mode: 'linear' } });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'update_props',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        length: 2.0,
        loop_mode: 'linear',
      }, ctx);

      expect(mock.calls[0].command).toBe('update_animation_properties');
      expect(result).toContain('Updated animation: walk');
      expect(result).toContain('"length":2');
    });

    it('add_track sends command and returns track info', async () => {
      mock.mockResponse({ track_index: 0, track_path: 'Sprite2D:frame', track_type: 'value' });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'add_track',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_type: 'value',
        track_path: 'Sprite2D:frame',
      }, ctx);

      expect(mock.calls[0].command).toBe('add_animation_track');
      expect(result).toBe('Added track 0: value -> Sprite2D:frame');
    });

    it('remove_track sends command and returns confirmation', async () => {
      mock.mockResponse({ removed_track: 2 });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'remove_track',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 2,
      }, ctx);

      expect(mock.calls[0].command).toBe('remove_animation_track');
      expect(result).toBe('Removed track: 2');
    });

    it('add_keyframe sends command and returns keyframe info', async () => {
      mock.mockResponse({ keyframe_index: 0, time: 0.5, value: 3 });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'add_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        time: 0.5,
        value: 3,
      }, ctx);

      expect(mock.calls[0].command).toBe('add_keyframe');
      expect(mock.calls[0].params.time).toBe(0.5);
      expect(mock.calls[0].params.value).toBe(3);
      expect(result).toBe('Added keyframe 0 at 0.5s');
    });

    it('remove_keyframe sends command and returns confirmation', async () => {
      mock.mockResponse({ removed_keyframe: 1, track_index: 0 });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'remove_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        keyframe_index: 1,
      }, ctx);

      expect(mock.calls[0].command).toBe('remove_keyframe');
      expect(result).toBe('Removed keyframe 1 from track 0');
    });

    it('update_keyframe sends command and returns changes', async () => {
      mock.mockResponse({ updated_keyframe: 0, changes: { time: 0.75, value: 5 } });
      const ctx = createToolContext(mock);

      const result = await animation.execute({
        action: 'update_keyframe',
        node_path: '/root/AnimPlayer',
        animation_name: 'walk',
        track_index: 0,
        keyframe_index: 0,
        time: 0.75,
        value: 5,
      }, ctx);

      expect(mock.calls[0].command).toBe('update_keyframe');
      expect(result).toContain('Updated keyframe 0');
      expect(result).toContain('"time":0.75');
    });
  });
});
