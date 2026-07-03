import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, ChevronDown, FileText, Calendar } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CopyRegistroButton } from "@/components/CopyRegistroButton";
import { useApp } from "@/lib/app-store";
import { requireTecnico } from "@/lib/auth-guards";
import { fetchMyEvidencias } from "@/lib/evidencias-service";
import { formatHistoricoCopyText } from "@/lib/registro-copy";
import type { Evidencia } from "@/lib/types";

export const Route = createFileRoute("/historico")({
  beforeLoad: () => requireTecnico(),
  head: () => ({
    meta: [
      { title: "Meus Registros — Estrategic Field" },
      { name: "description", content: "Histórico de evidências de metragem." },
    ],
  }),
  component: HistoricoPage,
});

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function HistoricoPage() {
  const { user } = useApp();
  const [records, setRecords] = useState<Evidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterDate, setFilterDate] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    setLoading(true);
    fetchMyEvidencias(user.id)
      .then(setRecords)
      .finally(() => setLoading(false));
  }, [user]);

  const filtered = useMemo(() => {
    const list = filterDate ? records.filter((r) => dayKey(r.data_registro) === filterDate) : records;
    return [...list].sort((a, b) => (a.data_registro < b.data_registro ? 1 : -1));
  }, [records, filterDate]);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-10 pt-4">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mb-5">
          <h1 className="text-2xl font-black tracking-tight">Meus Registros</h1>
          <p className="text-sm text-muted-foreground">Histórico de evidências enviadas.</p>
        </header>

        <div className="mb-4 flex items-start gap-3 rounded-xl border border-warning/40 bg-warning/15 p-3 text-warning-foreground">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p className="text-sm font-medium">
            Aviso: Os registros são apagados automaticamente do aplicativo no prazo de 30 dias.
          </p>
        </div>

        <div className="mb-5 flex items-center gap-2 rounded-xl border border-border bg-card p-3 shadow-sm">
          <Calendar className="h-5 w-5 text-muted-foreground" />
          <input
            type="date"
            value={filterDate}
            onChange={(e) => setFilterDate(e.target.value)}
            className="flex-1 bg-transparent text-sm outline-none"
          />
          {filterDate && (
            <button
              onClick={() => setFilterDate("")}
              className="text-xs font-semibold text-primary hover:underline"
            >
              Limpar
            </button>
          )}
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando registros...</p>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <FileText className="mx-auto mb-2 h-10 w-10 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">Nenhum registro encontrado.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {filtered.map((r) => {
              const open = expanded === r.id;
              const dt = new Date(r.data_registro);
              return (
                <li
                  key={r.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : r.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left active:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          WO {r.wo}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          Contrato {r.contrato}
                        </span>
                        <span className="ml-auto rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                          {r.total_utilizado} m
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span>Inicial {r.metragem_inicial} m</span>
                        <span>Final {r.metragem_final} m</span>
                        <span>
                          {dt.toLocaleDateString("pt-BR")} ·{" "}
                          {dt.toLocaleTimeString("pt-BR", {
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <CopyRegistroButton
                        contrato={r.contrato}
                        wo={r.wo}
                        nomeTecnico={user?.nome ?? r.tecnico_nome ?? ""}
                        matricula={user?.identificacao ?? user?.login ?? r.tecnico_identificacao ?? ""}
                        copyText={formatHistoricoCopyText({
                          contrato: r.contrato,
                          wo: r.wo,
                          nomeTecnico: user?.nome ?? r.tecnico_nome ?? "",
                          matricula:
                            user?.identificacao ?? user?.login ?? r.tecnico_identificacao ?? "",
                          metragem: r.total_utilizado,
                        })}
                      />
                      <ChevronDown
                        className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform ${
                          open ? "rotate-180" : ""
                        }`}
                      />
                    </div>
                  </button>
                  <div
                    className={`grid transition-all duration-300 ${
                      open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="grid grid-cols-2 gap-3 border-t border-border p-4">
                        <figure>
                          <img
                            src={r.foto_inicio_url}
                            alt="Foto do início"
                            className="h-40 w-full rounded-lg object-cover"
                          />
                          <figcaption className="mt-1 text-center text-xs font-semibold text-muted-foreground">
                            Foto do Início
                          </figcaption>
                        </figure>
                        <figure>
                          <img
                            src={r.foto_fim_url}
                            alt="Foto do fim"
                            className="h-40 w-full rounded-lg object-cover"
                          />
                          <figcaption className="mt-1 text-center text-xs font-semibold text-muted-foreground">
                            Foto do Fim
                          </figcaption>
                        </figure>
                      </div>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
