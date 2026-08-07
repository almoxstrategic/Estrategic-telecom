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
  /** true = valor estimado por semelhança (não veio do Analítico). */
  isEstimado?: boolean;
};

/** Mapa indexado por Tipo de Atividade normalizado. */
export type PrecosOsMap = Record<string, PrecoOs>;

/**
 * Versão do catálogo calibrado. Incrementar a cada recalibração oficial
 * para forçar upsert no Supabase e invalidar flags antigas no localStorage.
 */
export const PRECOS_OS_CATALOGO_VERSION = 6;

const CATALOGO_SEED_PREFIX = "estrategic.kpis.precos_os_catalogo_v";
const CATALOGO_SEED_FLAG = `${CATALOGO_SEED_PREFIX}${PRECOS_OS_CATALOGO_VERSION}`;

const STOPWORDS_DESC = new Set([
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
  "A",
  "O",
  "EM",
  "NO",
  "NA",
  "COM",
  "PARA",
  "POR",
]);

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
          isEstimado: false,
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
      isEstimado: Boolean(preco.isEstimado),
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
    isEstimado: false,
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
    .select("tipo, tipo_os, valor, is_estimado")
    .order("tipo_os", { ascending: true });

  let data = primario.data;
  if (primario.error && /is_estimado/i.test(primario.error.message)) {
    const fallback = await supabase
      .from("precos_os")
      .select("tipo, tipo_os, valor")
      .order("tipo_os", { ascending: true });
    if (fallback.error && /tipo/i.test(fallback.error.message)) {
      const legacy = await supabase
        .from("precos_os")
        .select("tipo_os, valor")
        .order("tipo_os", { ascending: true });
      if (legacy.error) throw legacy.error;
      data = legacy.data;
    } else if (fallback.error) {
      throw fallback.error;
    } else {
      data = fallback.data;
    }
  } else if (primario.error && /tipo/i.test(primario.error.message)) {
    const retry = await supabase
      .from("precos_os")
      .select("tipo_os, valor, is_estimado")
      .order("tipo_os", { ascending: true });
    if (retry.error) throw retry.error;
    data = retry.data;
  } else if (primario.error) {
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
          isEstimado: Boolean(
            (row as { is_estimado?: boolean }).is_estimado,
          ),
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
      isEstimado: Boolean(preco.isEstimado),
    });
  }

  const payload = Array.from(deduplicados.values()).map((preco) => ({
    tipo: preco.tipo,
    tipo_os: preco.tipoAtividade,
    valor: preco.valor,
    is_estimado: Boolean(preco.isEstimado),
    updated_at: new Date().toISOString(),
  }));
  if (payload.length === 0) return;

  const supabase = getSupabaseClient();
  const { error } = await supabase
    .from("precos_os")
    .upsert(payload, { onConflict: "tipo_os" });

  if (error && /is_estimado/i.test(error.message)) {
    const semFlag = payload.map(({ is_estimado: _e, ...rest }) => rest);
    const retry = await supabase
      .from("precos_os")
      .upsert(semFlag, { onConflict: "tipo_os" });
    if (retry.error) throw retry.error;
    return;
  }

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

export type PrecoDescobertoModa = {
  idTipoOs: number;
  dsTipoOs: string;
  tipoAtividade: string;
  tipo: string;
  valorModa: number;
  frequencia: number;
  amostra: number;
  valoresDistintos: number;
};

function roundMoney(value: number): number {
  return Math.round(Number(value) * 100) / 100;
}

function catalogoPorCodigoTipoOs(): Map<
  number,
  { tipo: string; tipoAtividade: string }
> {
  const map = new Map<number, { tipo: string; tipoAtividade: string }>();
  for (const entrada of ATIVIDADES_TOA_CATALOGO) {
    const codigo = Number.parseInt(
      String(entrada.tipoAtividade).trim().match(/^(\d+)/)?.[1] ?? "",
      10,
    );
    if (!Number.isFinite(codigo) || codigo <= 0) continue;
    if (!map.has(codigo)) {
      map.set(codigo, {
        tipo: entrada.tipo,
        tipoAtividade: entrada.tipoAtividade,
      });
    }
  }
  return map;
}

/**
 * Moda estatística: valor_servico que mais se repete por id_tipo_os.
 * Empate → maior valor (tabela cheia preferida a glosa parcial).
 */
export function calcularModaValorServico(
  valores: number[],
): { moda: number; frequencia: number } {
  const freq = new Map<number, number>();
  for (const bruto of valores) {
    const v = roundMoney(bruto);
    if (!Number.isFinite(v) || v <= 0) continue;
    freq.set(v, (freq.get(v) ?? 0) + 1);
  }
  let moda = 0;
  let frequencia = 0;
  for (const [valor, n] of freq) {
    if (n > frequencia || (n === frequencia && valor > moda)) {
      moda = valor;
      frequencia = n;
    }
  }
  return { moda, frequencia };
}

function mediaValores(valores: number[]): number {
  const limpos = valores
    .map(roundMoney)
    .filter((v) => Number.isFinite(v) && v > 0);
  if (limpos.length === 0) return 0;
  return roundMoney(limpos.reduce((s, v) => s + v, 0) / limpos.length);
}

/** Tokens significativos da descrição (sem código numérico inicial). */
export function tokensDescricaoServico(descricao: string): Set<string> {
  const semCodigo = String(descricao ?? "")
    .replace(/^\s*\d+\s*[-–—:]?\s*/, "")
    .trim();
  const tokens = normalizeTipoOs(semCodigo)
    .split(/[^A-Z0-9]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS_DESC.has(t));
  return new Set(tokens);
}

/** Similaridade Jaccard entre descrições (0–1). */
export function similaridadeDescricaoServico(a: string, b: string): number {
  const ta = tokensDescricaoServico(a);
  const tb = tokensDescricaoServico(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) {
    if (tb.has(t)) inter += 1;
  }
  const uniao = ta.size + tb.size - inter;
  return uniao > 0 ? inter / uniao : 0;
}

export type PrecoEstimadoSemelhanca = {
  tipo: string;
  tipoAtividade: string;
  valor: number;
  metodo: "irmao" | "moda_categoria" | "media_categoria" | "irmao_global";
  referencia: string;
  similaridade: number;
};

/**
 * Estima preços zerados por semelhança de categoria + texto.
 * Não sobrescreve valores > 0.
 */
export function estimarPrecosZeradosPorSemelhanca(
  precos: PrecoOs[],
): PrecoEstimadoSemelhanca[] {
  const comPreco = precos.filter((p) => Number(p.valor) > 0);
  const semPreco = precos.filter(
    (p) => !Number.isFinite(Number(p.valor)) || Number(p.valor) <= 0,
  );
  if (comPreco.length === 0 || semPreco.length === 0) return [];

  const porTipo = new Map<string, PrecoOs[]>();
  for (const p of comPreco) {
    const key = normalizeTipoOs(p.tipo || "SERVICOS");
    const list = porTipo.get(key) ?? [];
    list.push(p);
    porTipo.set(key, list);
  }

  const estimados: PrecoEstimadoSemelhanca[] = [];

  for (const alvo of semPreco) {
    const tipoKey = normalizeTipoOs(alvo.tipo || "SERVICOS");
    const peers = porTipo.get(tipoKey) ?? [];

    if (peers.length > 0) {
      let best = peers[0]!;
      let bestScore = similaridadeDescricaoServico(
        alvo.tipoAtividade,
        best.tipoAtividade,
      );
      for (let i = 1; i < peers.length; i++) {
        const peer = peers[i]!;
        const score = similaridadeDescricaoServico(
          alvo.tipoAtividade,
          peer.tipoAtividade,
        );
        if (score > bestScore) {
          best = peer;
          bestScore = score;
        }
      }

      const valoresPeers = peers.map((p) => Number(p.valor));
      const { moda, frequencia } = calcularModaValorServico(valoresPeers);
      const media = mediaValores(valoresPeers);

      if (bestScore >= 0.25) {
        estimados.push({
          tipo: alvo.tipo,
          tipoAtividade: alvo.tipoAtividade,
          valor: roundMoney(Number(best.valor)),
          metodo: "irmao",
          referencia: best.tipoAtividade,
          similaridade: bestScore,
        });
      } else if (frequencia > 0 && moda > 0) {
        estimados.push({
          tipo: alvo.tipo,
          tipoAtividade: alvo.tipoAtividade,
          valor: moda,
          metodo: "moda_categoria",
          referencia: `moda(${alvo.tipo || "categoria"})`,
          similaridade: bestScore,
        });
      } else if (media > 0) {
        estimados.push({
          tipo: alvo.tipo,
          tipoAtividade: alvo.tipoAtividade,
          valor: media,
          metodo: "media_categoria",
          referencia: `media(${alvo.tipo || "categoria"})`,
          similaridade: bestScore,
        });
      }
      continue;
    }

    // Sem peers na categoria: irmão global por texto.
    let bestGlobal = comPreco[0]!;
    let bestGlobalScore = similaridadeDescricaoServico(
      alvo.tipoAtividade,
      bestGlobal.tipoAtividade,
    );
    for (let i = 1; i < comPreco.length; i++) {
      const peer = comPreco[i]!;
      const score = similaridadeDescricaoServico(
        alvo.tipoAtividade,
        peer.tipoAtividade,
      );
      if (score > bestGlobalScore) {
        bestGlobal = peer;
        bestGlobalScore = score;
      }
    }
    if (bestGlobalScore >= 0.35) {
      estimados.push({
        tipo: alvo.tipo,
        tipoAtividade: alvo.tipoAtividade,
        valor: roundMoney(Number(bestGlobal.valor)),
        metodo: "irmao_global",
        referencia: bestGlobal.tipoAtividade,
        similaridade: bestGlobalScore,
      });
    }
  }

  return estimados;
}

/**
 * Lê precos_os, estima zeros por semelhança e grava com is_estimado=true.
 */
export async function estimarEAtualizarPrecosPorSemelhanca(): Promise<{
  estimados: number;
  precos: PrecosOsMap;
  detalhes: PrecoEstimadoSemelhanca[];
}> {
  const atuais = await fetchPrecosOsFromDb({ catalogWins: false });
  const lista = Object.values(atuais);
  const detalhes = estimarPrecosZeradosPorSemelhanca(lista);
  if (detalhes.length === 0) {
    return { estimados: 0, precos: atuais, detalhes: [] };
  }

  await upsertPrecosOs(
    detalhes.map((d) => ({
      tipo: d.tipo,
      tipoAtividade: d.tipoAtividade,
      valor: d.valor,
      isEstimado: true,
    })),
  );

  const precos = await fetchPrecosOsFromDb({ catalogWins: false });
  return { estimados: detalhes.length, precos, detalhes };
}

/**
 * Descobre o preço de catálogo (moda) a partir de analitico_historico.
 * Agrupa por id_tipo_os; usa ds_tipo_os mais frequente; alinha rótulo ao DE/PARA TOA.
 */
export async function descobrirPrecosModaAnalitico(): Promise<
  PrecoDescobertoModa[]
> {
  const supabase = getSupabaseClient();
  const pageSize = 1000;
  let from = 0;
  const buckets = new Map<
    number,
    {
      valores: number[];
      dsFreq: Map<string, number>;
    }
  >();

  for (;;) {
    const { data, error } = await supabase
      .from("analitico_historico")
      .select("id_tipo_os, ds_tipo_os, valor_servico")
      .not("id_tipo_os", "is", null)
      .gt("valor_servico", 0)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);

    if (error) throw error;
    const rows = data ?? [];
    if (rows.length === 0) break;

    for (const row of rows) {
      const id = Number(row.id_tipo_os);
      const valor = Number(row.valor_servico);
      if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(valor) || valor <= 0) {
        continue;
      }
      const ds = String(row.ds_tipo_os ?? "").trim();
      let bucket = buckets.get(id);
      if (!bucket) {
        bucket = { valores: [], dsFreq: new Map() };
        buckets.set(id, bucket);
      }
      bucket.valores.push(valor);
      if (ds) bucket.dsFreq.set(ds, (bucket.dsFreq.get(ds) ?? 0) + 1);
    }

    if (rows.length < pageSize) break;
    from += pageSize;
  }

  const catalogo = catalogoPorCodigoTipoOs();
  const descobertos: PrecoDescobertoModa[] = [];

  for (const [idTipoOs, bucket] of buckets) {
    const { moda, frequencia } = calcularModaValorServico(bucket.valores);
    if (frequencia <= 0 || moda <= 0) continue;

    let dsTipoOs = "";
    let dsBest = 0;
    for (const [ds, n] of bucket.dsFreq) {
      if (n > dsBest || (n === dsBest && ds.length > dsTipoOs.length)) {
        dsTipoOs = ds;
        dsBest = n;
      }
    }

    const doCatalogo = catalogo.get(idTipoOs);
    const tipoAtividade =
      doCatalogo?.tipoAtividade ||
      (dsTipoOs ? `${idTipoOs} - ${dsTipoOs}` : String(idTipoOs));
    const tipo = doCatalogo?.tipo || "SERVIÇOS";
    const distintos = new Set(bucket.valores.map(roundMoney)).size;

    descobertos.push({
      idTipoOs,
      dsTipoOs,
      tipoAtividade,
      tipo,
      valorModa: moda,
      frequencia,
      amostra: bucket.valores.length,
      valoresDistintos: distintos,
    });
  }

  return descobertos.sort((a, b) => a.idTipoOs - b.idTipoOs);
}

/**
 * Descobre moda no Analítico, faz UPSERT (is_estimado=false) e em seguida
 * estima zeros restantes por semelhança (is_estimado=true).
 */
export async function atualizarCatalogoPrecosViaHistorico(): Promise<{
  atualizados: number;
  estimados: number;
  precos: PrecosOsMap;
  descobertos: PrecoDescobertoModa[];
}> {
  const descobertos = await descobrirPrecosModaAnalitico();
  if (descobertos.length > 0) {
    await upsertPrecosOs(
      descobertos.map((d) => ({
        tipo: d.tipo,
        tipoAtividade: d.tipoAtividade,
        valor: d.valorModa,
        isEstimado: false,
      })),
    );
  }

  // Evita que o seed estático do catálogo sobrescreva a calibração.
  if (typeof window !== "undefined") {
    limparFlagsCatalogoAntigas();
    window.localStorage.setItem(CATALOGO_SEED_FLAG, "1");
  }

  const estimativa = await estimarEAtualizarPrecosPorSemelhanca();

  return {
    atualizados: descobertos.length,
    estimados: estimativa.estimados,
    precos: estimativa.precos,
    descobertos,
  };
}
