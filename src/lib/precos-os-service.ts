import { getSupabaseClient } from "./supabase";
import { normalizeTipoOs } from "./toa-store";

export type PrecoOs = {
  tipoOS: string;
  valor: number;
};

export type PrecosOsMap = Record<string, number>;

export async function fetchPrecosOs(): Promise<PrecosOsMap> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("precos_os")
    .select("tipo_os, valor")
    .order("tipo_os", { ascending: true });

  if (error) throw error;

  return Object.fromEntries(
    (data ?? []).map((row) => [
      normalizeTipoOs(String(row.tipo_os)),
      Number(row.valor) || 0,
    ]),
  );
}

export async function upsertPrecosOs(precos: PrecoOs[]): Promise<void> {
  if (precos.length === 0) return;

  const deduplicados = new Map<string, number>();
  for (const preco of precos) {
    const tipoOs = normalizeTipoOs(preco.tipoOS);
    if (!tipoOs) continue;

    const valor = Number(preco.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(`Valor inválido para ${preco.tipoOS}.`);
    }
    deduplicados.set(tipoOs, valor);
  }

  const payload = Array.from(deduplicados, ([tipo_os, valor]) => ({
    tipo_os,
    valor,
    updated_at: new Date().toISOString(),
  }));
  if (payload.length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("precos_os")
    .upsert(payload, { onConflict: "tipo_os" });

  if (error) throw error;
}
