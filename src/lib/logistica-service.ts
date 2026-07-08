import { getSupabaseClient } from "./supabase";
import { parseLocaleNumber, parseQtdBaixada } from "./parse-locale-number";
import { normalizeMaterialCode } from "./material-code";
import type {
  ConsumoItemCritico,
  ConsumoTecnicoItem,
  DimMaterial,
  DimMaterialRow,
  KpisConsumo,
  KpisDetalheItem,
  KpisDetalheWo,
  KpisDetalheWoMaterial,
  KpisDetalheWoSelecionada,
  KpisFiltro,
  PendenciaEvidencia,
  PeriodoConsumo,
  TopConsumidorMaterial,
  UpsertResult,
  WoCabecalhoRow,
  WoConsumoRow,
} from "./logistica-types";

function countUpsert(rows: { length: number }, existingCount: number): UpsertResult {
  const total = rows.length;
  const updated = Math.min(existingCount, total);
  return { inserted: total - updated, updated };
}

function consumoKey(workOrderId: string, material: string): string {
  return `${workOrderId.trim()}::${normalizeMaterialCode(material)}`;
}

/** Mescla linhas duplicadas (WO + Material) no mesmo lote — evita erro 21000 no upsert. */
function dedupeWoConsumoRows(rows: WoConsumoRow[]): { rows: WoConsumoRow[]; merged: number } {
  const map = new Map<string, WoConsumoRow>();
  let merged = 0;

  for (const row of rows) {
    const key = consumoKey(row.work_order_id, row.material);
    const existing = map.get(key);
    if (existing) {
      merged++;
      map.set(key, {
        work_order_id: existing.work_order_id,
        id_tecnico: row.id_tecnico || existing.id_tecnico,
        material: existing.material,
        descr_material: row.descr_material || existing.descr_material,
        qtd_baixada: existing.qtd_baixada + row.qtd_baixada,
        data_atendimento: row.data_atendimento ?? existing.data_atendimento,
      });
    } else {
      map.set(key, {
        ...row,
        material: normalizeMaterialCode(row.material),
        qtd_baixada: parseQtdBaixada(row.qtd_baixada),
      });
    }
  }

  return { rows: [...map.values()], merged };
}

function dedupeWoCabecalhoRows(rows: WoCabecalhoRow[]): WoCabecalhoRow[] {
  const map = new Map<string, WoCabecalhoRow>();
  for (const row of rows) {
    map.set(row.work_order_id.trim(), { ...row, work_order_id: row.work_order_id.trim() });
  }
  return [...map.values()];
}

const UPSERT_BATCH_SIZE = 500;

async function upsertInBatches<T extends Record<string, unknown>>(
  table: "wos_cabecalho" | "wos_consumo" | "dim_materiais",
  payload: T[],
  onConflict: string,
): Promise<void> {
  const supabase = getSupabaseClient();
  for (let i = 0; i < payload.length; i += UPSERT_BATCH_SIZE) {
    const chunk = payload.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

async function insertInBatches<T extends Record<string, unknown>>(
  table: "wos_cabecalho",
  payload: T[],
): Promise<void> {
  const supabase = getSupabaseClient();
  for (let i = 0; i < payload.length; i += UPSERT_BATCH_SIZE) {
    const chunk = payload.slice(i, i + UPSERT_BATCH_SIZE);
    const { error } = await supabase.from(table).insert(chunk);
    if (error) throw error;
  }
}

export async function replaceWoCabecalho(rows: WoCabecalhoRow[]): Promise<{ inserted: number }> {
  const supabase = getSupabaseClient();

  const { error: deleteError } = await supabase
    .from("wos_cabecalho")
    .delete()
    .neq("work_order_id", "");

  if (deleteError) throw deleteError;
  if (rows.length === 0) return { inserted: 0 };

  const deduped = dedupeWoCabecalhoRows(rows);
  const payload = deduped.map((r) => ({
    work_order_id: r.work_order_id,
    id_tecnico: r.id_tecnico,
    status: r.status,
    sla: r.sla,
    updated_at: new Date().toISOString(),
  }));

  await insertInBatches("wos_cabecalho", payload);
  return { inserted: deduped.length };
}

/** @deprecated Use replaceWoCabecalho para full load do cabeçalho. */
export async function upsertWoCabecalho(rows: WoCabecalhoRow[]): Promise<UpsertResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const deduped = dedupeWoCabecalhoRows(rows);
  const supabase = getSupabaseClient();
  const ids = deduped.map((r) => r.work_order_id);

  const { count: existingCount } = await supabase
    .from("wos_cabecalho")
    .select("work_order_id", { count: "exact", head: true })
    .in("work_order_id", ids);

  const payload = deduped.map((r) => ({
    work_order_id: r.work_order_id,
    id_tecnico: r.id_tecnico,
    status: r.status,
    sla: r.sla,
    updated_at: new Date().toISOString(),
  }));

  await upsertInBatches("wos_cabecalho", payload, "work_order_id");
  return countUpsert(deduped, existingCount ?? 0);
}

export async function upsertWoConsumo(
  rows: WoConsumoRow[],
): Promise<UpsertResult & { mergedDuplicates: number }> {
  if (rows.length === 0) return { inserted: 0, updated: 0, mergedDuplicates: 0 };

  const { rows: deduped, merged } = dedupeWoConsumoRows(rows);
  const supabase = getSupabaseClient();

  const { data: existing } = await supabase
    .from("wos_consumo")
    .select("work_order_id, material")
    .in("work_order_id", [...new Set(deduped.map((r) => r.work_order_id))]);

  const existingKeys = new Set(
    (existing ?? []).map((r) => consumoKey(r.work_order_id, r.material)),
  );
  const updated = deduped.filter((r) =>
    existingKeys.has(consumoKey(r.work_order_id, r.material)),
  ).length;

  const payload = deduped.map((r) => ({
    work_order_id: r.work_order_id.trim(),
    id_tecnico: r.id_tecnico,
    material: normalizeMaterialCode(r.material),
    descr_material: r.descr_material.trim(),
    qtd_baixada: parseQtdBaixada(r.qtd_baixada),
    data_atendimento: r.data_atendimento,
    updated_at: new Date().toISOString(),
  }));

  await upsertInBatches("wos_consumo", payload, "work_order_id,material");
  return { inserted: deduped.length - updated, updated, mergedDuplicates: merged };
}

function toRpcFiltro(filtro?: KpisFiltro): { p_mes: number | null; p_ano: number | null } {
  const mes = filtro?.mes ?? null;
  const ano = filtro?.ano ?? null;
  if (mes === null || ano === null) {
    return { p_mes: null, p_ano: null };
  }
  return { p_mes: mes, p_ano: ano };
}

function normalizeKpis(raw: KpisConsumo): KpisConsumo {
  return {
    total_itens: parseQtdBaixada(raw.total_itens),
    total_wos: parseQtdBaixada(raw.total_wos),
    top_materiais: (raw.top_materiais ?? []).map((m) => ({
      descricao: m.descricao,
      sku: m.sku,
      total: parseQtdBaixada(m.total),
    })),
    top_tecnicos: (raw.top_tecnicos ?? []).map((t) => ({
      id_tecnico: t.id_tecnico,
      nome_tecnico: t.nome_tecnico ?? "",
      total: parseQtdBaixada(t.total),
    })),
  };
}

export async function fetchKpisConsumo(filtro?: KpisFiltro): Promise<KpisConsumo> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_kpis_consumo", {
    p_mes,
    p_ano,
  });
  if (error) throw error;

  return normalizeKpis((data ?? {}) as KpisConsumo);
}

export async function fetchKpisDetalheWos(filtro?: KpisFiltro): Promise<KpisDetalheWo[]> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_kpis_detalhe_wos", { p_mes, p_ano });
  if (error) throw error;

  return (data ?? []).map((row: KpisDetalheWo) => ({
    work_order_id: row.work_order_id,
    id_tecnico: row.id_tecnico,
    nome_tecnico: row.nome_tecnico ?? "",
    total_itens: parseQtdBaixada(row.total_itens),
    data_atendimento: row.data_atendimento ?? null,
  }));
}

export async function fetchKpisDetalheItens(filtro?: KpisFiltro): Promise<KpisDetalheItem[]> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_kpis_detalhe_itens", { p_mes, p_ano });
  if (error) throw error;

  return (data ?? []).map((row: KpisDetalheItem) => ({
    material: row.material,
    descr_material: row.descr_material,
    total: parseQtdBaixada(row.total),
  }));
}

export async function fetchKpisDetalheWoMateriais(
  workOrderId: string,
  filtro?: KpisFiltro,
): Promise<KpisDetalheWoMaterial[]> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_kpis_detalhe_wo_materiais", {
    p_work_order_id: workOrderId,
    p_mes,
    p_ano,
  });
  if (error) throw error;

  return (data ?? []).map((row: KpisDetalheWoMaterial) => ({
    material: row.material,
    descr_material: row.descr_material,
    qtd_baixada: parseQtdBaixada(row.qtd_baixada),
  }));
}

export async function fetchConsumoTecnicoDetalhe(
  idTecnico: string,
  filtro?: KpisFiltro,
): Promise<ConsumoTecnicoItem[]> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_consumo_tecnico_detalhe", {
    p_id_tecnico: idTecnico,
    p_mes,
    p_ano,
  });
  if (error) throw error;

  return (data ?? []).map((row: ConsumoTecnicoItem) => ({
    material: row.material,
    descr_material: row.descr_material,
    qtd_baixada: parseQtdBaixada(row.qtd_baixada),
  }));
}

export async function fetchConsumoItensCriticos(
  materiais: string[],
  filtro?: KpisFiltro,
): Promise<ConsumoItemCritico[]> {
  if (materiais.length === 0) return [];

  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_consumo_itens_criticos", {
    p_materiais: materiais,
    p_mes,
    p_ano,
  });
  if (error) throw error;

  return (data ?? []).map((row: ConsumoItemCritico) => ({
    material: row.material,
    descr_material: row.descr_material,
    total: parseQtdBaixada(row.total),
  }));
}

export async function fetchTopConsumidoresMaterial(
  material: string,
  filtro?: KpisFiltro,
): Promise<TopConsumidorMaterial[]> {
  const supabase = getSupabaseClient();
  const { p_mes, p_ano } = toRpcFiltro(filtro);
  const { data, error } = await supabase.rpc("get_top_consumidores_material", {
    p_material: material,
    p_mes,
    p_ano,
  });
  if (error) throw error;

  return (data ?? []).map((row: TopConsumidorMaterial) => ({
    id_tecnico: row.id_tecnico,
    nome_tecnico: row.nome_tecnico ?? "",
    total: parseQtdBaixada(row.total),
  }));
}

export async function fetchPeriodosConsumo(): Promise<PeriodoConsumo[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_periodos_consumo");
  if (error) throw error;

  return (data ?? []).map((row: PeriodoConsumo) => ({
    mes: Number(row.mes),
    ano: Number(row.ano),
  }));
}

export async function searchDimMateriais(
  query: string,
  limit = 40,
): Promise<DimMaterial[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("search_dim_materiais", {
    p_query: query.trim(),
    p_limit: limit,
  });
  if (error) throw error;

  return (data ?? []).map((row: DimMaterial) => ({
    material: normalizeMaterialCode(row.material),
    descr_material: row.descr_material.trim(),
  }));
}

function dedupeDimMateriaisRows(rows: DimMaterialRow[]): DimMaterialRow[] {
  const map = new Map<string, DimMaterialRow>();
  for (const row of rows) {
    const material = normalizeMaterialCode(row.material);
    if (!material) continue;
    map.set(material, {
      material,
      descr_material: row.descr_material.trim(),
    });
  }
  return [...map.values()];
}

export async function upsertDimMateriais(rows: DimMaterialRow[]): Promise<UpsertResult> {
  if (rows.length === 0) return { inserted: 0, updated: 0 };

  const deduped = dedupeDimMateriaisRows(rows);
  const supabase = getSupabaseClient();
  const ids = deduped.map((r) => r.material);

  const { count: existingCount } = await supabase
    .from("dim_materiais")
    .select("material", { count: "exact", head: true })
    .in("material", ids);

  const payload = deduped.map((r) => ({
    material: r.material,
    descr_material: r.descr_material,
    updated_at: new Date().toISOString(),
  }));

  await upsertInBatches("dim_materiais", payload, "material");
  return countUpsert(deduped, existingCount ?? 0);
}

export async function fetchPendenciasEvidencias(): Promise<PendenciaEvidencia[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_pendencias_evidencias");
  if (error) throw error;

  return (data ?? []).map((row: PendenciaEvidencia) => ({
    work_order_id: row.work_order_id,
    id_tecnico: row.id_tecnico,
    nome_tecnico: row.nome_tecnico,
    login_tecnico: row.login_tecnico ?? "",
    sla: Number(row.sla),
    celular: row.celular ?? "",
    tem_evidencia: Boolean(row.tem_evidencia),
    evidencia_data_registro: row.evidencia_data_registro ?? null,
    numero_cobrancas: Number(row.numero_cobrancas ?? 0),
    ultima_data_cobranca: row.ultima_data_cobranca ?? null,
  }));
}

export async function incrementNumeroCobrancas(workOrderIds: string[]): Promise<number> {
  if (workOrderIds.length === 0) return 0;

  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("increment_numero_cobrancas", {
    p_work_order_ids: workOrderIds,
  });
  if (error) throw error;
  return Number(data ?? 0);
}
