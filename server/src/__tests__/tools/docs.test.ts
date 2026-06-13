import { describe, it, expect, vi, afterEach } from 'vitest';
import { createMockGodot, createToolContext } from '../helpers/mock-godot.js';
import { docs } from '../../tools/docs.js';

// docs.ts fetches from the LIVE Godot docs site. Two kinds of tests live here:
//
//   * mocked (no network)  — ALWAYS run; they stub global fetch so docs.ts's
//     URL/version/parse/section logic is covered deterministically. This is what
//     keeps docs.ts above the coverage gate in the normal CI run.
//   * live integration     — OFF by default, gated behind RUN_LIVE_DOCS. They are
//     the only canary for "did docs.godotengine.org change its HTML or URL
//     scheme?", but they flake on network/rate-limiting (HTTP 429) and slow CI,
//     so they must be opted into:
//         RUN_LIVE_DOCS=1 npx vitest run src/__tests__/tools/docs.test.ts
//         (PowerShell: $env:RUN_LIVE_DOCS='1'; npx vitest run src/__tests__/tools/docs.test.ts)
//     or on demand in CI via the "Docs live integration" workflow (Actions tab).
const RUN_LIVE_DOCS = !!process.env.RUN_LIVE_DOCS;

// Only the live suites make real fetches (each aborted at docs.ts's 15s
// FETCH_TIMEOUT_MS); the heaviest makes two sequential ones, which can exceed
// vitest's 5s default on a slow network. Harmless for the fast mocked suite.
vi.setConfig({ testTimeout: 40_000 });

describe('godot_docs tool', () => {
  describe('schema validation', () => {
    it('accepts valid version and section values', () => {
      const versions = ['stable', 'latest', '4.5', '4.4', '4.3', '4.2'];
      const sections = ['full', 'description', 'properties', 'methods', 'signals'];

      for (const version of versions) {
        expect(docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          version,
        }).success).toBe(true);
      }

      for (const section of sections) {
        expect(docs.schema.safeParse({
          action: 'fetch_class',
          class_name: 'Node2D',
          section,
        }).success).toBe(true);
      }
    });

    it('rejects invalid version', () => {
      expect(docs.schema.safeParse({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: '3.5',
      }).success).toBe(false);
    });
  });

  // Always-on, network-free coverage of docs.ts's logic. Stubs global fetch so
  // these are deterministic and fast; together they exercise URL construction,
  // version resolution, HTML→markdown, section filtering, and every error path
  // — the coverage the gated live suites would otherwise be the only source of.
  describe('mocked (no network)', () => {
    afterEach(() => {
      vi.restoreAllMocks();
    });

    // Minimal stand-in for a class-reference page: the role="main" /
    // role="contentinfo" wrapper extractMainContent keys on, an <h1> title with
    // an Inherits line, and one <h2> per filterable section.
    const CLASS_HTML = [
      '<html><body>',
      '<div role="main">',
      '<h1>Node2D</h1>',
      '<p><strong>Inherits:</strong> CanvasItem</p>',
      '<h2>Description</h2>',
      '<p>A 2D game object with a <code>position</code>, rotation and scale.</p>',
      '<h2>Properties</h2>',
      '<ul><li><code>position</code></li></ul>',
      '<h2>Methods</h2>',
      '<ul><li><a href="#m">apply_scale</a></li></ul>',
      '<h2>Signals</h2>',
      '<ul><li><code>draw</code></li></ul>',
      '</div>',
      '<div role="contentinfo">footer</div>',
      '</body></html>',
    ].join('\n');

    // fetchHtml only reads .status, .ok and .text(), so a partial Response is
    // enough — avoids depending on the global Response constructor.
    function mockFetch(body: string, status = 200) {
      const response = { status, ok: status >= 200 && status < 300, text: async () => body };
      return vi.spyOn(globalThis, 'fetch').mockResolvedValue(response as Response);
    }

    it('builds a lowercased class URL and returns full markdown for section=full', async () => {
      const spy = mockFetch(CLASS_HTML);
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'full' },
        ctx
      )) as string;

      expect(spy).toHaveBeenCalledOnce();
      expect(spy.mock.calls[0][0] as string).toBe(
        'https://docs.godotengine.org/en/stable/classes/class_node2d.html'
      );
      expect(result).toContain('# Node2D');
      expect(result).toContain('## Description');
      expect(result).toContain('## Properties');
      expect(result).toContain('## Methods');
      expect(result).toContain('## Signals');
      expect(result).toContain('Source: https://docs.godotengine.org');
    });

    it('section=description returns the title + Description only', async () => {
      mockFetch(CLASS_HTML);
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'description' },
        ctx
      )) as string;

      expect(result).toContain('# Node2D');
      expect(result).toContain('## Description');
      expect(result).not.toContain('## Methods');
    });

    it('section=methods returns just the Methods section', async () => {
      mockFetch(CLASS_HTML);
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'methods' },
        ctx
      )) as string;

      expect(result).toContain('## Methods');
      expect(result).not.toContain('## Description');
    });

    it('reports a missing named section instead of throwing', async () => {
      mockFetch('<div role="main"><h1>Empty</h1><h2>Description</h2><p>x</p></div><div role="contentinfo">');
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Empty', version: 'stable', section: 'signals' },
        ctx
      )) as string;

      expect(result).toContain('Section "signals" not found');
    });

    it('reports a missing Description section instead of throwing', async () => {
      mockFetch('<div role="main"><h1>NoDesc</h1><h2>Methods</h2><p>m</p></div><div role="contentinfo">');
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'NoDesc', version: 'stable', section: 'description' },
        ctx
      )) as string;

      expect(result).toContain('Section "description" not found');
    });

    it('fetch_page normalizes a path without a leading slash', async () => {
      const spy = mockFetch('<div role="main"><h1>Movement</h1><p>body text here</p></div><div role="contentinfo">');
      const ctx = createToolContext(createMockGodot());

      const result = (await docs.execute(
        { action: 'fetch_page', path: 'tutorials/2d/2d_movement.html', version: 'stable' },
        ctx
      )) as string;

      expect(spy.mock.calls[0][0] as string).toBe(
        'https://docs.godotengine.org/en/stable/tutorials/2d/2d_movement.html'
      );
      expect(result).toContain('Source: https://docs.godotengine.org');
    });

    it('auto-detects the docs version from the connected Godot', async () => {
      const spy = mockFetch(CLASS_HTML);
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', section: 'description' },
        ctx
      )) as string;

      expect(spy.mock.calls[0][0] as string).toContain('/en/4.5/');
      expect(result).toContain('(auto-detected: 4.5)');
    });

    it('falls back to stable when no Godot version is available', async () => {
      const spy = mockFetch(CLASS_HTML);
      const ctx = createToolContext(createMockGodot()); // godotVersion = null

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', section: 'description' },
        ctx
      )) as string;

      expect(spy.mock.calls[0][0] as string).toContain('/en/stable/');
      expect(result).toContain('(auto-detected: stable)');
    });

    it('falls back to stable for an unsupported Godot version', async () => {
      const spy = mockFetch(CLASS_HTML);
      const mock = createMockGodot();
      mock.godotVersion = '3.5.0'; // parses but is not in SUPPORTED_VERSIONS
      const ctx = createToolContext(mock);

      await docs.execute({ action: 'fetch_class', class_name: 'Node2D', section: 'description' }, ctx);

      expect(spy.mock.calls[0][0] as string).toContain('/en/stable/');
    });

    it('ignores an unparseable Godot version string', async () => {
      const spy = mockFetch(CLASS_HTML);
      const mock = createMockGodot();
      mock.godotVersion = 'custom-build';
      const ctx = createToolContext(mock);

      await docs.execute({ action: 'fetch_class', class_name: 'Node2D', section: 'description' }, ctx);

      expect(spy.mock.calls[0][0] as string).toContain('/en/stable/');
    });

    it('an explicit version overrides auto-detection and omits the note', async () => {
      const spy = mockFetch(CLASS_HTML);
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = (await docs.execute(
        { action: 'fetch_class', class_name: 'Node2D', version: '4.4', section: 'description' },
        ctx
      )) as string;

      expect(spy.mock.calls[0][0] as string).toContain('/en/4.4/');
      expect(result).not.toContain('auto-detected');
    });

    it('maps a 404 to a not-found error', async () => {
      mockFetch('', 404);
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_class', class_name: 'Ghost', version: 'stable', section: 'full' }, ctx)
      ).rejects.toThrow('not found');
    });

    it('surfaces a non-OK HTTP status (e.g. rate limiting)', async () => {
      mockFetch('', 429);
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_page', path: '/x.html', version: 'stable' }, ctx)
      ).rejects.toThrow('HTTP 429');
    });

    it('maps an aborted fetch to a timeout error', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(
        Object.assign(new Error('aborted'), { name: 'AbortError' })
      );
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'full' }, ctx)
      ).rejects.toThrow('timed out');
    });

    it('explains when the page has no extractable main content', async () => {
      mockFetch('<html><body>no main wrapper</body></html>');
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_class', class_name: 'Node2D', version: 'stable', section: 'full' }, ctx)
      ).rejects.toThrow('structure may have changed');
    });

    it('requires a non-empty class_name', async () => {
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_class', class_name: '', version: 'stable', section: 'full' }, ctx)
      ).rejects.toThrow('class_name is required');
    });

    it('requires a non-empty path for fetch_page', async () => {
      const ctx = createToolContext(createMockGodot());

      await expect(
        docs.execute({ action: 'fetch_page', path: '', version: 'stable' }, ctx)
      ).rejects.toThrow('path is required');
    });
  });

  describe.runIf(RUN_LIVE_DOCS)('fetch_class (live integration)', () => {
    it('fetches class reference with section filtering', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const fullResult = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: 'stable',
        section: 'full',
      }, ctx) as string;

      const descResult = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: 'stable',
        section: 'description',
      }, ctx) as string;

      expect(fullResult).toContain('Node2D');
      expect(fullResult).toContain('Source: https://docs.godotengine.org');
      expect(descResult.length).toBeLessThan(fullResult.length);
    });

    it('handles class name case insensitively', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'SPRITE2D',
        version: 'stable',
        section: 'description',
      }, ctx);

      expect(result).toContain('Sprite2D');
    });

    it('throws error for non-existent class', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      await expect(docs.execute({
        action: 'fetch_class',
        class_name: 'NotARealClass12345',
        version: 'stable',
        section: 'full',
      }, ctx)).rejects.toThrow('not found');
    });

    it('fetches from specific version', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'TileMapLayer',
        version: '4.5',
        section: 'description',
      }, ctx);

      expect(result).toContain('/en/4.5/');
    });
  });

  describe.runIf(RUN_LIVE_DOCS)('fetch_page (live integration)', () => {
    it('fetches tutorial page', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_page',
        path: '/tutorials/2d/2d_movement.html',
        version: 'stable',
      }, ctx) as string;

      expect(result).toContain('Source: https://docs.godotengine.org');
      expect(result.length).toBeGreaterThan(1000);
    });
  });

  describe.runIf(RUN_LIVE_DOCS)('version auto-detection (live integration)', () => {
    it('uses detected version from Godot, falls back to stable', async () => {
      const mock = createMockGodot();
      const ctx = createToolContext(mock);

      mock.godotVersion = '4.5.1';
      const withVersion = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        section: 'description',
      }, ctx);
      expect(withVersion).toContain('(auto-detected: 4.5)');

      mock.godotVersion = null;
      const noVersion = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        section: 'description',
      }, ctx);
      expect(noVersion).toContain('(auto-detected: stable)');
    });

    it('explicit version overrides auto-detected', async () => {
      const mock = createMockGodot();
      mock.godotVersion = '4.5.1';
      const ctx = createToolContext(mock);

      const result = await docs.execute({
        action: 'fetch_class',
        class_name: 'Node2D',
        version: '4.4',
        section: 'description',
      }, ctx);

      expect(result).not.toContain('auto-detected');
      expect(result).toContain('/en/4.4/');
    });
  });
});
