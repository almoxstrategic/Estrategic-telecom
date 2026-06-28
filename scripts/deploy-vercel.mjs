#!/usr/bin/env node
/**
 * Deploy de produção na Vercel.
 * Uso: npm run deploy:vercel
 */
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

function run(args) {
  const result = spawnSync("npx", ["--yes", "vercel@54.18.1", ...args], {
    cwd: ROOT,
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  if (result.status !== 0) process.exit(result.status ?? 1);
}

console.log("Deploy de produção na Vercel...\n");
run(["deploy", "--prod"]);
