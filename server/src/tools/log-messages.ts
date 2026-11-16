// Compaction for godot_editor_read get_log_messages (#315).
//
// Two things made log reads expensive without telling the agent anything:
//
//  - Every entry raised during an MCP command carries the addon's own call chain
//    (command handler -> command_router -> plugin -> websocket_server x3). That is
//    the same six frames on every entry and says nothing about the project. They
//    are dropped; the command that triggered the error survives as `via`.
//  - One root cause often fans out into a repeating run of downstream engine
//    errors (a missing tileset texture produces create_tile / has_alternative_tile
//    / create_alternative_tile once per tile). Entries raised at the same place
//    from the same call site are grouped into one, in order of first appearance,
//    with a count, the seq range, and the distinct messages, so the root cause
//    stays near the top instead of being buried under its echoes.
//
// "Same call site" matters for engine errors: their file/line is a C++ location
// like node.cpp get_node, shared by every script that hits it. The first project
// frame and `via` are part of the group key so those stay separate.
//
// Frames from project scripts are kept as-is. `raw: true` on the action skips
// all of this.

export interface LogFrame {
  file: string;
  line: number;
  function: string;
}

export interface LogMessage {
  seq?: number;
  timestamp: number;
  type: string;
  message: string;
  file: string;
  line: number;
  function?: string;
  error_type: number; // 0=error, 1=warning (push_warning), 2=script, 3=shader
  frames: LogFrame[];
  /** Back-to-back identical repeats the addon folded into this entry (4.2.1+ addons). */
  repeats?: number;
}

export interface CompactLogMessage extends LogMessage {
  /** The MCP command whose handler was on the stack when this was logged. */
  via?: string;
  /** How many times this was logged, when more than once (includes folded repeats). */
  count?: number;
  /** seq of the last entry in the group, when more than one. */
  last_seq?: number;
  /** Distinct messages beyond `message` in this group, in order of first appearance. */
  other_messages?: string[];
  /** Distinct messages left out of other_messages because of the cap. */
  more_messages?: number;
}

const ADDON_PREFIX = 'res://addons/godot_mcp/';
const ADDON_COMMANDS_PREFIX = 'res://addons/godot_mcp/commands/';
export const MAX_OTHER_MESSAGES = 10;

export function stripAddonFrames<T extends { frames?: LogFrame[] }>(entry: T): T & { via?: string } {
  const frames = entry.frames ?? [];
  const kept = frames.filter((f) => !f.file.startsWith(ADDON_PREFIX));
  if (kept.length === frames.length) {
    return { ...entry };
  }
  const handler = frames.find((f) => f.file.startsWith(ADDON_COMMANDS_PREFIX));
  const compact: T & { via?: string } = { ...entry, frames: kept };
  if (handler) {
    compact.via = handler.function;
  }
  return compact;
}

function groupKey(entry: CompactLogMessage): string {
  const site = entry.frames[0];
  return [
    entry.file, entry.line, entry.function ?? '', entry.type, entry.error_type,
    site ? `${site.file}:${site.line}:${site.function}` : '', entry.via ?? '',
  ].join('\u0000');
}

interface Group {
  head: CompactLogMessage;
  occurrences: number;
  entries: number;
  messages: Set<string>;
}

function groupLogMessages(messages: LogMessage[]): Group[] {
  const groups = new Map<string, Group>();
  for (const entry of messages) {
    const compact: CompactLogMessage = stripAddonFrames(entry);
    const occurrences = 1 + (entry.repeats ?? 0);
    const key = groupKey(compact);
    const existing = groups.get(key);
    if (!existing) {
      delete compact.repeats;
      groups.set(key, { head: compact, occurrences, entries: 1, messages: new Set([entry.message]) });
      continue;
    }
    existing.occurrences += occurrences;
    existing.entries += 1;
    if (entry.seq !== undefined) {
      existing.head.last_seq = entry.seq;
    }
    existing.messages.add(entry.message);
  }

  for (const { head, occurrences, messages: distinct } of groups.values()) {
    if (occurrences > 1) {
      head.count = occurrences;
    }
    const others = [...distinct].filter((m) => m !== head.message);
    if (others.length > 0) {
      head.other_messages = others.slice(0, MAX_OTHER_MESSAGES);
      if (others.length > MAX_OTHER_MESSAGES) {
        head.more_messages = others.length - MAX_OTHER_MESSAGES;
      }
    }
  }
  return [...groups.values()];
}

export function compactLogMessages(messages: LogMessage[]): CompactLogMessage[] {
  return groupLogMessages(messages).map((g) => g.head);
}

/**
 * Group a full get_log_messages response and apply `limit` to the groups, keeping
 * the most recent ones (by first appearance) like the addon does for entries.
 * The caller fetches every matching entry (the addon keeps at most 100), so a
 * long run of echoes can't push the root cause out of the window before grouping.
 * `returned_count` becomes the number of captured entries behind the groups that
 * were kept; `omitted_groups` says how many older groups the limit left out.
 */
export function compactLogResponse<R extends { returned_count: number; messages: LogMessage[] }>(
  result: R,
  limit: number
): Omit<R, 'messages'> & {
  returned_count: number;
  group_count: number;
  omitted_groups?: number;
  messages: CompactLogMessage[];
} {
  const groups = groupLogMessages(result.messages);
  const kept = limit > 0 && groups.length > limit ? groups.slice(groups.length - limit) : groups;
  const shaped = {
    ...result,
    returned_count: kept.reduce((n, g) => n + g.entries, 0),
    group_count: kept.length,
    messages: kept.map((g) => g.head),
  };
  return kept.length < groups.length ? { ...shaped, omitted_groups: groups.length - kept.length } : shaped;
}
