import { useMemo, useState } from "react";
import { BarChart3, ClipboardCheck, Users, XCircle } from "lucide-react";
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
import type { KpiTopTecnico } from "@/lib/logistica-types";
import {
  gerarDesempenhoMock,
  somarToaMock,
} from "@/lib/kpi-desempenho-mock";
import { formatQuantidade } from "@/lib/parse-locale-number";
import { isTecnicoDemitido } from "@/lib/team-service";

type KpiDesempenhoTecnicosProps = {
  tecnicos: KpiTopTecnico[];
  demitidosKeys: Set<string>;
  ano: number | null;
  mes: number | null;
  dia: number | null;
};

type FiltroTop = "Geral" | "Top 10" | "Top 5" | "Top 3";

function formatReceita(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function limiteDoFiltro(filtro: FiltroTop): number | null {
  switch (filtro) {
    case "Top 10":
      return 10;
    case "Top 5":
      return 5;
    case "Top 3":
      return 3;
    default:
      return null;
  }
}

export function KpiDesempenhoTecnicos({
  tecnicos,
  demitidosKeys,
  ano,
  mes,
  dia,
}: KpiDesempenhoTecnicosProps) {
  const [filtroTop, setFiltroTop] = useState<FiltroTop>("Geral");
  const [buscaTecnico, setBuscaTecnico] = useState("");

  const enriquecidos = useMemo(
    () => gerarDesempenhoMock(tecnicos, { ano, mes, dia }),
    [tecnicos, ano, mes, dia],
  );

  const tecnicosFiltrados = useMemo(() => {
    const termo = buscaTecnico.trim().toLowerCase();
    if (!termo) return enriquecidos;
    return enriquecidos.filter((tecnico) => {
      const nome = (tecnico.nome || "").toLowerCase();
      const matricula = (tecnico.id_tecnico || "").toLowerCase();
      return nome.includes(termo) || matricula.includes(termo);
    });
  }, [enriquecidos, buscaTecnico]);

  const { totalNotasProdutivas, totalPerdaNotas } = useMemo(
    () => somarToaMock(enriquecidos),
    [enriquecidos],
  );

  const chartData = useMemo(() => {
    const ordenados = [...enriquecidos].sort((a, b) => b.notasFeitas - a.notasFeitas);
    const limite = limiteDoFiltro(filtroTop);
    const fatia = limite === null ? ordenados : ordenados.slice(0, limite);
    const totalFatia = fatia.reduce((acc, t) => acc + t.notasFeitas, 0);

    let acumulado = 0;
    return fatia.map((t) => {
      acumulado += t.notasFeitas;
      const pareto =
        totalFatia > 0
          ? Math.round((acumulado / totalFatia) * 1000) / 10
          : 0;

      return {
        nome: t.primeiroNome,
        nomeCompleto: t.nome,
        notasFeitas: t.notasFeitas,
        perdasNotas: t.perdasNotas,
        receitaGanha: t.receita,
        receitaPerda: t.receitaPerda,
        pareto,
      };
    });
  }, [enriquecidos, filtroTop]);

  return (
    <div className="w-full space-y-6">
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
            <span className="text-sm font-medium text-muted-foreground">
              Total de notas produtivas (TOA)
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">
            {formatQuantidade(totalNotasProdutivas)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <XCircle className="h-5 w-5 shrink-0 text-red-600" />
            <span className="text-sm font-medium text-muted-foreground">
              Total de perda de notas (TOA)
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">
            {formatQuantidade(totalPerdaNotas)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between items-center gap-3">
          <h2 className="flex items-center gap-2 font-bold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Visão Geral de Desempenho
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Visualizar:
            <select
              value={filtroTop}
              onChange={(e) => setFiltroTop(e.target.value as FiltroTop)}
              className="border border-gray-300 text-sm rounded-md px-2 py-1 outline-none text-foreground bg-background"
            >
              <option value="Geral">Geral</option>
              <option value="Top 10">Top 10</option>
              <option value="Top 5">Top 5</option>
              <option value="Top 3">Top 3</option>
            </select>
          </label>
        </div>

        <div className="mt-4 h-80 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 text-sm text-muted-foreground">
              Nenhum técnico com baixa no período selecionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 11 }}
                  interval={0}
                  angle={chartData.length > 8 ? -35 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 56 : 30}
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
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as {
                      nomeCompleto: string;
                      notasFeitas: number;
                      perdasNotas: number;
                      receitaGanha: number;
                      receitaPerda: number;
                      pareto: number;
                    };
                    return (
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                        <p className="font-semibold">{item.nomeCompleto}</p>
                        <p className="text-green-600">
                          Notas Feitas: {formatQuantidade(item.notasFeitas)} -{" "}
                          {formatReceita(item.receitaGanha)}
                        </p>
                        <p className="text-red-600">
                          Notas Perdidas: {formatQuantidade(item.perdasNotas)} -{" "}
                          {formatReceita(item.receitaPerda)}
                        </p>
                        <p className="text-amber-500">
                          Pareto:{" "}
                          {item.pareto.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    return (
                      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
                        {payload.map((entry) => (
                          <li
                            key={String(entry.value)}
                            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-sm"
                              style={{ backgroundColor: entry.color }}
                              aria-hidden
                            />
                            <span>{entry.value}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="notasFeitas"
                  name="Notas Feitas"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  yAxisId="left"
                  dataKey="perdasNotas"
                  name="Notas Perdidas"
                  fill="#dc2626"
                  radius={[4, 4, 0, 0]}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pareto"
                  name="Pareto"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
          <Users className="h-4 w-4 text-primary" />
          Detalhamento por Técnico
        </h2>

        <input
          type="search"
          value={buscaTecnico}
          onChange={(e) => setBuscaTecnico(e.target.value)}
          placeholder="Buscar por nome ou matrícula (Z)..."
          aria-label="Buscar técnico por nome ou matrícula"
          className="mb-4 w-full rounded-md border border-gray-300 bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 md:w-72"
        />

        {enriquecidos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum técnico com baixa no período selecionado.
          </p>
        ) : tecnicosFiltrados.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum técnico encontrado para “{buscaTecnico.trim()}”.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[1200px] grid-cols-10 gap-3 border-b border-border px-4 py-2 text-sm font-semibold text-muted-foreground">
              <span className="text-left">Nome</span>
              <span className="text-center">Total de Notas</span>
              <span className="text-center">Notas feitas</span>
              <span className="text-center">Perdas de Notas</span>
              <span className="text-center">% Freq. Relativa</span>
              <span className="text-center">% Freq. Absoluta</span>
              <span className="text-center">Aproveitamento</span>
              <span className="text-center">Receita Perda</span>
              <span className="text-center">Receita Bruta</span>
              <span className="text-center">Receita Líquida</span>
            </div>

            <ul className="min-w-[1200px]">
              {tecnicosFiltrados.map((tecnico) => {
                const isDemitido = isTecnicoDemitido(
                  demitidosKeys,
                  tecnico.id_tecnico,
                  tecnico.nome,
                );
                const receitaLiquida = tecnico.receita - tecnico.receitaPerda;
                return (
                <li
                  key={tecnico.id_tecnico}
                  className="grid grid-cols-10 items-center gap-3 border-b border-border px-4 py-3 text-sm last:border-b-0"
                >
                  <span
                    className={
                      isDemitido
                        ? "truncate text-left font-medium text-gray-500"
                        : "truncate text-left font-medium text-primary"
                    }
                    title={tecnico.nome}
                  >
                    {tecnico.nome}
                  </span>
                  <span className="text-center font-bold tabular-nums text-gray-900">
                    {formatQuantidade(tecnico.notasFeitas + tecnico.perdasNotas)}
                  </span>
                  <span className="text-center font-normal tabular-nums text-gray-500">
                    {tecnico.notasFeitas}
                  </span>
                  <span className="text-center font-normal tabular-nums text-gray-500">
                    {tecnico.perdasNotas}
                  </span>
                  <span className="text-center font-normal tabular-nums text-gray-600">
                    {tecnico.freqRelativa}
                  </span>
                  <span className="text-center font-normal tabular-nums text-gray-600">
                    {tecnico.freqAbsoluta}
                  </span>
                  <span className="text-center font-semibold tabular-nums text-gray-800">
                    {tecnico.mediaAproveitamento}
                  </span>
                  <span className="text-center font-medium tabular-nums text-red-600">
                    {formatReceita(tecnico.receitaPerda)}
                  </span>
                  <span className="text-center font-bold tabular-nums text-gray-900">
                    {formatReceita(tecnico.receita)}
                  </span>
                  <span className="text-center font-bold tabular-nums text-green-600">
                    {formatReceita(receitaLiquida)}
                  </span>
                </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
