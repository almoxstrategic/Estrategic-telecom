import { getStoragePublicUrl } from "@/lib/supabase";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  formatarDb,
  parseNumeroCampo,
  testeOpticoEstacaoAtivo,
  totalConexoesCalculado,
  totalEmendasCalculado,
  type CaboMetragemPayload,
  type FotoGrupoPayload,
  type OutraFotoPayload,
  type RelatorioPayload,
  type RelatorioTransmissao,
  type StoredPhoto,
  type TesteOpticoFaixaPayload,
  type TesteOpticoItemPayload,
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
  | { kind: "photos"; items: PdfPhotoItem[] }
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

function pushPhotos(target: PdfAtomicBlock[], items: PdfPhotoItem[]) {
  const valid = items.filter((i) => i.url.trim() || i.path?.trim());
  if (!valid.length) return;
  target.push({ kind: "photos", items: valid });
}

function andamentoTexto(obs?: string | null, obsAdmin?: string | null): string {
  return [obs?.trim(), obsAdmin?.trim()].filter(Boolean).join("\n");
}

function toPhotoItems(fotos: StoredPhoto[], captionBase: string): PdfPhotoItem[] {
  return fotos
    .map((f, i) => {
      const url = resolvePhotoUrl(f);
      const path = f.path?.trim() || undefined;
      if (!url && !path) return null;
      return {
        url: url || "",
        path,
        caption: fotos.length > 1 ? `${captionBase} (${i + 1})` : captionBase,
      };
    })
    .filter((x): x is PdfPhotoItem => Boolean(x));
}

function collectGrupo(
  blocks: PdfContentBlock[],
  titulo: string,
  grupo: FotoGrupoPayload | null | undefined,
) {
  if (!grupo) return;
  const items = toPhotoItems(grupo.fotos ?? [], titulo);
  const andamento = andamentoTexto(grupo.obs, grupo.obsAdmin);
  if (!items.length && !andamento) return;
  const children: PdfAtomicBlock[] = [{ kind: "subheader", text: titulo }];
  if (andamento) pushPara(children, andamento, "Andamento da Obra");
  pushPhotos(children, items);
  pushGroup(blocks, children);
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
      c.metragem.trim() ||
      c.obs.trim(),
  );
  if (!ativos.length) return;
  pushHeading(blocks, tituloSecao);
  for (const [index, cabo] of ativos.entries()) {
    const label = `Cabo ${index + 1} - ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "-"} m`;
    const children: PdfAtomicBlock[] = [{ kind: "subheader", text: label }];
    const andamento = andamentoTexto(cabo.obs, cabo.obsAdmin);
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
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

function collectFaixaOptica(
  blocks: PdfContentBlock[],
  titulo: string,
  faixas: TesteOpticoFaixaPayload[],
) {
  for (const [i, faixa] of faixas.entries()) {
    const items = toPhotoItems(faixa.fotos ?? [], titulo);
    const andamento = andamentoTexto(faixa.obs, faixa.obsAdmin);
    if (!items.length && !faixa.dbm.trim() && !andamento) continue;
    const label = `${titulo}${faixas.length > 1 ? ` #${i + 1}` : ""}`;
    const children: PdfAtomicBlock[] = [{ kind: "subheader", text: label }];
    if (faixa.dbm.trim()) pushPara(children, `${faixa.dbm} dBm`, "Medicao");
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
    pushPhotos(
      children,
      items.map((it, idx) => ({
        ...it,
        caption: items.length > 1 ? `${label} (${idx + 1})` : label,
      })),
    );
    pushGroup(blocks, children);
  }
}

function collectItemOptico(
  blocks: PdfContentBlock[],
  titulo: string,
  itens: TesteOpticoItemPayload[],
) {
  for (const [i, item] of itens.entries()) {
    const andamento = andamentoTexto(item.obs, item.obsAdmin);
    if (!hasPhoto(item.foto) && !item.dbm.trim() && !andamento) continue;
    const label = `${titulo}${itens.length > 1 ? ` #${i + 1}` : ""}`;
    const children: PdfAtomicBlock[] = [{ kind: "subheader", text: label }];
    if (item.dbm.trim()) pushPara(children, `${item.dbm} dBm`, "Medicao");
    if (andamento) pushPara(children, andamento, "Andamento da Obra");
    if (hasPhoto(item.foto)) {
      pushPhotos(children, [{
        url: resolvePhotoUrl(item.foto),
        path: item.foto?.path?.trim() || undefined,
        caption: label,
      }]);
    }
    pushGroup(blocks, children);
  }
}

function collectTesteOtdr(blocks: PdfContentBlock[], row: RelatorioTransmissao) {
  const p = row.payload;
  if (!p) return;
  const isImplantacao = row.tipo_execucao === "implantacao";
  const value = isImplantacao ? p.testePotenciaImplantacao : p.testePotenciaEmpresarial;
  if (!value) return;

  const kmRaw = String(value.comprimentoTrechoKm ?? "").trim();
  const otdrItens = value.otdr ?? [];
  const ativos = otdrItens.filter((item) => hasPhoto(item.foto) || andamentoTexto(item.obs, item.obsAdmin));
  if (!kmRaw && !ativos.length) return;

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
  pushPhotos(children, fotos);
  pushGroup(blocks, children);
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

  // Par Cliente (1550 + 1330) inquebravel na mesma pagina
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

  // Par Estacao (1550 + 1330) inquebravel, se houver
  if (testeOpticoEstacaoAtivo(optico.estacao)) {
    pushGroup(blocks, [
      {
        kind: "potenciaCard",
        card: buildCard("TESTE DE POTENCIA - 1550nm (Na Estacao)", "1550", "estacao"),
      },
      {
        kind: "potenciaCard",
        card: buildCard("TESTE DE POTENCIA - 1330nm (Na Estacao)", "1330", "estacao"),
      },
    ]);
  }
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
  collectGrupo(blocks, "Poste de conexao", p?.posteConexao);
  collectGrupo(blocks, "Caixa de emenda", p?.caixaEmenda);
  collectGrupo(blocks, "Sobra tecnica", p?.sobraTecnica);
  collectGrupo(blocks, "Plaqueta de Identificacao", p?.plaquetaIdentificacao);
  collectGrupo(blocks, "Novo aterramento do poste", p?.novoAterramentoPoste);
  collectGrupo(blocks, "Aterramento - TERROMETRO", p?.aterramentoTerrometro);
  collectGrupo(blocks, "Posicao DGO/DIO", p?.posicaoConexaoEstacao);
  collectGrupo(blocks, "Etiqueta na estacao/PPC", p?.etiquetaIdentificacao);
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
  collectGrupo(blocks, "Poste de conexao (RC)", p?.rcPosteConexao);
  collectGrupo(blocks, "Caixa de emenda na acomodacao (RC)", p?.rcCaixaEmenda);
  collectGrupo(blocks, "Terminacao do cabo no cliente", p?.rcTerminacaoCabo);
  collectGrupo(blocks, "Plaqueta de Identificacao (RC)", p?.rcPlaquetaIdentificacao);
  collectGrupo(blocks, "Entrada do cabo (area interna)", p?.rcEntradaInterna);
  collectGrupo(blocks, "Entrada do cabo (area externa)", p?.rcEntradaExterna);
  collectOutras(blocks, "Outras fotos (RC)", p?.outrasFotosRc ?? []);

  pushHeading(blocks, "3. Equipamentos no Cliente");
  collectGrupo(blocks, "Cliente - Entrada/Fachada", p?.eqClienteFachada);
  collectGrupo(blocks, "Cliente - Ambiente", p?.eqClienteAmbiente);
  collectGrupo(blocks, "Rack ou Local", p?.eqClienteRack);
  collectGrupo(blocks, "DGO / DID / Roseta", p?.eqClienteDgo);
  collectGrupo(blocks, "Equipamentos (No Cliente)", p?.eqClienteEquipamentos);
  collectGrupo(blocks, "Etiqueta de Identificacao", p?.eqClienteEtiqueta);
  collectGrupo(blocks, "Identificacao SGP no Cliente", p?.eqClienteSgp);
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
    collectGrupo(blocks, "Estacao - Foto geral", p.eqEstacaoGeral);
    collectGrupo(blocks, "Rack ou Local Instalacao", p.eqEstacaoRack);
    collectGrupo(blocks, "Equipamento instalado", p.eqEstacaoEquipamento);
    collectGrupo(blocks, "Etiqueta de identificacao (estacao)", p.eqEstacaoEtiqueta);
    collectGrupo(blocks, "DGO / DID / ROUTER", p.eqEstacaoDgo);
    collectOutras(blocks, "Outras fotos (Estacao)", p.outrasFotosEqEstacao ?? []);
  }

  const to = p?.testeOptico;
  if (to) {
    pushHeading(blocks, "5. Teste Optico");
    {
      const meta: PdfAtomicBlock[] = [];
      if (to.cliente?.numeroFibra != null) {
        pushPara(meta, String(to.cliente.numeroFibra), "No Fibra (Cliente)");
      }
      for (const b of meta) blocks.push(b);
    }
    collectFaixaOptica(blocks, "Cliente 1550 nm", to.cliente?.nm1550 ?? []);
    collectFaixaOptica(blocks, "Cliente 1330 nm", to.cliente?.nm1330 ?? []);
    if (to.estacao?.numeroFibra != null) {
      blocks.push({
        kind: "paragraph",
        text: String(to.estacao.numeroFibra),
        label: "No Fibra (Estacao)",
      });
    }
    collectItemOptico(blocks, "Estacao 1550 nm", to.estacao?.nm1550 ?? []);
    collectItemOptico(blocks, "Estacao 1330 nm", to.estacao?.nm1330 ?? []);
  }

  // OTDR antes do Teste de Potencia; potencia so em Empresarial.
  collectTesteOtdr(blocks, row);
  collectTestePotenciaTabelas(blocks, row);

  return coalesceSectionLeads(blocks);
}
