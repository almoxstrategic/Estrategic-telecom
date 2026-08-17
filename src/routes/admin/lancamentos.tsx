import { useCallback, useEffect, useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, ClipboardList, FileDown, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { ExpandableImage } from "@/components/ExpandableImage";
import { PhotoUpload } from "@/components/PhotoUpload";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-store";
import { hasPainelFullAccess } from "@/lib/roles";
import {
  appendStoredPhotoToPayload,
  excluirRelatorioTransmissao,
  fecharRelatorioTransmissao,
  fetchRelatorioTransmissaoById,
  fetchRelatoriosTransmissaoAdmin,
  patchRelatorioPayloadAdmin,
  sinalizarPendenciaRelatorio,
  subscribeRelatoriosTransmissao,
  uploadRelatorioPhoto,
  type RelatorioFotoCategoria,
  type RelatorioStatus,
  type RelatorioTransmissao,
  type StoredPhoto,
} from "@/lib/relatorios-transmissao";
import type { EvidencePhotoRef } from "@/lib/types";

export const Route = createFileRoute("/admin/lancamentos")({
  head: () => ({
    meta: [
      { title: "Relatórios de campo — Estrategic" },
      { name: "description", content: "Gestão de relatórios da equipe de lançamento." },
    ],
  }),
  component: AdminLancamentosPage,
});

type AbaContratos = "abertos" | "fechados";
type FiltroStatusAberto = "todos" | "em_aberto" | "avisado" | "pendente";

const FILTROS_STATUS: { id: FiltroStatusAberto; label: string }[] = [
  { id: "todos", label: "Todos" },
  { id: "em_aberto", label: "Em andamento" },
  { id: "avisado", label: "Avisado" },
  { id: "pendente", label: "Pendenciado" },
];

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function formatDateTimePendencia(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const data = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

function tipoLabel(tipo: RelatorioTransmissao["tipo_execucao"]) {
  if (tipo === "implantacao") return "Implantação";
  if (tipo === "empresarial") return "Empresarial";
  return "Ainda não informado";
}

function StatusBadge({ status }: { status: RelatorioStatus }) {
  if (status === "avisado") {
    return (
      <Badge className="border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600">
        Avisado
      </Badge>
    );
  }
  if (status === "pendente") {
    return (
      <Badge className="border-orange-600 bg-orange-500 text-white hover:bg-orange-500">
        Pendenciado
      </Badge>
    );
  }
  if (status === "fechado") {
    return <Badge variant="secondary">Fechado</Badge>;
  }
  return (
    <Badge variant="secondary" className="bg-gray-200 text-gray-700 hover:bg-gray-200">
      Em andamento
    </Badge>
  );
}

function Photos({ fotos }: { fotos: StoredPhoto[] }) {
  if (!fotos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {fotos.map((foto) => (
        <div key={foto.path} className="overflow-hidden rounded-lg border">
          <ExpandableImage src={foto.url} alt="Evidência" className="h-28" />
        </div>
      ))}
    </div>
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="mt-0.5 font-medium text-gray-900">{value}</p>
    </div>
  );
}

function EvidenciaBloco({
  title,
  obs,
  fotos,
  canEdit,
  onAdd,
  uploadKey,
  uploading,
}: {
  title: string;
  obs?: string | null;
  fotos: StoredPhoto[];
  canEdit?: boolean;
  onAdd?: (file: EvidencePhotoRef) => void;
  uploadKey?: string;
  uploading?: boolean;
}) {
  if (!fotos.length && !obs && !canEdit) return null;
  return (
    <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      {obs ? <p className="text-xs text-muted-foreground">{obs}</p> : null}
      <Photos fotos={fotos} />
      {canEdit && onAdd ? (
        <div className={uploading ? "pointer-events-none opacity-60" : undefined}>
          <PhotoUpload
            key={uploadKey}
            label="Adicionar foto"
            suffix="inicio"
            value={null}
            onChange={(file) => {
              if (file) onAdd(file);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function RelatorioDetalhe({
  row,
  canEditPhotos,
  onAddPhoto,
  uploadingCategoria,
}: {
  row: RelatorioTransmissao;
  canEditPhotos: boolean;
  onAddPhoto: (categoria: RelatorioFotoCategoria, file: EvidencePhotoRef) => void;
  uploadingCategoria: RelatorioFotoCategoria | null;
}) {
  const payload = row.payload;
  const cabos = payload?.metragensCabo ?? [];
  const cabosRc = payload?.metragensCaboRc ?? [];
  const fotosCabosCount = cabos.reduce(
    (acc, cabo) => acc + Number(Boolean(cabo.fotoInicio)) + Number(Boolean(cabo.fotoFim)),
    0,
  );
  const fotosCabosRcCount = cabosRc.reduce(
    (acc, cabo) => acc + Number(Boolean(cabo.fotoInicio)) + Number(Boolean(cabo.fotoFim)),
    0,
  );
  const blocoCount = (categoria: RelatorioFotoCategoria) => {
    if (categoria === "metragensCabo") return fotosCabosCount;
    if (categoria === "metragensCaboRc") return fotosCabosRcCount;
    if (categoria === "outrasFotos") return payload?.outrasFotos.length ?? 0;
    if (categoria === "outrasFotosRc") return payload?.outrasFotosRc.length ?? 0;
    return payload?.[categoria].fotos.length ?? 0;
  };
  const blocoProps = (categoria: RelatorioFotoCategoria) => ({
    canEdit: canEditPhotos,
    onAdd: (file: EvidencePhotoRef) => onAddPhoto(categoria, file),
    uploadKey: `${row.id}-${categoria}-${blocoCount(categoria)}`,
    uploading: uploadingCategoria === categoria,
  });

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-muted/20 p-4">
        <p className="text-sm text-gray-500">Endereço</p>
        <p className="mt-0.5 font-medium text-gray-900">
          {row.endereco || "—"} · {row.cidade || "—"}
        </p>
        <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-4 sm:grid-cols-3">
          <MetaField label="Cliente" value={row.cliente || "—"} />
          <MetaField label="Responsável" value={row.responsavel || "—"} />
          <MetaField label="Equipe" value={row.equipe_empreiteira || "—"} />
          <MetaField label="Técnico" value={row.tecnico_nome ?? "—"} />
          <MetaField label="Início" value={formatDate(row.data_inicio_execucao)} />
          <MetaField label="Tipo" value={tipoLabel(row.tipo_execucao)} />
          <MetaField label="Tecnologia de Acesso" value={payload?.tecnologiaAcesso || "—"} />
          <MetaField
            label="Lançamento cabos (RC)"
            value={
              payload?.lancamentoRc === true
                ? "SIM"
                : payload?.lancamentoRc === false
                  ? "NÃO"
                  : "—"
            }
          />
        </div>
      </div>

      {row.status === "pendente" ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-semibold">Pendência enviada ao técnico</p>
          <p className="mt-1">
            {row.motivo_pendencia?.trim() || "A supervisão sinalizou uma pendência."}
          </p>
        </div>
      ) : null}

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Postes e metragem
        </h3>
        {cabos.length === 0 && canEditPhotos ? (
          <EvidenciaBloco
            title="Metragem de cabo (RE)"
            obs={null}
            fotos={[]}
            {...blocoProps("metragensCabo")}
          />
        ) : null}
        {cabos.map((cabo, index) => (
          <EvidenciaBloco
            key={cabo.id}
            title={`Cabo ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`}
            obs={cabo.obs}
            fotos={[cabo.fotoInicio, cabo.fotoFim].filter((f): f is StoredPhoto => Boolean(f))}
            {...blocoProps("metragensCabo")}
          />
        ))}
        <EvidenciaBloco
          title="Poste de conexão"
          obs={payload?.posteConexao.obs}
          fotos={payload?.posteConexao.fotos ?? []}
          {...blocoProps("posteConexao")}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Caixas de emenda
        </h3>
        <EvidenciaBloco
          title="Caixa de emenda"
          obs={payload?.caixaEmenda.obs}
          fotos={payload?.caixaEmenda.fotos ?? []}
          {...blocoProps("caixaEmenda")}
        />
        <EvidenciaBloco
          title="Sobra técnica"
          obs={payload?.sobraTecnica.obs}
          fotos={payload?.sobraTecnica.fotos ?? []}
          {...blocoProps("sobraTecnica")}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Demais evidências
        </h3>
        {(
          [
            ["Plaqueta de Identificação", "plaquetaIdentificacao"],
            ["Novo aterramento do poste", "novoAterramentoPoste"],
            ["Aterramento - TERROMETRO", "aterramentoTerrometro"],
            ["Posição DGO/DIO", "posicaoConexaoEstacao"],
            ["Etiqueta na estação/PPC", "etiquetaIdentificacao"],
          ] as const
        ).map(([title, key]) => (
          <EvidenciaBloco
            key={key}
            title={title}
            obs={payload?.[key].obs}
            fotos={payload?.[key].fotos ?? []}
            {...blocoProps(key)}
          />
        ))}
        {(payload?.outrasFotos ?? [])
          .filter((item) => item.foto || item.ref || item.obs)
          .map((item) => (
            <EvidenciaBloco
              key={item.id}
              title={`Outra — ${item.ref || "sem REF"}`}
              obs={item.obs}
              fotos={item.foto ? [item.foto] : []}
            />
          ))}
        <EvidenciaBloco
          title="Outras fotos"
          obs={null}
          fotos={[]}
          {...blocoProps("outrasFotos")}
        />
      </section>

      <section className="space-y-3">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
          Rede Cliente (RC)
        </h3>
        {cabosRc.length === 0 && canEditPhotos ? (
          <EvidenciaBloco
            title="Metragem de cabo (RC)"
            obs={null}
            fotos={[]}
            {...blocoProps("metragensCaboRc")}
          />
        ) : null}
        {cabosRc.map((cabo, index) => (
          <EvidenciaBloco
            key={cabo.id}
            title={`Cabo RC ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`}
            obs={cabo.obs}
            fotos={[cabo.fotoInicio, cabo.fotoFim].filter((f): f is StoredPhoto => Boolean(f))}
            {...blocoProps("metragensCaboRc")}
          />
        ))}
        {(
          [
            ["Poste de conexão (Rede cliente com Rede Externa)", "rcPosteConexao"],
            ["Caixa de emenda na acomodação (Rede cliente com Rede Externa)", "rcCaixaEmenda"],
            ["Terminação do cabo no cliente (PTO/Roseta - área interna)", "rcTerminacaoCabo"],
            ["Plaqueta de Identificação - Terminação do cabo no cliente", "rcPlaquetaIdentificacao"],
            ["Entrada do cabo no cliente (Área interna)", "rcEntradaInterna"],
            ["Entrada do cabo no cliente (Área externa)", "rcEntradaExterna"],
          ] as const
        ).map(([title, key]) => (
          <EvidenciaBloco
            key={key}
            title={title}
            obs={payload?.[key].obs}
            fotos={payload?.[key].fotos ?? []}
            {...blocoProps(key)}
          />
        ))}
        {(payload?.outrasFotosRc ?? [])
          .filter((item) => item.foto || item.ref || item.obs)
          .map((item) => (
            <EvidenciaBloco
              key={item.id}
              title={`Outra (RC) — ${item.ref || "sem REF"}`}
              obs={item.obs}
              fotos={item.foto ? [item.foto] : []}
            />
          ))}
        <EvidenciaBloco
          title="Outras fotos (RC)"
          obs={null}
          fotos={[]}
          {...blocoProps("outrasFotosRc")}
        />
      </section>
    </div>
  );
}

function RelatorioCard({
  row,
  onSelect,
}: {
  row: RelatorioTransmissao;
  onSelect: (row: RelatorioTransmissao) => void;
}) {
  const cardTone =
    row.status === "avisado"
      ? "border-emerald-400 bg-emerald-50/80"
      : row.status === "pendente"
        ? "border-orange-300 bg-orange-50/80"
        : "border-border bg-card";

  return (
    <button
      type="button"
      onClick={() => onSelect(row)}
      className={`w-full rounded-2xl border p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${cardTone}`}
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
          <span className="text-muted-foreground">Técnico: </span>
          {row.tecnico_nome ?? "—"}
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
    </button>
  );
}

function AdminLancamentosPage() {
  const { user } = useApp();
  const canAudit = hasPainelFullAccess(user?.role);
  const [aba, setAba] = useState<AbaContratos>("abertos");
  const [rows, setRows] = useState<RelatorioTransmissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatusAberto>("todos");
  const [selected, setSelected] = useState<RelatorioTransmissao | null>(null);
  const [refreshingDetail, setRefreshingDetail] = useState(false);
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingCategoria, setUploadingCategoria] = useState<RelatorioFotoCategoria | null>(null);

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

  const abrirDetalhe = async (row: RelatorioTransmissao) => {
    setMostrarMotivo(false);
    setMotivo("");
    setSelected(row);
    setRefreshingDetail(true);
    try {
      const fresh = await fetchRelatorioTransmissaoById(row.id);
      setSelected(fresh);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível atualizar o contrato.");
    } finally {
      setRefreshingDetail(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return subscribeRelatoriosTransmissao(() => {
      void load(true);
      if (!selected?.id) return;
      void fetchRelatorioTransmissaoById(selected.id)
        .then(setSelected)
        .catch(() => undefined);
    });
  }, [load, selected?.id]);

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
      const tecnico = (row.tecnico_nome ?? "").toLowerCase();
      return os.includes(termo) || tecnico.includes(termo);
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
        const tecnico = (row.tecnico_nome ?? "").toLowerCase();
        return os.includes(termo) || tecnico.includes(termo);
      });
    }
    if (filtroStatus === "todos") return abertosAposBusca;
    return abertosAposBusca.filter((row) => row.status === filtroStatus);
  }, [aba, contratosFechados, abertosAposBusca, busca, filtroStatus]);

  const onAprovar = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await fecharRelatorioTransmissao(selected.id);
      toast.success("Relatório aprovado e fechado.");
      setSelected(null);
      await load(true);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível aprovar.");
    } finally {
      setSaving(false);
    }
  };

  const onSinalizarPendencia = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await sinalizarPendenciaRelatorio(selected.id, motivo);
      toast.success("Pendência enviada ao técnico. O card ficou marcado como Pendenciado.");
      setSelected(null);
      setMostrarMotivo(false);
      setMotivo("");
      await load(true);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível sinalizar a pendência.");
    } finally {
      setSaving(false);
    }
  };

  const onExcluir = async () => {
    if (!selected) return;
    const ok = window.confirm(
      `Excluir o relatório ${selected.os_wf}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await excluirRelatorioTransmissao(selected.id);
      toast.success("Relatório excluído.");
      setSelected(null);
      await load(true);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível excluir o relatório.");
    } finally {
      setSaving(false);
    }
  };

  const onAdminAddPhoto = async (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
  ) => {
    if (!selected || !user?.id) return;
    setUploadingCategoria(categoria);
    try {
      const stored = await uploadRelatorioPhoto(user.id, file.file, `admin-${categoria}`);
      const nextPayload = appendStoredPhotoToPayload(selected.payload, categoria, stored);
      const saved = await patchRelatorioPayloadAdmin(selected.id, nextPayload);
      setSelected(saved);
      setRows((prev) => prev.map((row) => (row.id === saved.id ? saved : row)));
      toast.success("Foto anexada ao relatório.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível anexar a foto.");
    } finally {
      setUploadingCategoria(null);
    }
  };

  const podeAuditar =
    canAudit &&
    selected &&
    (selected.status === "avisado" ||
      selected.status === "pendente" ||
      selected.status === "em_aberto");

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
                <h1 className="text-2xl font-black tracking-tight">Relatório de campo</h1>
                <p className="text-sm text-muted-foreground">
                  Auditoria de relatórios da equipe de Lançamento (Transmissão)
                </p>
              </div>
            </div>
            <div className="relative w-full md:max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por OS/WF ou Técnico..."
                className="bg-gray-50 pl-9"
                aria-label="Buscar por OS/WF ou técnico"
              />
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
              listaFiltrada.map((row) => (
                <RelatorioCard key={row.id} row={row} onSelect={abrirDetalhe} />
              ))
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
              listaFiltrada.map((row) => (
                <RelatorioCard key={row.id} row={row} onSelect={abrirDetalhe} />
              ))
            )}
          </TabsContent>
        </Tabs>

        <Sheet
          open={Boolean(selected)}
          onOpenChange={(open) => {
            if (!open) {
              setSelected(null);
              setMostrarMotivo(false);
              setMotivo("");
            }
          }}
        >
          <SheetContent
            side="right"
            className="flex h-full max-h-[100dvh] w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl"
          >
            {selected ? (
              <>
                <SheetHeader className="shrink-0 space-y-2 px-6 pb-3 pr-12 pt-6 text-left">
                  <div className="flex flex-wrap items-center gap-2">
                    <SheetTitle>OS/WF {selected.os_wf}</SheetTitle>
                    <StatusBadge status={selected.status} />
                  </div>
                  <SheetDescription>
                    {refreshingDetail ? "Atualizando dados..." : "Dados atualizados do relatório"}
                  </SheetDescription>
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    {canAudit ? (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="border-destructive/40 text-destructive hover:bg-destructive/10"
                        onClick={() => void onExcluir()}
                        disabled={saving}
                      >
                        <Trash2 className="mr-1 h-3.5 w-3.5" />
                        Excluir Relatório
                      </Button>
                    ) : null}
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void abrirDetalhe(selected)}
                    >
                      <RefreshCw className="mr-1 h-3.5 w-3.5" />
                      Atualizar
                    </Button>
                  </div>
                </SheetHeader>

                <div className="min-h-0 flex-1 overflow-y-auto p-4">
                  <EvidencePhotoPasteProvider>
                    <RelatorioDetalhe
                      row={selected}
                      canEditPhotos={canAudit}
                      onAddPhoto={(categoria, file) => void onAdminAddPhoto(categoria, file)}
                      uploadingCategoria={uploadingCategoria}
                    />
                  </EvidencePhotoPasteProvider>
                </div>

                {selected.status === "fechado" || podeAuditar ? (
                  <div className="mt-auto flex shrink-0 flex-col gap-2 border-t border-gray-200 bg-white p-4">
                    {selected.status === "fechado" ? (
                      <Button
                        type="button"
                        className="w-full"
                        onClick={() => toast.info("Geração de PDF em breve.")}
                      >
                        <FileDown className="h-4 w-4" />
                        Gerar PDF
                      </Button>
                    ) : null}
                    {podeAuditar ? (
                      mostrarMotivo ? (
                        <div className="w-full space-y-2">
                          <label className="text-sm font-semibold">
                            Descreva o que precisa ser corrigido
                          </label>
                          <Textarea
                            value={motivo}
                            onChange={(e) => setMotivo(e.target.value)}
                            placeholder="Descreva o que precisa ser corrigido..."
                            rows={4}
                          />
                          <div className="flex justify-end gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              className="flex-1"
                              onClick={() => setMostrarMotivo(false)}
                              disabled={saving}
                            >
                              Cancelar
                            </Button>
                            <Button
                              type="button"
                              variant="destructive"
                              className="flex-1"
                              onClick={() => void onSinalizarPendencia()}
                              disabled={saving}
                            >
                              Confirmar pendência
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex w-full justify-end gap-2">
                          <Button
                            type="button"
                            className="flex-1 bg-emerald-600 hover:bg-emerald-700"
                            onClick={() => void onAprovar()}
                            disabled={saving}
                          >
                            <CheckCircle2 className="h-4 w-4" />
                            Aprovar e Fechar
                          </Button>
                          <Button
                            type="button"
                            variant="destructive"
                            className="flex-1"
                            onClick={() => setMostrarMotivo(true)}
                            disabled={saving}
                          >
                            Sinalizar Pendência
                          </Button>
                        </div>
                      )
                    ) : null}
                  </div>
                ) : null}
              </>
            ) : null}
          </SheetContent>
        </Sheet>
      </main>
    </div>
  );
}
