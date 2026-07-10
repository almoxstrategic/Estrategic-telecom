import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Search,
  Calendar as CalendarIcon,
  ChevronDown,
  FileText,
  X,
  Trash2,
  Pencil,
  Check,
} from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { CopyRegistroButton } from "@/components/CopyRegistroButton";
import { ExpandableImage } from "@/components/ExpandableImage";
import { requireAdmin } from "@/lib/auth-guards";
import {
  groupEvidenciasPorEnvio,
  type EvidenciaEnvioAgrupado,
} from "@/lib/evidencias-grouping";
import {
  deleteEvidenciasWithPhotos,
  fetchAllEvidencias,
  updateEvidenciaWoContrato,
} from "@/lib/evidencias-service";
import { formatHistoricoCopyText } from "@/lib/registro-copy";
import type { Evidencia } from "@/lib/types";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { DateRange } from "react-day-picker";

export const Route = createFileRoute("/todos")({
  beforeLoad: () => requireAdmin(),
  validateSearch: (search: Record<string, unknown>) => ({
    login: typeof search.login === "string" ? search.login : undefined,
    wo: typeof search.wo === "string" ? search.wo : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Todas as Metragens — Estrategic Field" },
      { name: "description", content: "Auditoria de todos os registros." },
    ],
  }),
  component: TodosPage,
});

function fmtDate(d: Date) {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function TodosPage() {
  const { login: loginFilter, wo: woFilter } = Route.useSearch();
  const [records, setRecords] = useState<Evidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState(woFilter ?? loginFilter ?? "");
  const [range, setRange] = useState<DateRange | undefined>();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [deleting, setDeleting] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWo, setEditWo] = useState("");
  const [editContrato, setEditContrato] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);

  const loadRecords = async () => {
    setLoading(true);
    try {
      const data = await fetchAllEvidencias();
      setRecords(data);
      setSelected(new Set());
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar registros.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadRecords();
  }, []);

  useEffect(() => {
    if (woFilter) setQuery(woFilter);
    else if (loginFilter) setQuery(loginFilter);
  }, [woFilter, loginFilter]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const recordsFiltrados = records.filter((r) => {
      const matchQ =
        !q ||
        (r.tecnico_nome ?? "").toLowerCase().includes(q) ||
        (r.tecnico_login ?? "").toLowerCase().includes(q) ||
        r.wo.toLowerCase().includes(q) ||
        r.contrato.toLowerCase().includes(q);
      const date = new Date(r.data_registro);
      const from = range?.from ? new Date(range.from.setHours(0, 0, 0, 0)) : null;
      const to = range?.to
        ? new Date(new Date(range.to).setHours(23, 59, 59, 999))
        : from
          ? new Date(new Date(from).setHours(23, 59, 59, 999))
          : null;
      const matchD = !from || (date >= from && (!to || date <= to));
      return matchQ && matchD;
    });

    return groupEvidenciasPorEnvio(recordsFiltrados);
  }, [records, query, range]);

  const allMaterialIds = useMemo(
    () => filtered.flatMap((envio) => envio.materiais.map((material) => material.id)),
    [filtered],
  );

  const allVisibleSelected =
    allMaterialIds.length > 0 && allMaterialIds.every((id) => selected.has(id));

  const toggleAll = (checked: boolean) => {
    if (!checked) {
      setSelected(new Set());
      return;
    }
    setSelected(new Set(allMaterialIds));
  };

  const isEnvioSelected = (envio: EvidenciaEnvioAgrupado) =>
    envio.materiais.length > 0 && envio.materiais.every((material) => selected.has(material.id));

  const toggleEnvio = (envio: EvidenciaEnvioAgrupado, checked: boolean) => {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const material of envio.materiais) {
        if (checked) next.add(material.id);
        else next.delete(material.id);
      }
      return next;
    });
  };

  const iniciarEdicao = (envio: EvidenciaEnvioAgrupado) => {
    setEditingId(envio.id);
    setEditWo(envio.wo);
    setEditContrato(envio.contrato);
  };

  const salvarEdicao = async (envio: EvidenciaEnvioAgrupado) => {
    const wo = editWo.trim();
    const contrato = editContrato.trim();
    if (!wo || !contrato) {
      toast.error("WO e contrato são obrigatórios.");
      return;
    }

    setSavingEdit(true);
    try {
      const ids = envio.materiais.map((material) => material.id);
      await Promise.all(ids.map((id) => updateEvidenciaWoContrato(id, { wo, contrato })));
      setRecords((prev) =>
        prev.map((r) => (ids.includes(r.id) ? { ...r, wo, contrato } : r)),
      );
      setEditingId(null);
      toast.success("Registro atualizado com sucesso.");
    } catch (err) {
      toast.error((err as Error).message || "Erro ao salvar alterações.");
    } finally {
      setSavingEdit(false);
    }
  };

  const handleBulkDelete = async () => {
    if (selected.size === 0) {
      toast.error("Selecione ao menos um registro.");
      return;
    }

    const confirmed = window.confirm(
      `Excluir ${selected.size} registro(s) selecionado(s) e liberar espaço no Storage?`,
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      await deleteEvidenciasWithPhotos(Array.from(selected));
      toast.success("Registros e fotos excluídos com sucesso.");
      await loadRecords();
    } catch (err) {
      toast.error((err as Error).message || "Erro ao excluir registros.");
    } finally {
      setDeleting(false);
    }
  };

  const rangeLabel = range?.from
    ? range.to && range.to.getTime() !== range.from.getTime()
      ? `${fmtDate(range.from)} — ${fmtDate(range.to)}`
      : fmtDate(range.from)
    : "Selecionar período";

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-4">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mb-5">
          <h1 className="text-2xl font-black tracking-tight">Todas as Metragens</h1>
          <p className="text-sm text-muted-foreground">
            Auditoria de evidências enviadas pelos técnicos.
          </p>
        </header>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <label className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm shadow-sm">
            <Checkbox checked={allVisibleSelected} onCheckedChange={(v) => toggleAll(v === true)} />
            Selecionar Todos
          </label>
          <button
            type="button"
            onClick={handleBulkDelete}
            disabled={deleting || selected.size === 0}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-destructive px-4 py-2 text-sm font-semibold text-destructive-foreground disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" />
            {deleting ? "Excluindo..." : "Excluir Selecionados"}
          </button>
        </div>

        <div className="mb-5 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por login, técnico, WO ou contrato..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Limpar busca">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>

          <Popover>
            <PopoverTrigger
              className={cn(
                "flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-sm font-medium shadow-sm hover:bg-muted/50",
                !range && "text-muted-foreground",
              )}
            >
              <CalendarIcon className="h-5 w-5 text-primary" />
              <span>{rangeLabel}</span>
              {range && (
                <X
                  className="ml-1 h-4 w-4 text-muted-foreground hover:text-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    setRange(undefined);
                  }}
                />
              )}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={1}
                initialFocus
                className={cn("pointer-events-auto p-3")}
              />
            </PopoverContent>
          </Popover>
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
              const nomeTecnico = envio.tecnico_nome ?? "Técnico";
              const matricula =
                envio.tecnico_identificacao ?? envio.tecnico_login ?? "—";

              return (
                <li
                  key={envio.id}
                  className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
                >
                  <div className="flex items-start gap-3 p-4">
                    <Checkbox
                      checked={isEnvioSelected(envio)}
                      onCheckedChange={(v) => toggleEnvio(envio, v === true)}
                      className="mt-1"
                    />
                    <div className="flex min-w-0 flex-1 items-start justify-between gap-3">
                      {editingId === envio.id ? (
                        <div
                          className="min-w-0 flex-1 space-y-3"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="grid gap-2 sm:grid-cols-2">
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                                WO
                              </label>
                              <Input
                                type="text"
                                value={editWo}
                                onChange={(e) => setEditWo(e.target.value)}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-semibold text-muted-foreground">
                                Contrato
                              </label>
                              <Input
                                type="text"
                                value={editContrato}
                                onChange={(e) => setEditContrato(e.target.value)}
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => void salvarEdicao(envio)}
                            disabled={savingEdit}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                          >
                            <Check className="h-3.5 w-3.5" />
                            {savingEdit ? "Salvando..." : "Salvar"}
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : envio.id)}
                          className="min-w-0 flex-1 text-left active:bg-muted/50"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="rounded-md bg-primary/10 px-2 py-0.5 text-xs font-bold text-primary">
                                WO {envio.wo}
                              </span>
                              <span className="text-xs font-semibold text-foreground">
                                {nomeTecnico}
                              </span>
                              <span className="ml-auto rounded-md bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                                {envio.materiais.length} item
                                {envio.materiais.length > 1 ? "s" : ""}
                              </span>
                            </div>
                            <div className="mt-1 flex flex-wrap items-center gap-x-3 text-xs text-muted-foreground">
                              <span>Contrato {envio.contrato}</span>
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
                        </button>
                      )}
                      <div className="flex shrink-0 items-center gap-1">
                        {editingId !== envio.id && (
                          <>
                            <CopyRegistroButton
                              contrato={envio.contrato}
                              wo={envio.wo}
                              nomeTecnico={nomeTecnico}
                              matricula={matricula}
                              copyText={formatHistoricoCopyText({
                                contrato: envio.contrato,
                                wo: envio.wo,
                                nomeTecnico,
                                matricula,
                                metragem: envio.materiais
                                  .map((material) => `${material.tipo}: ${material.metragem}m`)
                                  .join(" | "),
                              })}
                            />
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                iniciarEdicao(envio);
                              }}
                              className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                              aria-label="Editar WO e contrato"
                            >
                              <Pencil className="h-4 w-4" />
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => setExpanded(open ? null : envio.id)}
                          className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label={open ? "Recolher detalhes" : "Expandir detalhes"}
                        >
                          <ChevronDown
                            className={`h-5 w-5 transition-transform ${open ? "rotate-180" : ""}`}
                          />
                        </button>
                      </div>
                    </div>
                  </div>
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
                              Total utilizado: {material.metragem} metros
                            </p>
                            <div className="mt-3 grid grid-cols-2 gap-3">
                              <figure>
                                <ExpandableImage
                                  src={material.foto_inicio_url}
                                  alt={`Foto início — ${material.tipo}`}
                                  className="rounded-lg"
                                />
                                <figcaption className="mt-1 text-center text-xs font-semibold text-muted-foreground">
                                  Foto Início
                                </figcaption>
                              </figure>
                              <figure>
                                <ExpandableImage
                                  src={material.foto_fim_url}
                                  alt={`Foto fim — ${material.tipo}`}
                                  className="rounded-lg"
                                />
                                <figcaption className="mt-1 text-center text-xs font-semibold text-muted-foreground">
                                  Foto Fim
                                </figcaption>
                              </figure>
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
