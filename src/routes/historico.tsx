import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, AlertTriangle, ChevronDown, FileText, Calendar } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CopyRegistroButton } from "@/components/CopyRegistroButton";
import { useApp } from "@/lib/app-store";
import { requireTecnico } from "@/lib/auth-guards";
import { groupEvidenciasPorEnvio } from "@/lib/evidencias-grouping";
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

  const envios = useMemo(() => groupEvidenciasPorEnvio(records), [records]);

  const filtered = useMemo(() => {
    const list = filterDate
      ? envios.filter((envio) => dayKey(envio.data_registro) === filterDate)
      : envios;
    return [...list].sort((a, b) => (a.data_registro < b.data_registro ? 1 : -1));
  }, [envios, filterDate]);

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
            {filtered.map((envio) => {
              const open = expanded === envio.id;
              const dt = new Date(envio.data_registro);
              const totalMetros = envio.materiais.reduce(
                (sum, material) => sum + material.total_utilizado,
                0,
              );

              return (
                <li
                  key={envio.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <button
                    type="button"
                    onClick={() => setExpanded(open ? null : envio.id)}
                    className="flex w-full items-center justify-between gap-3 p-4 text-left active:bg-muted/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                          WO {envio.wo}
                        </span>
                        <span className="text-xs font-semibold text-foreground">
                          Contrato {envio.contrato}
                        </span>
                        <span className="ml-auto rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                          {envio.materiais.length} item{envio.materiais.length > 1 ? "s" : ""}
                        </span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                        <span>Total {totalMetros} m</span>
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
                        contrato={envio.contrato}
                        wo={envio.wo}
                        nomeTecnico={user?.nome ?? ""}
                        matricula={user?.identificacao ?? user?.login ?? ""}
                        copyText={formatHistoricoCopyText({
                          contrato: envio.contrato,
                          wo: envio.wo,
                          nomeTecnico: user?.nome ?? "",
                          matricula: user?.identificacao ?? user?.login ?? "",
                          metragem: envio.materiais
                            .map((material) => `${material.tipo}: ${material.metragem}m`)
                            .join(" | "),
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
                      <div className="space-y-4 border-t border-border p-4">
                        {envio.materiais.map((material) => (
                          <div
                            key={material.id}
                            className="rounded-lg border border-border/70 bg-muted/20 p-3"
                          >
                            <p className="text-sm font-bold text-foreground">{material.tipo}</p>
                            <p className="mt-1 text-sm text-muted-foreground">
                              Total: {material.metragem} Metros
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <a
                                href={material.foto_inicio_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group block"
                              >
                                <img
                                  src={material.foto_inicio_url}
                                  alt={`Foto início — ${material.tipo}`}
                                  className="h-28 w-full rounded-lg border border-border object-cover transition group-hover:opacity-90"
                                />
                                <span className="mt-1 block text-center text-xs font-semibold text-muted-foreground">
                                  Foto Início
                                </span>
                              </a>
                              <a
                                href={material.foto_fim_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="group block"
                              >
                                <img
                                  src={material.foto_fim_url}
                                  alt={`Foto fim — ${material.tipo}`}
                                  className="h-28 w-full rounded-lg border border-border object-cover transition group-hover:opacity-90"
                                />
                                <span className="mt-1 block text-center text-xs font-semibold text-muted-foreground">
                                  Foto Fim
                                </span>
                              </a>
                            </div>
                          </div>
                        ))}
                        {envio.observacao && (
                          <p className="rounded-lg bg-muted/30 px-3 py-2 text-sm text-muted-foreground">
                            <span className="font-semibold text-foreground">Observação:</span>{" "}
                            {envio.observacao}
                          </p>
                        )}
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
