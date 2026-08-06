import { getSupabaseClient } from "./supabase";
import { ATIVIDADES_TOA_CATALOGO } from "./toa-atividades-catalogo";
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

/**
 * Versão do catálogo calibrado. Incrementar a cada recalibração oficial
 * para forçar upsert no Supabase e invalidar flags antigas no localStorage.
 */
export const PRECOS_OS_CATALOGO_VERSION = 5;

const CATALOGO_SEED_PREFIX = "estrategic.kpis.precos_os_catalogo_v";
const CATALOGO_SEED_FLAG = `${CATALOGO_SEED_PREFIX}${PRECOS_OS_CATALOGO_VERSION}`;

export function valorPrecoFromMap(
  precosOs: PrecosOsMap,
  tipoAtividade: string,
): number {
  return precosOs[normalizeTipoOs(tipoAtividade)]?.valor ?? 0;
}

/** Catálogo oficial como mapa base (valores Number). */
export function precosCatalogoMap(): PrecosOsMap {
  return Object.fromEntries(
    ATIVIDADES_TOA_CATALOGO.map((entrada) => {
      const chave = normalizeTipoOs(entrada.tipoAtividade);
      return [
        chave,
        {
          tipo: entrada.tipo,
          tipoAtividade: entrada.tipoAtividade,
          valor: Number(entrada.valor) || 0,
        } satisfies PrecoOs,
      ];
    }),
  );
}

/**
 * Mescla catálogo oficial com preços do banco.
 * - catalogWins: catálogo sobrescreve chaves conhecidas (pós-resync).
 * - default: DB sobrescreve (edições do modal persistem).
 */
export function mergePrecosComCatalogo(
  db: PrecosOsMap,
  options?: { catalogWins?: boolean },
): PrecosOsMap {
  const catalogo = precosCatalogoMap();
  const merged: PrecosOsMap = { ...catalogo };

  for (const [chave, preco] of Object.entries(db)) {
    const base = catalogo[chave];
    if (options?.catalogWins && base) {
      continue;
    }
    merged[chave] = {
      tipo: preco.tipo.trim() || base?.tipo || "",
      tipoAtividade: preco.tipoAtividade || base?.tipoAtividade || chave,
      valor: Number(preco.valor) || 0,
    };
  }

  return merged;
}

function limparFlagsCatalogoAntigas(): void {
  if (typeof window === "undefined") return;
  const keys: string[] = [];
  for (let i = 0; i < window.localStorage.length; i++) {
    const key = window.localStorage.key(i);
    if (key?.startsWith(CATALOGO_SEED_PREFIX)) keys.push(key);
  }
  for (const key of keys) {
    if (key !== CATALOGO_SEED_FLAG) {
      window.localStorage.removeItem(key);
    }
  }
}

/** Payload do catálogo oficial para upsert. */
export function catalogoPrecosPayload(): PrecoOs[] {
  return ATIVIDADES_TOA_CATALOGO.map((entrada) => ({
    tipo: entrada.tipo,
    tipoAtividade: entrada.tipoAtividade,
    valor: Number(entrada.valor) || 0,
  }));
}

/**
 * Grava o catálogo calibrado no Supabase e marca a versão no localStorage.
 * Usado no boot e no botão "Recalcular Base".
 */
export async function forceResyncCatalogoPrecos(): Promise<PrecosOsMap> {
  limparFlagsCatalogoAntigas();
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(CATALOGO_SEED_FLAG);
  }

  await upsertPrecosOs(catalogoPrecosPayload());

  if (typeof window !== "undefined") {
    window.localStorage.setItem(CATALOGO_SEED_FLAG, "1");
  }

  return fetchPrecosOsFromDb({ catalogWins: true });
}

/** Garante que o catálogo oficial seja gravado quando a versão local está defasada. */
export async function ensureCatalogoPrecosSeeded(): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    limparFlagsCatalogoAntigas();
    if (window.localStorage.getItem(CATALOGO_SEED_FLAG) === "1") {
      return false;
    }
    await upsertPrecosOs(catalogoPrecosPayload());
    window.localStorage.setItem(CATALOGO_SEED_FLAG, "1");
    return true;
  } catch (err) {
    console.error("Falha ao seedar catálogo de preços TOA:", err);
    return false;
  }
}

async function fetchPrecosOsFromDb(options?: {
  catalogWins?: boolean;
}): Promise<PrecosOsMap> {
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

  const fromDb: PrecosOsMap = Object.fromEntries(
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

  return mergePrecosComCatalogo(fromDb, options);
}

export async function fetchPrecosOs(): Promise<PrecosOsMap> {
  const acabouDeSincronizar = await ensureCatalogoPrecosSeeded();
  return fetchPrecosOsFromDb({ catalogWins: acabouDeSincronizar });
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
