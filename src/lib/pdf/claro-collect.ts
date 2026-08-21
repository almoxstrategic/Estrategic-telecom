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
  type CaboMetragemPayload,
  type DgoClienteItemPayload,
  type EquipamentoClienteItemPayload,
  type FotoGrupoPayload,
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
};

export type PdfAtomicBlock =
  | { kind: "heading"; text: string }
  | { kind: "subheader"; text: string }
  | { kind: "paragraph"; text: string; label?: string }
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
        text: `${opts.comIdentificacao ? "Equipamento" : "DGO/Roseta"} ${index + 1}`,
      },
    ];
    pushPara(children, item.tipoEquipamento, "Tipo equipamento");
    pushPara(children, item.modelo, "Modelo");
    pushPara(children, item.fabricante, "Fabricante");
    pushPara(children, item.sgp, "SGP");
    if (opts.comIdentificacao && "identificacao" in item) {
      pushPara(children, item.identificacao, "Identificacao");
    }
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
    if (fotos.length) children.push({ kind: "photos", items: fotos });
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
    pushPara(children, cabo.marcacaoInicial, "Marcacao Inicial (m)");
    pushPara(children, cabo.marcacaoFinal, "Marcacao Final (m)");
    pushPara(children, cabo.metragem, "Metragem Total (m)");
    const fotos: PdfPhotoItem[] = [];
    if (hasPhoto(cabo.fotoInicio)) {
      fotos.push({
        url: resolvePhotoUrl(cabo.fotoInicio),
        path: cabo.fotoInicio?.path?.trim() || undefined,
        caption: label,
      });
    }
    if (hasPhoto(cabo.fotoFim)) {
      fotos.push({
        url: resolvePhotoUrl(cabo.fotoFim),
        path: cabo.fotoFim?.path?.trim() || undefined,
        caption: label,
      });
    }
    pushPhotos(children, fotos);
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

/** Emparelha 1550nm e 1330nm na mesma linha (grid 2 colunas). */
function appendParJanelasOpticas(
  target: PdfAtomicBlock[],
  pontoLabel: string,
  faixa1550: TesteOpticoFaixaPayload | undefined,
  faixa1330: TesteOpticoFaixaPayload | undefined,
) {
  const children: PdfAtomicBlock[] = [{ kind: "subheader", text: pontoLabel }];
  const fotos: PdfPhotoItem[] = [];

  const pushFaixa = (janela: string, faixa: TesteOpticoFaixaPayload | undefined) => {
    if (!faixa) return;
    const andamento = andamentoTexto(faixa.obs, faixa.obsAdmin);
    const label = `${janela}`;
    if (faixa.dbm.trim()) pushPara(children, `${faixa.dbm} dBm`, `${label} - Medicao`);
    const items = toPhotoItems(faixa.fotos ?? [], { title: label, caption: andamento });
    fotos.push(...items);
  };

  pushFaixa("1550 nm", faixa1550);
  pushFaixa("1330 nm", faixa1330);
  if (!fotos.length && children.length <= 1) return;
  pushPhotos(children, fotos, { compact: true });
  target.push(...children);
}

function buildTesteOtdrAtoms(row: RelatorioTransmissao): PdfAtomicBlock[] {
  const p = row.payload;
  if (!p) return [];
  const isImplantacao = row.tipo_execucao === "implantacao";
  const value = isImplantacao ? p.testePotenciaImplantacao : p.testePotenciaEmpresarial;
  if (!value) return [];

  const kmRaw = String(value.comprimentoTrechoKm ?? "").trim();
  const otdrItens = value.otdr ?? [];
  const ativos = otdrItens.filter((item) => hasPhoto(item.foto) || andamentoTexto(item.obs, item.obsAdmin));
  if (!kmRaw && !ativos.length) return [];

  const tituloSecao = isImplantacao ? "6. Teste OTDR (Implantacao)" : "6. Teste OTDR (Empresarial)";
  const children: PdfAtomicBlock[] = [{ kind: "heading", text: tituloSecao }];

  if (kmRaw) {
    pushPara(children, `${kmRaw} km`, "Comprimento do trecho optico testado");
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
  };
}

function collectTestePotenciaTabelas(blocks: PdfContentBlock[], row: RelatorioTransmissao) {
  // Implantacao nao tem Teste de Potencia — so OTDR (coletado antes).
  if (row.tipo_execucao === "implantacao") return;

  const p = row.payload;
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

  pushHeading(blocks, "7. Teste de Potencia");

  const buildCard = (
    titulo: string,
    janela: "1550" | "1330",
    ponto: "cliente" | "estacao",
  ): PdfPotenciaCard =>
    buildPotenciaCard(titulo, janela, ponto, km, totalEmendas, totalConexoes, optico);

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

export function collectPdfBlocks(row: RelatorioTransmissao): PdfContentBlock[] {
  const blocks: PdfContentBlock[] = [];
  const p: RelatorioPayload | undefined = row.payload;

  pushHeading(blocks, "1. Rede Externa (RE)");
  {
    const meta: PdfAtomicBlock[] = [];
    pushPara(meta, simNao(p?.lancamentoRe), "Lancamento de cabos (RE)");
    if (p?.redeAcesso?.qtdCaixasEmenda != null) {
      pushPara(meta, String(p.redeAcesso.qtdCaixasEmenda), "Qtd. caixas de emenda");
    }
    for (const b of meta) blocks.push(b);
  }
  if (p?.lancamentoRe === true) collectCabos(blocks, "Metragem de cabos (RE)", p.metragensCabo ?? []);
  collectGruposEmGrade(blocks, [
    { titulo: "Poste de conexao", grupo: p?.posteConexao },
    { titulo: "Caixa de emenda", grupo: p?.caixaEmenda },
    { titulo: "Sobra tecnica / Fiberloop", grupo: p?.sobraTecnica },
    { titulo: "Plaqueta de Identificacao", grupo: p?.plaquetaIdentificacao },
    { titulo: "Novo aterramento do poste", grupo: p?.novoAterramentoPoste },
    { titulo: "Aterramento - TERROMETRO", grupo: p?.aterramentoTerrometro },
    { titulo: "Posicao DGO/DIO", grupo: p?.posicaoConexaoEstacao },
    { titulo: "Etiqueta na estacao/PPC", grupo: p?.etiquetaIdentificacao },
  ]);
  collectOutras(blocks, "Outras fotos (RE)", p?.outrasFotos ?? []);

  pushHeading(blocks, "2. Rede Cliente (RC)");
  {
    const meta: PdfAtomicBlock[] = [];
    pushPara(meta, p?.tecnologiaAcesso?.trim() || "-", "Tecnologia de Acesso");
    pushPara(meta, simNao(p?.lancamentoRc), "Lancamento de cabos (RC)");
    if (p?.redeCliente?.qtdCaixasEmenda != null) {
      pushPara(meta, String(p.redeCliente.qtdCaixasEmenda), "Qtd. caixas de emenda (RC)");
    }
    for (const b of meta) blocks.push(b);
  }
  if (p?.lancamentoRc === true) collectCabos(blocks, "Metragem de cabos (RC)", p.metragensCaboRc ?? []);
  collectGruposEmGrade(blocks, [
    { titulo: "Poste de conexao (RC)", grupo: p?.rcPosteConexao },
    { titulo: "Caixa de emenda na acomodacao (RC)", grupo: p?.rcCaixaEmenda },
    { titulo: "Terminacao do cabo no cliente", grupo: p?.rcTerminacaoCabo },
    { titulo: "Plaqueta de Identificacao (RC)", grupo: p?.rcPlaquetaIdentificacao },
    { titulo: "Entrada do cabo (area interna)", grupo: p?.rcEntradaInterna },
    { titulo: "Entrada do cabo (area externa)", grupo: p?.rcEntradaExterna },
    { titulo: "Sobra tecnica / Fiberloop (RC)", grupo: p?.rcSobraTecnica },
  ]);
  collectOutras(blocks, "Outras fotos (RC)", p?.outrasFotosRc ?? []);

  pushHeading(blocks, "3. Equipamentos no Cliente");
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
  ]);
  collectOutras(blocks, "Outras fotos (Equip. Cliente)", p?.outrasFotosEqCliente ?? []);

  if (p?.relatorioEstacao) {
    pushHeading(blocks, "4. Equipamentos na Estacao/PPC");
    {
      const meta: PdfAtomicBlock[] = [];
      pushPara(meta, simNao(p.relatorioEstacao), "Relatorio fotografico da estacao");
      if (p.estacaoEntregaAcesso?.trim()) {
        pushPara(meta, p.estacaoEntregaAcesso, "Estacao / entrega de acesso");
      }
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

  // Secoes 5 (Optico — so Cliente) e 6 (OTDR) no mesmo grupo: fluem na mesma pagina.
  {
    const combined: PdfAtomicBlock[] = [];
    const to = p?.testeOptico;
    if (to) {
      combined.push({ kind: "heading", text: "5. Teste Optico" });
      if (to.cliente?.numeroFibra != null) {
        pushPara(combined, String(to.cliente.numeroFibra), "No Fibra (Cliente)");
      }
      appendParJanelasOpticas(
        combined,
        "No Cliente",
        to.cliente?.nm1550?.[0],
        to.cliente?.nm1330?.[0],
      );
    }
    combined.push(...buildTesteOtdrAtoms(row));
    if (combined.length) pushGroup(blocks, combined);
  }

  // Potencia so em Empresarial (apenas No Cliente).
  collectTestePotenciaTabelas(blocks, row);

  return coalesceSectionLeads(blocks);
}
