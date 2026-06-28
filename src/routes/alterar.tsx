import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { KeyRound } from "lucide-react";
import { toast } from "sonner";
import { requireAdmin } from "@/lib/auth-guards";
import { useApp } from "@/lib/app-store";
import { resetUserPassword } from "@/lib/admin-actions.server";
import { PasswordInput } from "@/components/PasswordInput";
import { isValidLogin } from "@/lib/auth-identificacao";

type AlterarSearch = {
  login?: string;
  nome?: string;
};

export const Route = createFileRoute("/alterar")({
  beforeLoad: () => requireAdmin(),
  validateSearch: (search: Record<string, unknown>): AlterarSearch => ({
    login: typeof search.login === "string" ? search.login : undefined,
    nome: typeof search.nome === "string" ? search.nome : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Alterar Senha — Estrategic Field" },
      { name: "description", content: "Recuperação de senhas (admin)." },
    ],
  }),
  component: AlterarPage,
});

function AlterarPage() {
  const { login: loginParam, nome: nomeParam } = Route.useSearch();
  const { getAccessToken } = useApp();
  const navigate = useNavigate();
  const [login, setLogin] = useState(loginParam ?? "");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (loginParam) setLogin(loginParam);
  }, [loginParam]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== senha2) {
      toast.error("As senhas não coincidem.");
      return;
    }

    if (!isValidLogin(login)) {
      toast.error("Login inválido. Use 3–30 caracteres (letras, números, . _ -).");
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }

    setLoading(true);
    try {
      await resetUserPassword({
        data: {
          accessToken,
          login: login.trim(),
          password: senha,
        },
      });
      toast.success("Senha atualizada com sucesso!");
      navigate({ to: nomeParam ? "/tecnicos" : "/admin" });
    } catch (err) {
      toast.error((err as Error).message || "Erro ao alterar senha.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="flex min-h-screen flex-col bg-surface px-6 pb-10 pt-16">
      <div className="mx-auto w-full max-w-sm">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-16 w-16 place-items-center rounded-2xl bg-primary text-3xl font-black text-primary-foreground shadow-lg">
            E
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tight">Alterar Senha</h1>
            <p className="text-sm text-muted-foreground">
              {nomeParam ? `Técnico: ${nomeParam}` : "Recuperação de acesso (admin)"}
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-10 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Login do usuário</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
              placeholder="Ex: joao.silva"
              readOnly={!!loginParam}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 read-only:cursor-default read-only:bg-muted/40"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Nova Senha</label>
            <PasswordInput value={senha} onChange={setSenha} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Repetir Nova Senha</label>
            <PasswordInput value={senha2} onChange={setSenha2} required />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60"
          >
            <KeyRound className="h-5 w-5" />
            {loading ? "Atualizando..." : "Atualizar Senha"}
          </button>

          <p className="pt-2 text-center text-sm text-muted-foreground">
            <Link
              to={nomeParam ? "/tecnicos" : "/admin"}
              className="font-semibold text-primary hover:underline"
            >
              {nomeParam ? "Voltar à Gestão de Equipe" : "Voltar ao painel"}
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
