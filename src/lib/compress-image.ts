const MAX_EDGE = 720;
const JPEG_QUALITY = 0.55;

function scaleToMax(width: number, height: number, max: number) {
  if (width <= max && height <= max) return { width, height };
  const ratio = Math.min(max / width, max / height);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio),
  };
}

function loadImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao ler imagem."));
    };
    img.src = url;
  });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file, {
        resizeWidth: MAX_EDGE,
        resizeHeight: MAX_EDGE,
        resizeQuality: "medium",
      });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        return loadImageElement(file);
      }
    }
  }
  return loadImageElement(file);
}

function releaseBitmapSource(source: ImageBitmap | HTMLImageElement) {
  if ("close" in source && typeof source.close === "function") {
    source.close();
  }
}

async function sourceToJpegFile(
  source: ImageBitmap | HTMLImageElement,
  originalName: string,
): Promise<File> {
  const srcWidth = "width" in source ? source.width : 0;
  const srcHeight = "height" in source ? source.height : 0;
  const { width, height } = scaleToMax(srcWidth, srcHeight, MAX_EDGE);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas indisponível.");

  ctx.drawImage(source, 0, 0, width, height);
  releaseBitmapSource(source);

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY);
  });

  canvas.width = 0;
  canvas.height = 0;

  if (!blob) throw new Error("Falha ao comprimir imagem.");

  const baseName = originalName.replace(/\.[^.]+$/, "") || "evidencia";
  return new File([blob], `${baseName}.jpg`, {
    type: "image/jpeg",
    lastModified: Date.now(),
  });
}

export function waitForImageMemoryRelease(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

export async function compressEvidencePhoto(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  try {
    const source = await loadBitmap(file);
    return await sourceToJpegFile(source, file.name);
  } catch {
    return file;
  }
}

export async function replaceEvidencePhoto(
  previous: File | null,
  next: File | undefined,
  onChange: (file: File | null) => void,
): Promise<void> {
  if (!next) return;

  if (previous) {
    onChange(null);
    await waitForImageMemoryRelease();
  }

  const compressed = await compressEvidencePhoto(next);
  onChange(compressed);
}
