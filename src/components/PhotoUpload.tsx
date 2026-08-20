import { Camera, Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useEvidencePhotoPasteSlot } from "@/components/EvidencePhotoPasteContext";
import { ExpandableImage } from "@/components/ExpandableImage";
import { waitForImageMemoryRelease } from "@/lib/compress-image";
import { prepareEvidencePhotoFile } from "@/lib/evidence-photo-file";
import type { EvidencePhotoRef } from "@/lib/types";

type BusyMode = "idle" | "camera" | "gallery";

export function PhotoUpload({
  label,
  suffix,
  value,
  onChange,
  onBeforePick,
  hideLabel = false,
  compact = false,
}: {
  label: string;
  suffix: "inicio" | "fim";
  value: EvidencePhotoRef | null;
  onChange: (photo: EvidencePhotoRef | null) => void;
  onBeforePick?: () => void;
  hideLabel?: boolean;
  compact?: boolean;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);
  const [busyMode, setBusyMode] = useState<BusyMode>("idle");
  const busy = busyMode !== "idle";

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

  const busyLabel =
    busyMode === "camera"
      ? "Obtendo localização e processando imagem..."
      : "Otimizando imagem...";

  return (
    <div>
      {hideLabel ? null : (
        <div className="mb-1 h-5 text-sm font-bold text-foreground">{label}</div>
      )}
      {busy ? (
        <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-md border border-border bg-muted px-4 text-center text-sm text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          {busyLabel}
        </div>
      ) : value ? (
        <div className="relative overflow-hidden rounded-md border border-border bg-muted">
          <ExpandableImage src={value.previewUrl} alt={label} />
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
        <div className="flex h-48 flex-col justify-center rounded-md border-2 border-dashed border-border bg-surface p-3">
          <div className="mb-2 flex flex-col items-center justify-center gap-1 text-muted-foreground">
            <ImageIcon className="h-7 w-7" />
            <span className="text-xs">Nenhuma imagem selecionada</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => openPicker("camera")}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-primary px-3 py-3 text-sm font-semibold text-primary-foreground shadow-sm transition active:scale-[0.98]"
            >
              <Camera className="h-5 w-5" />
              Tirar Foto
            </button>
            <button
              type="button"
              onClick={() => openPicker("gallery")}
              className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-border bg-background px-3 py-3 text-sm font-semibold text-foreground shadow-sm transition hover:border-primary hover:text-primary active:scale-[0.98]"
            >
              <Upload className="h-5 w-5" />
              Fazer Upload
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
      {compact ? null : (
        <p className="mt-1 text-[11px] text-muted-foreground">
          Arraste, clique ou pressione Ctrl+V para colar uma imagem.{" "}
          {suffix === "inicio" ? "Início" : "Fim"}: comprimida (~320KB) no envio. Fotos da câmera
          recebem data, hora e geolocalização.
        </p>
      )}
    </div>
  );
}
