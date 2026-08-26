import {
  calcularMetragemCaboTotal,
  parseMarcacaoNumero,
  qtdCaixasTotal,
  type CaboMetragemPayload,
  type CordoalhaBlocoPayload,
  type LancamentoPorAmbientePayload,
  type QuantidadesRedePayload,
  type RelatorioPayload,
} from "@/lib/relatorios-transmissao";

export type ResumoCadernoUnidade = "Metros" | "Unid." | "Hastes" | "MT" | "SIM/NÃO";

export type ResumoCadernoLado = {
  redeLancadaAereo: number;
  cordoalhaLancada: number;
  postesNovaCordoalha: number;
  /** Código: 1 = SIM, 0 = NÃO, NaN = sem resposta. */
  postesCordoalhaExistente: number;
  totalPostes: number;
  pontosAterramento: number;
  hastesAterramento: number;
  redeLancadaSubterraneo: number;
  dutoSubterraneo: number;
  caixaSubterranea: number;
  /** RE: metragem FO | RC: equipamentos instalados */
  fibrasOuEquipamentos: number;
  /** Capacidade FO dominante (tipo de cabo), para o rótulo RE. */
  capacidadeFo: number | null;
  caixasEmendaInstalada: number;
  /** Código SIM/NÃO. */
  caixasEmendaExistenteRota: number;
  fiberloopInstalados: number;
};

export type ResumoCadernoLinha = {
  id: string;
  bloco: "aereo" | "aterramento" | "subterraneo" | "acessos";
  /** Rótulo comum (blocos 1–3) ou rótulo RE (bloco 4). */
  label: string;
  /** Rótulo específico RC quando diferente do RE (bloco 4). */
  labelRc?: string;
  unidade: ResumoCadernoUnidade;
  /** Unidade na coluna RC quando diferente da RE (ex.: fibras × equipamentos). */
  unidadeRc?: ResumoCadernoUnidade;
  re: number;
  rc: number;
  total: number;
  /** Quando true, a coluna TOTAL fica vazia (ex.: SIM/NÃO só por lado). */
  omitTotal?: boolean;
};

function numOrZero(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function qtdSeSim(bloco: CordoalhaBlocoPayload | null | undefined): number {
  if (!bloco || bloco.isSim !== true) return 0;
  return numOrZero(bloco.quantidade);
}

/** Codifica boolean de posteadagem para exibição SIM/NÃO na aba Medições. */
export function simNaoToCode(isSim: boolean | null | undefined): number {
  if (isSim === true) return 1;
  if (isSim === false) return 0;
  return Number.NaN;
}

function metragemCabo(cabo: CaboMetragemPayload): number {
  const direto = parseMarcacaoNumero(cabo.metragem ?? "");
  if (direto != null) return Math.abs(direto);
  const calc = parseMarcacaoNumero(
    calcularMetragemCaboTotal(cabo.marcacaoInicial ?? "", cabo.marcacaoFinal ?? ""),
  );
  return calc != null ? Math.abs(calc) : 0;
}

function somaMetragemAmbiente(
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  ambiente: "aereo" | "subterraneo",
): number {
  if (!lancamento) return 0;
  return (lancamento[ambiente]?.metragens ?? []).reduce((acc, cabo) => acc + metragemCabo(cabo), 0);
}

function tipoCaboNumero(cabo: CaboMetragemPayload): number | null {
  const n = Number.parseInt(String(cabo.tipoCabo ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Maior tipo de cabo (FO) entre todos os cabos — tipicamente 12, 24, etc. */
function capacidadeFoDominante(
  lancamento: LancamentoPorAmbientePayload | null | undefined,
): number | null {
  if (!lancamento) return null;
  let max: number | null = null;
  for (const amb of ["aereo", "subterraneo"] as const) {
    for (const cabo of lancamento[amb]?.metragens ?? []) {
      const n = tipoCaboNumero(cabo);
      if (n != null && (max == null || n > max)) max = n;
    }
  }
  return max;
}

/** Soma metragem dos cabos cuja capacidade FO coincide com `capacidade`. */
function somaMetragemPorCapacidadeFo(
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  capacidade: number | null,
): number {
  if (!lancamento || capacidade == null) return 0;
  let soma = 0;
  for (const amb of ["aereo", "subterraneo"] as const) {
    for (const cabo of lancamento[amb]?.metragens ?? []) {
      if (tipoCaboNumero(cabo) === capacidade) soma += metragemCabo(cabo);
    }
  }
  return soma;
}

function buildLado(
  rede: QuantidadesRedePayload | null | undefined,
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  fibrasOuEquipamentos: number,
  capacidadeFo: number | null,
): ResumoCadernoLado {
  const postesNova = qtdSeSim(rede?.postesNovaCordoalha);
  return {
    redeLancadaAereo: somaMetragemAmbiente(lancamento, "aereo"),
    cordoalhaLancada: qtdSeSim(rede?.cordoalhaLancada),
    postesNovaCordoalha: postesNova,
    postesCordoalhaExistente: simNaoToCode(rede?.postesCordoalhaExistente?.isSim),
    totalPostes: numOrZero(rede?.qtdTotalPostes),
    pontosAterramento: numOrZero(rede?.aterramento?.pontosAterramento),
    hastesAterramento: numOrZero(rede?.aterramento?.totalHastes),
    redeLancadaSubterraneo: somaMetragemAmbiente(lancamento, "subterraneo"),
    dutoSubterraneo: numOrZero(rede?.metrosDutoSubterraneo),
    caixaSubterranea: qtdSeSim(rede?.construcaoCaixaSubterranea),
    fibrasOuEquipamentos,
    capacidadeFo,
    caixasEmendaInstalada: qtdCaixasTotal(rede),
    caixasEmendaExistenteRota: simNaoToCode(rede?.caixaEmendaExistente?.isSim),
    fiberloopInstalados: qtdSeSim(rede?.fiberloopInstalado),
  };
}

function linha(
  id: string,
  bloco: ResumoCadernoLinha["bloco"],
  label: string,
  unidade: ResumoCadernoUnidade,
  re: number,
  rc: number,
  labelRc?: string,
  extras?: Partial<Pick<ResumoCadernoLinha, "unidadeRc" | "omitTotal" | "total">>,
): ResumoCadernoLinha {
  return {
    id,
    bloco,
    label,
    labelRc,
    unidade,
    unidadeRc: extras?.unidadeRc,
    re,
    rc,
    total: extras?.total ?? re + rc,
    omitTotal: extras?.omitTotal,
  };
}

/**
 * Consolida métricas do caderno a partir do payload (somente leitura / derivado).
 */
export function buildResumoCaderno(payload: RelatorioPayload | null | undefined): {
  re: ResumoCadernoLado;
  rc: ResumoCadernoLado;
  linhas: ResumoCadernoLinha[];
} {
  const p = payload;
  const eqCount = p?.eqClienteEquipamentos?.length ?? 0;
  const capFoRe = capacidadeFoDominante(p?.lancamentoCabosRe);
  const metragemFoRe = somaMetragemPorCapacidadeFo(p?.lancamentoCabosRe, capFoRe);

  const re = buildLado(p?.redeAcesso, p?.lancamentoCabosRe, metragemFoRe, capFoRe);
  const rc = buildLado(p?.redeCliente, p?.lancamentoCabosRc, eqCount, null);

  const labelFibraRe =
    capFoRe != null
      ? `Quant. de fibra ${capFoRe} FO lançada`
      : "Quant. de fibra FO lançada";

  const linhas: ResumoCadernoLinha[] = [
    linha("rede-aereo", "aereo", "TOTAL REDE LANÇADA (AÉREO)", "Metros", re.redeLancadaAereo, rc.redeLancadaAereo),
    linha("cordoalha", "aereo", "TOTAL CORDOALHA (lançada)", "Metros", re.cordoalhaLancada, rc.cordoalhaLancada),
    linha(
      "postes-nova",
      "aereo",
      "TOTAL de POSTES COM NOVA CORDOALHA",
      "Unid.",
      re.postesNovaCordoalha,
      rc.postesNovaCordoalha,
    ),
    linha(
      "postes-exist",
      "aereo",
      "POSTES COM CORDOALHA EXISTENTE?",
      "SIM/NÃO",
      re.postesCordoalhaExistente,
      rc.postesCordoalhaExistente,
      undefined,
      { omitTotal: true, total: Number.NaN },
    ),
    linha("postes-total", "aereo", "TOTAL DE POSTES", "Unid.", re.totalPostes, rc.totalPostes),
    linha(
      "aterramento-pontos",
      "aterramento",
      "Quant de pontos de Aterramento",
      "Unid.",
      re.pontosAterramento,
      rc.pontosAterramento,
    ),
    linha(
      "aterramento-hastes",
      "aterramento",
      "ATERRAMENTO -> TOTAL DE HASTES (5/8)",
      "Hastes",
      re.hastesAterramento,
      rc.hastesAterramento,
    ),
    linha(
      "rede-sub",
      "subterraneo",
      "TOTAL REDE LANÇADA (SUBTERRÂNEO)",
      "Metros",
      re.redeLancadaSubterraneo,
      rc.redeLancadaSubterraneo,
    ),
    linha(
      "duto-sub",
      "subterraneo",
      "Const. de DUTO SUBTERÂNEO (MD ou MND)",
      "MT",
      re.dutoSubterraneo,
      rc.dutoSubterraneo,
    ),
    linha(
      "caixa-sub",
      "subterraneo",
      "Construção de CAIXA SUBTERÂNEA",
      "Unid.",
      re.caixaSubterranea,
      rc.caixaSubterranea,
    ),
    linha(
      "fibras-eq",
      "acessos",
      labelFibraRe,
      "Metros",
      re.fibrasOuEquipamentos,
      rc.fibrasOuEquipamentos,
      "Quant. de EQUIPAMENTOS instalados",
      { unidadeRc: "Unid." },
    ),
    linha(
      "caixas-inst",
      "acessos",
      "Quant. de CAIXAS DE EMENDA instalada",
      "Unid.",
      re.caixasEmendaInstalada,
      rc.caixasEmendaInstalada,
    ),
    linha(
      "caixas-exist",
      "acessos",
      "CAIXAS DE EMENDA existente na rota?",
      "SIM/NÃO",
      re.caixasEmendaExistenteRota,
      rc.caixasEmendaExistenteRota,
      undefined,
      { omitTotal: true, total: Number.NaN },
    ),
    linha(
      "fiberloop",
      "acessos",
      "Quant. de FIBERLOOP instalados?",
      "Unid.",
      re.fiberloopInstalados,
      rc.fiberloopInstalados,
    ),
  ];

  return { re, rc, linhas };
}

export function formatResumoNumero(value: number, unidade: ResumoCadernoUnidade): string {
  if (unidade === "SIM/NÃO") {
    if (value === 1) return "SIM";
    if (value === 0) return "NÃO";
    return "—";
  }
  if (!Number.isFinite(value)) return "0";
  if (unidade === "Metros" || unidade === "MT") {
    return Number.isInteger(value)
      ? String(value)
      : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return String(Math.trunc(value));
}
