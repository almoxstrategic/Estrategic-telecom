import type { ReactNode } from "react";
import { Pin, PinOff } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PendenciaItemDef } from "@/lib/pendencias-itens";
import { usePendencias } from "@/components/pendencias/PendenciasContext";

export function PendenciaItemFrame({
  def,
  children,
  className,
}: {
  def: PendenciaItemDef;
  children: ReactNode;
  className?: string;
}) {
  const ctx = usePendencias();
  const pending = ctx?.isPending(def.itemId) ?? false;
  const canToggle = ctx?.mode === "gestor";
  const selectedDraft = ctx?.isDraftSelected(def.itemId) ?? false;
  const isRetirar = selectedDraft;

  return (
    <div
      id={def.anchorId}
      data-pendencia-item={def.itemId}
      className={cn(
        "scroll-mt-36 rounded-xl border transition-colors",
        pending
          ? "border-amber-400 bg-amber-50 text-amber-900"
          : "border-transparent bg-transparent",
        className,
      )}
    >
      {canToggle ? (
        <div className="mb-2 flex justify-end px-1 pt-1">
          <button
            type="button"
            onClick={() => ctx?.toggleDraft(def)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
              isRetirar
                ? "border-amber-500 bg-amber-100 text-amber-900 hover:bg-amber-200"
                : pending
                  ? "border-amber-400 bg-white/80 text-amber-800 hover:bg-amber-100"
                  : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50",
            )}
            aria-pressed={selectedDraft}
            aria-label={isRetirar ? "Retirar pendência" : "Pendenciar item"}
          >
            {isRetirar ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
            {isRetirar ? "Retirar pendência" : "Pendenciar"}
          </button>
        </div>
      ) : pending ? (
        <div className="mb-2 px-1 pt-1">
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-200/70 px-2 py-0.5 text-[11px] font-semibold text-amber-950">
            <Pin className="h-3 w-3" />
            Pendência — corrigir antes do envio
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
