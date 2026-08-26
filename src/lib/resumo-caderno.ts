import {
  calcularMetragemCaboTotal,
  parseMarcacaoNumero,
  qtdCaixasTotal,
  type CaboMetragemPayload,
  type CordoalhaBlocoPayload,
  type FotoGrupoPayload,
  type LancamentoPorAmbientePayload,
  type QuantidadesRedePayload,
  type RelatorioPayload,
} from "@/lib/relatorios-transmissao";

export type ResumoCadernoUnidade = "Metros" | "Unid." | "Hastes" | "MT";

export type ResumoCadernoLado = {
  redeLancadaAereo: number;
  cordoalhaLancada: number;
  postesNovaCordoalha: number;
  postesCordoalhaExistente: number;
  totalPostes: number;
  pontosAterramento: number;
  hastesAterramento: number;
  redeLancadaSubterraneo: number;
  dutoSubterraneo: number;
  caixaSubterranea: number;
  /** RE: fibras FO | RC: equipamentos instalados */
  fibrasOuEquipamentos: number;
  caixasEmendaInstalada: number;
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
  re: number;
  rc: number;
  total: number;
};

function numOrZero(n: number | null | undefined): number {
  return typeof n === "number" && Number.isFinite(n) ? n : 0;
}

function qtdSeSim(bloco: CordoalhaBlocoPayload | null | undefined): number {
  if (!bloco || bloco.isSim !== true) return 0;
  return numOrZero(bloco.quantidade);
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

/** Maior tipo de cabo (FO) entre todos os cabos RE/RC — tipicamente 12, 24, etc. */
function maxFibrasFo(lancamento: LancamentoPorAmbientePayload | null | undefined): number {
  if (!lancamento) return 0;
  let max = 0;
  for (const amb of ["aereo", "subterraneo"] as const) {
    for (const cabo of lancamento[amb]?.metragens ?? []) {
      const n = Number.parseInt(String(cabo.tipoCabo ?? "").replace(/\D/g, ""), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return max;
}

function countFotos(grupo: FotoGrupoPayload | null | undefined): number {
  return grupo?.fotos?.length ?? 0;
}

function buildLado(
  rede: QuantidadesRedePayload | null | undefined,
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  aterramentoFotos: FotoGrupoPayload | null | undefined,
  fibrasOuEquipamentos: number,
): ResumoCadernoLado {
  const postesNova = qtdSeSim(rede?.postesNovaCordoalha);
  const postesExist = qtdSeSim(rede?.postesCordoalhaExistente);
  return {
    redeLancadaAereo: somaMetragemAmbiente(lancamento, "aereo"),
    cordoalhaLancada: qtdSeSim(rede?.cordoalhaLancada),
    postesNovaCordoalha: postesNova,
    postesCordoalhaExistente: postesExist,
    totalPostes: postesNova + postesExist,
    pontosAterramento: countFotos(aterramentoFotos),
    hastesAterramento: numOrZero(rede?.aterramento?.totalHastes),
    redeLancadaSubterraneo: somaMetragemAmbiente(lancamento, "subterraneo"),
    /** Sem metragem de duto na UI — permanece 0 até haver campo de quantidade. */
    dutoSubterraneo: 0,
    caixaSubterranea: numOrZero(rede?.qtdCaixasEmendaPorAmbiente?.subterraneo),
    fibrasOuEquipamentos,
    caixasEmendaInstalada: qtdCaixasTotal(rede),
    /** Sem campo dedicado na UI atual — permanece 0 até haver fonte. */
    caixasEmendaExistenteRota: 0,
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
): ResumoCadernoLinha {
  return {
    id,
    bloco,
    label,
    labelRc,
    unidade,
    re,
    rc,
    total: re + rc,
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

  const re = buildLado(
    p?.redeAcesso,
    p?.lancamentoCabosRe,
    p?.novoAterramentoPoste,
    maxFibrasFo(p?.lancamentoCabosRe),
  );
  const rc = buildLado(
    p?.redeCliente,
    p?.lancamentoCabosRc,
    p?.rcNovoAterramentoPoste,
    eqCount,
  );

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
      "TOTAL de POSTES COM CORDOALHA EXISTENTE",
      "Unid.",
      re.postesCordoalhaExistente,
      rc.postesCordoalhaExistente,
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
      "duto",
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
      "Quant. de FIBRAS (FO) para esse acesso",
      "Unid.",
      re.fibrasOuEquipamentos,
      rc.fibrasOuEquipamentos,
      "Quantidade de equipamentos instalados",
    ),
    linha(
      "caixas-inst",
      "acessos",
      "Quant. caixas de emendas INSTALADA",
      "Unid.",
      re.caixasEmendaInstalada,
      rc.caixasEmendaInstalada,
    ),
    linha(
      "caixas-exist",
      "acessos",
      "Quantas caixas EMENDA existente na rota",
      "Unid.",
      re.caixasEmendaExistenteRota,
      rc.caixasEmendaExistenteRota,
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
  if (!Number.isFinite(value)) return "0";
  if (unidade === "Metros" || unidade === "MT") {
    return Number.isInteger(value)
      ? String(value)
      : value.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
  }
  return String(Math.trunc(value));
}
