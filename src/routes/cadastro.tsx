import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { requireAdmin } from "@/lib/auth-guards";
import { useApp } from "@/lib/app-store";
import { createUserAccount } from "@/lib/admin-actions.server";
import { PasswordInput } from "@/components/PasswordInput";
import { isValidLogin, isValidMatricula } from "@/lib/auth-identificacao";

export const Route = createFileRoute("/cadastro")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Cadastro — Estrategic Field" },
      { name: "description", content: "Cadastro de técnicos da Estrategic." },
    ],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  const { getAccessToken } = useApp();
  const navigate = useNavigate();
  const [nome, setNome] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== senha2) {
      toast.error("As senhas não coincidem.");
      return;
    }

    if (!isValidMatricula(identificacao)) {
      toast.error("Matrícula inválida. Use apenas números (3 a 20 dígitos).");
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
      await createUserAccount({
        data: {
          accessToken,
          identificacao: identificacao.trim(),
          login: login.trim(),
          password: senha,
          nome: nome.trim(),
          role: "tecnico",
        },
      });
      toast.success("Técnico cadastrado com sucesso!");
      navigate({ to: "/admin" });
    } catch (err) {
      toast.error((err as Error).message || "Erro ao cadastrar técnico.");
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
            <h1 className="text-2xl font-black tracking-tight">Cadastrar Técnico</h1>
            <p className="text-sm text-muted-foreground">Acesso restrito ao administrador</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-10 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Nome</label>
            <input
              type="text"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Nome Completo"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Identificação (Matrícula)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={identificacao}
              onChange={(e) => setIdentificacao(e.target.value.replace(/\D/g, ""))}
              placeholder="Ex: 458921"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Número de matrícula do técnico — apenas para controle interno.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Login</label>
            <input
              type="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={login}
              onChange={(e) => setLogin(e.target.value.toLowerCase().replace(/[^a-z0-9._-]/g, ""))}
              placeholder="Ex: joao.silva"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Usado pelo técnico para entrar no sistema.
            </p>
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Senha</label>
            <PasswordInput value={senha} onChange={setSenha} required />
          </div>
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Repetir senha</label>
            <PasswordInput value={senha2} onChange={setSenha2} required />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60"
          >
            <UserPlus className="h-5 w-5" />
            {loading ? "Cadastrando..." : "Cadastrar Técnico"}
          </button>

          <p className="pt-2 text-center text-sm text-muted-foreground">
            <Link to="/admin" className="font-semibold text-primary hover:underline">
              Voltar ao painel
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
