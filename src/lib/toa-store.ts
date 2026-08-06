import { useSyncExternalStore } from "react";

/** Linha bruta da planilha TOA (1 Nota = 1 WO/Contrato = 1 linha). */
export type ToaOrdemLinha = {
  indice: number;
  numeroOs: string;
  codBaixaBruto: string;
  status: string;
  tipoOs: string;
};

export type ToaLinha = {
  data: string;
  loginTecnico: string;
  numeroWo: string;
  contrato: string;
  ordensDeServico: ToaOrdemLinha[];
};

export type ToaOrdemServico = {
  indice: number;
  numeroOs: string;
  codBaixa: number;
  /** Texto original da planilha (código + descrição, quando houver). */
  codBaixaBruto: string;
  status: string;
  tipoOs: string;
  isExecutada: boolean;
  /** Classificação do Cód de Baixa na tabela de apoio (PRODUTIVO). */
  isProdutiva: boolean;
};

/** Nota/Chamado processado: 1 linha TOA com N O.S. (1–10). */
export type ToaChamadoProcessado = {
  data: string;
  login: string;
  numeroWo: string;
  contrato: string;
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
  /** Total de Notas (linhas/WOs) do técnico. */
  totalNotasFeitas: number;
  /** Notas com ≥ 1 O.S. produtiva. */
  notasProdutivas: number;
  /** Notas sem nenhuma O.S. produtiva. */
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
  return normalizeStatusOs(status) === "EXECUTADA";
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

/** O.S. improdutiva: Cód de Baixa IMPRODUTIVO. */
export function isOsImprodutiva(
  ordem: Pick<ToaOrdemServico, "isProdutiva">,
): boolean {
  return !ordem.isProdutiva;
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
  if (!numeroOs && !codBaixaBruto) return null;

  const codBaixa = extrairNumeroCodBaixa(codBaixaBruto);
  if (codBaixa === null) return null;

  const status = ordem.status.trim();
  return {
    indice: ordem.indice,
    numeroOs: numeroOs || String(ordem.indice),
    codBaixa,
    codBaixaBruto: codBaixaBruto || String(codBaixa),
    status,
    tipoOs: ordem.tipoOs.trim(),
    isExecutada: isStatusExecutada(status),
    isProdutiva: isCodBaixaProdutivo(codBaixa),
  };
}

export function processarChamadosTOA(
  linhas: ToaLinha[],
): ToaChamadoProcessado[] {
  const chamados: ToaChamadoProcessado[] = [];

  for (const linha of linhas) {
    const login = normalizeToaLogin(linha.loginTecnico);
    const data = linha.data.trim();
    if (!login || !data) continue;

    const ordensDeServico = linha.ordensDeServico
      .map(processarOrdem)
      .filter((ordem): ordem is ToaOrdemServico => ordem !== null);

    if (ordensDeServico.length === 0) continue;

    chamados.push({
      data,
      login,
      numeroWo: linha.numeroWo.trim(),
      contrato: linha.contrato.trim(),
      ordensDeServico,
    });
  }

  return chamados;
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

    return {
      data: item.data.trim(),
      login: normalizeToaLogin(item.login),
      numeroWo: item.numeroWo.trim(),
      contrato: item.contrato.trim(),
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

  return {
    data: item.data.trim(),
    login: normalizeToaLogin(item.login),
    numeroWo: item.numeroWo.trim(),
    contrato: item.contrato.trim(),
    ordensDeServico: [
      {
        indice: 1,
        numeroOs:
          typeof item.numeroOs === "string" && item.numeroOs.trim()
            ? item.numeroOs.trim()
            : item.numeroWo.trim() || "1",
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

  for (const chamado of chamados) {
    const resumo = resumoPorTecnico[chamado.login] ?? emptyResumo();

    resumo.totalNotasFeitas += 1;
    totalNotasFeitas += 1;

    let osProdNaNota = 0;
    let osImprodNaNota = 0;
    let receitaFatNaNota = 0;
    let receitaPerdaNaNota = 0;

    for (const ordem of chamado.ordensDeServico) {
      const valorServico = valorPrecoOs(precosOs, ordem.tipoOs);

      if (isOsProdutiva(ordem)) {
        osProdNaNota += 1;
        if (isOsReceitaFaturavelNaNota(ordem, chamado.ordensDeServico)) {
          receitaFatNaNota += valorServico;
        }
      } else if (isOsImprodutiva(ordem)) {
        osImprodNaNota += 1;
        receitaPerdaNaNota += valorServico;
      }
    }

    resumo.osProdutivas += osProdNaNota;
    resumo.osImprodutivas += osImprodNaNota;
    resumo.receitaFaturada += receitaFatNaNota;
    resumo.receitaPerda += receitaPerdaNaNota;
    totalOsProdutivas += osProdNaNota;
    totalOsImprodutivas += osImprodNaNota;
    receitaFaturadaTotal += receitaFatNaNota;
    receitaPerdaTotal += receitaPerdaNaNota;

    if (osProdNaNota > 0) {
      resumo.notasProdutivas += 1;
      totalNotasProdutivas += 1;
    } else {
      resumo.notasImprodutivas += 1;
      totalNotasImprodutivas += 1;
    }

    resumoPorTecnico[chamado.login] = resumo;
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

    const chamadosProcessados = fonte
      .map(normalizeChamado)
      .filter((c): c is ToaChamadoProcessado => c !== null);

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
  const chamadosProcessados = chamados
    .map(normalizeChamado)
    .filter((c): c is ToaChamadoProcessado => c !== null);
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
