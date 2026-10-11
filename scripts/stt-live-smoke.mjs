import { readFile, lstat } from "node:fs/promises";
import { pathToFileURL } from "node:url";

const MODEL = "@cf/openai/whisper-large-v3-turbo";
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const NEURONS_PER_AUDIO_MINUTE = 46.63; // Cloudflare pricing snapshot: 2026-10-11.
const AUTHORIZATION = "AUTORIZO SMOKE STT CLOUDFLARE";

export function assessLiveSttGate(env, { execute = false, authorization = "" } = {}) {
  const checks = {
    execute,
    liveEnabled: env.HANIRA_STT_LIVE_ENABLED === "true",
    sttEnabled: env.HANIRA_STT_ENABLED === "true",
    costFree: env.HANIRA_STT_COST_CLASS === "FREE",
    accountVerifiedFree: env.HANIRA_STT_ACCOUNT_VERIFIED_FREE === "true",
    credentials: Boolean(env.CLOUDFLARE_AI_ACCOUNT_ID?.trim() && env.CLOUDFLARE_AI_API_TOKEN?.trim()),
    authorized: authorization === AUTHORIZATION,
  };
  return { ready: Object.values(checks).every(Boolean), checks };
}

function parseArgs(args) {
  const parsed = { execute: false, file: "", durationSeconds: NaN, authorization: "" };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--execute") parsed.execute = true;
    else if (arg === "--file") parsed.file = args[++index] ?? "";
    else if (arg === "--duration-seconds") parsed.durationSeconds = Number(args[++index]);
    else if (arg === "--authorization") parsed.authorization = args[++index] ?? "";
    else throw new Error("UNKNOWN_ARGUMENT");
  }
  return parsed;
}

async function measureWebmSeconds(audio) {
  const { chromium } = await import("@playwright/test");
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    return await page.evaluate(async (encoded) => {
      const binary = atob(encoded);
      const bytes = new Uint8Array(binary.length);
      for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
      const context = new AudioContext();
      try {
        const decoded = await context.decodeAudioData(bytes.buffer);
        return decoded.duration;
      } finally {
        await context.close();
      }
    }, audio.toString("base64"));
  } finally {
    await browser.close();
  }
}

export async function runLiveSttSmoke({
  env = process.env,
  args = [],
  fetchFn = fetch,
  readAudio = readFile,
  fileStat = lstat,
  measureDuration = measureWebmSeconds,
} = {}) {
  let options;
  try {
    options = parseArgs(args);
  } catch {
    return { status: "BLOCKED", reason: "INVALID_ARGUMENTS", providerCalls: 0 };
  }
  if (!options.execute || env.HANIRA_STT_LIVE_ENABLED !== "true") {
    return { status: "LIVE STT SMOKE DISABLED", providerCalls: 0 };
  }

  const gate = assessLiveSttGate(env, options);
  if (!gate.ready) {
    return {
      status: "BLOCKED",
      reason: "LIVE_GATE_CLOSED",
      failedChecks: Object.entries(gate.checks).filter(([, passed]) => !passed).map(([name]) => name),
      providerCalls: 0,
    };
  }
  if (!options.file || !Number.isFinite(options.durationSeconds) ||
      options.durationSeconds < 3 || options.durationSeconds > 10) {
    return { status: "BLOCKED", reason: "INVALID_AUDIO_DURATION_OR_PATH", providerCalls: 0 };
  }
  if (!options.file.toLowerCase().endsWith(".webm")) {
    return { status: "BLOCKED", reason: "UNSUPPORTED_AUDIO_FORMAT", providerCalls: 0 };
  }

  let audio;
  try {
    const stat = await fileStat(options.file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.size === 0 || stat.size > MAX_AUDIO_BYTES) {
      return { status: "BLOCKED", reason: "INVALID_AUDIO_FILE", providerCalls: 0 };
    }
    audio = await readAudio(options.file);
  } catch {
    return { status: "BLOCKED", reason: "AUDIO_UNAVAILABLE", providerCalls: 0 };
  }
  if (audio.length > MAX_AUDIO_BYTES || audio.length < 4 ||
      !audio.subarray(0, 4).equals(Buffer.from([0x1a, 0x45, 0xdf, 0xa3]))) {
    return { status: "BLOCKED", reason: "INVALID_WEBM_SIGNATURE", providerCalls: 0 };
  }
  let measuredSeconds;
  try {
    measuredSeconds = await measureDuration(audio);
  } catch {
    return { status: "BLOCKED", reason: "AUDIO_DURATION_UNVERIFIED", providerCalls: 0 };
  }
  if (!Number.isFinite(measuredSeconds) || measuredSeconds < 3 || measuredSeconds > 10 ||
      Math.abs(measuredSeconds - options.durationSeconds) > 0.5) {
    return { status: "BLOCKED", reason: "AUDIO_DURATION_OUT_OF_RANGE", providerCalls: 0 };
  }

  const accountId = env.CLOUDFLARE_AI_ACCOUNT_ID.trim();
  const token = env.CLOUDFLARE_AI_API_TOKEN.trim();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);
  const startedAt = performance.now();
  let providerCalls = 0;
  try {
    providerCalls = 1;
    const response = await fetchFn(
      `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/ai/run/${MODEL}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ audio: audio.toString("base64"), task: "transcribe", language: "pt" }),
        signal: controller.signal,
      },
    );
    const latencyMs = Math.round(performance.now() - startedAt);
    const body = await response.json().catch(() => null);
    const text = typeof body?.result?.text === "string" ? body.result.text.trim() : "";
    const neuronUsage = Number(body?.result?.usage?.neurons ?? body?.usage?.neurons);
    return {
      status: response.ok && body?.success === true && text ? "PASS" : "FAIL",
      httpStatus: response.status,
      latencyMs,
      durationSeconds: Number(measuredSeconds.toFixed(2)),
      estimatedNeurons: Number((measuredSeconds * NEURONS_PER_AUDIO_MINUTE / 60).toFixed(2)),
      neuronUsage: Number.isFinite(neuronUsage) && neuronUsage > 0 ? neuronUsage : null,
      transcriptionPresent: Boolean(text),
      transcriptionMatchesSample: text.toLocaleLowerCase("pt-BR").includes("teste de voz da hanira"),
      providerCalls,
      retry: 0,
    };
  } catch {
    return {
      status: "FAIL",
      reason: controller.signal.aborted ? "TIMEOUT" : "NETWORK_ERROR",
      latencyMs: Math.round(performance.now() - startedAt),
      providerCalls,
      retry: 0,
    };
  } finally {
    clearTimeout(timer);
    audio.fill(0);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await runLiveSttSmoke({ args: process.argv.slice(2) });
  if (result.status === "LIVE STT SMOKE DISABLED") {
    console.log("LIVE STT SMOKE DISABLED");
    console.log("PROVIDER CALLS = 0");
  } else {
    console.log(JSON.stringify(result));
  }
  if (result.status === "FAIL" || result.status === "BLOCKED") process.exitCode = 1;
}
