import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { BarChart3, Package, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { fetchKpisConsumo } from "@/lib/logistica-service";
import type { KpisConsumo } from "@/lib/logistica-types";
import { Badge } from "@/components/ui/badge";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
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

function KpisPage() {
  const [kpis, setKpis] = useState<KpisConsumo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setKpis(await fetchKpisConsumo());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const materiaisChart = (kpis?.top_materiais ?? []).map((m) => ({
    label: m.descricao.length > 28 ? `${m.descricao.slice(0, 28)}…` : m.descricao,
    total: m.total,
  }));

  const tecnicosChart = (kpis?.top_tecnicos ?? []).slice(0, 5).map((t) => ({
    label: t.id_tecnico,
    total: t.total,
  }));

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">KPIs de Consumo</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Consolidado de materiais baixados por WO.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando métricas...</p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : (
          <>
            <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Package className="h-4 w-4" />
                  Total de Itens Consumidos
                </div>
                <div className="mt-2 text-3xl font-black text-foreground">
                  {kpis?.total_itens.toLocaleString("pt-BR") ?? 0}
                </div>
              </div>
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <BarChart3 className="h-4 w-4" />
                  Total de WOs Processadas
                </div>
                <div className="mt-2 text-3xl font-black text-foreground">
                  {kpis?.total_wos.toLocaleString("pt-BR") ?? 0}
                </div>
              </div>
            </section>

            <section className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 font-bold">Top 5 Materiais Mais Consumidos</h2>
                {materiaisChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado importado ainda.</p>
                ) : (
                  <ChartContainer
                    config={{ total: { label: "Qtd", color: "hsl(var(--primary))" } }}
                    className="h-64 w-full"
                  >
                    <BarChart data={materiaisChart} layout="vertical" margin={{ left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" hide />
                      <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 11 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={4} />
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
                      <Badge variant="secondary">{m.total.toLocaleString("pt-BR")}</Badge>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="mb-4 flex items-center gap-2 font-bold">
                  <Users className="h-4 w-4" />
                  Top Técnicos por Volume de Baixa
                </h2>
                {tecnicosChart.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum dado importado ainda.</p>
                ) : (
                  <ChartContainer
                    config={{ total: { label: "Qtd", color: "hsl(var(--primary))" } }}
                    className="h-64 w-full"
                  >
                    <BarChart data={tecnicosChart}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                      <YAxis />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="total" fill="var(--color-total)" radius={4} />
                    </BarChart>
                  </ChartContainer>
                )}
                <ul className="mt-4 space-y-2">
                  {(kpis?.top_tecnicos ?? []).map((t) => (
                    <li
                      key={t.id_tecnico}
                      className="flex items-center justify-between gap-2 text-sm"
                    >
                      <span className="font-medium">{t.id_tecnico}</span>
                      <Badge variant="outline">{t.total.toLocaleString("pt-BR")} itens</Badge>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
