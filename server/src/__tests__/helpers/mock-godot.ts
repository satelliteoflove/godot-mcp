import { vi } from 'vitest';
import type { GodotConnection } from '../../connection/websocket.js';

export interface CommandCall {
  command: string;
  params: Record<string, unknown>;
  opts?: { timeoutMs?: number };
}

export interface MockGodotConnection {
  sendCommand: ReturnType<typeof vi.fn>;
  calls: CommandCall[];
  mockResponse: (response: unknown) => void;
  mockError: (error: Error) => void;
  godotVersion: string | null;
}

export function createMockGodot(): MockGodotConnection {
  const calls: CommandCall[] = [];
  let nextResponse: unknown = {};
  let nextError: Error | null = null;

  const sendCommand = vi.fn(async (command: string, params: Record<string, unknown> = {}, opts?: { timeoutMs?: number }) => {
    calls.push({ command, params, opts });
    if (nextError) {
      const err = nextError;
      nextError = null;
      throw err;
    }
    const response = nextResponse;
    nextResponse = {};
    return response;
  });

  return {
    sendCommand,
    calls,
    mockResponse: (response: unknown) => {
      nextResponse = response;
    },
    mockError: (error: Error) => {
      nextError = error;
    },
    godotVersion: null,
  };
}

export function createToolContext(mock: MockGodotConnection) {
  return {
    godot: {
      sendCommand: mock.sendCommand,
      get godotVersion() {
        return mock.godotVersion;
      },
    } as unknown as GodotConnection,
  };
}

// Extract the structured payload from a tool result. Query actions return a
// StructuredToolResult ({ text, structuredContent }); this returns the
// structuredContent. Falls back to parsing a plain JSON-string result.
export function structuredOf(result: unknown): any {
  if (
    result &&
    typeof result === 'object' &&
    'structuredContent' in result
  ) {
    return (result as { structuredContent: unknown }).structuredContent;
  }
  return JSON.parse(result as string);
}
