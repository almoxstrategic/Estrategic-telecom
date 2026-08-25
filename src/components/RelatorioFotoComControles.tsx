import { useRef, useState } from "react";
import { Camera, Pencil, Trash2, Upload } from "lucide-react";
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [chooserOpen, setChooserOpen] = useState(false);

  const pickReplace = async (file: File | undefined, source: "camera" | "gallery") => {
    if (!file || !onReplace) return;
    try {
      const prepared = await prepareEvidencePhotoFile(file, undefined, {
        withTimestamp: source === "camera",
      });
      onReplace(prepared);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível processar a foto.");
    } finally {
      if (cameraRef.current) cameraRef.current.value = "";
      if (galleryRef.current) galleryRef.current.value = "";
      setChooserOpen(false);
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
        <div className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-2 bg-gradient-to-t from-black/70 to-transparent px-2 pb-2 pt-8 print:hidden">
          {onReplace ? (
            chooserOpen ? (
              <>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 shadow"
                  aria-label="Tirar foto com a câmera"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    cameraRef.current?.click();
                  }}
                >
                  <Camera className="h-3.5 w-3.5" />
                  Câmera
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1.5 text-[11px] font-semibold text-gray-800 shadow"
                  aria-label="Escolher da galeria"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    galleryRef.current?.click();
                  }}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Galeria
                </button>
              </>
            ) : (
              <button
                type="button"
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-gray-800 shadow hover:bg-gray-100"
                aria-label="Substituir foto"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setChooserOpen(true);
                }}
              >
                <Pencil className="h-4 w-4" />
              </button>
            )
          ) : null}
          {onDelete ? (
            <button
              type="button"
              className="grid h-9 w-9 place-items-center rounded-full bg-white text-destructive shadow hover:bg-red-50"
              aria-label="Excluir foto"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setChooserOpen(false);
                onDelete();
              }}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void pickReplace(e.target.files?.[0], "camera")}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
        className="hidden"
        onChange={(e) => void pickReplace(e.target.files?.[0], "gallery")}
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
