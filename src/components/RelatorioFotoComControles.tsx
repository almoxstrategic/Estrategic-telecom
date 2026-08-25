import { useRef } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ExpandableImage } from "@/components/ExpandableImage";
import { FOTO_PREVIEW_FRAME_CLASS } from "@/components/PhotoUpload";
import { toast } from "sonner";
import { prepareEvidencePhotoFile } from "@/lib/evidence-photo-file";
import type { EvidencePhotoRef } from "@/lib/types";
import { cn } from "@/lib/utils";

const IMAGE_CLASS = "h-full w-full rounded-lg object-cover";
const IMAGE_CLASS_COMPACT =
  "h-full w-full rounded-lg object-contain print:max-h-[300px]";

export function RelatorioFotoComControles({
  src,
  alt,
  canEdit = false,
  onDelete,
  onReplace,
  compact = false,
  fillWidth = false,
}: {
  src: string;
  alt: string;
  canEdit?: boolean;
  onDelete?: () => void;
  onReplace?: (file: EvidencePhotoRef) => void;
  /** Imagens menores (Teste Optico / OTDR) — object-contain para preservar watermark. */
  compact?: boolean;
  fillWidth?: boolean;
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  const pickReplace = async (file: File | undefined) => {
    if (!file || !onReplace) return;
    try {
      const prepared = await prepareEvidencePhotoFile(file);
      onReplace(prepared);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível processar a foto.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div
      className={cn(
        FOTO_PREVIEW_FRAME_CLASS,
        fillWidth && "max-w-none",
        "group break-inside-avoid p-0 print:break-inside-avoid",
      )}
    >
      <ExpandableImage
        src={src}
        alt={alt}
        className={compact ? IMAGE_CLASS_COMPACT : IMAGE_CLASS}
      />
      {canEdit && (onDelete || onReplace) ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center gap-4 rounded-lg bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
          {onReplace ? (
            <button
              type="button"
              className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white text-gray-800 shadow hover:bg-gray-100"
              aria-label="Substituir foto"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                fileRef.current?.click();
              }}
            >
              <Pencil className="h-4 w-4" />
            </button>
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="pointer-events-auto grid h-10 w-10 place-items-center rounded-full bg-white text-destructive shadow hover:bg-red-50"
              aria-label="Excluir foto"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
        className="hidden"
        onChange={(e) => void pickReplace(e.target.files?.[0])}
      />
    </div>
  );
}

export function FotoLabel({ children }: { children?: string }) {
  return <p className="h-5 text-sm font-bold">{children || "\u00A0"}</p>;
}

/** Slot vazio estático (somente leitura). Preferir PhotoUpload quando editável. */
export const FOTO_SLOT_CLASS =
  "flex h-48 max-h-48 w-full max-w-[360px] shrink-0 items-center justify-center rounded-lg border border-dashed border-border bg-muted/40 text-xs text-muted-foreground";
