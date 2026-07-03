import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Send, CheckCircle2, Ruler, AlertCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { PhotoUpload } from "@/components/PhotoUpload";
import { useApp } from "@/lib/app-store";
import { requireTecnico } from "@/lib/auth-guards";
import {
  submitEvidenciaForm,
} from "@/lib/evidencias-service";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  clearMetragemDraft,
  loadMetragemDraft,
  saveMetragemDraft,
} from "@/lib/metragem-draft";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

export const Route = createFileRoute("/metragem")({
  beforeLoad: () => requireTecnico(),
  head: () => ({
    meta: [
      { title: "Evidência de Metragem — Estrategic Field" },
      { name: "description", content: "Registre evidências de metragem da WO em campo." },
    ],
  }),
  component: MetragemPage,
});

function MetragemPage() {
  const { user, getAccessToken } = useApp();
  const initialDraft = useMemo(() => loadMetragemDraft(), []);
  const [contrato, setContrato] = useState(initialDraft?.contrato ?? "");
  const [wo, setWo] = useState(initialDraft?.wo ?? "");
  const [metInicial, setMetInicial] = useState(initialDraft?.metInicial ?? "");
  const [metFinal, setMetFinal] = useState(initialDraft?.metFinal ?? "");
  const [fotoInicio, setFotoInicio] = useState<EvidencePhotoRef | null>(null);
  const [fotoFim, setFotoFim] = useState<EvidencePhotoRef | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteAlert, setShowIncompleteAlert] = useState(false);

  useEffect(() => {
    saveMetragemDraft({
      contrato,
      wo,
      metInicial,
      metFinal,
    });
  }, [contrato, wo, metInicial, metFinal]);

  const persistDraftNow = useCallback(() => {
    saveMetragemDraft({
      contrato,
      wo,
      metInicial,
      metFinal,
    });
  }, [contrato, wo, metInicial, metFinal]);

  useEffect(() => {
    const flushDraft = () => persistDraftNow();

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushDraft();
    };

    window.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", flushDraft);

    return () => {
      window.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", flushDraft);
    };
  }, [persistDraftNow]);

  const mi = parseFloat(metInicial);
  const mf = parseFloat(metFinal);
  const total = useMemo(() => {
    if (Number.isFinite(mi) && Number.isFinite(mf)) return mi - mf;
    return null;
  }, [mi, mf]);
  const totalValid = total !== null && total >= 0;

  const canSubmit =
    contrato.trim() &&
    wo.trim() &&
    metInicial.trim() &&
    metFinal.trim() &&
    totalValid &&
    fotoInicio &&
    fotoFim &&
    !submitting;

  const reset = () => {
    setContrato("");
    setWo("");
    setMetInicial("");
    setMetFinal("");
    setFotoInicio(null);
    setFotoFim(null);
    clearMetragemDraft();
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !user || !fotoInicio || !fotoFim) return;

    setSubmitting(true);
    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

      await submitEvidenciaForm({
        accessToken,
        tecnicoId: user.id,
        contrato: contrato.trim(),
        wo: wo.trim(),
        metragem_inicial: mi,
        metragem_final: mf,
        total_utilizado: total!,
        fotoInicio: fotoInicio.file,
        fotoFim: fotoFim.file,
      });

      toast.success(`Registrado metragem da WO ${wo.trim()} (${total} m)`, {
        icon: <CheckCircle2 className="h-5 w-5" />,
        className: "!bg-success !text-success-foreground !border-success",
      });

      reset();
    } catch (err) {
      toast.error(`Erro de envio: ${(err as Error).message || "tente novamente"}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (!canSubmit) setShowIncompleteAlert(true);
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-4">
        <Link
          to="/"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">Evidência de Metragem</h1>
          <p className="text-sm text-muted-foreground">
            Informe a WO, a metragem e registre as fotos de início e fim.
          </p>
        </header>

        <form id="metragem-form" onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Número do Contrato</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={contrato}
                onChange={(e) => setContrato(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex: 458921"
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Número da WO</label>
              <input
                type="text"
                value={wo}
                onChange={(e) => setWo(e.target.value)}
                placeholder="Ex: 12345|123456789"
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Metragem Inicial</label>
                <input
                  inputMode="decimal"
                  value={metInicial}
                  onChange={(e) =>
                    setMetInicial(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
              <div>
                <label className="mb-1.5 block text-sm font-semibold">Metragem Final</label>
                <input
                  inputMode="decimal"
                  value={metFinal}
                  onChange={(e) =>
                    setMetFinal(e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""))
                  }
                  placeholder="0"
                  className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  required
                />
              </div>
            </div>

            <div
              className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 ${
                total === null
                  ? "border-dashed border-border bg-surface text-muted-foreground"
                  : totalValid
                    ? "border-primary/30 bg-primary/10 text-primary"
                    : "border-destructive/40 bg-destructive/10 text-destructive"
              }`}
            >
              <div className="flex items-center gap-2 text-sm font-semibold">
                <Ruler className="h-5 w-5" />
                {total === null
                  ? "Total Utilizado"
                  : `Metragem Inicial - Metragem Final = Total Utilizado`}
              </div>
              <div className="text-lg font-black">
                {total === null ? "— m" : totalValid ? `${total} metros` : "Valor inválido"}
              </div>
            </div>
          </div>

          <EvidencePhotoPasteProvider>
            <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs leading-relaxed text-amber-950">
                <strong className="font-semibold">Dica:</strong> cada foto é comprimida no celular e
                enviada junto com o formulário. Se &quot;Tirar Foto&quot; falhar, use o app{" "}
                <strong>Câmera</strong> e depois <strong>Fazer Upload</strong>.
              </p>
              <PhotoUpload
                label="📸 Foto do Início"
                suffix="inicio"
                value={fotoInicio}
                onChange={setFotoInicio}
                onBeforePick={persistDraftNow}
              />
              {fotoInicio ? (
                <PhotoUpload
                  label="📸 Foto do Fim"
                  suffix="fim"
                  value={fotoFim}
                  onChange={setFotoFim}
                  onBeforePick={persistDraftNow}
                />
              ) : (
                <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
                  Tire a foto do início primeiro. Isso reduz o uso de memória no celular.
                </p>
              )}
            </div>
          </EvidencePhotoPasteProvider>
        </form>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type={canSubmit ? "submit" : "button"}
            form={canSubmit ? "metragem-form" : undefined}
            onClick={handleSubmitClick}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            <Send className="h-5 w-5" />
            {submitting ? "Enviando..." : "Enviar Evidência"}
          </button>
        </div>
      </div>

      <AlertDialog open={showIncompleteAlert} onOpenChange={setShowIncompleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Formulário incompleto
            </AlertDialogTitle>
            <AlertDialogDescription>
              Preencha contrato, WO, metragem inicial, metragem final e anexe as duas fotos antes de
              enviar a evidência.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
