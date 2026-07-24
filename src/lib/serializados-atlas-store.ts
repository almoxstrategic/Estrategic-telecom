/** MVP: Estoque Atlas (Serializados) persistido em localStorage. */

export type EstoqueAtlasItem = {
  tipo: string;
  modelo: string;
  numeroSerie: string;
  estado: string;
};

export type EstoqueAtlasContagem = {
  tipo: string;
  modelo: string;
  quantidade: number;
  status: string;
};

const STORAGE_KEY = "estrategic.serializados.estoque-atlas";

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function loadEstoqueAtlas(): EstoqueAtlasItem[] {
  if (!isClient()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (row): row is EstoqueAtlasItem =>
        !!row &&
        typeof row === "object" &&
        typeof (row as EstoqueAtlasItem).tipo === "string" &&
        typeof (row as EstoqueAtlasItem).modelo === "string" &&
        typeof (row as EstoqueAtlasItem).numeroSerie === "string" &&
        typeof (row as EstoqueAtlasItem).estado === "string",
    );
  } catch {
    return [];
  }
}

export function saveEstoqueAtlas(items: EstoqueAtlasItem[]): void {
  if (!isClient()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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
