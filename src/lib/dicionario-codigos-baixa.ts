import { getSupabaseClient } from "@/lib/supabase";

export type DicionarioCodigoBaixa = {
  codigo: string;
  descricao: string;
  motivo_quebra: string | null;
  status_contrato: string | null;
};

/** Mapa por código normalizado (ex.: "101", "409"). */
export type DicionarioCodigosBaixaMap = Record<string, DicionarioCodigoBaixa>;

const DESCRICAO_DESCONHECIDA = "Motivo Desconhecido";

export function normalizeCodigoBaixa(
  value: string | number | null | undefined,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return String(n);
  return raw;
}

export function descricaoDoCodigoBaixa(
  codigo: string,
  dicionario: DicionarioCodigosBaixaMap | Record<string, string>,
): string {
  const entry = dicionario[codigo] ?? dicionario[codigo.padStart(3, "0")];
  if (!entry) return DESCRICAO_DESCONHECIDA;
  if (typeof entry === "string") return entry || DESCRICAO_DESCONHECIDA;
  return entry.descricao?.trim() || DESCRICAO_DESCONHECIDA;
}

export function motivoQuebraDoCodigo(
  codigo: string,
  dicionario: DicionarioCodigosBaixaMap,
): string | null {
  const entry = dicionario[codigo] ?? dicionario[codigo.padStart(3, "0")];
  return entry?.motivo_quebra?.trim() || null;
}

export function statusContratoDoCodigo(
  codigo: string,
  dicionario: DicionarioCodigosBaixaMap,
): string | null {
  const entry = dicionario[codigo] ?? dicionario[codigo.padStart(3, "0")];
  return entry?.status_contrato?.trim() || null;
}

/** Carrega o dicionário completo (inclui motivo_quebra e status_contrato). */
export async function fetchDicionarioCodigosBaixa(): Promise<DicionarioCodigosBaixaMap> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dicionario_codigos_baixa")
    .select("codigo, descricao, motivo_quebra, status_contrato");
  if (error) throw error;

  const map: DicionarioCodigosBaixaMap = {};
  for (const row of data ?? []) {
    const codigo = normalizeCodigoBaixa(row.codigo);
    const descricao = String(row.descricao ?? "").trim();
    if (!codigo || !descricao) continue;
    map[codigo] = {
      codigo,
      descricao,
      motivo_quebra:
        row.motivo_quebra != null && String(row.motivo_quebra).trim()
          ? String(row.motivo_quebra).trim()
          : null,
      status_contrato:
        row.status_contrato != null && String(row.status_contrato).trim()
          ? String(row.status_contrato).trim()
          : null,
    };
  }
  return map;
}

/** Compat: mapa código → descrição (para callers legados). */
export function dicionarioParaMapaDescricao(
  dicionario: DicionarioCodigosBaixaMap,
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const [codigo, row] of Object.entries(dicionario)) {
    map[codigo] = row.descricao;
  }
  return map;
}
