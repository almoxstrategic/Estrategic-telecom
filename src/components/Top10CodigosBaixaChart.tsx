import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  agregarMotivosQuebra,
  type StatusContratoFiltro,
} from "@/components/MotivosQuebra";
import type { ToaImportacaoRow } from "@/lib/faturamento-service";
import type { DicionarioCodigosBaixaMap } from "@/lib/dicionario-codigos-baixa";

type ChartMotivoPoint = {
  codigo: string;
  descricao: string;
  motivoQuebra: string;
  labelCompleta: string;
  quantidade: number;
};

type MotivoChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  corQuantidade?: string;
  payload?: Array<{
    value?: number | string;
    payload?: ChartMotivoPoint;
  }>;
};

export type Top10CodigosBaixaChartProps = {
  rows: ToaImportacaoRow[];
  dicionario: DicionarioCodigosBaixaMap;
  statusNota?: StatusContratoFiltro;
  titulo?: string;
  emptyMessage?: string;
  onCodigoClick?: (codigo: string) => void;
  className?: string;
  chartHeightClassName?: string;
};

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function MotivoChartTooltip({
  active,
  payload,
  label,
  corQuantidade = "text-red-600",
}: MotivoChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const data = entry.payload;
  const valor = Number(entry.value) || 0;
  const codigo = String(label ?? data?.codigo ?? "—");
  const descricao = data?.descricao || "Motivo Desconhecido";
  const tipo = data?.motivoQuebra || "Não classificado";

  return (
    <div className="max-w-sm rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">
        Cód. Baixa {codigo} - {descricao} - TIPO: {tipo}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Quantidade:{" "}
        <span className={`font-semibold tabular-nums ${corQuantidade}`}>
          {formatQuantidade(valor)}
        </span>
      </p>
    </div>
  );
}

/**
 * Top 10 códigos de baixa (BarChart horizontal).
 * Reutilizado em Códigos de Baixa e no modal da Análise de Comportamento.
 */
export function Top10CodigosBaixaChart({
  rows,
  dicionario,
  statusNota = "IMPRODUTIVO",
  titulo = "Top 10 Motivos de Quebra",
  emptyMessage = "Nenhuma O.S. improdutiva no período.",
  onCodigoClick,
  className = "",
  chartHeightClassName = "h-80",
}: Top10CodigosBaixaChartProps) {
  const isImprodutivo = statusNota === "IMPRODUTIVO";
  const corTexto = isImprodutivo ? "text-red-600" : "text-green-600";
  const corBarra = isImprodutivo ? "#ef4444" : "#16a34a";

  const chartTop10 = useMemo((): ChartMotivoPoint[] => {
    return agregarMotivosQuebra(rows, dicionario, statusNota)
      .slice(0, 10)
      .map((m) => ({
        codigo: m.codigo,
        descricao: m.descricao,
        motivoQuebra: m.motivoQuebra,
        labelCompleta: m.labelCompleta,
        quantidade: m.quantidade,
      }));
  }, [rows, dicionario, statusNota]);

  return (
    <div className={className}>
      {titulo ? (
        <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
          <AlertTriangle className={`h-4 w-4 ${corTexto}`} />
          {titulo}
        </h2>
      ) : null}
      {chartTop10.length === 0 ? (
        <p
          className={`flex items-center justify-center text-sm text-muted-foreground ${chartHeightClassName}`}
        >
          {emptyMessage}
        </p>
      ) : (
        <div className={`w-full ${chartHeightClassName}`}>
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
                content={<MotivoChartTooltip corQuantidade={corTexto} />}
                cursor={{ fill: "#f3f4f6" }}
              />
              <Bar
                dataKey="quantidade"
                fill={corBarra}
                radius={[0, 3, 3, 0]}
                maxBarSize={22}
                className={onCodigoClick ? "cursor-pointer" : undefined}
                onClick={
                  onCodigoClick
                    ? (data) => {
                        const payload = (data?.payload ?? data) as
                          | ChartMotivoPoint
                          | undefined;
                        const codigo = payload?.codigo;
                        if (codigo) onCodigoClick(codigo);
                      }
                    : undefined
                }
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
