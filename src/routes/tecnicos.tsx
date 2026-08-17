import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  ClipboardList,
  Copy,
  FileSpreadsheet,
  Pencil,
  Search,
  Trash2,
  User,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import * as XLSX from "xlsx";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateTecnico } from "@/lib/admin-actions.server";
import { useApp } from "@/lib/app-store";
import { requireAdmin } from "@/lib/auth-guards";
import { formatCelularMask, isValidCelular } from "@/lib/auth-identificacao";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { canManageTeam, normalizeUserRole, roleLabel } from "@/lib/roles";
import {
  deleteTecnico,
  fetchColaboradoresEquipe,
  updateTecnicoStatus,
  type TecnicoProfile,
  type TecnicoStatus,
} from "@/lib/team-service";

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
  const { getAccessToken, user } = useApp();
  const podeGerenciarEquipe = canManageTeam(user?.role);
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [filtroCargo, setFiltroCargo] = useState("Todos");
  const [abaAtiva, setAbaAtiva] = useState<"ativos" | "demitidos">("ativos");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [statusUpdatingId, setStatusUpdatingId] = useState<string | null>(null);
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
      setTecnicos(await fetchColaboradoresEquipe());
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar técnicos.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadTecnicos();
  }, []);

  const tecnicosFiltrados = useMemo(() => {
    const porAba = tecnicos.filter((tecnico) =>
      abaAtiva === "ativos" ? tecnico.status === "ATIVO" : tecnico.status === "DEMITIDO",
    );

    const porCargo =
      filtroCargo === "Todos"
        ? porAba
        : porAba.filter((tecnico) => {
            const cargo = normalizeUserRole(tecnico.role);
            if (filtroCargo === "Técnicos") return cargo === "tecnico";
            if (filtroCargo === "Transmissão") return cargo === "transmissao";
            if (filtroCargo === "Gerente") return cargo === "gerente";
            if (filtroCargo === "COP") return cargo === "cop";
            if (filtroCargo === "Supervisor IAT") return cargo === "supervisor_iat";
            if (filtroCargo === "Supervisor Transmissão") {
              return cargo === "supervisor_transmissao";
            }
            return true;
          });

    const q = query.trim().toLowerCase();
    if (!q) return porCargo;

    return porCargo.filter((tecnico) => {
      const nome = tecnico.nome.toLowerCase();
      const matricula = (tecnico.identificacao ?? "").toLowerCase();
      return nome.includes(q) || matricula.includes(q);
    });
  }, [tecnicos, abaAtiva, query, filtroCargo]);

  const exportarTecnicosParaExcel = () => {
    if (tecnicosFiltrados.length === 0) {
      toast.error("Nenhum técnico para exportar nesta aba.");
      return;
    }

    const dadosExcel = tecnicosFiltrados.map((tecnico) => ({
      Nome: tecnico.nome,
      Matrícula: tecnico.identificacao ?? "—",
      Login: tecnico.login ?? "—",
      Cargo: roleLabel(tecnico.role),
      Celular: formatCelularExibicao(tecnico.celular),
      Status: tecnico.status,
      "Data de Cadastro": formatDataCadastro(tecnico.created_at),
    }));

    const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      abaAtiva === "ativos" ? "Ativos" : "Demitidos",
    );

    const agora = new Date();
    const dd = String(agora.getDate()).padStart(2, "0");
    const mm = String(agora.getMonth() + 1).padStart(2, "0");
    const yyyy = String(agora.getFullYear());
    XLSX.writeFile(workbook, `tecnicos_export_${dd}_${mm}_${yyyy}.xlsx`);
    toast.success(`Excel exportado: ${tecnicosFiltrados.length} técnicos.`);
  };

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

  const alternarStatusTecnico = async (id: string, statusAtual: TecnicoStatus) => {
    const novoStatus: TecnicoStatus = statusAtual === "ATIVO" ? "DEMITIDO" : "ATIVO";
    setStatusUpdatingId(id);
    try {
      await updateTecnicoStatus(id, novoStatus);
      setTecnicos((atual) =>
        atual.map((tecnico) =>
          tecnico.id === id ? { ...tecnico, status: novoStatus } : tecnico,
        ),
      );
      toast.success(
        novoStatus === "DEMITIDO" ? "Técnico marcado como demitido." : "Técnico recontratado.",
      );
    } catch (err) {
      toast.error((err as Error).message || "Erro ao alterar status do técnico.");
    } finally {
      setStatusUpdatingId(null);
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
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              disabled={loading || tecnicosFiltrados.length === 0}
              onClick={exportarTecnicosParaExcel}
            >
              <FileSpreadsheet className="h-4 w-4" />
              Exportar Excel
            </Button>
            {podeGerenciarEquipe ? (
              <Link
                to="/cadastro"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover"
              >
                <UserPlus className="h-4 w-4" />
                Adicionar colaborador
              </Link>
            ) : null}
          </div>
        </header>

        {!loading && (
          <div className="mb-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Total de Funcionários
            </div>
            <div className="mt-1 text-3xl font-black tracking-tight text-foreground">
              {tecnicosFiltrados.length}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {abaAtiva === "ativos" ? "Colaboradores ativos" : "Colaboradores demitidos"}
              {query.trim() || filtroCargo !== "Todos" ? " (com filtro)" : ""}
            </p>
          </div>
        )}

        {!loading && tecnicos.length > 0 && (
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary">
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
            <div className="flex items-center gap-2">
              <Label htmlFor="filtro-cargo-equipe" className="shrink-0 text-sm font-medium">
                Cargo:
              </Label>
              <Select value={filtroCargo} onValueChange={setFiltroCargo}>
                <SelectTrigger id="filtro-cargo-equipe" className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Todos">Todos</SelectItem>
                  <SelectItem value="Técnicos">Técnicos</SelectItem>
                  <SelectItem value="Transmissão">Transmissão</SelectItem>
                  <SelectItem value="Gerente">Gerente</SelectItem>
                  <SelectItem value="COP">COP</SelectItem>
                  <SelectItem value="Supervisor IAT">Supervisor IAT</SelectItem>
                  <SelectItem value="Supervisor Transmissão">
                    Supervisor Transmissão
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando técnicos...</p>
        ) : tecnicos.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <Users className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum técnico cadastrado.</p>
            {podeGerenciarEquipe ? (
              <Link
                to="/cadastro"
                className="mt-3 inline-block text-sm font-semibold text-primary hover:underline"
              >
                Cadastrar usuário
              </Link>
            ) : null}
          </div>
        ) : (
          <section className="rounded-2xl border border-border bg-card shadow-sm">
            <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 pt-2">
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => setAbaAtiva("ativos")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    abaAtiva === "ativos"
                      ? "border-b-2 border-primary text-foreground"
                      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Ativos
                </button>
                <button
                  type="button"
                  onClick={() => setAbaAtiva("demitidos")}
                  className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                    abaAtiva === "demitidos"
                      ? "border-b-2 border-primary text-foreground"
                      : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Demitidos
                </button>
              </div>
            </div>

            <div className="p-4">
              {tecnicosFiltrados.length === 0 ? (
                <div className="rounded-xl border border-dashed border-border bg-background/50 p-10 text-center">
                  <p className="text-sm text-muted-foreground">
                    {query.trim() || filtroCargo !== "Todos"
                      ? "Nenhum colaborador encontrado para os filtros nesta aba."
                      : abaAtiva === "ativos"
                        ? "Nenhum colaborador ativo."
                        : "Nenhum colaborador demitido."}
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {tecnicosFiltrados.map((tecnico) => (
                    <li
                      key={tecnico.id}
                      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background p-4 shadow-sm"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold uppercase">{tecnico.nome}</div>
                        <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
                          <span>Matrícula: {tecnico.identificacao ?? "—"}</span>
                          <span>Login: {tecnico.login ?? "—"}</span>
                          <span>Cargo: {roleLabel(tecnico.role)}</span>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center justify-center gap-2">
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

                        {podeGerenciarEquipe && tecnico.login ? (
                          <Link
                            to="/todos"
                            search={{ login: tecnico.login }}
                            aria-label={`Ver WOs de ${tecnico.nome}`}
                            title="Ver WOs"
                            className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10"
                          >
                            <ClipboardList className="h-5 w-5" />
                          </Link>
                        ) : null}

                        {podeGerenciarEquipe ? (
                          <>
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
                          disabled={deletingId === tecnico.id || statusUpdatingId === tecnico.id}
                          aria-label={`Excluir ${tecnico.nome}`}
                          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-destructive transition hover:bg-destructive/10 disabled:opacity-50"
                        >
                          <Trash2 className="h-5 w-5" />
                        </button>

                        <button
                          type="button"
                          onClick={() => void alternarStatusTecnico(tecnico.id, tecnico.status)}
                          disabled={statusUpdatingId === tecnico.id || deletingId === tecnico.id}
                          aria-label={
                            abaAtiva === "ativos"
                              ? `Demitir ${tecnico.nome}`
                              : `Contratar ${tecnico.nome}`
                          }
                          title={abaAtiva === "ativos" ? "Demitir" : "Contratar"}
                          className={`inline-flex h-10 items-center justify-center rounded-lg px-2 text-xs font-semibold transition disabled:opacity-50 sm:px-3 ${
                            abaAtiva === "ativos"
                              ? "text-orange-600 hover:bg-orange-500/10 hover:text-orange-800"
                              : "text-green-600 hover:bg-green-500/10 hover:text-green-800"
                          }`}
                        >
                          {abaAtiva === "ativos" ? "Demitir" : "Contratar"}
                        </button>
                          </>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>
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
                    <p className="truncate text-lg font-bold uppercase">{profileTarget.nome}</p>
                    <p className="text-xs text-muted-foreground">Colaborador de campo</p>
                  </div>
                </div>

                <dl className="space-y-3 text-sm">
                  <div>
                    <dt className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Nome Completo
                    </dt>
                    <dd className="mt-0.5 font-medium uppercase">{profileTarget.nome}</dd>
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
                <p className="font-semibold uppercase">{editTarget.nome}</p>
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
