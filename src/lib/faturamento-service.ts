import { getSupabaseClient } from "./supabase";
import type { ToaChamadoProcessado } from "./toa-store";
import {
  flattenChamadosParaImportacaoFlat,
  normalizeToaLogin,
  regroupFlatRowsToChamados,
} from "./toa-store";

/** Último mês inclusivo do gabarito Analítico (jun/2026). */
export const FATURAMENTO_HISTORICO_ATE = 202606;

/** Linha do consolidado IAT (62 campos de negócio + id). */
export type AnaliticoHistoricoRow = {
  id?: string;
  data_base: number;
  nm_cidade: string | null;
  nm_subcluster: string | null;
  nm_cluster: string | null;
  nm_regional: string | null;
  cd_operadora: number | null;
  /** Mantido como string (bigint JS-safe). */
  nr_contrato: string;
  /** Mantido como string (bigint JS-safe). */
  cd_os: string;
  id_tipo_os: number | null;
  ds_tipo_os: string | null;
  cd_baixa: number | null;
  tipo_os_consolid: string | null;
  terminal: string | null;
  tipo_term: string | null;
  dt_agendamento: string | null;
  dh_abertura: string | null;
  dh_baixa: string | null;
  dh_real_inicio_trabalho: string | null;
  dh_real_termino_trabalho: string | null;
  ds_janela_agendamento: string | null;
  cd_user_abertura: string | null;
  cd_user_baixa: string | null;
  servidor: string | null;
  id_equipe: string | null;
  segmentacao: string | null;
  id_empr_execucao: string | null;
  ds_prestadora_servico: string | null;
  produto_de: string | null;
  produto_para: string | null;
  tipo_edificacao: string | null;
  contrato_mestre: string | null;
  c_custo: string | null;
  d_c_custo: string | null;
  id_grp: string | null;
  id_grp_item: string | null;
  tempo: number | null;
  valor_hh: number | null;
  codigo: string | null;
  conta_contabil: string | null;
  cnpj_empresa: string | null;
  qtde: number | null;
  dh_instal: string | null;
  tipo_empresa: string | null;
  valor_servico: number;
  id_item: string | null;
  id_item_hfc: string | null;
  id_item_geral: string | null;
  cidade_apuracao: string | null;
  fg_baixa: string | null;
  c_custo_hfc: string | null;
  d_custo_hfc: string | null;
  c_custo_geral: string | null;
  d_c_custo_geral: string | null;
  modelo_eqp: string | null;
  tipo_eqp: string | null;
  node_ativo: string | null;
  dt_acss_now: string | null;
  dt_acss_telco: string | null;
  fg_pagto_now_telco: string | null;
  cd_ibge: string | null;
  ds_centro_custo_sap: string | null;
  unidade_negocio: string | null;
};

/** 1 linha = 1 O.S. (granularidade alinhada ao Analítico). */
export type ToaImportacaoRow = {
  id?: string;
  competencia: number;
  data_toa: string;
  nome_tecnico: string;
  login_tecnico: string;
  numero_wo: string;
  contrato: string;
  numero_os: string;
  tipo_os: string;
  cod_baixa: number | null;
  status_os: string;
  status_nota: "Produtiva" | "Improdutiva";
  /** Status da Atividade da WO-mãe (concluído, cancelado, suspenso, …). */
  status_atividade?: string;
  imported_at?: string;
};

/** Competência YYYYMM a partir de ano/mês. */
export function competenciaYm(ano: number, mes: number): number {
  return ano * 100 + mes;
}

/**
 * Modo de exibição baseado na disponibilidade real dos dados no mês
 * (não na data de corte histórica).
 */
export type ModoFaturamentoDisponibilidade =
  | "ONLY_ANALITICO"
  | "ONLY_TOA"
  | "COMPARISON_MODE"
  | "vazio";

export function detectarModoFaturamento(opts: {
  temAnalitico: boolean;
  temToa: boolean;
}): ModoFaturamentoDisponibilidade {
  if (opts.temAnalitico && opts.temToa) return "COMPARISON_MODE";
  if (opts.temAnalitico) return "ONLY_ANALITICO";
  if (opts.temToa) return "ONLY_TOA";
  return "vazio";
}

/** @deprecated Preferir detectarModoFaturamento pela presença dos dados. */
export function isPeriodoHistoricoAnalitico(
  ano: number | null,
  mes: number | null,
): boolean {
  if (ano === null || mes === null) return false;
  return competenciaYm(ano, mes) <= FATURAMENTO_HISTORICO_ATE;
}

/** @deprecated Preferir detectarModoFaturamento pela presença dos dados. */
export function isPeriodoProjecaoToa(
  ano: number | null,
  mes: number | null,
): boolean {
  if (ano === null || mes === null) return false;
  return competenciaYm(ano, mes) > FATURAMENTO_HISTORICO_ATE;
}

function isBlank(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "number") return !Number.isFinite(value);
  if (typeof value === "string") {
    const t = value.trim();
    return !t || t.toLowerCase() === "nan" || t.toLowerCase() === "undefined";
  }
  return false;
}

function cell(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(row, key) && !isBlank(row[key])) {
      return row[key];
    }
    const upper = key.toUpperCase();
    if (Object.prototype.hasOwnProperty.call(row, upper) && !isBlank(row[upper])) {
      return row[upper];
    }
    const lower = key.toLowerCase();
    if (Object.prototype.hasOwnProperty.call(row, lower) && !isBlank(row[lower])) {
      return row[lower];
    }
  }
  return null;
}

function parseDataBase(value: unknown): number {
  if (isBlank(value)) return 0;
  const n = Number(String(value).replace(/\D/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseMoney(value: unknown): number | null {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const s = String(value)
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseOptionalInt(value: unknown): number | null {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  const m = String(value).match(/-?\d+/);
  if (!m) return null;
  const n = Number.parseInt(m[0]!, 10);
  return Number.isFinite(n) ? n : null;
}

/** Bigint como string (evita perda de precisão no JS). */
function parseBigIntString(value: unknown): string | null {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(Math.trunc(value));
  }
  const raw = String(value).trim().replace(/\.0$/, "");
  const digits = raw.replace(/[^\d-]/g, "");
  return digits || null;
}

function parseText(value: unknown): string | null {
  if (isBlank(value)) return null;
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  const s = String(value).trim();
  return s || null;
}

/** Converte Excel serial / BR / ISO → ISO timestamptz (ou null). */
function parseTimestamp(value: unknown): string | null {
  if (isBlank(value)) return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    // Excel serial (dias desde 1899-12-30)
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString();
  }

  const s = String(value).trim();
  const br = s.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (br) {
    const day = br[1]!.padStart(2, "0");
    const month = br[2]!.padStart(2, "0");
    const year = br[3]!;
    const hh = (br[4] ?? "0").padStart(2, "0");
    const mm = (br[5] ?? "0").padStart(2, "0");
    const ss = (br[6] ?? "0").padStart(2, "0");
    const iso = `${year}-${month}-${day}T${hh}:${mm}:${ss}`;
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? `${year}-${month}-${day}` : d.toISOString();
  }

  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return Number.isNaN(d.getTime()) ? s.slice(0, 19) : d.toISOString();
  }

  return null;
}

export function mapAnaliticoSheetRow(
  row: Record<string, unknown>,
): AnaliticoHistoricoRow | null {
  const data_base = parseDataBase(cell(row, "DATA_BASE", "data_base"));
  const cd_os = parseBigIntString(cell(row, "CD_OS", "cd_os"));
  if (!data_base || !cd_os) return null;

  const valor = parseMoney(cell(row, "VALOR_SERVICO", "valor_servico"));
  const qtde = parseMoney(cell(row, "QTDE", "qtde"));

  return {
    data_base,
    nm_cidade: parseText(cell(row, "NM_CIDADE")),
    nm_subcluster: parseText(cell(row, "NM_SUBCLUSTER")),
    nm_cluster: parseText(cell(row, "NM_CLUSTER")),
    nm_regional: parseText(cell(row, "NM_REGIONAL")),
    cd_operadora: parseOptionalInt(cell(row, "CD_OPERADORA")),
    nr_contrato: parseBigIntString(cell(row, "NR_CONTRATO")) ?? "",
    cd_os,
    id_tipo_os: parseOptionalInt(cell(row, "ID_TIPO_OS")),
    ds_tipo_os: parseText(cell(row, "DS_TIPO_OS")),
    cd_baixa: parseOptionalInt(cell(row, "CD_BAIXA")),
    tipo_os_consolid: parseText(cell(row, "TIPO_OS_CONSOLID")),
    terminal: parseText(cell(row, "TERMINAL")),
    tipo_term: parseText(cell(row, "TIPO_TERM")),
    dt_agendamento: parseTimestamp(cell(row, "DT_AGENDAMENTO")),
    dh_abertura: parseTimestamp(cell(row, "DH_ABERTURA")),
    dh_baixa: parseTimestamp(cell(row, "DH_BAIXA")),
    dh_real_inicio_trabalho: parseTimestamp(
      cell(row, "DH_REAL_INICIO_TRABALHO"),
    ),
    dh_real_termino_trabalho: parseTimestamp(
      cell(row, "DH_REAL_TERMINO_TRABALHO"),
    ),
    ds_janela_agendamento: parseText(cell(row, "DS_JANELA_AGENDAMENTO")),
    cd_user_abertura: parseText(cell(row, "CD_USER_ABERTURA")),
    cd_user_baixa: parseText(cell(row, "CD_USER_BAIXA")),
    servidor: parseText(cell(row, "SERVIDOR")),
    id_equipe: parseText(cell(row, "ID_EQUIPE")),
    segmentacao: parseText(cell(row, "SEGMENTACAO")),
    id_empr_execucao: parseText(cell(row, "ID_EMPR_EXECUCAO")),
    ds_prestadora_servico: parseText(cell(row, "DS_PRESTADORA_SERVICO")),
    produto_de: parseText(cell(row, "PRODUTO_DE")),
    produto_para: parseText(cell(row, "PRODUTO_PARA")),
    tipo_edificacao: parseText(cell(row, "TIPO_EDIFICACAO")),
    contrato_mestre: parseText(cell(row, "CONTRATO_MESTRE")),
    c_custo: parseText(cell(row, "C_CUSTO")),
    d_c_custo: parseText(cell(row, "D_C_CUSTO")),
    id_grp: parseText(cell(row, "ID_GRP")),
    id_grp_item: parseText(cell(row, "ID_GRP_ITEM")),
    tempo: parseMoney(cell(row, "TEMPO")),
    valor_hh: parseMoney(cell(row, "VALOR_HH")),
    codigo: parseText(cell(row, "CODIGO")),
    conta_contabil: parseText(cell(row, "CONTA_CONTABIL")),
    cnpj_empresa: parseText(cell(row, "CNPJ_EMPRESA")),
    qtde,
    dh_instal: parseTimestamp(cell(row, "DH_INSTAL")),
    tipo_empresa: parseText(cell(row, "TIPO_EMPRESA")),
    valor_servico: valor ?? 0,
    id_item: parseText(cell(row, "ID_ITEM")),
    id_item_hfc: parseText(cell(row, "ID_ITEM_HFC")),
    id_item_geral: parseText(cell(row, "ID_ITEM_GERAL")),
    cidade_apuracao: parseText(cell(row, "CIDADE_APURACAO")),
    fg_baixa: parseText(cell(row, "FG_BAIXA")),
    c_custo_hfc: parseText(cell(row, "C_CUSTO_HFC")),
    d_custo_hfc: parseText(cell(row, "D_CUSTO_HFC")),
    c_custo_geral: parseText(cell(row, "C_CUSTO_GERAL")),
    d_c_custo_geral: parseText(cell(row, "D_C_CUSTO_GERAL")),
    modelo_eqp: parseText(cell(row, "MODELO_EQP")),
    tipo_eqp: parseText(cell(row, "TIPO_EQP")),
    node_ativo: parseText(cell(row, "NODE_ATIVO")),
    dt_acss_now: parseTimestamp(cell(row, "DT_ACSS_NOW")),
    dt_acss_telco: parseTimestamp(cell(row, "DT_ACSS_TELCO")),
    fg_pagto_now_telco: parseText(cell(row, "FG_PAGTO_NOW_TELCO")),
    cd_ibge: parseText(cell(row, "CD_IBGE")),
    ds_centro_custo_sap: parseText(cell(row, "DS_CENTRO_CUSTO_SAP")),
    unidade_negocio: parseText(cell(row, "UNIDADE_NEGOCIO")),
  };
}

function toInsertPayload(r: AnaliticoHistoricoRow): Record<string, unknown> {
  return {
    data_base: r.data_base,
    nm_cidade: r.nm_cidade,
    nm_subcluster: r.nm_subcluster,
    nm_cluster: r.nm_cluster,
    nm_regional: r.nm_regional,
    cd_operadora: r.cd_operadora,
    nr_contrato: r.nr_contrato || null,
    cd_os: r.cd_os || null,
    id_tipo_os: r.id_tipo_os,
    ds_tipo_os: r.ds_tipo_os,
    cd_baixa: r.cd_baixa,
    tipo_os_consolid: r.tipo_os_consolid,
    terminal: r.terminal,
    tipo_term: r.tipo_term,
    dt_agendamento: r.dt_agendamento,
    dh_abertura: r.dh_abertura,
    dh_baixa: r.dh_baixa,
    dh_real_inicio_trabalho: r.dh_real_inicio_trabalho,
    dh_real_termino_trabalho: r.dh_real_termino_trabalho,
    ds_janela_agendamento: r.ds_janela_agendamento,
    cd_user_abertura: r.cd_user_abertura,
    cd_user_baixa: r.cd_user_baixa,
    servidor: r.servidor,
    id_equipe: r.id_equipe,
    segmentacao: r.segmentacao,
    id_empr_execucao: r.id_empr_execucao,
    ds_prestadora_servico: r.ds_prestadora_servico,
    produto_de: r.produto_de,
    produto_para: r.produto_para,
    tipo_edificacao: r.tipo_edificacao,
    contrato_mestre: r.contrato_mestre,
    c_custo: r.c_custo,
    d_c_custo: r.d_c_custo,
    id_grp: r.id_grp,
    id_grp_item: r.id_grp_item,
    tempo: r.tempo,
    valor_hh: r.valor_hh,
    codigo: r.codigo,
    conta_contabil: r.conta_contabil,
    cnpj_empresa: r.cnpj_empresa,
    qtde: r.qtde,
    dh_instal: r.dh_instal,
    tipo_empresa: r.tipo_empresa,
    valor_servico: r.valor_servico,
    id_item: r.id_item,
    id_item_hfc: r.id_item_hfc,
    id_item_geral: r.id_item_geral,
    cidade_apuracao: r.cidade_apuracao,
    fg_baixa: r.fg_baixa,
    c_custo_hfc: r.c_custo_hfc,
    d_custo_hfc: r.d_custo_hfc,
    c_custo_geral: r.c_custo_geral,
    d_c_custo_geral: r.d_c_custo_geral,
    modelo_eqp: r.modelo_eqp,
    tipo_eqp: r.tipo_eqp,
    node_ativo: r.node_ativo,
    dt_acss_now: r.dt_acss_now,
    dt_acss_telco: r.dt_acss_telco,
    fg_pagto_now_telco: r.fg_pagto_now_telco,
    cd_ibge: r.cd_ibge,
    ds_centro_custo_sap: r.ds_centro_custo_sap,
    unidade_negocio: r.unidade_negocio,
  };
}

function mapDbRowToAnalitico(row: Record<string, unknown>): AnaliticoHistoricoRow {
  return {
    id: row.id != null ? String(row.id) : undefined,
    data_base: Number(row.data_base) || 0,
    nm_cidade: row.nm_cidade != null ? String(row.nm_cidade) : null,
    nm_subcluster: row.nm_subcluster != null ? String(row.nm_subcluster) : null,
    nm_cluster: row.nm_cluster != null ? String(row.nm_cluster) : null,
    nm_regional: row.nm_regional != null ? String(row.nm_regional) : null,
    cd_operadora:
      row.cd_operadora == null ? null : Number(row.cd_operadora),
    nr_contrato: String(row.nr_contrato ?? ""),
    cd_os: String(row.cd_os ?? ""),
    id_tipo_os: row.id_tipo_os == null ? null : Number(row.id_tipo_os),
    ds_tipo_os: row.ds_tipo_os != null ? String(row.ds_tipo_os) : null,
    cd_baixa: row.cd_baixa == null ? null : Number(row.cd_baixa),
    tipo_os_consolid:
      row.tipo_os_consolid != null ? String(row.tipo_os_consolid) : null,
    terminal: row.terminal != null ? String(row.terminal) : null,
    tipo_term: row.tipo_term != null ? String(row.tipo_term) : null,
    dt_agendamento:
      row.dt_agendamento != null ? String(row.dt_agendamento) : null,
    dh_abertura: row.dh_abertura != null ? String(row.dh_abertura) : null,
    dh_baixa: row.dh_baixa != null ? String(row.dh_baixa) : null,
    dh_real_inicio_trabalho:
      row.dh_real_inicio_trabalho != null
        ? String(row.dh_real_inicio_trabalho)
        : null,
    dh_real_termino_trabalho:
      row.dh_real_termino_trabalho != null
        ? String(row.dh_real_termino_trabalho)
        : null,
    ds_janela_agendamento:
      row.ds_janela_agendamento != null
        ? String(row.ds_janela_agendamento)
        : null,
    cd_user_abertura:
      row.cd_user_abertura != null ? String(row.cd_user_abertura) : null,
    cd_user_baixa:
      row.cd_user_baixa != null ? String(row.cd_user_baixa) : null,
    servidor: row.servidor != null ? String(row.servidor) : null,
    id_equipe: row.id_equipe != null ? String(row.id_equipe) : null,
    segmentacao: row.segmentacao != null ? String(row.segmentacao) : null,
    id_empr_execucao:
      row.id_empr_execucao != null ? String(row.id_empr_execucao) : null,
    ds_prestadora_servico:
      row.ds_prestadora_servico != null
        ? String(row.ds_prestadora_servico)
        : null,
    produto_de: row.produto_de != null ? String(row.produto_de) : null,
    produto_para: row.produto_para != null ? String(row.produto_para) : null,
    tipo_edificacao:
      row.tipo_edificacao != null ? String(row.tipo_edificacao) : null,
    contrato_mestre:
      row.contrato_mestre != null ? String(row.contrato_mestre) : null,
    c_custo: row.c_custo != null ? String(row.c_custo) : null,
    d_c_custo: row.d_c_custo != null ? String(row.d_c_custo) : null,
    id_grp: row.id_grp != null ? String(row.id_grp) : null,
    id_grp_item: row.id_grp_item != null ? String(row.id_grp_item) : null,
    tempo: row.tempo == null ? null : Number(row.tempo),
    valor_hh: row.valor_hh == null ? null : Number(row.valor_hh),
    codigo: row.codigo != null ? String(row.codigo) : null,
    conta_contabil:
      row.conta_contabil != null ? String(row.conta_contabil) : null,
    cnpj_empresa: row.cnpj_empresa != null ? String(row.cnpj_empresa) : null,
    qtde: row.qtde == null ? null : Number(row.qtde),
    dh_instal: row.dh_instal != null ? String(row.dh_instal) : null,
    tipo_empresa: row.tipo_empresa != null ? String(row.tipo_empresa) : null,
    valor_servico: Number(row.valor_servico) || 0,
    id_item: row.id_item != null ? String(row.id_item) : null,
    id_item_hfc: row.id_item_hfc != null ? String(row.id_item_hfc) : null,
    id_item_geral:
      row.id_item_geral != null ? String(row.id_item_geral) : null,
    cidade_apuracao:
      row.cidade_apuracao != null ? String(row.cidade_apuracao) : null,
    fg_baixa: row.fg_baixa != null ? String(row.fg_baixa) : null,
    c_custo_hfc: row.c_custo_hfc != null ? String(row.c_custo_hfc) : null,
    d_custo_hfc: row.d_custo_hfc != null ? String(row.d_custo_hfc) : null,
    c_custo_geral:
      row.c_custo_geral != null ? String(row.c_custo_geral) : null,
    d_c_custo_geral:
      row.d_c_custo_geral != null ? String(row.d_c_custo_geral) : null,
    modelo_eqp: row.modelo_eqp != null ? String(row.modelo_eqp) : null,
    tipo_eqp: row.tipo_eqp != null ? String(row.tipo_eqp) : null,
    node_ativo: row.node_ativo != null ? String(row.node_ativo) : null,
    dt_acss_now: row.dt_acss_now != null ? String(row.dt_acss_now) : null,
    dt_acss_telco:
      row.dt_acss_telco != null ? String(row.dt_acss_telco) : null,
    fg_pagto_now_telco:
      row.fg_pagto_now_telco != null ? String(row.fg_pagto_now_telco) : null,
    cd_ibge: row.cd_ibge != null ? String(row.cd_ibge) : null,
    ds_centro_custo_sap:
      row.ds_centro_custo_sap != null ? String(row.ds_centro_custo_sap) : null,
    unidade_negocio:
      row.unidade_negocio != null ? String(row.unidade_negocio) : null,
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

  const payload = rows.map(toInsertPayload);
  const chunkSize = 200;
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
    .select("*")
    .order("dh_baixa", { ascending: true })
    .order("cd_os", { ascending: true });

  // Filtro temporal oficial: DH_BAIXA (não DATA_BASE).
  if (filtro.ano !== null && filtro.mes !== null) {
    const ini = `${filtro.ano}-${String(filtro.mes).padStart(2, "0")}-01T00:00:00`;
    const mesSeguinte = filtro.mes === 12 ? 1 : filtro.mes + 1;
    const anoSeguinte = filtro.mes === 12 ? filtro.ano + 1 : filtro.ano;
    const fim = `${anoSeguinte}-${String(mesSeguinte).padStart(2, "0")}-01T00:00:00`;
    query = query.gte("dh_baixa", ini).lt("dh_baixa", fim);
  } else if (filtro.ano !== null) {
    const ini = `${filtro.ano}-01-01T00:00:00`;
    const fim = `${filtro.ano + 1}-01-01T00:00:00`;
    query = query.gte("dh_baixa", ini).lt("dh_baixa", fim);
  }

  const { data, error } = await query;
  if (error) throw error;

  const mapped = (data ?? []).map((row) =>
    mapDbRowToAnalitico(row as Record<string, unknown>),
  );
  // Reforço no client (parse seguro de strings/ISO).
  return filtrarAnaliticoPorDhBaixa(mapped, filtro);
}

/** Extrai ano/mês de DH_BAIXA (ISO, BR ou timestamp). */
export function parseDhBaixaAnoMes(
  value: string | null | undefined,
): { ano: number; mes: number; dia: number } | null {
  if (value == null || String(value).trim() === "") return null;
  const s = String(value).trim();

  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const ano = Number(iso[1]);
    const mes = Number(iso[2]);
    const dia = Number(iso[3]);
    if (ano && mes >= 1 && mes <= 12) return { ano, mes, dia };
  }

  const br = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    const dia = Number(br[1]);
    const mes = Number(br[2]);
    const ano = Number(br[3]);
    if (ano && mes >= 1 && mes <= 12) return { ano, mes, dia };
  }

  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) {
    return {
      ano: d.getFullYear(),
      mes: d.getMonth() + 1,
      dia: d.getDate(),
    };
  }

  return null;
}

/** Filtra Analítico pelo mês/ano (e dia, se houver) de DH_BAIXA. */
export function filtrarAnaliticoPorDhBaixa(
  rows: AnaliticoHistoricoRow[],
  filtro: { ano: number | null; mes: number | null; dia?: number | null },
): AnaliticoHistoricoRow[] {
  if (filtro.ano === null && filtro.mes === null) return rows;

  return rows.filter((row) => {
    const parts = parseDhBaixaAnoMes(row.dh_baixa);
    if (!parts) return false;
    if (filtro.ano !== null && parts.ano !== filtro.ano) return false;
    if (filtro.mes !== null && parts.mes !== filtro.mes) return false;
    if (filtro.dia != null && parts.dia !== filtro.dia) {
      return false;
    }
    return true;
  });
}

/** Formata DH_BAIXA para exibição DD/MM/YYYY. */
export function formatDhBaixaDisplay(
  value: string | null | undefined,
): string {
  if (value == null || String(value).trim() === "") return "—";
  const parts = parseDhBaixaAnoMes(value);
  if (!parts) return String(value);
  return `${String(parts.dia).padStart(2, "0")}/${String(parts.mes).padStart(2, "0")}/${parts.ano}`;
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

/** Overwrite idempotente: apaga competências e reinsere O.S. achatadas (1 linha = 1 OS). */
export async function replaceToaImportacoes(
  chamados: ToaChamadoProcessado[],
): Promise<{ competencias: number[]; totalOs: number; totalNotas: number }> {
  const flat = flattenChamadosParaImportacaoFlat(chamados);
  const competencias = [
    ...new Set(flat.map((r) => r.competencia).filter((c) => c > 0)),
  ].sort((a, b) => a - b);

  if (competencias.length === 0 || flat.length === 0) {
    return { competencias: [], totalOs: 0, totalNotas: 0 };
  }

  const supabase = getSupabaseClient();
  const { error: delError } = await supabase
    .from("toa_importacoes")
    .delete()
    .in("competencia", competencias);
  if (delError) throw delError;

  const chunkSize = 200;
  for (let i = 0; i < flat.length; i += chunkSize) {
    const chunk = flat.slice(i, i + chunkSize);
    const { error } = await supabase.from("toa_importacoes").insert(chunk);
    if (error) throw error;
  }

  const totalNotas = new Set(flat.map((r) => r.numero_wo)).size;
  return { competencias, totalOs: flat.length, totalNotas };
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

/**
 * Busca O.S. flat do TOA (1 linha = 1 O.S.).
 * Use `regroupFlatRowsToChamados` quando precisar da visão por WO.
 */
export async function fetchToaImportacoes(filtro: {
  ano: number | null;
  mes: number | null;
  dia: number | null;
}): Promise<ToaImportacaoRow[]> {
  const supabase = getSupabaseClient();
  let query = supabase
    .from("toa_importacoes")
    .select(
      "id, competencia, data_toa, nome_tecnico, login_tecnico, numero_wo, contrato, numero_os, tipo_os, cod_baixa, status_os, status_nota, status_atividade, imported_at",
    )
    .order("data_toa", { ascending: true });

  if (filtro.ano !== null && filtro.mes !== null) {
    query = query.eq("competencia", competenciaYm(filtro.ano, filtro.mes));
  } else if (filtro.ano !== null) {
    const ini = filtro.ano * 100 + 1;
    const fim = filtro.ano * 100 + 12;
    query = query.gte("competencia", ini).lte("competencia", fim);
  }

  if (filtro.dia !== null && filtro.ano !== null && filtro.mes !== null) {
    const iso = `${filtro.ano}-${String(filtro.mes).padStart(2, "0")}-${String(filtro.dia).padStart(2, "0")}`;
    query = query.eq("data_toa", iso);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id ? String(row.id) : undefined,
    competencia: Number(row.competencia) || 0,
    data_toa: String(row.data_toa ?? "").slice(0, 10),
    nome_tecnico: String(row.nome_tecnico ?? "").trim(),
    login_tecnico: normalizeToaLogin(String(row.login_tecnico ?? "")),
    numero_wo: String(row.numero_wo ?? ""),
    contrato: String(row.contrato ?? ""),
    numero_os: String(row.numero_os ?? ""),
    tipo_os: String(row.tipo_os ?? ""),
    cod_baixa:
      row.cod_baixa == null || row.cod_baixa === ""
        ? null
        : Number(row.cod_baixa),
    status_os: String(row.status_os ?? ""),
    status_nota:
      String(row.status_nota ?? "").trim() === "Produtiva"
        ? "Produtiva"
        : "Improdutiva",
    status_atividade: String(row.status_atividade ?? "").trim(),
    imported_at: row.imported_at ? String(row.imported_at) : undefined,
  }));
}

/** @deprecated Preferir fetchToaImportacoes (flat) + regroupFlatRowsToChamados. */
export async function fetchToaImportacoesComoChamados(filtro: {
  ano: number | null;
  mes: number | null;
  dia: number | null;
}): Promise<ToaChamadoProcessado[]> {
  return regroupFlatRowsToChamados(await fetchToaImportacoes(filtro));
}
