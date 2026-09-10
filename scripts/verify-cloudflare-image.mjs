import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const provider = read("lib/ai/image/cloudflare-workers-ai-provider.ts");
const pkg = JSON.parse(read("package.json"));
let failures = 0;
function check(condition, message) { console.log(`${condition ? "OK" : "FAIL"} ${message}`); if (!condition) failures++; }

check(provider.includes("@cf/black-forest-labs/flux-2-klein-4b"), "Modelo Cloudflare esperado presente.");
check(provider.includes("CLOUDFLARE_AI_ACCOUNT_ID") && provider.includes("CLOUDFLARE_AI_API_TOKEN"), "Variaveis server-side presentes.");
check(!provider.includes("NEXT_PUBLIC_CLOUDFLARE"), "Nenhuma variavel Cloudflare publica.");
check(/fetchFn|fetch/.test(provider) && !/cloudflare.*sdk/i.test(JSON.stringify(pkg.dependencies)), "Adapter usa fetch nativo, sem SDK.");
check(provider.includes("AbortController") && provider.includes("CLOUDFLARE_IMAGE_TIMEOUT_MS"), "Timeout controlado presente.");
check(provider.includes("refs.length >") && provider.includes("MAX_REFERENCE_BYTES"), "Limites de referencias presentes.");
check(!/https?:\/\//.test(provider.replace(/https:\/\/api\.cloudflare\.com/g, "")), "Nenhum fetch de URL de referencia.");
check(!provider.includes("console.") && !provider.includes("logger"), "Adapter nao registra prompt, binario ou segredos.");
check(provider.includes('costClass: "free"') && !provider.includes("paid fallback"), "Politica free-first sem fallback pago.");
check(pkg.scripts["test:nira:image:live"].includes("HANIRA_LIVE_IMAGE_SMOKE"), "Smoke real explicitamente gated.");
if (failures) process.exit(1);
console.log("verify:cloudflare-image concluido sem erros.");
