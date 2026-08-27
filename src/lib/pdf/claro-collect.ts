import { getStoragePublicUrl } from "@/lib/supabase";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  filtrarCabosComConteudo,
  formatarDb,
  parseNumeroCampo,
  totalConexoesCalculado,
  totalEmendasCalculado,
  looksLikeFotoGrupoPorAmbiente,
  type CaboMetragemPayload,
  type DgoClienteItemPayload,
  type EquipamentoClienteItemPayload,
  type FotoGrupoPayload,
  type FotoGrupoPorAmbientePayload,
  type OutraFotoPayload,
  type RelatorioPayload,
  type RelatorioTransmissao,
  type StoredPhoto,
  type TesteOpticoFaixaPayload,
  type TesteOpticoPayload,
} from "@/lib/relatorios-transmissao";

export type PdfPhotoItem = {
  url: string;
  path?: string;
  /** Legenda abaixo da foto (obs em Outras fotos; nome/metragem em cabos). */
  caption: string;
  /** Referencia acima da foto (Outras fotos). */
  title?: string;
};

export type PdfPotenciaLinhaAten = {
  rotulo: string;
  valor: string;
  unidade: string;
  destaque?: "amarelo" | "cinza";
};

export type PdfPotenciaFibra = {
  numero: string;
  /** Numero inteiro da fibra (1-based) para cor Telebras. */
  numeroFibra: number;
  po: string;
  poPi: string;
  status: "OK" | "NAO OK" | "-";
};

export type PdfPotenciaCard = {
  titulo: string;
  km: string;
  emendas: string;
  conexoes: string;
  pi: string;
  linhasAten: PdfPotenciaLinhaAten[];
  fibras: PdfPotenciaFibra[];
  /** Padrão de cores BR/EUA para o badge da fibra. */
  padraoCoresFibra?: "br" | "eua";
};

export type PdfKvField = { label: string; value: string };

export type PdfAtomicBlock =
  | { kind: "heading"; text: string }
  | { kind: "subheader"; text: string }
  | { kind: "paragraph"; text: string; label?: string }
  | { kind: "kvGrid"; fields: PdfKvField[]; cols?: 2 | 3 | 4 }
  | { kind: "photos"; items: PdfPhotoItem[]; compact?: boolean }
  | { kind: "potenciaCard"; card: PdfPotenciaCard };

/** group = titulo + anexos (page-break-inside: avoid). */
export type PdfContentBlock =
  | PdfAtomicBlock
  | { kind: "group"; children: PdfAtomicBlock[] };

export type PdfCabecalhoDados = {
  osWf: string;
  operadora: string;
  cliente: string;
  endereco: string;
  cidade: string;
  empreiteira: string;
  dataInicio: string;
  tipoExecucao: string;
};

export function resolvePhotoUrl(foto: StoredPhoto | null | undefined): string {
  if (!foto) return "";
  const url = foto.url?.trim();
  if (url) return url;
  const path = foto.path?.trim();
  if (!path) return "";
  try {
    return getStoragePublicUrl(path);
  } catch {
    return "";
  }
}

function hasPhoto(foto: StoredPhoto | null | undefined): boolean {
  return Boolean(resolvePhotoUrl(foto) || foto?.path?.trim());
}

function tipoLabel(tipo: RelatorioTransmissao["tipo_execucao"]): string {
  if (tipo === "implantacao") return "Implantação";
  if (tipo === "empresarial") return "Empresarial";
  return "-";
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "-";
  const d = value.slice(0, 10);
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return value;
  return `${day}/${m}/${y}`;
}

function simNao(v: boolean | null | undefined): string {
  if (v === true) return "Sim";
  if (v === false) return "Nao";
  return "-";
}

function labelAmbiente(v: string | null | undefined): string {
  if (v === "aereo") return "Aereo";
  if (v === "subterraneo") return "Subterraneo";
  return "-";
}

function formatarPtBr(n: number): string {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function pushHeading(blocks: PdfContentBlock[], text: string) {
  blocks.push({ kind: "heading", text });
}

function pushGroup(blocks: PdfContentBlock[], children: PdfAtomicBlock[]) {
  if (!children.length) return;
  blocks.push({ kind: "group", children });
}

function pushPara(target: PdfAtomicBlock[], text: string, label?: string) {
  const t = text.trim();
  if (!t) return;
  target.push({ kind: "paragraph", text: t, label });
}

/** Grade compacta chave-valor (2–4 colunas) — evita empilhar metadados. */
function pushKvGrid(
  target: PdfAtomicBlock[],
  fields: { label: string; value: string | null | undefined }[],
  cols: 2 | 3 | 4 = 3,
) {
  const cleaned: PdfKvField[] = [];
  for (const f of fields) {
    const value = String(f.value ?? "").trim();
    if (!value) continue;
    cleaned.push({ label: f.label, value });
  }
  if (!cleaned.length) return;
  target.push({ kind: "kvGrid", fields: cleaned, cols });
}

function pushPhotos(
  target: PdfAtomicBlock[],
  items: PdfPhotoItem[],
  opts?: { compact?: boolean },
) {
  const valid = items.filter((i) => i.url.trim() || i.path?.trim());
  if (!valid.length) return;
  target.push({ kind: "photos", items: valid, compact: opts?.compact });
}

function andamentoTexto(obs?: string | null, obsAdmin?: string | null): string {
  return [obs?.trim(), obsAdmin?.trim()].filter(Boolean).join("\n");
}

function toPhotoItems(
  fotos: StoredPhoto[],
  opts: { title?: string; caption?: string },
): PdfPhotoItem[] {
  const caption = opts.caption?.trim() ?? "";
  const title = opts.title?.trim();
  return fotos
    .map((f, i) => {
      const url = resolvePhotoUrl(f);
      const path = f.path?.trim() || undefined;
      if (!url && !path) return null;
      const itemTitle =
        title && fotos.length > 1 ? `${title} (${i + 1})` : title;
      return {
        url: url || "",
        path,
        title: itemTitle,
        caption,
      };
    })
    .filter((x): x is PdfPhotoItem => Boolean(x));
}

function gruposParaPdf(
  titulo: string,
  grupo: FotoGrupoPayload | FotoGrupoPorAmbientePayload | null | undefined,
): { titulo: string; grupo: FotoGrupoPayload | null | undefined }[] {
  if (!grupo) return [];
  if (looksLikeFotoGrupoPorAmbiente(grupo)) {
    return [
      { titulo: `${titulo} (Aereo)`, grupo: grupo.aereo },
      { titulo: `${titulo} (Subterraneo)`, grupo: grupo.subterraneo },
    ];
  }
  return [{ titulo, grupo }];
}

/** Grade 2 colunas: titulo da categoria no topo, OBS como legenda (vazio = sem texto). */
function collectGruposEmGrade(
  blocks: PdfContentBlock[],
  itens: { titulo: string; grupo: FotoGrupoPayload | null | undefined }[],
) {
  const fotos: PdfPhotoItem[] = [];
  for (const { titulo, grupo } of itens) {
    if (!grupo) continue;
    const andamento = andamentoTexto(grupo.obs, grupo.obsAdmin);
    const stored = (grupo.fotos ?? []).filter((f) => hasPhoto(f));
    if (!stored.length) continue;
    for (const item of toPhotoItems(stored, { title: titulo, caption: andamento })) {
      fotos.push(item);
    }
  }
  if (!fotos.length) return;
  pushGroup(blocks, [{ kind: "photos", items: fotos }]);
}

function grupoTemEvidencia(grupo: FotoGrupoPayload | null | undefined): boolean {
  if (!grupo) return false;
  return (
    (grupo.fotos ?? []).some((f) => hasPhoto(f)) ||
    Boolean(andamentoTexto(grupo.obs, grupo.obsAdmin))
  );
}

function formatCoords(coords: { latitude?: string; longitude?: string } | null | undefined): string {
  const lat = coords?.latitude?.trim() ?? "";
  const lng = coords?.longitude?.trim() ?? "";
  if (!lat && !lng) return "";
  return `${lat || "—"}, ${lng || "—"}`;
}

/**
 * Card de evidência: subtítulo + metadados (kv) + fotos + OBS.
 * Mantém tudo do bloco junto (page-break-inside via group).
 */
function collectEvidenciaCard(
  blocks: PdfContentBlock[],
  titulo: string,
  opts: {
    fields?: { label: string; value: string | null | undefined }[];
    cols?: 2 | 3 | 4;
    fotos?: PdfPhotoItem[];
    obs?: string;
    compactPhotos?: boolean;
  },
) {
  const fields = (opts.fields ?? []).filter((f) => String(f.value ?? "").trim());
  const fotos = (opts.fotos ?? []).filter((i) => i.url.trim() || i.path?.trim());
  const obs = opts.obs?.trim() ?? "";
  if (!fields.length && !fotos.length && !obs) return;

  const children: PdfAtomicBlock[] = [{ kind: "subheader", text: titulo }];
  if (fields.length) pushKvGrid(children, fields, opts.cols ?? 3);
  if (obs) pushPara(children, obs, "OBS");
  if (fotos.length) pushPhotos(children, fotos, { compact: opts.compactPhotos ?? true });
  pushGroup(blocks, children);
}

function collectGrupoCard(
  blocks: PdfContentBlock[],
  titulo: string,
  grupo: FotoGrupoPayload | null | undefined,
  extraFields?: { label: string; value: string | null | undefined }[],
) {
  if (!grupoTemEvidencia(grupo) && !(extraFields ?? []).some((f) => String(f.value ?? "").trim())) {
    return;
  }
  const fotos = toPhotoItems((grupo?.fotos ?? []).filter((f) => hasPhoto(f)), {
    title: titulo,
    caption: "",
  });
  collectEvidenciaCard(blocks, titulo, {
    fields: extraFields,
    fotos,
    obs: andamentoTexto(grupo?.obs, grupo?.obsAdmin),
    compactPhotos: true,
  });
}

function collectGruposCards(
  blocks: PdfContentBlock[],
  itens: {
    titulo: string;
    grupo: FotoGrupoPayload | null | undefined;
    fields?: { label: string; value: string | null | undefined }[];
  }[],
) {
  for (const item of itens) {
    collectGrupoCard(blocks, item.titulo, item.grupo, item.fields);
  }
}

/**
 * Caixa de emenda unificada: dados + Foto da caixa | Plaqueta + OBS (por ambiente).
 */
function collectCaixaEmendaUnificada(
  blocks: PdfContentBlock[],
  tituloBase: string,
  caixa: FotoGrupoPorAmbientePayload | FotoGrupoPayload | null | undefined,
  plaqueta: FotoGrupoPorAmbientePayload | FotoGrupoPayload | null | undefined,
  opts?: {
    qtdPorAmbiente?: { aereo: number | null; subterraneo: number | null };
    coordsPorAmbiente?: {
      aereo?: { latitude: string; longitude: string };
      subterraneo?: { latitude: string; longitude: string };
    };
    caixaExistente?: boolean | null;
  },
) {
  const ambientes: { key: "aereo" | "subterraneo"; label: string }[] = [
    { key: "aereo", label: "Aereo" },
    { key: "subterraneo", label: "Subterraneo" },
  ];

  const slice = (
    g: FotoGrupoPorAmbientePayload | FotoGrupoPayload | null | undefined,
    key: "aereo" | "subterraneo",
  ): FotoGrupoPayload | null => {
    if (!g) return null;
    if (looksLikeFotoGrupoPorAmbiente(g)) return g[key] ?? null;
    // Payload flat legado: trata como aéreo.
    return key === "aereo" ? g : null;
  };

  let any = false;
  for (const amb of ambientes) {
    const caixaSlice = slice(caixa, amb.key);
    const plaqSlice = slice(plaqueta, amb.key);
    const fotoCaixa = (caixaSlice?.fotos ?? []).find((f) => hasPhoto(f)) ?? null;
    const fotoPlaq = (plaqSlice?.fotos ?? []).find((f) => hasPhoto(f)) ?? null;
    const obs = andamentoTexto(caixaSlice?.obs, caixaSlice?.obsAdmin);
    const qtd = opts?.qtdPorAmbiente?.[amb.key];
    const coords = formatCoords(opts?.coordsPorAmbiente?.[amb.key]);

    if (!fotoCaixa && !fotoPlaq && !obs && qtd == null && !coords) continue;

    const fields: { label: string; value: string | null | undefined }[] = [
      { label: "Ambiente", value: amb.label },
      {
        label: "Caixa de emenda existente?",
        value: opts?.caixaExistente == null ? "" : simNao(opts.caixaExistente),
      },
      { label: "Qtd. caixas de emenda", value: qtd != null ? String(qtd) : "" },
      { label: "Coordenadas", value: coords },
    ];

    const fotos: PdfPhotoItem[] = [];
    if (fotoCaixa) {
      fotos.push({
        url: resolvePhotoUrl(fotoCaixa),
        path: fotoCaixa.path?.trim() || undefined,
        title: "Foto da caixa",
        caption: "",
      });
    }
    if (fotoPlaq) {
      fotos.push({
        url: resolvePhotoUrl(fotoPlaq),
        path: fotoPlaq.path?.trim() || undefined,
        title: "Etiqueta / Plaqueta de Identificacao",
        caption: "",
      });
    }

    collectEvidenciaCard(blocks, `${tituloBase} (${amb.label})`, {
      fields,
      cols: 3,
      fotos,
      obs,
      compactPhotos: true,
    });
    any = true;
  }

  // Se só há caixa flat sem ambiente e nada foi emitido, tenta um card único.
  if (!any && caixa && !looksLikeFotoGrupoPorAmbiente(caixa)) {
    collectGrupoCard(blocks, tituloBase, caixa, [
      {
        label: "Caixa de emenda existente?",
        value: opts?.caixaExistente == null ? "" : simNao(opts.caixaExistente),
      },
    ]);
  }
}

function collectGrupo(
  blocks: PdfContentBlock[],
  titulo: string,
  grupo: FotoGrupoPayload | null | undefined,
) {
  collectGrupoCard(blocks, titulo, grupo);
}

function collectEquipamentoItensLista(
  blocks: PdfContentBlock[],
  tituloSecao: string,
  itens: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[],
  opts: { comIdentificacao: boolean },
) {
  const ativos = itens.filter(
    (item) =>
      hasPhoto(item.foto) ||
      hasPhoto(item.etiqueta) ||
      item.tipoEquipamento.trim() ||
      item.modelo.trim() ||
      item.fabricante.trim() ||
      item.sgp.trim() ||
      ("identificacao" in item && item.identificacao.trim()) ||
      item.obs.trim(),
  );
  if (!ativos.length) return;
  pushHeading(blocks, tituloSecao);
  for (const [index, item] of ativos.entries()) {
    const children: PdfAtomicBlock[] = [
      {
        kind: "subheader",
        text: `${opts.comIdentificacao ? "Equipamento" : "Roseta"} ${index + 1}`,
      },
    ];
    const fields: { label: string; value: string }[] = [
      { label: "Tipo", value: item.tipoEquipamento },
      { label: "Modelo", value: item.modelo },
      { label: "Fabricante", value: item.fabricante },
      { label: "SGP", value: item.sgp },
    ];
    if (opts.comIdentificacao && "identificacao" in item) {
      fields.push({ label: "Identificacao", value: item.identificacao });
    }
    pushKvGrid(children, fields, opts.comIdentificacao ? 3 : 4);
    const andamento = andamentoTexto(item.obs, item.obsAdmin);
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
    const fotos: PdfPhotoItem[] = [];
    if (hasPhoto(item.foto)) {
      fotos.push({
        url: resolvePhotoUrl(item.foto),
        path: item.foto?.path?.trim() || undefined,
        title: "Foto do equipamento",
        caption: "",
      });
    }
    if (hasPhoto(item.etiqueta)) {
      fotos.push({
        url: resolvePhotoUrl(item.etiqueta),
        path: item.etiqueta?.path?.trim() || undefined,
        title: "Etiqueta de Identificacao",
        caption: "",
      });
    }
    if (fotos.length) children.push({ kind: "photos", items: fotos, compact: true });
    pushGroup(blocks, children);
  }
}

function collectCabos(
  blocks: PdfContentBlock[],
  tituloSecao: string,
  cabos: CaboMetragemPayload[],
) {
  const ativos = filtrarCabosComConteudo(cabos);
  if (!ativos.length) return;
  pushHeading(blocks, tituloSecao);
  for (const [index, cabo] of ativos.entries()) {
    const fo = cabo.tipoCabo.trim() || "n/d";
    const label = `Cabo ${index + 1} - ${fo} FO · ${cabo.metragem || "-"} m`;
    const children: PdfAtomicBlock[] = [{ kind: "subheader", text: label }];
    const andamento = andamentoTexto(cabo.obs, cabo.obsAdmin);
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
    pushKvGrid(
      children,
      [
        { label: "Tipo do FO", value: cabo.tipoCabo },
        { label: "Marcacao Inicial (m)", value: cabo.marcacaoInicial },
        { label: "Marcacao Final (m)", value: cabo.marcacaoFinal },
        { label: "Metragem Total (m)", value: cabo.metragem },
      ],
      4,
    );
    const fotos: PdfPhotoItem[] = [];
    if (hasPhoto(cabo.fotoInicio)) {
      fotos.push({
        url: resolvePhotoUrl(cabo.fotoInicio),
        path: cabo.fotoInicio?.path?.trim() || undefined,
        title: "Foto Inicial",
        caption: label,
      });
    }
    if (hasPhoto(cabo.fotoFim)) {
      fotos.push({
        url: resolvePhotoUrl(cabo.fotoFim),
        path: cabo.fotoFim?.path?.trim() || undefined,
        title: "Foto Final",
        caption: label,
      });
    }
    pushPhotos(children, fotos, { compact: true });
    pushGroup(blocks, children);
  }
}

function collectOutras(
  blocks: PdfContentBlock[],
  titulo: string,
  itens: OutraFotoPayload[],
) {
  const ativos = itens.filter((i) => hasPhoto(i.foto) || i.ref.trim() || i.obs.trim());
  if (!ativos.length) return;

  // Grid 2 colunas: Ref (topo) → Foto → Legenda/obs (baixo), titulo amarrado ao bloco.
  const children: PdfAtomicBlock[] = [{ kind: "heading", text: titulo }];
  const fotos: PdfPhotoItem[] = [];
  for (const item of ativos) {
    if (!hasPhoto(item.foto)) continue;
    fotos.push({
      url: resolvePhotoUrl(item.foto),
      path: item.foto?.path?.trim() || undefined,
      title: item.ref.trim() || "—",
      caption: andamentoTexto(item.obs, item.obsAdmin),
    });
  }
  if (!fotos.length) return;
  pushPhotos(children, fotos);
  pushGroup(blocks, children);
}

/** Emparelha 1550nm e 1330nm: painel KV horizontal + prints em 2 colunas. */
function appendParJanelasOpticas(
  target: PdfAtomicBlock[],
  pontoLabel: string,
  faixa1550: TesteOpticoFaixaPayload | undefined,
  faixa1330: TesteOpticoFaixaPayload | undefined,
  numeroFibra?: number | null,
) {
  const children: PdfAtomicBlock[] = [{ kind: "subheader", text: pontoLabel }];
  const fotos: PdfPhotoItem[] = [];

  const fields: { label: string; value: string }[] = [];
  if (numeroFibra != null && Number.isFinite(numeroFibra)) {
    fields.push({ label: "No Fibra", value: String(Math.trunc(numeroFibra)) });
  }
  if (faixa1550?.dbm?.trim()) {
    fields.push({ label: "1550 nm", value: `${faixa1550.dbm.trim()} dBm` });
  }
  if (faixa1330?.dbm?.trim()) {
    fields.push({ label: "1330 nm", value: `${faixa1330.dbm.trim()} dBm` });
  }
  pushKvGrid(children, fields, 3);

  const pushFaixa = (janela: string, faixa: TesteOpticoFaixaPayload | undefined) => {
    if (!faixa) return;
    const andamento = andamentoTexto(faixa.obs, faixa.obsAdmin);
    const items = toPhotoItems(faixa.fotos ?? [], { title: janela, caption: andamento });
    fotos.push(...items);
  };

  pushFaixa("1550 nm", faixa1550);
  pushFaixa("1330 nm", faixa1330);
  if (!fotos.length && children.length <= 1) return;
  pushPhotos(children, fotos, { compact: true });
  target.push(...children);
}

function buildTesteOtdrAtoms(
  p: RelatorioPayload | undefined,
  tipoExecucao: RelatorioTransmissao["tipo_execucao"],
  tituloSecaoOverride?: string,
): PdfAtomicBlock[] {
  if (!p) return [];
  const isImplantacao = tipoExecucao === "implantacao";
  const value = isImplantacao ? p.testePotenciaImplantacao : p.testePotenciaEmpresarial;
  if (!value) return [];

  const kmRaw = String(value.comprimentoTrechoKm ?? "").trim();
  const otdrItens = value.otdr ?? [];
  const ativos = otdrItens.filter((item) => hasPhoto(item.foto) || andamentoTexto(item.obs, item.obsAdmin));
  if (!kmRaw && !ativos.length) return [];

  const tituloSecao =
    tituloSecaoOverride ??
    (isImplantacao ? "2. Teste OTDR (Implantacao)" : "2. Teste OTDR (Empresarial)");
  const children: PdfAtomicBlock[] = [{ kind: "heading", text: tituloSecao }];

  if (kmRaw) {
    pushKvGrid(children, [{ label: "Comprimento do trecho optico testado", value: `${kmRaw} km` }], 2);
  }

  const fotos: PdfPhotoItem[] = [];
  for (const [i, item] of otdrItens.entries()) {
    const label = `OTDR ${i + 1}`;
    const andamento = andamentoTexto(item.obs, item.obsAdmin);
    if (!hasPhoto(item.foto) && !andamento) continue;
    if (andamento) pushPara(children, andamento, `${label} - Andamento da Obra`);
    if (hasPhoto(item.foto)) {
      fotos.push({
        url: resolvePhotoUrl(item.foto),
        path: item.foto?.path?.trim() || undefined,
        caption: label,
      });
    }
  }
  pushPhotos(children, fotos, { compact: true });
  return children;
}

function primeiroDbm(lista: unknown): string {
  const item = Array.isArray(lista) ? lista[0] : lista;
  if (!item || typeof item !== "object") return "";
  const valor = (item as { dbm?: unknown }).dbm;
  return valor == null ? "" : String(valor);
}

function buildPotenciaCard(
  titulo: string,
  janela: "1550" | "1330",
  ponto: "cliente" | "estacao",
  km: number,
  totalEmendas: number,
  totalConexoes: number,
  testeOptico: TesteOpticoPayload,
  padraoCoresFibra: "br" | "eua" = "br",
): PdfPotenciaCard {
  const local = ponto === "cliente" ? testeOptico.cliente : testeOptico.estacao;
  const piTexto = janela === "1550" ? primeiroDbm(local?.nm1550) : primeiroDbm(local?.nm1330);
  const pi = parseNumeroCampo(piTexto);
  const numeroFibra =
    typeof local?.numeroFibra === "number" && local.numeroFibra >= 1
      ? Math.trunc(local.numeroFibra)
      : null;
  const atenMaxima = calcularAtenuacaoMaxima(km, totalEmendas, totalConexoes);
  const minimo = calcularMinimoAdmissivel(pi, atenMaxima);
  const janelaNm = `${janela} nm`;
  const valPo = -Math.abs(atenMaxima);
  const piEmBranco = !piTexto.trim();
  const valPi = pi ?? 0;
  const atenuacao = valPo - valPi;
  const status: PdfPotenciaFibra["status"] =
    piEmBranco || minimo == null ? "-" : valPo >= minimo ? "OK" : "NAO OK";

  const fibras: PdfPotenciaFibra[] =
    numeroFibra == null
      ? []
      : [
          {
            numero: String(numeroFibra).padStart(2, "0"),
            numeroFibra,
            po: formatarPtBr(valPo),
            poPi: piEmBranco ? "-" : `${formatarPtBr(atenuacao)} dB`,
            status,
          },
        ];

  return {
    titulo,
    km: `${formatarPtBr(km)} km`,
    emendas: String(totalEmendas),
    conexoes: String(totalConexoes),
    pi: pi == null ? "-" : formatarDb(pi, 2),
    linhasAten: [
      {
        rotulo: `ATENUACAO DA FIBRA NA JANELA OPTICA DE ${janelaNm}:`,
        valor: ATEN_KM.toFixed(2),
        unidade: "dB/Km",
      },
      { rotulo: "ATENUACAO POR EMENDA:", valor: ATEN_EMENDA.toFixed(2), unidade: "dB" },
      { rotulo: "PERDA POR CONEXAO:", valor: PERDA_CONEXAO.toFixed(2), unidade: "dB" },
      {
        rotulo: `ATENUACAO MAXIMA - ${janelaNm}:`,
        valor: `-${Math.abs(atenMaxima).toFixed(2)}`,
        unidade: "dB",
        destaque: "cinza",
      },
      {
        rotulo: "Valor Minimo Admissivel para a Potencia Medida Po:",
        valor: minimo == null ? "-" : formatarDb(minimo, 2),
        unidade: "dBm",
        destaque: "amarelo",
      },
    ],
    fibras,
    padraoCoresFibra,
  };
}

function collectTestePotenciaTabelas(
  blocks: PdfContentBlock[],
  p: RelatorioPayload | undefined,
  tipoExecucao: RelatorioTransmissao["tipo_execucao"],
) {
  // Implantacao nao tem Teste de Potencia — so OTDR (coletado antes).
  if (tipoExecucao === "implantacao") return;

  if (!p) return;
  const otdr = p.testePotenciaEmpresarial;
  const km = parseNumeroCampo(String(otdr?.comprimentoTrechoKm ?? "").replace(",", ".")) ?? 0;
  const totalEmendas = totalEmendasCalculado(
    p.redeAcesso?.qtdCaixasEmenda,
    p.redeCliente?.qtdCaixasEmenda,
  );
  const totalConexoes = totalConexoesCalculado(totalEmendas);
  const optico = p.testeOptico;
  if (!optico) return;
  const padraoCoresFibra = p.padraoCoresFibra === "eua" ? "eua" : "br";

  pushHeading(blocks, "1. Teste de Potencia");

  const buildCard = (
    titulo: string,
    janela: "1550" | "1330",
    ponto: "cliente" | "estacao",
  ): PdfPotenciaCard =>
    buildPotenciaCard(
      titulo,
      janela,
      ponto,
      km,
      totalEmendas,
      totalConexoes,
      optico,
      padraoCoresFibra,
    );

  // Apenas No Cliente (1550 + 1330) — Estacao omitida na visualizacao final.
  pushGroup(blocks, [
    {
      kind: "potenciaCard",
      card: buildCard("TESTE DE POTENCIA - 1550nm (No Cliente)", "1550", "cliente"),
    },
    {
      kind: "potenciaCard",
      card: buildCard("TESTE DE POTENCIA - 1330nm (No Cliente)", "1330", "cliente"),
    },
  ]);
}

/**
 * Une cada título de seção ao conteúdo seguinte (até o próximo título),
 * equivalente a break-inside: avoid / break-after: avoid no título.
 * Encadeia títulos consecutivos (ex.: "3. RE" + "Lançamento (RE)") com o 1º bloco de corpo.
 */
export function coalesceSectionLeads(blocks: PdfContentBlock[]): PdfContentBlock[] {
  const out: PdfContentBlock[] = [];
  let i = 0;

  const startsNewSection = (b: PdfContentBlock | undefined): boolean => {
    if (!b) return true;
    if (b.kind === "heading") return true;
    if (b.kind === "group" && b.children[0]?.kind === "heading") return true;
    return false;
  };

  const appendBlockAtoms = (target: PdfAtomicBlock[], b: PdfContentBlock) => {
    if (b.kind === "group") {
      target.push(...b.children);
      return;
    }
    target.push(b as PdfAtomicBlock);
  };

  while (i < blocks.length) {
    const cur = blocks[i];

    // Título solto ou grupo que já começa com título → absorve corpo até o próximo título.
    if (cur.kind === "heading" || (cur.kind === "group" && cur.children[0]?.kind === "heading")) {
      const children: PdfAtomicBlock[] =
        cur.kind === "heading" ? [cur] : [...cur.children];
      i += 1;

      // Títulos consecutivos (pai + subseção) ficam no mesmo envelope.
      while (i < blocks.length && blocks[i].kind === "heading") {
        children.push(blocks[i] as Extract<PdfAtomicBlock, { kind: "heading" }>);
        i += 1;
      }

      while (i < blocks.length && !startsNewSection(blocks[i])) {
        appendBlockAtoms(children, blocks[i]!);
        i += 1;
      }

      out.push({ kind: "group", children });
      continue;
    }

    out.push(cur);
    i += 1;
  }

  return out;
}

export function buildCabecalhoDados(row: RelatorioTransmissao): PdfCabecalhoDados {
  return {
    osWf: row.os_wf || "-",
    operadora: row.cliente_operadora || "Claro",
    cliente: row.cliente?.trim() || "-",
    endereco: row.endereco?.trim() || "-",
    cidade: row.cidade?.trim() || "-",
    empreiteira: row.equipe_empreiteira?.trim() || "-",
    dataInicio: formatDate(row.data_inicio_execucao),
    tipoExecucao: tipoLabel(row.tipo_execucao),
  };
}

/** Evidências fotográficas da Rede Externa (RE). */
function collectRedeExternaRe(
  blocks: PdfContentBlock[],
  p: RelatorioPayload | undefined,
  sec: (titulo: string) => string,
  numeroSecao: "1" | "3",
) {
  pushHeading(blocks, sec(`${numeroSecao}. Rede Externa (RE)`));

  // —— Lançamento (RE) ——
  pushHeading(blocks, sec("Lançamento (RE)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Lancamento cabos aereo",
          value: simNao(p?.lancamentoCabosRe?.aereo.isSim ?? p?.lancamentoRe),
        },
        {
          label: "Lancamento cabos subterraneo",
          value: simNao(p?.lancamentoCabosRe?.subterraneo.isSim),
        },
        {
          label: "Sobra tecnica?",
          value: simNao(p?.redeAcesso?.sobraTecnicaExecutada?.isSim),
        },
        {
          label: "Fiberloop instalado",
          value: simNao(p?.redeAcesso?.fiberloopInstalado?.isSim),
        },
        {
          label: "Qtd. Fiberloop",
          value:
            p?.redeAcesso?.fiberloopInstalado?.isSim === true &&
            p.redeAcesso.fiberloopInstalado.quantidade != null
              ? String(p.redeAcesso.fiberloopInstalado.quantidade)
              : "",
        },
        {
          label: "Const. duto subterraneo?",
          value: simNao(p?.redeAcesso?.construcaoDutoSubterraneo?.isSim),
        },
        {
          label: "Metros duto (MT)",
          value:
            p?.redeAcesso?.metrosDutoSubterraneo != null
              ? String(p.redeAcesso.metrosDutoSubterraneo)
              : "",
        },
        {
          label: "Construido caixa subterranea?",
          value: simNao(p?.redeAcesso?.construcaoCaixaSubterranea?.isSim),
        },
        {
          label: "Qtd. caixas subterraneas",
          value:
            p?.redeAcesso?.construcaoCaixaSubterranea?.isSim === true &&
            p.redeAcesso.construcaoCaixaSubterranea.quantidade != null
              ? String(p.redeAcesso.construcaoCaixaSubterranea.quantidade)
              : "",
        },
      ],
      3,
    );
    for (const b of meta) blocks.push(b);
  }
  if (p?.lancamentoCabosRe?.aereo.isSim === true) {
    collectCabos(blocks, "Metragem de cabos aereo (RE)", p.lancamentoCabosRe.aereo.metragens);
  }
  if (p?.lancamentoCabosRe?.subterraneo.isSim === true) {
    collectCabos(
      blocks,
      "Metragem de cabos subterraneo (RE)",
      p.lancamentoCabosRe.subterraneo.metragens,
    );
  }
  collectGruposCards(blocks, [
    ...gruposParaPdf("Sobra tecnica", p?.sobraTecnica),
    { titulo: "Const. de duto subterraneo (MD ou MND)", grupo: p?.dutoSubterraneo },
  ]);

  // —— Poste (RE) ——
  pushHeading(blocks, sec("Poste (RE)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Total de postes (RE)",
          value:
            p?.redeAcesso?.qtdTotalPostes != null ? String(p.redeAcesso.qtdTotalPostes) : "",
        },
        {
          label: "Cordoalha existente?",
          value: simNao(p?.redeAcesso?.cordoalhaExistente?.isSim),
        },
        {
          label: "Postes cordoalha existente?",
          value: simNao(p?.redeAcesso?.postesCordoalhaExistente?.isSim),
        },
        {
          label: "Lancado cordoalha?",
          value: simNao(p?.redeAcesso?.cordoalhaLancada?.isSim),
        },
        {
          label: "Qtd. cordoalha lancada",
          value:
            p?.redeAcesso?.cordoalhaLancada?.isSim === true &&
            p.redeAcesso.cordoalhaLancada.quantidade != null
              ? String(p.redeAcesso.cordoalhaLancada.quantidade)
              : "",
        },
        {
          label: "Postes nova cordoalha?",
          value: simNao(p?.redeAcesso?.postesNovaCordoalha?.isSim),
        },
        {
          label: "Qtd. postes nova cordoalha",
          value:
            p?.redeAcesso?.postesNovaCordoalha?.isSim === true &&
            p.redeAcesso.postesNovaCordoalha.quantidade != null
              ? String(p.redeAcesso.postesNovaCordoalha.quantidade)
              : "",
        },
        {
          label: "Pontos de aterramento",
          value:
            p?.redeAcesso?.aterramento?.pontosAterramento != null
              ? String(p.redeAcesso.aterramento.pontosAterramento)
              : "",
        },
        {
          label: "Total de hastes (5/8)",
          value:
            p?.redeAcesso?.aterramento?.totalHastes != null
              ? String(p.redeAcesso.aterramento.totalHastes)
              : "",
        },
      ],
      3,
    );
    for (const b of meta) blocks.push(b);
  }
  collectGruposCards(blocks, [
    { titulo: "Poste de conexao", grupo: p?.posteConexao },
    { titulo: "Novo aterramento do poste", grupo: p?.novoAterramentoPoste },
  ]);

  // —— Caixa de Emenda (RE) ——
  pushHeading(blocks, sec("Caixa de Emenda (RE)"));
  collectCaixaEmendaUnificada(blocks, "Caixa de emenda", p?.caixaEmenda, p?.plaquetaIdentificacao, {
    qtdPorAmbiente: p?.redeAcesso?.qtdCaixasEmendaPorAmbiente,
    caixaExistente: p?.redeAcesso?.caixaEmendaExistente?.isSim ?? null,
  });

  // —— Outras Fotos (RE) ——
  collectOutras(blocks, "Outras Fotos (RE)", p?.outrasFotos ?? []);
}

function pushTesteOtdrSection(
  blocks: PdfContentBlock[],
  p: RelatorioPayload | undefined,
  tipoExecucao: RelatorioTransmissao["tipo_execucao"],
  sec: (titulo: string) => string,
  tituloSecao: string,
) {
  const otdrAtoms = buildTesteOtdrAtoms(p, tipoExecucao, sec(tituloSecao));
  if (otdrAtoms.length) pushGroup(blocks, otdrAtoms);
}

export function collectPdfBlocksEscopo(
  blocks: PdfContentBlock[],
  p: RelatorioPayload | undefined,
  tipoExecucao: RelatorioTransmissao["tipo_execucao"],
  prefix?: string,
): PdfContentBlock[] {
  const sec = (titulo: string) => (prefix ? `${prefix} · ${titulo}` : titulo);
  const isImplantacao = tipoExecucao === "implantacao";

  // Implantação: exclusivamente RE → OTDR (sem Potência, Óptico, RC ou Equipamentos).
  if (isImplantacao) {
    collectRedeExternaRe(blocks, p, sec, "1");
    pushTesteOtdrSection(blocks, p, tipoExecucao, sec, "2. Teste OTDR (Implantacao)");
    return blocks;
  }

  // —— Empresarial: Potência → OTDR → Óptico → RE → RC → Equipamentos ——

  collectTestePotenciaTabelas(blocks, p, tipoExecucao);
  pushTesteOtdrSection(blocks, p, tipoExecucao, sec, "2. Teste OTDR (Empresarial)");

  const to = p?.testeOptico;
  if (to) {
    const optico: PdfAtomicBlock[] = [{ kind: "heading", text: sec("2.1. Teste Optico") }];
    appendParJanelasOpticas(
      optico,
      "No Cliente",
      to.cliente?.nm1550?.[0],
      to.cliente?.nm1330?.[0],
      to.cliente?.numeroFibra,
    );
    if (optico.length > 1) pushGroup(blocks, optico);
  }

  collectRedeExternaRe(blocks, p, sec, "3");

  // 4. Rede Cliente (RC)
  pushHeading(blocks, sec("4. Rede Cliente (RC)"));

  // —— Local (RC) ——
  pushHeading(blocks, sec("Local (RC)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        { label: "Tecnologia de Acesso", value: p?.tecnologiaAcesso?.trim() || "" },
        { label: "Coordenadas do Cliente", value: formatCoords(p?.redeCliente?.coordenadas) },
      ],
      2,
    );
    for (const b of meta) blocks.push(b);
  }
  collectGruposCards(blocks, [
    { titulo: "Cliente - Entrada/Fachada", grupo: p?.eqClienteFachada },
    { titulo: "Cliente - Ambiente (geral da sala)", grupo: p?.eqClienteAmbiente },
    { titulo: "Rack ou Local", grupo: p?.eqClienteRack },
  ]);

  // —— Lançamento (RC) ——
  pushHeading(blocks, sec("Lançamento (RC)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Lancamento cabos aereo",
          value: simNao(p?.lancamentoCabosRc?.aereo.isSim ?? p?.lancamentoRc),
        },
        {
          label: "Lancamento cabos subterraneo",
          value: simNao(p?.lancamentoCabosRc?.subterraneo.isSim),
        },
        {
          label: "Sobra tecnica?",
          value: simNao(p?.redeCliente?.sobraTecnicaExecutada?.isSim),
        },
        {
          label: "Fiberloop instalado",
          value: simNao(p?.redeCliente?.fiberloopInstalado?.isSim),
        },
        {
          label: "Qtd. Fiberloop",
          value:
            p?.redeCliente?.fiberloopInstalado?.isSim === true &&
            p.redeCliente.fiberloopInstalado.quantidade != null
              ? String(p.redeCliente.fiberloopInstalado.quantidade)
              : "",
        },
        {
          label: "Const. duto subterraneo?",
          value: simNao(p?.redeCliente?.construcaoDutoSubterraneo?.isSim),
        },
        {
          label: "Metros duto (MT)",
          value:
            p?.redeCliente?.metrosDutoSubterraneo != null
              ? String(p.redeCliente.metrosDutoSubterraneo)
              : "",
        },
        {
          label: "Construido caixa subterranea?",
          value: simNao(p?.redeCliente?.construcaoCaixaSubterranea?.isSim),
        },
        {
          label: "Qtd. caixas subterraneas",
          value:
            p?.redeCliente?.construcaoCaixaSubterranea?.isSim === true &&
            p.redeCliente.construcaoCaixaSubterranea.quantidade != null
              ? String(p.redeCliente.construcaoCaixaSubterranea.quantidade)
              : "",
        },
      ],
      3,
    );
    for (const b of meta) blocks.push(b);
  }
  if (p?.lancamentoCabosRc?.aereo.isSim === true) {
    collectCabos(blocks, "Metragem de cabos aereo (RC)", p.lancamentoCabosRc.aereo.metragens);
  }
  if (p?.lancamentoCabosRc?.subterraneo.isSim === true) {
    collectCabos(
      blocks,
      "Metragem de cabos subterraneo (RC)",
      p.lancamentoCabosRc.subterraneo.metragens,
    );
  }
  collectGruposCards(blocks, [
    { titulo: "Entrada do cabo (area externa)", grupo: p?.rcEntradaExterna },
    { titulo: "Entrada do cabo (area interna)", grupo: p?.rcEntradaInterna },
    { titulo: "Terminacao do cabo no cliente (PTO/Roseta)", grupo: p?.rcTerminacaoCabo },
    ...gruposParaPdf("Sobra tecnica", p?.rcSobraTecnica),
    { titulo: "Const. de duto subterraneo (MD ou MND)", grupo: p?.rcDutoSubterraneo },
  ]);

  // —— Poste (RC) ——
  pushHeading(blocks, sec("Poste (RC)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Total de postes (RC)",
          value:
            p?.redeCliente?.qtdTotalPostes != null ? String(p.redeCliente.qtdTotalPostes) : "",
        },
        {
          label: "Cordoalha existente?",
          value: simNao(p?.redeCliente?.cordoalhaExistente?.isSim),
        },
        {
          label: "Postes cordoalha existente?",
          value: simNao(p?.redeCliente?.postesCordoalhaExistente?.isSim),
        },
        {
          label: "Lancado cordoalha?",
          value: simNao(p?.redeCliente?.cordoalhaLancada?.isSim),
        },
        {
          label: "Qtd. cordoalha lancada",
          value:
            p?.redeCliente?.cordoalhaLancada?.isSim === true &&
            p.redeCliente.cordoalhaLancada.quantidade != null
              ? String(p.redeCliente.cordoalhaLancada.quantidade)
              : "",
        },
        {
          label: "Postes nova cordoalha?",
          value: simNao(p?.redeCliente?.postesNovaCordoalha?.isSim),
        },
        {
          label: "Qtd. postes nova cordoalha",
          value:
            p?.redeCliente?.postesNovaCordoalha?.isSim === true &&
            p.redeCliente.postesNovaCordoalha.quantidade != null
              ? String(p.redeCliente.postesNovaCordoalha.quantidade)
              : "",
        },
        {
          label: "Pontos de aterramento",
          value:
            p?.redeCliente?.aterramento?.pontosAterramento != null
              ? String(p.redeCliente.aterramento.pontosAterramento)
              : "",
        },
        {
          label: "Total de hastes (5/8)",
          value:
            p?.redeCliente?.aterramento?.totalHastes != null
              ? String(p.redeCliente.aterramento.totalHastes)
              : "",
        },
      ],
      3,
    );
    for (const b of meta) blocks.push(b);
  }
  collectGruposCards(blocks, [
    { titulo: "Poste de conexao (RC)", grupo: p?.rcPosteConexao },
    { titulo: "Novo aterramento do poste (RC)", grupo: p?.rcNovoAterramentoPoste },
  ]);

  // —— Caixa de Emenda (RC) ——
  pushHeading(blocks, sec("Caixa de Emenda (RC)"));
  collectCaixaEmendaUnificada(
    blocks,
    "Caixa de emenda na acomodacao",
    p?.rcCaixaEmenda,
    p?.rcPlaquetaIdentificacao,
    {
      qtdPorAmbiente: p?.redeCliente?.qtdCaixasEmendaPorAmbiente,
      coordsPorAmbiente: {
        aereo: p?.redeCliente?.caixaEmendaAcomodacaoPorAmbiente?.aereo?.coordenadas,
        subterraneo: p?.redeCliente?.caixaEmendaAcomodacaoPorAmbiente?.subterraneo?.coordenadas,
      },
      caixaExistente: p?.redeCliente?.caixaEmendaExistente?.isSim ?? null,
    },
  );

  // —— Outras Fotos (RC) ——
  collectOutras(blocks, "Outras Fotos (RC)", p?.outrasFotosRc ?? []);

  // 5. Equipamentos e Acessos
  pushHeading(blocks, sec("5. Equipamentos e Acessos"));

  // —— Equipamentos no Cliente ——
  pushHeading(blocks, sec("Equipamentos no Cliente"));
  collectGruposCards(blocks, [
    { titulo: "Identificacao SGP no Cliente", grupo: p?.eqClienteSgp },
  ]);
  collectEquipamentoItensLista(blocks, "DGO / DID / Roseta", p?.eqClienteDgo ?? [], {
    comIdentificacao: false,
  });
  collectEquipamentoItensLista(
    blocks,
    "Equipamentos (No Cliente)",
    p?.eqClienteEquipamentos ?? [],
    { comIdentificacao: true },
  );

  // —— Equipamentos na Estação/PPC ——
  pushHeading(blocks, sec("Equipamentos na Estacao/PPC"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Relatorio fotografico da estacao",
          value: p?.relatorioEstacao == null ? "" : simNao(p.relatorioEstacao),
        },
        { label: "Estacao / entrega de acesso", value: p?.estacaoEntregaAcesso },
      ],
      2,
    );
    for (const b of meta) blocks.push(b);
  }
  collectGruposCards(blocks, [
    { titulo: "Estacao - Foto geral", grupo: p?.eqEstacaoGeral },
    { titulo: "Rack ou Local Instalacao", grupo: p?.eqEstacaoRack },
    { titulo: "Posicao DGO/DIO", grupo: p?.posicaoConexaoEstacao },
    { titulo: "Etiqueta na estacao/PPC", grupo: p?.etiquetaIdentificacao },
  ]);
  collectEquipamentoItensLista(
    blocks,
    "Equipamento instalado (Na estacao/PPC)",
    p?.eqEstacaoEquipamento ?? [],
    { comIdentificacao: true },
  );
  collectEquipamentoItensLista(blocks, "DGO / DID / ROUTER", p?.eqEstacaoDgo ?? [], {
    comIdentificacao: false,
  });

  // —— Outras Fotos (Equipamentos) ——
  collectOutras(blocks, "Outras Fotos (Equip. Cliente)", p?.outrasFotosEqCliente ?? []);
  collectOutras(blocks, "Outras Fotos (Estacao)", p?.outrasFotosEqEstacao ?? []);

  return blocks;
}

export function collectPdfBlocks(row: RelatorioTransmissao): PdfContentBlock[] {
  const blocks: PdfContentBlock[] = [];
  collectPdfBlocksEscopo(blocks, row.payload, row.tipo_execucao);
  return coalesceSectionLeads(blocks);
}
