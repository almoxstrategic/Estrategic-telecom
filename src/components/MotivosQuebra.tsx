import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, FilterX, XCircle } from "lucide-react";
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
import {
  isCodBaixaProdutivo,
  isStatusExecutada,
} from "@/lib/toa-store";

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

export type MotivoQuebraAgg = {
  codigo: string;
  quantidade: number;
};

type ChartMotivoPoint = {
  codigo: string;
  quantidade: number;
};

type MotivoChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    payload?: ChartMotivoPoint;
  }>;
};

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

/** O.S. improdutiva: não é (Executada + Cód Baixa produtivo). */
function isLinhaOsImprodutiva(row: ToaImportacaoRow): boolean {
  const cod =
    row.cod_baixa != null && Number.isFinite(Number(row.cod_baixa))
      ? Number(row.cod_baixa)
      : 0;
  if (cod <= 0) return false;
  if (isStatusExecutada(row.status_os || "") && isCodBaixaProdutivo(cod)) {
    return false;
  }
  return true;
}

/**
 * Volumetria de códigos de baixa em O.S. improdutivas (notas falhas).
 * Agrupa por cod_baixa contando ocorrências de O.S.
 */
export function agregarMotivosQuebra(
  rows: ToaImportacaoRow[],
): MotivoQuebraAgg[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    if (row.status_nota !== "Improdutiva") continue;
    if (!isLinhaOsImprodutiva(row)) continue;

    const codigo = String(Number(row.cod_baixa));
    counts.set(codigo, (counts.get(codigo) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([codigo, quantidade]) => ({ codigo, quantidade }))
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        Number(a.codigo) - Number(b.codigo) ||
        a.codigo.localeCompare(b.codigo, "pt-BR"),
    );
}

function MotivoChartTooltip({
  active,
  payload,
  label,
}: MotivoChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const data = entry.payload;
  const valor = Number(entry.value) || 0;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">
        Cód. Baixa {String(label ?? data?.codigo ?? "—")}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Quantidade:{" "}
        <span className="font-semibold tabular-nums text-red-600">
          {formatQuantidade(valor)}
        </span>
      </p>
    </div>
  );
}

export function MotivosQuebra() {
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
        console.error("Erro ao carregar motivos de quebra:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os motivos de quebra TOA.",
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

  const porMotivo = useMemo(() => agregarMotivosQuebra(rows), [rows]);

  const totalQuebras = useMemo(
    () => porMotivo.reduce((acc, row) => acc + row.quantidade, 0),
    [porMotivo],
  );

  const principalOfensor = useMemo(() => {
    if (porMotivo.length === 0) return null;
    return porMotivo[0]!;
  }, [porMotivo]);

  const chartTop10 = useMemo(
    (): ChartMotivoPoint[] =>
      [...porMotivo]
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10)
        .map((m) => ({
          codigo: m.codigo,
          quantidade: m.quantidade,
        })),
    [porMotivo],
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
            <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
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
              htmlFor="motivos-quebra-ano"
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
              <SelectTrigger id="motivos-quebra-ano" className="w-[140px]">
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
              htmlFor="motivos-quebra-mes"
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
              <SelectTrigger id="motivos-quebra-mes" className="w-[160px]">
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
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total de Quebras
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-red-600">
                {formatQuantidade(totalQuebras)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                O.S. improdutivas no período
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Principal Ofensor
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {principalOfensor && principalOfensor.quantidade > 0
                  ? `Cód. ${principalOfensor.codigo}`
                  : "—"}
              </div>
              <div className="mt-1 text-3xl font-bold text-red-600">
                {formatQuantidade(principalOfensor?.quantidade ?? 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                ocorrências do código de baixa
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <AlertTriangle className="h-4 w-4 text-red-600" />
              Top 10 Motivos de Quebra
            </h2>
            {chartTop10.length === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                Nenhuma O.S. improdutiva no período.
              </p>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartTop10}
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
                      dataKey="codigo"
                      width={72}
                      tick={{ fontSize: 11 }}
                      reversed={false}
                    />
                    <Tooltip
                      content={<MotivoChartTooltip />}
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar
                      dataKey="quantidade"
                      fill="#ef4444"
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
              <XCircle className="h-4 w-4 text-primary" />
              Todos os códigos de baixa
            </h2>
            {porMotivo.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum código de baixa improdutivo no período selecionado.
              </p>
            ) : (
              <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[20rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="sticky top-0 z-10 bg-white px-2 py-2 font-semibold shadow-sm">
                        Cód. Baixa
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-2 py-2 text-right font-semibold shadow-sm">
                        Quantidade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {porMotivo.map((row) => (
                      <tr
                        key={row.codigo}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium text-gray-900">
                          {row.codigo}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-red-600">
                          {formatQuantidade(row.quantidade)}
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
