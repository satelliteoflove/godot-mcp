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
//    / create_alternative_tile once per tile). Entries from the same source
//    location are grouped into one, in order of first appearance, with a count,
//    the seq range, and the distinct messages, so the root cause stays near the
//    top instead of being buried under its echoes.
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
}

export interface CompactLogMessage extends LogMessage {
  /** The MCP command whose handler was on the stack when this was logged. */
  via?: string;
  /** How many captured entries this one stands for, when more than one. */
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

function stripAddonFrames(entry: LogMessage): CompactLogMessage {
  const frames = entry.frames ?? [];
  const kept = frames.filter((f) => !f.file.startsWith(ADDON_PREFIX));
  if (kept.length === frames.length) {
    return { ...entry };
  }
  const handler = frames.find((f) => f.file.startsWith(ADDON_COMMANDS_PREFIX));
  const compact: CompactLogMessage = { ...entry, frames: kept };
  if (handler) {
    compact.via = handler.function;
  }
  return compact;
}

function groupKey(entry: LogMessage): string {
  return [entry.file, entry.line, entry.function ?? '', entry.type, entry.error_type].join('\u0000');
}

export function compactLogMessages(messages: LogMessage[]): CompactLogMessage[] {
  const groups = new Map<string, { head: CompactLogMessage; messages: Set<string> }>();
  for (const entry of messages) {
    const key = groupKey(entry);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, { head: stripAddonFrames(entry), messages: new Set([entry.message]) });
      continue;
    }
    const { head } = existing;
    head.count = (head.count ?? 1) + 1;
    if (entry.seq !== undefined) {
      head.last_seq = entry.seq;
    }
    existing.messages.add(entry.message);
  }

  return [...groups.values()].map(({ head, messages: distinct }) => {
    const others = [...distinct].filter((m) => m !== head.message);
    if (others.length > 0) {
      head.other_messages = others.slice(0, MAX_OTHER_MESSAGES);
      if (others.length > MAX_OTHER_MESSAGES) {
        head.more_messages = others.length - MAX_OTHER_MESSAGES;
      }
    }
    return head;
  });
}
