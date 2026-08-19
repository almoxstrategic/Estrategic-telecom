import { AlertCircle, Check, Cloud, Loader2 } from "lucide-react";

export type RelatorioSyncStatusKind = "idle" | "saving" | "saved" | "error";

export function RelatorioSyncStatus({
  status,
  compact = false,
}: {
  status: RelatorioSyncStatusKind;
  compact?: boolean;
}) {
  const label =
    status === "saving"
      ? "Salvando..."
      : status === "error"
        ? "Erro ao salvar — Tentando novamente"
        : "Salvo";
  const className =
    status === "saving"
      ? "text-amber-600"
      : status === "error"
        ? "text-red-600"
        : "text-emerald-700/80";

  return (
    <span
      className={`inline-flex items-center gap-1.5 ${compact ? "text-[11px]" : "text-xs"} font-medium ${className}`}
      role="status"
      aria-live="polite"
    >
      {status === "saving" ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
      ) : status === "error" ? (
        <AlertCircle className="h-3.5 w-3.5" aria-hidden />
      ) : (
        <span className="relative inline-flex" aria-hidden>
          <Cloud className="h-3.5 w-3.5" />
          <Check className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 stroke-[3]" />
        </span>
      )}
      {label}
    </span>
  );
}
