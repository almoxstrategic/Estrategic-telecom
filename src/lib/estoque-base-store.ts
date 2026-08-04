/** MVP: Estoque Base (Miscelâneas) persistido em localStorage. */

import type { EstoqueBtpItem } from "./estoque-btp-store";
import { normalizeMaterialCode } from "./material-code";

export type EstoqueBaseItem = {
  codigoAlternativo: string;
  estoqueAtual: number;
  estoqueReservado: number;
  estoqueDisponivel: number;
};

export type EstoqueBaseCruzado = {
  material: string;
  codigo: string;
  estoqueAtual: number;
  estoqueReservado: number;
  estoqueDisponivel: number;
};

export type EstoqueBaseSnapshot = {
  items: EstoqueBaseItem[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.miscelaneas.estoque-base";
const EVENT_NAME = "estoque-base-updated";

function isClient(): boolean {
  return typeof window !== "undefined";
}

function normalizeItem(row: unknown): EstoqueBaseItem | null {
  if (!row || typeof row !== "object") return null;
  const r = row as Record<string, unknown>;
  if (typeof r.codigoAlternativo !== "string") return null;
  const codigoAlternativo = r.codigoAlternativo.trim();
  if (!codigoAlternativo) return null;

  return {
    codigoAlternativo,
    estoqueAtual: typeof r.estoqueAtual === "number" ? r.estoqueAtual : Number(r.estoqueAtual) || 0,
    estoqueReservado:
      typeof r.estoqueReservado === "number" ? r.estoqueReservado : Number(r.estoqueReservado) || 0,
    estoqueDisponivel:
      typeof r.estoqueDisponivel === "number"
        ? r.estoqueDisponivel
        : Number(r.estoqueDisponivel) || 0,
  };
}

export function loadEstoqueBaseSnapshot(): EstoqueBaseSnapshot {
  if (!isClient()) return { items: [], updatedAt: null };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { items: [], updatedAt: null };
    const parsed = JSON.parse(raw) as unknown;

    if (Array.isArray(parsed)) {
      return {
        items: parsed.map(normalizeItem).filter((x): x is EstoqueBaseItem => x !== null),
        updatedAt: null,
      };
    }

    if (parsed && typeof parsed === "object") {
      const payload = parsed as { items?: unknown; updatedAt?: unknown };
      const items = Array.isArray(payload.items)
        ? payload.items.map(normalizeItem).filter((x): x is EstoqueBaseItem => x !== null)
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

export function saveEstoqueBase(items: EstoqueBaseItem[]): void {
  if (!isClient()) return;
  const snapshot: EstoqueBaseSnapshot = {
    items,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(EVENT_NAME));
}

export function getDadosEstoqueBase(): EstoqueBaseItem[] {
  return loadEstoqueBaseSnapshot().items;
}

/**
 * Cruza Estoque Base com Estoque BTP.
 * Chave: Código Alternativo === Material (codigo).
 */
export function cruzarDadosEstoque(
  dadosEstoqueBase: EstoqueBaseItem[],
  dadosEstoqueBtp: EstoqueBtpItem[],
): EstoqueBaseCruzado[] {
  const btpByCode = new Map<string, EstoqueBtpItem>();
  for (const item of dadosEstoqueBtp) {
    const key = normalizeMaterialCode(item.codigo);
    if (key && !btpByCode.has(key)) btpByCode.set(key, item);
  }

  return dadosEstoqueBase.map((base) => {
    const key = normalizeMaterialCode(base.codigoAlternativo);
    const match = btpByCode.get(key);
    return {
      material: match?.descricao?.trim() ? match.descricao.trim() : "Nome não encontrado",
      codigo: base.codigoAlternativo,
      estoqueAtual: base.estoqueAtual,
      estoqueReservado: base.estoqueReservado,
      estoqueDisponivel: base.estoqueDisponivel,
    };
  });
}

export function formatAtualizacaoEstoqueBase(iso: string | null): string {
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
