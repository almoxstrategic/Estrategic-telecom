/** MVP: Estoque BTP (Miscelâneas) persistido em localStorage. */

export type EstoqueBtpItem = {
  /** Coluna `Material` da planilha (código do item). */
  codigo: string;
  /** Coluna `Descr. Material` da planilha (nomenclatura). */
  descricao: string;
};

export type EstoqueBtpSnapshot = {
  items: EstoqueBtpItem[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.miscelaneas.estoque-btp";
/** Chave legada (Consulta de Estoque) — lida uma vez para migração. */
const LEGACY_STORAGE_KEY = "estrategic.miscelaneas.consulta-estoque";
const EVENT_NAME = "estoque-btp-updated";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeItem(row: unknown): EstoqueBtpItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;

  const codigoRaw =
    typeof r.codigo === "string"
      ? r.codigo
      : typeof r.codMaterial === "string"
        ? r.codMaterial
        : null;
  const descricaoRaw =
    typeof r.descricao === "string"
      ? r.descricao
      : typeof r.nome === "string"
        ? r.nome
        : null;

  if (codigoRaw === null) return null;
  const codigo = codigoRaw.trim();
  if (!codigo) return null;
  const descricao = (descricaoRaw ?? codigo).toString().trim() || codigo;
  return { codigo, descricao };
}

function parseSnapshot(raw: string): EstoqueBtpSnapshot {
  const parsed = JSON.parse(raw) as unknown;

  if (Array.isArray(parsed)) {
    return {
      items: parsed.map(normalizeItem).filter((x): x is EstoqueBtpItem => x !== null),
      updatedAt: null,
    };
  }

  if (parsed && typeof parsed === "object") {
    const payload = parsed as { items?: unknown; updatedAt?: unknown };
    const items = Array.isArray(payload.items)
      ? payload.items.map(normalizeItem).filter((x): x is EstoqueBtpItem => x !== null)
      : [];
    const updatedAt =
      typeof payload.updatedAt === "string" && payload.updatedAt ? payload.updatedAt : null;
    return { items, updatedAt };
  }

  return { items: [], updatedAt: null };
}

export function loadEstoqueBtpSnapshot(): EstoqueBtpSnapshot {
  if (!isClient()) return { items: [], updatedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) return parseSnapshot(raw);

    const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (legacy) {
      const snapshot = parseSnapshot(legacy);
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
      return snapshot;
    }

    return { items: [], updatedAt: null };
  } catch {
    return { items: [], updatedAt: null };
  }
}

export function saveEstoqueBtp(items: EstoqueBtpItem[]): void {
  if (!isClient()) return;
  const snapshot: EstoqueBtpSnapshot = {
    items,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getDadosEstoqueBtp(): EstoqueBtpItem[] {
  return loadEstoqueBtpSnapshot().items;
}
