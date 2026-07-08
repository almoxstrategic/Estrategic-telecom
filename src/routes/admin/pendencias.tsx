import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ClipboardList, MessageCircle, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import {
  ChartContainer,
  type ChartConfig,
} from "@/components/ui/chart";
import { celularToWhatsAppUrl } from "@/lib/auth-identificacao";
import {
  fetchEngajamentoEvidencias,
  fetchHistoricoLancamentos,
} from "@/lib/evidencias-service";
import {
  fetchPendenciasEvidencias,
  incrementNumeroCobrancas,
} from "@/lib/logistica-service";
import type { EngajamentoTecnico, HistoricoLancamento, PendenciaEvidencia } from "@/lib/logistica-types";
import {
  filtrarWosParaIncrementoCobranca,
  filtrarWosPendentesDoTecnico,
  obterDataHojeIso,
} from "@/lib/pendencias-cobranca";
import { formatQuantidade } from "@/lib/parse-locale-number";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/pendencias")({
  head: () => ({
    meta: [
      { title: "Pendências — Estrategic Field" },
      { name: "description", content: "WOs atrasadas para auditoria de evidência." },
    ],
  }),
  component: PendenciasPage,
});

const ENGAJAMENTO_CHART_CONFIG = {
  proprias: { label: "WOs Próprias", color: "#10b981" },
  via_admin: { label: "Via Admin", color: "#f97316" },
} satisfies ChartConfig;

type AutonomiaSortKey =
  | "total_desc"
  | "total_asc"
  | "pct_evidenciada_desc"
  | "pct_evidenciada_asc"
  | "pct_nao_evidenciada_desc"
  | "pct_nao_evidenciada_asc"
  | "cobrancas_desc"
  | "cobrancas_asc";

type AutonomiaDetalheRow = {
  tecnico_id: string;
  nome_tecnico: string;
  total: number;
  evidenciadas: number;
  nao_evidenciadas: number;
  pct_evidenciada: number;
  pct_nao_evidenciada: number;
  total_cobrancas: number;
};

function formatPercentual(value: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((value / total) * 100).toFixed(1)}%`;
}

function formatDataHora(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function primeiroNome(nome: string): string {
  const partes = nome.trim().split(/\s+/);
  return partes[0] ?? nome;
}

function normalizarIdTecnico(id: string): string {
  return id.trim().toUpperCase();
}

function PendenciasPage() {
  const [rows, setRows] = useState<PendenciaEvidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [enviandoCobranca, setEnviandoCobranca] = useState<string | null>(null);

  const [engajamento, setEngajamento] = useState<EngajamentoTecnico[]>([]);
  const [loadingEngajamento, setLoadingEngajamento] = useState(true);
  const [engajamentoError, setEngajamentoError] = useState<string | null>(null);

  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historico, setHistorico] = useState<HistoricoLancamento[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");

  const [detalheOpen, setDetalheOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [sortConfig, setSortConfig] = useState<AutonomiaSortKey>("pct_evidenciada_desc");

  useEffect(() => {
    void (async () => {
      try {
        setRows(await fetchPendenciasEvidencias());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    void (async () => {
      try {
        setEngajamento(await fetchEngajamentoEvidencias());
      } catch (err) {
        setEngajamentoError((err as Error).message);
      } finally {
        setLoadingEngajamento(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!historicoOpen) return;

    void (async () => {
      setLoadingHistorico(true);
      try {
        setHistorico(await fetchHistoricoLancamentos());
      } catch {
        setHistorico([]);
      } finally {
        setLoadingHistorico(false);
      }
    })();
  }, [historicoOpen]);

  const historicoFiltrado = useMemo(() => {
    const termo = buscaHistorico.trim().toLowerCase();
    if (!termo) return historico;
    return historico.filter(
      (item) =>
        item.wo.toLowerCase().includes(termo) ||
        item.nome_tecnico.toLowerCase().includes(termo),
    );
  }, [historico, buscaHistorico]);

  const engajamentoChart = useMemo(
    () =>
      engajamento.map((item) => ({
        label: primeiroNome(item.nome_tecnico),
        nome_completo: item.nome_tecnico,
        proprias: item.proprias,
        via_admin: item.via_admin,
        total: item.proprias + item.via_admin,
      })),
    [engajamento],
  );

  const engajamentoChartMinWidth = Math.max(engajamentoChart.length * 72, 800);

  const cobrancasPorTecnico = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of rows) {
      const key = normalizarIdTecnico(row.id_tecnico);
      map.set(key, (map.get(key) ?? 0) + (row.numero_cobrancas ?? 0));
    }
    return map;
  }, [rows]);

  const autonomiaDetalhes = useMemo<AutonomiaDetalheRow[]>(
    () =>
      engajamento.map((item) => {
        const total = item.proprias + item.via_admin;
        return {
          tecnico_id: item.tecnico_id,
          nome_tecnico: item.nome_tecnico,
          total,
          evidenciadas: item.proprias,
          nao_evidenciadas: item.via_admin,
          pct_evidenciada: total > 0 ? (item.proprias / total) * 100 : 0,
          pct_nao_evidenciada: total > 0 ? (item.via_admin / total) * 100 : 0,
          total_cobrancas: cobrancasPorTecnico.get(normalizarIdTecnico(item.tecnico_id)) ?? 0,
        };
      }),
    [engajamento, cobrancasPorTecnico],
  );

  const autonomiaDetalhesFiltrados = useMemo(() => {
    const termo = searchTerm.trim().toLowerCase();
    let lista = autonomiaDetalhes;
    if (termo) {
      lista = lista.filter((row) => row.nome_tecnico.toLowerCase().includes(termo));
    }

    return [...lista].sort((a, b) => {
      switch (sortConfig) {
        case "total_desc":
          return b.total - a.total;
        case "total_asc":
          return a.total - b.total;
        case "pct_evidenciada_desc":
          return b.pct_evidenciada - a.pct_evidenciada;
        case "pct_evidenciada_asc":
          return a.pct_evidenciada - b.pct_evidenciada;
        case "pct_nao_evidenciada_desc":
          return b.pct_nao_evidenciada - a.pct_nao_evidenciada;
        case "pct_nao_evidenciada_asc":
          return a.pct_nao_evidenciada - b.pct_nao_evidenciada;
        case "cobrancas_desc":
          return b.total_cobrancas - a.total_cobrancas;
        case "cobrancas_asc":
          return a.total_cobrancas - b.total_cobrancas;
        default:
          return 0;
      }
    });
  }, [autonomiaDetalhes, searchTerm, sortConfig]);

  const abrirHistorico = () => {
    setBuscaHistorico("");
    setHistoricoOpen(true);
  };

  const abrirDetalheTecnicos = () => {
    setSearchTerm("");
    setSortConfig("pct_evidenciada_desc");
    setDetalheOpen(true);
  };

  const alternarOrdenacaoEvidenciada = () => {
    setSortConfig((prev) =>
      prev === "pct_evidenciada_desc" ? "pct_evidenciada_asc" : "pct_evidenciada_desc",
    );
  };

  const alternarOrdenacaoTotal = () => {
    setSortConfig((prev) => (prev === "total_desc" ? "total_asc" : "total_desc"));
  };

  const alternarOrdenacaoNaoEvidenciada = () => {
    setSortConfig((prev) =>
      prev === "pct_nao_evidenciada_desc" ? "pct_nao_evidenciada_asc" : "pct_nao_evidenciada_desc",
    );
  };

  const alternarOrdenacaoCobrancas = () => {
    setSortConfig((prev) =>
      prev === "cobrancas_desc" ? "cobrancas_asc" : "cobrancas_desc",
    );
  };

  const enviarCobrancaWhatsApp = useCallback(
    async (row: PendenciaEvidencia) => {
      if (row.tem_evidencia) return;

      const pendentes = filtrarWosPendentesDoTecnico(rows, row.id_tecnico);
      if (pendentes.length === 0) {
        toast.error("Nenhuma WO pendente para este técnico.");
        return;
      }

      const nomeDoTecnico = row.nome_tecnico.trim().split(/\s+/)[0] ?? row.nome_tecnico;
      const listaDeWOsFormatada = pendentes
        .map((item) => `- ${item.work_order_id}`)
        .join("\n");

      const mensagem = `Olá, *${nomeDoTecnico}*. Tudo bem? 
Verificamos que existem evidências pendentes em seu nome. Poderia nos enviar as fotos dos materiais utilizados para regularizarmos a baixa no sistema?

*WOs Pendentes:*
${listaDeWOsFormatada}

\u26A0\uFE0F *Lembrete:* É necessário evidenciar os seguintes itens com metragem acima de:
- *Cabo Coaxial Branco:* acima de 18 Metros
- *Cabo Coaxial Preto:* acima de 35 Metros
- *Cabo Drop Low:* acima de 78 Metros`;

      const linkWhatsApp = celularToWhatsAppUrl(row.celular, mensagem);
      if (!linkWhatsApp) {
        toast.error("Celular inválido para envio via WhatsApp.");
        return;
      }

      const dataHoje = obterDataHojeIso();
      const pendentesParaIncrementar = filtrarWosParaIncrementoCobranca(pendentes, dataHoje);
      const workOrderIdsParaIncrementar = pendentesParaIncrementar.map(
        (item) => item.work_order_id,
      );
      setEnviandoCobranca(row.id_tecnico);

      try {
        let incrementadas = 0;
        if (workOrderIdsParaIncrementar.length > 0) {
          incrementadas = await incrementNumeroCobrancas(workOrderIdsParaIncrementar);
          const idsIncrementados = new Set(workOrderIdsParaIncrementar);

          setRows((prev) =>
            prev.map((item) =>
              idsIncrementados.has(item.work_order_id)
                ? {
                    ...item,
                    numero_cobrancas: (item.numero_cobrancas ?? 0) + 1,
                    ultima_data_cobranca: dataHoje,
                  }
                : item,
            ),
          );
        }

        window.open(linkWhatsApp, "_blank");

        if (incrementadas > 0) {
          toast.success(`Cobrança registrada para ${incrementadas} WOs!`);
        }
      } catch (err) {
        toast.error((err as Error).message || "Não foi possível registrar a cobrança.");
      } finally {
        setEnviandoCobranca(null);
      }
    },
    [rows],
  );

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Pendências de Evidência
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              WOs com SLA negativo (status 3) para auditar se o gargalo é do técnico ou da
              operadora.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={abrirHistorico}
            >
              <ClipboardList className="h-4 w-4" />
              Ver Histórico de Lançamentos
            </Button>
            <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
              ← Voltar ao painel
            </Link>
          </div>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando pendências...</p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma WO em risco no momento. Importe o arquivo de cabeçalho para atualizar a lista.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status da Evidência</TableHead>
                  <TableHead className="text-right">Nº Cobranças</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const temCelular = Boolean(celularToWhatsAppUrl(row.celular));
                  const loginBusca = row.login_tecnico || row.id_tecnico;
                  const numeroCobrancas = row.numero_cobrancas ?? 0;
                  const temPendentes =
                    filtrarWosPendentesDoTecnico(rows, row.id_tecnico).length > 0;
                  const enviando = enviandoCobranca === row.id_tecnico;
                  const evidenciado = row.tem_evidencia;

                  return (
                    <TableRow key={row.work_order_id}>
                      <TableCell className="font-mono font-semibold">
                        {row.tem_evidencia ? (
                          <Link
                            to="/todos"
                            search={{ wo: row.work_order_id }}
                            className="text-primary hover:underline"
                          >
                            {row.work_order_id}
                          </Link>
                        ) : (
                          row.work_order_id
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{row.id_tecnico}</TableCell>
                      <TableCell>
                        <Link
                          to="/todos"
                          search={{ login: loginBusca }}
                          className="font-semibold text-foreground hover:text-muted-foreground hover:underline"
                        >
                          {row.nome_tecnico}
                        </Link>
                      </TableCell>
                      <TableCell className="font-bold text-destructive">
                        {row.sla} dias
                      </TableCell>
                      <TableCell>
                        {evidenciado ? (
                          <span
                            className="inline-flex cursor-not-allowed items-center gap-1 text-sm font-semibold text-muted-foreground opacity-50 grayscale"
                            aria-disabled="true"
                          >
                            <MessageCircle className="h-4 w-4" />
                            WhatsApp
                          </span>
                        ) : !temCelular ? (
                          <span
                            className="inline-flex cursor-not-allowed items-center gap-1 text-sm font-semibold text-muted-foreground opacity-50"
                            title="Cadastre o celular do técnico no painel de equipe"
                          >
                            Sem Número
                          </span>
                        ) : temPendentes ? (
                          <button
                            type="button"
                            disabled={enviando}
                            onClick={() => void enviarCobrancaWhatsApp(row)}
                            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            <MessageCircle className="h-4 w-4" />
                            {enviando ? "Enviando..." : "WhatsApp"}
                          </button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.tem_evidencia ? (
                          <Badge className="border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90">
                            Evidenciado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Pendente</Badge>
                        )}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          numeroCobrancas > 0 ? "text-orange-600 dark:text-orange-400" : ""
                        }`}
                      >
                        {numeroCobrancas}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <section className="mt-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="flex items-center gap-2 text-lg font-bold">
                <Users className="h-5 w-5 text-primary" />
                Autonomia de Evidências
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Ranking de envios próprios (positivo) versus envios feitos pelo admin (dependência).
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-2"
              onClick={abrirDetalheTecnicos}
              disabled={engajamento.length === 0}
            >
              <Users className="h-4 w-4" />
              Visualizar Técnicos
            </Button>
          </div>

          {loadingEngajamento ? (
            <p className="text-sm text-muted-foreground">Carregando ranking de engajamento...</p>
          ) : engajamentoError ? (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {engajamentoError}
            </p>
          ) : engajamento.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nenhuma evidência registrada nos últimos 30 dias.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <ChartContainer
                config={ENGAJAMENTO_CHART_CONFIG}
                className="h-80 w-full"
                style={{ minWidth: engajamentoChartMinWidth }}
              >
                <BarChart data={engajamentoChart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => formatQuantidade(v)} allowDecimals={false} />
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.[0]) return null;
                      const item = payload[0].payload as {
                        nome_completo: string;
                        proprias: number;
                        via_admin: number;
                        total: number;
                      };
                      return (
                        <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                          <p className="font-semibold">{item.nome_completo}</p>
                          <p className="text-emerald-600">
                            WOs próprias: {formatQuantidade(item.proprias)}
                          </p>
                          <p className="text-orange-600">
                            Via admin: {formatQuantidade(item.via_admin)}
                          </p>
                          <p className="text-muted-foreground">
                            Total: {formatQuantidade(item.total)}
                          </p>
                        </div>
                      );
                    }}
                  />
                  <Bar
                    dataKey="proprias"
                    stackId="a"
                    fill="#10b981"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="via_admin"
                    stackId="a"
                    fill="#f97316"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ChartContainer>
            </div>
          )}
        </section>
      </main>
      <Dialog
        open={historicoOpen}
        onOpenChange={(open) => {
          setHistoricoOpen(open);
          if (!open) setBuscaHistorico("");
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-4xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Histórico de Lançamentos</DialogTitle>
          </DialogHeader>

          <div className="relative mb-4">
            <Input
              type="search"
              placeholder="Buscar por WO ou nome do técnico..."
              value={buscaHistorico}
              onChange={(e) => setBuscaHistorico(e.target.value)}
            />
          </div>

          {loadingHistorico ? (
            <p className="text-sm text-muted-foreground">Carregando histórico...</p>
          ) : historicoFiltrado.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {historico.length === 0
                ? "Nenhum lançamento registrado nos últimos 30 dias."
                : "Nenhum lançamento encontrado para a busca."}
            </p>
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="whitespace-nowrap">Data/Hora</TableHead>
                    <TableHead>WO</TableHead>
                    <TableHead>Técnico</TableHead>
                    <TableHead>Ação</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {historicoFiltrado.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="whitespace-nowrap text-sm">
                        {formatDataHora(item.data_registro)}
                      </TableCell>
                      <TableCell className="font-mono text-sm font-semibold">{item.wo}</TableCell>
                      <TableCell className="text-sm">{item.nome_tecnico}</TableCell>
                      <TableCell className="text-sm">
                        {item.enviado_por_admin ? (
                          <span className="font-semibold text-destructive">
                            ADMIN: enviou evidência para {item.nome_tecnico}
                          </span>
                        ) : (
                          <span className="font-medium text-emerald-600 dark:text-emerald-400">
                            {item.nome_tecnico}: evidenciou a WO
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={detalheOpen}
        onOpenChange={(open) => {
          setDetalheOpen(open);
          if (!open) {
            setSearchTerm("");
            setSortConfig("pct_evidenciada_desc");
          }
        }}
      >
        <DialogContent className="max-h-[85vh] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhamento de Autonomia por Técnico</DialogTitle>
          </DialogHeader>

          <div className="mb-4">
            <Input
              type="search"
              placeholder="Buscar técnico pelo nome..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>

          {autonomiaDetalhesFiltrados.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {autonomiaDetalhes.length === 0
                ? "Nenhuma evidência registrada nos últimos 30 dias."
                : "Nenhum técnico encontrado para a busca."}
            </p>
          ) : (
            <div className="max-h-[55vh] overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Técnico</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={alternarOrdenacaoTotal}
                        className="inline-flex w-full cursor-pointer select-none items-center justify-end gap-1 hover:text-gray-600"
                      >
                        Total WOs
                        {sortConfig.startsWith("total_") &&
                          (sortConfig === "total_desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ))}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">Evidenciadas</TableHead>
                    <TableHead className="text-right">Não Evidenciadas</TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={alternarOrdenacaoEvidenciada}
                        className="inline-flex w-full cursor-pointer select-none items-center justify-end gap-1 hover:text-gray-600"
                      >
                        % Evidenciada
                        {sortConfig.startsWith("pct_evidenciada") &&
                          (sortConfig === "pct_evidenciada_desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ))}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={alternarOrdenacaoNaoEvidenciada}
                        className="inline-flex w-full cursor-pointer select-none items-center justify-end gap-1 hover:text-gray-600"
                      >
                        % Não Evidenciada
                        {sortConfig.startsWith("pct_nao_evidenciada") &&
                          (sortConfig === "pct_nao_evidenciada_desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ))}
                      </button>
                    </TableHead>
                    <TableHead className="text-right">
                      <button
                        type="button"
                        onClick={alternarOrdenacaoCobrancas}
                        className="inline-flex w-full cursor-pointer select-none items-center justify-end gap-1 hover:text-gray-600"
                      >
                        Nº de Cobranças
                        {sortConfig.startsWith("cobrancas_") &&
                          (sortConfig === "cobrancas_desc" ? (
                            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
                          ) : (
                            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
                          ))}
                      </button>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {autonomiaDetalhesFiltrados.map((row) => (
                    <TableRow key={row.tecnico_id}>
                      <TableCell className="font-medium">{row.nome_tecnico}</TableCell>
                      <TableCell className="text-right font-semibold">
                        {formatQuantidade(row.total)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatQuantidade(row.evidenciadas)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-orange-600 dark:text-orange-400">
                        {formatQuantidade(row.nao_evidenciadas)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-emerald-600 dark:text-emerald-400">
                        {formatPercentual(row.evidenciadas, row.total)}
                      </TableCell>
                      <TableCell className="text-right font-semibold text-red-600">
                        {formatPercentual(row.nao_evidenciadas, row.total)}
                      </TableCell>
                      <TableCell
                        className={`text-right font-semibold ${
                          row.total_cobrancas > 0
                            ? "text-orange-600 dark:text-orange-400"
                            : ""
                        }`}
                      >
                        {formatQuantidade(row.total_cobrancas)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
