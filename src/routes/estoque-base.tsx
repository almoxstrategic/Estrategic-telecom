import { createFileRoute, Link } from "@tanstack/react-router";
import { Warehouse } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/estoque-base")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Estoque Base — Estrategic Field" },
      { name: "description", content: "Módulo de Estoque Base em desenvolvimento." },
    ],
  }),
  component: EstoqueBasePage,
});

function EstoqueBasePage() {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Warehouse className="h-6 w-6 text-primary" />
              Estoque Base
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">(Em desenvolvimento)</p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>
        <section className="flex min-h-[280px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-border bg-card/50 px-6 py-16 text-center">
          <div className="grid h-14 w-14 place-items-center rounded-full bg-muted text-muted-foreground">
            <Warehouse className="h-7 w-7" />
          </div>
          <p className="text-sm text-muted-foreground">Módulo de Estoque Base em desenvolvimento.</p>
        </section>
      </main>
    </div>
  );
}
