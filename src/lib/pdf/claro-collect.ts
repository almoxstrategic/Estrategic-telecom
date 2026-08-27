import { getStoragePublicUrl } from "@/lib/supabase";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
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

function collectGrupo(
  blocks: PdfContentBlock[],
  titulo: string,
  grupo: FotoGrupoPayload | null | undefined,
) {
  collectGruposEmGrade(blocks, [{ titulo, grupo }]);
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
  const ativos = cabos.filter(
    (c) =>
      hasPhoto(c.fotoInicio) ||
      hasPhoto(c.fotoFim) ||
      c.tipoCabo.trim() ||
      c.marcacaoInicial.trim() ||
      c.marcacaoFinal.trim() ||
      c.metragem.trim() ||
      c.obs.trim(),
  );
  if (!ativos.length) return;
  pushHeading(blocks, tituloSecao);
  for (const [index, cabo] of ativos.entries()) {
    const label = `Cabo ${index + 1} - tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || "-"} m`;
    const children: PdfAtomicBlock[] = [{ kind: "subheader", text: label }];
    const andamento = andamentoTexto(cabo.obs, cabo.obsAdmin);
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
    pushKvGrid(
      children,
      [
        { label: "Tipo do cabo", value: cabo.tipoCabo },
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
): PdfAtomicBlock[] {
  if (!p) return [];
  const isImplantacao = tipoExecucao === "implantacao";
  const value = isImplantacao ? p.testePotenciaImplantacao : p.testePotenciaEmpresarial;
  if (!value) return [];

  const kmRaw = String(value.comprimentoTrechoKm ?? "").trim();
  const otdrItens = value.otdr ?? [];
  const ativos = otdrItens.filter((item) => hasPhoto(item.foto) || andamentoTexto(item.obs, item.obsAdmin));
  if (!kmRaw && !ativos.length) return [];

  const tituloSecao = isImplantacao ? "2. Teste OTDR (Implantacao)" : "2. Teste OTDR (Empresarial)";
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
 * Une titulo de secao (+ paragrafos soltos) ao proximo grupo/bloco de corpo,
 * evitando orfaos (titulo sozinho no fim da pagina).
 * Encadeia titulos consecutivos (ex.: "1. RE" + "Metragem...") ate o 1o grupo.
 */
export function coalesceSectionLeads(blocks: PdfContentBlock[]): PdfContentBlock[] {
  const out: PdfContentBlock[] = [];
  let pending: PdfAtomicBlock[] = [];
  let i = 0;

  const flushPendingAlone = () => {
    if (!pending.length) return;
    if (pending.length === 1) out.push(pending[0]);
    else out.push({ kind: "group", children: pending });
    pending = [];
  };

  while (i < blocks.length) {
    const cur = blocks[i];
    if (cur.kind === "heading") {
      const lead: PdfAtomicBlock[] = [...pending, cur];
      pending = [];
      i += 1;
      while (
        i < blocks.length &&
        (blocks[i].kind === "paragraph" || blocks[i].kind === "subheader")
      ) {
        lead.push(blocks[i] as PdfAtomicBlock);
        i += 1;
      }
      const next = blocks[i];
      if (next?.kind === "group") {
        out.push({ kind: "group", children: [...lead, ...next.children] });
        i += 1;
      } else if (
        next &&
        (next.kind === "photos" || next.kind === "potenciaCard")
      ) {
        out.push({ kind: "group", children: [...lead, next] });
        i += 1;
      } else if (next?.kind === "heading") {
        // Guarda para amarrar ao proximo titulo/corpo
        pending = lead;
      } else {
        if (lead.length === 1) out.push(lead[0]);
        else out.push({ kind: "group", children: lead });
      }
      continue;
    }

    flushPendingAlone();
    out.push(blocks[i]);
    i += 1;
  }

  flushPendingAlone();
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

export function collectPdfBlocksEscopo(
  blocks: PdfContentBlock[],
  p: RelatorioPayload | undefined,
  tipoExecucao: RelatorioTransmissao["tipo_execucao"],
  prefix?: string,
): PdfContentBlock[] {
  const sec = (titulo: string) => (prefix ? `${prefix} · ${titulo}` : titulo);

  // —— Ordem: Potência → OTDR → evidências fotográficas (RE/RC/Equipamentos) ——

  // 1. Teste de Potência (empresarial)
  collectTestePotenciaTabelas(blocks, p, tipoExecucao);

  // 2. Teste OTDR
  {
    const otdrAtoms = buildTesteOtdrAtoms(p, tipoExecucao);
    if (otdrAtoms.length) pushGroup(blocks, otdrAtoms);
  }

  // 2b / 7. Teste Óptico — medições técnicas (após OTDR, antes das fotos de campo)
  {
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
  }

  // 3. Rede Externa (RE) — evidências
  pushHeading(blocks, sec("3. Rede Externa (RE)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        {
          label: "Lancamento cabos aereo (RE)",
          value: simNao(p?.lancamentoCabosRe?.aereo.isSim ?? p?.lancamentoRe),
        },
        {
          label: "Lancamento cabos subterraneo (RE)",
          value: simNao(p?.lancamentoCabosRe?.subterraneo.isSim),
        },
        {
          label: "Fiberloop instalado (RE)",
          value: simNao(p?.redeAcesso?.fiberloopInstalado?.isSim),
        },
        {
          label: "Qtd. Fiberloop (RE)",
          value:
            p?.redeAcesso?.fiberloopInstalado?.isSim === true &&
            p.redeAcesso.fiberloopInstalado.quantidade != null
              ? String(p.redeAcesso.fiberloopInstalado.quantidade)
              : "",
        },
        {
          label: "Lancado cordoalha (RE)",
          value: simNao(p?.redeAcesso?.cordoalhaLancada?.isSim),
        },
        {
          label: "Qtd. cordoalha lancada (RE)",
          value:
            p?.redeAcesso?.cordoalhaLancada?.isSim === true &&
            p.redeAcesso.cordoalhaLancada.quantidade != null
              ? String(p.redeAcesso.cordoalhaLancada.quantidade)
              : "",
        },
        {
          label: "Cordoalha existente (RE)",
          value: simNao(p?.redeAcesso?.cordoalhaExistente?.isSim),
        },
        {
          label: "Postes nova cordoalha (RE)",
          value: simNao(p?.redeAcesso?.postesNovaCordoalha?.isSim),
        },
        {
          label: "Qtd. postes nova cordoalha (RE)",
          value:
            p?.redeAcesso?.postesNovaCordoalha?.isSim === true &&
            p.redeAcesso.postesNovaCordoalha.quantidade != null
              ? String(p.redeAcesso.postesNovaCordoalha.quantidade)
              : "",
        },
        {
          label: "Postes cordoalha existente (RE)",
          value: simNao(p?.redeAcesso?.postesCordoalhaExistente?.isSim),
        },
        {
          label: "Qtd. caixas aereo (RE)",
          value:
            p?.redeAcesso?.qtdCaixasEmendaPorAmbiente?.aereo != null
              ? String(p.redeAcesso.qtdCaixasEmendaPorAmbiente.aereo)
              : "",
        },
        {
          label: "Qtd. caixas subterraneo (RE)",
          value:
            p?.redeAcesso?.qtdCaixasEmendaPorAmbiente?.subterraneo != null
              ? String(p.redeAcesso.qtdCaixasEmendaPorAmbiente.subterraneo)
              : "",
        },
        {
          label: "Qtd. caixas de emenda (RE)",
          value:
            p?.redeAcesso?.qtdCaixasEmenda != null &&
            p.redeAcesso.qtdCaixasEmendaPorAmbiente?.aereo == null &&
            p.redeAcesso.qtdCaixasEmendaPorAmbiente?.subterraneo == null
              ? String(p.redeAcesso.qtdCaixasEmenda)
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
  collectGruposEmGrade(blocks, [
    { titulo: "Poste de conexao", grupo: p?.posteConexao },
    ...gruposParaPdf("Caixa de emenda", p?.caixaEmenda),
    { titulo: "Const. de duto subterraneo (MD ou MND)", grupo: p?.dutoSubterraneo },
    ...gruposParaPdf("Sobra tecnica / Fiberloop", p?.sobraTecnica),
    ...gruposParaPdf("Plaqueta de Identificacao - Caixa de emenda", p?.plaquetaIdentificacao),
    { titulo: "Novo aterramento do poste", grupo: p?.novoAterramentoPoste },
  ]);
  collectOutras(blocks, "Outras fotos (RE)", p?.outrasFotos ?? []);

  // 4. Rede Cliente (RC)
  pushHeading(blocks, sec("4. Rede Cliente (RC)"));
  {
    const meta: PdfAtomicBlock[] = [];
    pushKvGrid(
      meta,
      [
        { label: "Tecnologia de Acesso", value: p?.tecnologiaAcesso?.trim() || "-" },
        {
          label: "Lancamento cabos aereo (RC)",
          value: simNao(p?.lancamentoCabosRc?.aereo.isSim ?? p?.lancamentoRc),
        },
        {
          label: "Lancamento cabos subterraneo (RC)",
          value: simNao(p?.lancamentoCabosRc?.subterraneo.isSim),
        },
        {
          label: "Fiberloop instalado (RC)",
          value: simNao(p?.redeCliente?.fiberloopInstalado?.isSim),
        },
        {
          label: "Qtd. Fiberloop (RC)",
          value:
            p?.redeCliente?.fiberloopInstalado?.isSim === true &&
            p.redeCliente.fiberloopInstalado.quantidade != null
              ? String(p.redeCliente.fiberloopInstalado.quantidade)
              : "",
        },
        {
          label: "Lancado cordoalha (RC)",
          value: simNao(p?.redeCliente?.cordoalhaLancada?.isSim),
        },
        {
          label: "Qtd. cordoalha lancada (RC)",
          value:
            p?.redeCliente?.cordoalhaLancada?.isSim === true &&
            p.redeCliente.cordoalhaLancada.quantidade != null
              ? String(p.redeCliente.cordoalhaLancada.quantidade)
              : "",
        },
        {
          label: "Cordoalha existente (RC)",
          value: simNao(p?.redeCliente?.cordoalhaExistente?.isSim),
        },
        {
          label: "Postes nova cordoalha (RC)",
          value: simNao(p?.redeCliente?.postesNovaCordoalha?.isSim),
        },
        {
          label: "Qtd. postes nova cordoalha (RC)",
          value:
            p?.redeCliente?.postesNovaCordoalha?.isSim === true &&
            p.redeCliente.postesNovaCordoalha.quantidade != null
              ? String(p.redeCliente.postesNovaCordoalha.quantidade)
              : "",
        },
        {
          label: "Postes cordoalha existente (RC)",
          value: simNao(p?.redeCliente?.postesCordoalhaExistente?.isSim),
        },
        {
          label: "Qtd. caixas de emenda (RC)",
          value:
            p?.redeCliente?.qtdCaixasEmenda != null
              ? String(p.redeCliente.qtdCaixasEmenda)
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
  collectGruposEmGrade(blocks, [
    { titulo: "Poste de conexao (RC)", grupo: p?.rcPosteConexao },
    { titulo: "Novo aterramento do poste (RC)", grupo: p?.rcNovoAterramentoPoste },
    ...gruposParaPdf("Caixa de emenda na acomodacao (RC)", p?.rcCaixaEmenda),
    { titulo: "Const. de duto subterraneo (RC)", grupo: p?.rcDutoSubterraneo },
    { titulo: "Terminacao do cabo no cliente", grupo: p?.rcTerminacaoCabo },
    ...gruposParaPdf("Plaqueta de Identificacao (RC)", p?.rcPlaquetaIdentificacao),
    { titulo: "Entrada do cabo (area interna)", grupo: p?.rcEntradaInterna },
    { titulo: "Entrada do cabo (area externa)", grupo: p?.rcEntradaExterna },
    ...gruposParaPdf("Sobra tecnica / Fiberloop (RC)", p?.rcSobraTecnica),
  ]);
  collectOutras(blocks, "Outras fotos (RC)", p?.outrasFotosRc ?? []);

  // 5. Equipamentos no Cliente
  pushHeading(blocks, sec("5. Equipamentos no Cliente"));
  collectGruposEmGrade(blocks, [
    { titulo: "Cliente - Entrada/Fachada", grupo: p?.eqClienteFachada },
    { titulo: "Cliente - Ambiente", grupo: p?.eqClienteAmbiente },
    { titulo: "Rack ou Local", grupo: p?.eqClienteRack },
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
  collectGruposEmGrade(blocks, [
    { titulo: "Identificacao SGP no Cliente", grupo: p?.eqClienteSgp },
    { titulo: "Posicao DGO/DIO", grupo: p?.posicaoConexaoEstacao },
    { titulo: "Etiqueta na estacao/PPC", grupo: p?.etiquetaIdentificacao },
  ]);
  collectOutras(blocks, "Outras fotos (Equip. Cliente)", p?.outrasFotosEqCliente ?? []);

  // 6. Equipamentos na Estação/PPC
  if (p?.relatorioEstacao) {
    pushHeading(blocks, sec("6. Equipamentos na Estacao/PPC"));
    {
      const meta: PdfAtomicBlock[] = [];
      pushKvGrid(
        meta,
        [
          { label: "Relatorio fotografico da estacao", value: simNao(p.relatorioEstacao) },
          { label: "Estacao / entrega de acesso", value: p.estacaoEntregaAcesso },
        ],
        2,
      );
      for (const b of meta) blocks.push(b);
    }
    collectGruposEmGrade(blocks, [
      { titulo: "Estacao - Foto geral", grupo: p.eqEstacaoGeral },
      { titulo: "Rack ou Local Instalacao", grupo: p.eqEstacaoRack },
    ]);
    collectEquipamentoItensLista(
      blocks,
      "Equipamento instalado (Na estacao/PPC)",
      p.eqEstacaoEquipamento ?? [],
      { comIdentificacao: true },
    );
    collectEquipamentoItensLista(blocks, "DGO / DID / ROUTER", p.eqEstacaoDgo ?? [], {
      comIdentificacao: false,
    });
    collectOutras(blocks, "Outras fotos (Estacao)", p.outrasFotosEqEstacao ?? []);
  }

  return blocks;
}

export function collectPdfBlocks(row: RelatorioTransmissao): PdfContentBlock[] {
  const blocks: PdfContentBlock[] = [];
  collectPdfBlocksEscopo(blocks, row.payload, row.tipo_execucao);
  return coalesceSectionLeads(blocks);
}
