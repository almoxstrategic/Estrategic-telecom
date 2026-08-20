import type { LocationData } from "@/lib/geo-location";

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Falha ao carregar imagem para marca d'água."));
    };
    img.src = url;
  });
}

function formatDatePtBr(date: Date): string {
  return date.toLocaleDateString("pt-BR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimeLocal(date: Date): string {
  return date.toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
}

function formatCoords(location: LocationData): string {
  if (location.latitude == null || location.longitude == null) {
    return "GPS indisponível";
  }
  return `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`;
}

function buildLines(location: LocationData, now = new Date()): string[] {
  const place = [location.address, location.city].filter(Boolean).join(" · ");
  return [
    `Data: ${formatDatePtBr(now)}`,
    `Hora: ${formatTimeLocal(now)}`,
    place ? `Local: ${place}` : "Local: não identificado",
    `Coord: ${formatCoords(location)}`,
  ];
}

function canvasToJpegFile(canvas: HTMLCanvasElement, originalName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          reject(new Error("Falha ao gerar imagem com marca d'água."));
          return;
        }
        const baseName = originalName.replace(/\.[^.]+$/, "") || "evidencia";
        resolve(
          new File([blob], `${baseName}.jpg`, {
            type: "image/jpeg",
            lastModified: Date.now(),
          }),
        );
      },
      "image/jpeg",
      0.92,
    );
  });
}

/** Estampa data, hora, endereço e coordenadas na parte inferior da foto. */
export async function addTimestampToImage(
  file: File,
  locationData: LocationData,
): Promise<File> {
  const img = await loadImage(file);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  if (!width || !height) {
    throw new Error("Imagem inválida para marca d'água.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas não disponível neste dispositivo.");

  ctx.drawImage(img, 0, 0, width, height);

  const lines = buildLines(locationData);
  const fontSize = Math.max(14, Math.round(width * 0.028));
  const lineGap = Math.round(fontSize * 1.35);
  const padX = Math.max(12, Math.round(width * 0.03));
  const padY = Math.max(10, Math.round(fontSize * 0.7));
  const barHeight = padY * 2 + lineGap * lines.length;

  ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
  ctx.fillRect(0, height - barHeight, width, barHeight);

  ctx.fillStyle = "#ffffff";
  ctx.font = `600 ${fontSize}px Arial, Roboto, sans-serif`;
  ctx.textBaseline = "top";
  ctx.shadowColor = "rgba(0, 0, 0, 0.45)";
  ctx.shadowBlur = 2;
  ctx.shadowOffsetY = 1;

  let y = height - barHeight + padY;
  for (const line of lines) {
    const maxWidth = width - padX * 2;
    let text = line;
    while (ctx.measureText(text).width > maxWidth && text.length > 4) {
      text = `${text.slice(0, -2)}…`;
    }
    ctx.fillText(text, padX, y, maxWidth);
    y += lineGap;
  }

  ctx.shadowColor = "transparent";
  return canvasToJpegFile(canvas, file.name);
}
