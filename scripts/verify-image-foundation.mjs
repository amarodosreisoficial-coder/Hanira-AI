// verify:image-foundation (Pacote 16.7).
//
// Verifica invariantes arquiteturais da fundacao de imagem SEM rede:
// - apenas provider mock;
// - sem chaves de provider real;
// - sem caminho pago automatico;
// - provider/model separados;
// - filtragem por capacidade;
// - custo mock zero;
// - sem SDK externo de imagem;
// - sem requisito de rede.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const packageJsonPath = path.join(root, "package.json");

let failures = 0;
const log = (ok, message) => {
  const tag = ok ? "OK" : "FAIL";
  console.log(`${tag} ${message}`);
  if (!ok) failures++;
};

const readJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const readPackageJson = () => readJson(packageJsonPath);
const safeReadFile = (p) => {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return "";
  }
};

// 1. Script registrado no package.json.
{
  const pkg = readPackageJson();
  const scripts = pkg.scripts ?? {};
  const hasScript = Object.keys(scripts).includes("verify:image-foundation");
  log(hasScript, "verify:image-foundation registrado no package.json.");
}

// 2. Apenas providers explicitamente auditados existem em lib/ai/image.
{
  const imageDir = path.join(root, "lib", "ai", "image");
  const files = fs.readdirSync(imageDir).filter((f) => f.endsWith(".ts"));
  const forbidden = ["runware", "openai", "gemini", "qwen", "seedream"];
  const onlyAudited = files.every((f) => !forbidden.some((name) => f.toLowerCase().includes(name)));
  log(onlyAudited, "Somente providers de imagem auditados presentes.");
}

// 3. Sem chaves reais de provider de imagem no codebase.
{
  const forbiddenPatterns = [
    /NEXT_PUBLIC_CLOUDFLARE_AI_API_TOKEN/,
    /NEXT_PUBLIC_RUNWARE_API_KEY/,
    /NEXT_PUBLIC_OPENAI_API_KEY/,
    /NEXT_PUBLIC_GEMINI_API_KEY/,
  ];
  const libDir = path.join(root, "lib");
  let found = false;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".ts") || entry.name.endsWith(".mjs")) {
        const content = safeReadFile(full);
        if (forbiddenPatterns.some((re) => re.test(content))) {
          found = true;
        }
      }
    }
  };
  walk(libDir);
  log(!found, "Sem chaves reais de provider de imagem expostas.");
}

// 4. Sem SDK externo de imagem no package.json.
{
  const pkg = readPackageJson();
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  // "openai" ja existe para texto (chat) e nao e SDK de imagem.
  const imageSdks = ["cloudflare", "runware", "google-genai"];
  const found = imageSdks.filter((s) => Object.keys(deps).some((d) => d.toLowerCase().includes(s)));
  log(found.length === 0, "Sem SDK externo de imagem nas dependencias.");
}

// 5. MOCK custo zero.
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "mock-provider.ts"));
  const zeroCost = /estimatedCost:\s*0/.test(content) && /actualCost:\s*0/.test(content);
  log(zeroCost, "MOCK custo zero (estimatedCost=0, actualCost=0).");
}

// 6. MOCK requer nenhuma chave de API.
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "mock-provider.ts"));
  const noKey = !/API_TOKEN|API_KEY|BEARER/i.test(content) || /NUNCA|SEM segredos/i.test(content);
  log(noKey, "MOCK nao requer chave de API.");
}

// 7. Provider e modelo separados no catalogo.
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "model-catalog.ts"));
  const separated = /providerId:.*IMAGE_MOCK_PROVIDER_ID/.test(content) && /id:.*IMAGE_MOCK_MODEL_ID/.test(content);
  log(separated, "Provider e modelo separados no catalogo de imagem.");
}

// 8. Sem caminho pago automatico (ZERO-COST reutilizado).
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "cost-policy.ts"));
  const zeroCost = /ZERO_COST_ROUTER_POLICY|evaluateRouterCostPolicy/.test(content);
  log(zeroCost, "ZERO-COST reutilizado para imagem (sem caminho pago automatico).");
}

// 9. Filtragem por capacidade presente no roteador.
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "capability-router.ts"));
  const filtering = /deriveRequiredCapabilities|capability_not_supported/.test(content);
  log(filtering, "Filtragem por capacidade presente no roteador de imagem.");
}

// 10. Sem requisito de rede (mock).
{
  const content = safeReadFile(path.join(root, "lib", "ai", "image", "mock-provider.ts"));
  const noNetwork = !/fetch\(|http[s]?:\/\//.test(content);
  log(noNetwork, "MOCK sem chamadas de rede.");
}

console.log("");
if (failures > 0) {
  console.log(`verify:image-foundation: ${failures} falha(s).`);
  process.exit(1);
}
console.log("verify:image-foundation concluido sem erros.");
