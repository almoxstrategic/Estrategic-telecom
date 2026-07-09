const STORAGE_KEY = "estrategic-metragem-draft";

export type MetragemDraft = {
  contrato: string;
  wo: string;
  observacao: string;
};

export function loadMetragemDraft(): MetragemDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetragemDraft & { metInicial?: string; metFinal?: string }>;
    if (typeof parsed.contrato !== "string" || typeof parsed.wo !== "string") {
      return null;
    }
    return {
      contrato: parsed.contrato,
      wo: parsed.wo,
      observacao: typeof parsed.observacao === "string" ? parsed.observacao : "",
    };
  } catch {
    return null;
  }
}

export function saveMetragemDraft(draft: MetragemDraft): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
}

export function clearMetragemDraft(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
