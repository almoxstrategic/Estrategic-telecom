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
  emptyRelatorioPayload,
  fetchRelatorioTransmissaoById,
  iniciarOuRetomarRelatorio,
  patchRelatorioDraft,
  uploadRelatorioPhoto,
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
  const [lancamentoRe, setLancamentoRe] = useState<"sim" | "nao" | "">("");
  const [qntPostesRe, setQntPostesRe] = useState("");
  const [metragem, setMetragem] = useState("");
  const [metragemObs, setMetragemObs] = useState("");
  const [fotoInicioStored, setFotoInicioStored] = useState<StoredPhoto | null>(null);
  const [fotoFimStored, setFotoFimStored] = useState<StoredPhoto | null>(null);
  const [fotosExtrasRe, setFotosExtrasRe] = useState<StoredPhoto[]>([]);
  const [poste, setPoste] = useState<FotoSlot[]>([newFotoSlot()]);
  const [posteObs, setPosteObs] = useState("");
  const [caixa, setCaixa] = useState<FotoSlot[]>([newFotoSlot()]);
  const [caixaObs, setCaixaObs] = useState("");
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
  const [outras, setOutras] = useState<OutraFotoState[]>([]);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveHint, setSaveHint] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canAutosaveRef = useRef(false);

  const buildPayload = useCallback((): RelatorioPayload => {
    return {
      ...emptyRelatorioPayload(),
      lancamentoRe: lancamentoRe === "sim" ? true : lancamentoRe === "nao" ? false : null,
      qntPostesRe,
      metragemRe: {
        fotoInicio: fotoInicioStored,
        fotoFim: fotoFimStored,
        metragem,
        obs: metragemObs,
        fotosExtras: fotosExtrasRe,
      },
      posteConexao: { fotos: fotosDosSlots(poste), obs: posteObs },
      caixaEmenda: { fotos: fotosDosSlots(caixa), obs: caixaObs },
      sobraTecnica: { fotos: fotosDosSlots(sobra), obs: sobraObs },
      aterramentoTerrometro: { fotos: fotosDosSlots(terrometro), obs: terrometroObs },
      novoAterramentoPoste: { fotos: fotosDosSlots(novoAterramento), obs: novoAterramentoObs },
      posicaoConexaoEstacao: { fotos: fotosDosSlots(posicao), obs: posicaoObs },
      etiquetaIdentificacao: { fotos: fotosDosSlots(etiqueta), obs: etiquetaObs },
      outrasFotos: outras.map((item) => ({
        id: item.id,
        ref: item.ref,
        foto: item.stored,
        obs: item.obs,
      })),
    };
  }, [
    lancamentoRe,
    qntPostesRe,
    fotoInicioStored,
    fotoFimStored,
    fotosExtrasRe,
    metragem,
    metragemObs,
    poste,
    posteObs,
    caixa,
    caixaObs,
    sobra,
    sobraObs,
    terrometro,
    terrometroObs,
    novoAterramento,
    novoAterramentoObs,
    posicao,
    posicaoObs,
    etiqueta,
    etiquetaObs,
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
      qntPostesRe,
      metragem,
      metragemObs,
      posteObs,
      caixaObs,
      sobraObs,
      terrometroObs,
      novoAterramentoObs,
      posicaoObs,
      etiquetaObs,
      poste,
      caixa,
      sobra,
      terrometro,
      novoAterramento,
      posicao,
      etiqueta,
      outras,
      fotoInicioStored,
      fotoFimStored,
      fotosExtrasRe,
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
    setQntPostesRe(p.qntPostesRe ?? "");
    setMetragem(p.metragemRe?.metragem ?? "");
    setMetragemObs(p.metragemRe?.obs ?? "");
    setFotoInicioStored(p.metragemRe?.fotoInicio ?? null);
    setFotoFimStored(p.metragemRe?.fotoFim ?? null);
    setFotosExtrasRe(p.metragemRe?.fotosExtras ?? []);
    setPoste(slotsFromStored(p.posteConexao?.fotos ?? [], 1));
    setPosteObs(p.posteConexao?.obs ?? "");
    setCaixa(slotsFromStored(p.caixaEmenda?.fotos ?? [], 1));
    setCaixaObs(p.caixaEmenda?.obs ?? "");
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
    setOutras(
      (p.outrasFotos ?? []).map((item) => ({
        id: item.id || crypto.randomUUID(),
        ref: item.ref,
        file: null,
        stored: item.foto,
        obs: item.obs,
      })),
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
    tag: string,
    slotId: string,
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      setter((prev) => prev.map((slot) => (slot.id === slotId ? { ...slot, stored: null, file: null } : slot)));
      return;
    }
    void uploadFotoImediato(file, `${tag}-${slotId.slice(0, 8)}`, (stored) => {
      setter((prev) =>
        prev.map((slot) => (slot.id === slotId ? { ...slot, file: null, stored } : slot)),
      );
      const nextSlots = (
        tag === "poste"
          ? poste
          : tag === "caixa"
            ? caixa
            : tag === "sobra"
              ? sobra
              : tag === "terrometro"
                ? terrometro
                : tag === "novo-aterramento"
                  ? novoAterramento
                  : tag === "posicao"
                    ? posicao
                    : etiqueta
      ).map((slot) => (slot.id === slotId ? { ...slot, stored, file: null } : slot));
      const payload = buildPayload();
      const grupoKey =
        tag === "poste"
          ? "posteConexao"
          : tag === "caixa"
            ? "caixaEmenda"
            : tag === "sobra"
              ? "sobraTecnica"
              : tag === "terrometro"
                ? "aterramentoTerrometro"
                : tag === "novo-aterramento"
                  ? "novoAterramentoPoste"
                  : tag === "posicao"
                    ? "posicaoConexaoEstacao"
                    : "etiquetaIdentificacao";
      return {
        ...payload,
        [grupoKey]: { ...payload[grupoKey], fotos: fotosDosSlots(nextSlots) },
      };
    });
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

  const showReMetragem = tipo === "implantacao" && lancamentoRe === "sim";
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

          {tipo ? (
            <EvidencePhotoPasteProvider>
              {tipo === "implantacao" ? (
                <>
                  <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="text-base font-bold">Rede Acesso (RE)</h2>
                    <p className="text-sm font-semibold">Lançamento cabos (RE)?</p>
                    <div className="flex gap-2">
                      <ChoiceButton
                        active={lancamentoRe === "sim"}
                        onClick={() => setLancamentoRe("sim")}
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
                    {showReMetragem ? (
                      <div className="space-y-4">
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold">
                            QNT TOTAL DE POSTES (RE)
                          </label>
                          <input
                            inputMode="numeric"
                            value={qntPostesRe}
                            onChange={(e) => setQntPostesRe(e.target.value.replace(/\D/g, ""))}
                            disabled={readOnly}
                            className={inputClass()}
                          />
                        </div>
                        {fotoInicioStored ? (
                          <div className="overflow-hidden rounded-xl border">
                            <p className="px-2 pt-2 text-sm font-semibold">Foto inicial</p>
                            <ExpandableImage src={fotoInicioStored.url} alt="Foto inicial" />
                            {readOnly ? null : (
                              <button
                                type="button"
                                className="w-full py-2 text-xs text-primary"
                                onClick={() => setFotoInicioStored(null)}
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
                              if (!file) return;
                              void uploadFotoImediato(file, "re-inicio", (stored) => {
                                setFotoInicioStored(stored);
                                return {
                                  ...buildPayload(),
                                  metragemRe: {
                                    ...buildPayload().metragemRe,
                                    fotoInicio: stored,
                                  },
                                };
                              });
                            }}
                          />
                        )}
                        {fotoFimStored ? (
                          <div className="overflow-hidden rounded-xl border">
                            <p className="px-2 pt-2 text-sm font-semibold">Foto final</p>
                            <ExpandableImage src={fotoFimStored.url} alt="Foto final" />
                            {readOnly ? null : (
                              <button
                                type="button"
                                className="w-full py-2 text-xs text-primary"
                                onClick={() => setFotoFimStored(null)}
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
                              if (!file) return;
                              void uploadFotoImediato(file, "re-fim", (stored) => {
                                setFotoFimStored(stored);
                                return {
                                  ...buildPayload(),
                                  metragemRe: {
                                    ...buildPayload().metragemRe,
                                    fotoFim: stored,
                                  },
                                };
                              });
                            }}
                          />
                        )}
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold">Metragem</label>
                          <input
                            inputMode="decimal"
                            value={metragem}
                            onChange={(e) => setMetragem(e.target.value)}
                            disabled={readOnly}
                            className={inputClass()}
                          />
                        </div>
                        <div>
                          <label className="mb-1.5 block text-sm font-semibold">
                            Observação (opcional)
                          </label>
                          <textarea
                            value={metragemObs}
                            onChange={(e) => setMetragemObs(e.target.value)}
                            rows={3}
                            disabled={readOnly}
                            className={inputClass()}
                          />
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <RelatorioFotosBloco
                    title="Poste de conexão"
                    hint="Opcional"
                    slots={poste}
                    onChange={setPoste}
                    obs={posteObs}
                    onObsChange={setPosteObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setPoste, "poste", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Caixa de emenda"
                    hint="Opcional"
                    slots={caixa}
                    onChange={setCaixa}
                    obs={caixaObs}
                    onObsChange={setCaixaObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setCaixa, "caixa", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Sobra técnica"
                    hint="Opcional — duas fotos iniciais"
                    slots={sobra}
                    onChange={setSobra}
                    obs={sobraObs}
                    onObsChange={setSobraObs}
                    minSlots={2}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setSobra, "sobra", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Aterramento — Terrometro"
                    hint="Opcional"
                    slots={terrometro}
                    onChange={setTerrometro}
                    obs={terrometroObs}
                    onObsChange={setTerrometroObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setTerrometro, "terrometro", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Novo aterramento do poste"
                    hint="Opcional"
                    slots={novoAterramento}
                    onChange={setNovoAterramento}
                    obs={novoAterramentoObs}
                    onObsChange={setNovoAterramentoObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) =>
                      handleGrupoPhoto(setNovoAterramento, "novo-aterramento", id, file)
                    }
                  />
                  <RelatorioFotosBloco
                    title="Posição de conexão na Estação/PPC (DGO/DIO)"
                    hint="Opcional"
                    slots={posicao}
                    onChange={setPosicao}
                    obs={posicaoObs}
                    onObsChange={setPosicaoObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setPosicao, "posicao", id, file)}
                  />
                  <RelatorioFotosBloco
                    title="Etiqueta de identificação na Estação/PPC"
                    hint="Opcional"
                    slots={etiqueta}
                    onChange={setEtiqueta}
                    obs={etiquetaObs}
                    onObsChange={setEtiquetaObs}
                    readOnly={readOnly}
                    onPickPhoto={(id, file) => handleGrupoPhoto(setEtiqueta, "etiqueta", id, file)}
                  />
                </>
              ) : (
                <div className="rounded-2xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                  Para execução empresarial, registre as evidências em Outras fotos abaixo.
                </div>
              )}

              <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-base font-bold">Outras fotos</h2>
                  {readOnly ? null : (
                    <button
                      type="button"
                      onClick={() =>
                        setOutras((prev) => [
                          ...prev,
                          { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" },
                        ])
                      }
                      className="inline-flex items-center gap-1 text-sm font-semibold text-primary"
                    >
                      <Plus className="h-4 w-4" /> Adicionar
                    </button>
                  )}
                </div>
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
                      <textarea
                        value={item.obs}
                        onChange={(e) =>
                          setOutras((prev) =>
                            prev.map((row) =>
                              row.id === item.id ? { ...row, obs: e.target.value } : row,
                            ),
                          )
                        }
                        placeholder="Observação (opcional)"
                        rows={2}
                        disabled={readOnly}
                        className={inputClass()}
                      />
                    </div>
                  ))
                )}
              </div>
            </EvidencePhotoPasteProvider>
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
