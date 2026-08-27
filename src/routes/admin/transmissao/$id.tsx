import { useCallback, useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, FileDown, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { PendenciasProvider } from "@/components/pendencias/PendenciasContext";
import { PendenciasFooterActions } from "@/components/pendencias/PendenciasFooterActions";
import { RelatorioSyncStatus } from "@/components/RelatorioSyncStatus";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import {
  RelatorioDetalhe,
  StatusBadge,
} from "@/components/RelatorioLancamentoDetalhe";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useApp } from "@/lib/app-store";
import { gerarPDFRelatorio } from "@/lib/pdf/gerar-pdf-relatorio";
import { hasPainelFullAccess } from "@/lib/roles";
import type { PendenciaItem } from "@/lib/pendencias-itens";

const EMPTY_PENDENCIAS: PendenciaItem[] = [];
import {
  appendStoredPhotoToPayload,
  confirmarPendenciasItensRelatorio,
  deleteRelatorioPhoto,
  excluirRelatorioTransmissao,
  fecharRelatorioTransmissao,
  fetchRelatorioTransmissaoById,
  patchRelatorioPayloadAdmin,
  replaceFotoGrupoAt,
  subscribeRelatorioTransmissaoById,
  uploadRelatorioPhoto,
  withRetry,
  looksLikeFotoGrupoPorAmbiente,
  simDerivadoLancamento,
  emptyCaboMetragem,
  type RelatorioFotoCategoria,
  type RelatorioPayload,
  type RelatorioTransmissao,
  type AmbienteRede,
} from "@/lib/relatorios-transmissao";
import type { EvidencePhotoRef } from "@/lib/types";

export const Route = createFileRoute("/admin/transmissao/$id")({
  head: () => ({
    meta: [
      { title: "Detalhes do relatório — Estrategic" },
      { name: "description", content: "Auditoria em tela cheia do relatório de campo." },
    ],
  }),
  component: AdminLancamentoDetalhePage,
});

function AdminLancamentoDetalhePage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const { user } = useApp();
  const canAudit = hasPainelFullAccess(user?.role);
  const [row, setRow] = useState<RelatorioTransmissao | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [gerandoPdf, setGerandoPdf] = useState(false);
  const [uploadingCategoria, setUploadingCategoria] = useState<RelatorioFotoCategoria | null>(
    null,
  );
  const lastAppliedUpdatedAtRef = useRef<string | null>(null);
  const applyingRemoteRef = useRef(false);
  const canAutosaveRef = useRef(false);
  const pendingPayloadRef = useRef<RelatorioPayload | null>(null);
  const [payloadTick, setPayloadTick] = useState(0);
  const [saveHint, setSaveHint] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const voltarParaLista = useCallback(() => {
    void navigate({ to: "/admin/transmissao" });
  }, [navigate]);

  const carregar = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const fresh = await fetchRelatorioTransmissaoById(id);
        lastAppliedUpdatedAtRef.current = fresh.updated_at;
        canAutosaveRef.current = true;
        setRow(fresh);
        return fresh;
      } catch (err) {
        toast.error((err as Error).message || "Não foi possível carregar o relatório.");
        return null;
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [id],
  );

  useEffect(() => {
    void carregar();
  }, [carregar]);

  useEffect(() => {
    return subscribeRelatorioTransmissaoById(id, (fresh) => {
      if (applyingRemoteRef.current) return;
      if (fresh.updated_at === lastAppliedUpdatedAtRef.current) return;
      lastAppliedUpdatedAtRef.current = fresh.updated_at;
      setRow(fresh);
    });
  }, [id]);

  const onAprovar = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await fecharRelatorioTransmissao(row.id);
      toast.success("Relatório aprovado e fechado.");
      voltarParaLista();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível aprovar.");
    } finally {
      setSaving(false);
    }
  };

  const onConfirmarPendencias = async (itens: import("@/lib/pendencias-itens").PendenciaItemDef[]) => {
    if (!row || itens.length === 0) return;
    setSaving(true);
    try {
      const updated = await confirmarPendenciasItensRelatorio(row.id, itens);
      lastAppliedUpdatedAtRef.current = updated.updated_at;
      setRow(updated);
      toast.success("Pendências confirmadas e enviadas ao técnico.");
      voltarParaLista();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível confirmar as pendências.");
    } finally {
      setSaving(false);
    }
  };

  const onExcluir = async () => {
    if (!row) return;
    const ok = window.confirm(
      `Excluir o relatório ${row.os_wf}? Esta ação não pode ser desfeita.`,
    );
    if (!ok) return;
    setSaving(true);
    try {
      await excluirRelatorioTransmissao(row.id);
      toast.success("Relatório excluído.");
      voltarParaLista();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível excluir o relatório.");
    } finally {
      setSaving(false);
    }
  };

  const onGerarPdf = async () => {
    if (!row) return;
    setGerandoPdf(true);
    const toastId = toast.loading("Gerando PDF Claro...");
    try {
      await gerarPDFRelatorio(row);
      toast.success("PDF gerado com sucesso.", { id: toastId });
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível gerar o PDF.", { id: toastId });
    } finally {
      setGerandoPdf(false);
    }
  };

  const onAdminAddPhoto = async (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
    ambiente?: AmbienteRede,
  ) => {
    if (!row || !user?.id) return;
    setUploadingCategoria(categoria);
    try {
      const stored = await uploadRelatorioPhoto(user.id, file.file, `admin-${categoria}`);
      const nextPayload = appendStoredPhotoToPayload(
        row.payload,
        categoria,
        stored,
        ambiente ?? "aereo",
      );
      applyingRemoteRef.current = true;
      const saved = await patchRelatorioPayloadAdmin(row.id, nextPayload);
      lastAppliedUpdatedAtRef.current = saved.updated_at;
      setRow(saved);
      toast.success("Foto anexada ao relatório.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível anexar a foto.");
    } finally {
      applyingRemoteRef.current = false;
      setUploadingCategoria(null);
    }
  };

  const onAdminAddPhotos = async (
    categoria: RelatorioFotoCategoria,
    files: EvidencePhotoRef[],
    ambiente?: AmbienteRede,
  ) => {
    if (!row || !user?.id || files.length === 0) return;
    if (files.length === 1) {
      await onAdminAddPhoto(categoria, files[0], ambiente);
      return;
    }
    setUploadingCategoria(categoria);
    try {
      let nextPayload = row.payload;
      const amb = ambiente ?? "aereo";
      for (const file of files) {
        const stored = await uploadRelatorioPhoto(user.id, file.file, `admin-${categoria}`);
        nextPayload = appendStoredPhotoToPayload(nextPayload, categoria, stored, amb);
      }
      applyingRemoteRef.current = true;
      const saved = await patchRelatorioPayloadAdmin(row.id, nextPayload);
      lastAppliedUpdatedAtRef.current = saved.updated_at;
      setRow(saved);
      toast.success(`${files.length} fotos anexadas ao relatório.`);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível anexar as fotos.");
    } finally {
      applyingRemoteRef.current = false;
      setUploadingCategoria(null);
    }
  };

  const onAdminReplacePhoto = async (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
    meta: {
      index?: number;
      caboId?: string;
      campo?: "fotoInicio" | "fotoFim";
      outraId?: string;
      itemId?: string;
      campoItem?: "foto" | "etiqueta";
      ambiente?: AmbienteRede;
    },
  ) => {
    if (!row || !user?.id) return;
    setUploadingCategoria(categoria);
    try {
      const stored = await uploadRelatorioPhoto(user.id, file.file, `admin-replace-${categoria}`);
      const atual = row.payload;
      let nextPayload: RelatorioPayload = atual;
      let oldPath: string | undefined;
      if (categoria === "metragensCabo" || categoria === "metragensCaboRc") {
        const dualKey = categoria === "metragensCabo" ? "lancamentoCabosRe" : "lancamentoCabosRc";
        const ambiente = meta.ambiente ?? "aereo";
        const dual = atual[dualKey];
        let list = dual[ambiente].metragens;
        if (meta.caboId && !list.some((item) => item.id === meta.caboId)) {
          list = [...list, { ...emptyCaboMetragem(), id: meta.caboId }];
        }
        const nextMetragens = list.map((item) => {
          if (item.id !== meta.caboId) return item;
          if (meta.campo === "fotoInicio") oldPath = item.fotoInicio?.path;
          if (meta.campo === "fotoFim") oldPath = item.fotoFim?.path;
          return meta.campo ? { ...item, [meta.campo]: stored } : item;
        });
        const nextDual = {
          ...dual,
          [ambiente]: { ...dual[ambiente], metragens: nextMetragens },
        };
        nextPayload = {
          ...atual,
          [dualKey]: nextDual,
          lancamentoRe:
            dualKey === "lancamentoCabosRe"
              ? simDerivadoLancamento(nextDual)
              : atual.lancamentoRe,
          lancamentoRc:
            dualKey === "lancamentoCabosRc"
              ? simDerivadoLancamento(nextDual)
              : atual.lancamentoRc,
          metragensCabo:
            dualKey === "lancamentoCabosRe" ? nextDual.aereo.metragens : atual.metragensCabo,
          metragensCaboRc:
            dualKey === "lancamentoCabosRc" ? nextDual.aereo.metragens : atual.metragensCaboRc,
        };
      } else if (
        categoria === "outrasFotos" ||
        categoria === "outrasFotosRc" ||
        categoria === "outrasFotosEqCliente" ||
        categoria === "outrasFotosEqEstacao"
      ) {
        nextPayload = {
          ...atual,
          [categoria]: atual[categoria].map((item) => {
            if (item.id !== meta.outraId) return item;
            oldPath = item.foto?.path;
            return { ...item, foto: stored };
          }),
        };
      } else if (
        categoria === "eqClienteDgo" ||
        categoria === "eqClienteEquipamentos" ||
        categoria === "eqEstacaoDgo" ||
        categoria === "eqEstacaoEquipamento"
      ) {
        nextPayload = {
          ...atual,
          [categoria]: atual[categoria].map((item) => {
            if (item.id !== meta.itemId) return item;
            if (meta.campoItem === "foto") oldPath = item.foto?.path;
            if (meta.campoItem === "etiqueta") oldPath = item.etiqueta?.path;
            return meta.campoItem ? { ...item, [meta.campoItem]: stored } : item;
          }),
        };
      } else if (typeof meta.index === "number") {
        const grupo = atual[categoria as Exclude<
          RelatorioFotoCategoria,
          | "metragensCabo"
          | "metragensCaboRc"
          | "outrasFotos"
          | "outrasFotosRc"
          | "outrasFotosEqCliente"
          | "outrasFotosEqEstacao"
          | "eqClienteDgo"
          | "eqClienteEquipamentos"
          | "eqEstacaoDgo"
          | "eqEstacaoEquipamento"
        >];
        if (looksLikeFotoGrupoPorAmbiente(grupo)) {
          const ambiente = meta.ambiente ?? "aereo";
          const lado = grupo[ambiente];
          oldPath = lado.fotos[meta.index]?.path;
          nextPayload = {
            ...atual,
            [categoria]: {
              ...grupo,
              [ambiente]: replaceFotoGrupoAt(lado, meta.index, stored),
            },
          };
        } else {
          oldPath = grupo.fotos[meta.index]?.path;
          nextPayload = {
            ...atual,
            [categoria]: replaceFotoGrupoAt(grupo, meta.index, stored),
          };
        }
      }
      applyingRemoteRef.current = true;
      const saved = await patchRelatorioPayloadAdmin(row.id, nextPayload);
      lastAppliedUpdatedAtRef.current = saved.updated_at;
      setRow(saved);
      void deleteRelatorioPhoto(oldPath);
      toast.success("Foto substituída.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível substituir a foto.");
    } finally {
      applyingRemoteRef.current = false;
      setUploadingCategoria(null);
    }
  };

  const persistAdminPayload = useCallback(
    async (nextPayload: RelatorioPayload) => {
      if (!row) return;
      applyingRemoteRef.current = true;
      setSaveHint("saving");
      try {
        const saved = await withRetry(
          () => patchRelatorioPayloadAdmin(row.id, nextPayload),
          3,
          700,
          () => setSaveHint("error"),
        );
        lastAppliedUpdatedAtRef.current = saved.updated_at;
        setRow(saved);
        setSaveHint("saved");
      } catch (err) {
        setSaveHint("error");
        toast.error((err as Error).message || "Não foi possível salvar a alteração.");
      } finally {
        applyingRemoteRef.current = false;
      }
    },
    [row],
  );

  useDebouncedEffect(
    () => {
      if (!canAutosaveRef.current) return;
      const next = pendingPayloadRef.current;
      if (!next) return;
      void persistAdminPayload(next);
    },
    [payloadTick],
    1500,
    Boolean(canAudit && row && row.status !== "fechado"),
  );

  const onUpdatePayload = (nextPayload: RelatorioTransmissao["payload"]) => {
    if (!row) return;
    pendingPayloadRef.current = nextPayload;
    setRow({ ...row, payload: nextPayload });
    setPayloadTick((tick) => tick + 1);
  };

  const podeAuditar =
    canAudit &&
    row &&
    (row.status === "avisado" || row.status === "pendente" || row.status === "em_aberto");
  const mostrarFooter = Boolean(row && (row.status === "fechado" || podeAuditar));

  return (
    <PendenciasProvider mode="gestor" confirmed={row?.payload.pendenciasItens ?? EMPTY_PENDENCIAS}>
      <div className="min-h-screen w-full max-w-full min-w-0 bg-white">
        {/* Nesta tela o logo rola com a página — só abas/busca/blocos ficam sticky. */}
        <div className="relative z-30 bg-white">
          <AppHeader compact sticky={false} />

          <header className="border-b border-gray-100 bg-white">
            <div className="flex w-full items-center gap-2 px-3 py-1 lg:px-4">
              <button
                type="button"
                onClick={voltarParaLista}
                className="relative z-20 inline-flex shrink-0 items-center gap-0.5 text-[11px] font-medium text-gray-600 hover:text-foreground"
              >
                <ArrowLeft className="h-3 w-3" />
                <span className="hidden sm:inline">Voltar</span>
              </button>
              <div className="flex min-w-0 flex-1 items-center gap-1.5">
                {row ? (
                  <>
                    <h1 className="truncate text-sm font-bold tracking-tight text-gray-900">
                      OS/WF {row.os_wf}
                    </h1>
                    <StatusBadge status={row.status} />
                  </>
                ) : (
                  <h1 className="truncate text-sm font-bold tracking-tight text-gray-900">
                    Detalhes do relatório
                  </h1>
                )}
                <span className="hidden truncate text-[10px] text-gray-500 md:inline">
                  {refreshing ? "Atualizando..." : "Auditoria"}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                {canAudit && row && row.status !== "fechado" ? (
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
                ) : null}
                {canAudit && row ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-[11px] border-destructive/40 text-destructive hover:bg-destructive/10"
                    onClick={() => void onExcluir()}
                    disabled={saving}
                  >
                    <Trash2 className="mr-1 h-3 w-3" />
                    Excluir
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 px-2 text-[11px]"
                  onClick={() => void carregar(true)}
                  disabled={loading || refreshing}
                >
                  <RefreshCw className="mr-1 h-3 w-3" />
                  Atualizar
                </Button>
              </div>
            </div>
          </header>
        </div>

        <main
          className={cn(
            "w-full max-w-full min-w-0 px-3 py-2 lg:px-4",
            mostrarFooter ? "pb-20" : "pb-8",
          )}
        >
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando relatório...</p>
          ) : row ? (
            <EvidencePhotoPasteProvider>
              <RelatorioDetalhe
                row={row}
                canEditPhotos={canAudit}
                canEditCadastro={canAudit}
                onCadastroSaved={setRow}
                onAddPhoto={(categoria, file, ambiente) =>
                  void onAdminAddPhoto(categoria, file, ambiente)
                }
                onAddPhotos={(categoria, files, ambiente) =>
                  void onAdminAddPhotos(categoria, files, ambiente)
                }
                onReplacePhoto={(categoria, file, meta) =>
                  void onAdminReplacePhoto(categoria, file, meta)
                }
                uploadingCategoria={uploadingCategoria}
                onUpdatePayload={onUpdatePayload}
                onUploadPhoto={async (file) => {
                  if (!user?.id) throw new Error("Sessão inválida.");
                  return uploadRelatorioPhoto(user.id, file.file, "admin-teste");
                }}
              />
            </EvidencePhotoPasteProvider>
          ) : (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center text-sm text-muted-foreground">
              Relatório não encontrado.
            </div>
          )}
        </main>

        {mostrarFooter && row ? (
          <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-gray-200 bg-white px-4 py-2">
            <div className="mx-auto flex w-full flex-col gap-2 px-2 lg:px-6">
              {row.status === "fechado" ? (
                <div className="flex justify-end">
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 rounded-md bg-green-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
                    onClick={() => void onGerarPdf()}
                    disabled={gerandoPdf}
                  >
                    <FileDown className="h-3.5 w-3.5" />
                    {gerandoPdf ? "Gerando PDF..." : "Gerar PDF"}
                  </Button>
                </div>
              ) : null}
              {podeAuditar ? (
                <PendenciasFooterActions
                  contratoLabel={row.os_wf}
                  saving={saving}
                  onConfirmar={(itens) => onConfirmarPendencias(itens)}
                  onAprovar={() => void onAprovar()}
                />
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </PendenciasProvider>
  );
}
