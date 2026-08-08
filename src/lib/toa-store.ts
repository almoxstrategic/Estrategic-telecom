import { useSyncExternalStore } from "react";

/**
 * Hierarquia TOA (regra de negócio):
 *
 * Contrato  → cliente. Pode ter várias visitas (em dias/meses diferentes).
 * Número WO → a Nota (visita). Única; nunca se repete. Mesmo contrato com
 *             2 WOs = 2 notas distintas (ex.: André Z639722 / contrato 170349593).
 * O.S.      → tarefa identificada pelo Nº da O.S. O mesmo número pode
 *             reaparecer em WOs diferentes (retrabalho/nova visita) com baixas
 *             distintas. Nos totalizadores de O.S. do KPI contamos Nº O.S.
 *             únicos (não WO × slot). Na linha da Nota / Excel, mostramos os
 *             slots daquela visita.
 *
 * Nota produtiva   = WO com ≥ 1 O.S. produtiva naquela visita.
 * Nota improdutiva = WO sem nenhuma O.S. produtiva naquela visita.
 * O.S. produtiva   = Executada + Cód Baixa produtivo.
 * Se o mesmo Nº O.S. aparece em várias WOs, prevalece a aparição produtiva
 * (retrabalho bem-sucedido).
 *
 * Status da Atividade cancelado/suspenso não entra no KPI.
 */

/** Slot bruto de O.S. na planilha TOA (colunas 1–10). */
export type ToaOrdemLinha = {
  indice: number;
  numeroOs: string;
  codBaixaBruto: string;
  status: string;
  tipoOs: string;
};

/** Linha bruta da planilha TOA: 1 Nota = 1 Número da WO = 1 linha. */
export type ToaLinha = {
  data: string;
  loginTecnico: string;
  /** Nome da coluna "técnicos" na planilha. */
  nomeTecnico: string;
  /** Identidade da Nota (visita). */
  numeroWo: string;
  /** Cliente; um contrato pode aparecer em várias WOs. */
  contrato: string;
  /** Ex.: concluído, cancelado, suspenso — cancelado/suspenso fora do KPI. */
  statusAtividade: string;
  ordensDeServico: ToaOrdemLinha[];
};

export type ToaOrdemServico = {
  indice: number;
  numeroOs: string;
  /**
   * Código numérico do Cód de Baixa; 0 quando a planilha não trouxe código
   * parseável (O.S. permanece na Nota, mas não classifica como produtiva).
   */
  codBaixa: number;
  /** Texto original da planilha (código + descrição, quando houver). */
  codBaixaBruto: string;
  status: string;
  tipoOs: string;
  isExecutada: boolean;
  /** Classificação do Cód de Baixa (PRODUTIVO), independente do Status da O.S. */
  isProdutiva: boolean;
};

/** Nota processada: 1 WO com N O.S. (1–10). */
export type ToaChamadoProcessado = {
  data: string;
  login: string;
  /** Nome do técnico (coluna "técnicos" do TOA). */
  nomeTecnico: string;
  /** Chave da Nota (Número da WO). */
  numeroWo: string;
  contrato: string;
  statusAtividade: string;
  ordensDeServico: ToaOrdemServico[];
};

/** Visão achatada de uma O.S. para tabelas/modais de detalhe. */
export type ToaOsFlattened = ToaOrdemServico & {
  data: string;
  login: string;
  numeroWo: string;
  contrato: string;
  /**
   * false quando a O.S. é produtiva operacionalmente, mas a Claro não fatura
   * (ex.: tipo 43 na mesma Nota que já tem adesão tipo 1).
   */
  contaReceitaFaturada: boolean;
};

export type ToaResumoTecnico = {
  /** Total de Notas = WOs únicas do técnico. */
  totalNotasFeitas: number;
  /** WOs com ≥ 1 O.S. produtiva (Executada + Cód Baixa produtivo). */
  notasProdutivas: number;
  /** WOs sem nenhuma O.S. produtiva. */
  notasImprodutivas: number;
  /** Contagem bruta de O.S. produtivas (Executada + código PRODUTIVO). */
  osProdutivas: number;
  /** Contagem bruta de O.S. improdutivas (código IMPRODUTIVO). */
  osImprodutivas: number;
  receitaFaturada: number;
  receitaPerda: number;
};

export type ToaAgregado = {
  resumoPorTecnico: Record<string, ToaResumoTecnico>;
  totalNotasFeitas: number;
  totalNotasProdutivas: number;
  totalNotasImprodutivas: number;
  totalOsProdutivas: number;
  totalOsImprodutivas: number;
  receitaFaturadaTotal: number;
  receitaPerdaTotal: number;
};

export type ToaSnapshot = {
  chamadosProcessados: ToaChamadoProcessado[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.kpis.toa";
const UPDATE_EVENT = "toa-kpis-updated";

const EMPTY_SNAPSHOT: ToaSnapshot = {
  chamadosProcessados: [],
  updatedAt: null,
};

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function normalizeToaLogin(value: string): string {
  return value.trim().toUpperCase();
}

/** Normaliza o Número da WO (identidade da Nota). */
export function normalizeNumeroWo(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "");
}

/** Chave única de Nota no TOA = Número da WO (não o Contrato). */
export function chaveNotaToa(
  chamado: Pick<ToaChamadoProcessado, "numeroWo"> | string,
): string {
  return normalizeNumeroWo(
    typeof chamado === "string" ? chamado : chamado.numeroWo,
  );
}

/**
 * Garante 1 entrada por Número da WO.
 * Em duplicatas: preferir a linha com mais O.S. produtivas, depois mais O.S.,
 * depois a data mais recente (última ocorrência como desempate).
 * Linhas sem WO são descartadas.
 */
export function dedupeChamadosPorNumeroWo(
  chamados: ToaChamadoProcessado[],
): ToaChamadoProcessado[] {
  const map = new Map<string, ToaChamadoProcessado>();
  for (const chamado of chamados) {
    const key = chaveNotaToa(chamado);
    if (!key) continue;
    const atual = { ...chamado, numeroWo: key };
    const prev = map.get(key);
    if (!prev) {
      map.set(key, atual);
      continue;
    }
    map.set(key, escolherMelhorNotaDuplicada(prev, atual));
  }
  return Array.from(map.values());
}

function contarOsProdutivasNaNota(ordens: ToaOrdemServico[]): number {
  return ordens.filter(isOsProdutiva).length;
}

function escolherMelhorNotaDuplicada(
  a: ToaChamadoProcessado,
  b: ToaChamadoProcessado,
): ToaChamadoProcessado {
  const prodA = contarOsProdutivasNaNota(a.ordensDeServico);
  const prodB = contarOsProdutivasNaNota(b.ordensDeServico);
  if (prodB !== prodA) return prodB > prodA ? b : a;
  if (b.ordensDeServico.length !== a.ordensDeServico.length) {
    return b.ordensDeServico.length > a.ordensDeServico.length ? b : a;
  }
  if (b.data !== a.data) return b.data > a.data ? b : a;
  return b;
}

/** Status da Atividade que entra no KPI (cancela/suspende fora). */
export function isStatusAtividadeContabilizavel(status: string): boolean {
  const s = normalizeTipoOs(status);
  if (!s) return true;
  return s !== "CANCELADO" && s !== "SUSPENSO";
}

/** O.S. com Cód de Baixa numérico classificado (produtivo ou não). */
export function temCodBaixaClassificavel(
  ordem: Pick<ToaOrdemServico, "codBaixa" | "codBaixaBruto">,
): boolean {
  if (Number.isFinite(ordem.codBaixa) && ordem.codBaixa > 0) return true;
  return extrairNumeroCodBaixa(ordem.codBaixaBruto ?? "") !== null;
}

export function normalizeTipoOs(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function normalizeStatusOs(value: string): string {
  return normalizeTipoOs(value);
}

export function isStatusExecutada(status: string): boolean {
  const s = normalizeStatusOs(status);
  // Planilhas TOA usam "Executada"; exports/variantes podem vir "Executado".
  return s === "EXECUTADA" || s === "EXECUTADO";
}

/** Status da Atividade = concluído (case/acento-insensitive). */
export function isStatusAtividadeConcluido(
  status: string | null | undefined,
): boolean {
  return normalizeTipoOs(String(status ?? "")) === "CONCLUIDO";
}

/**
 * Extrai o número inicial do Cód de Baixa bruto do TOA
 * (ex: "410 - Auto Instalação Concluída" → 410).
 */
export function extrairNumeroCodBaixa(codBaixaBruto: string): number | null {
  const match = String(codBaixaBruto ?? "")
    .trim()
    .match(/^(\d+)/);
  if (!match) return null;
  const cod = Number.parseInt(match[1]!, 10);
  return Number.isFinite(cod) ? cod : null;
}

/**
 * Regra programática de produtividade do Cód de Baixa:
 * - PRODUTIVO: 409 <= código <= 599, exceto 571
 * - IMPRODUTIVO: 571 ou qualquer código fora de 409–599
 */
export function isCodBaixaProdutivo(codBaixa: number): boolean {
  if (codBaixa === 571) return false;
  return codBaixa >= 409 && codBaixa < 600;
}

export function isCodBaixaImprodutivo(codBaixa: number): boolean {
  return !isCodBaixaProdutivo(codBaixa);
}

/** O.S. produtiva: Status === "Executada" E Cód de Baixa PRODUTIVO. */
export function isOsProdutiva(
  ordem: Pick<ToaOrdemServico, "isExecutada" | "isProdutiva">,
): boolean {
  return ordem.isExecutada && ordem.isProdutiva;
}

/**
 * O.S. improdutiva: slot com Cód de Baixa classificado que NÃO é produtiva
 * (Não Executada, ou Executada com baixa improdutiva).
 * O.S. sem código numérico não entra em prod/improd (só no total de slots).
 */
export function isOsImprodutiva(
  ordem: Pick<
    ToaOrdemServico,
    "isExecutada" | "isProdutiva" | "codBaixa" | "codBaixaBruto"
  >,
): boolean {
  if (!temCodBaixaClassificavel(ordem)) return false;
  return !isOsProdutiva(ordem);
}

/** Código numérico do Tipo O.S. (ex: "43 - ADESAO..." → 43). */
export function extrairCodigoTipoOs(tipoOs: string): number | null {
  const match = String(tipoOs ?? "")
    .trim()
    .match(/^(\d+)/);
  if (!match) return null;
  const cod = Number.parseInt(match[1]!, 10);
  return Number.isFinite(cod) ? cod : null;
}

/**
 * Receita projetada na Nota (simula Analítico Claro):
 * - Status Executada + Cód Baixa PRODUTIVO (409–599 ≠ 571)
 * - Exceto tipo 43 quando a mesma Nota já tem tipo 1 produtiva
 *   (Claro não paga os dois no mesmo contrato/mês)
 */
export function isOsReceitaFaturavelNaNota(
  ordem: ToaOrdemServico,
  ordensDaNota: ToaOrdemServico[],
): boolean {
  if (!isOsProdutiva(ordem)) return false;

  const codigoTipo = extrairCodigoTipoOs(ordem.tipoOs);
  if (codigoTipo === 43) {
    const temAdesaoPrincipal = ordensDaNota.some(
      (outra) =>
        isOsProdutiva(outra) && extrairCodigoTipoOs(outra.tipoOs) === 1,
    );
    if (temAdesaoPrincipal) return false;
  }

  return true;
}

function processarOrdem(ordem: ToaOrdemLinha): ToaOrdemServico | null {
  const numeroOs = ordem.numeroOs.trim();
  const codBaixaBruto = ordem.codBaixaBruto.trim();
  const tipoOs = ordem.tipoOs.trim();
  const status = ordem.status.trim();
  // Aceita slot se houver Nº O.S., cód. baixa, tipo ou status — não descarta por campo vazio.
  if (!numeroOs && !codBaixaBruto && !tipoOs && !status) return null;

  const codBaixaExtraido = extrairNumeroCodBaixa(codBaixaBruto);
  const codBaixa = codBaixaExtraido ?? 0;
  return {
    indice: ordem.indice,
    numeroOs: numeroOs || (codBaixa > 0 || tipoOs || status ? String(ordem.indice) : ""),
    codBaixa,
    codBaixaBruto: codBaixaBruto || (codBaixa > 0 ? String(codBaixa) : ""),
    status,
    tipoOs,
    isExecutada: isStatusExecutada(status),
    isProdutiva: codBaixa > 0 && isCodBaixaProdutivo(codBaixa),
  };
}

export function processarChamadosTOA(
  linhas: ToaLinha[],
): ToaChamadoProcessado[] {
  const chamados: ToaChamadoProcessado[] = [];

  for (const linha of linhas) {
    const login = normalizeToaLogin(linha.loginTecnico);
    const data = linha.data.trim();
    const numeroWo = normalizeNumeroWo(linha.numeroWo);
    const statusAtividade = (linha.statusAtividade ?? "").trim();
    // Nunca dropar a WO por status secundário (cancelado/suspenso): persiste tudo.
    // O KPI filtra contabilizáveis na leitura.
    if (!login || !data || !numeroWo) continue;

    const ordensDeServico = linha.ordensDeServico
      .map(processarOrdem)
      .filter((ordem): ordem is ToaOrdemServico => ordem !== null);

    // WO sem slot O.S. ainda é persistida (placeholder) para não sumir da base.
    if (ordensDeServico.length === 0) {
      ordensDeServico.push({
        indice: 1,
        numeroOs: "",
        codBaixa: 0,
        codBaixaBruto: "",
        status: "",
        tipoOs: "",
        isExecutada: false,
        isProdutiva: false,
      });
    }

    chamados.push({
      data,
      login,
      nomeTecnico: (linha.nomeTecnico ?? "").trim(),
      numeroWo,
      contrato: (linha.contrato ?? "").trim(),
      statusAtividade,
      ordensDeServico,
    });
  }

  // 1 Nota = 1 WO. Mesmo contrato com WOs distintas = N notas.
  return dedupeChamadosPorNumeroWo(chamados);
}

/**
 * Unpivot: 1 linha persistida por O.S. (pai WO + slot).
 * status_nota é o da WO (visita) e se repete em cada O.S. filha.
 * status_atividade é o Status da Atividade da WO-mãe, repetido em cada O.S.
 * nome_tecnico vem da coluna "técnicos" da planilha (não do login Z...).
 */
export function flattenChamadosParaImportacaoFlat(
  chamados: ToaChamadoProcessado[],
): Array<{
  competencia: number;
  data_toa: string;
  nome_tecnico: string;
  login_tecnico: string;
  numero_wo: string;
  contrato: string;
  numero_os: string;
  tipo_os: string;
  cod_baixa: number | null;
  status_os: string;
  status_nota: "Produtiva" | "Improdutiva";
  status_atividade: string;
}> {
  const rows: Array<{
    competencia: number;
    data_toa: string;
    nome_tecnico: string;
    login_tecnico: string;
    numero_wo: string;
    contrato: string;
    numero_os: string;
    tipo_os: string;
    cod_baixa: number | null;
    status_os: string;
    status_nota: "Produtiva" | "Improdutiva";
    status_atividade: string;
  }> = [];

  for (const chamado of dedupeChamadosPorNumeroWo(chamados)) {
    const competenciaMatch = chamado.data.match(/^(\d{4})-(\d{2})/);
    if (!competenciaMatch) continue;
    const competencia =
      Number(competenciaMatch[1]) * 100 + Number(competenciaMatch[2]);
    const statusNota = statusNotaToa(chamado.ordensDeServico);
    const login = normalizeToaLogin(chamado.login);
    // Nome real da planilha (coluna "técnicos") — nunca repetir o login Z...
    const nomeTecnico = (chamado.nomeTecnico || "").trim();
    const statusAtividade = (chamado.statusAtividade || "").trim();

    for (const ordem of chamado.ordensDeServico) {
      const numeroOs = (ordem.numeroOs || "").trim();
      const codBruto = (ordem.codBaixaBruto || "").trim();
      // Persiste o slot mesmo sem Nº O.S./cód (WO sem baixa preenchida).

      rows.push({
        competencia,
        data_toa: chamado.data,
        nome_tecnico: nomeTecnico,
        login_tecnico: login,
        numero_wo: chamado.numeroWo,
        contrato: chamado.contrato || "",
        numero_os: numeroOs || (ordem.indice > 0 ? String(ordem.indice) : ""),
        tipo_os: ordem.tipoOs || "",
        cod_baixa: ordem.codBaixa > 0 ? ordem.codBaixa : null,
        status_os: ordem.status || "",
        status_nota: statusNota,
        status_atividade: statusAtividade,
      });
    }
  }

  return rows;
}

/**
 * Reagrupa linhas flat (1 O.S.) em Notas (1 WO) para o painel KPI.
 */
export function regroupFlatRowsToChamados(
  rows: Array<{
    data_toa: string;
    nome_tecnico?: string;
    login_tecnico: string;
    numero_wo: string;
    contrato: string;
    numero_os: string;
    tipo_os: string;
    cod_baixa: number | null;
    status_os: string;
    status_nota?: string;
    status_atividade?: string;
  }>,
): ToaChamadoProcessado[] {
  const byWo = new Map<
    string,
    {
      data: string;
      login: string;
      nomeTecnico: string;
      numeroWo: string;
      contrato: string;
      statusAtividade: string;
      ordens: ToaOrdemServico[];
    }
  >();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;
    const login = normalizeToaLogin(row.login_tecnico);
    const data = String(row.data_toa ?? "").slice(0, 10);
    if (!login || !data) continue;
    const nomeTecnico = String(row.nome_tecnico ?? "").trim();
    const statusAtividade = String(row.status_atividade ?? "").trim();

    let group = byWo.get(numeroWo);
    if (!group) {
      group = {
        data,
        login,
        nomeTecnico: nomeTecnico || login,
        numeroWo,
        contrato: String(row.contrato ?? "").trim(),
        statusAtividade,
        ordens: [],
      };
      byWo.set(numeroWo, group);
    } else {
      if (nomeTecnico && !group.nomeTecnico) group.nomeTecnico = nomeTecnico;
      if (statusAtividade && !group.statusAtividade) {
        group.statusAtividade = statusAtividade;
      }
    }

    const codBaixa =
      row.cod_baixa != null && Number.isFinite(Number(row.cod_baixa))
        ? Number(row.cod_baixa)
        : 0;
    const status = String(row.status_os ?? "").trim();
    const numeroOs =
      String(row.numero_os ?? "").trim() || String(group.ordens.length + 1);

    group.ordens.push({
      indice: group.ordens.length + 1,
      numeroOs,
      codBaixa,
      codBaixaBruto: codBaixa > 0 ? String(codBaixa) : "",
      status,
      tipoOs: String(row.tipo_os ?? "").trim(),
      isExecutada: isStatusExecutada(status),
      isProdutiva: codBaixa > 0 && isCodBaixaProdutivo(codBaixa),
    });
  }

  return dedupeChamadosPorNumeroWo(
    Array.from(byWo.values()).map((g) => ({
      data: g.data,
      login: g.login,
      nomeTecnico: g.nomeTecnico,
      numeroWo: g.numeroWo,
      contrato: g.contrato,
      statusAtividade: g.statusAtividade,
      ordensDeServico: g.ordens,
    })),
  );
}

/**
 * KPIs a partir das linhas flat do banco (1 linha = 1 O.S.).
 * - O.S.: count de linhas; produtiva = Executada + Cód Baixa produtivo; resto = improdutiva
 * - Notas: DISTINCT numero_wo; Produtiva se alguma linha tem status_nota='Produtiva';
 *   Improdutiva se todas as linhas da WO têm status_nota='Improdutiva'
 */
export function agregarKpisToaFlat(
  rows: Array<{
    numero_wo: string;
    login_tecnico?: string;
    status_os: string;
    status_nota: string;
    cod_baixa: number | null;
  }>,
): {
  totalOs: number;
  osProdutivas: number;
  osImprodutivas: number;
  totalNotas: number;
  notasProdutivas: number;
  notasImprodutivas: number;
  resumoPorTecnico: Record<string, ToaResumoTecnico>;
} {
  const woRows = new Map<
    string,
    { login: string; statuses: Set<"Produtiva" | "Improdutiva"> }
  >();
  const resumoPorTecnico: Record<string, ToaResumoTecnico> = {};

  let osProdutivas = 0;
  let osImprodutivas = 0;

  for (const row of rows) {
    const wo = normalizeNumeroWo(row.numero_wo);
    const login = normalizeToaLogin(row.login_tecnico || "");
    const statusNota: "Produtiva" | "Improdutiva" =
      String(row.status_nota ?? "").trim() === "Produtiva"
        ? "Produtiva"
        : "Improdutiva";

    if (wo) {
      const bucket = woRows.get(wo) ?? {
        login: "",
        statuses: new Set<"Produtiva" | "Improdutiva">(),
      };
      bucket.statuses.add(statusNota);
      if (login && !bucket.login) bucket.login = login;
      woRows.set(wo, bucket);
    }

    const codBaixa =
      row.cod_baixa != null && Number.isFinite(Number(row.cod_baixa))
        ? Number(row.cod_baixa)
        : 0;
    const isProdutivaOs =
      isStatusExecutada(row.status_os || "") &&
      codBaixa > 0 &&
      isCodBaixaProdutivo(codBaixa);

    if (isProdutivaOs) osProdutivas += 1;
    else osImprodutivas += 1;

    if (login) {
      const resumo = resumoPorTecnico[login] ?? {
        totalNotasFeitas: 0,
        notasProdutivas: 0,
        notasImprodutivas: 0,
        osProdutivas: 0,
        osImprodutivas: 0,
        receitaFaturada: 0,
        receitaPerda: 0,
      };
      if (isProdutivaOs) resumo.osProdutivas += 1;
      else resumo.osImprodutivas += 1;
      resumoPorTecnico[login] = resumo;
    }
  }

  let notasProdutivas = 0;
  let notasImprodutivas = 0;
  for (const [, bucket] of woRows) {
    // Pelo menos uma O.S. com status_nota Produtiva → Nota produtiva
    const status: "Produtiva" | "Improdutiva" = bucket.statuses.has("Produtiva")
      ? "Produtiva"
      : "Improdutiva";
    if (status === "Produtiva") notasProdutivas += 1;
    else notasImprodutivas += 1;

    const login = bucket.login;
    if (!login) continue;
    const resumo = resumoPorTecnico[login] ?? {
      totalNotasFeitas: 0,
      notasProdutivas: 0,
      notasImprodutivas: 0,
      osProdutivas: 0,
      osImprodutivas: 0,
      receitaFaturada: 0,
      receitaPerda: 0,
    };
    resumo.totalNotasFeitas += 1;
    if (status === "Produtiva") resumo.notasProdutivas += 1;
    else resumo.notasImprodutivas += 1;
    resumoPorTecnico[login] = resumo;
  }

  return {
    totalOs: rows.length,
    osProdutivas,
    osImprodutivas,
    totalNotas: woRows.size,
    notasProdutivas,
    notasImprodutivas,
    resumoPorTecnico,
  };
}

/** @deprecated Use processarChamadosTOA. */
export const processarNotasTOA = processarChamadosTOA;

function normalizeOrdem(value: unknown): ToaOrdemServico | null {
  if (!value || typeof value !== "object") return null;
  const ordem = value as Record<string, unknown>;
  if (
    typeof ordem.numeroOs !== "string" ||
    typeof ordem.codBaixa !== "number" ||
    typeof ordem.isProdutiva !== "boolean"
  ) {
    return null;
  }

  const status = typeof ordem.status === "string" ? ordem.status.trim() : "";
  const isExecutada =
    typeof ordem.isExecutada === "boolean"
      ? ordem.isExecutada
      : isStatusExecutada(status);

  return {
    indice:
      typeof ordem.indice === "number" && Number.isFinite(ordem.indice)
        ? ordem.indice
        : 1,
    numeroOs: ordem.numeroOs.trim(),
    codBaixa: ordem.codBaixa,
    codBaixaBruto:
      typeof ordem.codBaixaBruto === "string" && ordem.codBaixaBruto.trim()
        ? ordem.codBaixaBruto.trim()
        : String(ordem.codBaixa),
    status,
    tipoOs: typeof ordem.tipoOs === "string" ? ordem.tipoOs.trim() : "",
    isExecutada,
    isProdutiva: isCodBaixaProdutivo(ordem.codBaixa),
  };
}

function normalizeChamado(value: unknown): ToaChamadoProcessado | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;

  if (Array.isArray(item.ordensDeServico)) {
    if (
      typeof item.data !== "string" ||
      typeof item.login !== "string" ||
      typeof item.numeroWo !== "string" ||
      typeof item.contrato !== "string"
    ) {
      return null;
    }

    const ordensDeServico = item.ordensDeServico
      .map(normalizeOrdem)
      .filter((ordem): ordem is ToaOrdemServico => ordem !== null);

    if (ordensDeServico.length === 0) return null;

    const numeroWo = normalizeNumeroWo(item.numeroWo);
    if (!numeroWo) return null;

    const statusAtividade =
      typeof item.statusAtividade === "string" ? item.statusAtividade.trim() : "";
    if (!isStatusAtividadeContabilizavel(statusAtividade)) return null;

    return {
      data: item.data.trim(),
      login: normalizeToaLogin(item.login),
      nomeTecnico:
        typeof item.nomeTecnico === "string" ? item.nomeTecnico.trim() : "",
      numeroWo,
      contrato: item.contrato.trim(),
      statusAtividade,
      ordensDeServico,
    };
  }

  if (
    typeof item.data !== "string" ||
    typeof item.login !== "string" ||
    typeof item.numeroWo !== "string" ||
    typeof item.contrato !== "string" ||
    typeof item.codBaixa !== "number"
  ) {
    return null;
  }

  const status =
    typeof item.status === "string" && item.status.trim()
      ? item.status.trim()
      : "Executada";

  const numeroWo = normalizeNumeroWo(item.numeroWo);
  if (!numeroWo) return null;

  const statusAtividade =
    typeof item.statusAtividade === "string" ? item.statusAtividade.trim() : "";
  if (!isStatusAtividadeContabilizavel(statusAtividade)) return null;

  return {
    data: item.data.trim(),
    login: normalizeToaLogin(item.login),
    nomeTecnico:
      typeof item.nomeTecnico === "string" ? item.nomeTecnico.trim() : "",
    numeroWo,
    contrato: item.contrato.trim(),
    statusAtividade,
    ordensDeServico: [
      {
        indice: 1,
        numeroOs:
          typeof item.numeroOs === "string" && item.numeroOs.trim()
            ? item.numeroOs.trim()
            : numeroWo || "1",
        codBaixa: item.codBaixa,
        codBaixaBruto:
          typeof item.codBaixaBruto === "string" && item.codBaixaBruto.trim()
            ? item.codBaixaBruto.trim()
            : String(item.codBaixa),
        status,
        tipoOs: typeof item.tipoOs === "string" ? item.tipoOs.trim() : "",
        isExecutada: isStatusExecutada(status),
        isProdutiva: isCodBaixaProdutivo(item.codBaixa),
      },
    ],
  };
}

export function filtrarChamadosToa(
  chamados: ToaChamadoProcessado[],
  filtro: { ano: number | null; mes: number | null; dia: number | null },
): ToaChamadoProcessado[] {
  return chamados.filter((chamado) => {
    const [ano, mes, dia] = chamado.data.split("-").map(Number);
    if (!ano || !mes || !dia) return false;
    if (filtro.ano !== null && ano !== filtro.ano) return false;
    if (filtro.mes !== null && mes !== filtro.mes) return false;
    if (filtro.dia !== null && dia !== filtro.dia) return false;
    return true;
  });
}

/** Filtra linhas flat (1 O.S.) pelo período de data_toa. */
export function filtrarToaOsRows<
  T extends { data_toa: string },
>(
  rows: T[],
  filtro: { ano: number | null; mes: number | null; dia: number | null },
): T[] {
  return rows.filter((row) => {
    const [ano, mes, dia] = String(row.data_toa ?? "")
      .slice(0, 10)
      .split("-")
      .map(Number);
    if (!ano || !mes || !dia) return false;
    if (filtro.ano !== null && ano !== filtro.ano) return false;
    if (filtro.mes !== null && mes !== filtro.mes) return false;
    if (filtro.dia !== null && dia !== filtro.dia) return false;
    return true;
  });
}

/** @deprecated Use filtrarChamadosToa. */
export const filtrarNotasToa = filtrarChamadosToa;

export function flattenChamadosToa(
  chamados: ToaChamadoProcessado[],
): ToaOsFlattened[] {
  const flat: ToaOsFlattened[] = [];
  for (const chamado of chamados) {
    for (const ordem of chamado.ordensDeServico) {
      flat.push({
        ...ordem,
        data: chamado.data,
        login: chamado.login,
        numeroWo: chamado.numeroWo,
        contrato: chamado.contrato,
        contaReceitaFaturada: isOsReceitaFaturavelNaNota(
          ordem,
          chamado.ordensDeServico,
        ),
      });
    }
  }
  return flat;
}

/** Status agregado da Nota (WO): ≥1 O.S. produtiva (Executada + Cód 409–599 ≠ 571). */
export function statusNotaToa(
  ordens: ToaOrdemServico[],
): "Produtiva" | "Improdutiva" {
  return ordens.some(isOsProdutiva) ? "Produtiva" : "Improdutiva";
}

/** Métricas de uma Nota (WO) — slots daquela visita (não deduplica entre WOs). */
export function avaliarNotaToa(chamado: ToaChamadoProcessado): {
  statusNota: "Produtiva" | "Improdutiva";
  totalOs: number;
  osProdutivas: number;
  osImprodutivas: number;
} {
  let totalOs = 0;
  let osProdutivas = 0;
  let osImprodutivas = 0;

  for (const ordem of chamado.ordensDeServico) {
    const numeroOs = (ordem.numeroOs || "").trim();
    const codBaixa =
      (ordem.codBaixaBruto || "").trim() ||
      (ordem.codBaixa != null && ordem.codBaixa > 0 ? String(ordem.codBaixa) : "");
    if (!numeroOs && !codBaixa) continue;

    totalOs += 1;
    if (isOsProdutiva(ordem)) osProdutivas += 1;
    else if (isOsImprodutiva(ordem)) osImprodutivas += 1;
  }

  return {
    statusNota: osProdutivas > 0 ? "Produtiva" : "Improdutiva",
    totalOs,
    osProdutivas,
    osImprodutivas,
  };
}

export type ToaOsUnica = ToaOrdemServico & {
  data: string;
  login: string;
  numeroWo: string;
  contrato: string;
};

function scoreOsAparicao(ordem: ToaOrdemServico, data: string, numeroWo: string): number {
  // Produtiva vence (retrabalho OK). Depois data mais recente, depois WO.
  const prod = isOsProdutiva(ordem) ? 1_000_000_000 : 0;
  const dia = Date.parse(data) || 0;
  const woTie = Number.parseInt(String(numeroWo).replace(/\D/g, "").slice(-9), 10) || 0;
  return prod + dia + woTie / 1e12;
}

/**
 * O.S. únicas por Nº da O.S. (mesmo número em WOs distintas = 1 O.S.).
 * Em conflito de baixa/status, prevalece a aparição produtiva.
 */
export function coletarOsUnicasPorNumero(
  chamados: ToaChamadoProcessado[],
): ToaOsUnica[] {
  const map = new Map<string, { os: ToaOsUnica; score: number }>();

  for (const chamado of dedupeChamadosPorNumeroWo(chamados)) {
    for (const ordem of chamado.ordensDeServico) {
      const numeroOs = (ordem.numeroOs || "").trim();
      const codBaixa =
        (ordem.codBaixaBruto || "").trim() ||
        (ordem.codBaixa != null && ordem.codBaixa > 0
          ? String(ordem.codBaixa)
          : "");
      if (!numeroOs && !codBaixa) continue;

      // Sem Nº O.S. estável: não dá para deduplicar — chave por WO+slot.
      const key = numeroOs
        ? normalizeNumeroWo(numeroOs)
        : `${chaveNotaToa(chamado)}#${ordem.indice}`;

      const os: ToaOsUnica = {
        ...ordem,
        data: chamado.data,
        login: chamado.login,
        numeroWo: chamado.numeroWo,
        contrato: chamado.contrato,
      };
      const score = scoreOsAparicao(ordem, chamado.data, chamado.numeroWo);
      const prev = map.get(key);
      if (!prev || score > prev.score) {
        map.set(key, { os, score });
      }
    }
  }

  return Array.from(map.values()).map((entry) => entry.os);
}

/** Contagem de O.S. únicas (por Nº O.S.) e classificação prod/improd. */
export function contarOsChamadosToa(chamados: ToaChamadoProcessado[]): {
  totalOs: number;
  osProdutivas: number;
  osImprodutivas: number;
} {
  let totalOs = 0;
  let osProdutivas = 0;
  let osImprodutivas = 0;

  for (const ordem of coletarOsUnicasPorNumero(chamados)) {
    totalOs += 1;
    if (isOsProdutiva(ordem)) osProdutivas += 1;
    else if (isOsImprodutiva(ordem)) osImprodutivas += 1;
  }

  return { totalOs, osProdutivas, osImprodutivas };
}

export type ToaNotaExportRow = {
  Nome: string;
  "Login do técnico": string;
  Contrato: string;
  "Número da WO": string;
  Data: string;
  "Cód Baixa": string | number;
  "Nº O.S": string;
  "Tipo O.S": string;
  "Status da O.S": string;
  "Status da Nota": "Produtiva" | "Improdutiva";
};

/**
 * Unpivot: 1 linha Excel por O.S. pertencente àquela WO.
 * Colunas: Nome, Login, Contrato, Número da WO, Data, Cód Baixa,
 * Nº O.S, Tipo O.S, Status da O.S, Status da Nota (da WO).
 */
export function flattenChamadosToaParaExportacaoNotas(
  chamados: ToaChamadoProcessado[],
  options?: {
    nomePorLogin?: (login: string) => string;
    /**
     * Código Z... do técnico (IdTOA / Login do Técnico no TOA).
     * Default: login bruto do chamado.
     */
    loginTecnicoPorLogin?: (login: string) => string;
    formatData?: (isoDate: string) => string;
  },
): ToaNotaExportRow[] {
  const resolveNome =
    options?.nomePorLogin ?? ((login: string) => normalizeToaLogin(login));
  const resolveLoginTecnico =
    options?.loginTecnicoPorLogin ??
    ((login: string) => normalizeToaLogin(login));
  const formatData = options?.formatData ?? ((iso: string) => iso);

  const excelData: ToaNotaExportRow[] = [];

  for (const chamado of dedupeChamadosPorNumeroWo(chamados)) {
    const loginKey = normalizeToaLogin(chamado.login);
    const nome = resolveNome(loginKey);
    const loginTecnico = resolveLoginTecnico(loginKey) || loginKey;
    const contrato = chamado.contrato || "";
    const numeroWo = chamado.numeroWo || "";
    const data = formatData(chamado.data);
    const statusNota = statusNotaToa(chamado.ordensDeServico);

    const porIndice = new Map<number, ToaOrdemServico>();
    for (const ordem of chamado.ordensDeServico) {
      porIndice.set(ordem.indice, ordem);
    }

    for (let i = 1; i <= 10; i += 1) {
      const ordem = porIndice.get(i);
      if (!ordem) continue;

      const numeroOs = (ordem.numeroOs || "").trim();
      const codBaixa =
        (ordem.codBaixaBruto || "").trim() ||
        (ordem.codBaixa != null ? String(ordem.codBaixa) : "");
      if (!numeroOs && !codBaixa) continue;

      excelData.push({
        Nome: nome,
        "Login do técnico": loginTecnico,
        Contrato: contrato,
        "Número da WO": numeroWo,
        Data: data,
        "Cód Baixa": codBaixa || ordem.codBaixa,
        "Nº O.S": numeroOs,
        "Tipo O.S": ordem.tipoOs || "",
        "Status da O.S": ordem.status || "",
        "Status da Nota": statusNota,
      });
    }
  }

  return excelData;
}

/**
 * Preço unitário calibrado pelo histórico Analítico.
 * Match exato do Tipo O.S.; fallback pelo código numérico (ex.: "1 - ...").
 * QTDE no Analítico é sempre 1 — não multiplicar.
 */
export function valorPrecoOs(
  precosOs: Record<string, number> | Record<string, { valor: number }>,
  tipoOs: string,
): number {
  const chave = normalizeTipoOs(tipoOs);
  const entry = precosOs[chave];
  if (typeof entry === "number") return entry;
  if (entry && typeof entry === "object" && typeof entry.valor === "number") {
    return entry.valor;
  }

  const codigo = extrairCodigoTipoOs(tipoOs);
  if (codigo == null) return 0;

  for (const [mapKey, mapEntry] of Object.entries(precosOs)) {
    if (extrairCodigoTipoOs(mapKey) !== codigo) continue;
    if (typeof mapEntry === "number") return mapEntry;
    if (
      mapEntry &&
      typeof mapEntry === "object" &&
      typeof mapEntry.valor === "number"
    ) {
      return mapEntry.valor;
    }
  }

  return 0;
}

/**
 * Receita projetada da O.S. (simula faturamento Claro).
 * 0 se bundlada (ex.: tipo 43 com tipo 1 na mesma Nota) ou não faturável.
 */
export function valorReceitaFaturadaOs(
  ordem: Pick<ToaOsFlattened, "tipoOs" | "contaReceitaFaturada">,
  precosOs: Record<string, number> | Record<string, { valor: number }>,
): number {
  if (!ordem.contaReceitaFaturada) return 0;
  return valorPrecoOs(precosOs, ordem.tipoOs);
}

function emptyResumo(): ToaResumoTecnico {
  return {
    totalNotasFeitas: 0,
    notasProdutivas: 0,
    notasImprodutivas: 0,
    osProdutivas: 0,
    osImprodutivas: 0,
    receitaFaturada: 0,
    receitaPerda: 0,
  };
}

export function agregarChamadosToa(
  chamados: ToaChamadoProcessado[],
  precosOs:
    | Record<string, number>
    | Record<string, { valor: number }> = {},
): ToaAgregado {
  const resumoPorTecnico: Record<string, ToaResumoTecnico> = {};
  let totalOsProdutivas = 0;
  let totalOsImprodutivas = 0;
  let totalNotasFeitas = 0;
  let totalNotasProdutivas = 0;
  let totalNotasImprodutivas = 0;
  let receitaFaturadaTotal = 0;
  let receitaPerdaTotal = 0;

  const notasUnicas = dedupeChamadosPorNumeroWo(chamados);

  // Notas (1 WO = 1 Nota) + receita por visita.
  for (const chamado of notasUnicas) {
    const resumo = resumoPorTecnico[chamado.login] ?? emptyResumo();
    const metrica = avaliarNotaToa(chamado);
    // Receita (TOA): só visitas concluídas (cancelado/suspenso fora).
    const visitaConcluida =
      !chamado.statusAtividade?.trim() ||
      isStatusAtividadeConcluido(chamado.statusAtividade);

    resumo.totalNotasFeitas += 1;
    totalNotasFeitas += 1;

    let receitaFatNaNota = 0;
    let receitaPerdaNaNota = 0;

    if (visitaConcluida) {
      for (const ordem of chamado.ordensDeServico) {
        const valorServico = valorPrecoOs(precosOs, ordem.tipoOs);

        if (isOsProdutiva(ordem)) {
          if (isOsReceitaFaturavelNaNota(ordem, chamado.ordensDeServico)) {
            receitaFatNaNota += valorServico;
          }
        } else if (isOsImprodutiva(ordem)) {
          receitaPerdaNaNota += valorServico;
        }
      }
    }

    resumo.receitaFaturada += receitaFatNaNota;
    resumo.receitaPerda += receitaPerdaNaNota;
    receitaFaturadaTotal += receitaFatNaNota;
    receitaPerdaTotal += receitaPerdaNaNota;

    if (metrica.statusNota === "Produtiva") {
      resumo.notasProdutivas += 1;
      totalNotasProdutivas += 1;
    } else {
      resumo.notasImprodutivas += 1;
      totalNotasImprodutivas += 1;
    }

    resumoPorTecnico[chamado.login] = resumo;
  }

  // O.S. únicas por Nº (mesmo número em 2 WOs = 1 O.S. no totalizador).
  for (const ordem of coletarOsUnicasPorNumero(notasUnicas)) {
    const resumo = resumoPorTecnico[ordem.login] ?? emptyResumo();
    if (isOsProdutiva(ordem)) {
      resumo.osProdutivas += 1;
      totalOsProdutivas += 1;
    } else if (isOsImprodutiva(ordem)) {
      resumo.osImprodutivas += 1;
      totalOsImprodutivas += 1;
    }
    resumoPorTecnico[ordem.login] = resumo;
  }

  return {
    resumoPorTecnico,
    totalNotasFeitas,
    totalNotasProdutivas,
    totalNotasImprodutivas,
    totalOsProdutivas,
    totalOsImprodutivas,
    receitaFaturadaTotal,
    receitaPerdaTotal,
  };
}

/** @deprecated Use agregarChamadosToa. */
export const agregarNotasToa = agregarChamadosToa;

function loadSnapshot(): ToaSnapshot {
  if (!isClient()) return EMPTY_SNAPSHOT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;
    const parsed = JSON.parse(raw) as {
      chamadosProcessados?: unknown;
      notasProcessadas?: unknown;
      updatedAt?: unknown;
    };

    const fonte = Array.isArray(parsed.chamadosProcessados)
      ? parsed.chamadosProcessados
      : Array.isArray(parsed.notasProcessadas)
        ? parsed.notasProcessadas
        : [];

    const chamadosProcessados = dedupeChamadosPorNumeroWo(
      fonte
        .map(normalizeChamado)
        .filter((c): c is ToaChamadoProcessado => c !== null),
    );

    return {
      chamadosProcessados,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

let snapshot = loadSnapshot();

/**
 * @deprecated Persistência grande migrada para Supabase (`toa_importacoes`).
 * Mantido só para compatibilidade; preferir `replaceToaImportacoes`.
 */
export function saveToaChamados(
  chamados: ToaChamadoProcessado[],
): ToaSnapshot {
  const chamadosProcessados = dedupeChamadosPorNumeroWo(
    chamados
      .map(normalizeChamado)
      .filter((c): c is ToaChamadoProcessado => c !== null),
  );
  snapshot = {
    chamadosProcessados,
    updatedAt: new Date().toISOString(),
  };

  if (isClient()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }

  return snapshot;
}

/** Remove o snapshot TOA do localStorage (fonte oficial = Supabase). */
export function clearToaLocalStorage(): void {
  if (!isClient()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  snapshot = EMPTY_SNAPSHOT;
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
}

/** @deprecated Use saveToaChamados. */
export const saveToaNotas = saveToaChamados;

function subscribe(listener: () => void): () => void {
  if (!isClient()) return () => {};

  const handleUpdate = () => {
    snapshot = loadSnapshot();
    listener();
  };
  window.addEventListener(UPDATE_EVENT, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

function getSnapshot(): ToaSnapshot {
  return snapshot;
}

export function useToaSnapshot(): ToaSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
}
