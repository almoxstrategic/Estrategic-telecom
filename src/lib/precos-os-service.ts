import { getSupabaseClient } from "./supabase";
import { normalizeTipoOs } from "./toa-store";

/** Linha da tabela de preços (RESUMO + ATIVIDADES NO TOA + Valor). */
export type PrecoOs = {
  /** Categoria/resumo (coluna RESUMO). */
  tipo: string;
  /** Atividade exata do TOA (coluna ATIVIDADES NO TOA / Tipo O.S). */
  tipoAtividade: string;
  valor: number;
};

/** Mapa indexado por Tipo de Atividade normalizado. */
export type PrecosOsMap = Record<string, PrecoOs>;

export function valorPrecoFromMap(
  precosOs: PrecosOsMap,
  tipoAtividade: string,
): number {
  return precosOs[normalizeTipoOs(tipoAtividade)]?.valor ?? 0;
}

export async function fetchPrecosOs(): Promise<PrecosOsMap> {
  const supabase = getSupabaseClient();
  const primario = await supabase
    .from("precos_os")
    .select("tipo, tipo_os, valor")
    .order("tipo_os", { ascending: true });

  const data =
    primario.error && /tipo/i.test(primario.error.message)
      ? (
          await supabase
            .from("precos_os")
            .select("tipo_os, valor")
            .order("tipo_os", { ascending: true })
        ).data
      : primario.data;

  if (primario.error && !/tipo/i.test(primario.error.message)) {
    throw primario.error;
  }

  return Object.fromEntries(
    (data ?? []).map((row) => {
      const tipoAtividade = String(row.tipo_os ?? "");
      return [
        normalizeTipoOs(tipoAtividade),
        {
          tipo: String((row as { tipo?: string }).tipo ?? "").trim(),
          tipoAtividade,
          valor: Number(row.valor) || 0,
        } satisfies PrecoOs,
      ];
    }),
  );
}

export async function upsertPrecosOs(precos: PrecoOs[]): Promise<void> {
  if (precos.length === 0) return;

  const deduplicados = new Map<string, PrecoOs>();
  for (const preco of precos) {
    const tipoAtividade = preco.tipoAtividade.trim();
    const chave = normalizeTipoOs(tipoAtividade);
    if (!chave) continue;

    const valor = Number(preco.valor);
    if (!Number.isFinite(valor) || valor < 0) {
      throw new Error(`Valor inválido para ${tipoAtividade}.`);
    }

    deduplicados.set(chave, {
      tipo: preco.tipo.trim(),
      tipoAtividade,
      valor,
    });
  }

  const payload = Array.from(deduplicados.values()).map((preco) => ({
    tipo: preco.tipo,
    tipo_os: preco.tipoAtividade,
    valor: preco.valor,
    updated_at: new Date().toISOString(),
  }));
  if (payload.length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("precos_os")
    .upsert(payload, { onConflict: "tipo_os" });

  if (error && /tipo/i.test(error.message)) {
    const payloadSemTipo = payload.map(({ tipo: _tipo, ...rest }) => rest);
    const retry = await supabase
      .from("precos_os")
      .upsert(payloadSemTipo, { onConflict: "tipo_os" });
    if (retry.error) throw retry.error;
    return;
  }

  if (error) throw error;
}
