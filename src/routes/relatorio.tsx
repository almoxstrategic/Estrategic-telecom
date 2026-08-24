import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowLeft, Bell, ChevronDown } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { MeusRelatoriosTransmissao } from "@/components/MeusRelatoriosTransmissao";
import { Badge } from "@/components/ui/badge";
import { newFotoSlot, slotsFromStored, type FotoSlot } from "@/components/RelatorioFotosBloco";
import { RelatorioEquipamento } from "@/components/RelatorioEquipamento";
import {
  AbaInfraestrutura,
  AbaMedicoes,
} from "@/components/RelatorioAbasPlaceholder";
import { RelatorioTesteOptico, RelatorioTestePotencia } from "@/components/RelatorioTestes";
import { RelatorioTestePotenciaAtenuacao } from "@/components/RelatorioTestePotenciaAtenuacao";
import { RelatorioSyncStatus } from "@/components/RelatorioSyncStatus";
import {
  RelatorioAbasCampo,
  inputClass,
  RelatorioRedeAcesso,
  TipoExecucaoPicker,
  ABAS_CAMPO_TECNICO,
  ABAS_CAMPO_IMPLANTACAO,
  emptyOutraFoto,
  CampoCoordenadas,
  type AbaCampo,
  type OutraFotoState,
} from "@/components/RelatorioRedeAcesso";
import { useApp } from "@/lib/app-store";
import { requireTecnicoTransmissao } from "@/lib/auth-guards";
import { hasPainelFullAccess } from "@/lib/roles";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  avisarConclusaoRelatorio,
  emptyCaboMetragem,
  emptyCoordenadas,
  emptyCordoalhaBloco,
  emptyDgoClienteItem,
  emptyEquipamentoClienteItem,
  emptyEquipamentoConexoes,
  emptyContatos,
  emptyInfraestrutura,
  emptyMedicaoTomada,
  emptyMedicoes,
  emptyQuantidadesRede,
  emptyRelatorioPayload,
  emptyTesteOptico,
  emptyTestePotencia,
  deleteRelatorioPhoto,
  apenasDigitos,
  calcularMetragemCaboTotal,
  fetchRelatorioTransmissaoById,
  isTecnicoAtribuido,
  janelaPotenciaDerivada,
  patchRelatorioDraft,
  withRetry,
  readObsAdmin,
  removeExtraById,
  subscribeRelatorioTransmissaoById,
  uploadRelatorioPhoto,
  type CaboMetragemPayload,
  type ContatosPayload,
  type DgoClienteItemPayload,
  type EquipamentoClienteItemPayload,
  type EquipamentoConexoesPayload,
  type EscopoPayload,
  type InfraestruturaPayload,
  type MedicoesPayload,
  type RelatorioFotoGrupoKey,
  type RelatorioFotoGrupoKeyEq,
  type RelatorioPayload,
  type QuantidadesRedePayload,
  type RelatorioStatus,
  type RelatorioTransmissao,
  type StoredPhoto,
  type TesteOpticoPayload,
  type TestePotenciaPayload,
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

function grupoPayload(
  slots: FotoSlot[],
  obs: string,
  obsAdmin = "",
): EscopoPayload["posteConexao"] {
  return { fotos: fotosDosSlots(slots), obs, obsAdmin };
}

function outrasParaPayload(items: OutraFotoState[]): EscopoPayload["outrasFotos"] {
  return items.map((item) => ({
    id: item.id,
    ref: item.ref,
    foto: item.stored,
    obs: item.obs,
    obsAdmin: item.obsAdmin ?? "",
  }));
}

function outrasFromPayload(
  items: EscopoPayload["outrasFotos"] | undefined,
): OutraFotoState[] {
  const mapped = (items ?? []).map((item) => ({
    id: item.id || crypto.randomUUID(),
    ref: item.ref,
    file: null as EvidencePhotoRef | null,
    stored: item.foto,
    obs: item.obs,
    obsAdmin: readObsAdmin(item),
  }));
  return mapped.length > 0 ? mapped : [emptyOutraFoto()];
}

function formatDataObra(value: string) {
  if (!value.trim()) return "";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function DadoObraCampo({
  label,
  value,
  className,
}: {
  label: string;
  value: string;
  className?: string;
}) {
  const vazio = !value.trim();
  return (
    <div className={className}>
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={`mt-0.5 text-sm ${vazio ? "font-normal text-gray-400" : "font-semibold text-foreground"}`}
      >
        {vazio ? "Não informado" : value}
      </p>
    </div>
  );
}

type FotoGrupoUi = { slots: FotoSlot[]; obs: string; obsAdmin: string };

const EQ_GRUPO_KEYS: RelatorioFotoGrupoKeyEq[] = [
  "eqClienteFachada",
  "eqClienteAmbiente",
  "eqClienteRack",
  "eqClienteEtiqueta",
  "eqClienteSgp",
  "eqEstacaoGeral",
  "eqEstacaoRack",
  "eqEstacaoEtiqueta",
];

function emptyEqGrupos(): Record<RelatorioFotoGrupoKeyEq, FotoGrupoUi> {
  return {
    eqClienteFachada: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqClienteAmbiente: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqClienteRack: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqClienteEtiqueta: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqClienteSgp: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqEstacaoGeral: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqEstacaoRack: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    eqEstacaoEtiqueta: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
  };
}

function eqGruposFromPayload(
  payload: EscopoPayload,
): Record<RelatorioFotoGrupoKeyEq, FotoGrupoUi> {
  const next = emptyEqGrupos();
  for (const key of EQ_GRUPO_KEYS) {
    const grupo = payload[key];
    next[key] = {
      slots: slotsFromStored(grupo?.fotos ?? [], 1),
      obs: grupo?.obs ?? "",
      obsAdmin: readObsAdmin(grupo),
    };
  }
  return next;
}

function RelatorioPage() {
  const { user } = useApp();
  const { id: reportIdFromUrl } = Route.useSearch();
  const [step, setStep] = useState<1 | 2>(1);
  const [currentReportId, setCurrentReportId] = useState<string | null>(null);
  const [osWf, setOsWf] = useState("");
  const [tecnicosAtribuidos, setTecnicosAtribuidos] = useState<string[]>([]);
  const [tecnicosNomes, setTecnicosNomes] = useState<string[]>([]);
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
  const [duto, setDuto] = useState<FotoSlot[]>([newFotoSlot()]);
  const [dutoObs, setDutoObs] = useState("");
  const [plaqueta, setPlaqueta] = useState<FotoSlot[]>([newFotoSlot()]);
  const [plaquetaObs, setPlaquetaObs] = useState("");
  const [sobra, setSobra] = useState<FotoSlot[]>(() => [newFotoSlot()]);
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
  const [redeAcesso, setRedeAcesso] = useState<QuantidadesRedePayload>(() => emptyQuantidadesRede());
  const [redeCliente, setRedeCliente] = useState<QuantidadesRedePayload>(() => emptyQuantidadesRede());
  const [obsAdminGrupos, setObsAdminGrupos] = useState<
    Partial<Record<RelatorioFotoGrupoKey, string>>
  >({});
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
  const [rcSobra, setRcSobra] = useState<FotoSlot[]>(() => [newFotoSlot()]);
  const [rcSobraObs, setRcSobraObs] = useState("");
  const [outrasRc, setOutrasRc] = useState<OutraFotoState[]>(() => [emptyOutraFoto()]);
  const [eqGrupos, setEqGrupos] = useState<Record<RelatorioFotoGrupoKeyEq, FotoGrupoUi>>(emptyEqGrupos);
  const [eqClienteDgoItens, setEqClienteDgoItens] = useState<DgoClienteItemPayload[]>(() => [
    emptyDgoClienteItem(),
  ]);
  const [eqClienteEquipamentosItens, setEqClienteEquipamentosItens] = useState<
    EquipamentoClienteItemPayload[]
  >(() => [emptyEquipamentoClienteItem()]);
  const [eqEstacaoEquipamentoItens, setEqEstacaoEquipamentoItens] = useState<
    EquipamentoClienteItemPayload[]
  >(() => [emptyEquipamentoClienteItem()]);
  const [eqEstacaoDgoItens, setEqEstacaoDgoItens] = useState<DgoClienteItemPayload[]>(() => [
    emptyDgoClienteItem(),
  ]);
  const [outrasEqCliente, setOutrasEqCliente] = useState<OutraFotoState[]>(() => [emptyOutraFoto()]);
  const [relatorioEstacao, setRelatorioEstacao] = useState<"sim" | "nao">("nao");
  const [estacaoEntregaAcesso, setEstacaoEntregaAcesso] = useState("");
  const [outrasEqEstacao, setOutrasEqEstacao] = useState<OutraFotoState[]>(() => [emptyOutraFoto()]);
  const [testeOptico, setTesteOptico] = useState<TesteOpticoPayload>(() => emptyTesteOptico());
  const [testePotenciaEmpresarial, setTestePotenciaEmpresarial] = useState<TestePotenciaPayload>(
    () => emptyTestePotencia(),
  );
  const [testePotenciaImplantacao, setTestePotenciaImplantacao] = useState<TestePotenciaPayload>(
    () => emptyTestePotencia(),
  );
  const [eqConexoes, setEqConexoes] = useState<EquipamentoConexoesPayload>(() =>
    emptyEquipamentoConexoes(),
  );
  const [infraestrutura, setInfraestrutura] = useState<InfraestruturaPayload>(() =>
    emptyInfraestrutura(),
  );
  const [medicoes, setMedicoes] = useState<MedicoesPayload>(() => emptyMedicoes());
  const [contatos, setContatos] = useState<ContatosPayload>(() => emptyContatos());
  const [submitting, setSubmitting] = useState(false);
  const [saveHint, setSaveHint] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [dadosExpandidos, setDadosExpandidos] = useState(false);
  const canAutosaveRef = useRef(false);
  const lastAppliedUpdatedAtRef = useRef<string | null>(null);
  const lastSavedUpdatedAtRef = useRef<string | null>(null);
  const persistingRef = useRef(false);
  const enableAutosaveTimerRef = useRef<number | null>(null);

  const buildEscopoFromUi = useCallback((): EscopoPayload => {
    return {
      lancamentoRe: lancamentoRe === "sim" ? true : lancamentoRe === "nao" ? false : null,
      metragensCabo: cabos,
      posteConexao: grupoPayload(poste, posteObs, obsAdminGrupos.posteConexao),
      caixaEmenda: grupoPayload(caixa, caixaObs, obsAdminGrupos.caixaEmenda),
      dutoSubterraneo: grupoPayload(duto, dutoObs, obsAdminGrupos.dutoSubterraneo),
      plaquetaIdentificacao: grupoPayload(plaqueta, plaquetaObs, obsAdminGrupos.plaquetaIdentificacao),
      novoAterramentoPoste: grupoPayload(
        novoAterramento,
        novoAterramentoObs,
        obsAdminGrupos.novoAterramentoPoste,
      ),
      aterramentoTerrometro: grupoPayload(
        terrometro,
        terrometroObs,
        obsAdminGrupos.aterramentoTerrometro,
      ),
      posicaoConexaoEstacao: grupoPayload(posicao, posicaoObs, obsAdminGrupos.posicaoConexaoEstacao),
      etiquetaIdentificacao: grupoPayload(etiqueta, etiquetaObs, obsAdminGrupos.etiquetaIdentificacao),
      sobraTecnica: grupoPayload(sobra, sobraObs, obsAdminGrupos.sobraTecnica),
      outrasFotos: outrasParaPayload(outras),
      redeAcesso,
      tecnologiaAcesso,
      lancamentoRc:
        lancamentoCabosRC === "sim" ? true : lancamentoCabosRC === "nao" ? false : null,
      metragensCaboRc: cabosRc,
      rcPosteConexao: grupoPayload(rcPoste, rcPosteObs, obsAdminGrupos.rcPosteConexao),
      rcCaixaEmenda: grupoPayload(rcCaixa, rcCaixaObs, obsAdminGrupos.rcCaixaEmenda),
      rcTerminacaoCabo: grupoPayload(rcTerminacao, rcTerminacaoObs, obsAdminGrupos.rcTerminacaoCabo),
      rcPlaquetaIdentificacao: grupoPayload(
        rcPlaqueta,
        rcPlaquetaObs,
        obsAdminGrupos.rcPlaquetaIdentificacao,
      ),
      rcEntradaInterna: grupoPayload(
        rcEntradaInterna,
        rcEntradaInternaObs,
        obsAdminGrupos.rcEntradaInterna,
      ),
      rcEntradaExterna: grupoPayload(
        rcEntradaExterna,
        rcEntradaExternaObs,
        obsAdminGrupos.rcEntradaExterna,
      ),
      rcSobraTecnica: grupoPayload(rcSobra, rcSobraObs, obsAdminGrupos.rcSobraTecnica),
      outrasFotosRc: outrasParaPayload(outrasRc),
      redeCliente,
      eqClienteFachada: grupoPayload(
        eqGrupos.eqClienteFachada.slots,
        eqGrupos.eqClienteFachada.obs,
        eqGrupos.eqClienteFachada.obsAdmin,
      ),
      eqClienteAmbiente: grupoPayload(
        eqGrupos.eqClienteAmbiente.slots,
        eqGrupos.eqClienteAmbiente.obs,
        eqGrupos.eqClienteAmbiente.obsAdmin,
      ),
      eqClienteRack: grupoPayload(
        eqGrupos.eqClienteRack.slots,
        eqGrupos.eqClienteRack.obs,
        eqGrupos.eqClienteRack.obsAdmin,
      ),
      eqClienteDgo: eqClienteDgoItens,
      eqClienteEquipamentos: eqClienteEquipamentosItens,
      eqClienteEtiqueta: grupoPayload(
        eqGrupos.eqClienteEtiqueta.slots,
        eqGrupos.eqClienteEtiqueta.obs,
        eqGrupos.eqClienteEtiqueta.obsAdmin,
      ),
      eqClienteSgp: grupoPayload(
        eqGrupos.eqClienteSgp.slots,
        eqGrupos.eqClienteSgp.obs,
        eqGrupos.eqClienteSgp.obsAdmin,
      ),
      outrasFotosEqCliente: outrasParaPayload(outrasEqCliente),
      relatorioEstacao: relatorioEstacao === "sim",
      estacaoEntregaAcesso,
      eqEstacaoGeral: grupoPayload(
        eqGrupos.eqEstacaoGeral.slots,
        eqGrupos.eqEstacaoGeral.obs,
        eqGrupos.eqEstacaoGeral.obsAdmin,
      ),
      eqEstacaoRack: grupoPayload(
        eqGrupos.eqEstacaoRack.slots,
        eqGrupos.eqEstacaoRack.obs,
        eqGrupos.eqEstacaoRack.obsAdmin,
      ),
      eqEstacaoEquipamento: eqEstacaoEquipamentoItens,
      eqEstacaoEtiqueta: grupoPayload(
        eqGrupos.eqEstacaoEtiqueta.slots,
        eqGrupos.eqEstacaoEtiqueta.obs,
        eqGrupos.eqEstacaoEtiqueta.obsAdmin,
      ),
      eqEstacaoDgo: eqEstacaoDgoItens,
      outrasFotosEqEstacao: outrasParaPayload(outrasEqEstacao),
      testeOptico,
      testePotenciaEmpresarial,
      testePotenciaImplantacao,
      testePotencia1550: janelaPotenciaDerivada(redeAcesso, redeCliente),
      testePotencia1330: janelaPotenciaDerivada(redeAcesso, redeCliente),
      equipamento: eqConexoes,
      infraestrutura,
    };
  }, [
    lancamentoRe,
    cabos,
    poste,
    posteObs,
    caixa,
    caixaObs,
    duto,
    dutoObs,
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
    redeAcesso,
    obsAdminGrupos,
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
    rcSobra,
    rcSobraObs,
    outrasRc,
    redeCliente,
    eqGrupos,
    eqClienteDgoItens,
    eqClienteEquipamentosItens,
    eqEstacaoEquipamentoItens,
    eqEstacaoDgoItens,
    outrasEqCliente,
    relatorioEstacao,
    estacaoEntregaAcesso,
    outrasEqEstacao,
    testeOptico,
    testePotenciaEmpresarial,
    testePotenciaImplantacao,
    eqConexoes,
    infraestrutura,
  ]);

  const buildPayload = useCallback((): RelatorioPayload => {
    if (tipo !== "empresarial" && tipo !== "implantacao") {
      return emptyRelatorioPayload();
    }
    return {
      ...buildEscopoFromUi(),
      medicoes,
      contatos,
    };
  }, [tipo, buildEscopoFromUi, medicoes, contatos]);

  const persistDraft = useCallback(
    async (payloadOverride?: RelatorioPayload) => {
      if (!currentReportId?.trim() || !user?.id) return;
      if (status !== "em_aberto" && status !== "pendente") return;
      setSaveHint("saving");
      persistingRef.current = true;
      try {
        const saved = await withRetry(
          () =>
            patchRelatorioDraft(currentReportId, {
              cliente,
              endereco,
              cidade,
              equipe_empreiteira: equipe,
              responsavel,
              data_inicio_execucao: dataInicio || null,
              payload: payloadOverride ?? buildPayload(),
            }),
          3,
          700,
          () => setSaveHint("error"),
        );
        lastSavedUpdatedAtRef.current = saved.updated_at;
        lastAppliedUpdatedAtRef.current = saved.updated_at;
        setSaveHint("saved");
      } catch (error) {
        console.error("Erro Supabase:", error);
        setSaveHint("error");
      } finally {
        persistingRef.current = false;
      }
    },
    [
      currentReportId,
      user?.id,
      status,
      cliente,
      endereco,
      cidade,
      equipe,
      responsavel,
      dataInicio,
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
      lancamentoRe,
      cabos,
      posteObs,
      caixaObs,
      dutoObs,
      plaquetaObs,
      sobraObs,
      terrometroObs,
      novoAterramentoObs,
      posicaoObs,
      etiquetaObs,
      poste,
      caixa,
      duto,
      plaqueta,
      sobra,
      terrometro,
      novoAterramento,
      posicao,
      etiqueta,
      outras,
      redeAcesso,
      tecnologiaAcesso,
      lancamentoCabosRC,
      cabosRc,
      rcPosteObs,
      rcCaixaObs,
      rcTerminacaoObs,
      rcPlaquetaObs,
      rcEntradaInternaObs,
      rcEntradaExternaObs,
      rcSobraObs,
      rcPoste,
      rcCaixa,
      rcTerminacao,
      rcPlaqueta,
      rcEntradaInterna,
      rcEntradaExterna,
      rcSobra,
      outrasRc,
      redeCliente,
      eqGrupos,
      eqClienteDgoItens,
      eqClienteEquipamentosItens,
      eqEstacaoEquipamentoItens,
      eqEstacaoDgoItens,
      outrasEqCliente,
      relatorioEstacao,
      estacaoEntregaAcesso,
      outrasEqEstacao,
      testeOptico,
      testePotenciaEmpresarial,
      testePotenciaImplantacao,
      eqConexoes,
      infraestrutura,
      medicoes,
      contatos,
    ],
    1500,
    step === 2 && Boolean(currentReportId) && (status === "em_aberto" || status === "pendente"),
  );

  /** Carrega os campos de campo do payload no formulário. */
  const applyEscopoToUi = (p: EscopoPayload) => {
    setLancamentoRe(p.lancamentoRe === true ? "sim" : p.lancamentoRe === false ? "nao" : "");
    setCabos(p.metragensCabo.length > 0 ? p.metragensCabo : [emptyCaboMetragem()]);
    setPoste(slotsFromStored(p.posteConexao?.fotos ?? [], 1));
    setPosteObs(p.posteConexao?.obs ?? "");
    setCaixa(slotsFromStored(p.caixaEmenda?.fotos ?? [], 1));
    setCaixaObs(p.caixaEmenda?.obs ?? "");
    setDuto(slotsFromStored(p.dutoSubterraneo?.fotos ?? [], 1));
    setDutoObs(p.dutoSubterraneo?.obs ?? "");
    setPlaqueta(slotsFromStored(p.plaquetaIdentificacao?.fotos ?? [], 1));
    setPlaquetaObs(p.plaquetaIdentificacao?.obs ?? "");
    setSobra(slotsFromStored(p.sobraTecnica?.fotos ?? [], 1));
    setSobraObs(p.sobraTecnica?.obs ?? "");
    setTerrometro(slotsFromStored(p.aterramentoTerrometro?.fotos ?? [], 1));
    setTerrometroObs(p.aterramentoTerrometro?.obs ?? "");
    setNovoAterramento(slotsFromStored(p.novoAterramentoPoste?.fotos ?? [], 1));
    setNovoAterramentoObs(p.novoAterramentoPoste?.obs ?? "");
    setPosicao(slotsFromStored(p.posicaoConexaoEstacao?.fotos ?? [], 1));
    setPosicaoObs(p.posicaoConexaoEstacao?.obs ?? "");
    setEtiqueta(slotsFromStored(p.etiquetaIdentificacao?.fotos ?? [], 1));
    setEtiquetaObs(p.etiquetaIdentificacao?.obs ?? "");
    setOutras(outrasFromPayload(p.outrasFotos));
    setRedeAcesso({
      ...emptyQuantidadesRede(),
      ...(p.redeAcesso ?? {}),
      cordoalhaLancada: p.redeAcesso?.cordoalhaLancada ?? emptyCordoalhaBloco(),
      cordoalhaExistente: p.redeAcesso?.cordoalhaExistente ?? emptyCordoalhaBloco(),
      postesNovaCordoalha: p.redeAcesso?.postesNovaCordoalha ?? emptyCordoalhaBloco(),
      postesCordoalhaExistente: p.redeAcesso?.postesCordoalhaExistente ?? emptyCordoalhaBloco(),
      aterramento: p.redeAcesso?.aterramento ?? { totalHastes: null },
    });
    setObsAdminGrupos({
      posteConexao: readObsAdmin(p.posteConexao),
      caixaEmenda: readObsAdmin(p.caixaEmenda),
      dutoSubterraneo: readObsAdmin(p.dutoSubterraneo),
      plaquetaIdentificacao: readObsAdmin(p.plaquetaIdentificacao),
      novoAterramentoPoste: readObsAdmin(p.novoAterramentoPoste),
      aterramentoTerrometro: readObsAdmin(p.aterramentoTerrometro),
      posicaoConexaoEstacao: readObsAdmin(p.posicaoConexaoEstacao),
      etiquetaIdentificacao: readObsAdmin(p.etiquetaIdentificacao),
      sobraTecnica: readObsAdmin(p.sobraTecnica),
      rcPosteConexao: readObsAdmin(p.rcPosteConexao),
      rcCaixaEmenda: readObsAdmin(p.rcCaixaEmenda),
      rcTerminacaoCabo: readObsAdmin(p.rcTerminacaoCabo),
      rcPlaquetaIdentificacao: readObsAdmin(p.rcPlaquetaIdentificacao),
      rcEntradaInterna: readObsAdmin(p.rcEntradaInterna),
      rcEntradaExterna: readObsAdmin(p.rcEntradaExterna),
      rcSobraTecnica: readObsAdmin(p.rcSobraTecnica),
    });
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
    setRcSobra(slotsFromStored(p.rcSobraTecnica?.fotos ?? [], 1));
    setRcSobraObs(p.rcSobraTecnica?.obs ?? "");
    setOutrasRc(outrasFromPayload(p.outrasFotosRc));
    setRedeCliente({
      ...emptyQuantidadesRede(),
      ...(p.redeCliente ?? {}),
      cordoalhaLancada: p.redeCliente?.cordoalhaLancada ?? emptyCordoalhaBloco(),
      cordoalhaExistente: p.redeCliente?.cordoalhaExistente ?? emptyCordoalhaBloco(),
      postesNovaCordoalha: p.redeCliente?.postesNovaCordoalha ?? emptyCordoalhaBloco(),
      postesCordoalhaExistente: p.redeCliente?.postesCordoalhaExistente ?? emptyCordoalhaBloco(),
      aterramento: p.redeCliente?.aterramento ?? { totalHastes: null },
      coordenadas: p.redeCliente?.coordenadas ?? emptyCoordenadas(),
      caixaEmendaAcomodacao: {
        coordenadas: p.redeCliente?.caixaEmendaAcomodacao?.coordenadas ?? emptyCoordenadas(),
      },
    });
    setEqGrupos(eqGruposFromPayload(p));
    setEqClienteDgoItens(p.eqClienteDgo?.length ? p.eqClienteDgo : [emptyDgoClienteItem()]);
    setEqClienteEquipamentosItens(
      p.eqClienteEquipamentos?.length
        ? p.eqClienteEquipamentos
        : [emptyEquipamentoClienteItem()],
    );
    setEqEstacaoEquipamentoItens(
      p.eqEstacaoEquipamento?.length
        ? p.eqEstacaoEquipamento
        : [emptyEquipamentoClienteItem()],
    );
    setEqEstacaoDgoItens(p.eqEstacaoDgo?.length ? p.eqEstacaoDgo : [emptyDgoClienteItem()]);
    setOutrasEqCliente(outrasFromPayload(p.outrasFotosEqCliente));
    setRelatorioEstacao(p.relatorioEstacao === true ? "sim" : "nao");
    setEstacaoEntregaAcesso(p.estacaoEntregaAcesso ?? "");
    setOutrasEqEstacao(outrasFromPayload(p.outrasFotosEqEstacao));
    setTesteOptico(p.testeOptico ?? emptyTesteOptico());
    setTestePotenciaEmpresarial(p.testePotenciaEmpresarial ?? emptyTestePotencia());
    setTestePotenciaImplantacao(p.testePotenciaImplantacao ?? emptyTestePotencia());
    setEqConexoes(p.equipamento ?? emptyEquipamentoConexoes());
    setInfraestrutura(
      p.infraestrutura?.tomadas?.length
        ? p.infraestrutura
        : { ...(p.infraestrutura ?? emptyInfraestrutura()), tomadas: [emptyMedicaoTomada()] },
    );
  };

  const applyRelatorio = (row: RelatorioTransmissao, opts?: { fromRemote?: boolean }) => {
    canAutosaveRef.current = false;
    lastAppliedUpdatedAtRef.current = row.updated_at;
    const p = row.payload ?? emptyRelatorioPayload();
    setCurrentReportId(row.id);
    setOsWf(row.os_wf);
    setTecnicosAtribuidos(
      row.tecnicos_atribuidos.length
        ? row.tecnicos_atribuidos
        : row.tecnico_id
          ? [row.tecnico_id]
          : [],
    );
    setTecnicosNomes(row.tecnicos_nomes ?? (row.tecnico_nome ? [row.tecnico_nome] : []));
    setStatus(row.status);
    setMotivoPendencia(row.motivo_pendencia);
    setCliente(row.cliente);
    setEndereco(row.endereco);
    setCidade(row.cidade);
    setEquipe(row.equipe_empreiteira);
    setResponsavel(row.responsavel);
    setDataInicio(row.data_inicio_execucao);
    setTipo(row.tipo_execucao ?? "");
    applyEscopoToUi(p);
    setMedicoes(emptyMedicoes());
    setContatos(p.contatos ?? emptyContatos());
    setStep(2);
    if (row.status === "em_aberto" || row.status === "pendente") {
      if (enableAutosaveTimerRef.current) window.clearTimeout(enableAutosaveTimerRef.current);
      enableAutosaveTimerRef.current = window.setTimeout(
        () => {
          canAutosaveRef.current = true;
          enableAutosaveTimerRef.current = null;
        },
        opts?.fromRemote ? 2000 : 800,
      );
    }
  };

  useEffect(() => {
    return () => {
      if (enableAutosaveTimerRef.current) window.clearTimeout(enableAutosaveTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (tipo !== "implantacao") return;
    setAbaCampo((atual) => (atual === "RE" || atual === "teste-otdr" ? atual : "RE"));
  }, [tipo]);

  useEffect(() => {
    if (abaCampo !== "contatos") return;
    setAbaCampo("RE");
  }, [abaCampo]);

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
        if (!isTecnicoAtribuido(row, user.id)) {
          toast.error("Esta OS não está atribuída à sua conta.");
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

  useEffect(() => {
    if (!currentReportId) return;
    return subscribeRelatorioTransmissaoById(currentReportId, (fresh) => {
      if (persistingRef.current) return;
      if (
        fresh.updated_at === lastAppliedUpdatedAtRef.current ||
        fresh.updated_at === lastSavedUpdatedAtRef.current
      ) {
        return;
      }
      applyRelatorio(fresh, { fromRemote: true });
    });
    // applyRelatorio is local
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentReportId]);

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
      let nextSlots: FotoSlot[] = [];
      setter((prev) => {
        nextSlots = prev.map((slot) =>
          slot.id === slotId ? { ...slot, stored: null, file: null } : slot,
        );
        return nextSlots;
      });
      const base = buildPayload();
      void persistDraft({
        ...base,
        [grupoKey]: { ...base[grupoKey], fotos: fotosDosSlots(nextSlots) },
      });
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
      const base = buildPayload();
      return {
        ...base,
        [grupoKey]: { ...base[grupoKey], fotos: fotosDosSlots(nextSlots) },
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
      let nextCabos: CaboMetragemPayload[] = [];
      setter((prev) => {
        nextCabos = prev.map((item) => (item.id === caboId ? { ...item, [campo]: null } : item));
        return nextCabos;
      });
      void persistDraft({ ...buildPayload(), [payloadKey]: nextCabos });
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
    payloadKey: "outrasFotos" | "outrasFotosRc" | "outrasFotosEqCliente" | "outrasFotosEqEstacao",
    itemId: string,
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      let next: OutraFotoState[] = [];
      setter((prev) => {
        next = prev.map((row) =>
          row.id === itemId ? { ...row, stored: null, file: null } : row,
        );
        return next;
      });
      void persistDraft({ ...buildPayload(), [payloadKey]: outrasParaPayload(next) });
      return;
    }
    void uploadFotoImediato(file, `${payloadKey}-${itemId.slice(0, 8)}`, (stored) => {
      let next: OutraFotoState[] = [];
      setter((prev) => {
        next = prev.map((row) => (row.id === itemId ? { ...row, file: null, stored } : row));
        return next;
      });
      return { ...buildPayload(), [payloadKey]: outrasParaPayload(next) };
    });
  };

  const handleEqItemPhoto = (
    setter: React.Dispatch<
      React.SetStateAction<EquipamentoClienteItemPayload[] | DgoClienteItemPayload[]>
    >,
    payloadKey: "eqClienteEquipamentos" | "eqClienteDgo" | "eqEstacaoEquipamento" | "eqEstacaoDgo",
    itemId: string,
    campo: "foto" | "etiqueta",
    file: EvidencePhotoRef | null,
  ) => {
    if (!file) {
      let next: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[] = [];
      setter((prev) => {
        next = prev.map((item) => {
          if (item.id !== itemId) return item;
          const old = item[campo];
          void deleteRelatorioPhoto(old?.path);
          return { ...item, [campo]: null };
        });
        return next as typeof prev;
      });
      void persistDraft({ ...buildPayload(), [payloadKey]: next });
      return;
    }
    void uploadFotoImediato(file, `${payloadKey}-${campo}-${itemId.slice(0, 8)}`, (stored) => {
      let next: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[] = [];
      setter((prev) => {
        next = prev.map((item) => (item.id === itemId ? { ...item, [campo]: stored } : item));
        return next as typeof prev;
      });
      return { ...buildPayload(), [payloadKey]: next };
    });
  };

  const patchCabo = (
    setter: React.Dispatch<React.SetStateAction<CaboMetragemPayload[]>>,
    caboId: string,
    patch: Partial<CaboMetragemPayload>,
  ) => {
    setter((prev) =>
      prev.map((item) => {
        if (item.id !== caboId) return item;
        const next = { ...item, ...patch };
        if ("marcacaoInicial" in patch || "marcacaoFinal" in patch) {
          next.metragem = calcularMetragemCaboTotal(next.marcacaoInicial, next.marcacaoFinal);
        }
        if ("tipoCabo" in patch && patch.tipoCabo != null) {
          next.tipoCabo = apenasDigitos(patch.tipoCabo);
        }
        return next;
      }),
    );
  };

  const setEqGrupoSlots = (
    key: RelatorioFotoGrupoKeyEq,
  ): React.Dispatch<React.SetStateAction<FotoSlot[]>> => {
    return (action) => {
      setEqGrupos((prev) => {
        const current = prev[key].slots;
        const next = typeof action === "function" ? action(current) : action;
        return { ...prev, [key]: { ...prev[key], slots: next } };
      });
    };
  };

  const setEqGrupoObs = (key: RelatorioFotoGrupoKeyEq) => (obs: string) => {
    setEqGrupos((prev) => ({ ...prev, [key]: { ...prev[key], obs } }));
  };

  const setEqGrupoObsAdmin = (key: RelatorioFotoGrupoKeyEq) => (obsAdmin: string) => {
    setEqGrupos((prev) => ({ ...prev, [key]: { ...prev[key], obsAdmin } }));
  };

  const patchObsAdminGrupo = (key: RelatorioFotoGrupoKey) => (obsAdmin: string) => {
    setObsAdminGrupos((prev) => ({ ...prev, [key]: obsAdmin }));
  };

  const showObsAdmin = hasPainelFullAccess(user?.role);

  const grupoSetters: Record<
    RelatorioFotoGrupoKey,
    React.Dispatch<React.SetStateAction<FotoSlot[]>>
  > = {
    posteConexao: setPoste,
    caixaEmenda: setCaixa,
    dutoSubterraneo: setDuto,
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
    rcSobraTecnica: setRcSobra,
    eqClienteFachada: setEqGrupoSlots("eqClienteFachada"),
    eqClienteAmbiente: setEqGrupoSlots("eqClienteAmbiente"),
    eqClienteRack: setEqGrupoSlots("eqClienteRack"),
    eqClienteEtiqueta: setEqGrupoSlots("eqClienteEtiqueta"),
    eqClienteSgp: setEqGrupoSlots("eqClienteSgp"),
    eqEstacaoGeral: setEqGrupoSlots("eqEstacaoGeral"),
    eqEstacaoRack: setEqGrupoSlots("eqEstacaoRack"),
    eqEstacaoEtiqueta: setEqGrupoSlots("eqEstacaoEtiqueta"),
  };

  const onAvisar = async () => {
    if (!currentReportId?.trim()) {
      toast.error("Relatório sem identificação válida. Recarregue a página e tente novamente.");
      return;
    }
    if (status !== "em_aberto" && status !== "pendente") return;
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
  const mostrarRedeAcesso = mostrarFormularioCampo && abaCampo === "RE";
  const mostrarRedeCliente = tipo === "empresarial" && abaCampo === "RC";
  const mostrarEquipamento = tipo === "empresarial" && abaCampo === "equipamento";
  const mostrarTesteOptico = tipo === "empresarial" && abaCampo === "teste-optico";
  const mostrarTesteOtdr = mostrarFormularioCampo && abaCampo === "teste-otdr";
  const mostrarTestePotencia = tipo === "empresarial" && abaCampo === "teste-potencia";
  const mostrarInfraestrutura = tipo === "empresarial" && abaCampo === "infraestrutura";
  const mostrarMedicoes = tipo === "empresarial" && abaCampo === "medicoes";
  const nomesOutros = tecnicosAtribuidos
    .map((id, index) => (id === user?.id ? "" : tecnicosNomes[index] ?? ""))
    .map((nome) => nome.trim())
    .filter(Boolean);

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
              Selecione uma OS despachada para você. O gestor inicia o contrato; a equipe
              preenche o mesmo relatório em conjunto.
            </p>
          </header>
          {user?.id ? <MeusRelatoriosTransmissao tecnicoId={user.id} /> : null}
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-4">
        <Link
          to="/relatorio"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar às OS
        </Link>

        <header className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-black tracking-tight">Relatório {osWf}</h1>
            {tecnicosAtribuidos.length > 1 ? (
              <Badge className="mt-2 bg-sky-600 text-white hover:bg-sky-600">
                OS Colaborativa — {nomesOutros.length ? nomesOutros.join(", ") : "equipe"}
              </Badge>
            ) : null}
            <p className="mt-2 text-sm text-muted-foreground">
              {readOnly
                ? "Somente visualização — este relatório já foi avisado ou fechado."
                : status === "pendente"
                  ? "Corrija os pontos indicados e avise novamente a conclusão."
                  : "Rascunho vivo — salvamento automático. O admin já enxerga este contrato."}
            </p>
          </div>
          <span className="shrink-0">
            {readOnly
              ? (
                  <span className="text-xs font-medium text-muted-foreground">
                    {status === "fechado" ? "Fechado" : "Avisado"}
                  </span>
                )
              : (
                  <RelatorioSyncStatus
                    status={
                      saveHint === "saving"
                        ? "saving"
                        : saveHint === "error"
                          ? "error"
                          : saveHint === "saved"
                            ? "saved"
                            : "idle"
                    }
                  />
                )}
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
          <div className="space-y-3 rounded-2xl border border-border bg-muted/30 p-4 shadow-sm">
            <h2 className="text-base font-bold">Dados da obra</h2>
            <div className="space-y-2">
              <DadoObraCampo label="OS/WF" value={osWf} />
              <DadoObraCampo label="Cliente" value={cliente} />
            </div>
            <button
              type="button"
              onClick={() => setDadosExpandidos((aberto) => !aberto)}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary"
              aria-expanded={dadosExpandidos}
            >
              <ChevronDown
                className={`h-4 w-4 transition-transform ${dadosExpandidos ? "rotate-180" : ""}`}
              />
              {dadosExpandidos ? "Ver menos detalhes" : "Ver todos os detalhes da obra"}
            </button>
            {dadosExpandidos ? (
              <div className="grid grid-cols-2 gap-x-3 gap-y-3 rounded-xl bg-muted/50 p-3">
                <DadoObraCampo label="Endereço" value={endereco} className="col-span-2" />
                <DadoObraCampo label="Cidade" value={cidade} />
                <DadoObraCampo label="Equipe/Empreiteira" value={equipe} />
                <DadoObraCampo label="Responsável" value={responsavel} />
                <DadoObraCampo label="Data de início" value={formatDataObra(dataInicio)} />
              </div>
            ) : null}
          </div>

          <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">Tipo de execução</h2>
            <TipoExecucaoPicker value={tipo} locked />
            <p className="text-xs text-muted-foreground">Definido pelo gestor. Somente visualização.</p>
          </div>

          {mostrarFormularioCampo ? (
            <>
              <RelatorioAbasCampo
                abaAtiva={abaCampo}
                onChange={setAbaCampo}
                abas={tipo === "empresarial" ? ABAS_CAMPO_TECNICO : ABAS_CAMPO_IMPLANTACAO}
              />

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
                  cordoalhaLancada={redeAcesso.cordoalhaLancada}
                  onCordoalhaLancadaChange={(cordoalhaLancada) =>
                    setRedeAcesso((prev) => ({ ...prev, cordoalhaLancada }))
                  }
                  cordoalhaExistente={redeAcesso.cordoalhaExistente}
                  onCordoalhaExistenteChange={(cordoalhaExistente) =>
                    setRedeAcesso((prev) => ({ ...prev, cordoalhaExistente }))
                  }
                  postesNovaCordoalha={redeAcesso.postesNovaCordoalha}
                  onPostesNovaCordoalhaChange={(postesNovaCordoalha) =>
                    setRedeAcesso((prev) => ({ ...prev, postesNovaCordoalha }))
                  }
                  postesCordoalhaExistente={redeAcesso.postesCordoalhaExistente}
                  onPostesCordoalhaExistenteChange={(postesCordoalhaExistente) =>
                    setRedeAcesso((prev) => ({ ...prev, postesCordoalhaExistente }))
                  }
                  cabos={cabos}
                  onPatchCabo={(id, patch) => patchCabo(setCabos, id, patch)}
                  onAddCabo={() => setCabos((prev) => [...prev, emptyCaboMetragem()])}
                  onRemoveCabo={(id) => setCabos((prev) => removeExtraById(prev, id))}
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(setCabos, "metragensCabo", caboId, campo, file)
                  }
                  showObsAdmin={showObsAdmin}
                  grupos={[
                    {
                      grupoKey: "posteConexao",
                      title: "Poste de conexão",
                      slots: poste,
                      onChange: setPoste,
                      obs: posteObs,
                      onObsChange: setPosteObs,
                      obsAdmin: obsAdminGrupos.posteConexao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("posteConexao"),
                    },
                    {
                      grupoKey: "caixaEmenda",
                      title: "Caixa de emenda",
                      slots: caixa,
                      onChange: setCaixa,
                      obs: caixaObs,
                      onObsChange: setCaixaObs,
                      obsAdmin: obsAdminGrupos.caixaEmenda ?? "",
                      onObsAdminChange: patchObsAdminGrupo("caixaEmenda"),
                      ...(tipo === "empresarial" || tipo === "implantacao"
                        ? {
                            quantidade: redeAcesso.qtdCaixasEmenda,
                            quantidadeLabel: "Quantidade de Caixas de Emenda",
                            quantidadePlaceholder: "Ex: 4",
                            onQuantidadeChange: (qtdCaixasEmenda: number | null) =>
                              setRedeAcesso((prev) => ({ ...prev, qtdCaixasEmenda })),
                          }
                        : {}),
                    },
                    {
                      grupoKey: "dutoSubterraneo",
                      title: "Const. de duto subterraneio (MD ou MND)",
                      slots: duto,
                      onChange: setDuto,
                      obs: dutoObs,
                      onObsChange: setDutoObs,
                      obsAdmin: obsAdminGrupos.dutoSubterraneo ?? "",
                      onObsAdminChange: patchObsAdminGrupo("dutoSubterraneo"),
                    },
                    {
                      grupoKey: "plaquetaIdentificacao",
                      title: "Plaqueta de Identificação",
                      slots: plaqueta,
                      onChange: setPlaqueta,
                      obs: plaquetaObs,
                      onObsChange: setPlaquetaObs,
                      obsAdmin: obsAdminGrupos.plaquetaIdentificacao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("plaquetaIdentificacao"),
                    },
                    {
                      grupoKey: "sobraTecnica",
                      title: "Sobra técnica / Fiberloop instalado",
                      minSlots: 1,
                      slots: sobra,
                      onChange: setSobra,
                      obs: sobraObs,
                      onObsChange: setSobraObs,
                      obsAdmin: obsAdminGrupos.sobraTecnica ?? "",
                      onObsAdminChange: patchObsAdminGrupo("sobraTecnica"),
                      quantidade: redeAcesso.qtdFiberloopInstalado,
                      quantidadeLabel: "Quantidade de Fiberloop instalado",
                      quantidadePlaceholder: "Ex: 2",
                      onQuantidadeChange: (qtdFiberloopInstalado) =>
                        setRedeAcesso((prev) => ({ ...prev, qtdFiberloopInstalado })),
                    },
                    {
                      grupoKey: "novoAterramentoPoste",
                      title: "Novo aterramento do poste",
                      slots: novoAterramento,
                      onChange: setNovoAterramento,
                      obs: novoAterramentoObs,
                      onObsChange: setNovoAterramentoObs,
                      obsAdmin: obsAdminGrupos.novoAterramentoPoste ?? "",
                      onObsAdminChange: patchObsAdminGrupo("novoAterramentoPoste"),
                    },
                    {
                      grupoKey: "aterramentoTerrometro",
                      title: "Aterramento - TERROMETRO",
                      slots: terrometro,
                      onChange: setTerrometro,
                      obs: terrometroObs,
                      onObsChange: setTerrometroObs,
                      obsAdmin: obsAdminGrupos.aterramentoTerrometro ?? "",
                      onObsAdminChange: patchObsAdminGrupo("aterramentoTerrometro"),
                      quantidade: redeAcesso.aterramento?.totalHastes ?? null,
                      quantidadeLabel: "Total de Hastes (5/8):",
                      quantidadePlaceholder: "Ex: 4",
                      onQuantidadeChange: (totalHastes) =>
                        setRedeAcesso((prev) => ({
                          ...prev,
                          aterramento: { ...prev.aterramento, totalHastes },
                        })),
                    },
                    {
                      grupoKey: "posicaoConexaoEstacao",
                      title: "Posição de conexão na Estação/PPC (DGO/DIO)",
                      slots: posicao,
                      onChange: setPosicao,
                      obs: posicaoObs,
                      onObsChange: setPosicaoObs,
                      obsAdmin: obsAdminGrupos.posicaoConexaoEstacao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("posicaoConexaoEstacao"),
                    },
                    {
                      grupoKey: "etiquetaIdentificacao",
                      title: "ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC",
                      slots: etiqueta,
                      onChange: setEtiqueta,
                      obs: etiquetaObs,
                      onObsChange: setEtiquetaObs,
                      obsAdmin: obsAdminGrupos.etiquetaIdentificacao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("etiquetaIdentificacao"),
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
                    <div className="space-y-3">
                      <CampoCoordenadas
                        title="Coordenadas do Cliente"
                        value={redeCliente.coordenadas}
                        onChange={(coordenadas) =>
                          setRedeCliente((prev) => ({ ...prev, coordenadas }))
                        }
                        disabled={readOnly}
                      />
                      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
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
                          placeholder="EX: FO ABC"
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
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
                  cordoalhaLancada={redeCliente.cordoalhaLancada}
                  onCordoalhaLancadaChange={(cordoalhaLancada) =>
                    setRedeCliente((prev) => ({ ...prev, cordoalhaLancada }))
                  }
                  cordoalhaExistente={redeCliente.cordoalhaExistente}
                  onCordoalhaExistenteChange={(cordoalhaExistente) =>
                    setRedeCliente((prev) => ({ ...prev, cordoalhaExistente }))
                  }
                  postesNovaCordoalha={redeCliente.postesNovaCordoalha}
                  onPostesNovaCordoalhaChange={(postesNovaCordoalha) =>
                    setRedeCliente((prev) => ({ ...prev, postesNovaCordoalha }))
                  }
                  postesCordoalhaExistente={redeCliente.postesCordoalhaExistente}
                  onPostesCordoalhaExistenteChange={(postesCordoalhaExistente) =>
                    setRedeCliente((prev) => ({ ...prev, postesCordoalhaExistente }))
                  }
                  cabos={cabosRc}
                  onPatchCabo={(id, patch) => patchCabo(setCabosRc, id, patch)}
                  onAddCabo={() => setCabosRc((prev) => [...prev, emptyCaboMetragem()])}
                  onRemoveCabo={(id) => setCabosRc((prev) => removeExtraById(prev, id))}
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(setCabosRc, "metragensCaboRc", caboId, campo, file)
                  }
                  showObsAdmin={showObsAdmin}
                  grupos={[
                    {
                      grupoKey: "rcPosteConexao",
                      title: "Poste de conexão (Rede cliente com Rede Externa)",
                      slots: rcPoste,
                      onChange: setRcPoste,
                      obs: rcPosteObs,
                      onObsChange: setRcPosteObs,
                      obsAdmin: obsAdminGrupos.rcPosteConexao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcPosteConexao"),
                    },
                    {
                      grupoKey: "rcCaixaEmenda",
                      title: "Caixa de emenda na acomodação (Rede cliente com Rede Externa)",
                      slots: rcCaixa,
                      onChange: setRcCaixa,
                      obs: rcCaixaObs,
                      onObsChange: setRcCaixaObs,
                      obsAdmin: obsAdminGrupos.rcCaixaEmenda ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcCaixaEmenda"),
                      quantidade: redeCliente.qtdCaixasEmenda,
                      quantidadeLabel: "Quantidade de Caixas de Emenda",
                      quantidadePlaceholder: "Ex: 1",
                      onQuantidadeChange: (qtdCaixasEmenda) =>
                        setRedeCliente((prev) => ({ ...prev, qtdCaixasEmenda })),
                      coordenadas: redeCliente.caixaEmendaAcomodacao.coordenadas,
                      coordenadasTitle: "Coordenadas da Caixa de Emenda",
                      onCoordenadasChange: (coordenadas) =>
                        setRedeCliente((prev) => ({
                          ...prev,
                          caixaEmendaAcomodacao: { coordenadas },
                        })),
                    },
                    {
                      grupoKey: "rcTerminacaoCabo",
                      title: "Terminação do cabo no cliente (PTO/Roseta - área interna)",
                      slots: rcTerminacao,
                      onChange: setRcTerminacao,
                      obs: rcTerminacaoObs,
                      onObsChange: setRcTerminacaoObs,
                      obsAdmin: obsAdminGrupos.rcTerminacaoCabo ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcTerminacaoCabo"),
                    },
                    {
                      grupoKey: "rcPlaquetaIdentificacao",
                      title: "Plaqueta de Identificação - Terminação do cabo no cliente",
                      slots: rcPlaqueta,
                      onChange: setRcPlaqueta,
                      obs: rcPlaquetaObs,
                      onObsChange: setRcPlaquetaObs,
                      obsAdmin: obsAdminGrupos.rcPlaquetaIdentificacao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcPlaquetaIdentificacao"),
                    },
                    {
                      grupoKey: "rcEntradaInterna",
                      title: "Entrada do cabo no cliente (Área interna)",
                      slots: rcEntradaInterna,
                      onChange: setRcEntradaInterna,
                      obs: rcEntradaInternaObs,
                      onObsChange: setRcEntradaInternaObs,
                      obsAdmin: obsAdminGrupos.rcEntradaInterna ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcEntradaInterna"),
                    },
                    {
                      grupoKey: "rcEntradaExterna",
                      title: "Entrada do cabo no cliente (Área externa)",
                      slots: rcEntradaExterna,
                      onChange: setRcEntradaExterna,
                      obs: rcEntradaExternaObs,
                      onObsChange: setRcEntradaExternaObs,
                      obsAdmin: obsAdminGrupos.rcEntradaExterna ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcEntradaExterna"),
                    },
                    {
                      grupoKey: "rcSobraTecnica",
                      title: "Sobra técnica / Fiberloop instalado",
                      minSlots: 1,
                      slots: rcSobra,
                      onChange: setRcSobra,
                      obs: rcSobraObs,
                      onObsChange: setRcSobraObs,
                      obsAdmin: obsAdminGrupos.rcSobraTecnica ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcSobraTecnica"),
                      quantidade: redeCliente.qtdFiberloopInstalado,
                      quantidadeLabel: "Quantidade de Fiberloop instalado",
                      quantidadePlaceholder: "Ex: 2",
                      onQuantidadeChange: (qtdFiberloopInstalado) =>
                        setRedeCliente((prev) => ({ ...prev, qtdFiberloopInstalado })),
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
              ) : mostrarEquipamento ? (
                <RelatorioEquipamento
                  readOnly={readOnly}
                  showObsAdmin={showObsAdmin}
                  gruposCliente={[
                    {
                      grupoKey: "eqClienteFachada",
                      title: "Cliente - (Entrada/Fachada)",
                      slots: eqGrupos.eqClienteFachada.slots,
                      onChange: setEqGrupoSlots("eqClienteFachada"),
                      obs: eqGrupos.eqClienteFachada.obs,
                      onObsChange: setEqGrupoObs("eqClienteFachada"),
                      obsAdmin: eqGrupos.eqClienteFachada.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqClienteFachada"),
                    },
                    {
                      grupoKey: "eqClienteAmbiente",
                      title: "Cliente - Ambiente (geral da sala)",
                      slots: eqGrupos.eqClienteAmbiente.slots,
                      onChange: setEqGrupoSlots("eqClienteAmbiente"),
                      obs: eqGrupos.eqClienteAmbiente.obs,
                      onObsChange: setEqGrupoObs("eqClienteAmbiente"),
                      obsAdmin: eqGrupos.eqClienteAmbiente.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqClienteAmbiente"),
                    },
                    {
                      grupoKey: "eqClienteRack",
                      title: "(Rack ou Local)",
                      slots: eqGrupos.eqClienteRack.slots,
                      onChange: setEqGrupoSlots("eqClienteRack"),
                      obs: eqGrupos.eqClienteRack.obs,
                      onObsChange: setEqGrupoObs("eqClienteRack"),
                      obsAdmin: eqGrupos.eqClienteRack.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqClienteRack"),
                    },
                    {
                      grupoKey: "eqClienteSgp",
                      title: "Identificação SGP no Cliente",
                      slots: eqGrupos.eqClienteSgp.slots,
                      onChange: setEqGrupoSlots("eqClienteSgp"),
                      obs: eqGrupos.eqClienteSgp.obs,
                      onObsChange: setEqGrupoObs("eqClienteSgp"),
                      obsAdmin: eqGrupos.eqClienteSgp.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqClienteSgp"),
                    },
                  ]}
                  dgosCliente={eqClienteDgoItens}
                  onDgosClienteChange={setEqClienteDgoItens}
                  onDgoClientePhoto={(itemId, campo, file) =>
                    handleEqItemPhoto(
                      setEqClienteDgoItens as React.Dispatch<
                        React.SetStateAction<
                          EquipamentoClienteItemPayload[] | DgoClienteItemPayload[]
                        >
                      >,
                      "eqClienteDgo",
                      itemId,
                      campo,
                      file,
                    )
                  }
                  equipamentosCliente={eqClienteEquipamentosItens}
                  onEquipamentosClienteChange={setEqClienteEquipamentosItens}
                  onEquipamentoClientePhoto={(itemId, campo, file) =>
                    handleEqItemPhoto(
                      setEqClienteEquipamentosItens as React.Dispatch<
                        React.SetStateAction<
                          EquipamentoClienteItemPayload[] | DgoClienteItemPayload[]
                        >
                      >,
                      "eqClienteEquipamentos",
                      itemId,
                      campo,
                      file,
                    )
                  }
                  outrasCliente={outrasEqCliente}
                  onOutrasClienteChange={setOutrasEqCliente}
                  onOutraClientePhoto={(itemId, file) =>
                    handleOutraPhoto(setOutrasEqCliente, "outrasFotosEqCliente", itemId, file)
                  }
                  relatorioEstacao={relatorioEstacao}
                  onRelatorioEstacao={setRelatorioEstacao}
                  estacaoEntregaAcesso={estacaoEntregaAcesso}
                  onEstacaoEntregaAcesso={setEstacaoEntregaAcesso}
                  gruposEstacao={[
                    {
                      grupoKey: "eqEstacaoGeral",
                      title: "Estação - (Foto geral da estação/PPC)",
                      slots: eqGrupos.eqEstacaoGeral.slots,
                      onChange: setEqGrupoSlots("eqEstacaoGeral"),
                      obs: eqGrupos.eqEstacaoGeral.obs,
                      onObsChange: setEqGrupoObs("eqEstacaoGeral"),
                      obsAdmin: eqGrupos.eqEstacaoGeral.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqEstacaoGeral"),
                    },
                    {
                      grupoKey: "eqEstacaoRack",
                      title: "(Rack ou Local Instalação)",
                      slots: eqGrupos.eqEstacaoRack.slots,
                      onChange: setEqGrupoSlots("eqEstacaoRack"),
                      obs: eqGrupos.eqEstacaoRack.obs,
                      onObsChange: setEqGrupoObs("eqEstacaoRack"),
                      obsAdmin: eqGrupos.eqEstacaoRack.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqEstacaoRack"),
                    },
                  ]}
                  equipamentosEstacao={eqEstacaoEquipamentoItens}
                  onEquipamentosEstacaoChange={setEqEstacaoEquipamentoItens}
                  onEquipamentoEstacaoPhoto={(itemId, campo, file) =>
                    handleEqItemPhoto(
                      setEqEstacaoEquipamentoItens as React.Dispatch<
                        React.SetStateAction<
                          EquipamentoClienteItemPayload[] | DgoClienteItemPayload[]
                        >
                      >,
                      "eqEstacaoEquipamento",
                      itemId,
                      campo,
                      file,
                    )
                  }
                  dgosEstacao={eqEstacaoDgoItens}
                  onDgosEstacaoChange={setEqEstacaoDgoItens}
                  onDgoEstacaoPhoto={(itemId, campo, file) =>
                    handleEqItemPhoto(
                      setEqEstacaoDgoItens as React.Dispatch<
                        React.SetStateAction<
                          EquipamentoClienteItemPayload[] | DgoClienteItemPayload[]
                        >
                      >,
                      "eqEstacaoDgo",
                      itemId,
                      campo,
                      file,
                    )
                  }
                  outrasEstacao={outrasEqEstacao}
                  onOutrasEstacaoChange={setOutrasEqEstacao}
                  onOutraEstacaoPhoto={(itemId, file) =>
                    handleOutraPhoto(setOutrasEqEstacao, "outrasFotosEqEstacao", itemId, file)
                  }
                  onGrupoPhoto={(grupoKey, slotId, file) => {
                    handleGrupoPhoto(grupoSetters[grupoKey], grupoKey, slotId, file);
                  }}
                  configuracaoCliente={eqConexoes.configuracaoCliente}
                  onConfiguracaoClienteChange={(configuracaoCliente) =>
                    setEqConexoes((prev) => ({ ...prev, configuracaoCliente }))
                  }
                  configuracaoEstacao={eqConexoes.configuracaoEstacao}
                  onConfiguracaoEstacaoChange={(configuracaoEstacao) =>
                    setEqConexoes((prev) => ({ ...prev, configuracaoEstacao }))
                  }
                />
              ) : mostrarTesteOptico ? (
                <RelatorioTesteOptico
                  readOnly={readOnly}
                  value={testeOptico}
                  onChange={(next, opts) => {
                    setTesteOptico(next);
                    if (opts?.immediate) {
                      void persistDraft({ ...buildPayload(), testeOptico: next });
                    }
                  }}
                  onUploadPhoto={async (file) => {
                    if (!user?.id) throw new Error("Sessão inválida.");
                    return uploadRelatorioPhoto(user.id, file.file, "teste-optico");
                  }}
                />
              ) : mostrarTesteOtdr ? (
                <RelatorioTestePotencia
                  tipoExecucao={tipo === "implantacao" ? "implantacao" : "empresarial"}
                  readOnly={readOnly}
                  valueEmpresarial={testePotenciaEmpresarial}
                  valueImplantacao={testePotenciaImplantacao}
                  onChangeEmpresarial={(next, opts) => {
                    setTestePotenciaEmpresarial(next);
                    if (opts?.immediate) {
                      void persistDraft({ ...buildPayload(), testePotenciaEmpresarial: next });
                    }
                  }}
                  onChangeImplantacao={(next, opts) => {
                    setTestePotenciaImplantacao(next);
                    if (opts?.immediate) {
                      void persistDraft({ ...buildPayload(), testePotenciaImplantacao: next });
                    }
                  }}
                  onUploadPhoto={async (file) => {
                    if (!user?.id) throw new Error("Sessão inválida.");
                    const tag =
                      tipo === "implantacao"
                        ? "teste-potencia-implantacao"
                        : "teste-potencia-empresarial";
                    return uploadRelatorioPhoto(user.id, file.file, tag);
                  }}
                />
              ) : mostrarTestePotencia ? (
                <RelatorioTestePotenciaAtenuacao
                  testeOptico={testeOptico ?? emptyTesteOptico()}
                  testeOtdr={testePotenciaEmpresarial ?? emptyTestePotencia()}
                  redeAcesso={redeAcesso ?? emptyQuantidadesRede()}
                  redeCliente={redeCliente ?? emptyQuantidadesRede()}
                />
              ) : mostrarInfraestrutura ? (
                <AbaInfraestrutura
                  value={infraestrutura}
                  onChange={readOnly ? undefined : setInfraestrutura}
                  readOnly={readOnly}
                />
              ) : mostrarMedicoes ? (
                <AbaMedicoes />
              ) : null}
            </>
          ) : null}
        </form>
      </main>

      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <div className="mb-2 flex justify-end">
              <RelatorioSyncStatus
                status={
                  saveHint === "saving"
                    ? "saving"
                    : saveHint === "error"
                      ? "error"
                      : saveHint === "saved"
                        ? "saved"
                        : "idle"
                }
              />
            </div>
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
