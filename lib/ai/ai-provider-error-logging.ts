export function summarizeErrorStack(error: unknown, maxLines = 5) {
  if (!(error instanceof Error) || typeof error.stack !== "string") {
    return undefined;
  }

  return error.stack
    .split("\n")
    .slice(0, maxLines)
    .map((line) => line.trim())
    .join(" | ");
}

export function logAIProviderErrorThrown(details: {
  sourceFile: string;
  sourceLine: number;
  reason: string;
  requestId?: string;
}) {
  console.error(
    JSON.stringify({
      timestamp: new Date().toISOString(),
      event: "ai_provider_error_thrown",
      sourceFile: details.sourceFile,
      sourceLine: details.sourceLine,
      reason: details.reason,
      requestId: details.requestId ?? "unknown",
    }),
  );
}
