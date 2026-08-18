import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { TecnicoTransmissaoMultiSelect } from "@/components/TecnicoTransmissaoMultiSelect";
import {
  formatDate,
  formatDateTimePendencia,
  StatusBadge,
} from "@/components/RelatorioLancamentoDetalhe";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  despacharRelatorioTransmissao,
  fetchRelatoriosTransmissaoAdmin,
  labelTecnicosAtribuidos,
  subscribeRelatoriosTransmissao,
  type RelatorioTransmissao,
} from "@/lib/relatorios-transmissao";
import type { TecnicoProfile } from "@/lib/team-service";

export const Route = createFileRoute("/admin/transmissao/")({
  head: () => ({
    meta: [
      { title: "Transmissão — Estrategic" },
      { name: "description", content: "Despacho e gestão de OS da equipe de transmissão." },
    ],
  }),
  component: AdminTransmissaoPage,
});

type AbaContratos = "abertos" | "fechados";
type FiltroStatusAberto = "todos" | "em_aberto" | "avisado" | "pendente";

const FILTROS_STATUS: { id: FiltroStatusAberto; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "em_aberto", label: "Em andamento" },
  { id: "avisado", label: "Avisado" },
  { id: "pendente", label: "Pendenciado" },
];

function RelatorioCard({ row }: { row: RelatorioTransmissao }) {
  const cardTone =
    row.status === "avisado"
      ? "border-emerald-400 bg-emerald-50/80"
      : row.status === "pendente"
        ? "border-orange-300 bg-orange-50/80"
        : "border-border bg-card";

  return (
    <Link
      to="/admin/transmissao/$id"
      params={{ id: row.id }}
      className={`block w-full rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardTone}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-lg font-bold">{row.os_wf}</h3>
          <p className="text-sm text-muted-foreground">{row.cliente || "Preenchendo..."}</p>
        </div>
        <div className="flex flex-col items-end">
          <StatusBadge status={row.status} />
          {row.status === "pendente" ? (
            <span className="mt-1 text-xs text-red-600">
              em {formatDateTimePendencia(row.data_pendencia)}
            </span>
          ) : null}
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
        <div>
          <span className="text-muted-foreground">Cidade: </span>
          {row.cidade || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Técnicos: </span>
          {labelTecnicosAtribuidos(row)}
        </div>
        <div>
          <span className="text-muted-foreground">Equipe: </span>
          {row.equipe_empreiteira || "—"}
        </div>
        <div>
          <span className="text-muted-foreground">Início: </span>
          {formatDate(row.data_inicio_execucao)}
        </div>
      </dl>
    </Link>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p className="text-xs font-medium text-destructive" role="alert">
      {message}
    </p>
  );
}

function OptionalHint() {
  return <span className="font-normal text-muted-foreground">(opcional)</span>;
}

function RequiredMark() {
  return (
    <span className="text-destructive" aria-hidden="true">
      *
    </span>
  );
}

function NovaOsDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (row: RelatorioTransmissao) => void;
}) {
  const [osWf, setOsWf] = useState("");
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [empreiteira, setEmpreiteira] = useState("");
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [dataInicio, setDataInicio] = useState("");
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ osWf?: string; equipe?: string }>({});

  useEffect(() => {
    if (!open) return;
    setOsWf("");
    setCliente("");
    setEndereco("");
    setCidade("");
    setEmpreiteira("");
    setTecnicos([]);
    setDataInicio("");
    setSaving(false);
    setErrors({});
  }, [open]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: { osWf?: string; equipe?: string } = {};
    if (!osWf.trim()) nextErrors.osWf = "Informe a OS/WF.";
    if (tecnicos.length === 0) nextErrors.equipe = "Selecione ao menos um técnico na equipe.";
    setErrors(nextErrors);
    if (nextErrors.osWf || nextErrors.equipe) return;

    setSaving(true);
    try {
      const row = await despacharRelatorioTransmissao({
        osWf,
        cliente,
        endereco,
        cidade,
        equipeEmpreiteira: empreiteira,
        dataInicioExecucao: dataInicio,
        tecnicos: tecnicos.map((t) => ({ id: t.id, nome: t.nome })),
      });
      toast.success("OS despachada. Os técnicos já podem preencher o relatório.");
      onCreated(row);
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível criar a OS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nova OS / Contrato</DialogTitle>
          <DialogDescription>
            Preencha a OS/WF e atribua a equipe. Os demais dados podem ser completados depois
            pelo gestor ou pelos técnicos.
          </DialogDescription>
        </DialogHeader>
        <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="os-contrato">
              OS/WF <RequiredMark />
            </Label>
            <Input
              id="os-contrato"
              value={osWf}
              onChange={(e) => {
                setOsWf(e.target.value);
                if (errors.osWf) setErrors((prev) => ({ ...prev, osWf: undefined }));
              }}
              placeholder="Ex: WF-12345"
              aria-invalid={Boolean(errors.osWf)}
              aria-required="true"
              className={errors.osWf ? "border-destructive focus-visible:ring-destructive" : undefined}
              autoFocus
            />
            <FieldError message={errors.osWf} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-cliente">
              Cliente <OptionalHint />
            </Label>
            <Input
              id="os-cliente"
              value={cliente}
              onChange={(e) => setCliente(e.target.value)}
              placeholder="Nome do cliente"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-endereco">
              Endereço <OptionalHint />
            </Label>
            <Input
              id="os-endereco"
              value={endereco}
              onChange={(e) => setEndereco(e.target.value)}
              placeholder="Endereço da obra"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-cidade">
              Cidade <OptionalHint />
            </Label>
            <Input
              id="os-cidade"
              value={cidade}
              onChange={(e) => setCidade(e.target.value)}
              placeholder="Cidade"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-empreiteira">
              Empreiteira <OptionalHint />
            </Label>
            <Input
              id="os-empreiteira"
              value={empreiteira}
              onChange={(e) => setEmpreiteira(e.target.value)}
              placeholder="Empreiteira responsável"
            />
          </div>
          <div className="space-y-1.5">
            <Label>
              Equipe <RequiredMark />
            </Label>
            <TecnicoTransmissaoMultiSelect
              value={tecnicos}
              invalid={Boolean(errors.equipe)}
              onChange={(next) => {
                setTecnicos(next);
                if (errors.equipe && next.length > 0) {
                  setErrors((prev) => ({ ...prev, equipe: undefined }));
                }
              }}
            />
            <FieldError message={errors.equipe} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="os-data-inicio">
              Data de início da execução <OptionalHint />
            </Label>
            <Input
              id="os-data-inicio"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={saving}>
              {saving ? "Despachando..." : "Criar e Despachar"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AdminTransmissaoPage() {
  const [aba, setAba] = useState<AbaContratos>("abertos");
  const [rows, setRows] = useState<RelatorioTransmissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusAberto>("todos");
  const [novaOsAberta, setNovaOsAberta] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const lista = await fetchRelatoriosTransmissaoAdmin();
      setRows(lista);
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar relatórios.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeRelatoriosTransmissao(() => {
      void load(true);
    });
  }, [load]);

  const contratosAbertos = useMemo(
    () => rows.filter((row) => row.status !== "fechado"),
    [rows],
  );
  const contratosFechados = useMemo(
    () => rows.filter((row) => row.status === "fechado"),
    [rows],
  );

  const abertosAposBusca = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return contratosAbertos;
    return contratosAbertos.filter((row) => {
      const os = row.os_wf.toLowerCase();
      const tecnico = labelTecnicosAtribuidos(row).toLowerCase();
      const cliente = (row.cliente ?? "").toLowerCase();
      return os.includes(termo) || tecnico.includes(termo) || cliente.includes(termo);
    });
  }, [contratosAbertos, busca]);

  const qtdTodos = abertosAposBusca.length;
  const qtdEmAndamento = abertosAposBusca.filter((c) => c.status === "em_aberto").length;
  const qtdAvisado = abertosAposBusca.filter((c) => c.status === "avisado").length;
  const qtdPendente = abertosAposBusca.filter((c) => c.status === "pendente").length;

  const listaFiltrada = useMemo(() => {
    if (aba === "fechados") {
      const termo = busca.trim().toLowerCase();
      if (!termo) return contratosFechados;
      return contratosFechados.filter((row) => {
        const os = row.os_wf.toLowerCase();
        const tecnico = labelTecnicosAtribuidos(row).toLowerCase();
        const cliente = (row.cliente ?? "").toLowerCase();
        return os.includes(termo) || tecnico.includes(termo) || cliente.includes(termo);
      });
    }
    if (filtroStatus === "todos") return abertosAposBusca;
    return abertosAposBusca.filter((row) => row.status === filtroStatus);
  }, [aba, contratosFechados, abertosAposBusca, busca, filtroStatus]);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-4">
        <Link
          to="/admin"
          search={{ tab: "lancamentos" }}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
        </Link>

        <section className="mb-6 rounded-2xl border border-border bg-white p-4 shadow-sm md:p-5">
          <div className="flex flex-col items-start justify-between gap-4 md:flex-row md:items-center">
            <div className="flex items-start gap-3">
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-green-100 text-green-700">
                <ClipboardList className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-2xl font-black tracking-tight">Transmissão</h1>
                <p className="text-sm text-muted-foreground">
                  Despacho de OS e auditoria dos relatórios colaborativos
                </p>
              </div>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center md:w-auto">
              <div className="relative w-full md:max-w-sm">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar por OS, cliente ou técnico..."
                  className="bg-gray-50 pl-9"
                  aria-label="Buscar por OS, cliente ou técnico"
                />
              </div>
              <Button
                type="button"
                className="shrink-0 shadow-md"
                size="lg"
                onClick={() => setNovaOsAberta(true)}
              >
                <Plus className="h-4 w-4" />
                Nova OS / Contrato
              </Button>
            </div>
          </div>

          {aba === "abertos" ? (
            <div className="mt-4 flex flex-wrap gap-2">
              {FILTROS_STATUS.map((filtro) => {
                const ativo = filtroStatus === filtro.id;
                const qtd =
                  filtro.id === "todos"
                    ? qtdTodos
                    : filtro.id === "em_aberto"
                      ? qtdEmAndamento
                      : filtro.id === "avisado"
                        ? qtdAvisado
                        : qtdPendente;
                return (
                  <button
                    key={filtro.id}
                    type="button"
                    onClick={() => setFiltroStatus(filtro.id)}
                    className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition ${
                      ativo
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-gray-50 text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {filtro.label} ({qtd})
                  </button>
                );
              })}
            </div>
          ) : null}
        </section>

        <Tabs
          value={aba}
          onValueChange={(value) => setAba(value === "fechados" ? "fechados" : "abertos")}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="abertos">
              Contratos em aberto ({contratosAbertos.length})
            </TabsTrigger>
            <TabsTrigger value="fechados">
              Contratos fechados ({contratosFechados.length})
            </TabsTrigger>
          </TabsList>
          <TabsContent value="abertos" className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : listaFiltrada.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum contrato em aberto com os filtros atuais.
              </p>
            ) : (
              listaFiltrada.map((row) => <RelatorioCard key={row.id} row={row} />)
            )}
          </TabsContent>
          <TabsContent value="fechados" className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : listaFiltrada.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum contrato fechado com os filtros atuais.
              </p>
            ) : (
              listaFiltrada.map((row) => <RelatorioCard key={row.id} row={row} />)
            )}
          </TabsContent>
        </Tabs>
      </main>

      <NovaOsDialog
        open={novaOsAberta}
        onOpenChange={setNovaOsAberta}
        onCreated={(row) => setRows((prev) => [row, ...prev.filter((item) => item.id !== row.id)])}
      />
    </div>
  );
}
