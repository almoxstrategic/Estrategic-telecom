import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  FilterX,
  Package,
  Search,
  Users,
  X,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MaterialCombobox } from "@/components/MaterialCombobox";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  fetchConsumoItensCriticos,
  fetchConsumoTecnicoDetalhe,
  fetchKpisConsumo,
  fetchPeriodosConsumo,
  fetchTopConsumidoresMaterial,
} from "@/lib/logistica-service";
import type {
  ConsumoItemCritico,
  ConsumoTecnicoItem,
  DimMaterial,
  KpisConsumo,
  KpisFiltro,
  PeriodoConsumo,
  TopConsumidorMaterial,
} from "@/lib/logistica-types";
import { normalizeMaterialCode } from "@/lib/material-code";
import { formatQuantidade } from "@/lib/parse-locale-number";
import { formatTecnicoLabel, formatTecnicoModalTitle } from "@/lib/tecnico-label";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin/kpis")({
  head: () => ({
    meta: [
      { title: "KPIs de Consumo — Estrategic Field" },
      { name: "description", content: "Métricas de consumo de miscelâneas." },
    ],
  }),
  component: KpisPage,
});

const CHART_CONFIG = {
  total: { label: "Qtd", color: "var(--primary)" },
} satisfies ChartConfig;

const MESES = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

const ITENS_CRITICOS_STORAGE_KEY = "estrategic:kpis-itens-criticos";

function hasItensCriticosStorage(): boolean {
  return localStorage.getItem(ITENS_CRITICOS_STORAGE_KEY) !== null;
}

function loadItensCriticosFromStorage(): string[] {
  try {
    const raw = localStorage.getItem(ITENS_CRITICOS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
    return [];
  } catch {
    return [];
  }
}

function formatRepresentatividade(quantidade: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((quantidade / total) * 100).toFixed(1)}%`;
}

function descricaoPeriodo(filtro: KpisFiltro): string {
  if (filtro.mes === null || filtro.ano === null) {
    return "Histórico completo";
  }
  const mesLabel = MESES.find((m) => m.value === String(filtro.mes))?.label ?? "";
  return `${mesLabel} de ${filtro.ano}`;
}

function KpisPage() {
  const [periodos, setPeriodos] = useState<PeriodoConsumo[]>([]);
  const [filtroReady, setFiltroReady] = useState(false);
  const [filtro, setFiltro] = useState<KpisFiltro>({ mes: null, ano: null });
  const [kpis, setKpis] = useState<KpisConsumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [itensCriticos, setItensCriticos] = useState<string[]>(loadItensCriticosFromStorage);
  const [itensCriticosSeeded, setItensCriticosSeeded] = useState(hasItensCriticosStorage);
  const [itensCriticosLabels, setItensCriticosLabels] = useState<Record<string, string>>({});
  const [criticosData, setCriticosData] = useState<ConsumoItemCritico[]>([]);
  const [loadingCriticos, setLoadingCriticos] = useState(false);

  const [tecnicoSelecionado, setTecnicoSelecionado] = useState<string | null>(null);
  const [tecnicoSelecionadoLabel, setTecnicoSelecionadoLabel] = useState("");
  const [detalhesTecnico, setDetalhesTecnico] = useState<ConsumoTecnicoItem[]>([]);
  const [loadingDetalhes, setLoadingDetalhes] = useState(false);
  const [detalheBusca, setDetalheBusca] = useState("");
  const [detalheOrdenacao, setDetalheOrdenacao] = useState<"desc" | "asc">("desc");

  const [materialSelecionado, setMaterialSelecionado] = useState<string | null>(null);
  const [topConsumidoresMaterial, setTopConsumidoresMaterial] = useState<TopConsumidorMaterial[]>(
    [],
  );
  const [loadingTopConsumidores, setLoadingTopConsumidores] = useState(false);
  const [topConsumidoresBusca, setTopConsumidoresBusca] = useState("");

  useEffect(() => {
    if (!itensCriticosSeeded && itensCriticos.length === 0) return;
    localStorage.setItem(ITENS_CRITICOS_STORAGE_KEY, JSON.stringify(itensCriticos));
  }, [itensCriticos, itensCriticosSeeded]);

  useEffect(() => {
    if (itensCriticosSeeded || !kpis?.top_materiais?.length) return;

    const codigos = kpis.top_materiais.map((m) => normalizeMaterialCode(m.sku));
    const labels = Object.fromEntries(
      kpis.top_materiais.map((m) => [normalizeMaterialCode(m.sku), m.descricao.trim()]),
    );

    setItensCriticos(codigos);
    setItensCriticosLabels((prev) => ({ ...labels, ...prev }));
    setItensCriticosSeeded(true);
  }, [kpis?.top_materiais, itensCriticosSeeded]);

  useEffect(() => {
    void (async () => {
      try {
        const lista = await fetchPeriodosConsumo();
        setPeriodos(lista);
        if (lista.length > 0) {
          setFiltro({ mes: lista[0]!.mes, ano: lista[0]!.ano });
        }
      } catch {
        setPeriodos([]);
      } finally {
        setFiltroReady(true);
      }
    })();
  }, []);

  const anosComDados = useMemo(
    () => [...new Set(periodos.map((p) => p.ano))].sort((a, b) => b - a),
    [periodos],
  );

  const mesesDoAnoSelecionado = useMemo(() => {
    if (filtro.ano === null) return [];
    return periodos
      .filter((p) => p.ano === filtro.ano)
      .map((p) => p.mes)
      .sort((a, b) => a - b);
  }, [periodos, filtro.ano]);

  const carregarKpis = useCallback(async (f: KpisFiltro) => {
    setLoading(true);
    setError(null);
    try {
      setKpis(await fetchKpisConsumo(f));
    } catch (err) {
      setError((err as Error).message);
      setKpis(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!filtroReady) return;
    void carregarKpis(filtro);
  }, [filtro, filtroReady, carregarKpis]);

  useEffect(() => {
    if (itensCriticos.length === 0) {
      setCriticosData([]);
      return;
    }
    void (async () => {
      setLoadingCriticos(true);
      try {
        setCriticosData(await fetchConsumoItensCriticos(itensCriticos, filtro));
      } catch {
        setCriticosData([]);
      } finally {
        setLoadingCriticos(false);
      }
    })();
  }, [itensCriticos, filtro]);

  useEffect(() => {
    if (!tecnicoSelecionado) {
      setDetalhesTecnico([]);
      return;
    }
    void (async () => {
      setLoadingDetalhes(true);
      try {
        setDetalhesTecnico(
          await fetchConsumoTecnicoDetalhe(tecnicoSelecionado, filtro),
        );
      } catch {
        setDetalhesTecnico([]);
      } finally {
        setLoadingDetalhes(false);
      }
    })();
  }, [tecnicoSelecionado, filtro]);

  useEffect(() => {
    if (!materialSelecionado) {
      setTopConsumidoresMaterial([]);
      return;
    }
    void (async () => {
      setLoadingTopConsumidores(true);
      try {
        setTopConsumidoresMaterial(
          await fetchTopConsumidoresMaterial(materialSelecionado, filtro),
        );
      } catch {
        setTopConsumidoresMaterial([]);
      } finally {
        setLoadingTopConsumidores(false);
      }
    })();
  }, [materialSelecionado, filtro]);

  const materiaisChart = useMemo(
    () =>
      (kpis?.top_materiais ?? []).map((m) => ({
        label: m.descricao.length > 28 ? `${m.descricao.slice(0, 28)}…` : m.descricao,
        total: m.total,
      })),
    [kpis?.top_materiais],
  );

  const tecnicosChart = useMemo(
    () =>
      (kpis?.top_tecnicos ?? []).slice(0, 5).map((t) => ({
        label: t.id_tecnico,
        nome_tecnico: t.nome_tecnico,
        display: formatTecnicoLabel(t.nome_tecnico, t.id_tecnico),
        total: t.total,
        id_tecnico: t.id_tecnico,
      })),
    [kpis?.top_tecnicos],
  );

  const criticosChart = useMemo(
    () =>
      criticosData.map((c) => ({
        label: c.material,
        total: c.total,
        descricao: c.descr_material,
      })),
    [criticosData],
  );

  const adicionarMaterialCritico = (item: DimMaterial) => {
    const codigo = normalizeMaterialCode(item.material);
    setItensCriticos((prev) => (prev.includes(codigo) ? prev : [...prev, codigo]));
    setItensCriticosLabels((prev) => ({
      ...prev,
      [codigo]: item.descr_material.trim(),
    }));
  };

  const removerCodigoCritico = (codigo: string) => {
    setItensCriticos((prev) => prev.filter((c) => c !== codigo));
  };

  const abrirDetalheTecnico = (idTecnico: string, nomeTecnico?: string) => {
    setTecnicoSelecionado(idTecnico);
    setTecnicoSelecionadoLabel(formatTecnicoModalTitle(nomeTecnico, idTecnico));
    setDetalheBusca("");
    setDetalheOrdenacao("desc");
  };

  const detalhesFiltrados = useMemo(() => {
    const termo = detalheBusca.trim().toLowerCase();
    let lista = detalhesTecnico;
    if (termo) {
      lista = lista.filter(
        (item) =>
          item.material.toLowerCase().includes(termo) ||
          item.descr_material.toLowerCase().includes(termo),
      );
    }
    return [...lista].sort((a, b) =>
      detalheOrdenacao === "desc"
        ? b.qtd_baixada - a.qtd_baixada
        : a.qtd_baixada - b.qtd_baixada,
    );
  }, [detalhesTecnico, detalheBusca, detalheOrdenacao]);

  const totalConsumoTecnico = useMemo(
    () => detalhesTecnico.reduce((sum, item) => sum + item.qtd_baixada, 0),
    [detalhesTecnico],
  );

  const abrirTopConsumidoresMaterial = (material: string) => {
    setTopConsumidoresBusca("");
    setMaterialSelecionado(material);
  };

  const totalConsumoMaterial = useMemo(
    () => topConsumidoresMaterial.reduce((sum, item) => sum + item.total, 0),
    [topConsumidoresMaterial],
  );

  const topConsumidoresFiltrados = useMemo(() => {
    const termo = topConsumidoresBusca.trim().toLowerCase();
    if (!termo) return topConsumidoresMaterial;
    return topConsumidoresMaterial.filter(
      (item) =>
        item.nome_tecnico.toLowerCase().includes(termo) ||
        item.id_tecnico.toLowerCase().includes(termo),
    );
  }, [topConsumidoresMaterial, topConsumidoresBusca]);

  const filtrosLimpos = filtro.mes === null || filtro.ano === null;

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">KPIs de Consumo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consolidado por data de atendimento da WO — {descricaoPeriodo(filtro)}.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        <section className="sticky top-16 z-20 mb-6 rounded-2xl border border-border bg-card/90 p-4 pb-4 shadow-sm backdrop-blur-md">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <BarChart3 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">Filtros de Período</h2>
            {filtrosLimpos && (
              <Badge variant="secondary" className="text-xs">
                Histórico geral
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-40 space-y-1.5">
              <Label htmlFor="filtro-mes">Mês</Label>
              <Select
                value={filtro.mes !== null ? String(filtro.mes) : "todos"}
                disabled={filtro.ano === null || mesesDoAnoSelecionado.length === 0}
                onValueChange={(v) =>
                  setFiltro((prev) => ({
                    ...prev,
                    mes: Number(v),
                  }))
                }
              >
                <SelectTrigger id="filtro-mes">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  {mesesDoAnoSelecionado.map((mes) => {
                    const label = MESES.find((m) => m.value === String(mes))?.label ?? String(mes);
                    return (
                      <SelectItem key={mes} value={String(mes)}>
                        {label}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
            <div className="w-32 space-y-1.5">
              <Label htmlFor="filtro-ano">Ano</Label>
              <Select
                value={filtro.ano !== null ? String(filtro.ano) : "todos"}
                disabled={anosComDados.length === 0}
                onValueChange={(v) => {
                  if (v === "todos") {
                    setFiltro({ mes: null, ano: null });
                    return;
                  }
                  const ano = Number(v);
                  const meses = periodos
                    .filter((p) => p.ano === ano)
                    .map((p) => p.mes)
                    .sort((a, b) => a - b);
                  setFiltro({
                    ano,
                    mes: meses[meses.length - 1] ?? null,
                  });
                }}
              >
                <SelectTrigger id="filtro-ano">
                  <SelectValue placeholder="Todos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todos">Todos</SelectItem>
                  {anosComDados.map((y) => (
                    <SelectItem key={y} value={String(y)}>
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => setFiltro({ mes: null, ano: null })}
            >
              <FilterX className="h-4 w-4" />
              Limpar Filtros
            </Button>
          </div>
        </section>

        {(!filtroReady || loading) ? (
          <p className="text-sm text-muted-foreground">Carregando métricas...</p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : periodos.length === 0 ? (
          <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
            Nenhum período com consumo importado. Faça o Upload B na tela de Importação.
          </p>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4 text-primary" />
                  Total de Itens Consumidos
                </div>
                <div className="mt-2 text-3xl font-black text-foreground">
                  {formatQuantidade(kpis?.total_itens ?? 0)}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Total de WOs Processadas
                </div>
                <div className="mt-2 text-3xl font-black text-foreground">
                  {formatQuantidade(kpis?.total_wos ?? 0)}
                </div>
              </div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-bold">Top 7 Materiais Mais Consumidos</h2>
                {materiaisChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
                ) : (
                  <ChartContainer config={CHART_CONFIG} className="h-64 w-full">
                    <BarChart data={materiaisChart} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis
                        type="category"
                        dataKey="label"
                        width={120}
                        tick={{ fontSize: 11 }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar
                        dataKey="total"
                        fill="var(--color-total)"
                        radius={[0, 4, 4, 0]}
                      />
                    </BarChart>
                  </ChartContainer>
                )}
                <ul className="mt-4 space-y-2">
                  {(kpis?.top_materiais ?? []).map((m) => (
                    <li
                      key={`${m.sku}-${m.descricao}`}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="truncate">{m.descricao}</span>
                      <Badge variant="secondary">{formatQuantidade(m.total)}</Badge>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-1 flex items-center gap-2 font-bold">
                  <Users className="h-4 w-4 text-primary" />
                  Técnicos por Volume de Baixa
                </h2>
                <p className="mb-4 text-xs text-muted-foreground">
                  Clique em um técnico para ver o detalhamento.
                </p>
                {tecnicosChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
                ) : (
                  <div className="max-h-[min(500px,60vh)] overflow-y-auto pr-1 [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-border/80 [&::-webkit-scrollbar-track]:bg-transparent">
                    <ChartContainer config={CHART_CONFIG} className="h-64 w-full">
                    <BarChart data={tecnicosChart}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis tickFormatter={(v) => formatQuantidade(v)} />
                      <ChartTooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const item = payload[0].payload as {
                            display?: string;
                            total: number;
                          };
                          return (
                            <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                              <p className="font-semibold">{item.display}</p>
                              <p className="text-muted-foreground">
                                {formatQuantidade(item.total)} itens
                              </p>
                            </div>
                          );
                        }}
                      />
                      <Bar
                        dataKey="total"
                        fill="var(--color-total)"
                        radius={[4, 4, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const payload = data as {
                            id_tecnico?: string;
                            label?: string;
                            nome_tecnico?: string;
                          };
                          abrirDetalheTecnico(
                            payload.id_tecnico ?? payload.label ?? "",
                            payload.nome_tecnico,
                          );
                        }}
                      />
                    </BarChart>
                  </ChartContainer>
                    <ul className="mt-4 space-y-2">
                      {(kpis?.top_tecnicos ?? []).map((t) => (
                        <li key={t.id_tecnico}>
                          <button
                            type="button"
                            onClick={() => abrirDetalheTecnico(t.id_tecnico, t.nome_tecnico)}
                            className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors hover:bg-muted/60"
                          >
                            <span className="font-medium text-primary">
                              {formatTecnicoLabel(t.nome_tecnico, t.id_tecnico)}
                            </span>
                            <Badge variant="outline">{formatQuantidade(t.total)} itens</Badge>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </section>

            <section className="rounded-2xl border border-amber-200/80 bg-card p-5 shadow-sm dark:border-amber-900/50">
              <div className="mb-4 flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
                <div>
                  <h2 className="font-bold">Monitoramento de Itens Críticos</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    Acompanhe o consumo dos materiais mais relevantes do período selecionado.
                  </p>
                </div>
              </div>

              <div className="mb-4 flex flex-wrap gap-2">
                <div className="min-w-[240px] flex-1">
                  <MaterialCombobox
                    exclude={itensCriticos}
                    onSelect={adicionarMaterialCritico}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setItensCriticos([]);
                    setItensCriticosLabels({});
                  }}
                  disabled={itensCriticos.length === 0}
                >
                  Limpar Itens
                </Button>
              </div>

              {itensCriticos.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-2">
                  {itensCriticos.map((codigo) => (
                    <Badge
                      key={codigo}
                      variant="secondary"
                      className="gap-1 pr-1 font-mono text-xs"
                    >
                      {normalizeMaterialCode(codigo)}
                      <button
                        type="button"
                        aria-label={`Remover ${codigo}`}
                        className="ml-0.5 rounded-full p-0.5 hover:bg-muted"
                        onClick={() => removerCodigoCritico(codigo)}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </Badge>
                  ))}
                </div>
              )}

              {itensCriticos.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum item selecionado. Busque no catálogo de estoque para monitorar.
                </p>
              ) : loadingCriticos ? (
                <p className="text-sm text-muted-foreground">Carregando itens...</p>
              ) : criticosData.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum consumo registrado para os itens monitorados neste período.
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
                  <ChartContainer config={CHART_CONFIG} className="h-56 w-full">
                    <BarChart data={criticosChart}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                      <YAxis tickFormatter={(v) => formatQuantidade(v)} />
                      <ChartTooltip
                        content={
                          <ChartTooltipContent
                            labelFormatter={(_, payload) => {
                              const item = payload?.[0]?.payload as
                                | { descricao?: string; label?: string }
                                | undefined;
                              return item?.descricao ?? item?.label ?? "";
                            }}
                          />
                        }
                      />
                      <Bar
                        dataKey="total"
                        fill="var(--color-total)"
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ChartContainer>

                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Código</TableHead>
                        <TableHead>Descrição</TableHead>
                        <TableHead className="text-right">Qtd Baixada</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {criticosData.map((item) => (
                        <TableRow
                          key={item.material}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => abrirTopConsumidoresMaterial(item.material)}
                        >
                          <TableCell className="font-mono text-xs">{item.material}</TableCell>
                          <TableCell className="max-w-[180px] truncate text-sm">
                            {item.descr_material}
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatQuantidade(item.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <Dialog
        open={tecnicoSelecionado !== null}
        onOpenChange={(open) => {
          if (!open) {
            setTecnicoSelecionado(null);
            setTecnicoSelecionadoLabel("");
            setDetalheBusca("");
            setDetalheOrdenacao("desc");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes de Consumo: {tecnicoSelecionadoLabel || "—"}</DialogTitle>
          </DialogHeader>
          {loadingDetalhes ? (
            <p className="text-sm text-muted-foreground">Carregando detalhes...</p>
          ) : detalhesTecnico.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum item encontrado para este técnico no período.
            </p>
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="relative flex-1">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="Buscar por código ou descrição..."
                    value={detalheBusca}
                    onChange={(e) => setDetalheBusca(e.target.value)}
                    className="pl-9"
                  />
                </div>
                <Select
                  value={detalheOrdenacao}
                  onValueChange={(v) => setDetalheOrdenacao(v as "desc" | "asc")}
                >
                  <SelectTrigger className="w-full sm:w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="desc">Maior para Menor</SelectItem>
                    <SelectItem value="asc">Menor para Maior</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {detalhesFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum material corresponde à busca.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Material</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Representatividade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detalhesFiltrados.map((item) => (
                      <TableRow key={`${item.material}-${item.descr_material}`}>
                        <TableCell>
                          <div className="font-medium">{item.descr_material}</div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.material}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatQuantidade(item.qtd_baixada)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatRepresentatividade(item.qtd_baixada, totalConsumoTecnico)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={materialSelecionado !== null}
        onOpenChange={(open) => {
          if (!open) {
            setMaterialSelecionado(null);
            setTopConsumidoresBusca("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Top Consumidores: {materialSelecionado ?? "—"}</DialogTitle>
          </DialogHeader>
          {loadingTopConsumidores ? (
            <p className="text-sm text-muted-foreground">Carregando consumidores...</p>
          ) : topConsumidoresMaterial.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum consumo registrado para este material no período.
            </p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar por nome ou matrícula..."
                  value={topConsumidoresBusca}
                  onChange={(e) => setTopConsumidoresBusca(e.target.value)}
                  className="pl-9"
                />
              </div>
              {topConsumidoresFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum técnico corresponde à busca.
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Técnico</TableHead>
                      <TableHead className="text-right">Quantidade</TableHead>
                      <TableHead className="text-right">Representatividade</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topConsumidoresFiltrados.map((item) => (
                      <TableRow key={item.id_tecnico}>
                        <TableCell>
                          <div className="font-medium">
                            {formatTecnicoLabel(item.nome_tecnico, item.id_tecnico)}
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {item.id_tecnico}
                          </div>
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {formatQuantidade(item.total)}
                        </TableCell>
                        <TableCell className="text-right font-semibold text-primary">
                          {formatRepresentatividade(item.total, totalConsumoMaterial)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
