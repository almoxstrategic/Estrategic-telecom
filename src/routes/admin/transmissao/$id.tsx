import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, CheckCircle2, FileDown, RefreshCw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import {
  RelatorioDetalhe,
  StatusBadge,
} from "@/components/RelatorioLancamentoDetalhe";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useApp } from "@/lib/app-store";
import { hasPainelFullAccess } from "@/lib/roles";
import {
  appendStoredPhotoToPayload,
  excluirRelatorioTransmissao,
  fecharRelatorioTransmissao,
  fetchRelatorioTransmissaoById,
  patchRelatorioPayloadAdmin,
  sinalizarPendenciaRelatorio,
  subscribeRelatoriosTransmissao,
  uploadRelatorioPhoto,
  type RelatorioFotoCategoria,
  type RelatorioTransmissao,
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
  const [mostrarMotivo, setMostrarMotivo] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [saving, setSaving] = useState(false);
  const [uploadingCategoria, setUploadingCategoria] = useState<RelatorioFotoCategoria | null>(
    null,
  );

  const voltarParaLista = useCallback(() => {
    void navigate({ to: "/admin/transmissao" });
  }, [navigate]);

  const carregar = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setRefreshing(true);
      try {
        const fresh = await fetchRelatorioTransmissaoById(id);
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
    setMostrarMotivo(false);
    setMotivo("");
    void carregar();
  }, [carregar]);

  useEffect(() => {
    return subscribeRelatoriosTransmissao(() => {
      void carregar(true);
    });
  }, [carregar]);

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

  const onSinalizarPendencia = async () => {
    if (!row) return;
    setSaving(true);
    try {
      await sinalizarPendenciaRelatorio(row.id, motivo);
      toast.success("Pendência enviada ao técnico. O card ficou marcado como Pendenciado.");
      voltarParaLista();
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível sinalizar a pendência.");
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

  const onAdminAddPhoto = async (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
  ) => {
    if (!row || !user?.id) return;
    setUploadingCategoria(categoria);
    try {
      const stored = await uploadRelatorioPhoto(user.id, file.file, `admin-${categoria}`);
      const nextPayload = appendStoredPhotoToPayload(row.payload, categoria, stored);
      const saved = await patchRelatorioPayloadAdmin(row.id, nextPayload);
      setRow(saved);
      toast.success("Foto anexada ao relatório.");
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível anexar a foto.");
    } finally {
      setUploadingCategoria(null);
    }
  };

  const onUpdatePayload = async (nextPayload: RelatorioTransmissao["payload"]) => {
    if (!row) return;
    setRow({ ...row, payload: nextPayload });
    try {
      const saved = await patchRelatorioPayloadAdmin(row.id, nextPayload);
      setRow(saved);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível salvar a alteração.");
    }
  };

  const podeAuditar =
    canAudit &&
    row &&
    (row.status === "avisado" || row.status === "pendente" || row.status === "em_aberto");
  const mostrarFooter = Boolean(row && (row.status === "fechado" || podeAuditar));

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-4">
          <div className="min-w-0 space-y-2">
            <Link
              to="/admin/transmissao"
              className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" /> Voltar para a lista
            </Link>
            {row ? (
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight">OS/WF {row.os_wf}</h1>
                <StatusBadge status={row.status} />
              </div>
            ) : (
              <h1 className="text-2xl font-black tracking-tight">Detalhes do relatório</h1>
            )}
            <p className="text-sm text-muted-foreground">
              {refreshing ? "Atualizando dados..." : "Auditoria do relatório de campo"}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {canAudit && row ? (
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
              onClick={() => void carregar(true)}
              disabled={loading || refreshing}
            >
              <RefreshCw className="mr-1 h-3.5 w-3.5" />
              Atualizar
            </Button>
          </div>
        </div>
      </header>

      <main className={`mx-auto max-w-7xl px-5 pt-6 ${mostrarFooter ? "pb-36" : "pb-16"}`}>
        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando relatório...</p>
        ) : row ? (
          <EvidencePhotoPasteProvider>
            <RelatorioDetalhe
              row={row}
              canEditPhotos={canAudit}
              onAddPhoto={(categoria, file) => void onAdminAddPhoto(categoria, file)}
              uploadingCategoria={uploadingCategoria}
              onUpdatePayload={(nextPayload) => void onUpdatePayload(nextPayload)}
            />
          </EvidencePhotoPasteProvider>
        ) : (
          <div className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
            Relatório não encontrado.
          </div>
        )}
      </main>

      {mostrarFooter && row ? (
        <div className="fixed bottom-0 left-0 right-0 z-20 border-t border-gray-200 bg-white p-4 shadow-lg">
          <div className="mx-auto flex w-full max-w-7xl flex-col gap-3">
            {row.status === "fechado" ? (
              <div className="flex justify-end">
                <Button type="button" onClick={() => toast.info("Geração de PDF em breve.")}>
                  <FileDown className="h-4 w-4" />
                  Gerar PDF
                </Button>
              </div>
            ) : null}
            {podeAuditar ? (
              mostrarMotivo ? (
                <div className="ml-auto w-full max-w-2xl space-y-2">
                  <label className="text-sm font-semibold">
                    Descreva o que precisa ser corrigido
                  </label>
                  <Textarea
                    value={motivo}
                    onChange={(e) => setMotivo(e.target.value)}
                    placeholder="Descreva o que precisa ser corrigido..."
                    rows={4}
                  />
                  <div className="flex justify-end gap-4">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setMostrarMotivo(false)}
                      disabled={saving}
                    >
                      Cancelar
                    </Button>
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={() => void onSinalizarPendencia()}
                      disabled={saving}
                    >
                      Confirmar pendência
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col-reverse justify-end gap-4 sm:flex-row">
                  <Button
                    type="button"
                    variant="destructive"
                    className="min-w-[180px]"
                    onClick={() => setMostrarMotivo(true)}
                    disabled={saving}
                  >
                    Sinalizar Pendência
                  </Button>
                  <Button
                    type="button"
                    className="min-w-[180px] bg-emerald-600 hover:bg-emerald-700"
                    onClick={() => void onAprovar()}
                    disabled={saving}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Aprovar e Fechar
                  </Button>
                </div>
              )
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
