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
    anchorId: `pendencia-${itemId.replace(/[^a-zA-Z0-9_-]/g, "-")}`,
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
  return buildPendenciaItem({
    aba: opts.aba,
    secao,
    subbloco: opts.title,
    key: `foto.${opts.grupoKey}`,
  });
}

export function pendenciaMetragemCabo(opts: {
  aba: "RE" | "RC";
  caboId: string;
  index: number;
}): PendenciaItemDef {
  return buildPendenciaItem({
    aba: opts.aba,
    secao: `Lançamento (${opts.aba})`,
    subbloco: `Metragem de cabo (Cabo ${opts.index + 1})`,
    key: `lancamento.metragem.${opts.caboId}`,
  });
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
