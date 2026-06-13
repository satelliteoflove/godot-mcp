#!/usr/bin/env tsx
// Eval harness for godot-mcp: runs realistic agent tasks through `claude -p`
// (headless Claude Code) against a REAL Godot project with the bridge
// connected, and scores the tool-call transcripts.
//
// SAFETY INVARIANT — THIS RUNNER NEVER STARTS GODOT. There is no code path
// here that spawns an editor or a game. The preflight only probes whether the
// bridge addon is already listening; if it is not, the runner prints setup
// instructions and exits. requires_game tasks instruct the AGENT to run the
// project inside the editor YOU already opened — skip them with --skip-game.
//
// This is a manual, human-initiated harness. It costs real API tokens. It is
// intentionally not wired into CI.
//
// Usage:
//   npm run eval -- --project ~/Documents/Godot/my-game
//   npm run eval -- --project ~/Documents/Godot/my-game --task animation-authoring
//   npm run eval -- --project ~/Documents/Godot/my-game --skip-game
import { spawn } from 'node:child_process';
import { connect } from 'node:net';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { normalizeToolName, scoreTask, type EvalTask, type TaskScore, type ToolCall } from '../src/evals/score.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_DIR = resolve(__dirname, '..');
const RESULTS_DIR = join(__dirname, 'results');

const { values } = parseArgs({
  options: {
    project: { type: 'string' },
    task: { type: 'string' },
    'skip-game': { type: 'boolean' },
    'max-turns': { type: 'string' },
    model: { type: 'string' },
  },
});

const projectDir = values.project ?? process.env.GODOT_EVAL_PROJECT;
const maxTurns = Number(values['max-turns'] ?? 40);
const bridgeHost = process.env.GODOT_HOST ?? '127.0.0.1';
const bridgePort = Number(process.env.GODOT_PORT ?? 6550);

function fail(message: string): never {
  console.error(`\n[evals] ${message}`);
  process.exit(1);
}

function probeBridge(): Promise<boolean> {
  return new Promise((resolvePromise) => {
    const socket = connect({ host: bridgeHost, port: bridgePort });
    const finish = (up: boolean) => {
      socket.destroy();
      resolvePromise(up);
    };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(2000, () => finish(false));
  });
}

interface TranscriptResult {
  calls: ToolCall[];
  usage: { input_tokens?: number; output_tokens?: number } | null;
  costUsd: number | null;
  numTurns: number | null;
  durationMs: number;
  resultText: string;
  exitCode: number;
}

function runClaudeTask(task: EvalTask, mcpConfigPath: string): Promise<TranscriptResult> {
  const args = [
    '-p',
    task.prompt,
    '--mcp-config',
    mcpConfigPath,
    '--strict-mcp-config',
    // File tools included: the file-edit-then-verify task (and the v4 division
    // of labor generally) expects the agent to write .tscn files directly.
    '--allowedTools',
    'mcp__godot-mcp__*,Read,Write,Edit,Glob,Grep',
    '--output-format',
    'stream-json',
    '--verbose',
    '--max-turns',
    String(maxTurns),
  ];
  if (values.model) {
    args.push('--model', values.model);
  }

  return new Promise((resolvePromise, reject) => {
    const started = Date.now();
    const child = spawn('claude', args, {
      cwd: projectDir,
      stdio: ['ignore', 'pipe', 'inherit'],
    });

    const calls: ToolCall[] = [];
    const callsByUseId = new Map<string, ToolCall>();
    let usage: TranscriptResult['usage'] = null;
    let costUsd: number | null = null;
    let numTurns: number | null = null;
    let resultText = '';
    let buffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf-8');
      let newlineIndex = buffer.indexOf('\n');
      while (newlineIndex !== -1) {
        const line = buffer.slice(0, newlineIndex).trim();
        buffer = buffer.slice(newlineIndex + 1);
        newlineIndex = buffer.indexOf('\n');
        if (!line) continue;
        try {
          handleEvent(JSON.parse(line));
        } catch {
          // non-JSON noise on stdout — ignore
        }
      }
    });

    function handleEvent(event: Record<string, unknown>): void {
      if (event.type === 'assistant') {
        const message = event.message as { content?: Array<Record<string, unknown>> };
        for (const block of message?.content ?? []) {
          if (block.type === 'tool_use') {
            const input = (block.input ?? {}) as Record<string, unknown>;
            const call: ToolCall = {
              tool: normalizeToolName(String(block.name)),
              action: typeof input.action === 'string' ? input.action : undefined,
              isError: false,
            };
            calls.push(call);
            if (typeof block.id === 'string') {
              callsByUseId.set(block.id, call);
            }
          }
        }
      }
      if (event.type === 'user') {
        const message = event.message as { content?: Array<Record<string, unknown>> };
        for (const block of message?.content ?? []) {
          // Errors attribute by tool_use_id — parallel tool calls make
          // "the last call" the wrong target.
          if (block.type === 'tool_result' && block.is_error === true) {
            const call = typeof block.tool_use_id === 'string'
              ? callsByUseId.get(block.tool_use_id)
              : undefined;
            if (call) call.isError = true;
          }
        }
      }
      if (event.type === 'result') {
        usage = (event.usage as TranscriptResult['usage']) ?? null;
        costUsd = typeof event.total_cost_usd === 'number' ? event.total_cost_usd : null;
        numTurns = typeof event.num_turns === 'number' ? event.num_turns : null;
        resultText = typeof event.result === 'string' ? event.result : '';
      }
    }

    child.on('error', reject);
    child.on('close', (code) => {
      resolvePromise({
        calls,
        usage,
        costUsd,
        numTurns,
        durationMs: Date.now() - started,
        resultText,
        exitCode: code ?? -1,
      });
    });
  });
}

async function main(): Promise<void> {
  if (!projectDir) {
    fail(
      'No target project. Pass --project <path-to-godot-project> or set GODOT_EVAL_PROJECT.\n' +
        'Use one of the live-linked projects in ~/Documents/Godot/.'
    );
  }
  if (!existsSync(join(projectDir, 'project.godot'))) {
    fail(`${projectDir} does not contain a project.godot — not a Godot project.`);
  }

  const distCli = join(SERVER_DIR, 'dist', 'cli.js');
  if (!existsSync(distCli)) {
    fail('dist/cli.js not found — run `npm run build` first.');
  }

  if (!(await probeBridge())) {
    fail(
      `No godot-mcp bridge listening on ${bridgeHost}:${bridgePort}.\n\n` +
        'This harness NEVER starts Godot itself. To run evals:\n' +
        `  1. Open the target project in the Godot editor yourself: ${projectDir}\n` +
        '  2. Make sure the Godot MCP plugin is enabled (Project > Project Settings > Plugins)\n' +
        '  3. Re-run this command.\n\n' +
        'Note: the editor serves a single godot-mcp client at a time — close other\n' +
        'MCP sessions (e.g. an interactive Claude Code session) before running evals.'
    );
  }

  const allTasks = (
    JSON.parse(readFileSync(join(__dirname, 'tasks.json'), 'utf-8')) as { tasks: EvalTask[] }
  ).tasks;
  let tasks = allTasks;
  if (values.task) {
    tasks = tasks.filter((t) => t.id === values.task);
    if (tasks.length === 0) {
      fail(`Unknown task '${values.task}'. Available: ${allTasks.map((t) => t.id).join(', ')}`);
    }
  }
  if (values['skip-game']) {
    tasks = tasks.filter((t) => !t.requires_game);
  }

  if (tasks.some((t) => t.requires_game)) {
    console.error(
      '[evals] Note: this run includes requires_game tasks — the agent will run the\n' +
        '[evals] project inside YOUR open editor. Use --skip-game to exclude them.'
    );
  }

  const tempDir = mkdtempSync(join(tmpdir(), 'godot-mcp-eval-'));
  const mcpConfigPath = join(tempDir, 'mcp-config.json');
  writeFileSync(
    mcpConfigPath,
    JSON.stringify(
      { mcpServers: { 'godot-mcp': { command: 'node', args: [distCli] } } },
      null,
      2
    )
  );

  const scores: Array<TaskScore & { costUsd: number | null; durationMs: number }> = [];
  for (const task of tasks) {
    console.error(`\n[evals] running ${task.id} ...`);
    const transcript = await runClaudeTask(task, mcpConfigPath);
    const score = scoreTask(task, transcript.calls);
    scores.push({ ...score, costUsd: transcript.costUsd, durationMs: transcript.durationMs });

    const status = score.passed ? 'PASS' : 'FAIL';
    console.error(
      `[evals] ${status} ${task.id}: ${score.totalCalls} tool calls, ` +
        `${score.errorCalls} errors, ${(transcript.durationMs / 1000).toFixed(1)}s` +
        (transcript.costUsd != null ? `, $${transcript.costUsd.toFixed(4)}` : '')
    );
    if (score.missingRequired.length > 0) {
      console.error(`[evals]   missing required: ${score.missingRequired.join(', ')}`);
    }
    if (score.forbiddenHit.length > 0) {
      console.error(`[evals]   forbidden calls made: ${score.forbiddenHit.join(', ')}`);
    }

    mkdirSync(RESULTS_DIR, { recursive: true });
    writeFileSync(
      join(RESULTS_DIR, `${task.id}.json`),
      JSON.stringify({ task: task.id, score, transcript }, null, 2)
    );
  }

  const passed = scores.filter((s) => s.passed).length;
  const totalCost = scores.reduce((sum, s) => sum + (s.costUsd ?? 0), 0);
  console.error(
    `\n[evals] ${passed}/${scores.length} tasks passed, total cost $${totalCost.toFixed(4)}.` +
      `\n[evals] Per-task transcripts in ${RESULTS_DIR} — feed failures back into tool descriptions.`
  );
  process.exit(passed === scores.length ? 0 : 1);
}

main().catch((error) => {
  console.error('[evals] fatal:', error);
  process.exit(1);
});
