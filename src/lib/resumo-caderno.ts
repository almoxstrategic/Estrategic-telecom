import {
  calcularMetragemCaboTotal,
  filtrarCabosComConteudo,
  parseMarcacaoNumero,
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
  dutoSubterraneo: number;
  caixaSubterranea: number;
  caixasEmendaAereo: number;
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
  /** Unidade na coluna RC quando diferente da RE. */
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
  return filtrarCabosComConteudo(lancamento[ambiente]?.metragens ?? []).reduce(
    (acc, cabo) => acc + metragemCabo(cabo),
    0,
  );
}

function tipoCaboNumero(cabo: CaboMetragemPayload): number | null {
  const n = Number.parseInt(String(cabo.tipoCabo ?? "").replace(/\D/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Agrupa metragem por capacidade FO em um ambiente.
 * Chave `0` = cabos sem tipo informado.
 */
function metragensPorCapacidadeFo(
  lancamento: LancamentoPorAmbientePayload | null | undefined,
  ambiente: "aereo" | "subterraneo",
): Map<number, number> {
  const map = new Map<number, number>();
  if (!lancamento) return map;
  for (const cabo of filtrarCabosComConteudo(lancamento[ambiente]?.metragens ?? [])) {
    const tipo = tipoCaboNumero(cabo) ?? 0;
    map.set(tipo, (map.get(tipo) ?? 0) + metragemCabo(cabo));
  }
  return map;
}

/** União ordenada das capacidades FO (0=sem tipo por último). */
function capacidadesOrdenadas(...maps: Map<number, number>[]): number[] {
  const set = new Set<number>();
  for (const m of maps) {
    for (const k of m.keys()) {
      if ((m.get(k) ?? 0) > 0) set.add(k);
    }
  }
  const list = [...set].filter((k) => k > 0).sort((a, b) => a - b);
  if (set.has(0)) list.push(0);
  return list;
}

function labelFibraFo(capacidade: number): string {
  return capacidade > 0
    ? `Quant. de fibra ${capacidade} FO lançada`
    : "Quant. de fibra FO lançada";
}

function buildLado(
  rede: QuantidadesRedePayload | null | undefined,
  lancamento: LancamentoPorAmbientePayload | null | undefined,
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
    dutoSubterraneo: numOrZero(rede?.metrosDutoSubterraneo),
    caixaSubterranea: qtdSeSim(rede?.construcaoCaixaSubterranea),
    caixasEmendaAereo: numOrZero(rede?.qtdCaixasEmendaPorAmbiente?.aereo),
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
 * TOTAL DE POSTES: desconta 1 poste de conexão compartilhado entre RE e RC.
 * TOTAL = max(0, (RE + RC) - 1) quando a soma > 0; caso contrário 0.
 */
export function totalPostesDeduplicado(re: number, rc: number): number {
  const soma = numOrZero(re) + numOrZero(rc);
  if (soma <= 0) return 0;
  return Math.max(0, soma - 1);
}

/** Conta itens por tipo (equipamentos + lista auxiliar, ex.: Roseta / DGO). */
function contagemPorTipoEquipamento(
  equipamentos: { tipoEquipamento?: string | null }[] | null | undefined,
  extras: { tipoEquipamento?: string | null }[] | null | undefined,
  /** Tipo forçado para cada item da lista auxiliar (ex.: "Roseta"). */
  extraTipoFixo?: string,
): Map<string, number> {
  const map = new Map<string, number>();
  for (const item of equipamentos ?? []) {
    const tipo = String(item.tipoEquipamento ?? "").trim();
    if (!tipo) continue;
    map.set(tipo, (map.get(tipo) ?? 0) + 1);
  }
  for (const item of extras ?? []) {
    const tipo = extraTipoFixo ?? String(item.tipoEquipamento ?? "").trim();
    if (!tipo) continue;
    map.set(tipo, (map.get(tipo) ?? 0) + 1);
  }
  return map;
}

function labelTipoEquipamentoMedicao(tipo: string): string {
  if (tipo === "Roseta") return "Roseta instalada";
  return `Equipamento ${tipo}`;
}

function somaContagem(map: Map<string, number>): number {
  return [...map.values()].reduce((acc, n) => acc + n, 0);
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
  const re = buildLado(p?.redeAcesso, p?.lancamentoCabosRe);
  const rc = buildLado(p?.redeCliente, p?.lancamentoCabosRc);

  const foAereoRe = metragensPorCapacidadeFo(p?.lancamentoCabosRe, "aereo");
  const foAereoRc = metragensPorCapacidadeFo(p?.lancamentoCabosRc, "aereo");

  const linhasFoAereo = capacidadesOrdenadas(foAereoRe, foAereoRc).map((cap) =>
    linha(
      `fibra-aereo-${cap || "sem-tipo"}`,
      "aereo",
      labelFibraFo(cap),
      "Metros",
      foAereoRe.get(cap) ?? 0,
      foAereoRc.get(cap) ?? 0,
    ),
  );

  // Cliente (RC): equipamentos + Roseta. Estação/PPC: equipamentos + DGO/DID/ROUTER.
  const porTipoCliente = contagemPorTipoEquipamento(
    p?.eqClienteEquipamentos,
    p?.eqClienteDgo,
    "Roseta",
  );
  const porTipoEstacao = contagemPorTipoEquipamento(
    p?.eqEstacaoEquipamento,
    p?.eqEstacaoDgo,
    "DGO / DID / ROUTER",
  );
  const tiposEq = [
    ...new Set([...porTipoEstacao.keys(), ...porTipoCliente.keys()]),
  ].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const linhasTipoEq = tiposEq.map((tipo) =>
    linha(
      `eq-tipo-${tipo}`,
      "acessos",
      labelTipoEquipamentoMedicao(tipo),
      "Unid.",
      porTipoEstacao.get(tipo) ?? 0,
      porTipoCliente.get(tipo) ?? 0,
    ),
  );
  const totalEquipamentosEstacao = somaContagem(porTipoEstacao);
  const totalEquipamentosCliente = somaContagem(porTipoCliente);

  const linhas: ResumoCadernoLinha[] = [
    // —— A. Infraestrutura Aérea (ordem fixa) ——
    linha(
      "rede-aereo",
      "aereo",
      "TOTAL REDE LANÇADA (AÉREO)",
      "Metros",
      re.redeLancadaAereo,
      rc.redeLancadaAereo,
    ),
    ...linhasFoAereo,
    linha("postes-total", "aereo", "TOTAL DE POSTES", "Unid.", re.totalPostes, rc.totalPostes, undefined, {
      total: totalPostesDeduplicado(re.totalPostes, rc.totalPostes),
    }),
    linha(
      "postes-nova",
      "aereo",
      "POSTE COM NOVA CORDOALHA",
      "Unid.",
      re.postesNovaCordoalha,
      rc.postesNovaCordoalha,
    ),
    linha("cordoalha", "aereo", "CORDOALHA (lançada)", "Metros", re.cordoalhaLancada, rc.cordoalhaLancada),
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
    linha(
      "caixas-inst-aereo",
      "aereo",
      "Quant. de CAIXAS DE EMENDA instalada",
      "Unid.",
      re.caixasEmendaAereo,
      rc.caixasEmendaAereo,
    ),
    linha(
      "caixas-exist",
      "aereo",
      "CAIXAS DE EMENDA existente na rota?",
      "SIM/NÃO",
      re.caixasEmendaExistenteRota,
      rc.caixasEmendaExistenteRota,
      undefined,
      { omitTotal: true, total: Number.NaN },
    ),
    linha(
      "fiberloop",
      "aereo",
      "Quant. de FIBERLOOP instalados?",
      "Unid.",
      re.fiberloopInstalados,
      rc.fiberloopInstalados,
    ),

    // —— B. Aterramento ——
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

    // —— C. Infraestrutura Subterrânea (somente duto + caixa) ——
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

    // —— Acessos e Equipamentos (re = Estação/PPC, rc = Cliente) ——
    linha(
      "eq-instalados",
      "acessos",
      "Quantidade de EQUIPAMENTOS na Estação/PPC",
      "Unid.",
      totalEquipamentosEstacao,
      totalEquipamentosCliente,
      "Quantidade de EQUIPAMENTOS no Cliente (RC)",
    ),
    ...linhasTipoEq,
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
