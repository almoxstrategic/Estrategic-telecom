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

export type BairroVolumeAgg = {
  bairro: string;
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

function normalizarBairro(value: string | null | undefined): string {
  const t = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || BAIRRO_NAO_INFORMADO;
}

/**
 * Agrupa toa_importacoes por bairro contando WOs únicas.
 * Nota produtiva no bairro se ≥1 O.S. da WO for Produtiva.
 */
export function agregarVolumeNotasPorBairro(
  rows: ToaImportacaoRow[],
): BairroVolumeAgg[] {
  const byWo = new Map<
    string,
    { bairro: string; statusNota: "Produtiva" | "Improdutiva" }
  >();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;

    const bairro = normalizarBairro(row.bairro);
    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, { bairro, statusNota });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    // Prefere bairro informado sobre "Não Informado"
    if (
      prev.bairro === BAIRRO_NAO_INFORMADO &&
      bairro !== BAIRRO_NAO_INFORMADO
    ) {
      prev.bairro = bairro;
    }
  }

  const byBairro = new Map<
    string,
    { produtivas: number; improdutivas: number }
  >();

  for (const { bairro, statusNota } of byWo.values()) {
    const bucket = byBairro.get(bairro) ?? { produtivas: 0, improdutivas: 0 };
    if (statusNota === "Produtiva") bucket.produtivas += 1;
    else bucket.improdutivas += 1;
    byBairro.set(bairro, bucket);
  }

  return Array.from(byBairro.entries())
    .map(([bairro, counts]) => ({
      bairro,
      produtivas: counts.produtivas,
      improdutivas: counts.improdutivas,
      total: counts.produtivas + counts.improdutivas,
    }))
    .sort((a, b) => b.total - a.total || a.bairro.localeCompare(b.bairro, "pt-BR"));
}

export function KpiDetalhamentoNotas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [periodoSeeded, setPeriodoSeeded] = useState(false);

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

  const porBairro = useMemo(() => agregarVolumeNotasPorBairro(rows), [rows]);

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
    () =>
      [...porBairro]
        .filter((b) => b.produtivas > 0)
        .sort((a, b) => b.produtivas - a.produtivas)
        .slice(0, 10)
        .map((b) => ({ bairro: b.bairro, volume: b.produtivas }))
        .reverse(),
    [porBairro],
  );

  const chartImprodutivas = useMemo(
    () =>
      [...porBairro]
        .filter((b) => b.improdutivas > 0)
        .sort((a, b) => b.improdutivas - a.improdutivas)
        .slice(0, 10)
        .map((b) => ({ bairro: b.bairro, volume: b.improdutivas }))
        .reverse(),
    [porBairro],
  );

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
              <div className="mt-1 text-3xl font-bold text-green-700">
                {formatQuantidade(topProdutivo?.produtivas ?? 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas produtivas
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ThumbsDown className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Bairro + Improdutivo (Gargalo)
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {topImprodutivo && topImprodutivo.improdutivas > 0
                  ? topImprodutivo.bairro
                  : "—"}
              </div>
              <div className="mt-1 text-3xl font-bold text-red-600">
                {formatQuantidade(topImprodutivo?.improdutivas ?? 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas improdutivas
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
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          formatQuantidade(value),
                          "Produtivas",
                        ]}
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
                Top 10 Bairros Improdutivos
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
                      />
                      <Tooltip
                        formatter={(value: number) => [
                          formatQuantidade(value),
                          "Improdutivas",
                        ]}
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
              <div className="overflow-x-auto">
                <table className="w-full min-w-[28rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="px-2 py-2 font-semibold">Bairro</th>
                      <th className="px-2 py-2 text-right font-semibold">
                        Produtivas
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
                        Improdutivas
                      </th>
                      <th className="px-2 py-2 text-right font-semibold">
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
