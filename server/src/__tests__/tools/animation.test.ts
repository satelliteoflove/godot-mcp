import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection } from '../helpers/mock-godot.js';
import { animationQuery, animationPlayback, animationEdit } from '../../tools/animation.js';

describe('Animation Tools', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('animation_query', () => {
    describe('list_players action', () => {
      it('sends list_animation_players command', async () => {
        mock.mockResponse({ animation_players: [] });
        const ctx = createToolContext(mock);

        await animationQuery.execute({ action: 'list_players' }, ctx);

        expect(mock.calls[0].command).toBe('list_animation_players');
      });

      it('returns message when no players found', async () => {
        mock.mockResponse({ animation_players: [] });
        const ctx = createToolContext(mock);

        const result = await animationQuery.execute({ action: 'list_players' }, ctx);

        expect(result).toBe('No AnimationPlayer nodes found in scene');
      });

      it('lists found players', async () => {
        mock.mockResponse({
          animation_players: [
            { path: '/root/Player/AnimPlayer', name: 'AnimPlayer' },
            { path: '/root/Enemy/AnimPlayer', name: 'AnimPlayer' },
          ],
        });
        const ctx = createToolContext(mock);

        const result = await animationQuery.execute({ action: 'list_players' }, ctx);

        expect(result).toContain('Found 2 AnimationPlayer(s)');
        expect(result).toContain('/root/Player/AnimPlayer');
      });

      it('accepts optional root_path', () => {
        const result = animationQuery.schema.safeParse({
          action: 'list_players',
          root_path: '/root/Enemies',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('get_info action', () => {
      it('sends get_animation_player_info command with node_path', async () => {
        mock.mockResponse({
          current_animation: 'idle',
          is_playing: true,
          current_position: 0.5,
          speed_scale: 1,
          libraries: {},
          animation_count: 3,
        });
        const ctx = createToolContext(mock);

        await animationQuery.execute({
          action: 'get_info',
          node_path: '/root/Player/AnimPlayer',
        }, ctx);

        expect(mock.calls[0].command).toBe('get_animation_player_info');
        expect(mock.calls[0].params.node_path).toBe('/root/Player/AnimPlayer');
      });

      it('rejects get_info without node_path', () => {
        const result = animationQuery.schema.safeParse({ action: 'get_info' });
        expect(result.success).toBe(false);
      });
    });

    describe('get_details action', () => {
      it('requires node_path and animation_name', () => {
        expect(animationQuery.schema.safeParse({ action: 'get_details' }).success).toBe(false);
        expect(animationQuery.schema.safeParse({
          action: 'get_details',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);
        expect(animationQuery.schema.safeParse({
          action: 'get_details',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
        }).success).toBe(true);
      });
    });

    describe('get_keyframes action', () => {
      it('requires node_path, animation_name, and track_index', () => {
        expect(animationQuery.schema.safeParse({
          action: 'get_keyframes',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
        }).success).toBe(false);

        expect(animationQuery.schema.safeParse({
          action: 'get_keyframes',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
          track_index: 0,
        }).success).toBe(true);
      });
    });
  });

  describe('animation_playback', () => {
    describe('play action', () => {
      it('sends play_animation command', async () => {
        mock.mockResponse({ playing: 'walk', from_position: 0 });
        const ctx = createToolContext(mock);

        await animationPlayback.execute({
          action: 'play',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
        }, ctx);

        expect(mock.calls[0].command).toBe('play_animation');
        expect(mock.calls[0].params.animation_name).toBe('walk');
      });

      it('requires animation_name for play', () => {
        expect(animationPlayback.schema.safeParse({
          action: 'play',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);

        expect(animationPlayback.schema.safeParse({
          action: 'play',
          node_path: '/root/AnimPlayer',
          animation_name: 'idle',
        }).success).toBe(true);
      });

      it('returns playing confirmation', async () => {
        mock.mockResponse({ playing: 'run', from_position: 0 });
        const ctx = createToolContext(mock);

        const result = await animationPlayback.execute({
          action: 'play',
          node_path: '/root/AnimPlayer',
          animation_name: 'run',
        }, ctx);

        expect(result).toBe('Playing animation: run');
      });
    });

    describe('stop action', () => {
      it('sends stop_animation command', async () => {
        mock.mockResponse({});
        const ctx = createToolContext(mock);

        await animationPlayback.execute({
          action: 'stop',
          node_path: '/root/AnimPlayer',
        }, ctx);

        expect(mock.calls[0].command).toBe('stop_animation');
      });

      it('does not require animation_name', () => {
        expect(animationPlayback.schema.safeParse({
          action: 'stop',
          node_path: '/root/AnimPlayer',
        }).success).toBe(true);
      });
    });

    describe('pause action', () => {
      it('requires paused parameter', () => {
        expect(animationPlayback.schema.safeParse({
          action: 'pause',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);

        expect(animationPlayback.schema.safeParse({
          action: 'pause',
          node_path: '/root/AnimPlayer',
          paused: true,
        }).success).toBe(true);
      });
    });

    describe('seek action', () => {
      it('requires seconds parameter', () => {
        expect(animationPlayback.schema.safeParse({
          action: 'seek',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);

        expect(animationPlayback.schema.safeParse({
          action: 'seek',
          node_path: '/root/AnimPlayer',
          seconds: 1.5,
        }).success).toBe(true);
      });
    });
  });

  describe('animation_edit', () => {
    describe('create action', () => {
      it('sends create_animation command', async () => {
        mock.mockResponse({ created: 'new_anim', library: '' });
        const ctx = createToolContext(mock);

        await animationEdit.execute({
          action: 'create',
          node_path: '/root/AnimPlayer',
          animation_name: 'new_anim',
          length: 2.0,
        }, ctx);

        expect(mock.calls[0].command).toBe('create_animation');
        expect(mock.calls[0].params.animation_name).toBe('new_anim');
        expect(mock.calls[0].params.length).toBe(2.0);
      });

      it('requires animation_name', () => {
        expect(animationEdit.schema.safeParse({
          action: 'create',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);

        expect(animationEdit.schema.safeParse({
          action: 'create',
          node_path: '/root/AnimPlayer',
          animation_name: 'test',
        }).success).toBe(true);
      });
    });

    describe('add_track action', () => {
      it('requires animation_name, track_type, and track_path', () => {
        expect(animationEdit.schema.safeParse({
          action: 'add_track',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
        }).success).toBe(false);

        expect(animationEdit.schema.safeParse({
          action: 'add_track',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
          track_type: 'value',
          track_path: 'Sprite2D:frame',
        }).success).toBe(true);
      });
    });

    describe('add_keyframe action', () => {
      it('requires animation_name, track_index, and time', () => {
        expect(animationEdit.schema.safeParse({
          action: 'add_keyframe',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
          track_index: 0,
        }).success).toBe(false);

        expect(animationEdit.schema.safeParse({
          action: 'add_keyframe',
          node_path: '/root/AnimPlayer',
          animation_name: 'walk',
          track_index: 0,
          time: 0.5,
        }).success).toBe(true);
      });
    });

    describe('rename action', () => {
      it('requires old_name and new_name', () => {
        expect(animationEdit.schema.safeParse({
          action: 'rename',
          node_path: '/root/AnimPlayer',
        }).success).toBe(false);

        expect(animationEdit.schema.safeParse({
          action: 'rename',
          node_path: '/root/AnimPlayer',
          old_name: 'walk',
          new_name: 'walk_fast',
        }).success).toBe(true);
      });

      it('sends rename_animation command', async () => {
        mock.mockResponse({ renamed: { from: 'old', to: 'new' } });
        const ctx = createToolContext(mock);

        await animationEdit.execute({
          action: 'rename',
          node_path: '/root/AnimPlayer',
          old_name: 'old',
          new_name: 'new',
        }, ctx);

        expect(mock.calls[0].command).toBe('rename_animation');
        expect(mock.calls[0].params.old_name).toBe('old');
        expect(mock.calls[0].params.new_name).toBe('new');
      });
    });
  });
});
