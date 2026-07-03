import { useState, type MouseEvent } from "react";
import { Check, Clipboard } from "lucide-react";
import { copyTextToClipboard } from "@/lib/copy-to-clipboard";
import { formatRegistroCopyText } from "@/lib/registro-copy";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type CopyRegistroButtonProps = {
  contrato: string;
  wo: string;
  nomeTecnico: string;
  matricula: string;
  disabled?: boolean;
  className?: string;
  onClick?: (e: MouseEvent<HTMLButtonElement>) => void;
};

export function CopyRegistroButton({
  contrato,
  wo,
  nomeTecnico,
  matricula,
  disabled = false,
  className,
  onClick,
}: CopyRegistroButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async (e: MouseEvent<HTMLButtonElement>) => {
    onClick?.(e);
    e.stopPropagation();
    e.preventDefault();

    const text = formatRegistroCopyText({ contrato, wo, nomeTecnico, matricula });

    try {
      const ok = await copyTextToClipboard(text);
      if (ok) {
        setCopied(true);
        toast.success("Copiado!");
        window.setTimeout(() => setCopied(false), 2000);
        return;
      }
      toast.error("Não foi possível copiar.");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => void handleCopy(e)}
      aria-label="Copiar dados do registro"
      title="Copiar dados do registro"
      className={cn(
        "inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted/70 hover:text-foreground active:bg-muted disabled:pointer-events-none disabled:opacity-40",
        className,
      )}
    >
      {copied ? (
        <Check className="h-4 w-4 text-primary" aria-hidden />
      ) : (
        <Clipboard className="h-4 w-4" aria-hidden />
      )}
    </button>
  );
}
