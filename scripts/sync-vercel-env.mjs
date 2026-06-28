#!/usr/bin/env node
/**
 * Sincroniza variáveis do .env local para o projeto Vercel.
 * Uso: npm run sync:vercel-env
 * Requer: npx vercel login + npx vercel link (uma vez)
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const ENV_FILE = resolve(ROOT, ".env");

const VERCEL_KEYS = [
  "VITE_SUPABASE_URL",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "ADMIN_SETUP_SECRET",
];

const ENVIRONMENTS = ["production", "preview", "development"];

function parseEnvFile(path) {
  if (!existsSync(path)) {
    console.error(`Arquivo não encontrado: ${path}`);
    process.exit(1);
  }

  const values = new Map();
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed
      .slice(idx + 1)
      .trim()
      .replace(/^["']|["']$/g, "");
    values.set(key, value);
  }
  return values;
}

function runVercel(args, input) {
  const result = spawnSync("npx", ["--yes", "vercel@54.18.1", ...args], {
    cwd: ROOT,
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    shell: process.platform === "win32",
  });

  if (result.status !== 0) {
    const err = (result.stderr || result.stdout || "").trim();
    throw new Error(err || `vercel ${args.join(" ")} falhou`);
  }

  return (result.stdout || "").trim();
}

function upsertEnv(key, value, environment) {
  try {
    runVercel(["env", "rm", key, environment, "--yes"], "");
  } catch {
    // variável pode não existir ainda
  }

  runVercel(["env", "add", key, environment, "--force"], value);
  console.log(`  ✓ ${key} → ${environment}`);
}

function main() {
  const env = parseEnvFile(ENV_FILE);
  const missing = VERCEL_KEYS.filter((key) => !env.get(key)?.trim());

  if (missing.length > 0) {
    console.error("Faltam variáveis no .env:");
    for (const key of missing) console.error(`  - ${key}`);
    process.exit(1);
  }

  console.log("Verificando login Vercel...");
  try {
    const whoami = runVercel(["whoami"], "");
    console.log(`Logado como: ${whoami}`);
  } catch {
    console.error("Execute primeiro: npx vercel login");
    process.exit(1);
  }

  console.log("\nSincronizando variáveis (Production, Preview, Development)...\n");

  for (const key of VERCEL_KEYS) {
    const value = env.get(key);
    for (const environment of ENVIRONMENTS) {
      upsertEnv(key, value, environment);
    }
    console.log("");
  }

  console.log("Concluído. Rode: npm run deploy:vercel");
}

main();
