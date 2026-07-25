/** MVP: Estoque Atlas (Serializados) persistido em localStorage. */

export type EstoqueAtlasItem = {
  tipo: string;
  modelo: string;
  /** Mapeado da coluna da planilha `Número Série`. */
  numeroSerie: string;
  estado: string;
  dataUltimaAlteracao: string;
  responsavel: string;
};

export type EstoqueAtlasContagem = {
  tipo: string;
  modelo: string;
  quantidade: number;
  status: string;
};

export type EstoqueAtlasSnapshot = {
  items: EstoqueAtlasItem[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.serializados.estoque-atlas";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeItem(row: unknown): EstoqueAtlasItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.tipo !== "string" || typeof r.modelo !== "string") return null;
  if (typeof r.numeroSerie !== "string" || typeof r.estado !== "string") return null;

  return {
    tipo: r.tipo,
    modelo: r.modelo,
    numeroSerie: r.numeroSerie,
    estado: r.estado,
    dataUltimaAlteracao:
      typeof r.dataUltimaAlteracao === "string" ? r.dataUltimaAlteracao : "—",
    responsavel: typeof r.responsavel === "string" ? r.responsavel : "—",
  };
}

export function loadEstoqueAtlasSnapshot(): EstoqueAtlasSnapshot {
  if (!isClient()) return { items: [], updatedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], updatedAt: null };
    const parsed = JSON.parse(raw) as unknown;

    // Formato legado: array puro
    if (Array.isArray(parsed)) {
      return {
        items: parsed.map(normalizeItem).filter((x): x is EstoqueAtlasItem => x !== null),
        updatedAt: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as { items?: unknown; updatedAt?: unknown };
      const items = Array.isArray(payload.items)
        ? payload.items.map(normalizeItem).filter((x): x is EstoqueAtlasItem => x !== null)
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

export function loadEstoqueAtlas(): EstoqueAtlasItem[] {
  return loadEstoqueAtlasSnapshot().items;
}

export function saveEstoqueAtlas(items: EstoqueAtlasItem[]): void {
  if (!isClient()) return;
  const snapshot: EstoqueAtlasSnapshot = {
    items,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent("estoque-atlas-updated"));
}

export function clearEstoqueAtlas(): void {
  if (!isClient()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new CustomEvent("estoque-atlas-updated"));
}

/**
 * Agrupa por Tipo + Modelo + Estado.
 * Quantidade = contagem do grupo; Status = Estado do agrupamento.
 */
export function aggregateEstoqueAtlasContagem(items: EstoqueAtlasItem[]): EstoqueAtlasContagem[] {
  const groups = items.reduce<Map<string, EstoqueAtlasContagem>>((acc, item) => {
    const tipo = item.tipo.trim();
    const modelo = item.modelo.trim();
    const status = item.estado.trim();
    const key = `${tipo.toLowerCase()}|${modelo.toLowerCase()}|${status.toLowerCase()}`;
    const existing = acc.get(key);
    if (existing) {
      existing.quantidade += 1;
    } else {
      acc.set(key, { tipo, modelo, quantidade: 1, status });
    }
    return acc;
  }, new Map());

  return [...groups.values()].sort((a, b) => {
    const byTipo = a.tipo.localeCompare(b.tipo, "pt-BR");
    if (byTipo !== 0) return byTipo;
    const byModelo = a.modelo.localeCompare(b.modelo, "pt-BR");
    if (byModelo !== 0) return byModelo;
    return a.status.localeCompare(b.status, "pt-BR");
  });
}

/** Formata ISO → `DD/MM/YYYY - HH:mm` (pt-BR). */
export function formatAtualizacaoAtlas(iso: string | null): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const data = date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const hora = date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  return `${data} - ${hora}`;
}
