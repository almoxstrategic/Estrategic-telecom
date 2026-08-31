import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { requireTeamManager } from "@/lib/auth-guards";
import { useApp } from "@/lib/app-store";
import { createUserAccount } from "@/lib/admin-actions.server";
import { PasswordInput } from "@/components/PasswordInput";
import {
  formatCelularMask,
  isValidCelular,
  isValidLogin,
  isValidMatricula,
  normalizeMatricula,
} from "@/lib/auth-identificacao";
import {
  ROLE_SELECT_OPTIONS,
  isSupervisorTransmissaoTeamScope,
  matriculaCadastroPolicy,
  roleFromPoderesSelect,
} from "@/lib/roles";
import type { UserRole } from "@/lib/types";

export const Route = createFileRoute("/cadastro")({
  beforeLoad: () => requireTeamManager(),
  head: () => ({
    meta: [
      { title: "Cadastro — Estrategic Field" },
      { name: "description", content: "Cadastro de usuários da Estrategic." },
    ],
  }),
  component: CadastroPage,
});

function CadastroPage() {
  const { getAccessToken, user } = useApp();
  const navigate = useNavigate();
  const escopoTransmissao = isSupervisorTransmissaoTeamScope(user?.role);
  const opcoesPoderes = escopoTransmissao
    ? ROLE_SELECT_OPTIONS.filter((opt) => opt.value === "TRANSMISSAO")
    : ROLE_SELECT_OPTIONS;
  const [nome, setNome] = useState("");
  const [identificacao, setIdentificacao] = useState("");
  const [celular, setCelular] = useState("");
  const [poderes, setPoderes] = useState<string>(
    escopoTransmissao ? "TRANSMISSAO" : "TECNICO",
  );
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [senha2, setSenha2] = useState("");
  const [loading, setLoading] = useState(false);

  const roleSelecionado = useMemo(
    (): UserRole => roleFromPoderesSelect(poderes),
    [poderes],
  );
  const matriculaPolicy = matriculaCadastroPolicy(roleSelecionado);
  const exibeMatricula = matriculaPolicy !== "none";
  const matriculaObrigatoria = matriculaPolicy === "required";

  const handlePoderesChange = (value: string) => {
    setPoderes(value);
    const nextRole = roleFromPoderesSelect(value);
    if (matriculaCadastroPolicy(nextRole) === "none") {
      setIdentificacao("");
    }
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (senha !== senha2) {
      toast.error("As senhas não coincidem.");
      return;
    }

    const role = roleSelecionado;
    if (escopoTransmissao && role !== "transmissao") {
      toast.error("Supervisor de Transmissão só pode cadastrar Técnicos de Transmissão.");
      return;
    }

    const matriculaNormalizada =
      matriculaPolicy === "none"
        ? ""
        : identificacao.trim()
          ? normalizeMatricula(identificacao)
          : "";

    if (matriculaPolicy === "required") {
      if (!matriculaNormalizada) {
        toast.error("Matrícula é obrigatória para Técnico.");
        return;
      }
      if (!isValidMatricula(matriculaNormalizada)) {
        toast.error("Matrícula inválida. Use 2–20 caracteres alfanuméricos (ex: Z628337).");
        return;
      }
    } else if (matriculaPolicy === "optional") {
      if (matriculaNormalizada && !isValidMatricula(matriculaNormalizada)) {
        toast.error("Matrícula inválida. Use 2–20 caracteres alfanuméricos (ex: Z628337).");
        return;
      }
    }

    if (!isValidCelular(celular)) {
      toast.error("Celular inválido. Use o formato (XX) X XXXX-XXXX.");
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
          identificacao: matriculaNormalizada,
          celular: celular.replace(/\D/g, ""),
          login: login.trim(),
          password: senha,
          nome: nome.trim(),
          role,
        },
      });
      toast.success("Usuário cadastrado com sucesso!");
      navigate({ to: "/tecnicos" });
    } catch (err) {
      toast.error((err as Error).message || "Erro ao cadastrar usuário.");
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
            <h1 className="text-2xl font-black tracking-tight">Cadastrar Usuário</h1>
            <p className="text-sm text-muted-foreground">
              Defina os poderes de acesso do novo usuário
            </p>
          </div>
        </div>

        <form
          onSubmit={onSubmit}
          className="mt-10 space-y-4 rounded-2xl border border-border bg-card p-6 shadow-sm"
        >
          <div>
            <label htmlFor="cadastro-poderes" className="mb-1.5 block text-sm font-semibold">
              Poderes
            </label>
            <select
              id="cadastro-poderes"
              value={poderes}
              onChange={(e) => handlePoderesChange(e.target.value)}
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
              disabled={escopoTransmissao}
            >
              {opcoesPoderes.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
          {exibeMatricula ? (
            <div>
              <label htmlFor="cadastro-matricula" className="mb-1.5 block text-sm font-semibold">
                Identificação (Matrícula)
                {matriculaObrigatoria ? (
                  <span className="ml-0.5 text-destructive" aria-hidden="true">
                    *
                  </span>
                ) : (
                  <span className="ml-1 font-normal text-muted-foreground">(opcional)</span>
                )}
              </label>
              <input
                id="cadastro-matricula"
                type="text"
                autoCapitalize="characters"
                value={identificacao}
                onChange={(e) => setIdentificacao(normalizeMatricula(e.target.value))}
                placeholder="Ex: Z628337"
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base uppercase outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required={matriculaObrigatoria}
                aria-required={matriculaObrigatoria}
              />
              <p className="mt-1 text-xs text-muted-foreground">
                {matriculaObrigatoria
                  ? "Código alfanumérico do colaborador no sistema legado."
                  : "Opcional para Técnico Transmissão. Deixe em branco se não houver matrícula TOA."}
              </p>
            </div>
          ) : null}
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Celular</label>
            <input
              type="tel"
              inputMode="tel"
              value={celular}
              onChange={(e) => setCelular(formatCelularMask(e.target.value))}
              placeholder="(11) 9 8765-4321"
              className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
              required
            />
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
              Usado para entrar no sistema.
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
            {loading ? "Cadastrando..." : "Cadastrar Usuário"}
          </button>

          <p className="pt-2 text-center text-sm text-muted-foreground">
            <Link to="/tecnicos" className="font-semibold text-primary hover:underline">
              Voltar à Gestão de Equipe
            </Link>
          </p>
        </form>
      </div>
    </main>
  );
}
