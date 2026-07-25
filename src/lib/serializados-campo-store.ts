/** MVP: Estoque Campo (Serializados) persistido em localStorage. */

export type EstoqueCampoItem = {
  nome: string;
  descricao: string;
  modelo: string;
  numeroSerie: string;
  status: string;
  dataRetirada: string;
};

export type EstoqueCampoContagem = {
  nome: string;
  descricao: string;
  quantidade: number;
  status: string;
};

export type EstoqueCampoSnapshot = {
  items: EstoqueCampoItem[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.serializados.estoque-campo";
const EVENT_NAME = "estoque-campo-updated";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeItem(row: unknown): EstoqueCampoItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.nome !== "string" || typeof r.descricao !== "string") return null;
  if (typeof r.numeroSerie !== "string" || typeof r.status !== "string") return null;

  return {
    nome: r.nome,
    descricao: r.descricao,
    modelo: typeof r.modelo === "string" ? r.modelo : "",
    numeroSerie: r.numeroSerie,
    status: r.status,
    dataRetirada: typeof r.dataRetirada === "string" ? r.dataRetirada : "—",
  };
}

export function loadEstoqueCampoSnapshot(): EstoqueCampoSnapshot {
  if (!isClient()) return { items: [], updatedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], updatedAt: null };
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        items: parsed.map(normalizeItem).filter((x): x is EstoqueCampoItem => x !== null),
        updatedAt: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as { items?: unknown; updatedAt?: unknown };
      const items = Array.isArray(payload.items)
        ? payload.items.map(normalizeItem).filter((x): x is EstoqueCampoItem => x !== null)
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

export function saveEstoqueCampo(items: EstoqueCampoItem[]): void {
  if (!isClient()) return;
  const snapshot: EstoqueCampoSnapshot = {
    items,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

/**
 * Agrupa por Nome + DESCRIÇÃO + STATUS.
 * Quantidade = contagem do grupo.
 */
export function aggregateEstoqueCampoContagem(items: EstoqueCampoItem[]): EstoqueCampoContagem[] {
  const groups = items.reduce<Map<string, EstoqueCampoContagem>>((acc, item) => {
    const nome = item.nome.trim();
    const descricao = item.descricao.trim();
    const status = item.status.trim();
    const key = `${nome.toLowerCase()}|${descricao.toLowerCase()}|${status.toLowerCase()}`;
    const existing = acc.get(key);
    if (existing) {
      existing.quantidade += 1;
    } else {
      acc.set(key, { nome, descricao, quantidade: 1, status });
    }
    return acc;
  }, new Map());

  return [...groups.values()].sort((a, b) => {
    const byNome = a.nome.localeCompare(b.nome, "pt-BR");
    if (byNome !== 0) return byNome;
    const byDesc = a.descricao.localeCompare(b.descricao, "pt-BR");
    if (byDesc !== 0) return byDesc;
    return a.status.localeCompare(b.status, "pt-BR");
  });
}

export function formatAtualizacaoCampo(iso: string | null): string {
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
