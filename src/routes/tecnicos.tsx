import { createFileRoute, Link } from "@tanstack/react-router";

import { useEffect, useMemo, useState } from "react";

import { ArrowLeft, ClipboardList, Pencil, Search, Trash2, UserPlus, Users, X } from "lucide-react";

import { toast } from "sonner";

import { AppHeader } from "@/components/AppHeader";

import { requireAdmin } from "@/lib/auth-guards";

import { deleteTecnico, fetchTecnicos, type TecnicoProfile } from "@/lib/team-service";

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



function TecnicosPage() {

  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);

  const [loading, setLoading] = useState(true);

  const [query, setQuery] = useState("");

  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [confirmTarget, setConfirmTarget] = useState<TecnicoProfile | null>(null);



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

    loadTecnicos();

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

            <p className="text-sm text-muted-foreground">Nenhum técnico encontrado para &quot;{query}&quot;.</p>

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

                  <Link

                    to="/alterar"

                    search={{

                      login: tecnico.login ?? "",

                      nome: tecnico.nome,

                    }}

                    aria-label={`Editar ${tecnico.nome}`}

                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-primary transition hover:bg-primary/10"

                  >

                    <Pencil className="h-5 w-5" />

                  </Link>

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

                handleConfirmDelete();

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


