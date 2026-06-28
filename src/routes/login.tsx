import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useApp } from "@/lib/app-store";
import { requireGuest } from "@/lib/auth-guards";
import { PasswordInput } from "@/components/PasswordInput";
import { toast } from "sonner";
import { LogIn } from "lucide-react";

export const Route = createFileRoute("/login")({
  beforeLoad: () => requireGuest(),
  head: () => ({
    meta: [
      { title: "Entrar — Estrategic Field" },
      { name: "description", content: "Acesso para técnicos de campo da Estrategic." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [loginId, setLoginId] = useState("");
  const [senha, setSenha] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const profile = await login(loginId.trim(), senha);
      navigate({ to: profile.role === "admin" ? "/admin" : "/" });
    } catch (err) {
      toast.error((err as Error).message || "Credenciais inválidas.");
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
            <h1 className="text-2xl font-black tracking-tight">Estrategic</h1>
            <p className="text-sm text-muted-foreground">Portal do Técnico</p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          method="post"
          autoComplete="on"
          className="mt-10 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <label htmlFor="login-username" className="mb-1.5 block text-sm font-semibold">
              Login
            </label>
            <input
              id="login-username"
              name="username"
              type="text"
              autoComplete="username"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              value={loginId}
              onChange={(e) => {
                const v = e.target.value;
                setLoginId(v.includes("@") ? v : v.toLowerCase().replace(/[^a-z0-9._-]/g, ""));
              }}
              placeholder="Ex: joao.silva"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
          </div>
          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-semibold">
              Senha
            </label>
            <PasswordInput
              id="login-password"
              name="password"
              autoComplete="current-password"
              value={senha}
              onChange={setSenha}
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-3.5 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:opacity-60"
          >
            <LogIn className="h-5 w-5" />
            {loading ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          © {new Date().getFullYear()} Estrategic Telecom
        </p>
      </div>
    </main>
  );
}
