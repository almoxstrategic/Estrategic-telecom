import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

let envLoaded = false;

function envCandidates(): string[] {
  const paths = new Set<string>();

  if (typeof process !== "undefined") {
    paths.add(resolve(process.cwd(), ".env"));
  }

  try {
    const here = dirname(fileURLToPath(import.meta.url));
    for (const depth of ["..", "../..", "../../..", "../../../..", "../../../../.."]) {
      paths.add(resolve(here, depth, ".env"));
    }
  } catch {
    // bundled without import.meta.url
  }

  return [...paths];
}

function loadDotEnv() {
  if (envLoaded) return;
  envLoaded = true;

  for (const envPath of envCandidates()) {
    if (!existsSync(envPath)) continue;

    for (const line of readFileSync(envPath, "utf8").split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const idx = trimmed.indexOf("=");
      if (idx === -1) continue;
      const key = trimmed.slice(0, idx).trim();
      const value = trimmed
        .slice(idx + 1)
        .trim()
        .replace(/^["']|["']$/g, "")
        .replace(/\r$/, "");
      if (typeof process !== "undefined") {
        process.env[key] = value;
      }
    }
    return;
  }
}

function readEnv(name: string): string | undefined {
  loadDotEnv();

  const meta = import.meta.env as Record<string, string | undefined>;
  if (meta?.[name]) return meta[name];

  if (typeof process !== "undefined" && process.env[name]) {
    return process.env[name];
  }

  return undefined;
}

export function getSupabaseUrl(): string {
  const value = readEnv("VITE_SUPABASE_URL");
  if (!value) throw new Error("Configure VITE_SUPABASE_URL no .env");
  return value;
}

export function getSupabaseAnonKey(): string {
  const value = readEnv("VITE_SUPABASE_ANON_KEY");
  if (!value) throw new Error("Configure VITE_SUPABASE_ANON_KEY no .env");
  return value;
}

export function getSupabaseServiceRoleKey(): string {
  const value = readEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (!value) {
    throw new Error(
      "Configure SUPABASE_SERVICE_ROLE_KEY no .env e reinicie com npm run dev.",
    );
  }
  return value;
}
