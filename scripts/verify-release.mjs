#!/usr/bin/env node
// Pacote 16.4 — verificação automatizada de release da Hanira.
// Orquestra os gates existentes sem adicionar dependências.
// Uso: npm run verify:release [-- --skip-build]
import { spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const npmCmd = isWindows ? "npm.cmd" : "npm";
const skipBuild = process.argv.includes("--skip-build");

function run(label, args) {
  console.log(`\n==> ${label}: npm ${args.join(" ")}`);
  const result = spawnSync(`${npmCmd} ${args.join(" ")}`, {
    stdio: "inherit",
    shell: true,
  });
  if (result.error || result.status !== 0) {
    console.error(`\n[verify:release] FALHOU em: ${label}`);
    process.exit(result.status ?? 1);
  }
}

function runGitDiffCheck() {
  console.log("\n==> git diff --check");
  const result = spawnSync("git", ["diff", "--check"], {
    stdio: "inherit",
    shell: isWindows,
  });
  if (result.status !== 0) {
    console.error("\n[verify:release] FALHOU em: git diff --check");
    process.exit(result.status ?? 1);
  }
}

run("typecheck", ["run", "typecheck"]);
run("lint", ["run", "lint"]);
run("test", ["test"]);
if (!skipBuild) run("build", ["run", "build"]);
runGitDiffCheck();

console.log("\n[verify:release] TODOS OS GATES PASSARAM.");
