import { getSupabaseClient } from "./supabase";
import type {
  KpisConsumo,
  PendenciaEvidencia,
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
  return `${workOrderId.trim()}::${material.trim()}`;
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
      });
    } else {
      map.set(key, { ...row });
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
  table: "wos_cabecalho" | "wos_consumo",
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
    material: r.material.trim(),
    descr_material: r.descr_material,
    qtd_baixada: r.qtd_baixada,
    updated_at: new Date().toISOString(),
  }));

  await upsertInBatches("wos_consumo", payload, "work_order_id,material");
  return { inserted: deduped.length - updated, updated, mergedDuplicates: merged };
}

export async function fetchKpisConsumo(): Promise<KpisConsumo> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_kpis_consumo");
  if (error) throw error;

  const raw = (data ?? {}) as KpisConsumo;
  return {
    total_itens: Number(raw.total_itens ?? 0),
    total_wos: Number(raw.total_wos ?? 0),
    top_materiais: (raw.top_materiais ?? []).map((m) => ({
      descricao: m.descricao,
      sku: m.sku,
      total: Number(m.total),
    })),
    top_tecnicos: (raw.top_tecnicos ?? []).map((t) => ({
      id_tecnico: t.id_tecnico,
      total: Number(t.total),
    })),
  };
}

export async function fetchPendenciasEvidencias(): Promise<PendenciaEvidencia[]> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.rpc("get_pendencias_evidencias");
  if (error) throw error;

  return (data ?? []).map((row: PendenciaEvidencia) => ({
    work_order_id: row.work_order_id,
    id_tecnico: row.id_tecnico,
    nome_tecnico: row.nome_tecnico,
    sla: Number(row.sla),
    celular: row.celular ?? "",
  }));
}
