import { useState } from "react";
import { CheckCircle2 } from "lucide-react";
import { usePendencias } from "@/components/pendencias/PendenciasContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { PendenciaItemDef } from "@/lib/pendencias-itens";

export function PendenciasFooterActions({
  contratoLabel,
  saving,
  onConfirmar,
  onAprovar,
}: {
  contratoLabel: string;
  saving: boolean;
  onConfirmar: (itens: PendenciaItemDef[]) => Promise<void> | void;
  onAprovar: () => void;
}) {
  const ctx = usePendencias();
  const [modalOpen, setModalOpen] = useState(false);
  const draft = ctx?.draft ?? [];
  const draftCount = draft.length;
  const nomes = draft.map((item) => item.label);

  return (
    <>
      <div className="flex flex-col-reverse justify-end gap-2 sm:flex-row">
        {draftCount > 0 ? (
          <Button
            type="button"
            size="sm"
            className="h-8 rounded-md border border-amber-300 bg-amber-50 px-3 text-xs font-semibold text-amber-900 shadow-none hover:bg-amber-100"
            onClick={() => setModalOpen(true)}
            disabled={saving}
          >
            Confirmar Pendências ({draftCount})
          </Button>
        ) : null}
        <Button
          type="button"
          size="sm"
          className="h-8 rounded-md bg-green-600 px-3 text-xs font-semibold text-white shadow-sm hover:bg-green-700"
          onClick={onAprovar}
          disabled={saving}
        >
          <CheckCircle2 className="h-3.5 w-3.5" />
          Aprovar e Fechar
        </Button>
      </div>

      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Confirmar pendências</DialogTitle>
            <DialogDescription asChild>
              <div className="space-y-3 text-sm text-foreground">
                <p>
                  Deseja pendenciar os itens{" "}
                  <span className="font-semibold">[{nomes.join(", ")}]</span> do contrato{" "}
                  <span className="font-semibold">{contratoLabel}</span>?
                </p>
                <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5 text-muted-foreground">
                  {nomes.map((nome) => (
                    <li key={nome}>{nome}</li>
                  ))}
                </ul>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setModalOpen(false)}
              disabled={saving}
            >
              Desistir / Cancelar
            </Button>
            <Button
              type="button"
              className="bg-amber-600 text-white hover:bg-amber-700"
              disabled={saving}
              onClick={() => {
                void (async () => {
                  await onConfirmar(draft);
                  setModalOpen(false);
                  ctx?.clearDraft();
                })();
              }}
            >
              Confirmar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
