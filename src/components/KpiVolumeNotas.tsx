import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Check,
  CheckCheck,
  ChevronsUpDown,
  ClipboardCheck,
  FilterX,
  X,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FiltroTipoAtividade,
  filtrarPorTiposAtividade,
} from "@/components/FiltroTipoAtividade";
import {
  FATURAMENTO_HISTORICO_ATE,
  fetchAnaliticoHistorico,
  fetchCompetenciasAnalitico,
  fetchCompetenciasToa,
  fetchToaImportacoes,
  filtrarToaOsContabilizaveis,
  parseDhBaixaAnoMes,
  type AnaliticoHistoricoRow,
  type ToaImportacaoRow,
} from "@/lib/faturamento-service";
import { extrairTiposAtividadeUnicos } from "@/lib/filtro-tipo-atividade";
import { normalizeNumeroWo, normalizeToaLogin } from "@/lib/toa-store";

const MESES = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
] as const;

type NotaVolumeAgg = {
  chave: string;
  dataIso: string;
  competencia: number;
  statusNota: "Produtiva" | "Improdutiva";
  fonte: "analitico" | "toa";
  /** Identificador do técnico (login / equipe) para headcount. */
  tecnico: string;
  /** Serviço real da WO (TOA); ausente no analítico legado. */
  tipo_atividade?: string;
};

type ChartPoint = {
  chave: string;
  label: string;
  /** Abreviação do dia da semana (visão diária). */
  diaSemana?: string;
  /** 0=Dom … 6=Sáb (visão diária). */
  diaJs?: number;
  produtivas: number;
  improdutivas: number;
  total: number;
  qtd_tecnicos: number;
  /** Barras/linha cinza quando toggle Projeção está ativo. */
  produtivas_fantasma?: number | null;
  tecnicos_fantasma?: number | null;
};

type ResumoCapacidade = {
  mediaSemana: number;
  mediaSabado: number;
  /** Média de notas produtivas por dia com operação. */
  mediaNotasDia: number;
  /** Soma reais + fantasma (só quando projeção ativa). */
  projecaoTotalMes: number | null;
};

const DIAS_SEMANA_CURTO = [
  "Dom",
  "Seg",
  "Ter",
  "Qua",
  "Qui",
  "Sex",
  "Sáb",
] as const;

function diaSemanaCurto(ano: number, mes: number, dia: number): string {
  const d = new Date(ano, mes - 1, dia);
  return DIAS_SEMANA_CURTO[d.getDay()] ?? "";
}

type CustomXAxisTickProps = {
  x?: number;
  y?: number;
  index?: number;
  payload?: { value?: string | number };
};

/** Rótulo do eixo X (visão mensal ou diária) com qtds opcionais. */
function CustomXAxisTick({
  x = 0,
  y = 0,
  payload,
  modo,
  diaSemana,
  mostrarQuantDiaria = false,
  mostrarQuantTecnicos = false,
  valorNotas = 0,
  valorTecnicos = 0,
  isProjecao = false,
}: CustomXAxisTickProps & {
  modo: "dia" | "mes";
  diaSemana?: string;
  mostrarQuantDiaria?: boolean;
  mostrarQuantTecnicos?: boolean;
  valorNotas?: number;
  valorTecnicos?: number;
  /** Dia futuro com valores fantasma (cores de pendência). */
  isProjecao?: boolean;
}) {
  const labelPrincipal = String(payload?.value ?? "");
  const corNotas = isProjecao ? "#ea580c" : "#16a34a";
  const corTecnicos = isProjecao ? "#ca8a04" : "#f59e0b";

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={0} y={0} dy={16} textAnchor="middle" fontSize={12}>
        {modo === "mes" ? (
          <tspan x={0} dy={0} fill="#666" fontWeight={600} fontSize={11}>
            {labelPrincipal}
          </tspan>
        ) : (
          <>
            <tspan x={0} dy={0} fill="#666" fontWeight={600} fontSize={13}>
              {labelPrincipal.padStart(2, "0")}
            </tspan>
            <tspan x={0} dy={16} fill="#666" fontSize={12}>
              {diaSemana ?? ""}
            </tspan>
          </>
        )}
        {mostrarQuantDiaria && valorNotas > 0 ? (
          <tspan
            x={0}
            dy={modo === "mes" ? 16 : 18}
            fill={corNotas}
            fontSize={11}
            fontWeight={700}
          >
            {valorNotas}
          </tspan>
        ) : null}
        {mostrarQuantTecnicos && valorTecnicos > 0 ? (
          <tspan x={0} dy={16} fill={corTecnicos} fontSize={11} fontWeight={700}>
            {valorTecnicos} Téc
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function labelCompetencia(ym: number): string {
  const ano = Math.floor(ym / 100);
  const mes = ym % 100;
  return `${mesLabel(mes)} ${ano}`;
}

function competenciaFromIso(iso: string): number | null {
  const m = iso.slice(0, 10).match(/^(\d{4})-(\d{2})/);
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  if (!Number.isFinite(ano) || mes < 1 || mes > 12) return null;
  return ano * 100 + mes;
}

function isoFromParts(ano: number, mes: number, dia: number): string {
  return `${ano}-${String(mes).padStart(2, "0")}-${String(dia).padStart(2, "0")}`;
}

/** Cutoff: Analítico até jun/2026; TOA a partir de jul/2026. */
function isCompetenciaAnalitico(ym: number): boolean {
  return ym > 0 && ym <= FATURAMENTO_HISTORICO_ATE;
}

function isCompetenciaToa(ym: number): boolean {
  return ym > FATURAMENTO_HISTORICO_ATE;
}

function tecnicoFromAnalitico(row: AnaliticoHistoricoRow): string {
  const equipe = String(row.id_equipe ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (equipe) return equipe;
  const servidor = String(row.servidor ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return servidor || "Sem técnico";
}

function tecnicoFromToa(row: ToaImportacaoRow): string {
  const login = normalizeToaLogin(row.login_tecnico);
  if (login) return login;
  const nome = String(row.nome_tecnico ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return nome || "Sem técnico";
}

function mediaArredondada(valores: number[]): number {
  if (valores.length === 0) return 0;
  const soma = valores.reduce((acc, n) => acc + n, 0);
  return Math.round(soma / valores.length);
}

/**
 * Capacidade operacional média por dia (Seg–Sex / Sáb) + média produtiva.
 * Usa `qtd_tecnicos` dos pontos diários do gráfico (não headcount acumulado do mês).
 */
function calcularResumoCapacidade(
  data: ChartPoint[],
  dataComProjecao?: ChartPoint[],
  projecaoAtiva = false,
): ResumoCapacidade | null {
  if (data.length === 0 || data.every((d) => d.diaJs == null)) return null;

  const diasUteis = data.filter(
    (d) =>
      d.diaJs != null &&
      d.diaJs >= 1 &&
      d.diaJs <= 5 &&
      d.produtivas > 0,
  );
  const sabados = data.filter(
    (d) => d.diaJs === 6 && d.produtivas > 0,
  );

  const mediaSemana =
    diasUteis.length > 0
      ? Math.round(
          diasUteis.reduce((acc, d) => acc + d.qtd_tecnicos, 0) /
            diasUteis.length,
        )
      : 0;
  const mediaSabado =
    sabados.length > 0
      ? Math.round(
          sabados.reduce((acc, d) => acc + d.qtd_tecnicos, 0) / sabados.length,
        )
      : 0;

  const diasComOperacao = data.filter((d) => d.produtivas > 0);
  const totalNotas = data.reduce((acc, d) => acc + d.produtivas, 0);
  const qtdDias =
    diasComOperacao.length > 0 ? diasComOperacao.length : data.length;
  const mediaNotasDia =
    qtdDias > 0 ? Math.round(totalNotas / qtdDias) : 0;

  let projecaoTotalMes: number | null = null;
  if (projecaoAtiva && dataComProjecao) {
    const reais = dataComProjecao.reduce((acc, d) => acc + d.produtivas, 0);
    const fantasma = dataComProjecao.reduce(
      (acc, d) => acc + (Number(d.produtivas_fantasma) || 0),
      0,
    );
    projecaoTotalMes = reais + fantasma;
  }

  return {
    mediaSemana,
    mediaSabado,
    mediaNotasDia,
    projecaoTotalMes,
  };
}

/**
 * Médias históricas por dia da semana (0=Dom … 6=Sáb),
 * a partir dos dias até o cutoff (inclui zeros de fins de semana).
 * Fallback: média global do período se ainda não houver amostra daquele weekday.
 */
function calcularMediasPorDiaSemana(
  historicoAteCutoff: ChartPoint[],
): Record<number, { produtivas: number; tecnicos: number }> {
  const buckets = new Map<number, { prod: number[]; tec: number[] }>();
  for (const d of historicoAteCutoff) {
    if (d.diaJs == null) continue;
    const b = buckets.get(d.diaJs) ?? { prod: [], tec: [] };
    b.prod.push(d.produtivas);
    b.tec.push(d.qtd_tecnicos);
    buckets.set(d.diaJs, b);
  }

  const mediaGlobalProd = mediaArredondada(
    historicoAteCutoff.map((d) => d.produtivas),
  );
  const mediaGlobalTec = mediaArredondada(
    historicoAteCutoff.map((d) => d.qtd_tecnicos),
  );

  const medias: Record<number, { produtivas: number; tecnicos: number }> = {};
  for (let js = 0; js <= 6; js++) {
    const b = buckets.get(js);
    if (b && b.prod.length > 0) {
      medias[js] = {
        produtivas: mediaArredondada(b.prod),
        tecnicos: mediaArredondada(b.tec),
      };
    } else {
      medias[js] = {
        produtivas: mediaGlobalProd,
        tecnicos: mediaGlobalTec,
      };
    }
  }
  return medias;
}

/**
 * Projeção só após o último dia com produção real, usando a média
 * histórica do mesmo dia da semana (sazonalidade Dom/Sáb/úteis).
 */
function aplicarProjecaoMedia(
  data: ChartPoint[],
  modo: "dia" | "mes",
  mostrarProjecao: boolean,
): ChartPoint[] {
  if (!mostrarProjecao || modo !== "dia" || data.length === 0) {
    return data.map((d) => ({
      ...d,
      produtivas_fantasma: 0,
      tecnicos_fantasma: null,
    }));
  }

  const diasComProducao = data.filter((d) => d.produtivas > 0);
  if (diasComProducao.length === 0) {
    return data.map((d) => ({
      ...d,
      produtivas_fantasma: 0,
      tecnicos_fantasma: null,
    }));
  }

  /** Último dia operacional do mês (maior dia com produtivas > 0). */
  const ultimoDiaComDados = Math.max(
    ...diasComProducao.map((d) => Number(d.chave) || 0),
  );

  const historicoAteCutoff = data.filter(
    (d) => (Number(d.chave) || 0) <= ultimoDiaComDados,
  );
  const mediasPorSemana = calcularMediasPorDiaSemana(historicoAteCutoff);

  return data.map((d) => {
    const diaNum = Number(d.chave) || 0;
    const isFuturo = diaNum > ultimoDiaComDados;
    const isAncora = diaNum === ultimoDiaComDados;
    const js = d.diaJs ?? 0;
    const mediaDia = mediasPorSemana[js] ?? { produtivas: 0, tecnicos: 0 };

    return {
      ...d,
      produtivas_fantasma: isFuturo ? mediaDia.produtivas : 0,
      // null no passado; âncora no último real; média do weekday no futuro.
      tecnicos_fantasma: isFuturo
        ? mediaDia.tecnicos
        : isAncora
          ? d.qtd_tecnicos
          : null,
    };
  });
}

/**
 * Analítico: cada linha = 1 nota produtiva (faturada Claro).
 * Só competências ≤ jun/2026.
 */
function agregarNotasAnalitico(
  rows: AnaliticoHistoricoRow[],
): NotaVolumeAgg[] {
  const out: NotaVolumeAgg[] = [];
  for (const row of rows) {
    const parsed = parseDhBaixaAnoMes(row.dh_baixa);
    if (!parsed) continue;
    const competencia = parsed.ano * 100 + parsed.mes;
    if (!isCompetenciaAnalitico(competencia)) continue;

    const dataIso = isoFromParts(parsed.ano, parsed.mes, parsed.dia);
    const chave =
      row.id?.trim() ||
      `A:${row.cd_os || ""}:${row.nr_contrato || ""}:${dataIso}:${out.length}`;

    out.push({
      chave,
      dataIso,
      competencia,
      statusNota: "Produtiva",
      fonte: "analitico",
      tecnico: tecnicoFromAnalitico(row),
    });
  }
  return out;
}

/**
 * TOA: 1 WO = 1 nota; produtiva se ≥1 O.S. com status_nota Produtiva.
 * Só competências ≥ jul/2026.
 */
function agregarNotasToa(rows: ToaImportacaoRow[]): NotaVolumeAgg[] {
  const byWo = new Map<string, NotaVolumeAgg>();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;
    const dataIso = String(row.data_toa ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dataIso)) continue;
    const competencia =
      row.competencia > 0
        ? row.competencia
        : (competenciaFromIso(dataIso) ?? 0);
    if (!isCompetenciaToa(competencia)) continue;

    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";
    const tecnico = tecnicoFromToa(row);
    const tipoAtividade = String(row.tipo_atividade ?? "").trim();

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, {
        chave: numeroWo,
        dataIso,
        competencia,
        statusNota,
        fonte: "toa",
        tecnico,
        tipo_atividade: tipoAtividade || undefined,
      });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (dataIso < prev.dataIso) prev.dataIso = dataIso;
    if (!prev.tecnico || prev.tecnico === "Sem técnico") prev.tecnico = tecnico;
    if (tipoAtividade && !prev.tipo_atividade) {
      prev.tipo_atividade = tipoAtividade;
    }
  }

  return Array.from(byWo.values());
}

function filtrarNotasPorPeriodo(
  notas: NotaVolumeAgg[],
  ano: number | null,
  meses: number[],
): NotaVolumeAgg[] {
  return notas.filter((n) => {
    const nAno = Math.floor(n.competencia / 100);
    const nMes = n.competencia % 100;
    if (ano !== null && nAno !== ano) return false;
    if (meses.length > 0 && !meses.includes(nMes)) return false;
    return true;
  });
}

function competenciaUnica(notas: NotaVolumeAgg[]): number | null {
  const set = new Set(notas.map((n) => n.competencia));
  if (set.size !== 1) return null;
  return [...set][0] ?? null;
}

/** Preenche competências vazias entre min e max para linha do tempo contínua. */
function competenciasContinuas(comps: number[]): number[] {
  if (comps.length === 0) return [];
  const sorted = [...comps].sort((a, b) => a - b);
  const min = sorted[0]!;
  const max = sorted[sorted.length - 1]!;
  const out: number[] = [];
  let ym = min;
  while (ym <= max) {
    out.push(ym);
    const ano = Math.floor(ym / 100);
    const mes = ym % 100;
    ym = mes === 12 ? (ano + 1) * 100 + 1 : ano * 100 + (mes + 1);
  }
  return out;
}

function montarSerieChart(notas: NotaVolumeAgg[]): {
  modo: "dia" | "mes";
  data: ChartPoint[];
} {
  const unica = competenciaUnica(notas);
  if (unica !== null) {
    const byDay = new Map<
      number,
      {
        produtivas: number;
        improdutivas: number;
        tecnicos: Set<string>;
      }
    >();
    for (const n of notas) {
      const dia = Number(n.dataIso.slice(8, 10));
      if (!Number.isFinite(dia) || dia < 1 || dia > 31) continue;
      const bucket = byDay.get(dia) ?? {
        produtivas: 0,
        improdutivas: 0,
        tecnicos: new Set<string>(),
      };
      if (n.statusNota === "Produtiva") bucket.produtivas += 1;
      else bucket.improdutivas += 1;
      if (n.tecnico && n.tecnico !== "Sem técnico") {
        bucket.tecnicos.add(n.tecnico);
      }
      byDay.set(dia, bucket);
    }
    const anoComp = Math.floor(unica / 100);
    const mesComp = unica % 100;
    const ultimoDia = new Date(anoComp, mesComp, 0).getDate();
    const dias = Array.from({ length: ultimoDia }, (_, i) => i + 1);
    return {
      modo: "dia",
      data: dias.map((dia) => {
        const b = byDay.get(dia) ?? {
          produtivas: 0,
          improdutivas: 0,
          tecnicos: new Set<string>(),
        };
        const dataRef = new Date(anoComp, mesComp - 1, dia);
        return {
          chave: String(dia),
          label: String(dia).padStart(2, "0"),
          diaSemana: diaSemanaCurto(anoComp, mesComp, dia),
          diaJs: dataRef.getDay(),
          produtivas: b.produtivas,
          improdutivas: b.improdutivas,
          total: b.produtivas + b.improdutivas,
          qtd_tecnicos: b.tecnicos.size,
        };
      }),
    };
  }

  const byComp = new Map<
    number,
    {
      produtivas: number;
      improdutivas: number;
      tecnicos: Set<string>;
    }
  >();
  for (const n of notas) {
    const bucket = byComp.get(n.competencia) ?? {
      produtivas: 0,
      improdutivas: 0,
      tecnicos: new Set<string>(),
    };
    if (n.statusNota === "Produtiva") bucket.produtivas += 1;
    else bucket.improdutivas += 1;
    if (n.tecnico && n.tecnico !== "Sem técnico") {
      bucket.tecnicos.add(n.tecnico);
    }
    byComp.set(n.competencia, bucket);
  }

  const comps = competenciasContinuas([...byComp.keys()]);
  return {
    modo: "mes",
    data: comps.map((ym) => {
      const b = byComp.get(ym) ?? {
        produtivas: 0,
        improdutivas: 0,
        tecnicos: new Set<string>(),
      };
      return {
        chave: String(ym),
        label: labelCompetencia(ym),
        produtivas: b.produtivas,
        improdutivas: b.improdutivas,
        total: b.produtivas + b.improdutivas,
        qtd_tecnicos: b.tecnicos.size,
      };
    }),
  };
}

export function KpiVolumeNotas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [toaRows, setToaRows] = useState<ToaImportacaoRow[]>([]);
  const [analiticoRows, setAnaliticoRows] = useState<AnaliticoHistoricoRow[]>(
    [],
  );
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mesesSelecionados, setMesesSelecionados] = useState<number[]>([]);
  const [mesesOpen, setMesesOpen] = useState(false);
  const [tiposAtividadeFiltro, setTiposAtividadeFiltro] = useState<string[]>(
    [],
  );
  const [mostrarProjecao, setMostrarProjecao] = useState(false);
  const [mostrarQuantDiaria, setMostrarQuantDiaria] = useState(false);
  const [mostrarQuantTecnicos, setMostrarQuantTecnicos] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const [compsToa, compsAnalitico, flatToa, flatAnalitico] =
          await Promise.all([
            fetchCompetenciasToa().catch(() => [] as number[]),
            fetchCompetenciasAnalitico().catch(() => [] as number[]),
            fetchToaImportacoes({
              ano,
              mes: null,
              dia: null,
            }),
            fetchAnaliticoHistorico({
              ano,
              mes: null,
            }),
          ]);
        if (cancelled) return;

        const porChave = new Set<number>();
        for (const ym of [...compsToa, ...compsAnalitico]) {
          if (ym >= 200001 && ym % 100 >= 1 && ym % 100 <= 12) {
            porChave.add(ym);
          }
        }

        setCompetencias([...porChave].sort((a, b) => a - b));
        setToaRows(filtrarToaOsContabilizaveis(flatToa));
        setAnaliticoRows(flatAnalitico);
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar volume de notas:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o volume de notas.",
        );
        setToaRows([]);
        setAnaliticoRows([]);
        setCompetencias([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ano]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      if (a >= 2000) set.add(a);
    }
    return [...set].sort((a, b) => b - a);
  }, [competencias]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      const m = ym % 100;
      if (ano !== null && a !== ano) continue;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [competencias, ano]);

  useEffect(() => {
    setMesesSelecionados((prev) =>
      prev.filter((m) => mesesDisponiveis.includes(m)),
    );
  }, [mesesDisponiveis]);

  const tiposAtividadeOpcoes = useMemo(
    () =>
      extrairTiposAtividadeUnicos(toaRows.map((row) => row.tipo_atividade)),
    [toaRows],
  );

  const notasFiltradas = useMemo(() => {
    const notas = [
      ...agregarNotasAnalitico(analiticoRows),
      ...agregarNotasToa(toaRows),
    ];
    const porPeriodo = filtrarNotasPorPeriodo(notas, ano, mesesSelecionados);
    return filtrarPorTiposAtividade(
      porPeriodo,
      tiposAtividadeOpcoes,
      tiposAtividadeFiltro,
      (item) => item.tipo_atividade,
    );
  }, [
    analiticoRows,
    toaRows,
    ano,
    mesesSelecionados,
    tiposAtividadeFiltro,
    tiposAtividadeOpcoes,
  ]);

  const totais = useMemo(() => {
    let produtivas = 0;
    let improdutivas = 0;
    for (const n of notasFiltradas) {
      if (n.statusNota === "Produtiva") produtivas += 1;
      else improdutivas += 1;
    }
    return {
      total: notasFiltradas.length,
      produtivas,
      improdutivas,
    };
  }, [notasFiltradas]);

  const serieBase = useMemo(
    () => montarSerieChart(notasFiltradas),
    [notasFiltradas],
  );

  /** Projeção só na visão diária (mês específico ≠ Todos). */
  const podeProjetar = serieBase.modo === "dia";

  useEffect(() => {
    if (!podeProjetar) setMostrarProjecao(false);
  }, [podeProjetar]);

  const serie = useMemo(
    () => ({
      modo: serieBase.modo,
      data: aplicarProjecaoMedia(
        serieBase.data,
        serieBase.modo,
        mostrarProjecao && podeProjetar,
      ),
    }),
    [serieBase, mostrarProjecao, podeProjetar],
  );

  const resumoCapacidade = useMemo(
    () =>
      serie.modo === "dia"
        ? calcularResumoCapacidade(
            serieBase.data,
            serie.data,
            mostrarProjecao && podeProjetar,
          )
        : null,
    [
      serie.modo,
      serie.data,
      serieBase.data,
      mostrarProjecao,
      podeProjetar,
    ],
  );

  const tituloGraficoMes =
    mesesSelecionados.length === 1
      ? mesLabel(mesesSelecionados[0]!)
      : "Geral";

  /** Clique na barra do mês → filtra Ano + Mês e entra na visão diária. */
  const aplicarDrillDownMes = (point: ChartPoint | undefined) => {
    if (serie.modo !== "mes" || !point) return;
    const ym = Number(point.chave);
    if (!Number.isFinite(ym) || ym < 200001) return;
    const novoAno = Math.floor(ym / 100);
    const novoMes = ym % 100;
    if (novoMes < 1 || novoMes > 12) return;
    setAno(novoAno);
    setMesesSelecionados([novoMes]);
  };

  const handleBarClick = (data: { payload?: ChartPoint } | ChartPoint) => {
    const point =
      data && typeof data === "object" && "payload" in data
        ? data.payload
        : (data as ChartPoint | undefined);
    aplicarDrillDownMes(point);
  };

  const filtrosLimpos = ano === null && mesesSelecionados.length === 0;

  const labelMesesTrigger = useMemo(() => {
    if (mesesSelecionados.length === 0) return "Todos";
    if (mesesSelecionados.length === 1) {
      return mesLabel(mesesSelecionados[0]!);
    }
    if (mesesSelecionados.length <= 3) {
      return mesesSelecionados
        .slice()
        .sort((a, b) => a - b)
        .map((m) => mesLabel(m).slice(0, 3))
        .join(", ");
    }
    return `${mesesSelecionados.length} meses`;
  }, [mesesSelecionados]);

  const periodoDescricao = useMemo(() => {
    const blend =
      "Analítico (≤ jun/2026) + TOA (≥ jul/2026)";
    if (filtrosLimpos) return `Histórico completo — ${blend}`;
    const mesTxt =
      mesesSelecionados.length === 0
        ? "todos os meses"
        : mesesSelecionados
            .slice()
            .sort((a, b) => a - b)
            .map((m) => mesLabel(m))
            .join(", ");
    if (ano === null) return `Anos disponíveis · ${mesTxt} — ${blend}`;
    return `${ano} · ${mesTxt} — ${blend}`;
  }, [filtrosLimpos, ano, mesesSelecionados]);

  const limparFiltros = () => {
    setAno(null);
    setMesesSelecionados([]);
    setTiposAtividadeFiltro([...tiposAtividadeOpcoes]);
  };

  const toggleMes = (mes: number) => {
    setMesesSelecionados((prev) =>
      prev.includes(mes)
        ? prev.filter((m) => m !== mes)
        : [...prev, mes].sort((a, b) => a - b),
    );
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex flex-row flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <CalendarRange className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Filtro de período
            </span>
            {filtrosLimpos && (
              <Badge variant="secondary" className="text-xs">
                Histórico geral
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label htmlFor="volume-ano" className="shrink-0 text-sm font-medium">
              Ano:
            </Label>
            <Select
              value={ano !== null ? String(ano) : "todos"}
              disabled={anosDisponiveis.length === 0}
              onValueChange={(v) => {
                if (v === "todos") {
                  setAno(null);
                  setMesesSelecionados([]);
                  return;
                }
                setAno(Number(v));
                setMesesSelecionados([]);
              }}
            >
              <SelectTrigger id="volume-ano" className="w-[140px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label className="shrink-0 text-sm font-medium">Mês:</Label>
            <Popover open={mesesOpen} onOpenChange={setMesesOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={mesesOpen}
                  disabled={mesesDisponiveis.length === 0}
                  className="w-[220px] justify-between font-normal"
                >
                  <span className="truncate">{labelMesesTrigger}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-2" align="start">
                <div className="mb-2 flex items-center justify-between gap-2 border-b border-border pb-2">
                  <span className="text-xs font-semibold text-muted-foreground">
                    Multi-seleção
                  </span>
                  <button
                    type="button"
                    className="text-xs font-medium text-primary hover:underline"
                    onClick={() => setMesesSelecionados([])}
                  >
                    Todos
                  </button>
                </div>
                <ul className="max-h-64 space-y-1 overflow-y-auto">
                  {mesesDisponiveis.map((mes) => {
                    const checked = mesesSelecionados.includes(mes);
                    return (
                      <li key={mes}>
                        <label className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={() => toggleMes(mes)}
                            aria-label={mesLabel(mes)}
                          />
                          <span className="flex-1">{mesLabel(mes)}</span>
                          {checked ? (
                            <Check className="h-3.5 w-3.5 text-primary" />
                          ) : null}
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </PopoverContent>
            </Popover>
          </div>

          <FiltroTipoAtividade
            id="volume-tipo-atividade"
            opcoesDisponiveis={tiposAtividadeOpcoes}
            valoresSelecionados={tiposAtividadeFiltro}
            onChange={setTiposAtividadeFiltro}
          />

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={limparFiltros}
          >
            <FilterX className="h-4 w-4" />
            Limpar Filtros
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{periodoDescricao}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando métricas...</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total de notas
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(totais.total)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Notas Produtivas
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-green-700">
                {formatQuantidade(totais.produtivas)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Notas Improdutivas
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-red-600">
                {formatQuantidade(totais.improdutivas)}
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                <h2 className="flex items-center gap-2 font-bold text-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Volume de Notas — {tituloGraficoMes}
                </h2>
                {resumoCapacidade ? (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm font-medium text-gray-600">
                    <span>
                      Seg - Sexta: {formatQuantidade(resumoCapacidade.mediaSemana)}{" "}
                      Técnicos
                    </span>
                    <span className="text-gray-300" aria-hidden>
                      |
                    </span>
                    <span>
                      Sáb: {formatQuantidade(resumoCapacidade.mediaSabado)}{" "}
                      Técnicos
                    </span>
                    <span className="text-gray-300" aria-hidden>
                      |
                    </span>
                    <span>
                      Média produtiva:{" "}
                      {formatQuantidade(resumoCapacidade.mediaNotasDia)} Notas
                      por dia
                    </span>
                    {mostrarProjecao &&
                    resumoCapacidade.projecaoTotalMes != null ? (
                      <>
                        <span className="text-gray-300" aria-hidden>
                          |
                        </span>
                        <span className="text-orange-700">
                          Projeção:{" "}
                          {formatQuantidade(resumoCapacidade.projecaoTotalMes)}{" "}
                          Notas para final do mês
                        </span>
                      </>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-4">
                {podeProjetar ? (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                    <Checkbox
                      checked={mostrarProjecao}
                      onCheckedChange={(v) => setMostrarProjecao(v === true)}
                      aria-label="Projeção (Bas. Média)"
                    />
                    <span className="font-medium">Projeção (Bas. Média)</span>
                  </label>
                ) : null}
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                  <Checkbox
                    checked={mostrarQuantDiaria}
                    onCheckedChange={(v) => setMostrarQuantDiaria(v === true)}
                    aria-label="Quantidade de Notas"
                  />
                  <span className="font-medium">Quantidade de Notas</span>
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-gray-600">
                  <Checkbox
                    checked={mostrarQuantTecnicos}
                    onCheckedChange={(v) =>
                      setMostrarQuantTecnicos(v === true)
                    }
                    aria-label="Quantidade de Técnicos"
                  />
                  <span className="font-medium">Quantidade de Técnicos</span>
                </label>

                <div
                  className="mx-1 hidden h-4 w-px bg-gray-300 sm:block"
                  aria-hidden
                />
                <div className="flex items-center gap-0.5">
                  <button
                    type="button"
                    title="Selecionar todos"
                    aria-label="Selecionar todos"
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      if (podeProjetar) setMostrarProjecao(true);
                      setMostrarQuantDiaria(true);
                      setMostrarQuantTecnicos(true);
                    }}
                  >
                    <CheckCheck className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    title="Limpar visualizações"
                    aria-label="Limpar visualizações"
                    className="rounded p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-700"
                    onClick={() => {
                      setMostrarProjecao(false);
                      setMostrarQuantDiaria(false);
                      setMostrarQuantTecnicos(false);
                    }}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </div>

            {serie.data.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma nota no período selecionado.
              </p>
            ) : (
              <div className={`h-[450px] w-full ${serie.modo === "mes" ? "cursor-pointer" : ""}`}>
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={serie.data}
                    margin={{
                      top: 8,
                      right: 16,
                      left: 0,
                      bottom:
                        mostrarQuantDiaria || mostrarQuantTecnicos ? 72 : 48,
                    }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      interval={serie.modo === "dia" ? 0 : "preserveEnd"}
                      tickMargin={12}
                      tick={(props: CustomXAxisTickProps) => {
                        const point = serie.data[props.index ?? 0];
                        const isProjecao =
                          serie.modo === "dia" &&
                          (Number(point?.produtivas_fantasma) || 0) > 0;
                        const valorNotas = isProjecao
                          ? Number(point?.produtivas_fantasma) || 0
                          : (point?.produtivas ?? 0);
                        const valorTecnicos = isProjecao
                          ? Number(point?.tecnicos_fantasma) || 0
                          : (point?.qtd_tecnicos ?? 0);
                        return (
                          <CustomXAxisTick
                            {...props}
                            modo={serie.modo}
                            diaSemana={point?.diaSemana}
                            mostrarQuantDiaria={mostrarQuantDiaria}
                            mostrarQuantTecnicos={mostrarQuantTecnicos}
                            valorNotas={valorNotas}
                            valorTecnicos={valorTecnicos}
                            isProjecao={isProjecao}
                          />
                        );
                      }}
                      angle={0}
                      textAnchor="middle"
                      height={
                        mostrarQuantDiaria || mostrarQuantTecnicos ? 100 : 80
                      }
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      width={40}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => {
                        const label =
                          name === "produtivas"
                            ? "Produtivas"
                            : name === "produtivas_fantasma" ||
                                name === "Projeção"
                              ? "Projeção"
                              : name === "qtd_tecnicos" ||
                                  name === "Técnicos Operando"
                                ? "Técnicos Operando"
                                : name === "tecnicos_fantasma" ||
                                    name === "Projeção Técnicos"
                                  ? "Projeção Técnicos"
                                  : name;
                        return [formatQuantidade(value), label];
                      }}
                      labelFormatter={(label) => {
                        if (serie.modo !== "dia") return String(label);
                        const point = serie.data.find((p) => p.label === label);
                        const semana = point?.diaSemana
                          ? ` (${point.diaSemana})`
                          : "";
                        return `Dia ${label}${semana}`;
                      }}
                    />
                    <Legend
                      formatter={(value) =>
                        value === "produtivas"
                          ? "Produtivas"
                          : value === "produtivas_fantasma"
                            ? "Projeção"
                            : value === "qtd_tecnicos"
                              ? "Técnicos Operando"
                              : value === "tecnicos_fantasma"
                                ? "Projeção Técnicos"
                                : value
                      }
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="produtivas"
                      name="produtivas"
                      fill="#16a34a"
                      radius={[3, 3, 0, 0]}
                      maxBarSize={36}
                      cursor={serie.modo === "mes" ? "pointer" : "default"}
                      onClick={handleBarClick}
                    />
                    {mostrarProjecao && serie.modo === "dia" ? (
                      <Bar
                        yAxisId="left"
                        dataKey="produtivas_fantasma"
                        name="Projeção"
                        fill="#d1d5db"
                        opacity={0.6}
                        radius={[3, 3, 0, 0]}
                        maxBarSize={36}
                      />
                    ) : null}
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="qtd_tecnicos"
                      name="Técnicos Operando"
                      stroke="#f59e0b"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    {mostrarProjecao && serie.modo === "dia" ? (
                      <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="tecnicos_fantasma"
                        name="Projeção Técnicos"
                        stroke="#9ca3af"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        connectNulls={false}
                        dot={{ r: 2 }}
                        activeDot={{ r: 4 }}
                      />
                    ) : null}
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
