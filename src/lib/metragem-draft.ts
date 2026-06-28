const STORAGE_KEY = "estrategic-metragem-draft";

export type MetragemDraft = {
  contrato: string;
  wo: string;
  metInicial: string;
  metFinal: string;
};

export function loadMetragemDraft(): MetragemDraft | null {
  if (typeof window === "undefined") return null;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<MetragemDraft>;
    if (
      typeof parsed.contrato !== "string" ||
      typeof parsed.wo !== "string" ||
      typeof parsed.metInicial !== "string" ||
      typeof parsed.metFinal !== "string"
    ) {
      return null;
    }
    return {
      contrato: parsed.contrato,
      wo: parsed.wo,
      metInicial: parsed.metInicial,
      metFinal: parsed.metFinal,
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
