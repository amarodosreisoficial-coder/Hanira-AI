import { loadEnvConfig } from "@next/env";
import { defineConfig, devices } from "@playwright/test";

loadEnvConfig(process.cwd());

const hasRealCredentials = Boolean(
  process.env.HANIRA_TEST_EMAIL && process.env.HANIRA_TEST_PASSWORD,
);
const target =
  process.env.HANIRA_E2E_TARGET ??
  (hasRealCredentials ? "chat-real" : "chat-demo");

const targets = {
  "chat-demo": {
    name: "chat-demo",
    port: 3050,
    demoMode: true,
    sessionKind: "demo",
    entryUrl: "/chat",
  },
  "chat-real": {
    name: "chat-real",
    port: 3051,
    demoMode: false,
    sessionKind: "real",
    entryUrl: "/login",
  },
} as const;

const selectedTarget = targets[target as keyof typeof targets] ?? targets["chat-demo"];
const baseURL = `http://localhost:${selectedTarget.port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 90_000,
  fullyParallel: false,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    baseURL,
    headless: true,
    viewport: { width: 1440, height: 900 },
  },
  projects: [
    {
      name: "chat-demo",
      metadata: { sessionKind: "demo" },
      use: {
        baseURL: "http://localhost:3050",
      },
    },
    {
      name: "chat-real",
      metadata: { sessionKind: "real" },
      use: {
        baseURL: "http://localhost:3051",
      },
    },
  ],
  webServer: {
    command: `npx.cmd next dev --webpack --port ${selectedTarget.port}`,
    url: `${baseURL}${selectedTarget.entryUrl}`,
    timeout: 120_000,
    reuseExistingServer: true,
    env: {
      ...process.env,
      HANIRA_DEMO_MODE: selectedTarget.demoMode ? "true" : "false",
      NEXT_PUBLIC_APP_URL: baseURL,
    },
  },
});
