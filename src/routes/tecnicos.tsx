import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  Pencil,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { PasswordInput } from "@/components/PasswordInput";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { updateTecnico } from "@/lib/admin-actions.server";
import { useApp } from "@/lib/app-store";
import { requireAdmin } from "@/lib/auth-guards";
import { formatCelularMask, isValidCelular } from "@/lib/auth-identificacao";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { deleteTecnico, fetchTecnicos, type TecnicoProfile } from "@/lib/team-service";

export const Route = createFileRoute("/tecnicos")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Gestão de Equipe — Estrategic Field" },
      { name: "description", content: "Gerencie técnicos da Estrategic." },
    ],
  }),
  component: TecnicosPage,
});

function formatDataCadastro(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function formatCelularExibicao(value: string | null): string {
  if (!value) return "—";
  const masked = formatCelularMask(value);
  return masked || "—";
}

function buildPerfilCopyText(tecnico: TecnicoProfile): string {
  return `Nome: ${tecnico.nome}, Id TOA: ${tecnico.identificacao ?? "—"}, Celular: ${formatCelularExibicao(tecnico.celular)}`;
}

function TecnicosPage() {
  const { getAccessToken } = useApp();
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<TecnicoProfile | null>(null);
  const [profileTarget, setProfileTarget] = useState<TecnicoProfile | null>(null);
  const [editTarget, setEditTarget] = useState<TecnicoProfile | null>(null);
  const [editCelular, setEditCelular] = useState("");
  const [editSenha, setEditSenha] = useState("");
  const [editSenha2, setEditSenha2] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [copyingPerfil, setCopyingPerfil] = useState(false);

  const loadTecnicos = async () => {
    setLoading(true);
    try {
      setTecnicos(await fetchTecnicos());
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar técnicos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTecnicos();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tecnicos;

    return tecnicos.filter((tecnico) => {
      const nome = tecnico.nome.toLowerCase();
      const matricula = (tecnico.identificacao ?? "").toLowerCase();
      return nome.includes(q) || matricula.includes(q);
    });
  }, [tecnicos, query]);

  const handleConfirmDelete = async () => {
    if (!confirmTarget) return;

    setDeletingId(confirmTarget.id);
    try {
      await deleteTecnico(confirmTarget.id);
      toast.success(`Técnico ${confirmTarget.nome} excluído com sucesso.`);
      setConfirmTarget(null);
      await loadTecnicos();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao excluir técnico.");
    } finally {
      setDeletingId(null);
    }
  };

  const abrirPerfil = (tecnico: TecnicoProfile) => {
    setProfileTarget(tecnico);
  };

  const copiarPerfil = async () => {
    if (!profileTarget) return;
    setCopyingPerfil(true);
    try {
      const ok = await copyTextToClipboard(buildPerfilCopyText(profileTarget));
      if (ok) {
        toast.success("Copiado com sucesso!");
      } else {
        toast.error("Não foi possível copiar.");
      }
    } finally {
      setCopyingPerfil(false);
    }
  };

  const abrirEdicao = (tecnico: TecnicoProfile) => {
    setEditTarget(tecnico);
    setEditCelular(formatCelularMask(tecnico.celular ?? ""));
    setEditSenha("");
    setEditSenha2("");
  };

  const fecharEdicao = () => {
    setEditTarget(null);
    setEditCelular("");
    setEditSenha("");
    setEditSenha2("");
  };

  const salvarEdicao = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTarget) return;

    if (editSenha || editSenha2) {
      if (editSenha !== editSenha2) {
        toast.error("As senhas não coincidem.");
        return;
      }
      if (editSenha.length < 6) {
        toast.error("A senha deve ter ao mínimo 6 caracteres.");
        return;
      }
    }

    if (editCelular.trim() && !isValidCelular(editCelular)) {
      toast.error("Celular inválido. Use o formato (XX) X XXXX-XXXX.");
      return;
    }

    const accessToken = getAccessToken();
    if (!accessToken) {
      toast.error("Sessão expirada. Faça login novamente.");
      return;
    }

    setEditLoading(true);
    try {
      await updateTecnico({
        data: {
          accessToken,
          tecnicoId: editTarget.id,
          celular: editCelular,
          password: editSenha || undefined,
        },
      });
      toast.success("Técnico atualizado com sucesso!");
      fecharEdicao();
      await loadTecnicos();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao atualizar técnico.");
    } finally {
      setEditLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-3xl px-5 pb-10 pt-4">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Gestão de Equipe</h1>
            <p className="text-sm text-muted-foreground">
              Técnicos cadastrados no sistema. A exclusão remove acesso, histórico e fotos.
            </p>
          </div>
          <Link
            to="/cadastro"
            className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
          >
            <UserPlus className="h-4 w-4" />
            Adicionar colaborador
          </Link>
        </header>

        {!loading && tecnicos.length > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nome ou matrícula..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando técnicos...</p>
        ) : tecnicos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum técnico cadastrado.</p>
            <Link
              to="/cadastro"
              className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
            >
              Cadastrar técnico
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <p className="text-sm text-muted-foreground">
              Nenhum técnico encontrado para &quot;{query}&quot;.
            </p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((tecnico) => (
              <li
                key={tecnico.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{tecnico.nome}</div>
                  <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                    <span>Matrícula: {tecnico.identificacao ?? "—"}</span>
                    <span>Login: {tecnico.login ?? "—"}</span>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    onClick={() => abrirPerfil(tecnico)}
                    aria-label={`Perfil de ${tecnico.nome}`}
                    title="Perfil"
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-lg px-2 text-primary transition hover:bg-primary/10 sm:px-3"
                  >
                    <User className="h-5 w-5" />
                    <span className="hidden text-xs font-semibold sm:inline">Perfil</span>
                  </button>

                  {tecnico.login ? (
                    <Link
                      to="/todos"
                      search={{ login: tecnico.login }}
                      aria-label={`Ver WOs de ${tecnico.nome}`}
                      title="Ver WOs"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10"
                    >
                      <ClipboardList className="h-5 w-5" />
                    </Link>
                  ) : (
                    <span
                      title="Login não cadastrado"
                      className="inline-flex h-10 w-10 cursor-not-allowed items-center justify-center rounded-lg text-muted-foreground/40"
                    >
                      <ClipboardList className="h-5 w-5" />
                    </span>
                  )}

                  <button
                    type="button"
                    onClick={() => abrirEdicao(tecnico)}
                    aria-label={`Editar ${tecnico.nome}`}
                    title="Editar"
                    className="inline-flex h-10 items-center justify-center gap-1 rounded-lg px-2 text-primary transition hover:bg-primary/10 sm:px-3"
                  >
                    <Pencil className="h-5 w-5" />
                    <span className="hidden text-xs font-semibold sm:inline">Editar</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConfirmTarget(tecnico)}
                    disabled={deletingId === tecnico.id}
                    aria-label={`Excluir ${tecnico.nome}`}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>

      <Dialog
        open={profileTarget !== null}
        onOpenChange={(open) => {
          if (!open) setProfileTarget(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Perfil do Técnico</DialogTitle>
          </DialogHeader>

          {profileTarget && (
            <>
              <div className="rounded-xl border border-border bg-muted/30 p-4">
                <div className="mb-4 flex items-center gap-3">
                  <div className="grid h-12 w-12 place-items-center rounded-full bg-primary/10 text-primary">
                    <User className="h-6 w-6" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-lg font-bold">{profileTarget.nome}</p>
                    <p className="text-xs text-muted-foreground">Colaborador de campo</p>
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nome Completo
                    </dt>
                    <dd className="mt-0.5 font-medium">{profileTarget.nome}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Id TOA
                    </dt>
                    <dd className="mt-0.5 font-mono font-medium">
                      {profileTarget.identificacao ?? "—"}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Celular
                    </dt>
                    <dd className="mt-0.5 font-medium">
                      {formatCelularExibicao(profileTarget.celular)}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Data de Cadastro
                    </dt>
                    <dd className="mt-0.5 font-medium">
                      {formatDataCadastro(profileTarget.created_at)}
                    </dd>
                  </div>
                </dl>
              </div>

              <DialogFooter className="gap-2 sm:justify-between">
                <Button
                  type="button"
                  variant="outline"
                  className="gap-2"
                  disabled={copyingPerfil}
                  onClick={() => void copiarPerfil()}
                >
                  <Copy className="h-4 w-4" />
                  Copiar Dados
                </Button>
                <Button type="button" variant="secondary" onClick={() => setProfileTarget(null)}>
                  Fechar
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={editTarget !== null}
        onOpenChange={(open) => {
          if (!open) fecharEdicao();
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Editar Técnico</DialogTitle>
          </DialogHeader>

          {editTarget && (
            <form onSubmit={salvarEdicao} className="space-y-4">
              <div className="rounded-lg border border-border bg-muted/20 px-3 py-2 text-sm">
                <p className="font-semibold">{editTarget.nome}</p>
                <p className="text-xs text-muted-foreground">
                  Login: {editTarget.login ?? "—"} · Id TOA: {editTarget.identificacao ?? "—"}
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-celular">Celular</Label>
                <input
                  id="edit-celular"
                  type="tel"
                  inputMode="numeric"
                  value={editCelular}
                  onChange={(e) => setEditCelular(formatCelularMask(e.target.value))}
                  placeholder="(XX) X XXXX-XXXX"
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-senha">Nova Senha (opcional)</Label>
                <PasswordInput
                  id="edit-senha"
                  value={editSenha}
                  onChange={setEditSenha}
                  placeholder="Deixe em branco para manter"
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="edit-senha2">Repetir Nova Senha</Label>
                <PasswordInput
                  id="edit-senha2"
                  value={editSenha2}
                  onChange={setEditSenha2}
                  placeholder="Confirme a nova senha"
                />
              </div>

              <DialogFooter className="gap-2 pt-2">
                <Button type="button" variant="outline" onClick={fecharEdicao} disabled={editLoading}>
                  Cancelar
                </Button>
                <Button type="submit" disabled={editLoading}>
                  {editLoading ? "Salvando..." : "Salvar"}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={confirmTarget !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir técnico permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza? Isso apagará o acesso do técnico
              {confirmTarget ? ` (${confirmTarget.nome})` : ""} e excluirá permanentemente todo o
              histórico de Work Orders e fotos dele.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletingId !== null}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                void handleConfirmDelete();
              }}
              disabled={deletingId !== null}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingId ? "Excluindo..." : "Excluir permanentemente"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
