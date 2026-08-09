import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  CalendarRange,
  Check,
  ChevronsUpDown,
  ClipboardCheck,
  FilterX,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
import { normalizeNumeroWo } from "@/lib/toa-store";

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

type VisaoGrafico = "Geral" | "Produtivas" | "Improdutivas";

type NotaVolumeAgg = {
  chave: string;
  dataIso: string;
  competencia: number;
  statusNota: "Produtiva" | "Improdutiva";
  fonte: "analitico" | "toa";
};

type ChartPoint = {
  chave: string;
  label: string;
  produtivas: number;
  improdutivas: number;
  total: number;
};

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

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, {
        chave: numeroWo,
        dataIso,
        competencia,
        statusNota,
        fonte: "toa",
      });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (dataIso < prev.dataIso) prev.dataIso = dataIso;
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
    const byDay = new Map<number, { produtivas: number; improdutivas: number }>();
    for (const n of notas) {
      const dia = Number(n.dataIso.slice(8, 10));
      if (!Number.isFinite(dia) || dia < 1 || dia > 31) continue;
      const bucket = byDay.get(dia) ?? { produtivas: 0, improdutivas: 0 };
      if (n.statusNota === "Produtiva") bucket.produtivas += 1;
      else bucket.improdutivas += 1;
      byDay.set(dia, bucket);
    }
    const dias = [...byDay.keys()].sort((a, b) => a - b);
    return {
      modo: "dia",
      data: dias.map((dia) => {
        const b = byDay.get(dia)!;
        return {
          chave: String(dia),
          label: String(dia).padStart(2, "0"),
          produtivas: b.produtivas,
          improdutivas: b.improdutivas,
          total: b.produtivas + b.improdutivas,
        };
      }),
    };
  }

  const byComp = new Map<
    number,
    { produtivas: number; improdutivas: number }
  >();
  for (const n of notas) {
    const bucket = byComp.get(n.competencia) ?? {
      produtivas: 0,
      improdutivas: 0,
    };
    if (n.statusNota === "Produtiva") bucket.produtivas += 1;
    else bucket.improdutivas += 1;
    byComp.set(n.competencia, bucket);
  }

  const comps = competenciasContinuas([...byComp.keys()]);
  return {
    modo: "mes",
    data: comps.map((ym) => {
      const b = byComp.get(ym) ?? { produtivas: 0, improdutivas: 0 };
      return {
        chave: String(ym),
        label: labelCompetencia(ym),
        produtivas: b.produtivas,
        improdutivas: b.improdutivas,
        total: b.produtivas + b.improdutivas,
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
  const [visaoGrafico, setVisaoGrafico] = useState<VisaoGrafico>("Produtivas");

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

  const notasFiltradas = useMemo(() => {
    const notas = [
      ...agregarNotasAnalitico(analiticoRows),
      ...agregarNotasToa(toaRows),
    ];
    return filtrarNotasPorPeriodo(notas, ano, mesesSelecionados);
  }, [analiticoRows, toaRows, ano, mesesSelecionados]);

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

  const serie = useMemo(
    () => montarSerieChart(notasFiltradas),
    [notasFiltradas],
  );

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
    setVisaoGrafico("Produtivas");
  };

  const toggleMes = (mes: number) => {
    setMesesSelecionados((prev) =>
      prev.includes(mes)
        ? prev.filter((m) => m !== mes)
        : [...prev, mes].sort((a, b) => a - b),
    );
  };

  const mostrarProdutivas =
    visaoGrafico === "Geral" || visaoGrafico === "Produtivas";
  const mostrarImprodutivas =
    visaoGrafico === "Geral" || visaoGrafico === "Improdutivas";

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
              <h2 className="flex items-center gap-2 font-bold text-foreground">
                <BarChart3 className="h-4 w-4 text-primary" />
                Volume de Notas —{" "}
                {serie.modo === "dia" ? "por dia" : "por mês"}
              </h2>
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Visualizar:
                <select
                  value={visaoGrafico}
                  onChange={(e) =>
                    setVisaoGrafico(e.target.value as VisaoGrafico)
                  }
                  className="rounded-md border border-gray-300 bg-background px-2 py-1 text-sm text-foreground outline-none"
                >
                  <option value="Geral">Geral</option>
                  <option value="Produtivas">Produtivas</option>
                  <option value="Improdutivas">Improdutivas</option>
                </select>
              </label>
            </div>

            {serie.data.length === 0 ? (
              <p className="py-12 text-center text-sm text-muted-foreground">
                Nenhuma nota no período selecionado.
              </p>
            ) : (
              <div className="h-[360px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={serie.data}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      interval={serie.modo === "dia" ? 1 : 0}
                      angle={
                        serie.modo === "mes" && serie.data.length > 6 ? -30 : 0
                      }
                      textAnchor={
                        serie.modo === "mes" && serie.data.length > 6
                          ? "end"
                          : "middle"
                      }
                      height={
                        serie.modo === "mes" && serie.data.length > 6 ? 70 : 30
                      }
                    />
                    <YAxis
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                      width={40}
                    />
                    <Tooltip
                      formatter={(value: number, name: string) => [
                        formatQuantidade(value),
                        name === "produtivas" ? "Produtivas" : "Improdutivas",
                      ]}
                      labelFormatter={(label) =>
                        serie.modo === "dia" ? `Dia ${label}` : String(label)
                      }
                    />
                    <Legend
                      formatter={(value) =>
                        value === "produtivas" ? "Produtivas" : "Improdutivas"
                      }
                    />
                    {mostrarProdutivas && (
                      <Bar
                        dataKey="produtivas"
                        name="produtivas"
                        fill="#16a34a"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={36}
                      />
                    )}
                    {mostrarImprodutivas && (
                      <Bar
                        dataKey="improdutivas"
                        name="improdutivas"
                        fill="#ef4444"
                        radius={[3, 3, 0, 0]}
                        maxBarSize={36}
                      />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
