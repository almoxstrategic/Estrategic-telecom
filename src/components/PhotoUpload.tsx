import { Camera, ImageIcon, Loader2, Upload, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { toast } from "sonner";
import { useEvidencePhotoPasteSlot } from "@/components/EvidencePhotoPasteContext";
import { ExpandableImage } from "@/components/ExpandableImage";
import { useApp } from "@/lib/app-store";
import { waitForImageMemoryRelease } from "@/lib/compress-image";
import { prepareEvidencePhotoFile } from "@/lib/evidence-photo-file";
import { hasPainelFullAccess } from "@/lib/roles";
import type { EvidencePhotoRef } from "@/lib/types";
import { cn } from "@/lib/utils";

type BusyMode = "idle" | "camera" | "gallery";

export const FOTO_PREVIEW_FRAME_CLASS =
  "relative flex h-48 max-h-48 w-full max-w-[360px] shrink-0 flex-col items-center justify-center overflow-hidden rounded-lg border border-border bg-muted";

/** Wrapper do rótulo + preview — altura de label alinhada entre slots. */
export const FOTO_SLOT_WRAP_CLASS =
  "flex w-full max-w-[360px] shrink-0 flex-col gap-1";

/** Agrupa fotos com alinhamento vertical uniforme (mesma altura entre anexada e dropzone). */
export const FOTO_SLOTS_ROW_CLASS =
  "flex flex-col flex-wrap items-stretch justify-start gap-4 sm:flex-row";

/** Par Inicial/Final dentro do card de metragem (2 colunas iguais). */
export const FOTO_CABO_PAIR_CLASS = "grid w-full grid-cols-2 items-stretch gap-3";
export const FOTO_CABO_SLOT_WRAP_CLASS = "flex min-w-0 w-full flex-col gap-1";

export function PhotoUpload({
  label,
  suffix = "inicio",
  value,
  onChange,
  onBeforePick,
  hideLabel = false,
  compact = false,
  /** Força ocultar o texto de ajuda (além do RBAC do técnico). */
  hideHelperText = false,
  /** Preenche a largura do pai (ex.: célula do grid Foto Inicial/Final). */
  fillWidth = false,
}: {
  label: string;
  suffix?: "inicio" | "fim";
  value: EvidencePhotoRef | null;
  onChange: (photo: EvidencePhotoRef | null) => void;
  onBeforePick?: () => void;
  hideLabel?: boolean;
  compact?: boolean;
  hideHelperText?: boolean;
  fillWidth?: boolean;
}) {
  const { user } = useApp();
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busyMode, setBusyMode] = useState<BusyMode>("idle");
  const [dragOver, setDragOver] = useState(false);
  const busy = busyMode !== "idle";
  const showHelperText =
    !compact && !hideHelperText && hasPainelFullAccess(user?.role);

  useEffect(() => {
    return () => {
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    };
  }, [value?.previewUrl]);

  const handleFile = useCallback(
    async (file: File | undefined, source: "camera" | "gallery") => {
      if (!file) return;

      setBusyMode(source);
      try {
        const prepared = await prepareEvidencePhotoFile(file, value?.previewUrl, {
          withTimestamp: source === "camera",
        });
        onChange(prepared);
      } catch (err) {
        toast.error(`Erro ao processar foto: ${(err as Error).message || "tente novamente"}`);
      } finally {
        setBusyMode("idle");
        if (cameraRef.current) cameraRef.current.value = "";
        if (galleryRef.current) galleryRef.current.value = "";
      }
    },
    [onChange, value?.previewUrl],
  );

  useEvidencePhotoPasteSlot({
    priority: suffix === "inicio" ? 0 : 1,
    isEmpty: value === null,
    isBusy: busy,
    acceptFile: (file) => void handleFile(file, "gallery"),
  });

  const openPicker = (target: "camera" | "gallery") => {
    onBeforePick?.();
    if (target === "camera") {
      cameraRef.current?.click();
      return;
    }
    galleryRef.current?.click();
  };

  const clearPhoto = () => {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    void waitForImageMemoryRelease();
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragOver(false);
    if (busy) return;
    const file = event.dataTransfer.files?.[0];
    if (file) void handleFile(file, "gallery");
  };

  const busyLabel =
    busyMode === "camera"
      ? "Obtendo localização e processando imagem..."
      : "Otimizando imagem...";

  return (
    <div className={fillWidth ? "w-full min-w-0 shrink" : "w-full max-w-[360px] shrink-0"}>
      {hideLabel ? null : (
        <div className="mb-1 h-5 text-sm font-bold text-foreground">{label}</div>
      )}
      {busy ? (
        <div
          className={cn(
            FOTO_PREVIEW_FRAME_CLASS,
            fillWidth && "max-w-none",
            "gap-1.5 px-3 text-center text-xs text-muted-foreground",
          )}
        >
          <Loader2 className="h-5 w-5 animate-spin" />
          {busyLabel}
        </div>
      ) : value ? (
        <div className={cn(FOTO_PREVIEW_FRAME_CLASS, fillWidth && "max-w-none", "bg-muted p-0")}>
          <ExpandableImage
            src={value.previewUrl}
            alt={label}
            className="h-full w-full rounded-lg object-cover"
          />
          <button
            type="button"
            onClick={clearPhoto}
            className="absolute right-2 top-2 grid h-8 w-8 place-items-center rounded-full bg-background/90 text-destructive shadow"
            aria-label="Remover foto"
          >
            <X className="h-4 w-4" />
          </button>
          <div className="absolute bottom-2 right-2 flex gap-2">
            <button
              type="button"
              onClick={() => openPicker("gallery")}
              className="rounded-full bg-background/90 px-3 py-1.5 text-xs font-semibold text-foreground shadow"
            >
              Trocar
            </button>
            <button
              type="button"
              onClick={() => openPicker("camera")}
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground shadow"
            >
              Refazer
            </button>
          </div>
        </div>
      ) : (
        <div
          role="button"
          tabIndex={0}
          onClick={() => openPicker("gallery")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openPicker("gallery");
            }
          }}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            setDragOver(false);
          }}
          onDrop={onDrop}
          className={cn(
            FOTO_PREVIEW_FRAME_CLASS,
            fillWidth && "max-w-none",
            "cursor-pointer border-2 border-dashed bg-muted/40 px-3 text-center transition hover:border-primary/50 hover:bg-muted/60",
            dragOver ? "border-primary bg-primary/5" : "border-border",
          )}
          aria-label={`${label}: clique ou arraste para enviar`}
        >
          <ImageIcon className="mb-1 h-6 w-6 shrink-0 text-muted-foreground" />
          <p className="px-1 text-[11px] font-medium leading-snug text-muted-foreground">
            Sem foto • Clique ou arraste para enviar
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPicker("camera");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm hover:border-primary hover:text-primary"
              aria-label="Tirar foto"
            >
              <Camera className="h-3 w-3" />
              Câmera
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                openPicker("gallery");
              }}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-background px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm hover:border-primary hover:text-primary"
              aria-label="Fazer upload"
            >
              <Upload className="h-3 w-3" />
              Galeria
            </button>
          </div>
        </div>
      )}
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0], "camera")}
      />
      <input
        ref={galleryRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
        className="hidden"
        onChange={(e) => void handleFile(e.target.files?.[0], "gallery")}
      />
      {showHelperText ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Arraste, clique ou pressione Ctrl+V para colar uma imagem.{" "}
          {suffix === "inicio" ? "Início" : "Fim"}: comprimida (~320KB) no envio. Fotos da câmera
          recebem data, hora e geolocalização.
        </p>
      ) : null}
    </div>
  );
}
