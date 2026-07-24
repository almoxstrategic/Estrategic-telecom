import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Database,
  FileUp,
  Monitor,
  Package,
  Send,
  TrendingUp,
  Users,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Admin — Estrategic Field" },
      { name: "description", content: "Painel do administrador Estrategic." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  const [activeTab, setActiveTab] = useState<"miscelanea" | "terminais">("miscelanea");

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <section className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">Painel Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha um módulo para gerenciar a operação.
          </p>

          <div className="mt-4 flex gap-1 border-b border-border">
            <button
              type="button"
              onClick={() => setActiveTab("miscelanea")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "miscelanea"
                  ? "border-b-2 border-primary text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Miscelânea
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("terminais")}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "terminais"
                  ? "border-b-2 border-primary text-foreground"
                  : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              Terminais
            </button>
          </div>
        </section>

        {activeTab === "miscelanea" ? (
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Link to="/todos" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-primary/20 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                  <Database className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Todas as Metragens</div>
                  <div className="text-xs text-muted-foreground">
                    Auditar registros de todos os técnicos
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/tecnicos" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Users className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Gestão de Equipe</div>
                  <div className="text-xs text-muted-foreground">
                    Listar e excluir técnicos do sistema
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/admin/kpis" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <BarChart3 className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">KPI&apos;s</div>
                  <div className="text-xs text-muted-foreground">
                    Materiais e técnicos com maior volume de baixa
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/admin/pendencias" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-destructive/30 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-destructive/10 text-destructive">
                  <AlertTriangle className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Pendências</div>
                  <div className="text-xs text-muted-foreground">
                    WOs atrasadas sem evidência enviada
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/estoque-fisico-btp" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Package className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Estoque Físico X BTP</div>
                  <div className="text-xs text-muted-foreground">(Esse modulo é um protótipo)</div>
                </div>
              </div>
            </Link>

            <Link to="/previsao-reserva" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <CalendarClock className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Previsão de Reserva</div>
                  <div className="text-xs text-muted-foreground">(Esse modulo é um protótipo)</div>
                </div>
              </div>
            </Link>

            <Link to="/media-baixa-tecnico" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <TrendingUp className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Média de Baixa por Técnico</div>
                  <div className="text-xs text-muted-foreground">(Esse modulo é um protótipo)</div>
                </div>
              </div>
            </Link>

            <Link to="/admin/importacao" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileUp className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Importação</div>
                  <div className="text-xs text-muted-foreground">
                    Cabeçalho WO e consolidado de consumo
                  </div>
                </div>
              </div>
            </Link>

            <Link to="/admin/enviar-evidencia" className="block">
              <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Send className="h-6 w-6" />
                </div>
                <div>
                  <div className="font-bold text-foreground">Envio pelo Técnico</div>
                  <div className="text-xs text-muted-foreground">
                    Registrar evidência em nome de um técnico
                  </div>
                </div>
              </div>
            </Link>
          </section>
        ) : (
          <section className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
              <Monitor className="h-7 w-7" />
            </div>
            <p className="text-sm text-muted-foreground">
              Módulos de Terminais em desenvolvimento.
            </p>
          </section>
        )}
      </main>
    </div>
  );
}
