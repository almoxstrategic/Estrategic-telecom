import { createFileRoute, Link } from "@tanstack/react-router";
import { Ruler } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { MeusRelatoriosTransmissao } from "@/components/MeusRelatoriosTransmissao";
import { useApp } from "@/lib/app-store";
import { requireHomeEntry } from "@/lib/auth-guards";
import { isTecnicoTransmissaoRole } from "@/lib/roles";

export const Route = createFileRoute("/")({
  beforeLoad: () => requireHomeEntry(),
  head: () => ({
    meta: [
      { title: "Início — Estrategic Field" },
      { name: "description", content: "Dashboard do técnico de campo Estrategic." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const { user } = useApp();
  const isTransmissao = isTecnicoTransmissaoRole(user?.role);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-10 pt-6">
        <section className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">
            {isTransmissao ? "Transmissão" : "Escolha um módulo para iniciar"}
          </h1>
        </section>

        {isTransmissao && user?.id ? (
          <MeusRelatoriosTransmissao tecnicoId={user.id} />
        ) : (
          <Link to="/metragem" className="block">
            <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-primary/20 bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary text-primary-foreground">
                <Ruler className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-foreground">Evidência de Metragem</div>
                <div className="text-xs text-muted-foreground">
                  Registre foto de início e fim da WO
                </div>
              </div>
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}
