/** Abas do formulário de campo (espelha AbaCampo em RelatorioRedeAcesso). */
export type PendenciaAba =
  | "RE"
  | "RC"
  | "equipamento"
  | "teste-optico"
  | "teste-otdr"
  | "teste-potencia"
  | "infraestrutura"
  | "medicoes"
  | "contatos";

/** Item de pendência granular persistido no payload do relatório. */
export type PendenciaItem = {
  /** Identificador estável por contrato (anti-duplicata no sininho). */
  itemId: string;
  /** Ex.: "Lançamento (RE) - Metragem de cabo" */
  label: string;
  aba: PendenciaAba;
  /** id do elemento DOM para scrollIntoView */
  anchorId: string;
  createdAt: string;
};

export type PendenciaItemDef = {
  itemId: string;
  label: string;
  aba: PendenciaAba;
  anchorId: string;
};

const SECAO_POR_SECTION: Record<string, string> = {
  local: "Local (RC)",
  cabos: "Lançamento",
  poste: "Poste",
  caixa: "Caixa de emenda",
  outras: "Outras fotos",
};

/** Sanitiza string para uso seguro como `id` no DOM. */
export function sanitizePendenciaDomId(raw: string): string {
  return raw.replace(/[^a-zA-Z0-9_-]/g, "-");
}

export function buildPendenciaItem(opts: {
  aba: PendenciaAba;
  secao: string;
  subbloco: string;
  key: string;
}): PendenciaItemDef {
  const itemId = `${opts.aba}.${opts.key}`;
  return {
    itemId,
    label: `${opts.secao} - ${opts.subbloco}`,
    aba: opts.aba,
    anchorId: `pendencia-${sanitizePendenciaDomId(itemId)}`,
  };
}

/** Âncora estável do card de metragem (independe do índice na lista). */
export function anchorIdMetragemCabo(aba: "RE" | "RC", caboId: string): string {
  return `pendencia-metragem-${aba}-${sanitizePendenciaDomId(caboId)}`;
}

export function parseMetragemCaboItemId(
  itemId: string,
): { aba: "RE" | "RC"; caboId: string } | null {
  const m = itemId.match(/^(RE|RC)\.lancamento\.metragem\.(.+)$/);
  if (!m) return null;
  const caboId = m[2]?.trim();
  if (!caboId) return null;
  return { aba: m[1] as "RE" | "RC", caboId };
}

/** Candidatos de id DOM + fallback de seção para navegação do sininho. */
export function resolvePendenciaNavTargets(item: {
  itemId: string;
  anchorId: string;
}): {
  candidates: string[];
  fallbackSectionIds: string[];
  metragem: { aba: "RE" | "RC"; caboId: string } | null;
} {
  const candidates: string[] = [];
  const push = (id: string | null | undefined) => {
    const v = id?.trim();
    if (!v || candidates.includes(v)) return;
    candidates.push(v);
  };

  const metragem = parseMetragemCaboItemId(item.itemId);
  if (metragem) {
    push(anchorIdMetragemCabo(metragem.aba, metragem.caboId));
    // Formato legado gerado por buildPendenciaItem.
    push(`pendencia-${sanitizePendenciaDomId(item.itemId)}`);
  }
  push(item.anchorId);

  return {
    candidates,
    fallbackSectionIds: metragem ? ["secao-cabos"] : [],
    metragem,
  };
}

export function pendenciaFotoGrupo(opts: {
  aba: PendenciaAba;
  grupoKey: string;
  title: string;
  section?: string;
}): PendenciaItemDef {
  const secaoBase =
    opts.section && SECAO_POR_SECTION[opts.section]
      ? SECAO_POR_SECTION[opts.section]
      : opts.aba === "RE"
        ? "Rede Externa (RE)"
        : opts.aba === "RC"
          ? "Rede Cliente (RC)"
          : opts.aba === "equipamento"
            ? "Equipamento"
            : opts.aba;
  const secao =
    opts.section === "cabos" || opts.section === "poste" || opts.section === "caixa"
      ? `${secaoBase} (${opts.aba})`
      : secaoBase;
  const itemId = `${opts.aba}.foto.${opts.grupoKey}`;
  return {
    itemId,
    label: `${secao} - ${opts.title}`,
    aba: opts.aba,
    /** Mesmo id das âncoras de busca/índice (`secao-${grupoKey}`). */
    anchorId: `secao-${opts.grupoKey}`,
  };
}

export function pendenciaMetragemCabo(opts: {
  aba: "RE" | "RC";
  caboId: string;
  index: number;
}): PendenciaItemDef {
  const itemId = `${opts.aba}.lancamento.metragem.${opts.caboId}`;
  return {
    itemId,
    label: `Lançamento (${opts.aba}) - Metragem de cabo (Cabo ${opts.index + 1})`,
    aba: opts.aba,
    anchorId: anchorIdMetragemCabo(opts.aba, opts.caboId),
  };
}

export function pendenciaPergunta(opts: {
  aba: PendenciaAba;
  secao: string;
  subbloco: string;
  key: string;
}): PendenciaItemDef {
  return buildPendenciaItem(opts);
}

const ABAS_VALIDAS: PendenciaAba[] = [
  "RE",
  "RC",
  "equipamento",
  "teste-optico",
  "teste-otdr",
  "teste-potencia",
  "infraestrutura",
  "medicoes",
  "contatos",
];

function isPendenciaAba(value: unknown): value is PendenciaAba {
  return typeof value === "string" && (ABAS_VALIDAS as string[]).includes(value);
}

export function parsePendenciasItens(raw: unknown): PendenciaItem[] {
  if (!Array.isArray(raw)) return [];
  const out: PendenciaItem[] = [];
  const seen = new Set<string>();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const item = row as Partial<PendenciaItem>;
    const itemId = typeof item.itemId === "string" ? item.itemId.trim() : "";
    if (!itemId || seen.has(itemId)) continue;
    const label = typeof item.label === "string" ? item.label.trim() : "";
    if (!label || !isPendenciaAba(item.aba)) continue;
    const anchorId =
      typeof item.anchorId === "string" && item.anchorId.trim()
        ? item.anchorId.trim()
        : `pendencia-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`;
    seen.add(itemId);
    out.push({
      itemId,
      label,
      aba: item.aba,
      anchorId,
      createdAt:
        typeof item.createdAt === "string" && item.createdAt
          ? item.createdAt
          : new Date().toISOString(),
    });
  }
  return out;
}

/** Mescla novas marcações sem duplicar itemId já aberto. */
export function mergePendenciasItens(
  existentes: PendenciaItem[],
  novas: PendenciaItemDef[],
): PendenciaItem[] {
  const map = new Map<string, PendenciaItem>();
  for (const item of existentes) map.set(item.itemId, item);
  const now = new Date().toISOString();
  for (const def of novas) {
    const prev = map.get(def.itemId);
    if (prev) {
      map.set(def.itemId, {
        ...prev,
        label: def.label,
        aba: def.aba,
        anchorId: def.anchorId,
      });
      continue;
    }
    map.set(def.itemId, { ...def, createdAt: now });
  }
  return [...map.values()];
}

export function motivoPendenciaFromItens(itens: PendenciaItem[]): string {
  if (itens.length === 0) return "Pendência sinalizada pela supervisão.";
  if (itens.length === 1) return `Pendência em: ${itens[0].label}`;
  return `Pendências (${itens.length}): ${itens.map((i) => i.label).join("; ")}`;
}

/** Labels a partir dos itens granulares do payload. */
export function labelsFromPendenciasItens(
  itens: PendenciaItem[] | null | undefined,
): string[] {
  if (!itens?.length) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of itens) {
    const label = item.label?.trim();
    if (!label || seen.has(label)) continue;
    seen.add(label);
    out.push(label);
  }
  return out;
}

/**
 * Quebra `motivo_pendencia` legado (texto corrido) em tópicos.
 * Aceita: "Pendência em: A", "Pendências (N): A; B", ou "A; B".
 */
export function parseMotivoPendenciaLabels(
  motivo: string | null | undefined,
): string[] {
  const raw = motivo?.trim();
  if (!raw) return [];

  const multi = raw.match(/^Pendências?\s*\(\d+\):\s*(.+)$/i);
  if (multi?.[1]) {
    return multi[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  const prefix = raw.match(/^Pendência em:\s*(.+)$/i);
  if (prefix?.[1]) {
    return prefix[1]
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (raw.includes(";")) {
    return raw
      .split(";")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  return [raw];
}

/** Prefere itens do payload; senão parseia o motivo textual. */
export function pendenciaLabelsForDisplay(opts: {
  itens?: PendenciaItem[] | null;
  motivo?: string | null;
}): string[] {
  const fromItens = labelsFromPendenciasItens(opts.itens);
  if (fromItens.length > 0) return fromItens;
  return parseMotivoPendenciaLabels(opts.motivo);
}

/** Identificador do accordion/seção pai para agregação do contador no cabeçalho. */
export type PendenciaBlocoId =
  | "RE.lancamento"
  | "RE.poste"
  | "RE.caixa"
  | "RE.outras"
  | "RC.local"
  | "RC.lancamento"
  | "RC.poste"
  | "RC.caixa"
  | "RC.outras"
  | "EQ.cliente"
  | "EQ.estacao"
  | "EQ.outras";

const FOTO_RE_LANCAMENTO = new Set(["dutoSubterraneo", "sobraTecnica"]);
const FOTO_RE_POSTE = new Set(["posteConexao", "novoAterramentoPoste"]);
const FOTO_RE_CAIXA = new Set(["caixaEmenda", "plaquetaIdentificacao"]);
const FOTO_RC_LOCAL = new Set(["rcEntradaInterna", "rcEntradaExterna", "rcTerminacaoCabo"]);
const FOTO_RC_LANCAMENTO = new Set(["rcDutoSubterraneo", "rcSobraTecnica"]);
const FOTO_RC_POSTE = new Set(["rcPosteConexao", "rcNovoAterramentoPoste"]);
const FOTO_RC_CAIXA = new Set(["rcCaixaEmenda", "rcPlaquetaIdentificacao"]);
const FOTO_EQ_ESTACAO_LEGADO = new Set(["posicaoConexaoEstacao", "etiquetaIdentificacao"]);

function fotoKeyFromItemId(itemId: string): string | null {
  const m = itemId.match(/^(?:RE|RC|equipamento)\.foto\.(.+)$/);
  return m?.[1] ?? null;
}

/** Indica se um itemId pertence ao bloco accordion informado. */
export function itemMatchesPendenciaBloco(itemId: string, bloco: PendenciaBlocoId): boolean {
  const foto = fotoKeyFromItemId(itemId);
  switch (bloco) {
    case "RE.lancamento":
      return (
        itemId.startsWith("RE.lancamento.") ||
        (foto != null && FOTO_RE_LANCAMENTO.has(foto))
      );
    case "RE.poste":
      return itemId.startsWith("RE.poste.") || (foto != null && FOTO_RE_POSTE.has(foto));
    case "RE.caixa":
      return foto != null && FOTO_RE_CAIXA.has(foto);
    case "RE.outras":
      return itemId.startsWith("RE.outra.") || itemId.startsWith("RE.outras.");
    case "RC.local":
      return itemId.startsWith("RC.local.") || (foto != null && FOTO_RC_LOCAL.has(foto));
    case "RC.lancamento":
      return (
        itemId.startsWith("RC.lancamento.") ||
        (foto != null && FOTO_RC_LANCAMENTO.has(foto))
      );
    case "RC.poste":
      return itemId.startsWith("RC.poste.") || (foto != null && FOTO_RC_POSTE.has(foto));
    case "RC.caixa":
      return foto != null && FOTO_RC_CAIXA.has(foto);
    case "RC.outras":
      return itemId.startsWith("RC.outra.") || itemId.startsWith("RC.outras.");
    case "EQ.cliente":
      return (
        itemId.startsWith("equipamento.foto.eqCliente") ||
        itemId.startsWith("EQ.cliente.") ||
        itemId.startsWith("equipamento.cliente.")
      );
    case "EQ.estacao":
      return (
        itemId.startsWith("equipamento.foto.eqEstacao") ||
        itemId.startsWith("EQ.estacao.") ||
        itemId.startsWith("equipamento.estacao.") ||
        (foto != null && FOTO_EQ_ESTACAO_LEGADO.has(foto))
      );
    case "EQ.outras":
      return (
        itemId.startsWith("equipamento.outra.") ||
        itemId.startsWith("EQ.outras.") ||
        itemId.startsWith("equipamento.foto.outras")
      );
    default:
      return false;
  }
}

export function countPendenciasNoBloco(
  itemIds: Iterable<string>,
  bloco: PendenciaBlocoId,
): number {
  let n = 0;
  for (const id of itemIds) {
    if (itemMatchesPendenciaBloco(id, bloco)) n += 1;
  }
  return n;
}

/** Regras opcionais para vincular um link do Índice a pendências ativas. */
export type IndicePendenciaMatch = {
  /** Prefixo de itemId (ex.: RE.lancamento.metragem.). */
  prefixes?: string[];
  /** itemIds exatos. */
  itemIds?: string[];
  /** Chaves de foto em RE/RC/equipamento.foto.{key}. */
  fotoKeys?: string[];
};

export type PendenciaIndiceRef = {
  itemId: string;
  anchorId: string;
  aba: PendenciaAba;
};

/** True se a pendência ativa corresponde ao subitem do Índice (âncora ou regras). */
export function indiceSubitemTemPendencia(
  secaoDomId: string,
  match: IndicePendenciaMatch | undefined,
  active: PendenciaIndiceRef[],
  abaFiltro?: PendenciaAba,
): boolean {
  return active.some((p) => {
    if (abaFiltro && p.aba !== abaFiltro) return false;
    if (p.anchorId === secaoDomId) return true;
    if (!match) return false;
    if (match.itemIds?.includes(p.itemId)) return true;
    if (match.prefixes?.some((pre) => p.itemId.startsWith(pre))) return true;
    if (match.fotoKeys?.length) {
      const foto = fotoKeyFromItemId(p.itemId);
      if (foto && match.fotoKeys.includes(foto)) return true;
    }
    return false;
  });
}

export function indiceBlocoTemPendencia(
  blocoId: PendenciaBlocoId | undefined,
  subitensComPendencia: boolean,
  activeItemIds: Iterable<string>,
): boolean {
  if (subitensComPendencia) return true;
  if (!blocoId) return false;
  return countPendenciasNoBloco(activeItemIds, blocoId) > 0;
}

/** Conta pendências ativas da aba (RE / RC / equipamento) para badge na tab do Índice. */
export function countPendenciasNaAba(
  active: PendenciaIndiceRef[],
  aba: PendenciaAba,
): number {
  return active.reduce((n, p) => (p.aba === aba ? n + 1 : n), 0);
}
