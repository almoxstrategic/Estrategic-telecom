import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowLeft, Bell, Info, X } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { MeusRelatoriosTransmissao } from "@/components/MeusRelatoriosTransmissao";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { PendenciasProvider, usePendencias } from "@/components/pendencias/PendenciasContext";
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
import { parsePadraoCoresFibra, type PadraoCoresFibra } from "@/lib/fiber-colors";
import { planCaboMetragemGalleryAssignments } from "@/lib/cabo-metragem-gallery";
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
  emptyLancamentoPorAmbiente,
  isFotoGrupoPorAmbienteKey,
  gateSimComLegado,
  fotoGrupoPorAmbienteTemFotos,
  fotoGrupoTemFotos,
  type AmbienteRede,
  type LancamentoPorAmbientePayload,
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

type DualFotoUi = Record<AmbienteRede, { slots: FotoSlot[]; obs: string; obsAdmin: string }>;

function emptyDualFotoUi(): DualFotoUi {
  return {
    aereo: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
    subterraneo: { slots: [newFotoSlot()], obs: "", obsAdmin: "" },
  };
}

function dualFromGrupo(grupo: EscopoPayload["caixaEmenda"] | undefined): DualFotoUi {
  const empty = emptyDualFotoUi();
  if (!grupo) return empty;
  return {
    aereo: {
      slots: slotsFromStored(grupo.aereo?.fotos ?? [], 1),
      obs: grupo.aereo?.obs ?? "",
      obsAdmin: grupo.aereo?.obsAdmin ?? "",
    },
    subterraneo: {
      slots: slotsFromStored(grupo.subterraneo?.fotos ?? [], 1),
      obs: grupo.subterraneo?.obs ?? "",
      obsAdmin: grupo.subterraneo?.obsAdmin ?? "",
    },
  };
}

function dualToGrupo(dual: DualFotoUi): EscopoPayload["caixaEmenda"] {
  return {
    aereo: grupoPayload(dual.aereo.slots, dual.aereo.obs, dual.aereo.obsAdmin),
    subterraneo: grupoPayload(
      dual.subterraneo.slots,
      dual.subterraneo.obs,
      dual.subterraneo.obsAdmin,
    ),
  };
}

function simDerivadoLancamento(l: {
  aereo: { isSim: boolean | null };
  subterraneo: { isSim: boolean | null };
}): boolean | null {
  if (l.aereo.isSim === true || l.subterraneo.isSim === true) return true;
  if (l.aereo.isSim === false || l.subterraneo.isSim === false) return false;
  return null;
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

function PendenciasAbaBridge({ setAba }: { setAba: (aba: AbaCampo) => void }) {
  const ctx = usePendencias();
  useEffect(() => {
    ctx?.registerAbaController({ setAba });
    return () => ctx?.registerAbaController(null);
  }, [ctx, setAba]);
  return null;
}

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
  const [pendenciasItens, setPendenciasItens] = useState<
    import("@/lib/pendencias-itens").PendenciaItem[]
  >([]);
  const [loadingById, setLoadingById] = useState(Boolean(reportIdFromUrl));
  const [cliente, setCliente] = useState("");
  const [endereco, setEndereco] = useState("");
  const [cidade, setCidade] = useState("");
  const [equipe, setEquipe] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [dataInicio, setDataInicio] = useState("");
  const [tipo, setTipo] = useState<TipoExecucao | "">("");
  const [abaCampo, setAbaCampo] = useState<AbaCampo>("RE");
  const [isDadosObraOpen, setIsDadosObraOpen] = useState(false);
  const [lancamentoCabosRe, setLancamentoCabosRe] = useState<LancamentoPorAmbientePayload>(() =>
    emptyLancamentoPorAmbiente(),
  );
  const [lancamentoReAmbiente, setLancamentoReAmbiente] = useState<AmbienteRede>("aereo");
  const [poste, setPoste] = useState<FotoSlot[]>([newFotoSlot()]);
  const [posteObs, setPosteObs] = useState("");
  const [caixaDual, setCaixaDual] = useState<DualFotoUi>(emptyDualFotoUi);
  const [duto, setDuto] = useState<FotoSlot[]>([newFotoSlot()]);
  const [dutoObs, setDutoObs] = useState("");
  const [plaquetaDual, setPlaquetaDual] = useState<DualFotoUi>(emptyDualFotoUi);
  const [sobraDual, setSobraDual] = useState<DualFotoUi>(emptyDualFotoUi);
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
  const [ambientesGrupos, setAmbientesGrupos] = useState<
    Partial<Record<RelatorioFotoGrupoKey, AmbienteRede | null>>
  >({});
  const [tecnologiaAcesso, setTecnologiaAcesso] = useState("");
  const [lancamentoCabosRc, setLancamentoCabosRc] = useState<LancamentoPorAmbientePayload>(() =>
    emptyLancamentoPorAmbiente(),
  );
  const [lancamentoRcAmbiente, setLancamentoRcAmbiente] = useState<AmbienteRede>("aereo");
  const [rcPoste, setRcPoste] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcPosteObs, setRcPosteObs] = useState("");
  const [rcCaixaDual, setRcCaixaDual] = useState<DualFotoUi>(emptyDualFotoUi);
  const [rcTerminacao, setRcTerminacao] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcTerminacaoObs, setRcTerminacaoObs] = useState("");
  const [rcPlaquetaDual, setRcPlaquetaDual] = useState<DualFotoUi>(emptyDualFotoUi);
  const [rcEntradaInterna, setRcEntradaInterna] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcEntradaInternaObs, setRcEntradaInternaObs] = useState("");
  const [rcEntradaExterna, setRcEntradaExterna] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcEntradaExternaObs, setRcEntradaExternaObs] = useState("");
  const [rcSobraDual, setRcSobraDual] = useState<DualFotoUi>(emptyDualFotoUi);
  const [rcNovoAterramento, setRcNovoAterramento] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcNovoAterramentoObs, setRcNovoAterramentoObs] = useState("");
  const [rcDuto, setRcDuto] = useState<FotoSlot[]>([newFotoSlot()]);
  const [rcDutoObs, setRcDutoObs] = useState("");
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
  const [padraoCoresFibra, setPadraoCoresFibra] = useState<PadraoCoresFibra>("br");
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
  const canAutosaveRef = useRef(false);
  const lastAppliedUpdatedAtRef = useRef<string | null>(null);
  const lastSavedUpdatedAtRef = useRef<string | null>(null);
  const persistingRef = useRef(false);
  const enableAutosaveTimerRef = useRef<number | null>(null);

  const buildEscopoFromUi = useCallback((): EscopoPayload => {
    return {
      lancamentoCabosRe,
      lancamentoRe: simDerivadoLancamento(lancamentoCabosRe),
      lancamentoReAmbiente,
      metragensCabo: lancamentoCabosRe.aereo.metragens,
      posteConexao: grupoPayload(poste, posteObs, obsAdminGrupos.posteConexao),
      caixaEmenda: dualToGrupo(caixaDual),
      dutoSubterraneo: grupoPayload(duto, dutoObs, obsAdminGrupos.dutoSubterraneo),
      plaquetaIdentificacao: dualToGrupo(plaquetaDual),
      novoAterramentoPoste: grupoPayload(
        novoAterramento,
        novoAterramentoObs,
        obsAdminGrupos.novoAterramentoPoste,
      ),
      aterramentoTerrometro: { fotos: [], obs: "", obsAdmin: "" },
      posicaoConexaoEstacao: grupoPayload(posicao, posicaoObs, obsAdminGrupos.posicaoConexaoEstacao),
      etiquetaIdentificacao: grupoPayload(etiqueta, etiquetaObs, obsAdminGrupos.etiquetaIdentificacao),
      sobraTecnica: dualToGrupo(sobraDual),
      outrasFotos: outrasParaPayload(outras),
      redeAcesso,
      tecnologiaAcesso,
      lancamentoCabosRc,
      lancamentoRc: simDerivadoLancamento(lancamentoCabosRc),
      lancamentoRcAmbiente,
      metragensCaboRc: lancamentoCabosRc.aereo.metragens,
      rcPosteConexao: grupoPayload(rcPoste, rcPosteObs, obsAdminGrupos.rcPosteConexao),
      rcCaixaEmenda: dualToGrupo(rcCaixaDual),
      rcTerminacaoCabo: grupoPayload(rcTerminacao, rcTerminacaoObs, obsAdminGrupos.rcTerminacaoCabo),
      rcPlaquetaIdentificacao: dualToGrupo(rcPlaquetaDual),
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
      rcSobraTecnica: dualToGrupo(rcSobraDual),
      rcNovoAterramentoPoste: grupoPayload(
        rcNovoAterramento,
        rcNovoAterramentoObs,
        obsAdminGrupos.rcNovoAterramentoPoste,
      ),
      rcDutoSubterraneo: grupoPayload(rcDuto, rcDutoObs, obsAdminGrupos.rcDutoSubterraneo),
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
      padraoCoresFibra,
      testePotenciaEmpresarial,
      testePotenciaImplantacao,
      testePotencia1550: janelaPotenciaDerivada(redeAcesso, redeCliente),
      testePotencia1330: janelaPotenciaDerivada(redeAcesso, redeCliente),
      equipamento: eqConexoes,
      infraestrutura,
    };
  }, [
    lancamentoCabosRe,
    lancamentoReAmbiente,
    poste,
    posteObs,
    caixaDual,
    duto,
    dutoObs,
    plaquetaDual,
    novoAterramento,
    novoAterramentoObs,
    posicao,
    posicaoObs,
    etiqueta,
    etiquetaObs,
    sobraDual,
    outras,
    redeAcesso,
    obsAdminGrupos,
    tecnologiaAcesso,
    lancamentoCabosRc,
    lancamentoRcAmbiente,
    rcPoste,
    rcPosteObs,
    rcCaixaDual,
    rcTerminacao,
    rcTerminacaoObs,
    rcPlaquetaDual,
    rcEntradaInterna,
    rcEntradaInternaObs,
    rcEntradaExterna,
    rcEntradaExternaObs,
    rcSobraDual,
    rcNovoAterramento,
    rcNovoAterramentoObs,
    rcDuto,
    rcDutoObs,
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
    padraoCoresFibra,
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
      pendenciasItens,
    };
  }, [tipo, buildEscopoFromUi, medicoes, contatos, pendenciasItens]);

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
      lancamentoCabosRe,
      lancamentoReAmbiente,
      posteObs,
      caixaDual,
      dutoObs,
      plaquetaDual,
      sobraDual,
      novoAterramentoObs,
      posicaoObs,
      etiquetaObs,
      poste,
      duto,
      novoAterramento,
      posicao,
      etiqueta,
      outras,
      redeAcesso,
      ambientesGrupos,
      tecnologiaAcesso,
      lancamentoCabosRc,
      lancamentoRcAmbiente,
      rcPosteObs,
      rcCaixaDual,
      rcTerminacaoObs,
      rcPlaquetaDual,
      rcEntradaInternaObs,
      rcEntradaExternaObs,
      rcSobraDual,
      rcNovoAterramentoObs,
      rcDutoObs,
      rcPoste,
      rcTerminacao,
      rcEntradaInterna,
      rcEntradaExterna,
      rcNovoAterramento,
      rcDuto,
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
    const hydrateLanc = (l: LancamentoPorAmbientePayload | undefined) => {
      const src = l ?? emptyLancamentoPorAmbiente();
      const lado = (b: LancamentoPorAmbientePayload["aereo"]) => ({
        ...b,
        metragens: b.metragens.length ? b.metragens : [emptyCaboMetragem()],
      });
      return { aereo: lado(src.aereo), subterraneo: lado(src.subterraneo) };
    };
    setLancamentoCabosRe(hydrateLanc(p.lancamentoCabosRe));
    setLancamentoReAmbiente(p.lancamentoReAmbiente ?? "aereo");
    setPoste(slotsFromStored(p.posteConexao?.fotos ?? [], 1));
    setPosteObs(p.posteConexao?.obs ?? "");
    setCaixaDual(dualFromGrupo(p.caixaEmenda));
    setDuto(slotsFromStored(p.dutoSubterraneo?.fotos ?? [], 1));
    setDutoObs(p.dutoSubterraneo?.obs ?? "");
    setPlaquetaDual(dualFromGrupo(p.plaquetaIdentificacao));
    setSobraDual(dualFromGrupo(p.sobraTecnica));
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
      fiberloopInstalado: p.redeAcesso?.fiberloopInstalado ?? emptyCordoalhaBloco(),
      qtdFiberloopInstalado:
        p.redeAcesso?.fiberloopInstalado?.isSim === true
          ? p.redeAcesso.fiberloopInstalado.quantidade
          : null,
      cordoalhaLancada: p.redeAcesso?.cordoalhaLancada ?? emptyCordoalhaBloco(),
      cordoalhaExistente: {
        isSim: (p.redeAcesso?.cordoalhaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      postesNovaCordoalha: p.redeAcesso?.postesNovaCordoalha ?? emptyCordoalhaBloco(),
      postesCordoalhaExistente: {
        isSim: (p.redeAcesso?.postesCordoalhaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      qtdTotalPostes: p.redeAcesso?.qtdTotalPostes ?? null,
      metrosDutoSubterraneo: p.redeAcesso?.metrosDutoSubterraneo ?? null,
      sobraTecnicaExecutada: gateSimComLegado(
        p.redeAcesso?.sobraTecnicaExecutada,
        fotoGrupoPorAmbienteTemFotos(p.sobraTecnica),
      ),
      construcaoDutoSubterraneo: gateSimComLegado(
        p.redeAcesso?.construcaoDutoSubterraneo,
        fotoGrupoTemFotos(p.dutoSubterraneo) ||
          (p.redeAcesso?.metrosDutoSubterraneo ?? 0) > 0,
      ),
      construcaoCaixaSubterranea: (() => {
        const raw = p.redeAcesso?.construcaoCaixaSubterranea as unknown;
        if (typeof raw === "number" && Number.isFinite(raw)) {
          return { isSim: true as const, quantidade: Math.trunc(raw) };
        }
        if (raw && typeof raw === "object") {
          const b = raw as { isSim?: boolean | null; quantidade?: number | null };
          return {
            isSim: b.isSim === true ? true : b.isSim === false ? false : null,
            quantidade: typeof b.quantidade === "number" ? b.quantidade : null,
          };
        }
        return emptyCordoalhaBloco();
      })(),
      caixaEmendaExistente: {
        isSim: (p.redeAcesso?.caixaEmendaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      aterramento: {
        totalHastes: p.redeAcesso?.aterramento?.totalHastes ?? null,
        pontosAterramento: p.redeAcesso?.aterramento?.pontosAterramento ?? null,
      },
    });
    setObsAdminGrupos({
      posteConexao: readObsAdmin(p.posteConexao),
      dutoSubterraneo: readObsAdmin(p.dutoSubterraneo),
      novoAterramentoPoste: readObsAdmin(p.novoAterramentoPoste),
      posicaoConexaoEstacao: readObsAdmin(p.posicaoConexaoEstacao),
      etiquetaIdentificacao: readObsAdmin(p.etiquetaIdentificacao),
      rcPosteConexao: readObsAdmin(p.rcPosteConexao),
      rcTerminacaoCabo: readObsAdmin(p.rcTerminacaoCabo),
      rcEntradaInterna: readObsAdmin(p.rcEntradaInterna),
      rcEntradaExterna: readObsAdmin(p.rcEntradaExterna),
      rcNovoAterramentoPoste: readObsAdmin(p.rcNovoAterramentoPoste),
      rcDutoSubterraneo: readObsAdmin(p.rcDutoSubterraneo),
    });
    setAmbientesGrupos({
      caixaEmenda: "aereo",
      plaquetaIdentificacao: "aereo",
      sobraTecnica: "aereo",
      rcCaixaEmenda: "aereo",
      rcPlaquetaIdentificacao: "aereo",
      rcSobraTecnica: "aereo",
    });
    setTecnologiaAcesso(p.tecnologiaAcesso ?? "");
    setLancamentoCabosRc(hydrateLanc(p.lancamentoCabosRc));
    setLancamentoRcAmbiente(p.lancamentoRcAmbiente ?? "aereo");
    setRcPoste(slotsFromStored(p.rcPosteConexao?.fotos ?? [], 1));
    setRcPosteObs(p.rcPosteConexao?.obs ?? "");
    setRcCaixaDual(dualFromGrupo(p.rcCaixaEmenda));
    setRcTerminacao(slotsFromStored(p.rcTerminacaoCabo?.fotos ?? [], 1));
    setRcTerminacaoObs(p.rcTerminacaoCabo?.obs ?? "");
    setRcPlaquetaDual(dualFromGrupo(p.rcPlaquetaIdentificacao));
    setRcEntradaInterna(slotsFromStored(p.rcEntradaInterna?.fotos ?? [], 1));
    setRcEntradaInternaObs(p.rcEntradaInterna?.obs ?? "");
    setRcEntradaExterna(slotsFromStored(p.rcEntradaExterna?.fotos ?? [], 1));
    setRcEntradaExternaObs(p.rcEntradaExterna?.obs ?? "");
    setRcSobraDual(dualFromGrupo(p.rcSobraTecnica));
    setRcNovoAterramento(slotsFromStored(p.rcNovoAterramentoPoste?.fotos ?? [], 1));
    setRcNovoAterramentoObs(p.rcNovoAterramentoPoste?.obs ?? "");
    setRcDuto(slotsFromStored(p.rcDutoSubterraneo?.fotos ?? [], 1));
    setRcDutoObs(p.rcDutoSubterraneo?.obs ?? "");
    setOutrasRc(outrasFromPayload(p.outrasFotosRc));
    setRedeCliente({
      ...emptyQuantidadesRede(),
      ...(p.redeCliente ?? {}),
      fiberloopInstalado: p.redeCliente?.fiberloopInstalado ?? emptyCordoalhaBloco(),
      qtdFiberloopInstalado:
        p.redeCliente?.fiberloopInstalado?.isSim === true
          ? p.redeCliente.fiberloopInstalado.quantidade
          : null,
      cordoalhaLancada: p.redeCliente?.cordoalhaLancada ?? emptyCordoalhaBloco(),
      cordoalhaExistente: {
        isSim: (p.redeCliente?.cordoalhaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      postesNovaCordoalha: p.redeCliente?.postesNovaCordoalha ?? emptyCordoalhaBloco(),
      postesCordoalhaExistente: {
        isSim: (p.redeCliente?.postesCordoalhaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      qtdTotalPostes: p.redeCliente?.qtdTotalPostes ?? null,
      metrosDutoSubterraneo: p.redeCliente?.metrosDutoSubterraneo ?? null,
      sobraTecnicaExecutada: gateSimComLegado(
        p.redeCliente?.sobraTecnicaExecutada,
        fotoGrupoPorAmbienteTemFotos(p.rcSobraTecnica),
      ),
      construcaoDutoSubterraneo: gateSimComLegado(
        p.redeCliente?.construcaoDutoSubterraneo,
        fotoGrupoTemFotos(p.rcDutoSubterraneo) ||
          (p.redeCliente?.metrosDutoSubterraneo ?? 0) > 0,
      ),
      construcaoCaixaSubterranea: (() => {
        const raw = p.redeCliente?.construcaoCaixaSubterranea as unknown;
        if (typeof raw === "number" && Number.isFinite(raw)) {
          return { isSim: true as const, quantidade: Math.trunc(raw) };
        }
        if (raw && typeof raw === "object") {
          const b = raw as { isSim?: boolean | null; quantidade?: number | null };
          return {
            isSim: b.isSim === true ? true : b.isSim === false ? false : null,
            quantidade: typeof b.quantidade === "number" ? b.quantidade : null,
          };
        }
        return emptyCordoalhaBloco();
      })(),
      caixaEmendaExistente: {
        isSim: (p.redeCliente?.caixaEmendaExistente ?? emptyCordoalhaBloco()).isSim,
        quantidade: null,
      },
      aterramento: {
        totalHastes: p.redeCliente?.aterramento?.totalHastes ?? null,
        pontosAterramento: p.redeCliente?.aterramento?.pontosAterramento ?? null,
      },
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
    setPadraoCoresFibra(parsePadraoCoresFibra(p.padraoCoresFibra));
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
    setPendenciasItens(p.pendenciasItens ?? []);
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
    if (abaCampo === "contatos" || abaCampo === "infraestrutura" || abaCampo === "medicoes") {
      setAbaCampo("RE");
    }
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

  const dualSetters: Partial<
    Record<RelatorioFotoGrupoKey, React.Dispatch<React.SetStateAction<DualFotoUi>>>
  > = {
    caixaEmenda: setCaixaDual,
    plaquetaIdentificacao: setPlaquetaDual,
    sobraTecnica: setSobraDual,
    rcCaixaEmenda: setRcCaixaDual,
    rcPlaquetaIdentificacao: setRcPlaquetaDual,
    rcSobraTecnica: setRcSobraDual,
  };

  const handleGrupoPhoto = (
    setter: React.Dispatch<React.SetStateAction<FotoSlot[]>>,
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
    ambiente?: AmbienteRede | null,
  ) => {
    const aba: AmbienteRede = ambiente === "subterraneo" ? "subterraneo" : "aereo";
    const dualSetter = isFotoGrupoPorAmbienteKey(grupoKey) ? dualSetters[grupoKey] : undefined;

    const applySlots = (nextSlots: FotoSlot[]) => {
      const base = buildPayload();
      if (dualSetter && isFotoGrupoPorAmbienteKey(grupoKey)) {
        const dual = base[grupoKey];
        return {
          ...base,
          [grupoKey]: {
            ...dual,
            [aba]: { ...dual[aba], fotos: fotosDosSlots(nextSlots) },
          },
        };
      }
      return {
        ...base,
        [grupoKey]: { ...(base[grupoKey] as EscopoPayload["posteConexao"]), fotos: fotosDosSlots(nextSlots) },
      };
    };

    if (dualSetter) {
      if (!file) {
        let nextSlots: FotoSlot[] = [];
        dualSetter((prev) => {
          nextSlots = prev[aba].slots.map((slot) =>
            slot.id === slotId ? { ...slot, stored: null, file: null } : slot,
          );
          return { ...prev, [aba]: { ...prev[aba], slots: nextSlots } };
        });
        void persistDraft(applySlots(nextSlots));
        return;
      }
      void uploadFotoImediato(file, `${grupoKey}-${aba}-${slotId.slice(0, 8)}`, (stored) => {
        let nextSlots: FotoSlot[] = [];
        dualSetter((prev) => {
          nextSlots = prev[aba].slots.map((slot) =>
            slot.id === slotId ? { ...slot, file: null, stored } : slot,
          );
          return { ...prev, [aba]: { ...prev[aba], slots: nextSlots } };
        });
        return applySlots(nextSlots);
      });
      return;
    }

    if (!file) {
      let nextSlots: FotoSlot[] = [];
      setter((prev) => {
        nextSlots = prev.map((slot) =>
          slot.id === slotId ? { ...slot, stored: null, file: null } : slot,
        );
        return nextSlots;
      });
      void persistDraft(applySlots(nextSlots));
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
      return applySlots(nextSlots);
    });
  };

  const handleCaboPhoto = (
    setter: React.Dispatch<React.SetStateAction<LancamentoPorAmbientePayload>>,
    lado: "lancamentoCabosRe" | "lancamentoCabosRc",
    ambiente: AmbienteRede,
    caboId: string,
    campo: "fotoInicio" | "fotoFim",
    file: EvidencePhotoRef | null,
  ) => {
    const patchLista = (list: CaboMetragemPayload[], stored: StoredPhoto | null) =>
      list.map((item) => (item.id === caboId ? { ...item, [campo]: stored } : item));

    if (!file) {
      let next: LancamentoPorAmbientePayload | null = null;
      setter((prev) => {
        next = {
          ...prev,
          [ambiente]: { ...prev[ambiente], metragens: patchLista(prev[ambiente].metragens, null) },
        };
        return next;
      });
      void persistDraft({ ...buildPayload(), [lado]: next! });
      return;
    }
    void uploadFotoImediato(file, `${lado}-${ambiente}-${campo}-${caboId.slice(0, 8)}`, (stored) => {
      let next: LancamentoPorAmbientePayload | null = null;
      setter((prev) => {
        next = {
          ...prev,
          [ambiente]: { ...prev[ambiente], metragens: patchLista(prev[ambiente].metragens, stored) },
        };
        return next;
      });
      return { ...buildPayload(), [lado]: next! };
    });
  };

  const handleCaboGalleryFiles = (
    setter: React.Dispatch<React.SetStateAction<LancamentoPorAmbientePayload>>,
    lado: "lancamentoCabosRe" | "lancamentoCabosRc",
    ambiente: AmbienteRede,
    fromCaboId: string,
    fromCampo: "fotoInicio" | "fotoFim",
    photos: EvidencePhotoRef[],
  ) => {
    if (photos.length === 0) return;
    if (photos.length === 1) {
      handleCaboPhoto(setter, lado, ambiente, fromCaboId, fromCampo, photos[0]);
      return;
    }

    const cabosAtuais = (
      lado === "lancamentoCabosRe" ? lancamentoCabosRe : lancamentoCabosRc
    )[ambiente].metragens;

    const { assignments, newCabos } = planCaboMetragemGalleryAssignments(cabosAtuais, photos, {
      startCaboId: fromCaboId,
      startCampo: fromCampo,
    });

    const ensureCabos = (list: CaboMetragemPayload[]) => {
      if (newCabos.length === 0) return list;
      const ids = new Set(list.map((c) => c.id));
      const extras = newCabos.filter((c) => !ids.has(c.id));
      return extras.length ? [...list, ...extras] : list;
    };

    // Garante os novos cards no estado antes/durante os uploads.
    if (newCabos.length > 0) {
      setter((prev) => ({
        ...prev,
        [ambiente]: {
          ...prev[ambiente],
          metragens: ensureCabos(prev[ambiente].metragens),
        },
      }));
    }

    for (const item of assignments) {
      void uploadFotoImediato(
        item.file,
        `${lado}-${ambiente}-${item.campo}-${item.caboId.slice(0, 8)}`,
        (stored) => {
          let next: LancamentoPorAmbientePayload | null = null;
          setter((prev) => {
            const metragens = ensureCabos(prev[ambiente].metragens).map((cabo) =>
              cabo.id === item.caboId ? { ...cabo, [item.campo]: stored } : cabo,
            );
            next = {
              ...prev,
              [ambiente]: { ...prev[ambiente], metragens },
            };
            return next;
          });
          return { ...buildPayload(), [lado]: next! };
        },
      );
    }
  };

  const patchCaboAmbiente = (
    setter: React.Dispatch<React.SetStateAction<LancamentoPorAmbientePayload>>,
    ambiente: AmbienteRede,
    caboId: string,
    patch: Partial<CaboMetragemPayload>,
  ) => {
    setter((prev) => ({
      ...prev,
      [ambiente]: {
        ...prev[ambiente],
        metragens: prev[ambiente].metragens.map((item) => {
          if (item.id !== caboId) return item;
          const next = { ...item, ...patch };
          if ("marcacaoInicial" in patch || "marcacaoFinal" in patch) {
            next.metragem = calcularMetragemCaboTotal(next.marcacaoInicial, next.marcacaoFinal);
          }
          if ("tipoCabo" in patch && patch.tipoCabo != null) {
            next.tipoCabo = apenasDigitos(patch.tipoCabo, 3);
          }
          return next;
        }),
      },
    }));
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

  const patchAmbienteGrupo = (key: RelatorioFotoGrupoKey) => (ambiente: AmbienteRede) => {
    setAmbientesGrupos((prev) => ({ ...prev, [key]: ambiente }));
  };

  const abaDe = (key: RelatorioFotoGrupoKey): AmbienteRede =>
    ambientesGrupos[key] === "subterraneo" ? "subterraneo" : "aereo";

  const bindDualGrupo = (
    key: RelatorioFotoGrupoKey,
    dual: DualFotoUi,
    setDual: React.Dispatch<React.SetStateAction<DualFotoUi>>,
    options?: { herdarAmbienteDe?: RelatorioFotoGrupoKey },
  ) => {
    const aba = abaDe(options?.herdarAmbienteDe ?? key);
    return {
      slots: dual[aba].slots,
      onChange: (slots: FotoSlot[]) =>
        setDual((prev) => ({ ...prev, [aba]: { ...prev[aba], slots } })),
      obs: dual[aba].obs,
      onObsChange: (obs: string) =>
        setDual((prev) => ({ ...prev, [aba]: { ...prev[aba], obs } })),
      obsAdmin: dual[aba].obsAdmin,
      onObsAdminChange: (obsAdmin: string) =>
        setDual((prev) => ({ ...prev, [aba]: { ...prev[aba], obsAdmin } })),
      ambiente: aba,
      ...(options?.herdarAmbienteDe
        ? { showAmbienteToggle: false as const }
        : {
            showAmbienteToggle: true as const,
            onAmbienteChange: patchAmbienteGrupo(key),
          }),
    };
  };

  const simNaoDe = (isSim: boolean | null): "sim" | "nao" | "" =>
    isSim === true ? "sim" : isSim === false ? "nao" : "";

  const patchLancamentoSim = (
    setter: React.Dispatch<React.SetStateAction<LancamentoPorAmbientePayload>>,
    ambiente: AmbienteRede,
    value: "sim" | "nao",
  ) => {
    setter((prev) => {
      const lado = prev[ambiente];
      const isSim = value === "sim";
      return {
        ...prev,
        [ambiente]: {
          ...lado,
          isSim,
          metragens: isSim && lado.metragens.length === 0 ? [emptyCaboMetragem()] : lado.metragens,
        },
      };
    });
  };

  const patchFiberloop = (
    setter: React.Dispatch<React.SetStateAction<QuantidadesRedePayload>>,
    fiberloopInstalado: QuantidadesRedePayload["fiberloopInstalado"],
  ) => {
    setter((prev) => ({
      ...prev,
      fiberloopInstalado,
      qtdFiberloopInstalado:
        fiberloopInstalado.isSim === true ? fiberloopInstalado.quantidade : null,
    }));
  };

  const showObsAdmin = hasPainelFullAccess(user?.role);
  /** Técnico no relatório: header rola; abas grudem no topo da viewport. */
  const headerRolaComPagina = !showObsAdmin;

  const grupoSetters: Record<
    RelatorioFotoGrupoKey,
    React.Dispatch<React.SetStateAction<FotoSlot[]>>
  > = {
    posteConexao: setPoste,
    caixaEmenda: () => {},
    dutoSubterraneo: setDuto,
    plaquetaIdentificacao: () => {},
    sobraTecnica: () => {},
    novoAterramentoPoste: setNovoAterramento,
    aterramentoTerrometro: () => {},
    posicaoConexaoEstacao: setPosicao,
    etiquetaIdentificacao: setEtiqueta,
    rcPosteConexao: setRcPoste,
    rcCaixaEmenda: () => {},
    rcTerminacaoCabo: setRcTerminacao,
    rcPlaquetaIdentificacao: () => {},
    rcEntradaInterna: setRcEntradaInterna,
    rcEntradaExterna: setRcEntradaExterna,
    rcSobraTecnica: () => {},
    rcNovoAterramentoPoste: setRcNovoAterramento,
    rcDutoSubterraneo: setRcDuto,
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
      setPendenciasItens([]);
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
        <AppHeader sticky={!headerRolaComPagina} />
        <main className="mx-auto max-w-2xl px-5 pb-16 pt-10">
          <p className="text-sm text-muted-foreground">Carregando relatório...</p>
        </main>
      </div>
    );
  }

  if (step === 1) {
    return (
      <div className="min-h-screen bg-surface">
        <AppHeader sticky={!headerRolaComPagina} />
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
    <PendenciasProvider mode="tecnico" confirmed={pendenciasItens}>
    <PendenciasAbaBridge setAba={setAbaCampo} />
    <div className="min-h-screen bg-surface">
      <AppHeader sticky={!headerRolaComPagina} />
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-4">
        <Link
          to="/relatorio"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar às OS
        </Link>

        <header className="mb-6">
          <div className="flex flex-row flex-wrap items-center justify-between gap-2">
            <h1 className="min-w-0 truncate text-2xl font-black tracking-tight text-gray-900">
              Relatório - {osWf.trim() || "—"}
            </h1>
            <div className="flex shrink-0 items-center gap-3">
              <button
                type="button"
                onClick={() => setIsDadosObraOpen(true)}
                className="flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-3 py-1 text-xs font-semibold text-green-700 transition-colors hover:bg-green-100"
              >
                <Info className="h-4 w-4 shrink-0" aria-hidden />
                <span>Dados do contrato</span>
              </button>
              {readOnly ? (
                <span className="text-xs font-medium text-muted-foreground">
                  {status === "fechado" ? "Fechado" : "Avisado"}
                </span>
              ) : (
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
            </div>
          </div>
          {tecnicosAtribuidos.length > 1 ? (
            <Badge className="mt-2 bg-sky-600 text-white hover:bg-sky-600">
              OS Colaborativa — {nomesOutros.length ? nomesOutros.join(", ") : "equipe"}
            </Badge>
          ) : null}
        </header>

        <form
          id="relatorio-form"
          onSubmit={(e) => {
            e.preventDefault();
            void onAvisar();
          }}
          className="space-y-5"
        >
          {mostrarFormularioCampo ? (
            <>
              <RelatorioAbasCampo
                abaAtiva={abaCampo}
                onChange={setAbaCampo}
                abas={tipo === "empresarial" ? ABAS_CAMPO_TECNICO : ABAS_CAMPO_IMPLANTACAO}
                stickToViewportTop={headerRolaComPagina}
                temPendencia={status === "pendente" || pendenciasItens.length > 0}
                motivoPendencia={motivoPendencia}
                pendenciasItens={pendenciasItens}
                layoutMode="tecnico"
              />

              {mostrarRedeAcesso ? (
                <RelatorioRedeAcesso
                  readOnly={readOnly}
                  redeVariant="RE"
                  stickTabsAtViewportTop={headerRolaComPagina}
                  lancamentoRe={simNaoDe(lancamentoCabosRe[lancamentoReAmbiente].isSim)}
                  onLancamentoRe={(value) =>
                    patchLancamentoSim(setLancamentoCabosRe, lancamentoReAmbiente, value)
                  }
                  lancamentoAmbiente={lancamentoReAmbiente}
                  onLancamentoAmbienteChange={setLancamentoReAmbiente}
                  fiberloopInstalado={redeAcesso.fiberloopInstalado}
                  onFiberloopInstaladoChange={(next) => patchFiberloop(setRedeAcesso, next)}
                  cordoalhaLancada={redeAcesso.cordoalhaLancada}
                  onCordoalhaLancadaChange={(cordoalhaLancada) =>
                    setRedeAcesso((prev) => ({ ...prev, cordoalhaLancada }))
                  }
                  cordoalhaExistente={redeAcesso.cordoalhaExistente}
                  onCordoalhaExistenteChange={(cordoalhaExistente) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      cordoalhaExistente: {
                        isSim: cordoalhaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  postesNovaCordoalha={redeAcesso.postesNovaCordoalha}
                  onPostesNovaCordoalhaChange={(postesNovaCordoalha) =>
                    setRedeAcesso((prev) => ({ ...prev, postesNovaCordoalha }))
                  }
                  postesCordoalhaExistente={redeAcesso.postesCordoalhaExistente}
                  onPostesCordoalhaExistenteChange={(postesCordoalhaExistente) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      postesCordoalhaExistente: {
                        isSim: postesCordoalhaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  qtdTotalPostes={redeAcesso.qtdTotalPostes}
                  onQtdTotalPostesChange={(qtdTotalPostes) =>
                    setRedeAcesso((prev) => ({ ...prev, qtdTotalPostes }))
                  }
                  aterramentoPontos={redeAcesso.aterramento.pontosAterramento}
                  onAterramentoPontosChange={(pontosAterramento) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      aterramento: { ...prev.aterramento, pontosAterramento },
                    }))
                  }
                  aterramentoHastes={redeAcesso.aterramento.totalHastes}
                  onAterramentoHastesChange={(totalHastes) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      aterramento: { ...prev.aterramento, totalHastes },
                    }))
                  }
                  construcaoCaixaSubterranea={redeAcesso.construcaoCaixaSubterranea}
                  onConstrucaoCaixaSubterraneaChange={(construcaoCaixaSubterranea) =>
                    setRedeAcesso((prev) => ({ ...prev, construcaoCaixaSubterranea }))
                  }
                  sobraTecnicaExecutada={redeAcesso.sobraTecnicaExecutada}
                  onSobraTecnicaExecutadaChange={(sobraTecnicaExecutada) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      sobraTecnicaExecutada: {
                        isSim: sobraTecnicaExecutada.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  construcaoDutoSubterraneo={redeAcesso.construcaoDutoSubterraneo}
                  onConstrucaoDutoSubterraneoChange={(construcaoDutoSubterraneo) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      construcaoDutoSubterraneo: {
                        isSim: construcaoDutoSubterraneo.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  caixaEmendaExistente={redeAcesso.caixaEmendaExistente}
                  onCaixaEmendaExistenteChange={(caixaEmendaExistente) =>
                    setRedeAcesso((prev) => ({
                      ...prev,
                      caixaEmendaExistente: {
                        isSim: caixaEmendaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  cabos={lancamentoCabosRe[lancamentoReAmbiente].metragens}
                  onPatchCabo={(id, patch) =>
                    patchCaboAmbiente(setLancamentoCabosRe, lancamentoReAmbiente, id, patch)
                  }
                  onAddCabo={() =>
                    setLancamentoCabosRe((prev) => ({
                      ...prev,
                      [lancamentoReAmbiente]: {
                        ...prev[lancamentoReAmbiente],
                        metragens: [
                          ...prev[lancamentoReAmbiente].metragens,
                          emptyCaboMetragem(),
                        ],
                      },
                    }))
                  }
                  onRemoveCabo={(id) =>
                    setLancamentoCabosRe((prev) => ({
                      ...prev,
                      [lancamentoReAmbiente]: {
                        ...prev[lancamentoReAmbiente],
                        metragens: removeExtraById(prev[lancamentoReAmbiente].metragens, id),
                      },
                    }))
                  }
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(
                      setLancamentoCabosRe,
                      "lancamentoCabosRe",
                      lancamentoReAmbiente,
                      caboId,
                      campo,
                      file,
                    )
                  }
                  onCaboGalleryFiles={(fromCaboId, fromCampo, photos) =>
                    handleCaboGalleryFiles(
                      setLancamentoCabosRe,
                      "lancamentoCabosRe",
                      lancamentoReAmbiente,
                      fromCaboId,
                      fromCampo,
                      photos,
                    )
                  }
                  showObsAdmin={showObsAdmin}
                  grupos={[
                    {
                      grupoKey: "sobraTecnica",
                      section: "cabos",
                      title: "Sobra técnica",
                      minSlots: 1,
                      ...bindDualGrupo("sobraTecnica", sobraDual, setSobraDual),
                    },
                    {
                      grupoKey: "posteConexao",
                      section: "poste",
                      title: "Poste de conexão",
                      slots: poste,
                      onChange: setPoste,
                      obs: posteObs,
                      onObsChange: setPosteObs,
                      obsAdmin: obsAdminGrupos.posteConexao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("posteConexao"),
                    },
                    {
                      grupoKey: "novoAterramentoPoste",
                      section: "poste",
                      title: "Novo aterramento do poste",
                      slots: novoAterramento,
                      onChange: setNovoAterramento,
                      obs: novoAterramentoObs,
                      onObsChange: setNovoAterramentoObs,
                      obsAdmin: obsAdminGrupos.novoAterramentoPoste ?? "",
                      onObsAdminChange: patchObsAdminGrupo("novoAterramentoPoste"),
                    },
                    {
                      grupoKey: "dutoSubterraneo",
                      section: "cabos",
                      title: "Const. de duto subterrâneo (MD ou MND) — metros (MT)",
                      slots: duto,
                      onChange: setDuto,
                      obs: dutoObs,
                      onObsChange: setDutoObs,
                      obsAdmin: obsAdminGrupos.dutoSubterraneo ?? "",
                      onObsAdminChange: patchObsAdminGrupo("dutoSubterraneo"),
                      quantidade: redeAcesso.metrosDutoSubterraneo,
                      quantidadePlaceholder: "Ex: 120",
                      onQuantidadeChange: (metrosDutoSubterraneo: number | null) => {
                        setRedeAcesso((prev) => ({ ...prev, metrosDutoSubterraneo }));
                      },
                    },
                    {
                      grupoKey: "caixaEmenda",
                      section: "caixa",
                      title: "Caixa de emenda",
                      ...bindDualGrupo("caixaEmenda", caixaDual, setCaixaDual),
                      ...(tipo === "empresarial" || tipo === "implantacao"
                        ? {
                            quantidade:
                              redeAcesso.qtdCaixasEmendaPorAmbiente[abaDe("caixaEmenda")],
                            quantidadeLabel: "Quantidade de Caixas de Emenda",
                            quantidadePlaceholder: "Ex: 4",
                            onQuantidadeChange: (qtd: number | null) => {
                              const aba = abaDe("caixaEmenda");
                              setRedeAcesso((prev) => {
                                const por = { ...prev.qtdCaixasEmendaPorAmbiente, [aba]: qtd };
                                return {
                                  ...prev,
                                  qtdCaixasEmendaPorAmbiente: por,
                                  qtdCaixasEmenda: (por.aereo || 0) + (por.subterraneo || 0) || null,
                                };
                              });
                            },
                          }
                        : {}),
                    },
                    {
                      grupoKey: "plaquetaIdentificacao",
                      section: "caixa",
                      title: "Plaqueta de Identificação - Caixa de emenda",
                      ...bindDualGrupo("plaquetaIdentificacao", plaquetaDual, setPlaquetaDual, {
                        herdarAmbienteDe: "caixaEmenda",
                      }),
                    },
                  ]}
                  onGrupoPhoto={(grupoKey, slotId, file, ambiente) => {
                    handleGrupoPhoto(grupoSetters[grupoKey], grupoKey, slotId, file, ambiente);
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
                  redeVariant="RC"
                  stickTabsAtViewportTop={headerRolaComPagina}
                  header={
                    <CampoCoordenadas
                      id="secao-coordenadas-cliente"
                      title="Coordenadas do Cliente"
                      value={redeCliente.coordenadas}
                      onChange={(coordenadas) =>
                        setRedeCliente((prev) => ({ ...prev, coordenadas }))
                      }
                      disabled={readOnly}
                      embedded
                    />
                  }
                  lancamentoTitle="Lançamento cabos (RC)?"
                  lancamentoRe={simNaoDe(lancamentoCabosRc[lancamentoRcAmbiente].isSim)}
                  onLancamentoRe={(value) =>
                    patchLancamentoSim(setLancamentoCabosRc, lancamentoRcAmbiente, value)
                  }
                  lancamentoAmbiente={lancamentoRcAmbiente}
                  onLancamentoAmbienteChange={setLancamentoRcAmbiente}
                  fiberloopInstalado={redeCliente.fiberloopInstalado}
                  onFiberloopInstaladoChange={(next) => patchFiberloop(setRedeCliente, next)}
                  cordoalhaLancada={redeCliente.cordoalhaLancada}
                  onCordoalhaLancadaChange={(cordoalhaLancada) =>
                    setRedeCliente((prev) => ({ ...prev, cordoalhaLancada }))
                  }
                  cordoalhaExistente={redeCliente.cordoalhaExistente}
                  onCordoalhaExistenteChange={(cordoalhaExistente) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      cordoalhaExistente: {
                        isSim: cordoalhaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  postesNovaCordoalha={redeCliente.postesNovaCordoalha}
                  onPostesNovaCordoalhaChange={(postesNovaCordoalha) =>
                    setRedeCliente((prev) => ({ ...prev, postesNovaCordoalha }))
                  }
                  postesCordoalhaExistente={redeCliente.postesCordoalhaExistente}
                  onPostesCordoalhaExistenteChange={(postesCordoalhaExistente) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      postesCordoalhaExistente: {
                        isSim: postesCordoalhaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  qtdTotalPostes={redeCliente.qtdTotalPostes}
                  onQtdTotalPostesChange={(qtdTotalPostes) =>
                    setRedeCliente((prev) => ({ ...prev, qtdTotalPostes }))
                  }
                  aterramentoPontos={redeCliente.aterramento.pontosAterramento}
                  onAterramentoPontosChange={(pontosAterramento) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      aterramento: { ...prev.aterramento, pontosAterramento },
                    }))
                  }
                  aterramentoHastes={redeCliente.aterramento.totalHastes}
                  onAterramentoHastesChange={(totalHastes) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      aterramento: { ...prev.aterramento, totalHastes },
                    }))
                  }
                  construcaoCaixaSubterranea={redeCliente.construcaoCaixaSubterranea}
                  onConstrucaoCaixaSubterraneaChange={(construcaoCaixaSubterranea) =>
                    setRedeCliente((prev) => ({ ...prev, construcaoCaixaSubterranea }))
                  }
                  sobraTecnicaExecutada={redeCliente.sobraTecnicaExecutada}
                  onSobraTecnicaExecutadaChange={(sobraTecnicaExecutada) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      sobraTecnicaExecutada: {
                        isSim: sobraTecnicaExecutada.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  construcaoDutoSubterraneo={redeCliente.construcaoDutoSubterraneo}
                  onConstrucaoDutoSubterraneoChange={(construcaoDutoSubterraneo) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      construcaoDutoSubterraneo: {
                        isSim: construcaoDutoSubterraneo.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  caixaEmendaExistente={redeCliente.caixaEmendaExistente}
                  onCaixaEmendaExistenteChange={(caixaEmendaExistente) =>
                    setRedeCliente((prev) => ({
                      ...prev,
                      caixaEmendaExistente: {
                        isSim: caixaEmendaExistente.isSim,
                        quantidade: null,
                      },
                    }))
                  }
                  cabos={lancamentoCabosRc[lancamentoRcAmbiente].metragens}
                  onPatchCabo={(id, patch) =>
                    patchCaboAmbiente(setLancamentoCabosRc, lancamentoRcAmbiente, id, patch)
                  }
                  onAddCabo={() =>
                    setLancamentoCabosRc((prev) => ({
                      ...prev,
                      [lancamentoRcAmbiente]: {
                        ...prev[lancamentoRcAmbiente],
                        metragens: [
                          ...prev[lancamentoRcAmbiente].metragens,
                          emptyCaboMetragem(),
                        ],
                      },
                    }))
                  }
                  onRemoveCabo={(id) =>
                    setLancamentoCabosRc((prev) => ({
                      ...prev,
                      [lancamentoRcAmbiente]: {
                        ...prev[lancamentoRcAmbiente],
                        metragens: removeExtraById(prev[lancamentoRcAmbiente].metragens, id),
                      },
                    }))
                  }
                  onCaboPhoto={(caboId, campo, file) =>
                    handleCaboPhoto(
                      setLancamentoCabosRc,
                      "lancamentoCabosRc",
                      lancamentoRcAmbiente,
                      caboId,
                      campo,
                      file,
                    )
                  }
                  onCaboGalleryFiles={(fromCaboId, fromCampo, photos) =>
                    handleCaboGalleryFiles(
                      setLancamentoCabosRc,
                      "lancamentoCabosRc",
                      lancamentoRcAmbiente,
                      fromCaboId,
                      fromCampo,
                      photos,
                    )
                  }
                  showObsAdmin={showObsAdmin}
                  grupos={[
                    {
                      grupoKey: "eqClienteFachada",
                      section: "local",
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
                      section: "local",
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
                      section: "local",
                      title: "(Rack ou Local)",
                      slots: eqGrupos.eqClienteRack.slots,
                      onChange: setEqGrupoSlots("eqClienteRack"),
                      obs: eqGrupos.eqClienteRack.obs,
                      onObsChange: setEqGrupoObs("eqClienteRack"),
                      obsAdmin: eqGrupos.eqClienteRack.obsAdmin,
                      onObsAdminChange: setEqGrupoObsAdmin("eqClienteRack"),
                    },
                    {
                      grupoKey: "rcEntradaExterna",
                      section: "cabos",
                      title: "Entrada do cabo no cliente (Área externa)",
                      slots: rcEntradaExterna,
                      onChange: setRcEntradaExterna,
                      obs: rcEntradaExternaObs,
                      onObsChange: setRcEntradaExternaObs,
                      obsAdmin: obsAdminGrupos.rcEntradaExterna ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcEntradaExterna"),
                    },
                    {
                      grupoKey: "rcEntradaInterna",
                      section: "cabos",
                      title: "Entrada do cabo no cliente (Área interna)",
                      slots: rcEntradaInterna,
                      onChange: setRcEntradaInterna,
                      obs: rcEntradaInternaObs,
                      onObsChange: setRcEntradaInternaObs,
                      obsAdmin: obsAdminGrupos.rcEntradaInterna ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcEntradaInterna"),
                    },
                    {
                      grupoKey: "rcTerminacaoCabo",
                      section: "cabos",
                      title: "Terminação do cabo no cliente (PTO/Roseta - área interna)",
                      slots: rcTerminacao,
                      onChange: setRcTerminacao,
                      obs: rcTerminacaoObs,
                      onObsChange: setRcTerminacaoObs,
                      obsAdmin: obsAdminGrupos.rcTerminacaoCabo ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcTerminacaoCabo"),
                    },
                    {
                      grupoKey: "rcSobraTecnica",
                      section: "cabos",
                      title: "Sobra técnica",
                      minSlots: 1,
                      ...bindDualGrupo("rcSobraTecnica", rcSobraDual, setRcSobraDual),
                    },
                    {
                      grupoKey: "rcDutoSubterraneo",
                      section: "cabos",
                      title: "Const. de duto subterrâneo (MD ou MND) — metros (MT)",
                      slots: rcDuto,
                      onChange: setRcDuto,
                      obs: rcDutoObs,
                      onObsChange: setRcDutoObs,
                      obsAdmin: obsAdminGrupos.rcDutoSubterraneo ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcDutoSubterraneo"),
                      quantidade: redeCliente.metrosDutoSubterraneo,
                      quantidadePlaceholder: "Ex: 120",
                      onQuantidadeChange: (metrosDutoSubterraneo: number | null) => {
                        setRedeCliente((prev) => ({ ...prev, metrosDutoSubterraneo }));
                      },
                    },
                    {
                      grupoKey: "rcPosteConexao",
                      section: "poste",
                      title: "Poste de conexão (Rede cliente com Rede Externa)",
                      slots: rcPoste,
                      onChange: setRcPoste,
                      obs: rcPosteObs,
                      onObsChange: setRcPosteObs,
                      obsAdmin: obsAdminGrupos.rcPosteConexao ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcPosteConexao"),
                    },
                    {
                      grupoKey: "rcNovoAterramentoPoste",
                      section: "poste",
                      title: "Novo aterramento do poste",
                      slots: rcNovoAterramento,
                      onChange: setRcNovoAterramento,
                      obs: rcNovoAterramentoObs,
                      onObsChange: setRcNovoAterramentoObs,
                      obsAdmin: obsAdminGrupos.rcNovoAterramentoPoste ?? "",
                      onObsAdminChange: patchObsAdminGrupo("rcNovoAterramentoPoste"),
                    },
                    {
                      grupoKey: "rcCaixaEmenda",
                      section: "caixa",
                      title: "Caixa de emenda na acomodação (Rede cliente com Rede Externa)",
                      ...bindDualGrupo("rcCaixaEmenda", rcCaixaDual, setRcCaixaDual),
                      quantidade:
                        redeCliente.qtdCaixasEmendaPorAmbiente[abaDe("rcCaixaEmenda")],
                      quantidadeLabel: "Quantidade de Caixas de Emenda",
                      quantidadePlaceholder: "Ex: 1",
                      onQuantidadeChange: (qtd) => {
                        const aba = abaDe("rcCaixaEmenda");
                        setRedeCliente((prev) => {
                          const por = { ...prev.qtdCaixasEmendaPorAmbiente, [aba]: qtd };
                          return {
                            ...prev,
                            qtdCaixasEmendaPorAmbiente: por,
                            qtdCaixasEmenda: (por.aereo || 0) + (por.subterraneo || 0) || null,
                          };
                        });
                      },
                      coordenadas:
                        redeCliente.caixaEmendaAcomodacaoPorAmbiente[abaDe("rcCaixaEmenda")]
                          .coordenadas,
                      coordenadasTitle: "Coordenadas da Caixa de Emenda",
                      onCoordenadasChange: (coordenadas) => {
                        const aba = abaDe("rcCaixaEmenda");
                        setRedeCliente((prev) => ({
                          ...prev,
                          caixaEmendaAcomodacaoPorAmbiente: {
                            ...prev.caixaEmendaAcomodacaoPorAmbiente,
                            [aba]: { coordenadas },
                          },
                          caixaEmendaAcomodacao:
                            aba === "aereo"
                              ? { coordenadas }
                              : prev.caixaEmendaAcomodacao,
                        }));
                      },
                    },
                    {
                      grupoKey: "rcPlaquetaIdentificacao",
                      section: "caixa",
                      title: "Plaqueta de Identificação - Caixa de emenda",
                      ...bindDualGrupo(
                        "rcPlaquetaIdentificacao",
                        rcPlaquetaDual,
                        setRcPlaquetaDual,
                        { herdarAmbienteDe: "rcCaixaEmenda" },
                      ),
                    },
                  ]}
                  onGrupoPhoto={(grupoKey, slotId, file, ambiente) => {
                    handleGrupoPhoto(grupoSetters[grupoKey], grupoKey, slotId, file, ambiente);
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
                  stickTabsAtViewportTop={headerRolaComPagina}
                  tecnologiaAcesso={tecnologiaAcesso}
                  onTecnologiaAcessoChange={setTecnologiaAcesso}
                  gruposCliente={[
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
                  gruposConexaoEstacao={[
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
                  estacaoEntregaAcesso={estacaoEntregaAcesso}
                  onEstacaoEntregaAcesso={setEstacaoEntregaAcesso}
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
                  padraoCoresFibra={padraoCoresFibra}
                  onPadraoCoresFibraChange={(next) => {
                    setPadraoCoresFibra(next);
                    void persistDraft({ ...buildPayload(), padraoCoresFibra: next });
                  }}
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
                  padraoCoresFibra={padraoCoresFibra}
                  readOnly={readOnly}
                  onPadraoCoresFibraChange={(next) => {
                    setPadraoCoresFibra(next);
                    void persistDraft({ ...buildPayload(), padraoCoresFibra: next });
                  }}
                />
              ) : mostrarInfraestrutura ? (
                <AbaInfraestrutura
                  value={infraestrutura}
                  onChange={readOnly ? undefined : setInfraestrutura}
                  readOnly={readOnly}
                />
              ) : mostrarMedicoes ? (
                <AbaMedicoes payload={buildPayload()} clienteNome={cliente} />
              ) : null}
            </>
          ) : null}
        </form>
      </main>

      <Drawer open={isDadosObraOpen} onOpenChange={setIsDadosObraOpen}>
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DrawerTitle>Dados da obra</DrawerTitle>
                <DrawerDescription>Informações cadastrais desta OS</DrawerDescription>
              </div>
              <DrawerClose asChild>
                <button
                  type="button"
                  className="rounded-lg p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                  aria-label="Fechar"
                >
                  <X className="h-5 w-5" />
                </button>
              </DrawerClose>
            </div>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">
            <div className="space-y-4 rounded-2xl border border-border bg-muted/30 p-4">
              <div className="space-y-3">
                <DadoObraCampo label="OS/WF" value={osWf} />
                <DadoObraCampo label="Cliente" value={cliente} />
              </div>
              <div className="grid grid-cols-1 gap-x-3 gap-y-3 sm:grid-cols-2">
                <DadoObraCampo label="Endereço" value={endereco} />
                <DadoObraCampo
                  label="Tipo de Execução"
                  value={
                    tipo === "empresarial"
                      ? "Empresarial"
                      : tipo === "implantacao"
                        ? "Implantação"
                        : ""
                  }
                />
                <DadoObraCampo label="Cidade" value={cidade} />
                <DadoObraCampo label="Equipe/Empreiteira" value={equipe} />
                <DadoObraCampo label="Responsável" value={responsavel} />
                <DadoObraCampo label="Data de início" value={formatDataObra(dataInicio)} />
              </div>
            </div>
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="outline" className="w-full">
                Fechar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>

      {readOnly ? null : (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-4 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <div className="mb-1 flex justify-end">
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
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground"
            >
              <Bell className="h-4 w-4" />
              {submitting ? "Avisando..." : "Avisar conclusão de relatório"}
            </button>
          </div>
        </div>
      )}
    </div>
    </PendenciasProvider>
  );
}
