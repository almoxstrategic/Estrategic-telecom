import { createFileRoute, Link } from "@tanstack/react-router";
import { Database, KeyRound, UserPlus, Users } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { requireAdmin } from "@/lib/auth-guards";

export const Route = createFileRoute("/admin")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Admin — Estrategic Field" },
      { name: "description", content: "Painel do administrador Estrategic." },
    ],
  }),
  component: AdminHome,
});

function AdminHome() {
  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <section className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">Painel Admin</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Escolha um módulo para gerenciar a operação.
          </p>
        </section>

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

          <Link to="/cadastro" className="block">
            <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <UserPlus className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-foreground">Cadastrar Técnico</div>
                <div className="text-xs text-muted-foreground">
                  Nome, matrícula, login e senha
                </div>
              </div>
            </div>
          </Link>

          <Link to="/alterar" className="block">
            <div className="relative flex h-40 flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <KeyRound className="h-6 w-6" />
              </div>
              <div>
                <div className="font-bold text-foreground">Alterar Senha</div>
                <div className="text-xs text-muted-foreground">
                  Recuperação de acesso para usuários
                </div>
              </div>
            </div>
          </Link>
        </section>
      </main>
    </div>
  );
}
