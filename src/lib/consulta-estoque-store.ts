/** MVP: Consulta de Estoque (Miscelâneas) persistida em localStorage. */

export type ConsultaEstoqueItem = {
  /** Equivalente a "Cod material" / "Material" da planilha. */
  codMaterial: string;
  /** Nomenclatura / Descr. Material. */
  nome: string;
};

export type ConsultaEstoqueSnapshot = {
  items: ConsultaEstoqueItem[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.miscelaneas.consulta-estoque";
const EVENT_NAME = "consulta-estoque-updated";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeItem(row: unknown): ConsultaEstoqueItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.codMaterial !== "string" || typeof r.nome !== "string") return null;
  const codMaterial = r.codMaterial.trim();
  if (!codMaterial) return null;
  return { codMaterial, nome: r.nome.trim() || codMaterial };
}

export function loadConsultaEstoqueSnapshot(): ConsultaEstoqueSnapshot {
  if (!isClient()) return { items: [], updatedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], updatedAt: null };
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        items: parsed.map(normalizeItem).filter((x): x is ConsultaEstoqueItem => x !== null),
        updatedAt: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as { items?: unknown; updatedAt?: unknown };
      const items = Array.isArray(payload.items)
        ? payload.items.map(normalizeItem).filter((x): x is ConsultaEstoqueItem => x !== null)
        : [];
      const updatedAt =
        typeof payload.updatedAt === "string" && payload.updatedAt ? payload.updatedAt : null;
      return { items, updatedAt };
    }

    return { items: [], updatedAt: null };
  } catch {
    return { items: [], updatedAt: null };
  }
}

export function saveConsultaEstoque(items: ConsultaEstoqueItem[]): void {
  if (!isClient()) return;
  const snapshot: ConsultaEstoqueSnapshot = {
    items,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getDadosConsultaEstoque(): ConsultaEstoqueItem[] {
  return loadConsultaEstoqueSnapshot().items;
}
