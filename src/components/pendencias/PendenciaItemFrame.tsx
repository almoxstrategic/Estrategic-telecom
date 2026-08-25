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
        "scroll-mt-36 transition-colors",
        pending
          ? "mx-2 rounded-2xl border border-amber-200 bg-amber-50/60 p-4 text-gray-900 shadow-sm sm:mx-3 sm:p-5"
          : "rounded-xl border border-transparent bg-transparent",
        className,
      )}
    >
      {canToggle ? (
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => ctx?.toggleDraft(def)}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-semibold transition",
              isRetirar
                ? "border-amber-300 bg-amber-100/80 text-amber-900 hover:bg-amber-100"
                : pending
                  ? "border-amber-200 bg-white/90 text-amber-800 hover:bg-amber-50"
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
        <div className="mb-3">
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-medium text-amber-800">
            <Pin className="h-3 w-3" />
            Pendência — corrigir antes do envio
          </span>
        </div>
      ) : null}
      {children}
    </div>
  );
}
