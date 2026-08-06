import { getSupabaseClient } from "./supabase";
import type { ToaChamadoProcessado, ToaOrdemServico } from "./toa-store";
import { normalizeToaLogin } from "./toa-store";

/** Último mês inclusivo do gabarito Analítico (jun/2026). */
export const FATURAMENTO_HISTORICO_ATE = 202606;

export type AnaliticoHistoricoRow = {
  id?: string;
  data_base: number;
  nr_contrato: string;
  cd_os: string;
  id_tipo_os: number | null;
  ds_tipo_os: string;
  cd_baixa: number | null;
  qtde: number;
  valor_servico: number;
  dh_baixa: string | null;
  tipo_os_consolid: string;
  nm_cidade: string;
};

export type ToaImportacaoRow = {
  id?: string;
  competencia: number;
  data: string;
  login: string;
  numero_wo: string;
  contrato: string;
  ordens: ToaOrdemServico[];
  imported_at?: string;
};

/** Competência YYYYMM a partir de ano/mês. */
export function competenciaYm(ano: number, mes: number): number {
  return ano * 100 + mes;
}

/** true quando o filtro deve usar Analítico real (≤ jun/2026). */
export function isPeriodoHistoricoAnalitico(
  ano: number | null,
  mes: number | null,
): boolean {
  if (ano === null || mes === null) return false;
  return competenciaYm(ano, mes) <= FATURAMENTO_HISTORICO_ATE;
}

/** true quando o filtro deve usar projeção TOA (≥ jul/2026). */
export function isPeriodoProjecaoToa(
  ano: number | null,
  mes: number | null,
): boolean {
  if (ano === null || mes === null) return false;
  return competenciaYm(ano, mes) > FATURAMENTO_HISTORICO_ATE;
}

function parseDataBase(value: unknown): number {
  const n = Number(String(value ?? "").replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseMoney(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value ?? "")
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseOptionalInt(value: unknown): number | null {
  const m = String(value ?? "").match(/\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0]!, 10);
  return Number.isFinite(n) ? n : null;
}

function parseDhBaixa(value: unknown): string | null {
  if (value == null || value === "") return null;
  if (typeof value === "number") {
    // Excel serial — deixar null se não convertermos aqui
    return null;
  }
  const s = String(value).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    const day = m[1]!.padStart(2, "0");
    const month = m[2]!.padStart(2, "0");
    return `${m[3]}-${month}-${day}`;
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return null;
}

export function mapAnaliticoSheetRow(
  row: Record<string, unknown>,
): AnaliticoHistoricoRow | null {
  const data_base = parseDataBase(row.DATA_BASE ?? row.data_base);
  const cd_os = String(row.CD_OS ?? row.cd_os ?? "")
    .trim()
    .replace(/\.0$/, "");
  if (!data_base || !cd_os) return null;

  return {
    data_base,
    nr_contrato: String(row.NR_CONTRATO ?? row.nr_contrato ?? "").trim(),
    cd_os,
    id_tipo_os: parseOptionalInt(row.ID_TIPO_OS ?? row.id_tipo_os),
    ds_tipo_os: String(row.DS_TIPO_OS ?? row.ds_tipo_os ?? "").trim(),
    cd_baixa: parseOptionalInt(row.CD_BAIXA ?? row.cd_baixa),
    qtde: parseMoney(row.QTDE ?? row.qtde) || 1,
    valor_servico: parseMoney(row.VALOR_SERVICO ?? row.valor_servico),
    dh_baixa: parseDhBaixa(row.DH_BAIXA ?? row.dh_baixa),
    tipo_os_consolid: String(
      row.TIPO_OS_CONSOLID ?? row.tipo_os_consolid ?? "",
    ).trim(),
    nm_cidade: String(row.NM_CIDADE ?? row.nm_cidade ?? "").trim(),
  };
}

/** Substitui todas as linhas dos DATA_BASE presentes no lote. */
export async function replaceAnaliticoHistoricoLote(
  rows: AnaliticoHistoricoRow[],
): Promise<{ meses: number[]; total: number }> {
  const byBase = new Map<number, AnaliticoHistoricoRow[]>();
  for (const r of rows) {
    const list = byBase.get(r.data_base) ?? [];
    list.push(r);
    byBase.set(r.data_base, list);
  }
  const meses = [...byBase.keys()].sort((a, b) => a - b);
  let total = 0;
  for (const dataBase of meses) {
    total += await replaceAnaliticoHistoricoMes(
      dataBase,
      byBase.get(dataBase) ?? [],
    );
  }
  return { meses, total };
}

/** Substitui todas as linhas de um DATA_BASE e insere o lote. */
export async function replaceAnaliticoHistoricoMes(
  dataBase: number,
  rows: AnaliticoHistoricoRow[],
): Promise<number> {
  const supabase = getSupabaseClient();
  const { error: delError } = await supabase
    .from("analitico_historico")
    .delete()
    .eq("data_base", dataBase);
  if (delError) throw delError;

  if (rows.length === 0) return 0;

  const payload = rows.map((r) => ({
    data_base: r.data_base,
    nr_contrato: r.nr_contrato,
    cd_os: r.cd_os,
    id_tipo_os: r.id_tipo_os,
    ds_tipo_os: r.ds_tipo_os,
    cd_baixa: r.cd_baixa,
    qtde: r.qtde,
    valor_servico: r.valor_servico,
    dh_baixa: r.dh_baixa,
    tipo_os_consolid: r.tipo_os_consolid,
    nm_cidade: r.nm_cidade,
  }));

  const chunkSize = 500;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from("analitico_historico").insert(chunk);
    if (error) throw error;
  }

  return payload.length;
}

export async function fetchAnaliticoHistorico(filtro: {
  ano: number | null;
  mes: number | null;
}): Promise<AnaliticoHistoricoRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("analitico_historico")
    .select(
      "id, data_base, nr_contrato, cd_os, id_tipo_os, ds_tipo_os, cd_baixa, qtde, valor_servico, dh_baixa, tipo_os_consolid, nm_cidade",
    )
    .order("data_base", { ascending: true })
    .order("cd_os", { ascending: true });

  if (filtro.ano !== null && filtro.mes !== null) {
    query = query.eq("data_base", competenciaYm(filtro.ano, filtro.mes));
  } else if (filtro.ano !== null) {
    const ini = filtro.ano * 100 + 1;
    const fim = filtro.ano * 100 + 12;
    query = query.gte("data_base", ini).lte("data_base", fim);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id,
    data_base: Number(row.data_base),
    nr_contrato: String(row.nr_contrato ?? ""),
    cd_os: String(row.cd_os ?? ""),
    id_tipo_os: row.id_tipo_os == null ? null : Number(row.id_tipo_os),
    ds_tipo_os: String(row.ds_tipo_os ?? ""),
    cd_baixa: row.cd_baixa == null ? null : Number(row.cd_baixa),
    qtde: Number(row.qtde) || 1,
    valor_servico: Number(row.valor_servico) || 0,
    dh_baixa: row.dh_baixa ? String(row.dh_baixa).slice(0, 10) : null,
    tipo_os_consolid: String(row.tipo_os_consolid ?? ""),
    nm_cidade: String(row.nm_cidade ?? ""),
  }));
}

export function resumirAnaliticoHistorico(rows: AnaliticoHistoricoRow[]): {
  totalNotas: number;
  receitaTotal: number;
} {
  return {
    totalNotas: rows.length,
    receitaTotal: rows.reduce((s, r) => s + (Number(r.valor_servico) || 0), 0),
  };
}

function competenciaFromIsoDate(data: string): number | null {
  const m = data.match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  return Number(m[1]) * 100 + Number(m[2]);
}

/** Agrupa chamados por competência YYYYMM. */
export function groupChamadosByCompetencia(
  chamados: ToaChamadoProcessado[],
): Map<number, ToaChamadoProcessado[]> {
  const map = new Map<number, ToaChamadoProcessado[]>();
  for (const c of chamados) {
    const comp = competenciaFromIsoDate(c.data);
    if (comp == null) continue;
    const list = map.get(comp) ?? [];
    list.push(c);
    map.set(comp, list);
  }
  return map;
}

/** Overwrite idempotente: apaga competências presentes e reinsere. */
export async function replaceToaImportacoes(
  chamados: ToaChamadoProcessado[],
): Promise<{ competencias: number[]; totalNotas: number }> {
  const byComp = groupChamadosByCompetencia(chamados);
  const competencias = [...byComp.keys()].sort((a, b) => a - b);
  if (competencias.length === 0) {
    return { competencias: [], totalNotas: 0 };
  }

  const supabase = getSupabaseClient();
  const { error: delError } = await supabase
    .from("toa_importacoes")
    .delete()
    .in("competencia", competencias);
  if (delError) throw delError;

  const payload: Array<{
    competencia: number;
    data: string;
    login: string;
    numero_wo: string;
    contrato: string;
    ordens: ToaOrdemServico[];
  }> = [];

  for (const [competencia, lista] of byComp) {
    for (const c of lista) {
      payload.push({
        competencia,
        data: c.data,
        login: normalizeToaLogin(c.login),
        numero_wo: c.numeroWo,
        contrato: c.contrato,
        ordens: c.ordensDeServico,
      });
    }
  }

  const chunkSize = 200;
  for (let i = 0; i < payload.length; i += chunkSize) {
    const chunk = payload.slice(i, i + chunkSize);
    const { error } = await supabase.from("toa_importacoes").insert(chunk);
    if (error) throw error;
  }

  return { competencias, totalNotas: payload.length };
}

/** Competências YYYYMM distintas presentes em toa_importacoes. */
export async function fetchCompetenciasToa(): Promise<number[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("toa_importacoes")
    .select("competencia");
  if (error) throw error;
  const set = new Set<number>();
  for (const row of data ?? []) {
    const c = Number(row.competencia);
    if (Number.isFinite(c) && c > 0) set.add(c);
  }
  return [...set].sort((a, b) => a - b);
}

/** DATA_BASE distintos presentes em analitico_historico. */
export async function fetchCompetenciasAnalitico(): Promise<number[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("analitico_historico")
    .select("data_base");
  if (error) throw error;
  const set = new Set<number>();
  for (const row of data ?? []) {
    const c = Number(row.data_base);
    if (Number.isFinite(c) && c > 0) set.add(c);
  }
  return [...set].sort((a, b) => a - b);
}

export async function fetchToaImportacoes(filtro: {
  ano: number | null;
  mes: number | null;
  dia: number | null;
}): Promise<ToaChamadoProcessado[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("toa_importacoes")
    .select("competencia, data, login, numero_wo, contrato, ordens")
    .order("data", { ascending: true });

  if (filtro.ano !== null && filtro.mes !== null) {
    query = query.eq("competencia", competenciaYm(filtro.ano, filtro.mes));
  } else if (filtro.ano !== null) {
    const ini = filtro.ano * 100 + 1;
    const fim = filtro.ano * 100 + 12;
    query = query.gte("competencia", ini).lte("competencia", fim);
  }

  if (filtro.dia !== null && filtro.ano !== null && filtro.mes !== null) {
    const iso = `${filtro.ano}-${String(filtro.mes).padStart(2, "0")}-${String(filtro.dia).padStart(2, "0")}`;
    query = query.eq("data", iso);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    data: String(row.data).slice(0, 10),
    login: normalizeToaLogin(String(row.login ?? "")),
    numeroWo: String(row.numero_wo ?? ""),
    contrato: String(row.contrato ?? ""),
    ordensDeServico: Array.isArray(row.ordens)
      ? (row.ordens as ToaOrdemServico[])
      : [],
  }));
}
