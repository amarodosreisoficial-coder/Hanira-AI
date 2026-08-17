export interface ToolExecutionContext {
  requestId: string;
  signal: AbortSignal;
}

export interface ToolError {
  code:
    | "aborted"
    | "ambiguous_location"
    | "invalid_response"
    | "missing_location"
    | "not_found"
    | "timeout"
    | "unavailable";
  message: string;
}

export interface ToolResult<T> {
  ok: boolean;
  tool: string;
  source: string;
  durationMs: number;
  data?: T;
  error?: ToolError;
}
