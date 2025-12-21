export class GodotConnectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'GodotConnectionError';
  }
}

export class GodotCommandError extends Error {
  public readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'GodotCommandError';
    this.code = code;
  }
}

export class GodotTimeoutError extends Error {
  constructor(command: string, timeoutMs: number) {
    super(`Command '${command}' timed out after ${timeoutMs}ms`);
    this.name = 'GodotTimeoutError';
  }
}

export interface ErrorResponse {
  code: string;
  message: string;
}

export function formatError(error: unknown): string {
  if (error instanceof GodotCommandError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
