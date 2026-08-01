const start = Date.now();
const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const model = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const prompt =
  process.env.OLLAMA_DIAGNOSTIC_PROMPT || "Responda apenas: funcionando";

function mark(event, details = {}) {
  console.log(
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        event,
        elapsedMs: Date.now() - start,
        ...details,
      },
      null,
      2,
    ),
  );
}

async function main() {
  const payload = {
    model,
    messages: [
      { role: "system", content: prompt },
      { role: "user", content: prompt },
    ],
    stream: true,
  };

  mark("ollama_fetch_started", {
    baseUrl,
    endpoint: `${baseUrl}/api/chat`,
    model,
  });

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });

  mark("ollama_headers_received", {
    statusCode: response.status,
    contentType: response.headers.get("content-type"),
  });

  if (!response.body) {
    throw new Error("missing response body");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buffer = "";
  let sawFirstChunk = false;
  let sawFirstToken = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    if (!sawFirstChunk) {
      sawFirstChunk = true;
      mark("first_chunk_received", { byteLength: value?.byteLength ?? 0 });
    } else {
      mark("chunk_received", { byteLength: value?.byteLength ?? 0 });
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const parsed = JSON.parse(trimmed);
      if (
        !sawFirstToken &&
        typeof parsed?.message?.content === "string" &&
        parsed.message.content
      ) {
        sawFirstToken = true;
        mark("first_token_received");
      }

      if (parsed.done) {
        mark("stream_done", { doneReason: parsed.done_reason ?? null });
      }
    }
  }

  if (buffer.trim()) {
    const parsed = JSON.parse(buffer);
    if (
      !sawFirstToken &&
      typeof parsed?.message?.content === "string" &&
      parsed.message.content
    ) {
      mark("first_token_received");
    }

    if (parsed.done) {
      mark("stream_done", { doneReason: parsed.done_reason ?? null });
    }
  }

  mark("stream_completed");
}

main().catch((error) => {
  mark("diagnostic_error", {
    errorName: error instanceof Error ? error.name : "UnknownError",
    message: error instanceof Error ? error.message : String(error),
  });
  process.exit(1);
});
