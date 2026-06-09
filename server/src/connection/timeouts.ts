// Single source of truth for the command-timeout cascade (#276).
//
// Most MCP commands answer in milliseconds and run under one fixed socket
// timeout (QUICK_TIMEOUT_MS). A few legitimately run a while in-game
// (game_time step/step_until, input sequences with long timelines or capture
// offsets). For those, the server sizes its socket timeout from the tool's
// declared in-game budget and pushes the derived sub-budgets DOWN into the
// command params, so the editor relay and the game bridge stop hand-rolling
// their own magic numbers and inherit a correct stagger automatically.
//
// The layers, innermost first — each must answer BEFORE the one above it gives
// up, so a timeout surfaces as a typed error from the layer that hit it rather
// than a generic socket kill that orphans work below:
//
//   in-game budget      game-ms a step advances / the span an input sequence covers
//   bridge wall budget  = budget + slop (frame overrun, capture render)   [game bridge]
//   editor relay wait   = ready-wait + bridge wall budget + relay margin  [editor addon]
//   server socket       = editor relay wait + server margin               [this server]
//
// All values are wall-clock milliseconds. Define the margins ONCE here; every
// layer derives from this, so the stagger cannot drift and a new long-running
// tool inherits a correct cascade for free.

/** Default socket timeout for any command that declares no in-game budget. Unchanged behavior. */
export const QUICK_TIMEOUT_MS = 30_000;

/**
 * Hard backstop on the server socket regardless of declared budget — a
 * per-request timeout must never degrade into "wait forever" when the game
 * hangs. Chosen with Godot's 45s stale-connection timeout in mind: the 30s
 * application heartbeat refreshes that timer well inside this ceiling, so a
 * max-length command stays alive (see websocket_server.gd).
 */
export const ABSOLUTE_CEILING_MS = 60_000;

/** Bridge-ready wait that precedes an input sequence; folded into the budget so caps are worst-case-safe. */
export const READY_WAIT_MS = 10_000;

/** Wall-clock headroom the bridge allows over the in-game cap (a frame overrun, a capture render). */
export const BRIDGE_WALL_SLOP_MS = 5_000;

/** The editor relay waits this much longer than the bridge's wall budget. */
export const RELAY_MARGIN_MS = 2_000;

/** The server socket waits this much longer than the editor relay. */
export const SERVER_MARGIN_MS = 2_000;

const FIXED_OVERHEAD_MS = BRIDGE_WALL_SLOP_MS + RELAY_MARGIN_MS + SERVER_MARGIN_MS;

export interface DeriveOptions {
  /** Account for the bridge-ready wait (input sequences gate on it; game_time does not). */
  readyWait?: boolean;
}

export interface DerivedTimeouts {
  /** Wall budget the bridge enforces before aborting (partial, honestly reported). */
  bridgeWallMs: number;
  /** Total wall the editor relay waits (covers the ready-wait plus the bridge wall budget). */
  relayMs: number;
  /** Socket timeout the server applies to this command. <= ABSOLUTE_CEILING_MS by construction. */
  serverMs: number;
  /** The declared budget after clamping to what the ceiling permits. */
  clampedBudgetMs: number;
}

/**
 * The largest in-game budget a single call can declare and still answer before
 * the absolute ceiling, after subtracting the fixed cascade overhead (and the
 * ready-wait when applicable). Published tool caps must stay <= this.
 */
export function maxInGameBudgetMs(opts: DeriveOptions = {}): number {
  const ready = opts.readyWait ? READY_WAIT_MS : 0;
  return ABSOLUTE_CEILING_MS - FIXED_OVERHEAD_MS - ready;
}

/**
 * Derive the whole cascade from a tool's declared in-game budget. The budget is
 * clamped to what the ceiling permits BEFORE the ladder is built, so the
 * stagger (bridgeWall < relay < server <= ceiling) holds for any input.
 */
export function deriveTimeouts(inGameBudgetMs: number, opts: DeriveOptions = {}): DerivedTimeouts {
  const ready = opts.readyWait ? READY_WAIT_MS : 0;
  const budget = Number.isFinite(inGameBudgetMs) ? Math.ceil(inGameBudgetMs) : 0;
  const clampedBudgetMs = Math.min(Math.max(budget, 0), maxInGameBudgetMs(opts));
  const bridgeWallMs = clampedBudgetMs + BRIDGE_WALL_SLOP_MS;
  const relayMs = ready + bridgeWallMs + RELAY_MARGIN_MS;
  const serverMs = relayMs + SERVER_MARGIN_MS;
  return { bridgeWallMs, relayMs, serverMs, clampedBudgetMs };
}

// Published per-tool-family caps — the clean round numbers the tools actually
// enforce (game_time schema .max(), godot_input span/offset reject) and surface
// to callers. Each sits at or below maxInGameBudgetMs for its readyWait class
// (asserted by a unit test), leaving headroom under the ceiling so a request at
// the published cap can never time out server-side.
export const STEP_BUDGET_CAP_MS = 50_000;    // game_time step / step_until (no ready-wait)
export const INPUT_BUDGET_CAP_MS = 40_000;   // godot_input sequence span / capture offsets / type_text duration (ready-wait)
