import { describe, it, expect } from 'vitest';
import { normalizeToolName, scoreTask, type EvalTask, type ToolCall } from '../../evals/score.js';

const task: EvalTask = {
  id: 'sample',
  requires_game: false,
  prompt: 'irrelevant',
  required_calls: ['godot_project.get_info', 'godot_node_read'],
  forbidden_calls: ['godot_exec'],
};

const call = (tool: string, action?: string, isError = false): ToolCall => ({
  tool,
  action,
  isError,
});

describe('normalizeToolName', () => {
  it('strips the MCP client prefix', () => {
    expect(normalizeToolName('mcp__godot-mcp__godot_scene')).toBe('godot_scene');
  });

  it('leaves bare tool names alone', () => {
    expect(normalizeToolName('godot_scene')).toBe('godot_scene');
  });
});

describe('scoreTask', () => {
  it('passes when every required call appears and no forbidden call does', () => {
    const score = scoreTask(task, [
      call('godot_project', 'get_info'),
      call('godot_node_read', 'find'),
    ]);
    expect(score.passed).toBe(true);
    expect(score.missingRequired).toEqual([]);
    expect(score.forbiddenHit).toEqual([]);
  });

  it('fails on a missing required tool.action pair', () => {
    const score = scoreTask(task, [
      call('godot_project', 'check_stale'), // right tool, wrong action
      call('godot_node_read', 'find'),
    ]);
    expect(score.passed).toBe(false);
    expect(score.missingRequired).toEqual(['godot_project.get_info']);
  });

  it('matches bare-tool specs on any action', () => {
    const score = scoreTask(task, [
      call('godot_project', 'get_info'),
      call('godot_node_read', 'get_scene_tree'),
    ]);
    expect(score.passed).toBe(true);
  });

  it('fails when a forbidden tool is called', () => {
    const score = scoreTask(task, [
      call('godot_project', 'get_info'),
      call('godot_node_read', 'find'),
      call('godot_exec', 'run'),
    ]);
    expect(score.passed).toBe(false);
    expect(score.forbiddenHit).toEqual(['godot_exec']);
  });

  it('counts calls and errors', () => {
    const score = scoreTask(task, [
      call('godot_project', 'get_info'),
      call('godot_project', 'get_info'),
      call('godot_node_read', 'find', true),
    ]);
    expect(score.totalCalls).toBe(3);
    expect(score.errorCalls).toBe(1);
    expect(score.callCounts['godot_project.get_info']).toBe(2);
  });
});
