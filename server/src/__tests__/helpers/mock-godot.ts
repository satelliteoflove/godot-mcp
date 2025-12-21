import { vi } from 'vitest';
import type { GodotConnection } from '../../connection/websocket.js';

export interface CommandCall {
  command: string;
  params: Record<string, unknown>;
}

export interface MockGodotConnection {
  sendCommand: ReturnType<typeof vi.fn>;
  calls: CommandCall[];
  mockResponse: (response: unknown) => void;
  mockError: (error: Error) => void;
}

export function createMockGodot(): MockGodotConnection {
  const calls: CommandCall[] = [];
  let nextResponse: unknown = {};
  let nextError: Error | null = null;

  const sendCommand = vi.fn(async (command: string, params: Record<string, unknown> = {}) => {
    calls.push({ command, params });
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
  };
}

export function createToolContext(mock: MockGodotConnection) {
  return {
    godot: { sendCommand: mock.sendCommand } as unknown as GodotConnection,
  };
}
