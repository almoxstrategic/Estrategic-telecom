import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, Save } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { newFotoSlot, slotsFromStored, type FotoSlot } from "@/components/RelatorioFotosBloco";
import {
  ChoiceButton,
  RelatorioAbaFixa,
  RelatorioAbasCampo,
  RelatorioRedeAcesso,
  emptyOutraFoto,
  inputClass,
  type AbaCampo,
  type OutraFotoState,
} from "@/components/RelatorioRedeAcesso";
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

function fotosDosSlots(slots: FotoSlot[]): StoredPhoto[] {
  return slots.map((slot) => slot.stored).filter((foto): foto is StoredPhoto => Boolean(foto));
}

function outrasParaPayload(items: OutraFotoState[]): RelatorioPayload["outrasFotos"] {
  return items.map((item) => ({
    id: item.id,
    ref: item.ref,
    foto: item.stored,
    obs: item.obs,
  }));
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
  const [abaCampo, setAbaCampo] = useState<AbaCampo>("RE");
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
  const [outras, setOutras] = useState<OutraFotoState[]>(() => [emptyOutraFoto()]);
  const [tecnologiaAcesso, setTecnologiaAcesso] = useState("");
  const [lancamentoCabosRC, setLancamentoCabosRC] = useState<"sim" | "nao" | "">("");
  const [cabosRc, setCabosRc] = useState<CaboMetragemPayload[]>(() => [emptyCaboMetragem()]);
  const [rcPoste, setRcPoste] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcPosteObs, setRcPosteObs] = useState("");
  const [rcCaixa, setRcCaixa] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcCaixaObs, setRcCaixaObs] = useState("");
  const [rcTerminacao, setRcTerminacao] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcTerminacaoObs, setRcTerminacaoObs] = useState("");
  const [rcPlaqueta, setRcPlaqueta] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcPlaquetaObs, setRcPlaquetaObs] = useState("");
  const [rcEntradaInterna, setRcEntradaInterna] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcEntradaInternaObs, setRcEntradaInternaObs] = useState("");
  const [rcEntradaExterna, setRcEntradaExterna] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcEntradaExternaObs, setRcEntradaExternaObs] = useState("");
  const [outrasRc, setOutrasRc] = useState<OutraFotoState[]>(() => [emptyOutraFoto()]);
  const [starting, setStarting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveHint, setSaveHint] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const canAutosaveRef = useRef(false);

  const buildPayload = useCallback((): RelatorioPayload => {
    if (tipo !== "empresarial" && tipo !== "implantacao") {
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
      outrasFotos: outrasParaPayload(outras),
      tecnologiaAcesso,
      lancamentoRc:
        lancamentoCabosRC === "sim" ? true : lancamentoCabosRC === "nao" ? false : null,
      metragensCaboRc: cabosRc,
      rcPosteConexao: { fotos: fotosDosSlots(rcPoste), obs: rcPosteObs },
      rcCaixaEmenda: { fotos: fotosDosSlots(rcCaixa), obs: rcCaixaObs },
      rcTerminacaoCabo: { fotos: fotosDosSlots(rcTerminacao), obs: rcTerminacaoObs },
      rcPlaquetaIdentificacao: { fotos: fotosDosSlots(rcPlaqueta), obs: rcPlaquetaObs },
      rcEntradaInterna: { fotos: fotosDosSlots(rcEntradaInterna), obs: rcEntradaInternaObs },
      rcEntradaExterna: { fotos: fotosDosSlots(rcEntradaExterna), obs: rcEntradaExternaObs },
      outrasFotosRc: outrasParaPayload(outrasRc),
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
    tecnologiaAcesso,
    lancamentoCabosRC,
    cabosRc,
    rcPoste,
    rcPosteObs,
    rcCaixa,
    rcCaixaObs,
    rcTerminacao,
    rcTerminacaoObs,
    rcPlaqueta,
    rcPlaquetaObs,
    rcEntradaInterna,
    rcEntradaInternaObs,
    rcEntradaExterna,
    rcEntradaExternaObs,
    outrasRc,
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
      tecnologiaAcesso,
      lancamentoCabosRC,
      cabosRc,
      rcPosteObs,
      rcCaixaObs,
      rcTerminacaoObs,
      rcPlaquetaObs,
      rcEntradaInternaObs,
      rcEntradaExternaObs,
      rcPoste,
      rcCaixa,
      rcTerminacao,
      rcPlaqueta,
      rcEntradaInterna,
      rcEntradaExterna,
      outrasRc,
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
    setOutras(outrasCarregadas.length > 0 ? outrasCarregadas : [emptyOutraFoto()]);
    setTecnologiaAcesso(p.tecnologiaAcesso ?? "");
    setLancamentoCabosRC(p.lancamentoRc === true ? "sim" : p.lancamentoRc === false ? "nao" : "");
    setCabosRc(p.metragensCaboRc.length > 0 ? p.metragensCaboRc : [emptyCaboMetragem()]);
    setRcPoste(slotsFromStored(p.rcPosteConexao?.fotos ?? [], 1));
    setRcPosteObs(p.rcPosteConexao?.obs ?? "");
    setRcCaixa(slotsFromStored(p.rcCaixaEmenda?.fotos ?? [], 1));
    setRcCaixaObs(p.rcCaixaEmenda?.obs ?? "");
    setRcTerminacao(slotsFromStored(p.rcTerminacaoCabo?.fotos ?? [], 1));
    setRcTerminacaoObs(p.rcTerminacaoCabo?.obs ?? "");
    setRcPlaqueta(slotsFromStored(p.rcPlaquetaIdentificacao?.fotos ?? [], 1));
    setRcPlaquetaObs(p.rcPlaquetaIdentificacao?.obs ?? "");
    setRcEntradaInterna(slotsFromStored(p.rcEntradaInterna?.fotos ?? [], 1));
    setRcEntradaInternaObs(p.rcEntradaInterna?.obs ?? "");
    setRcEntradaExterna(slotsFromStored(p.rcEntradaExterna?.fotos ?? [], 1));
    setRcEntradaExternaObs(p.rcEntradaExterna?.obs ?? "");
    const outrasRcCarregadas = (p.outrasFotosRc ?? []).map((item) => ({
      id: item.id || crypto.randomUUID(),
      ref: item.ref,
      file: null as EvidencePhotoRef | null,
      stored: item.foto,
      obs: item.obs,
    }));
    setOutrasRc(outrasRcCarregadas.length > 0 ? outrasRcCarregadas : [emptyOutraFoto()]);
    setStep(2);
    if (row.status === "em_aberto" || row.status === "pendente") {
      window.setTimeout(() => {
        canAutosaveRef.current = true;
      }, 800);
    }
  };

  useEffect(() => {
    if (tipo === "implantacao") {
      setAbaCampo("RE");
    }
  }, [tipo]);

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
    setter: React.Dispatch<React.SetStateAction<CaboMetragemPayload[]>>,
    payloadKey: "metragensCabo" | "metragensCaboRc",
    caboId: string,
    campo: "fotoInicio" | "fotoFim",
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      setter((prev) => prev.map((item) => (item.id === caboId ? { ...item, [campo]: null } : item)));
      return;
    }
    void uploadFotoImediato(file, `${payloadKey}-${campo}-${caboId.slice(0, 8)}`, (stored) => {
      let nextCabos: CaboMetragemPayload[] = [];
      setter((prev) => {
        nextCabos = prev.map((item) => (item.id === caboId ? { ...item, [campo]: stored } : item));
        return nextCabos;
      });
      return { ...buildPayload(), [payloadKey]: nextCabos };
    });
  };

  const handleOutraPhoto = (
    setter: React.Dispatch<React.SetStateAction<OutraFotoState[]>>,
    payloadKey: "outrasFotos" | "outrasFotosRc",
    itemId: string,
    file: EvidencePhotoRef,
  ) => {
    void uploadFotoImediato(file, `${payloadKey}-${itemId.slice(0, 8)}`, (stored) => {
      let next: OutraFotoState[] = [];
      setter((prev) => {
        next = prev.map((row) => (row.id === itemId ? { ...row, file: null, stored } : row));
        return next;
      });
      return { ...buildPayload(), [payloadKey]: outrasParaPayload(next) };
    });
  };

  const patchCabo = (
    setter: React.Dispatch<React.SetStateAction<CaboMetragemPayload[]>>,
    caboId: string,
    patch: Partial<CaboMetragemPayload>,
  ) => {
    setter((prev) => prev.map((item) => (item.id === caboId ? { ...item, ...patch } : item)));
  };

  const grupoSetters: Record<
    RelatorioFotoGrupoKey,
    React.Dispatch<React.SetStateAction<FotoSlot[]>>
  > = {
    posteConexao: setPoste,
    caixaEmenda: setCaixa,
    plaquetaIdentificacao: setPlaqueta,
    sobraTecnica: setSobra,
    novoAterramentoPoste: setNovoAterramento,
    aterramentoTerrometro: setTerrometro,
    posicaoConexaoEstacao: setPosicao,
    etiquetaIdentificacao: setEtiqueta,
    rcPosteConexao: setRcPoste,
    rcCaixaEmenda: setRcCaixa,
    rcTerminacaoCabo: setRcTerminacao,
    rcPlaquetaIdentificacao: setRcPlaqueta,
    rcEntradaInterna: setRcEntradaInterna,
    rcEntradaExterna: setRcEntradaExterna,
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

  const readOnly = status === "avisado" || status === "fechado";
  const mostrarFormularioCampo = tipo === "empresarial" || tipo === "implantacao";
  const mostrarRedeAcesso = tipo === "implantacao" || (tipo === "empresarial" && abaCampo === "RE");
  const mostrarRedeCliente = tipo === "empresarial" && abaCampo === "RC";
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
                onClick={() => {
                  setTipo("implantacao");
                  setAbaCampo("RE");
                }}
                disabled={readOnly}
              >
                Implantação
              </ChoiceButton>
              <ChoiceButton
                active={tipo === "empresarial"}
                onClick={() => {
                  setTipo("empresarial");
                  setAbaCampo("RE");
                }}
                disabled={readOnly}
              >
                Empresarial
              </ChoiceButton>
            </div>
          </div>

          {mostrarFormularioCampo ? (
            <>
              {tipo === "empresarial" ? (
                <RelatorioAbasCampo abaAtiva={abaCampo} onChange={setAbaCampo} />
              ) : (
                <RelatorioAbaFixa label="Rede Acesso (RE)" />
              )}

              {mostrarRedeAcesso ? (
                <RelatorioRedeAcesso
                  readOnly={readOnly}
                  lancamentoRe={lancamentoRe}
                  onLancamentoRe={(value) => {
                    setLancamentoRe(value);
                    if (value === "sim") {
                      setCabos((prev) => (prev.length ? prev : [emptyCaboMetragem()]));
                    }
                  }}
                  cabos={cabos}
                  onPatchCabo={(id, patch) => patchCabo(setCabos, id, patch)}
                  onAddCabo={() => setCabos((prev) => [...prev, emptyCaboMetragem()])}
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(setCabos, "metragensCabo", caboId, campo, file)
                  }
                  grupos={[
                    {
                      grupoKey: "posteConexao",
                      title: "Poste de conexão",
                      slots: poste,
                      onChange: setPoste,
                      obs: posteObs,
                      onObsChange: setPosteObs,
                    },
                    {
                      grupoKey: "caixaEmenda",
                      title: "Caixa de emenda",
                      slots: caixa,
                      onChange: setCaixa,
                      obs: caixaObs,
                      onObsChange: setCaixaObs,
                    },
                    {
                      grupoKey: "plaquetaIdentificacao",
                      title: "Plaqueta de Identificação",
                      slots: plaqueta,
                      onChange: setPlaqueta,
                      obs: plaquetaObs,
                      onObsChange: setPlaquetaObs,
                    },
                    {
                      grupoKey: "sobraTecnica",
                      title: "Sobra técnica / Fiberloop instalado",
                      hint: "Duas fotos iniciais",
                      minSlots: 2,
                      slots: sobra,
                      onChange: setSobra,
                      obs: sobraObs,
                      onObsChange: setSobraObs,
                    },
                    {
                      grupoKey: "novoAterramentoPoste",
                      title: "Novo aterramento do poste",
                      slots: novoAterramento,
                      onChange: setNovoAterramento,
                      obs: novoAterramentoObs,
                      onObsChange: setNovoAterramentoObs,
                    },
                    {
                      grupoKey: "aterramentoTerrometro",
                      title: "Aterramento - TERROMETRO",
                      slots: terrometro,
                      onChange: setTerrometro,
                      obs: terrometroObs,
                      onObsChange: setTerrometroObs,
                    },
                    {
                      grupoKey: "posicaoConexaoEstacao",
                      title: "Posição de conexão na Estação/PPC (DGO/DIO)",
                      slots: posicao,
                      onChange: setPosicao,
                      obs: posicaoObs,
                      onObsChange: setPosicaoObs,
                    },
                    {
                      grupoKey: "etiquetaIdentificacao",
                      title: "ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC",
                      slots: etiqueta,
                      onChange: setEtiqueta,
                      obs: etiquetaObs,
                      onObsChange: setEtiquetaObs,
                    },
                  ]}
                  onGrupoPhoto={(grupoKey, slotId, file) => {
                    handleGrupoPhoto(grupoSetters[grupoKey], grupoKey, slotId, file);
                  }}
                  outras={outras}
                  onOutrasChange={setOutras}
                  onOutraPhoto={(itemId, file) =>
                    handleOutraPhoto(setOutras, "outrasFotos", itemId, file)
                  }
                />
              ) : mostrarRedeCliente ? (
                <RelatorioRedeAcesso
                  readOnly={readOnly}
                  header={
                    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
                      <label
                        htmlFor="tecnologia-acesso"
                        className="mb-1.5 block text-sm font-semibold"
                      >
                        Tecnologia de Acesso
                      </label>
                      <input
                        id="tecnologia-acesso"
                        type="text"
                        value={tecnologiaAcesso}
                        onChange={(e) => setTecnologiaAcesso(e.target.value)}
                        placeholder="Ex: GPON, Metro Ethernet"
                        disabled={readOnly}
                        className={inputClass()}
                      />
                    </div>
                  }
                  lancamentoTitle="Lançamento cabos (RC)?"
                  lancamentoRe={lancamentoCabosRC}
                  onLancamentoRe={(value) => {
                    setLancamentoCabosRC(value);
                    if (value === "sim") {
                      setCabosRc((prev) => (prev.length ? prev : [emptyCaboMetragem()]));
                    }
                  }}
                  cabos={cabosRc}
                  onPatchCabo={(id, patch) => patchCabo(setCabosRc, id, patch)}
                  onAddCabo={() => setCabosRc((prev) => [...prev, emptyCaboMetragem()])}
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(setCabosRc, "metragensCaboRc", caboId, campo, file)
                  }
                  grupos={[
                    {
                      grupoKey: "rcPosteConexao",
                      title: "Poste de conexão (Rede cliente com Rede Externa)",
                      slots: rcPoste,
                      onChange: setRcPoste,
                      obs: rcPosteObs,
                      onObsChange: setRcPosteObs,
                    },
                    {
                      grupoKey: "rcCaixaEmenda",
                      title: "Caixa de emenda na acomodação (Rede cliente com Rede Externa)",
                      slots: rcCaixa,
                      onChange: setRcCaixa,
                      obs: rcCaixaObs,
                      onObsChange: setRcCaixaObs,
                    },
                    {
                      grupoKey: "rcTerminacaoCabo",
                      title: "Terminação do cabo no cliente (PTO/Roseta - área interna)",
                      slots: rcTerminacao,
                      onChange: setRcTerminacao,
                      obs: rcTerminacaoObs,
                      onObsChange: setRcTerminacaoObs,
                    },
                    {
                      grupoKey: "rcPlaquetaIdentificacao",
                      title: "Plaqueta de Identificação - Terminação do cabo no cliente",
                      slots: rcPlaqueta,
                      onChange: setRcPlaqueta,
                      obs: rcPlaquetaObs,
                      onObsChange: setRcPlaquetaObs,
                    },
                    {
                      grupoKey: "rcEntradaInterna",
                      title: "Entrada do cabo no cliente (Área interna)",
                      slots: rcEntradaInterna,
                      onChange: setRcEntradaInterna,
                      obs: rcEntradaInternaObs,
                      onObsChange: setRcEntradaInternaObs,
                    },
                    {
                      grupoKey: "rcEntradaExterna",
                      title: "Entrada do cabo no cliente (Área externa)",
                      slots: rcEntradaExterna,
                      onChange: setRcEntradaExterna,
                      obs: rcEntradaExternaObs,
                      onObsChange: setRcEntradaExternaObs,
                    },
                  ]}
                  onGrupoPhoto={(grupoKey, slotId, file) => {
                    handleGrupoPhoto(grupoSetters[grupoKey], grupoKey, slotId, file);
                  }}
                  outras={outrasRc}
                  onOutrasChange={setOutrasRc}
                  onOutraPhoto={(itemId, file) =>
                    handleOutraPhoto(setOutrasRc, "outrasFotosRc", itemId, file)
                  }
                />
              ) : tipo === "empresarial" ? (
                <div className="rounded-2xl border border-dashed border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">
                  Campos em definição.
                </div>
              ) : null}
            </>
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
