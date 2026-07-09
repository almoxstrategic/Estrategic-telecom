const WEBHOOK_SECRET_ENV_KEYS = [
  "NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET",
  "EVIDENCIA_WEBHOOK_SECRET",
  "VITE_EVIDENCIA_WEBHOOK_SECRET",
  "evidencia_webhook_secret",
] as const;

function readFromImportMeta(key: string): string | undefined {
  if (typeof import.meta === "undefined") return undefined;
  const value = (import.meta.env as Record<string, string | undefined>)[key];
  return value?.trim() || undefined;
}

function readFromProcessEnv(key: string): string | undefined {
  if (typeof process === "undefined") return undefined;
  const value = process.env[key];
  return value?.trim() || undefined;
}

export function resolveEvidenciaWebhookSecret(override?: string): string | undefined {
  const direct = override?.trim();
  if (direct) return direct;

  for (const key of WEBHOOK_SECRET_ENV_KEYS) {
    const fromProcess = readFromProcessEnv(key);
    if (fromProcess) return fromProcess;

    const fromMeta = readFromImportMeta(key);
    if (fromMeta) return fromMeta;
  }

  return undefined;
}

export function readClientEvidenciaWebhookSecret(): string | undefined {
  return resolveEvidenciaWebhookSecret();
}
