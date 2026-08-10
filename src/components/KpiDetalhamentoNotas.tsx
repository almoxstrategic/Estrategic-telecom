import { useEffect, useMemo, useState } from "react";
import {
  FilterX,
  MapPin,
  ThumbsDown,
  ThumbsUp,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchCompetenciasToa,
  fetchToaImportacoes,
  filtrarToaOsContabilizaveis,
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

const BAIRRO_NAO_INFORMADO = "Não Informado";

export type TecnicoRankingItem = {
  nome: string;
  valor: number;
};

export type BairroVolumeAgg = {
  bairro: string;
  produtivas: number;
  improdutivas: number;
  total: number;
  top5TecnicosProdutivos: TecnicoRankingItem[];
  top5TecnicosImprodutivos: TecnicoRankingItem[];
};

type ChartBairroPoint = {
  bairro: string;
  volume: number;
  tipo: "produtivas" | "quebras";
  top5TecnicosProdutivos: TecnicoRankingItem[];
  top5TecnicosImprodutivos: TecnicoRankingItem[];
};

type ParetoView = "Produtivas" | "Improdutivas";

type ParetoPoint = {
  bairro: string;
  volume: number;
  acumulado: number;
  pctAcumulada: number;
};

type BairroChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    dataKey?: string | number;
    payload?: ChartBairroPoint;
  }>;
  totalProdutivasGeral?: number;
  totalImprodutivasGeral?: number;
};

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function formatPct(valor: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((valor / total) * 100).toFixed(1)}%`;
}

function formatCardShare(valor: number, total: number): string {
  return `${formatQuantidade(valor)} de ${formatQuantidade(total)} = ${formatPct(valor, total)}`;
}

function normalizarBairro(value: string | null | undefined): string {
  const t = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || BAIRRO_NAO_INFORMADO;
}

function nomeTecnicoDaLinha(row: ToaImportacaoRow): string {
  const nome = String(row.nome_tecnico ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nome) return nome;
  const login = String(row.login_tecnico ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return login || "Sem nome";
}

function top5FromRecord(rec: Record<string, number>): TecnicoRankingItem[] {
  return Object.entries(rec)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort(
      (a, b) =>
        b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .slice(0, 5);
}

function BairroChartTooltip({
  active,
  payload,
  label,
  totalProdutivasGeral = 0,
  totalImprodutivasGeral = 0,
}: BairroChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const data = entry.payload;
  if (!data) return null;

  const valor = Number(entry.value) || 0;
  const isProdutivas = data.tipo === "produtivas";
  const totalLabel = isProdutivas ? "Produtivas" : "Quebras";
  const totalGeral = isProdutivas
    ? totalProdutivasGeral
    : totalImprodutivasGeral;
  const pct = formatPct(valor, totalGeral);
  const top5 = isProdutivas
    ? data.top5TecnicosProdutivos
    : data.top5TecnicosImprodutivos;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">{String(label ?? data.bairro)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {totalLabel}:{" "}
        <span
          className={`font-semibold tabular-nums ${
            isProdutivas ? "text-green-700" : "text-red-600"
          }`}
        >
          {formatQuantidade(valor)} ({pct})
        </span>
      </p>
      {top5.length > 0 ? (
        <>
          <p className="mt-2 text-xs font-semibold text-gray-700">
            Top 5 Técnicos
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
            {top5.map((t) => (
              <li key={t.nome} className="flex justify-between gap-3">
                <span className="truncate">{t.nome}</span>
                <span className="shrink-0 tabular-nums font-medium">
                  {formatQuantidade(t.valor)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Sem técnicos neste bairro.
        </p>
      )}
    </div>
  );
}

type ParetoTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    dataKey?: string | number;
    name?: string;
  }>;
  paretoView: ParetoView;
};

function ParetoTooltip({
  active,
  payload,
  label,
  paretoView,
}: ParetoTooltipProps) {
  if (!active || !payload?.length) return null;
  const volumeEntry = payload.find((p) => p.dataKey === "volume");
  const pctEntry = payload.find((p) => p.dataKey === "pctAcumulada");
  const volume = Number(volumeEntry?.value) || 0;
  const pctAcum = Number(pctEntry?.value) || 0;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">{String(label ?? "")}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {paretoView}:{" "}
        <span
          className={`font-semibold tabular-nums ${
            paretoView === "Produtivas" ? "text-green-700" : "text-red-600"
          }`}
        >
          {formatQuantidade(volume)}
        </span>
      </p>
      <p className="mt-0.5 text-sm text-amber-700">
        Acumulado:{" "}
        <span className="font-semibold tabular-nums">
          {pctAcum.toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

/**
 * Agrupa toa_importacoes por bairro contando WOs únicas.
 * Nota produtiva no bairro se ≥1 O.S. da WO for Produtiva.
 * Inclui Top 5 técnicos produtivos/improdutivos por bairro.
 */
export function agregarVolumeNotasPorBairro(
  rows: ToaImportacaoRow[],
): BairroVolumeAgg[] {
  const byWo = new Map<
    string,
    {
      bairro: string;
      statusNota: "Produtiva" | "Improdutiva";
      nomeTecnico: string;
    }
  >();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;

    const bairro = normalizarBairro(row.bairro);
    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";
    const nomeTecnico = nomeTecnicoDaLinha(row);

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, { bairro, statusNota, nomeTecnico });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (
      prev.bairro === BAIRRO_NAO_INFORMADO &&
      bairro !== BAIRRO_NAO_INFORMADO
    ) {
      prev.bairro = bairro;
    }
    if (
      (prev.nomeTecnico === "Sem nome" || !prev.nomeTecnico) &&
      nomeTecnico !== "Sem nome"
    ) {
      prev.nomeTecnico = nomeTecnico;
    }
  }

  const byBairro = new Map<
    string,
    {
      produtivas: number;
      improdutivas: number;
      tecnicosProdutivos: Record<string, number>;
      tecnicosImprodutivos: Record<string, number>;
    }
  >();

  for (const { bairro, statusNota, nomeTecnico } of byWo.values()) {
    const bucket = byBairro.get(bairro) ?? {
      produtivas: 0,
      improdutivas: 0,
      tecnicosProdutivos: {},
      tecnicosImprodutivos: {},
    };
    if (statusNota === "Produtiva") {
      bucket.produtivas += 1;
      bucket.tecnicosProdutivos[nomeTecnico] =
        (bucket.tecnicosProdutivos[nomeTecnico] ?? 0) + 1;
    } else {
      bucket.improdutivas += 1;
      bucket.tecnicosImprodutivos[nomeTecnico] =
        (bucket.tecnicosImprodutivos[nomeTecnico] ?? 0) + 1;
    }
    byBairro.set(bairro, bucket);
  }

  return Array.from(byBairro.entries())
    .map(([bairro, counts]) => ({
      bairro,
      produtivas: counts.produtivas,
      improdutivas: counts.improdutivas,
      total: counts.produtivas + counts.improdutivas,
      top5TecnicosProdutivos: top5FromRecord(counts.tecnicosProdutivos),
      top5TecnicosImprodutivos: top5FromRecord(counts.tecnicosImprodutivos),
    }))
    .sort(
      (a, b) => b.total - a.total || a.bairro.localeCompare(b.bairro, "pt-BR"),
    );
}

export function KpiDetalhamentoNotas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [paretoView, setParetoView] = useState<ParetoView>("Produtivas");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const comps = await fetchCompetenciasToa();
        if (cancelled) return;
        setCompetencias(comps);
      } catch {
        if (!cancelled) setCompetencias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (periodoSeeded || competencias.length === 0) return;
    const ultima = competencias[competencias.length - 1]!;
    setAno(Math.floor(ultima / 100));
    setMes(ultima % 100);
    setPeriodoSeeded(true);
  }, [competencias, periodoSeeded]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const flat = await fetchToaImportacoes({
          ano,
          mes,
          dia: null,
        });
        if (cancelled) return;
        setRows(filtrarToaOsContabilizaveis(flat));
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar detalhamento de notas:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o detalhamento de notas TOA.",
        );
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ano, mes]);

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

  const rankingBairros = useMemo(() => agregarVolumeNotasPorBairro(rows), [rows]);

  const { totalProdutivasGeral, totalImprodutivasGeral } = useMemo(() => {
    let produtivas = 0;
    let improdutivas = 0;
    for (const b of rankingBairros) {
      produtivas += b.produtivas;
      improdutivas += b.improdutivas;
    }
    return {
      totalProdutivasGeral: produtivas,
      totalImprodutivasGeral: improdutivas,
    };
  }, [rankingBairros]);

  const porBairro = rankingBairros;

  const topProdutivo = useMemo(() => {
    if (porBairro.length === 0) return null;
    return [...porBairro].sort(
      (a, b) =>
        b.produtivas - a.produtivas ||
        b.total - a.total ||
        a.bairro.localeCompare(b.bairro, "pt-BR"),
    )[0]!;
  }, [porBairro]);

  const topImprodutivo = useMemo(() => {
    if (porBairro.length === 0) return null;
    return [...porBairro].sort(
      (a, b) =>
        b.improdutivas - a.improdutivas ||
        b.total - a.total ||
        a.bairro.localeCompare(b.bairro, "pt-BR"),
    )[0]!;
  }, [porBairro]);

  const chartProdutivas = useMemo(
    (): ChartBairroPoint[] =>
      [...porBairro]
        .filter((b) => b.produtivas > 0)
        .sort((a, b) => b.produtivas - a.produtivas)
        .slice(0, 10)
        .map((b) => ({
          bairro: b.bairro,
          volume: b.produtivas,
          tipo: "produtivas" as const,
          top5TecnicosProdutivos: b.top5TecnicosProdutivos,
          top5TecnicosImprodutivos: b.top5TecnicosImprodutivos,
        })),
    [porBairro],
  );

  const chartImprodutivas = useMemo(
    (): ChartBairroPoint[] =>
      [...porBairro]
        .filter((b) => b.improdutivas > 0)
        .sort((a, b) => b.improdutivas - a.improdutivas)
        .slice(0, 10)
        .map((b) => ({
          bairro: b.bairro,
          volume: b.improdutivas,
          tipo: "quebras" as const,
          top5TecnicosProdutivos: b.top5TecnicosProdutivos,
          top5TecnicosImprodutivos: b.top5TecnicosImprodutivos,
        })),
    [porBairro],
  );

  const paretoData = useMemo((): ParetoPoint[] => {
    const totalBase =
      paretoView === "Produtivas"
        ? totalProdutivasGeral
        : totalImprodutivasGeral;
    const ordenado = [...rankingBairros]
      .map((b) => ({
        bairro: b.bairro,
        volume:
          paretoView === "Produtivas" ? b.produtivas : b.improdutivas,
      }))
      .filter((b) => b.volume > 0)
      .sort(
        (a, b) =>
          b.volume - a.volume || a.bairro.localeCompare(b.bairro, "pt-BR"),
      );

    let acumulado = 0;
    return ordenado.map((item) => {
      acumulado += item.volume;
      return {
        bairro: item.bairro,
        volume: item.volume,
        acumulado,
        pctAcumulada:
          totalBase > 0
            ? Math.round((acumulado / totalBase) * 1000) / 10
            : 0,
      };
    });
  }, [
    rankingBairros,
    paretoView,
    totalProdutivasGeral,
    totalImprodutivasGeral,
  ]);

  const filtrosLimpos = ano === null && mes === null;

  const periodoDescricao = useMemo(() => {
    if (filtrosLimpos) return "Histórico completo TOA";
    if (ano !== null && mes !== null) {
      return `${mesLabel(mes)} de ${ano}`;
    }
    if (ano !== null) return `Ano ${ano} · todos os meses`;
    return "Período filtrado";
  }, [filtrosLimpos, ano, mes]);

  const limparFiltros = () => {
    setAno(null);
    setMes(null);
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex flex-row flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
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
            <Label
              htmlFor="detalhe-notas-ano"
              className="shrink-0 text-sm font-medium"
            >
              Ano:
            </Label>
            <Select
              value={ano !== null ? String(ano) : "todos"}
              disabled={anosDisponiveis.length === 0}
              onValueChange={(v) => {
                if (v === "todos") {
                  setAno(null);
                  setMes(null);
                  return;
                }
                const novoAno = Number(v);
                const mesesDoAno = competencias
                  .filter((ym) => Math.floor(ym / 100) === novoAno)
                  .map((ym) => ym % 100)
                  .sort((a, b) => a - b);
                setAno(novoAno);
                setMes(mesesDoAno[mesesDoAno.length - 1] ?? null);
              }}
            >
              <SelectTrigger id="detalhe-notas-ano" className="w-[140px]">
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
            <Label
              htmlFor="detalhe-notas-mes"
              className="shrink-0 text-sm font-medium"
            >
              Mês:
            </Label>
            <Select
              value={mes !== null ? String(mes) : "todos"}
              disabled={ano === null || mesesDisponiveis.length === 0}
              onValueChange={(v) => {
                if (v === "todos") {
                  setMes(null);
                  return;
                }
                setMes(Number(v));
              }}
            >
              <SelectTrigger id="detalhe-notas-mes" className="w-[160px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {mesesDisponiveis.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {mesLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Bairro + Produtivo
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {topProdutivo && topProdutivo.produtivas > 0
                  ? topProdutivo.bairro
                  : "—"}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-green-700 sm:text-3xl">
                {topProdutivo && topProdutivo.produtivas > 0
                  ? formatCardShare(
                      topProdutivo.produtivas,
                      totalProdutivasGeral,
                    )
                  : formatCardShare(0, totalProdutivasGeral)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas produtivas · peso no total do período
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ThumbsDown className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Bairro + Improdutivo
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {topImprodutivo && topImprodutivo.improdutivas > 0
                  ? topImprodutivo.bairro
                  : "—"}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-red-600 sm:text-3xl">
                {topImprodutivo && topImprodutivo.improdutivas > 0
                  ? formatCardShare(
                      topImprodutivo.improdutivas,
                      totalImprodutivasGeral,
                    )
                  : formatCardShare(0, totalImprodutivasGeral)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas improdutivas · peso no total do período
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <ThumbsUp className="h-4 w-4 text-green-600" />
                Top 10 Bairros Produtivos
              </h2>
              {chartProdutivas.length === 0 ? (
                <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota produtiva no período.
                </p>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartProdutivas}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="bairro"
                        width={110}
                        tick={{ fontSize: 11 }}
                        reversed={false}
                      />
                      <Tooltip
                        content={
                          <BairroChartTooltip
                            totalProdutivasGeral={totalProdutivasGeral}
                            totalImprodutivasGeral={totalImprodutivasGeral}
                          />
                        }
                        cursor={{ fill: "#f3f4f6" }}
                      />
                      <Bar
                        dataKey="volume"
                        fill="#16a34a"
                        radius={[0, 3, 3, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                Top 10 Bairros Quebras
              </h2>
              {chartImprodutivas.length === 0 ? (
                <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota improdutiva no período.
                </p>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartImprodutivas}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="bairro"
                        width={110}
                        tick={{ fontSize: 11 }}
                        reversed={false}
                      />
                      <Tooltip
                        content={
                          <BairroChartTooltip
                            totalProdutivasGeral={totalProdutivasGeral}
                            totalImprodutivasGeral={totalImprodutivasGeral}
                          />
                        }
                        cursor={{ fill: "#f3f4f6" }}
                      />
                      <Bar
                        dataKey="volume"
                        fill="#ef4444"
                        radius={[0, 3, 3, 0]}
                        maxBarSize={22}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-foreground">
                <MapPin className="h-4 w-4 text-amber-600" />
                Análise de Pareto — Bairros
              </h2>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="pareto-view"
                  className="shrink-0 text-sm font-medium text-muted-foreground"
                >
                  Visão:
                </Label>
                <Select
                  value={paretoView}
                  onValueChange={(v) =>
                    setParetoView(v as ParetoView)
                  }
                >
                  <SelectTrigger id="pareto-view" className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Produtivas">Produtivas</SelectItem>
                    <SelectItem value="Improdutivas">Improdutivas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {paretoData.length === 0 ? (
              <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Sem dados para montar o Pareto neste período.
              </p>
            ) : (
              <div className="h-[28rem] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={paretoData}
                    margin={{ top: 8, right: 24, left: 8, bottom: 64 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bairro"
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 10 }}
                    />
                    <YAxis
                      yAxisId="left"
                      allowDecimals={false}
                      tick={{ fontSize: 11 }}
                    />
                    <YAxis
                      yAxisId="right"
                      orientation="right"
                      domain={[0, 100]}
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={<ParetoTooltip paretoView={paretoView} />}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="volume"
                      name={paretoView}
                      fill={
                        paretoView === "Produtivas" ? "#16a34a" : "#ef4444"
                      }
                      radius={[3, 3, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="pctAcumulada"
                      name="% acumulada"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#f59e0b" }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Barras = volume absoluto · Linha âmbar = % acumulada (0–100%).
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <MapPin className="h-4 w-4 text-primary" />
              Todos os bairros
            </h2>
            {porBairro.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum bairro no período selecionado.
              </p>
            ) : (
              <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="bg-white px-2 py-2 font-semibold">Bairro</th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Produtivas
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Improdutivas
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {porBairro.map((row) => (
                      <tr
                        key={row.bairro}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium text-gray-900">
                          {row.bairro}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-green-700">
                          {formatQuantidade(row.produtivas)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-red-600">
                          {formatQuantidade(row.improdutivas)}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {formatQuantidade(row.total)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
