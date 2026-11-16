import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { compactLogMessages, compactLogResponse, MAX_OTHER_MESSAGES, type LogMessage } from '../../tools/log-messages.js';

// Captured from Godot 4.7.2: open_scene on a scene whose TileSet atlas texture
// is missing. One load failure, then create_tile / has_alternative_tile /
// create_alternative_tile once per tile, each carrying the addon's six frames.
const fixture = JSON.parse(
  readFileSync(fileURLToPath(new URL('../fixtures/log-missing-tileset-texture.json', import.meta.url)), 'utf8')
) as { messages: LogMessage[] };

const entry = (over: Partial<LogMessage>): LogMessage => ({
  timestamp: 1, type: 'Error', message: 'boom', file: 'res://a.gd', line: 1, function: 'f', error_type: 0, frames: [], ...over,
});

describe('compactLogMessages (#315)', () => {
  it('turns the tileset fan-out into the root cause plus one group per failing call', () => {
    const out = compactLogMessages(fixture.messages);
    expect(out.map((m) => m.function)).toEqual(['_load', 'create_tile', 'has_alternative_tile', 'create_alternative_tile']);
    expect(out[0].message).toContain('Failed loading resource');
    expect(out[0].count).toBeUndefined();
    expect(out.slice(1).map((m) => [m.count, m.seq, m.last_seq])).toEqual([[3, 2, 8], [3, 3, 9], [3, 4, 10]]);
  });

  it('keeps the distinct messages of a group and drops identical repeats', () => {
    const out = compactLogMessages(fixture.messages);
    const createTile = out.find((m) => m.function === 'create_tile')!;
    expect(createTile.other_messages).toBeUndefined();
    const hasAlt = out.find((m) => m.function === 'has_alternative_tile')!;
    expect(hasAlt.message).toContain('(0, 0)');
    expect(hasAlt.other_messages).toEqual([
      'The TileSetAtlasSource atlas has no tile at (1, 0).',
      'The TileSetAtlasSource atlas has no tile at (2, 0).',
    ]);
  });

  it("drops the addon's own frames and names the triggering command as via", () => {
    const out = compactLogMessages(fixture.messages);
    for (const m of out) {
      expect(m.frames).toEqual([]);
      expect(m.via).toBe('open_scene');
    }
  });

  it('is much smaller than the raw response', () => {
    const raw = JSON.stringify(fixture.messages).length;
    const compact = JSON.stringify(compactLogMessages(fixture.messages)).length;
    expect(compact).toBeLessThan(raw / 3);
  });

  it('keeps project frames and leaves entries without addon frames untouched', () => {
    const userFrame = { file: 'res://scripts/level.gd', line: 12, function: 'build' };
    const addonFrame = { file: 'res://addons/godot_mcp/commands/node_commands.gd', line: 5, function: 'set_property' };
    const [mixed] = compactLogMessages([entry({ seq: 1, frames: [userFrame, addonFrame] })]);
    expect(mixed.frames).toEqual([userFrame]);
    expect(mixed.via).toBe('set_property');

    const plain = entry({ seq: 2, frames: [userFrame] });
    expect(compactLogMessages([plain])).toEqual([plain]);
  });

  it('groups non-adjacent repeats in order of first appearance', () => {
    const out = compactLogMessages([
      entry({ seq: 1, file: 'res://a.gd', message: 'a1' }),
      entry({ seq: 2, file: 'res://b.gd', message: 'b' }),
      entry({ seq: 3, file: 'res://a.gd', message: 'a2' }),
    ]);
    expect(out.map((m) => [m.file, m.count, m.last_seq, m.other_messages])).toEqual([
      ['res://a.gd', 2, 3, ['a2']],
      ['res://b.gd', undefined, undefined, undefined],
    ]);
  });

  it('does not merge entries that differ in line, type or severity', () => {
    const out = compactLogMessages([
      entry({ seq: 1 }),
      entry({ seq: 2, line: 2 }),
      entry({ seq: 3, type: 'Warning' }),
      entry({ seq: 4, error_type: 1 }),
    ]);
    expect(out).toHaveLength(4);
  });

  it('keeps the same engine error from different call sites apart', () => {
    // node.cpp get_node is shared by every script that misses a node.
    const engine = { file: 'scene/main/node.cpp', line: 1907, function: 'get_node', message: 'Node not found: "HUD"' };
    const player = { file: 'res://player.gd', line: 10, function: '_ready' };
    const enemy = { file: 'res://enemy.gd', line: 4, function: '_ready' };
    const out = compactLogMessages([
      entry({ seq: 1, ...engine, frames: [player] }),
      entry({ seq: 2, ...engine, frames: [enemy] }),
      entry({ seq: 3, ...engine, frames: [player] }),
    ]);
    expect(out.map((m) => [m.frames[0].file, m.count])).toEqual([['res://player.gd', 2], ['res://enemy.gd', undefined]]);
  });

  it('keeps entries raised by different MCP commands apart', () => {
    const via = (fn: string) => [{ file: 'res://addons/godot_mcp/commands/scene_commands.gd', line: 1, function: fn }];
    const out = compactLogMessages([
      entry({ seq: 1, frames: via('open_scene') }),
      entry({ seq: 2, frames: via('reload_scene') }),
    ]);
    expect(out.map((m) => m.via)).toEqual(['open_scene', 'reload_scene']);
  });

  it('counts the repeats the addon folded into an entry', () => {
    const out = compactLogMessages([entry({ seq: 1, repeats: 4 }), entry({ seq: 2 })]);
    expect(out).toHaveLength(1);
    expect(out[0].count).toBe(6);
    expect(out[0].last_seq).toBe(2);
    expect(out[0]).not.toHaveProperty('repeats');

    const [single] = compactLogMessages([entry({ seq: 1, repeats: 2 })]);
    expect(single.count).toBe(3);
  });

  it('applies the limit to groups and recounts returned_count', () => {
    const msgs = [
      entry({ seq: 1, file: 'res://a.gd' }), entry({ seq: 2, file: 'res://a.gd' }),
      entry({ seq: 3, file: 'res://b.gd' }), entry({ seq: 4, file: 'res://c.gd' }),
    ];
    const res = { total_count: 4, match_count: 4, returned_count: 4, cursor: 4, messages: msgs };
    expect(compactLogResponse(res, 50)).toMatchObject({ returned_count: 4, group_count: 3 });
    expect(compactLogResponse(res, 50)).not.toHaveProperty('omitted_groups');
    const two = compactLogResponse(res, 2);
    expect(two.messages.map((m) => m.file)).toEqual(['res://b.gd', 'res://c.gd']);
    expect(two).toMatchObject({ match_count: 4, returned_count: 2, group_count: 2, omitted_groups: 1 });
  });

  it('caps the distinct messages it lists and says how many it left out', () => {
    const many = Array.from({ length: MAX_OTHER_MESSAGES + 4 }, (_, i) => entry({ seq: i + 1, message: `tile ${i}` }));
    const [group] = compactLogMessages(many);
    expect(group.count).toBe(MAX_OTHER_MESSAGES + 4);
    expect(group.other_messages).toHaveLength(MAX_OTHER_MESSAGES);
    expect(group.more_messages).toBe(3);
  });
});
