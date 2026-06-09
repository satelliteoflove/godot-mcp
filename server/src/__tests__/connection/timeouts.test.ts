import { describe, it, expect } from 'vitest';
import {
  deriveTimeouts,
  maxInGameBudgetMs,
  QUICK_TIMEOUT_MS,
  ABSOLUTE_CEILING_MS,
  READY_WAIT_MS,
  BRIDGE_WALL_SLOP_MS,
  STEP_BUDGET_CAP_MS,
  INPUT_BUDGET_CAP_MS,
  EXEC_BUDGET_CAP_MS,
} from '../../connection/timeouts.js';

describe('timeout cascade (#276)', () => {
  describe('deriveTimeouts stagger invariant', () => {
    // The whole point: bridge answers before relay answers before the server
    // gives up, and the server never exceeds the absolute ceiling — for ANY
    // budget, clamped or not, with or without the ready-wait.
    const cases = [
      { label: 'zero budget, no ready', budget: 0, readyWait: false },
      { label: 'mid budget, no ready', budget: 5_000, readyWait: false },
      { label: 'at step cap', budget: STEP_BUDGET_CAP_MS, readyWait: false },
      { label: 'over cap, no ready', budget: 10_000_000, readyWait: false },
      { label: 'zero budget, ready', budget: 0, readyWait: true },
      { label: 'at input cap', budget: INPUT_BUDGET_CAP_MS, readyWait: true },
      { label: 'over cap, ready', budget: 999_999, readyWait: true },
    ];

    for (const c of cases) {
      it(`${c.label}: bridgeWall < relay < server <= ceiling`, () => {
        const t = deriveTimeouts(c.budget, { readyWait: c.readyWait });
        expect(t.bridgeWallMs).toBeLessThan(t.relayMs);
        expect(t.relayMs).toBeLessThan(t.serverMs);
        expect(t.serverMs).toBeLessThanOrEqual(ABSOLUTE_CEILING_MS);
        expect(t.clampedBudgetMs).toBeGreaterThanOrEqual(0);
        expect(t.clampedBudgetMs).toBeLessThanOrEqual(maxInGameBudgetMs({ readyWait: c.readyWait }));
      });
    }
  });

  it('produces a proportionally small (sub-ceiling) timeout for a small budget', () => {
    const t = deriveTimeouts(3_000, { readyWait: false });
    // bridgeWall = 3000 + slop; relay = +2000; server = +2000.
    expect(t.bridgeWallMs).toBe(3_000 + BRIDGE_WALL_SLOP_MS);
    expect(t.serverMs).toBeLessThan(ABSOLUTE_CEILING_MS);
  });

  it('reserves an extra READY_WAIT_MS of headroom when the ready-wait applies', () => {
    expect(maxInGameBudgetMs({ readyWait: false }) - maxInGameBudgetMs({ readyWait: true })).toBe(READY_WAIT_MS);
  });

  it('clamps an over-budget request to the ceiling, never beyond', () => {
    expect(deriveTimeouts(Number.MAX_SAFE_INTEGER, { readyWait: true }).serverMs).toBe(ABSOLUTE_CEILING_MS);
    expect(deriveTimeouts(Number.MAX_SAFE_INTEGER, { readyWait: false }).serverMs).toBe(ABSOLUTE_CEILING_MS);
  });

  it('handles a non-finite budget defensively (treats it as zero)', () => {
    const t = deriveTimeouts(NaN, { readyWait: false });
    expect(t.clampedBudgetMs).toBe(0);
    expect(t.serverMs).toBeGreaterThan(0);
  });

  describe('published caps stay under the ceiling so they can never time out server-side', () => {
    it('step cap <= max in-game budget (no ready-wait)', () => {
      expect(STEP_BUDGET_CAP_MS).toBeLessThanOrEqual(maxInGameBudgetMs({ readyWait: false }));
    });
    it('input cap <= max in-game budget (with ready-wait)', () => {
      expect(INPUT_BUDGET_CAP_MS).toBeLessThanOrEqual(maxInGameBudgetMs({ readyWait: true }));
    });
    it('exec cap <= max in-game budget (no ready-wait)', () => {
      expect(EXEC_BUDGET_CAP_MS).toBeLessThanOrEqual(maxInGameBudgetMs({ readyWait: false }));
    });
  });

  it('keeps the quick default unchanged at 30s', () => {
    expect(QUICK_TIMEOUT_MS).toBe(30_000);
  });
});
