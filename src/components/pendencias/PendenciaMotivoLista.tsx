import { pendenciaLabelsForDisplay, type PendenciaItem } from "@/lib/pendencias-itens";

/**
 * Lista de pendências em tópicos (•) a partir do payload e/ou motivo textual.
 */
export function PendenciaMotivoLista({
  itens,
  motivo,
  emptyFallback = "A supervisão sinalizou uma pendência sem detalhar o motivo.",
}: {
  itens?: PendenciaItem[] | null;
  motivo?: string | null;
  emptyFallback?: string;
}) {
  const labels = pendenciaLabelsForDisplay({ itens, motivo });

  if (labels.length === 0) {
    return <p className="text-sm text-muted-foreground">{emptyFallback}</p>;
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-semibold text-foreground">Pendência em:</p>
      <ul className="space-y-1.5 pl-1">
        {labels.map((label) => (
          <li
            key={label}
            className="flex gap-2 text-sm leading-snug text-foreground"
          >
            <span className="mt-0.5 shrink-0 select-none text-muted-foreground" aria-hidden>
              •
            </span>
            <span className="min-w-0">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
