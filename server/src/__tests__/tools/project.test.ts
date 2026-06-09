import { describe, it, expect, beforeEach } from 'vitest';
import { createMockGodot, createToolContext, MockGodotConnection, structuredOf } from '../helpers/mock-godot.js';
import { project } from '../../tools/project.js';

describe('project tool', () => {
  let mock: MockGodotConnection;

  beforeEach(() => {
    mock = createMockGodot();
  });

  describe('check_stale (#245)', () => {
    it('queries get_project_staleness', async () => {
      mock.mockResponse({ stale: false });
      const ctx = createToolContext(mock);
      await project.execute({ action: 'check_stale' }, ctx);
      expect(mock.calls[0].command).toBe('get_project_staleness');
    });

    it('surfaces the divergence report and a restart advisory when stale', async () => {
      const report = {
        stale: true,
        summary: 'project.godot was edited on disk after the editor loaded it: 1 autoload(s) added on disk (FX); 1 input action(s) added on disk (dash). Run `godot_editor restart` to reload.',
        autoload: { added: ['FX'], removed: [], changed: [] },
        input: { added: ['dash'] },
      };
      mock.mockResponse(report);
      const ctx = createToolContext(mock);

      const result = await project.execute({ action: 'check_stale' }, ctx);
      const structured = structuredOf(result);
      expect(structured.stale).toBe(true);
      expect(structured.autoload.added).toEqual(['FX']);
      expect(structured.input.added).toEqual(['dash']);
      expect(structured.advisory).toContain('STALE PROJECT SETTINGS:');
      expect(structured.advisory).toContain('godot_editor restart');
    });

    it('returns the report without an advisory when the project is in sync', async () => {
      const report = { stale: false, autoload: { added: [], removed: [], changed: [] }, input: { added: [] } };
      mock.mockResponse(report);
      const ctx = createToolContext(mock);

      const result = await project.execute({ action: 'check_stale' }, ctx);
      const structured = structuredOf(result);
      expect(structured.stale).toBe(false);
      expect(structured.advisory).toBeUndefined();
    });

    it('passes through a fail-safe not-stale report (unreadable project.godot)', async () => {
      mock.mockResponse({ stale: false, note: 'Could not read res://project.godot to check staleness.' });
      const ctx = createToolContext(mock);

      const result = await project.execute({ action: 'check_stale' }, ctx);
      const structured = structuredOf(result);
      expect(structured.stale).toBe(false);
      expect(structured.note).toContain('Could not read');
      expect(structured.advisory).toBeUndefined();
    });
  });
});
