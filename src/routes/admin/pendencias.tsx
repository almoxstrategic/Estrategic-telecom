import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ClipboardList, MessageCircle, Users } from "lucide-react";
import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from "recharts";
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
import { fetchPendenciasEvidencias } from "@/lib/logistica-service";
import type { EngajamentoTecnico, HistoricoLancamento, PendenciaEvidencia } from "@/lib/logistica-types";
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
function PendenciasPage() {
  const [rows, setRows] = useState<PendenciaEvidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [engajamento, setEngajamento] = useState<EngajamentoTecnico[]>([]);
  const [loadingEngajamento, setLoadingEngajamento] = useState(true);
  const [engajamentoError, setEngajamentoError] = useState<string | null>(null);

  const [historicoOpen, setHistoricoOpen] = useState(false);
  const [historico, setHistorico] = useState<HistoricoLancamento[]>([]);
  const [loadingHistorico, setLoadingHistorico] = useState(false);
  const [buscaHistorico, setBuscaHistorico] = useState("");

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
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
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
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const wa = celularToWhatsAppUrl(row.celular);
                  const loginBusca = row.login_tecnico || row.id_tecnico;

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
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                          >
                            <MessageCircle className="h-4 w-4" />
                            WhatsApp
                          </a>
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
              onClick={() => {
                setBuscaHistorico("");
                setHistoricoOpen(true);
              }}
            >
              <ClipboardList className="h-4 w-4" />
              Ver Histórico de Lançamentos
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
    </div>
  );
}
