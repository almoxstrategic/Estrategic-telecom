/** Helpers compartilhados do filtro multi-seleção de Tipo de Atividade. */

const FILTRO_ATIVIDADES_STORAGE_FALLBACK = "@app:filtro_atividades";
const PADRAO_ATIVIDADES_STORAGE_FALLBACK = "@app:padrao_atividades";

export function tiposAtividadeStorageKey(userKey?: string | null): string {
  const id = String(userKey ?? "").trim();
  if (id) return `filtro_atividades_${id}`;
  return FILTRO_ATIVIDADES_STORAGE_FALLBACK;
}

export function padraoAtividadesStorageKey(userKey?: string | null): string {
  const id = String(userKey ?? "").trim();
  if (id) return `padrao_atividades_${id}`;
  return PADRAO_ATIVIDADES_STORAGE_FALLBACK;
}

/** `null` = nunca gravado (primeiro acesso). */
export function readTiposAtividadeStorage(key: string): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw == null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((item): item is string => typeof item === "string");
  } catch {
    return null;
  }
}

export function writeTiposAtividadeStorage(key: string, value: string[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* quota / private mode */
  }
}

export function sortTiposAtividade(tipos: string[]): string[] {
  return [...tipos].sort((a, b) =>
    a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
  );
}

export function extrairTiposAtividadeUnicos(
  valores: Array<string | null | undefined>,
): string[] {
  const set = new Set<string>();
  for (const raw of valores) {
    const tipo = String(raw ?? "").trim();
    if (tipo) set.add(tipo);
  }
  return sortTiposAtividade(Array.from(set));
}

/**
 * Semântica operacional:
 * - sem opções → não restringe;
 * - seleção vazia → nenhum item;
 * - todas selecionadas → não restringe;
 * - caso contrário → `includes` no valor do item.
 */
export function filtrarPorTiposAtividade<T>(
  itens: T[],
  opcoesDisponiveis: string[],
  selecionados: string[],
  getTipo: (item: T) => string | null | undefined,
): T[] {
  if (opcoesDisponiveis.length === 0) return itens;
  if (selecionados.length === 0) return [];

  const todosSelecionados =
    selecionados.length === opcoesDisponiveis.length &&
    opcoesDisponiveis.every((t) => selecionados.includes(t));
  if (todosSelecionados) return itens;

  return itens.filter((item) => {
    const tipo = String(getTipo(item) ?? "").trim();
    return Boolean(tipo) && selecionados.includes(tipo);
  });
}
