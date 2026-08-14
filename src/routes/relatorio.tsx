import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, Plus, Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ExpandableImage } from "@/components/ExpandableImage";
import {
  RelatorioFotosBloco,
  newFotoSlot,
  slotsFromStored,
  type FotoSlot,
} from "@/components/RelatorioFotosBloco";
import { useApp } from "@/lib/app-store";
import { requireTecnicoTransmissao } from "@/lib/auth-guards";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  avisarConclusaoRelatorio,
  emptyCaboMetragem,
  emptyRelatorioPayload,
  fetchRelatorioTransmissaoById,
  iniciarOuRetomarRelatorio,
  patchRelatorioDraft,
  uploadRelatorioPhoto,
  type CaboMetragemPayload,
  type RelatorioFotoGrupoKey,
  type RelatorioPayload,
  type RelatorioStatus,
  type RelatorioTransmissao,
  type StoredPhoto,
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";

type RelatorioSearch = {
  id?: string;
};

export const Route = createFileRoute("/relatorio")({
  beforeLoad: () => requireTecnicoTransmissao(),
  validateSearch: (search: Record<string, unknown>): RelatorioSearch => ({
    id: typeof search.id === "string" && search.id.trim() ? search.id.trim() : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Relatório de campo — Estrategic" },
      { name: "description", content: "Relatório de lançamento (transmissão)." },
    ],
  }),
  component: RelatorioPage,
});

type AbaEmpresarial = "RE" | "RC" | "equipamento" | "teste-optico" | "teste-potencia";

const ABAS_EMPRESARIAIS: { id: AbaEmpresarial; label: string }[] = [
  { id: "RE", label: "Rede Acesso (RE)" },
  { id: "RC", label: "Rede Cliente (RC)" },
  { id: "equipamento", label: "Equipamento" },
  { id: "teste-optico", label: "Teste Óptico" },
  { id: "teste-potencia", label: "Teste Potência" },
];

type OutraFotoState = {
  id: string;
  ref: string;
  file: EvidencePhotoRef | null;
  stored: StoredPhoto | null;
  obs: string;
};

function inputClass() {
  return "w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted";
}

function ChoiceButton({
  active,
  children,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

function fotosDosSlots(slots: FotoSlot[]): StoredPhoto[] {
  return slots.map((slot) => slot.stored).filter((foto): foto is StoredPhoto => Boolean(foto));
}

function RelatorioPage() {
  const { user } = useApp();
  const { id: reportIdFromUrl } = Route.useSearch();
  const [step, setStep] = useState<1 | 2>(1);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [osWfInput, setOsWfInput] = useState("");
  const [osWf, setOsWf] = useState("");
  const [status, setStatus] = useState<RelatorioStatus>("em_aberto");
  const [motivoPendencia, setMotivoPendencia] = useState<string | null>(null);
  const [loadingById, setLoadingById] = useState(Boolean(reportIdFromUrl));
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [equipe, setEquipe] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [tipo, setTipo] = useState<TipoExecucao | "">("");
  const [abaEmpresarial, setAbaEmpresarial] = useState<AbaEmpresarial>("RE");
  const [lancamentoRe, setLancamentoRe] = useState<"sim" | "nao" | "">("");
  const [cabos, setCabos] = useState<CaboMetragemPayload[]>(() => [emptyCaboMetragem()]);
  const [poste, setPoste] = useState<FotoSlot[]>([newFotoSlot()]);
  const [posteObs, setPosteObs] = useState("");
  const [caixa, setCaixa] = useState<FotoSlot[]>([newFotoSlot()]);
  const [caixaObs, setCaixaObs] = useState("");
  const [plaqueta, setPlaqueta] = useState<FotoSlot[]>([newFotoSlot()]);
  const [plaquetaObs, setPlaquetaObs] = useState("");
  const [sobra, setSobra] = useState<FotoSlot[]>(() => [newFotoSlot(), newFotoSlot()]);
  const [sobraObs, setSobraObs] = useState("");
  const [terrometro, setTerrometro] = useState<FotoSlot[]>([newFotoSlot()]);
  const [terrometroObs, setTerrometroObs] = useState("");
  const [novoAterramento, setNovoAterramento] = useState<FotoSlot[]>([newFotoSlot()]);
  const [novoAterramentoObs, setNovoAterramentoObs] = useState("");
  const [posicao, setPosicao] = useState<FotoSlot[]>([newFotoSlot()]);
  const [posicaoObs, setPosicaoObs] = useState("");
  const [etiqueta, setEtiqueta] = useState<FotoSlot[]>([newFotoSlot()]);
  const [etiquetaObs, setEtiquetaObs] = useState("");
  const [outras, setOutras] = useState<OutraFotoState[]>(() => [
    { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" },
  ]);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveHint, setSaveHint] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canAutosaveRef = useRef(false);

  const buildPayload = useCallback((): RelatorioPayload => {
    if (tipo !== "empresarial") {
      return emptyRelatorioPayload();
    }
    return {
      ...emptyRelatorioPayload(),
      lancamentoRe: lancamentoRe === "sim" ? true : lancamentoRe === "nao" ? false : null,
      metragensCabo: cabos,
      posteConexao: { fotos: fotosDosSlots(poste), obs: posteObs },
      caixaEmenda: { fotos: fotosDosSlots(caixa), obs: caixaObs },
      plaquetaIdentificacao: { fotos: fotosDosSlots(plaqueta), obs: plaquetaObs },
      novoAterramentoPoste: { fotos: fotosDosSlots(novoAterramento), obs: novoAterramentoObs },
      aterramentoTerrometro: { fotos: fotosDosSlots(terrometro), obs: terrometroObs },
      posicaoConexaoEstacao: { fotos: fotosDosSlots(posicao), obs: posicaoObs },
      etiquetaIdentificacao: { fotos: fotosDosSlots(etiqueta), obs: etiquetaObs },
      sobraTecnica: { fotos: fotosDosSlots(sobra), obs: sobraObs },
      outrasFotos: outras.map((item) => ({
        id: item.id,
        ref: item.ref,
        foto: item.stored,
        obs: item.obs,
      })),
    };
  }, [
    tipo,
    lancamentoRe,
    cabos,
    poste,
    posteObs,
    caixa,
    caixaObs,
    plaqueta,
    plaquetaObs,
    novoAterramento,
    novoAterramentoObs,
    terrometro,
    terrometroObs,
    posicao,
    posicaoObs,
    etiqueta,
    etiquetaObs,
    sobra,
    sobraObs,
    outras,
  ]);

  const persistDraft = useCallback(
    async (payloadOverride?: RelatorioPayload) => {
      if (!currentReportId || (status !== "em_aberto" && status !== "pendente")) return;
      setSaveHint("saving");
      try {
        await patchRelatorioDraft(currentReportId, {
          cliente,
          endereco,
          cidade,
          equipe_empreiteira: equipe,
          responsavel,
          data_inicio_execucao: dataInicio || null,
          tipo_execucao: tipo || null,
          payload: payloadOverride ?? buildPayload(),
        });
        setSaveHint("saved");
      } catch (err) {
        console.error(err);
        setSaveHint("error");
      }
    },
    [
      currentReportId,
      status,
      cliente,
      endereco,
      cidade,
      equipe,
      responsavel,
      dataInicio,
      tipo,
      buildPayload,
    ],
  );

  useDebouncedEffect(
    () => {
      if (!canAutosaveRef.current) return;
      void persistDraft();
    },
    [
      cliente,
      endereco,
      cidade,
      equipe,
      responsavel,
      dataInicio,
      tipo,
      lancamentoRe,
      cabos,
      posteObs,
      caixaObs,
      plaquetaObs,
      sobraObs,
      terrometroObs,
      novoAterramentoObs,
      posicaoObs,
      etiquetaObs,
      poste,
      caixa,
      plaqueta,
      sobra,
      terrometro,
      novoAterramento,
      posicao,
      etiqueta,
      outras,
    ],
    1500,
    step === 2 && Boolean(currentReportId) && (status === "em_aberto" || status === "pendente"),
  );

  const applyRelatorio = (row: RelatorioTransmissao) => {
    canAutosaveRef.current = false;
    const p = row.payload ?? emptyRelatorioPayload();
    setCurrentReportId(row.id);
    setOsWf(row.os_wf);
    setStatus(row.status);
    setMotivoPendencia(row.motivo_pendencia);
    setCliente(row.cliente);
    setEndereco(row.endereco);
    setCidade(row.cidade);
    setEquipe(row.equipe_empreiteira);
    setResponsavel(row.responsavel);
    setDataInicio(row.data_inicio_execucao);
    setTipo(row.tipo_execucao ?? "");
    setLancamentoRe(p.lancamentoRe === true ? "sim" : p.lancamentoRe === false ? "nao" : "");
    setCabos(p.metragensCabo.length > 0 ? p.metragensCabo : [emptyCaboMetragem()]);
    setPoste(slotsFromStored(p.posteConexao?.fotos ?? [], 1));
    setPosteObs(p.posteConexao?.obs ?? "");
    setCaixa(slotsFromStored(p.caixaEmenda?.fotos ?? [], 1));
    setCaixaObs(p.caixaEmenda?.obs ?? "");
    setPlaqueta(slotsFromStored(p.plaquetaIdentificacao?.fotos ?? [], 1));
    setPlaquetaObs(p.plaquetaIdentificacao?.obs ?? "");
    setSobra(slotsFromStored(p.sobraTecnica?.fotos ?? [], 2));
    setSobraObs(p.sobraTecnica?.obs ?? "");
    setTerrometro(slotsFromStored(p.aterramentoTerrometro?.fotos ?? [], 1));
    setTerrometroObs(p.aterramentoTerrometro?.obs ?? "");
    setNovoAterramento(slotsFromStored(p.novoAterramentoPoste?.fotos ?? [], 1));
    setNovoAterramentoObs(p.novoAterramentoPoste?.obs ?? "");
    setPosicao(slotsFromStored(p.posicaoConexaoEstacao?.fotos ?? [], 1));
    setPosicaoObs(p.posicaoConexaoEstacao?.obs ?? "");
    setEtiqueta(slotsFromStored(p.etiquetaIdentificacao?.fotos ?? [], 1));
    setEtiquetaObs(p.etiquetaIdentificacao?.obs ?? "");
    const outrasCarregadas = (p.outrasFotos ?? []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      ref: item.ref,
      file: null as EvidencePhotoRef | null,
      stored: item.foto,
      obs: item.obs,
    }));
    setOutras(
      outrasCarregadas.length > 0
        ? outrasCarregadas
        : [{ id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" }],
    );
    setStep(2);
    if (row.status === "em_aberto" || row.status === "pendente") {
      window.setTimeout(() => {
        canAutosaveRef.current = true;
      }, 800);
    }
  };

  useEffect(() => {
    if (!reportIdFromUrl || !user?.id) {
      setLoadingById(false);
      return;
    }

    let cancelled = false;
    void (async () => {
      setLoadingById(true);
      try {
        const row = await fetchRelatorioTransmissaoById(reportIdFromUrl);
        if (cancelled) return;
        if (row.tecnico_id !== user.id) {
          toast.error("Este relatório não pertence à sua conta.");
          return;
        }
        applyRelatorio(row);
      } catch {
        if (!cancelled) toast.error("Relatório não encontrado.");
      } finally {
        if (!cancelled) setLoadingById(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // applyRelatorio is local and uses setters — load once per id/user
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportIdFromUrl, user?.id]);

  const onIniciar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.id) return;
    const os = osWfInput.trim();
    if (!os) {
      toast.error("Digite a OS/WF.");
      return;
    }
    setStarting(true);
    try {
      const { relatorio, retomado } = await iniciarOuRetomarRelatorio(user.id, os);
      applyRelatorio(relatorio);
      toast.success(
        retomado
          ? "Relatório em aberto encontrado. Continuando de onde parou."
          : "Relatório iniciado. O preenchimento já aparece no painel admin.",
      );
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível iniciar o relatório.");
    } finally {
      setStarting(false);
    }
  };

  const uploadFotoImediato = async (
    file: EvidencePhotoRef,
    tag: string,
    applyStored: (stored: StoredPhoto) => RelatorioPayload,
  ) => {
    if (!user?.id || !currentReportId) return;
    setSaveHint("saving");
    try {
      const stored = await uploadRelatorioPhoto(user.id, file.file, tag);
      const payload = applyStored(stored);
      await persistDraft(payload);
    } catch (err) {
      toast.error((err as Error).message || "Falha no upload da foto.");
      setSaveHint("error");
    }
  };

  const handleGrupoPhoto = (
    setter: React.Dispatch<React.SetStateAction<FotoSlot[]>>,
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      setter((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, stored: null, file: null } : slot)),
      );
      return;
    }
    void uploadFotoImediato(file, `${grupoKey}-${slotId.slice(0, 8)}`, (stored) => {
      let nextSlots: FotoSlot[] = [];
      setter((prev) => {
        nextSlots = prev.map((slot) =>
          slot.id === slotId ? { ...slot, file: null, stored } : slot,
        );
        return nextSlots;
      });
      const grupo = buildPayload()[grupoKey];
      return {
        ...buildPayload(),
        [grupoKey]: { ...grupo, fotos: fotosDosSlots(nextSlots) },
      };
    });
  };

  const handleCaboPhoto = (
    caboId: string,
    campo: "fotoInicio" | "fotoFim",
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      setCabos((prev) => prev.map((item) => (item.id === caboId ? { ...item, [campo]: null } : item)));
      return;
    }
    void uploadFotoImediato(file, `cabo-${campo}-${caboId.slice(0, 8)}`, (stored) => {
      let nextCabos: CaboMetragemPayload[] = [];
      setCabos((prev) => {
        nextCabos = prev.map((item) => (item.id === caboId ? { ...item, [campo]: stored } : item));
        return nextCabos;
      });
      return { ...buildPayload(), metragensCabo: nextCabos };
    });
  };

  const patchCabo = (caboId: string, patch: Partial<CaboMetragemPayload>) => {
    setCabos((prev) => prev.map((item) => (item.id === caboId ? { ...item, ...patch } : item)));
  };

  const headerOk = useMemo(
    () =>
      Boolean(
        osWf.trim() &&
          cliente.trim() &&
          endereco.trim() &&
          cidade.trim() &&
          equipe.trim() &&
          responsavel.trim() &&
          dataInicio &&
          tipo,
      ),
    [osWf, cliente, endereco, cidade, equipe, responsavel, dataInicio, tipo],
  );

  const onAvisar = async () => {
    if (!currentReportId || (status !== "em_aberto" && status !== "pendente")) return;
    if (!headerOk) {
      toast.error("Preencha os dados da obra e o tipo de execução antes de avisar.");
      return;
    }
    setSubmitting(true);
    try {
      await persistDraft();
      const saved = await avisarConclusaoRelatorio(currentReportId);
      setStatus(saved.status);
      setMotivoPendencia(null);
      canAutosaveRef.current = false;
      toast.success(
        status === "pendente"
          ? "Correção enviada. O relatório voltou para análise do admin."
          : "Conclusão avisada. O relatório foi para análise.",
      );
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível avisar o relatório.");
    } finally {
      setSubmitting(false);
    }
  };

  const showReMetragem = tipo === "empresarial" && lancamentoRe === "sim";
  const readOnly = status === "avisado" || status === "fechado";
  const voltarInicio = () => {
    canAutosaveRef.current = false;
    setStep(1);
    setCurrentReportId(null);
    setOsWfInput("");
    setMotivoPendencia(null);
    setSaveHint("idle");
  };

  if (loadingById) {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-10">
          <p className="text-sm text-muted-foreground">Carregando relatório...</p>
        </main>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader />
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-4">
          <Link
            to="/"
            className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Voltar
          </Link>
          <header className="mb-6">
            <h1 className="text-2xl font-black tracking-tight">Relatório de campo</h1>
            <p className="text-sm text-muted-foreground">
              Informe a OS/WF para iniciar ou retomar um relatório em aberto.
            </p>
          </header>
          <form
            onSubmit={onIniciar}
            className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
          >
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Digite a OS/WF</label>
              <input
                type="text"
                value={osWfInput}
                onChange={(e) => setOsWfInput(e.target.value)}
                placeholder="Ex: WF-12345"
                className={inputClass()}
                required
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={starting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover disabled:opacity-60"
            >
              <Save className="h-5 w-5" />
              {starting ? "Abrindo..." : "Iniciar/Salvar Relatório"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-4">
        <button
          type="button"
          onClick={voltarInicio}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Trocar OS/WF
        </button>

        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Relatório {osWf}</h1>
            <p className="text-sm text-muted-foreground">
              {readOnly
                ? "Somente visualização — este relatório já foi avisado ou fechado."
                : status === "pendente"
                  ? "Corrija os pontos indicados e avise novamente a conclusão."
                  : "Rascunho vivo — salvamento automático. O admin já enxerga este contrato."}
            </p>
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {readOnly
              ? status === "fechado"
                ? "Fechado"
                : "Avisado"
              : saveHint === "saving"
                ? "Salvando..."
                : saveHint === "saved"
                  ? "Salvo"
                  : saveHint === "error"
                    ? "Falha ao salvar"
                    : status === "pendente"
                      ? "Pendência"
                      : "Em aberto"}
          </span>
        </header>

        {status === "pendente" ? (
          <div
            role="alert"
            className="mb-5 flex gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              <span className="font-semibold">Relatório com pendência: </span>
              {motivoPendencia?.trim() || "A supervisão solicitou correções neste relatório."}
            </p>
          </div>
        ) : null}

        <form
          id="relatorio-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onAvisar();
          }}
          className="space-y-5"
        >
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">Dados da obra</h2>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">OS/WF</label>
              <input type="text" value={osWf} readOnly className={`${inputClass()} bg-muted`} />
            </div>
            {(
              [
                ["Cliente", cliente, setCliente, "Nome do cliente"],
                ["Endereço", endereco, setEndereco, "Rua, número"],
                ["Cidade", cidade, setCidade, "Cidade"],
                ["Equipe/Empreiteira", equipe, setEquipe, "Equipe responsável"],
                ["Responsável", responsavel, setResponsavel, "Nome do responsável"],
              ] as const
            ).map(([label, value, setter, placeholder]) => (
              <div key={label}>
                <label className="mb-1.5 block text-sm font-semibold">{label}</label>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setter(e.target.value)}
                  onBlur={() => {
                    if (canAutosaveRef.current) void persistDraft();
                  }}
                  placeholder={placeholder}
                  className={inputClass()}
                  disabled={readOnly}
                />
              </div>
            ))}
            <div>
              <label className="mb-1.5 block text-sm font-semibold">
                Data de início da execução
              </label>
              <input
                type="date"
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                disabled={readOnly}
                className={inputClass()}
              />
            </div>
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">Tipo de execução</h2>
            <div className="flex gap-2">
              <ChoiceButton
                active={tipo === "implantacao"}
                onClick={() => setTipo("implantacao")}
                disabled={readOnly}
              >
                Implantação
              </ChoiceButton>
              <ChoiceButton
                active={tipo === "empresarial"}
                onClick={() => setTipo("empresarial")}
                disabled={readOnly}
              >
                Empresarial
              </ChoiceButton>
            </div>
          </div>

          {tipo === "empresarial" ? (
            <>
              <nav
                className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1"
                aria-label="Seções do relatório empresarial"
              >
                {ABAS_EMPRESARIAIS.map((aba) => {
                  const ativa = abaEmpresarial === aba.id;
                  return (
                    <button
                      key={aba.id}
                      type="button"
                      onClick={() => setAbaEmpresarial(aba.id)}
                      className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
                        ativa
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-card text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {aba.label}
                    </button>
                  );
                })}
              </nav>

              {abaEmpresarial === "RE" ? (
            <EvidencePhotoPasteProvider>
              <>
                  <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="text-base font-bold">Lançamento cabos (RE)?</h2>
                    <div className="flex gap-2">
                      <ChoiceButton
                        active={lancamentoRe === "sim"}
                        onClick={() => {
                          setLancamentoRe("sim");
                          setCabos((prev) => (prev.length ? prev : [emptyCaboMetragem()]));
                        }}
                        disabled={readOnly}
                      >
                        SIM
                      </ChoiceButton>
                      <ChoiceButton
                        active={lancamentoRe === "nao"}
                        onClick={() => setLancamentoRe("nao")}
                        disabled={readOnly}
                      >
                        NÃO
                      </ChoiceButton>
                    </div>
                  </div>
                    {showReMetragem ? (
                      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                        <h2 className="text-base font-bold">Metragem de cabo</h2>
                        {cabos.map((cabo, index) => (
                          <div
                            key={cabo.id}
                            className="space-y-3 rounded-xl border border-border p-4"
                          >
                            <p className="text-sm font-semibold">Cabo {index + 1}</p>
                            <div>
                              <label className="mb-1.5 block text-sm font-semibold">
                                Tipo do cabo
                              </label>
                              <input
                                type="text"
                                value={cabo.tipoCabo}
                                onChange={(e) => patchCabo(cabo.id, { tipoCabo: e.target.value })}
                                placeholder="Ex: 12FO"
                                disabled={readOnly}
                                className={inputClass()}
                              />
                            </div>
                            <div>
                              <label className="mb-1.5 block text-sm font-semibold">Metragem</label>
                              <input
                                inputMode="decimal"
                                value={cabo.metragem}
                                onChange={(e) => patchCabo(cabo.id, { metragem: e.target.value })}
                                disabled={readOnly}
                                className={inputClass()}
                              />
                            </div>
                            {cabo.fotoInicio ? (
                              <div className="overflow-hidden rounded-xl border">
                                <p className="px-2 pt-2 text-sm font-semibold">Foto inicial</p>
                                <ExpandableImage src={cabo.fotoInicio.url} alt="Foto inicial" />
                                {readOnly ? null : (
                                  <button
                                    type="button"
                                    className="w-full py-2 text-xs text-primary"
                                    onClick={() => handleCaboPhoto(cabo.id, "fotoInicio", null)}
                                  >
                                    Trocar foto
                                  </button>
                                )}
                              </div>
                            ) : readOnly ? (
                              <p className="text-sm text-muted-foreground">Sem foto inicial.</p>
                            ) : (
                              <PhotoUpload
                                label="Foto inicial"
                                suffix="inicio"
                                value={null}
                                onChange={(file) => {
                                  if (file) handleCaboPhoto(cabo.id, "fotoInicio", file);
                                }}
                              />
                            )}
                            {cabo.fotoFim ? (
                              <div className="overflow-hidden rounded-xl border">
                                <p className="px-2 pt-2 text-sm font-semibold">Foto final</p>
                                <ExpandableImage src={cabo.fotoFim.url} alt="Foto final" />
                                {readOnly ? null : (
                                  <button
                                    type="button"
                                    className="w-full py-2 text-xs text-primary"
                                    onClick={() => handleCaboPhoto(cabo.id, "fotoFim", null)}
                                  >
                                    Trocar foto
                                  </button>
                                )}
                              </div>
                            ) : readOnly ? (
                              <p className="text-sm text-muted-foreground">Sem foto final.</p>
                            ) : (
                              <PhotoUpload
                                label="Foto final"
                                suffix="fim"
                                value={null}
                                onChange={(file) => {
                                  if (file) handleCaboPhoto(cabo.id, "fotoFim", file);
                                }}
                              />
                            )}
                            <div>
                              <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                              <textarea
                                value={cabo.obs}
                                onChange={(e) => patchCabo(cabo.id, { obs: e.target.value })}
                                rows={3}
                                disabled={readOnly}
                                className={inputClass()}
                              />
                            </div>
                          </div>
                        ))}
                        {readOnly ? null : (
                          <button
                            type="button"
                            onClick={() => setCabos((prev) => [...prev, emptyCaboMetragem()])}
                            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                          >
                            <Plus className="h-4 w-4" /> Adicionar mais cabo
                          </button>
                        )}
                      </div>
                    ) : null}

                  <RelatorioFotosBloco
                    title="Poste de conexão"
                    slots={poste}
                    onChange={setPoste}
                    obs={posteObs}
                    onObsChange={setPosteObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setPoste, "posteConexao", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Caixa de emenda"
                    slots={caixa}
                    onChange={setCaixa}
                    obs={caixaObs}
                    onObsChange={setCaixaObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setCaixa, "caixaEmenda", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Plaqueta de Identificação"
                    slots={plaqueta}
                    onChange={setPlaqueta}
                    obs={plaquetaObs}
                    onObsChange={setPlaquetaObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setPlaqueta, "plaquetaIdentificacao", id, file)
                    }
                  />
                  <RelatorioFotosBloco
                    title="Sobra técnica / Fiberloop instalado"
                    hint="Duas fotos iniciais"
                    slots={sobra}
                    onChange={setSobra}
                    obs={sobraObs}
                    onObsChange={setSobraObs}
                    minSlots={2}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setSobra, "sobraTecnica", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Novo aterramento do poste"
                    slots={novoAterramento}
                    onChange={setNovoAterramento}
                    obs={novoAterramentoObs}
                    onObsChange={setNovoAterramentoObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setNovoAterramento, "novoAterramentoPoste", id, file)
                    }
                  />
                  <RelatorioFotosBloco
                    title="Aterramento - TERROMETRO"
                    slots={terrometro}
                    onChange={setTerrometro}
                    obs={terrometroObs}
                    onObsChange={setTerrometroObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setTerrometro, "aterramentoTerrometro", id, file)
                    }
                  />
                  <RelatorioFotosBloco
                    title="Posição de conexão na Estação/PPC (DGO/DIO)"
                    slots={posicao}
                    onChange={setPosicao}
                    obs={posicaoObs}
                    onObsChange={setPosicaoObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setPosicao, "posicaoConexaoEstacao", id, file)
                    }
                  />
                  <RelatorioFotosBloco
                    title="ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC"
                    slots={etiqueta}
                    onChange={setEtiqueta}
                    obs={etiquetaObs}
                    onObsChange={setEtiquetaObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setEtiqueta, "etiquetaIdentificacao", id, file)
                    }
                  />

              <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-base font-bold">Outras fotos</h2>
                {outras.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
                ) : (
                  outras.map((item, index) => (
                    <div key={item.id} className="space-y-3 rounded-xl border border-border p-4">
                      <label className="mb-1.5 block text-sm font-semibold">REF:</label>
                      <input
                        type="text"
                        value={item.ref}
                        onChange={(e) =>
                          setOutras((prev) =>
                            prev.map((row) =>
                              row.id === item.id ? { ...row, ref: e.target.value } : row,
                            ),
                          )
                        }
                        className={inputClass()}
                        disabled={readOnly}
                      />
                      {item.stored ? (
                        <div>
                          <ExpandableImage src={item.stored.url} alt={item.ref || "Outra foto"} />
                          {readOnly ? null : (
                            <button
                              type="button"
                              className="mt-1 text-xs text-primary"
                              onClick={() =>
                                setOutras((prev) =>
                                  prev.map((row) =>
                                    row.id === item.id ? { ...row, stored: null, file: null } : row,
                                  ),
                                )
                              }
                            >
                              Trocar foto
                            </button>
                          )}
                        </div>
                      ) : readOnly ? (
                        <p className="text-sm text-muted-foreground">Sem foto.</p>
                      ) : (
                        <PhotoUpload
                          label="Foto"
                          suffix={index === 0 ? "inicio" : "fim"}
                          value={null}
                          onChange={(file) => {
                            if (!file) return;
                            void uploadFotoImediato(file, `outra-${item.id.slice(0, 8)}`, (stored) => {
                              setOutras((prev) =>
                                prev.map((row) =>
                                  row.id === item.id ? { ...row, file: null, stored } : row,
                                ),
                              );
                              return {
                                ...buildPayload(),
                                outrasFotos: outras.map((row) =>
                                  row.id === item.id
                                    ? { id: row.id, ref: row.ref, foto: stored, obs: row.obs }
                                    : {
                                        id: row.id,
                                        ref: row.ref,
                                        foto: row.stored,
                                        obs: row.obs,
                                      },
                                ),
                              };
                            });
                          }}
                        />
                      )}
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                        <textarea
                          value={item.obs}
                          onChange={(e) =>
                            setOutras((prev) =>
                              prev.map((row) =>
                                row.id === item.id ? { ...row, obs: e.target.value } : row,
                              ),
                            )
                          }
                          rows={2}
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
                    </div>
                  ))
                )}
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() =>
                      setOutras((prev) => [
                        ...prev,
                        { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" },
                      ])
                    }
                    className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
                  >
                    <Plus className="h-4 w-4" /> Adicionar mais fotos
                  </button>
                )}
              </div>
              </>
            </EvidencePhotoPasteProvider>
              ) : (
                <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                  Campos em definição.
                </div>
              )}
            </>
          ) : tipo === "implantacao" ? (
            <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
              Os campos específicos de Implantação serão definidos em breve. Você já pode avisar a
              conclusão do relatório.
            </div>
          ) : null}
        </form>
      </main>

      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button
              type="button"
              onClick={() => void onAvisar()}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <Bell className="h-5 w-5" />
              {submitting ? "Avisando..." : "Avisar conclusão de relatório"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
