import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState, type SyntheticEvent } from "react";
import { AlertTriangle, BarChart3, Copy, FilterX, Package, Search, Users, X } from "lucide-react";
import { toast } from "sonner";
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
  DialogClose,
  DialogContent,
  DialogFooter,
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
  fetchKpisDetalheItens,
  fetchKpisDetalheWoMateriais,
  fetchKpisDetalheWos,
  fetchPeriodosConsumo,
  fetchTopConsumidoresMaterial,
} from "@/lib/logistica-service";
import type {
  ConsumoItemCritico,
  ConsumoTecnicoItem,
  DimMaterial,
  KpisConsumo,
  KpisDetalheItem,
  KpisDetalheWo,
  KpisDetalheWoMaterial,
  KpisDetalheWoSelecionada,
  KpisFiltro,
  PeriodoConsumo,
  TopConsumidorMaterial,
} from "@/lib/logistica-types";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import {
  consolidarMateriaisPorCodigo,
  consolidarTopMateriaisPorCodigo,
  normalizeMaterialCode,
} from "@/lib/material-code";
import { formatQuantidade } from "@/lib/parse-locale-number";
import { formatTecnicoLabel, formatTecnicoModalTitle } from "@/lib/tecnico-label";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";

export const Route = createFileRoute("/admin/kpis")({
  head: () => ({
    meta: [
      { title: "KPI's — Estrategic Field" },
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

function formatKpiNumero(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function formatKpiRepresentatividade(quantidade: number, total: number): string {
  if (total <= 0) return "0,0%";
  const pct = (quantidade / total) * 100;
  return `${pct.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function descricaoPeriodo(filtro: KpisFiltro): string {
  if (filtro.mes === null || filtro.ano === null) {
    return "Histórico completo";
  }
  const mesLabel = MESES.find((m) => m.value === String(filtro.mes))?.label ?? "";
  return `${mesLabel} de ${filtro.ano}`;
}

function formatDataAtendimento(value: string | null): string {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("pt-BR");
}

async function copyTabela(headers: string[], rows: string[][]): Promise<void> {
  const text = [headers.join("\t"), ...rows.map((row) => row.join("\t"))].join("\n");
  const ok = await copyTextToClipboard(text);
  if (ok) {
    toast.success("Dados copiados!");
  } else {
    toast.error("Não foi possível copiar.");
  }
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

  const [modalTotalTipo, setModalTotalTipo] = useState<"wos" | "itens" | null>(null);
  const [isProcessadasModalOpen, setIsProcessadasModalOpen] = useState(false);
  const [detalheWos, setDetalheWos] = useState<KpisDetalheWo[]>([]);
  const [detalheItens, setDetalheItens] = useState<KpisDetalheItem[]>([]);
  const [loadingDetalheTotal, setLoadingDetalheTotal] = useState(false);
  const [buscaDetalheWos, setBuscaDetalheWos] = useState("");
  const [buscaDetalheItens, setBuscaDetalheItens] = useState("");
  const [isWoDetailsModalOpen, setIsWoDetailsModalOpen] = useState(false);
  const [selectedWoDetails, setSelectedWoDetails] = useState<KpisDetalheWoSelecionada | null>(null);
  const [woMateriais, setWoMateriais] = useState<KpisDetalheWoMaterial[]>([]);
  const [loadingWoMateriais, setLoadingWoMateriais] = useState(false);
  const fechandoDetalheWoRef = useRef(false);

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
        setDetalhesTecnico(await fetchConsumoTecnicoDetalhe(tecnicoSelecionado, filtro));
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
        setTopConsumidoresMaterial(await fetchTopConsumidoresMaterial(materialSelecionado, filtro));
      } catch {
        setTopConsumidoresMaterial([]);
      } finally {
        setLoadingTopConsumidores(false);
      }
    })();
  }, [materialSelecionado, filtro]);

  useEffect(() => {
    if (!isProcessadasModalOpen) {
      setDetalheWos([]);
      return;
    }

    void (async () => {
      setLoadingDetalheTotal(true);
      try {
        setDetalheWos(await fetchKpisDetalheWos(filtro));
      } catch {
        setDetalheWos([]);
      } finally {
        setLoadingDetalheTotal(false);
      }
    })();
  }, [isProcessadasModalOpen, filtro]);

  useEffect(() => {
    if (modalTotalTipo !== "itens") {
      setDetalheItens([]);
      return;
    }

    void (async () => {
      setLoadingDetalheTotal(true);
      try {
        setDetalheItens(await fetchKpisDetalheItens(filtro));
      } catch {
        setDetalheItens([]);
      } finally {
        setLoadingDetalheTotal(false);
      }
    })();
  }, [modalTotalTipo, filtro]);

  const topMateriaisConsolidados = useMemo(
    () => consolidarTopMateriaisPorCodigo(kpis?.top_materiais ?? []),
    [kpis?.top_materiais],
  );

  const materiaisChart = useMemo(
    () =>
      topMateriaisConsolidados.map((m) => ({
        label: m.descricao.length > 28 ? `${m.descricao.slice(0, 28)}…` : m.descricao,
        descricao: m.descricao,
        total: m.total,
      })),
    [topMateriaisConsolidados],
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

  const criticosDataConsolidados = useMemo(
    () =>
      consolidarMateriaisPorCodigo(criticosData).sort(
        (a, b) => Number(b.total) - Number(a.total),
      ),
    [criticosData],
  );

  const criticosChart = useMemo(
    () =>
      criticosDataConsolidados.map((c) => ({
        label: c.material,
        total: c.total,
        descricao: c.descr_material,
      })),
    [criticosDataConsolidados],
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
      detalheOrdenacao === "desc" ? b.qtd_baixada - a.qtd_baixada : a.qtd_baixada - b.qtd_baixada,
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

  const tituloTopConsumidores = useMemo(() => {
    if (!materialSelecionado) return "—";
    const nome =
      itensCriticosLabels[materialSelecionado] ??
      criticosData.find((c) => c.material === materialSelecionado)?.descr_material ??
      "";
    const codigo = normalizeMaterialCode(materialSelecionado);
    return nome ? `${codigo} - ${nome}` : codigo;
  }, [materialSelecionado, itensCriticosLabels, criticosData]);

  const detalheWosFiltrados = useMemo(() => {
    const termo = buscaDetalheWos.trim().toLowerCase();
    if (!termo) return detalheWos;
    return detalheWos.filter(
      (row) =>
        row.work_order_id.toLowerCase().includes(termo) ||
        row.id_tecnico.toLowerCase().includes(termo) ||
        row.nome_tecnico.toLowerCase().includes(termo),
    );
  }, [detalheWos, buscaDetalheWos]);

  const detalheItensFiltrados = useMemo(() => {
    const termo = buscaDetalheItens.trim().toLowerCase();
    if (!termo) return detalheItens;
    return detalheItens.filter(
      (row) =>
        row.material.toLowerCase().includes(termo) ||
        row.descr_material.toLowerCase().includes(termo),
    );
  }, [detalheItens, buscaDetalheItens]);

  const totalGeralItens = useMemo(() => {
    if (detalheItens.length > 0) {
      return detalheItens.reduce((sum, row) => sum + row.total, 0);
    }
    return kpis?.total_itens ?? 0;
  }, [detalheItens, kpis?.total_itens]);

  const abrirModalTotalWos = () => {
    setBuscaDetalheWos("");
    setModalTotalTipo("wos");
    setIsProcessadasModalOpen(true);
  };

  const abrirModalTotalItens = () => {
    setBuscaDetalheItens("");
    setModalTotalTipo("itens");
  };

  const fecharModalDetalhes = (e?: SyntheticEvent) => {
    e?.stopPropagation();
    fechandoDetalheWoRef.current = true;
    setIsWoDetailsModalOpen(false);
    setSelectedWoDetails(null);
    setWoMateriais([]);
    requestAnimationFrame(() => {
      fechandoDetalheWoRef.current = false;
    });
  };

  const fecharModalProcessadas = () => {
    setIsProcessadasModalOpen(false);
    setBuscaDetalheWos("");
    if (modalTotalTipo === "wos") {
      setModalTotalTipo(null);
    }
    fecharModalDetalhes();
  };

  const abrirDetalheWoMateriais = (row: KpisDetalheWo) => {
    setSelectedWoDetails({
      work_order_id: row.work_order_id,
      id_tecnico: row.id_tecnico,
      nome_tecnico: row.nome_tecnico,
    });
    setIsWoDetailsModalOpen(true);

    void (async () => {
      setLoadingWoMateriais(true);
      try {
        setWoMateriais(await fetchKpisDetalheWoMateriais(row.work_order_id, filtro));
      } catch {
        setWoMateriais([]);
      } finally {
        setLoadingWoMateriais(false);
      }
    })();
  };

  const copiarDetalheWos = () => {
    void copyTabela(
      ["WO", "Técnico", "Id TOA", "Qtd Itens", "Data Atendimento"],
      detalheWosFiltrados.map((row) => [
        row.work_order_id,
        row.nome_tecnico || "—",
        row.id_tecnico,
        String(row.total_itens),
        formatDataAtendimento(row.data_atendimento),
      ]),
    );
  };

  const copiarDetalheItens = () => {
    void copyTabela(
      ["Código", "Descrição", "Quantidade", "Média consumo", "Representatividade"],
      detalheItensFiltrados.map((row) => [
        row.material,
        row.descr_material,
        formatKpiNumero(row.total),
        formatKpiNumero(row.total / 4),
        formatKpiRepresentatividade(row.total, totalGeralItens),
      ]),
    );
  };

  const filtrosLimpos = filtro.mes === null || filtro.ano === null;

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-7xl px-4 pb-10 pt-6 lg:px-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">KPI&apos;s</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consolidado por data de atendimento da WO — {descricaoPeriodo(filtro)}.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        <div className="flex flex-col items-start gap-6 lg:flex-row lg:items-stretch">
          <aside className="w-full shrink-0 lg:w-48 lg:min-w-[200px] lg:max-w-[220px]">
            <div className="sticky top-6 z-20 h-fit rounded-2xl border border-border bg-card/95 p-4 shadow-sm backdrop-blur-md">
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <BarChart3 className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">Filtros de Período</h2>
                {filtrosLimpos && (
                  <Badge variant="secondary" className="text-xs">
                    Histórico geral
                  </Badge>
                )}
              </div>

              <div className="space-y-4">
                <div className="space-y-1.5">
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
                    <SelectTrigger id="filtro-ano" className="w-full">
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

                <div className="space-y-1.5">
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
                    <SelectTrigger id="filtro-mes" className="w-full">
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      {mesesDoAnoSelecionado.map((mes) => {
                        const label =
                          MESES.find((m) => m.value === String(mes))?.label ?? String(mes);
                        return (
                          <SelectItem key={mes} value={String(mes)}>
                            {label}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full gap-1.5"
                  onClick={() => setFiltro({ mes: null, ano: null })}
                >
                  <FilterX className="h-4 w-4" />
                  Limpar Filtros
                </Button>
              </div>
            </div>
          </aside>

          <div className="min-w-0 w-full flex-1 space-y-6">
            {!filtroReady || loading ? (
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
                <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={abrirModalTotalItens}
                    className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-shadow cursor-pointer hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Package className="h-4 w-4 text-primary" />
                      Total de Itens Consumidos
                    </div>
                    <div className="mt-2 text-3xl font-black text-foreground">
                      {formatQuantidade(kpis?.total_itens ?? 0)}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={abrirModalTotalWos}
                    className="rounded-2xl border border-border bg-card p-5 text-left shadow-sm transition-shadow cursor-pointer hover:shadow-md"
                  >
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <BarChart3 className="h-4 w-4 text-primary" />
                      Total de WOs Processadas
                    </div>
                    <div className="mt-2 text-3xl font-black text-foreground">
                      {formatQuantidade(kpis?.total_wos ?? 0)}
                    </div>
                  </button>
                </section>

                <section className="grid grid-cols-1 items-stretch gap-6 xl:grid-cols-2">
                  <div className="flex h-full min-h-0 flex-col rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="mb-4 shrink-0 font-bold">Top 7 Materiais Mais Consumidos</h2>
                    {materiaisChart.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
                    ) : (
                      <ChartContainer config={CHART_CONFIG} className="h-64 w-full shrink-0">
                        <BarChart data={materiaisChart} layout="vertical" margin={{ left: 8 }}>
                          <CartesianGrid horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={120}
                            tick={{ fontSize: 11 }}
                          />
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
                          <Bar dataKey="total" fill="var(--color-total)" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ChartContainer>
                    )}
                    <Table className="mt-4 table-fixed">
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[40%]">Item</TableHead>
                          <TableHead className="w-[20%] text-right">Quant</TableHead>
                          <TableHead className="w-[22%] text-right whitespace-nowrap">
                            Média consumo
                          </TableHead>
                          <TableHead className="w-[18%] text-right whitespace-nowrap">
                            % Total
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {topMateriaisConsolidados.map((m) => (
                          <TableRow key={m.sku}>
                            <TableCell className="max-w-0 truncate text-sm" title={m.descricao}>
                              {m.descricao}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold">
                              {formatKpiNumero(m.total)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-muted-foreground">
                              {formatKpiNumero(m.total / 4)}
                            </TableCell>
                            <TableCell className="text-right text-sm font-semibold text-primary">
                              {formatKpiRepresentatividade(m.total, totalGeralItens)}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="mb-1 flex shrink-0 items-center gap-2 font-bold">
                      <Users className="h-4 w-4 text-primary" />
                      Técnicos por Volume de Baixa
                    </h2>
                    <p className="mb-4 shrink-0 text-xs text-muted-foreground">
                      Clique em um técnico para ver o detalhamento.
                    </p>
                    {tecnicosChart.length === 0 ? (
                      <p className="text-sm text-muted-foreground">Nenhum dado no período.</p>
                    ) : (
                      <div className="flex min-h-0 flex-1 flex-col">
                        <div className="shrink-0 overflow-x-auto">
                          <ChartContainer
                            config={CHART_CONFIG}
                            className="h-64 w-full"
                            style={{ minWidth: Math.max(tecnicosChart.length * 56, 280) }}
                          >
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
                        </div>
                        <div className="mt-4 overflow-y-auto max-h-96 pr-2">
                          <ul className="space-y-2">
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
                      {itensCriticos.map((codigo) => {
                        const nomeCompleto =
                          itensCriticosLabels[codigo] ??
                          criticosData.find((c) => c.material === codigo)?.descr_material ??
                          codigo;
                        return (
                          <Badge
                            key={codigo}
                            variant="secondary"
                            className="max-w-[220px] gap-1 pr-1 font-mono text-xs"
                          >
                            <span className="truncate" title={nomeCompleto}>
                              {normalizeMaterialCode(codigo)}
                            </span>
                            <button
                              type="button"
                              aria-label={`Remover ${codigo}`}
                              className="ml-0.5 shrink-0 rounded-full p-0.5 hover:bg-muted"
                              onClick={() => removerCodigoCritico(codigo)}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        );
                      })}
                    </div>
                  )}

                  {itensCriticos.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum item selecionado. Busque no catálogo de estoque para monitorar.
                    </p>
                  ) : loadingCriticos ? (
                    <p className="text-sm text-muted-foreground">Carregando itens...</p>
                  ) : criticosDataConsolidados.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      Nenhum consumo registrado para os itens monitorados neste período.
                    </p>
                  ) : (
                    <div className="grid min-w-0 grid-cols-1 gap-6 xl:grid-cols-2">
                      <ChartContainer config={CHART_CONFIG} className="h-56 w-full min-w-0">
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
                          <Bar dataKey="total" fill="var(--color-total)" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ChartContainer>

                      <div className="min-w-0 overflow-x-auto">
                        <Table>
                          <TableHeader>
                            <TableRow>
                              <TableHead>Código</TableHead>
                              <TableHead>Descrição</TableHead>
                              <TableHead className="text-right">Qtd Baixada</TableHead>
                            </TableRow>
                          </TableHeader>
                          <TableBody>
                            {criticosDataConsolidados.map((item) => (
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
                    </div>
                  )}
                </section>
              </>
            )}
          </div>
        </div>
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
            <DialogTitle>Top Consumidores: {tituloTopConsumidores}</DialogTitle>
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
                <p className="text-sm text-muted-foreground">Nenhum técnico corresponde à busca.</p>
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

      <Dialog
        open={isProcessadasModalOpen}
        onOpenChange={(open) => {
          if (fechandoDetalheWoRef.current) return;
          if (!open) {
            fecharModalProcessadas();
          } else {
            setIsProcessadasModalOpen(true);
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>WOs Processadas — {descricaoPeriodo(filtro)}</DialogTitle>
          </DialogHeader>
          {loadingDetalheTotal ? (
            <p className="text-sm text-muted-foreground">Carregando WOs...</p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar por WO, técnico ou matrícula..."
                  value={buscaDetalheWos}
                  onChange={(e) => setBuscaDetalheWos(e.target.value)}
                  className="pl-9"
                />
              </div>
              {detalheWosFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhuma WO encontrada para o período ou busca.
                </p>
              ) : (
                <div className="max-h-[50vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>WO</TableHead>
                        <TableHead>Técnico</TableHead>
                        <TableHead className="text-right">Qtd Itens</TableHead>
                        <TableHead className="text-right">Data Atend.</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalheWosFiltrados.map((row) => (
                        <TableRow
                          key={`${row.work_order_id}-${row.id_tecnico}`}
                          className="cursor-pointer transition-colors hover:bg-gray-50"
                          onClick={() => abrirDetalheWoMateriais(row)}
                        >
                          <TableCell className="font-mono text-xs">{row.work_order_id}</TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {formatTecnicoLabel(row.nome_tecnico, row.id_tecnico)}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground">
                              {row.id_tecnico}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-semibold">
                            {formatQuantidade(row.total_itens)}
                          </TableCell>
                          <TableCell className="text-right text-sm">
                            {formatDataAtendimento(row.data_atendimento)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <DialogFooter className="mt-4 sm:justify-start">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={detalheWosFiltrados.length === 0}
                  onClick={copiarDetalheWos}
                >
                  <Copy className="h-4 w-4" />
                  Copiar Todos os Dados
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={modalTotalTipo === "itens"}
        onOpenChange={(open) => {
          if (!open) {
            setModalTotalTipo(null);
            setBuscaDetalheItens("");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Itens Consumidos — {descricaoPeriodo(filtro)}</DialogTitle>
          </DialogHeader>
          {loadingDetalheTotal ? (
            <p className="text-sm text-muted-foreground">Carregando itens...</p>
          ) : (
            <>
              <div className="relative mb-4">
                <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Buscar por código ou descrição..."
                  value={buscaDetalheItens}
                  onChange={(e) => setBuscaDetalheItens(e.target.value)}
                  className="pl-9"
                />
              </div>
              {detalheItensFiltrados.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum item encontrado para o período ou busca.
                </p>
              ) : (
                <div className="max-h-[50vh] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[80px] px-2">Código</TableHead>
                        <TableHead className="min-w-[120px] px-2">Descrição</TableHead>
                        <TableHead className="w-[80px] px-2 text-right whitespace-nowrap">
                          Quantidade
                        </TableHead>
                        <TableHead className="w-[88px] px-2 text-right whitespace-nowrap">
                          Média consumo
                        </TableHead>
                        <TableHead className="w-[88px] px-2 text-right whitespace-nowrap">
                          Representatividade
                        </TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {detalheItensFiltrados.map((row) => (
                        <TableRow key={`${row.material}-${row.descr_material}`}>
                          <TableCell className="px-2 font-mono text-xs">{row.material}</TableCell>
                          <TableCell
                            className="max-w-[180px] truncate px-2 text-sm"
                            title={row.descr_material}
                          >
                            {row.descr_material}
                          </TableCell>
                          <TableCell className="px-2 text-right text-sm font-semibold">
                            {formatKpiNumero(row.total)}
                          </TableCell>
                          <TableCell className="px-2 text-right text-sm font-semibold text-muted-foreground">
                            {formatKpiNumero(row.total / 4)}
                          </TableCell>
                          <TableCell className="px-2 text-right text-sm font-semibold text-primary">
                            {formatKpiRepresentatividade(row.total, totalGeralItens)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              <DialogFooter className="mt-4 sm:justify-start">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={detalheItensFiltrados.length === 0}
                  onClick={copiarDetalheItens}
                >
                  <Copy className="h-4 w-4" />
                  Copiar Todos os Dados
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={isWoDetailsModalOpen}
        onOpenChange={(open) => {
          if (!open) {
            fecharModalDetalhes();
          }
        }}
      >
        <DialogContent
          className="z-[60] max-h-[85vh] max-w-2xl overflow-y-auto [&>button:last-child]:hidden"
          onPointerDownOutside={(e) => {
            e.preventDefault();
            e.stopPropagation();
            fecharModalDetalhes(e);
          }}
          onInteractOutside={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onEscapeKeyDown={(e) => {
            e.stopPropagation();
            fecharModalDetalhes(e);
          }}
        >
          <DialogClose
            className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            onClick={(e) => fecharModalDetalhes(e)}
          >
            <X className="h-4 w-4" />
            <span className="sr-only">Fechar</span>
          </DialogClose>
          <DialogHeader>
            <DialogTitle>Detalhamento da WO</DialogTitle>
            {selectedWoDetails && (
              <p className="text-sm text-muted-foreground">
                WO{" "}
                <span className="font-mono font-bold text-foreground">
                  {selectedWoDetails.work_order_id}
                </span>
                {" · "}
                <span className="font-semibold text-foreground">
                  {formatTecnicoLabel(selectedWoDetails.nome_tecnico, selectedWoDetails.id_tecnico)}
                </span>
              </p>
            )}
          </DialogHeader>

          {loadingWoMateriais ? (
            <p className="text-sm text-muted-foreground">Carregando materiais...</p>
          ) : woMateriais.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhum material registrado para esta WO no período.
            </p>
          ) : (
            <div className="max-h-[50vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Código</TableHead>
                    <TableHead>Descrição do Item</TableHead>
                    <TableHead className="text-right">Quantidade Utilizada</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {woMateriais.map((item) => (
                    <TableRow key={`${item.material}-${item.descr_material}`}>
                      <TableCell className="font-mono text-xs">{item.material}</TableCell>
                      <TableCell className="text-sm">{item.descr_material}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatQuantidade(item.qtd_baixada)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <DialogFooter className="mt-4 sm:justify-start">
            <Button type="button" variant="outline" onClick={(e) => fecharModalDetalhes(e)}>
              Voltar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
