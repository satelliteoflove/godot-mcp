// Shared shape + advisory formatting for the project.godot staleness signal the
// editor addon attaches when project.godot was edited on disk after the editor
// loaded it, leaving its in-memory ProjectSettings / InputMap stale (#245). The
// addon owns the human-readable `summary` (single source of truth for the
// wording); the server just surfaces it. The field is optional everywhere:
// absent / not-stale is treated as "no advisory", which is also what an older
// addon that never sends it produces — so this is version-skew safe.

export interface ProjectStaleness {
  stale: boolean;
  summary?: string;
  autoload?: { added: string[]; removed: string[]; changed: string[] };
  input?: { added: string[] };
  note?: string;
}

const FALLBACK =
  'project.godot was edited on disk after the editor loaded it; the editor may be showing ' +
  'stale autoloads / input map. Run godot_editor_edit restart to reload.';

// A one-line advisory to surface alongside a tool result, or null when not stale.
export function staleAdvisory(staleness?: ProjectStaleness): string | null {
  if (!staleness?.stale) return null;
  return `STALE PROJECT SETTINGS: ${staleness.summary ?? FALLBACK}`;
}
