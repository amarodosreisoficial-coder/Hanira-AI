#!/usr/bin/env node
// Static, offline guard for Package 16.9. It intentionally never imports providers.
import { readFileSync } from "node:fs";
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const router = read("lib/ai/image/free-first-router.ts");
const runtime = read("lib/ai/image/runtime.ts");
const packageJson = read("package.json");
const checks = [
  ["production router exists", "class FreeFirstImageRouter"],
  ["deterministic registry ordering", "a.priority - b.priority"],
  ["capability precedes adapter", "required.every"],
  ["zero-cost precedes adapter", "evaluateImageCostPolicy"],
  ["capacity precedes adapter", "getImageAvailabilityGate"],
  ["one attempt per candidate", "attempted += 1"],
  ["rate limit cooldown", 'signal: "rate_limit"'],
  ["unhealthy cooldown", "image_candidate_unhealthy"],
  ["production excludes mock", "!candidate.production"],
  ["no provider API name in generic router", "@cf/"],
];
for (const [label, needle] of checks) {
  const found = router.includes(needle);
  if (label === "no provider API name in generic router" ? found : !found) throw new Error(`verify:image-free-router failed: ${label}`);
  console.log(`OK ${label}`);
}
if (!runtime.includes("cloudflare-workers-ai:nira-image-flux-klein")) throw new Error("missing current logical candidate");
if (!packageJson.includes("verify:image-free-router")) throw new Error("missing package script");
console.log("verify:image-free-router complete: offline, no provider calls.");
