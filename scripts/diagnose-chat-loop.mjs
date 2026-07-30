import fs from "node:fs";
import path from "node:path";
import { chromium } from "@playwright/test";

const baseURL = process.env.HANIRA_DIAG_BASE_URL ?? "http://localhost:3002";
const artifactsDir = path.join(
  process.cwd(),
  "artifacts",
  "chat-loop-diagnostics",
);
const storageStatePath = process.env.HANIRA_STORAGE_STATE_PATH;
const reportLines = [];
const consoleLines = [];
const errorLines = [];
const urlLines = [];
const networkEvents = [];
const requestCounts = new Map();
const navigationEvents = [];
const responseBuckets = [];
const domMarkers = [];
let rscResponses = 0;
let repeatedApiCalls = 0;
let pageErrors = 0;
let requestFailures = 0;

fs.mkdirSync(artifactsDir, { recursive: true });

function now() {
  return new Date().toISOString();
}

function appendLine(target, line) {
  target.push(`[${now()}] ${line}`);
}

function writeJson(file, data) {
  fs.writeFileSync(
    path.join(artifactsDir, file),
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

function summarizeRequests() {
  return [...requestCounts.entries()]
    .map(([key, entries]) => ({
      key,
      count: entries.length,
      firstSeen: entries[0],
      lastSeen: entries.at(-1),
    }))
    .sort((left, right) => right.count - left.count);
}

function markRequest(key) {
  const timestamp = Date.now();
  const entries = requestCounts.get(key) ?? [];
  entries.push(timestamp);
  const recent = entries.filter((value) => timestamp - value <= 10_000);
  requestCounts.set(key, recent);
  if (recent.length > 10 && key.includes("/api/conversations")) {
    repeatedApiCalls += 1;
  }
  return recent.length;
}

function detectLoopSignals() {
  const nowMs = Date.now();
  const recentNavigations = navigationEvents.filter(
    (value) => nowMs - value.at <= 10_000,
  );
  const recentRsc = responseBuckets.filter(
    (value) => nowMs - value.at <= 10_000 && value.kind === "rsc",
  ).length;
  const noisyRequest = summarizeRequests().find((entry) => entry.count > 15);
  const alternating =
    recentNavigations.length >= 4 &&
    recentNavigations
      .slice(-4)
      .map((entry) => entry.url)
      .filter(Boolean)
      .join(" -> ");

  return {
    tooManyNavigations: recentNavigations.length > 10,
    tooManyRscResponses: recentRsc > 20,
    noisyRequest: noisyRequest?.count > 15 ? noisyRequest : null,
    alternatingUrls:
      alternating &&
      new Set(recentNavigations.slice(-4).map((entry) => entry.url)).size === 2
        ? alternating
        : null,
    repeatedApiCalls: repeatedApiCalls > 10,
  };
}

async function stableWait(page, label) {
  try {
    await page.waitForLoadState("networkidle", { timeout: 5_000 });
    appendLine(urlLines, `${label}: networkidle atingido em ${page.url()}`);
    return true;
  } catch {
    appendLine(urlLines, `${label}: networkidle NAO atingido em ${page.url()}`);
    return false;
  }
}

async function screenshot(page, file) {
  await page.screenshot({
    path: path.join(artifactsDir, file),
    fullPage: true,
  });
}

async function clickAndObserve(page, label, action) {
  appendLine(reportLines, `## Acao: ${label}`);
  appendLine(urlLines, `ANTES ${label}: ${page.url()}`);
  await screenshot(page, `${label}-before.png`);
  const beforeRequests = networkEvents.length;
  await action();
  await screenshot(page, `${label}-after-click.png`);
  await page.waitForTimeout(2_000);
  await screenshot(page, `${label}-after-2s.png`);
  await page.waitForTimeout(3_000);
  await screenshot(page, `${label}-after-5s.png`);
  appendLine(urlLines, `DEPOIS ${label}: ${page.url()}`);

  const loop = detectLoopSignals();
  const afterRequests = networkEvents.length;
  appendLine(
    reportLines,
    `- URL final: ${page.url()} | novas requests: ${afterRequests - beforeRequests}`,
  );
  appendLine(
    reportLines,
    `- Loop: nav>${loop.tooManyNavigations} rsc>${loop.tooManyRscResponses} alternating=${loop.alternatingUrls ?? "nao"} repeatedApi=${loop.repeatedApiCalls}`,
  );
  if (loop.noisyRequest) {
    appendLine(
      reportLines,
      `- Request repetida: ${loop.noisyRequest.key} x${loop.noisyRequest.count}`,
    );
  }
}

async function authenticate(page) {
  await page.goto(`${baseURL}/chat`, { waitUntil: "domcontentloaded" });
  await stableWait(page, "chat-ou-login");

  if (page.url().includes("/chat")) return;

  await page.goto(`${baseURL}/login`, { waitUntil: "domcontentloaded" });
  await stableWait(page, "login");

  if (page.url().includes("/chat")) return;

  const email = process.env.HANIRA_TEST_EMAIL;
  const password = process.env.HANIRA_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error(
      "Nao foi possivel autenticar automaticamente: sem storageState e sem HANIRA_TEST_EMAIL/HANIRA_TEST_PASSWORD.",
    );
  }

  await page.getByLabel("E-mail").fill(email);
  await page.getByLabel("Senha").fill(password);
  await page.getByRole("button", { name: "Entrar" }).click();
  await page.waitForURL(/\/chat/, { timeout: 15_000 });
}

async function main() {
  const launchOptions = storageStatePath
    ? { storageState: storageStatePath }
    : undefined;
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    ...launchOptions,
  });
  const page = await context.newPage();

  await page.addInitScript(() => {
    window.addEventListener("error", (event) => {
      console.error("[window.error]", event.message);
    });
    window.addEventListener("unhandledrejection", (event) => {
      console.error("[unhandledrejection]", String(event.reason));
    });
  });

  page.on("console", (message) => {
    appendLine(
      consoleLines,
      `${message.type().toUpperCase()} ${message.text()}`,
    );
  });
  page.on("pageerror", (error) => {
    pageErrors += 1;
    appendLine(errorLines, `PAGEERROR ${error.stack ?? error.message}`);
  });
  page.on("requestfailed", (request) => {
    requestFailures += 1;
    appendLine(
      errorLines,
      `REQUESTFAILED ${request.method()} ${request.url()} :: ${request.failure()?.errorText ?? "unknown"}`,
    );
  });
  page.on("framenavigated", (frame) => {
    if (frame !== page.mainFrame()) return;
    navigationEvents.push({ at: Date.now(), url: frame.url() });
    appendLine(urlLines, `NAV ${frame.url()}`);
  });
  page.on("response", async (response) => {
    const url = response.url();
    const status = response.status();
    const request = response.request();
    const kind = url.includes("_rsc=") ? "rsc" : "http";
    if (kind === "rsc") rscResponses += 1;
    responseBuckets.push({ at: Date.now(), url, status, kind });
    const count = markRequest(`${request.method()} ${url}`);
    const entry = {
      at: now(),
      url,
      status,
      method: request.method(),
      kind,
      countInWindow: count,
      redirectedFrom: request.redirectedFrom()?.url() ?? null,
    };
    networkEvents.push(entry);
    if (status >= 400) {
      appendLine(errorLines, `HTTP ${status} ${request.method()} ${url}`);
    }
  });

  try {
    await authenticate(page);
  } catch (error) {
    appendLine(errorLines, `AUTH ${error instanceof Error ? error.message : String(error)}`);
    await browser.close();
    throw error;
  }

  await page.waitForURL(/\/chat/, { timeout: 15_000 });
  await stableWait(page, "chat-inicial");
  appendLine(reportLines, `URL inicial: ${page.url()}`);

  const chatShellVisible = await page
    .locator('text=Converse com Hanira...')
    .or(page.locator("text=O que vamos descobrir hoje?"))
    .first()
    .isVisible()
    .catch(() => false);
  domMarkers.push({ at: now(), marker: "chat-shell", visible: chatShellVisible });

  await clickAndObserve(page, "nova-conversa", async () => {
    await page.getByRole("button", { name: "Nova conversa" }).click();
  });
  await clickAndObserve(page, "explorar-uma-ideia", async () => {
    await page.getByRole("button", { name: "Explorar uma ideia" }).click();
  });
  await clickAndObserve(page, "criar-algo", async () => {
    await page.getByRole("button", { name: "Criar algo" }).click();
  });
  await clickAndObserve(page, "pensar-com-clareza", async () => {
    await page.getByRole("button", { name: "Pensar com clareza" }).click();
  });
  await clickAndObserve(page, "campo-mensagem", async () => {
    await page.getByLabel("Mensagem para Hanira").click();
  });

  const summary = summarizeRequests();
  const loop = detectLoopSignals();
  appendLine(reportLines, "## Resumo");
  appendLine(reportLines, `- Page errors: ${pageErrors}`);
  appendLine(reportLines, `- Request failures: ${requestFailures}`);
  appendLine(reportLines, `- Responses RSC: ${rscResponses}`);
  appendLine(reportLines, `- Requests repetidas API: ${repeatedApiCalls}`);
  appendLine(reportLines, `- Loop detectado: ${JSON.stringify(loop)}`);

  fs.writeFileSync(path.join(artifactsDir, "console.log"), consoleLines.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "errors.log"), errorLines.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "urls.log"), urlLines.join("\n"));
  fs.writeFileSync(path.join(artifactsDir, "report.md"), reportLines.join("\n"));
  writeJson("network.json", networkEvents);
  writeJson("requests-summary.json", summary);
  writeJson("dom-markers.json", domMarkers);

  await browser.close();
}

main().catch((error) => {
  appendLine(errorLines, `FATAL ${error instanceof Error ? error.stack ?? error.message : String(error)}`);
  fs.writeFileSync(path.join(artifactsDir, "errors.log"), errorLines.join("\n"));
  process.exitCode = 1;
});
