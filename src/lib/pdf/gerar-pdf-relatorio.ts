import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getSupabaseClient } from "@/lib/supabase";
import type { RelatorioTransmissao } from "@/lib/relatorios-transmissao";
import {
  buildCabecalhoDados,
  collectPdfBlocks,
  type PdfAtomicBlock,
  type PdfCabecalhoDados,
  type PdfContentBlock,
  type PdfPhotoItem,
  type PdfPotenciaCard,
} from "@/lib/pdf/claro-collect";

/** A4 portrait (pt) — modelo genérico da plataforma. */
const PAGE_W = 595.28;
const PAGE_H = 841.89;

const MARGIN_X = 40;
const MARGIN_TOP = 36;
const FOOTER_H = 64;
const CONTENT_BOTTOM = FOOTER_H + 18;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

const PHOTO_COLS = 2;
const PHOTO_GAP = 12;
/** Altura da celula de foto (A4, 2 colunas) — aumentada para leitura tecnica. */
const PHOTO_CELL_H = 250;
const CAPTION_H = 16;
/** Espaco extra no topo quando a foto tem Ref (Outras fotos). */
const PHOTO_TITLE_H = 18;
/** Legenda multi-linha (obs) abaixo da foto em Outras fotos. */
const PHOTO_LEGEND_H = 34;
const GAP = 10;

const LOGO_ESTRATEGIC = "/assets/logos/logo-estrategic.png";

const COR_TEXTO = rgb(0.12, 0.14, 0.16);
const COR_MUTED = rgb(0.45, 0.48, 0.52);
const COR_ACCENT = rgb(0.36, 0.65, 0.18); // verde Estrategic
const COR_BAND = rgb(0.96, 0.97, 0.96);
const COR_LINE = rgb(0.86, 0.88, 0.9);
const COR_HEADER_BAR = rgb(0.18, 0.22, 0.25);
const COR_YELLOW = rgb(0.996, 0.953, 0.78);
const COR_GRAY_ROW = rgb(0.94, 0.94, 0.94);
const COR_OK = rgb(0.09, 0.55, 0.27);
const COR_NOK = rgb(0.75, 0.1, 0.1);

type EmbeddedPhoto = PdfPhotoItem & { image: PDFImage };

type LayoutCtx = {
  doc: PDFDocument;
  font: PDFFont;
  fontBold: PDFFont;
  cabecalho: PdfCabecalhoDados;
  logoEstrategic: PDFImage | null;
  logoCliente: PDFImage | null;
  page: PDFPage;
  pageIndex: number;
  yFromTop: number;
  /** Equivalente a break-inside: avoid — nao quebra pagina no meio do grupo. */
  lockBreak: boolean;
};

function topToPdfY(yFromTop: number): number {
  return PAGE_H - yFromTop;
}

function remaining(ctx: LayoutCtx): number {
  return PAGE_H - CONTENT_BOTTOM - ctx.yFromTop;
}

function sanitizePdfText(raw: string): string {
  return raw
    .replace(/\u2014|\u2013/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u00A0/g, " ")
    .replace(/[^\x00-\xFF]/g, "?");
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const normalized = sanitizePdfText(text).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines: string[] = [];
  for (const paragraph of normalized.split("\n")) {
    if (!paragraph.trim()) {
      lines.push("");
      continue;
    }
    const words = paragraph.split(/\s+/);
    let current = "";
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) <= maxWidth) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length ? lines : [""];
}

function truncate(text: string, font: PDFFont, size: number, maxWidth: number): string {
  const safe = sanitizePdfText(text);
  if (font.widthOfTextAtSize(safe, size) <= maxWidth) return safe;
  let out = safe;
  while (out.length > 1 && font.widthOfTextAtSize(`${out}...`, size) > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}...`;
}

/** Resolve logo do cliente (MVP: Claro; futuro: path no catalogo). */
export function resolveClienteLogoUrl(row: RelatorioTransmissao): string {
  const nome = (row.cliente_operadora || "Claro").trim().toLowerCase();
  if (nome.includes("claro")) return "/assets/logos/logo-claro.png";
  // Fallback generico ate o cliente ter logo propria no catalogo
  return "/assets/logos/logo-claro.png";
}

async function fetchBytes(url: string): Promise<Uint8Array | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return new Uint8Array(await res.arrayBuffer());
  } catch {
    return null;
  }
}

async function embedLocalOrRemote(
  doc: PDFDocument,
  url: string,
): Promise<PDFImage | null> {
  const bytes = await fetchBytes(url);
  if (!bytes?.byteLength) return null;
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  try {
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    try {
      return isPng ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

async function loadEvidenceBytes(item: PdfPhotoItem): Promise<Uint8Array | null> {
  const path = item.path?.trim();
  if (path) {
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase.storage.from("evidencias-fotos").download(path);
      if (!error && data) return new Uint8Array(await data.arrayBuffer());
    } catch {
      /* fallback */
    }
  }
  const url = item.url?.trim();
  if (!url) return null;

  // Canvas path for CORS-restricted public URLs
  const viaCanvas = (): Promise<Uint8Array | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      const timer = window.setTimeout(() => resolve(null), 20000);
      img.onload = () => {
        window.clearTimeout(timer);
        try {
          const canvas = document.createElement("canvas");
          const w = img.naturalWidth || img.width;
          const h = img.naturalHeight || img.height;
          if (!w || !h) {
            resolve(null);
            return;
          }
          canvas.width = w;
          canvas.height = h;
          const ctx2d = canvas.getContext("2d");
          if (!ctx2d) {
            resolve(null);
            return;
          }
          ctx2d.fillStyle = "#fff";
          ctx2d.fillRect(0, 0, w, h);
          ctx2d.drawImage(img, 0, 0);
          canvas.toBlob(
            (blob) => {
              if (!blob) {
                resolve(null);
                return;
              }
              void blob.arrayBuffer().then((b) => resolve(new Uint8Array(b)));
            },
            "image/jpeg",
            0.9,
          );
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => {
        window.clearTimeout(timer);
        resolve(null);
      };
      img.src = url;
    });

  const fromCanvas = await viaCanvas();
  if (fromCanvas?.byteLength) return fromCanvas;
  return fetchBytes(url);
}

async function embedEvidence(doc: PDFDocument, item: PdfPhotoItem): Promise<PDFImage | null> {
  const bytes = await loadEvidenceBytes(item);
  if (!bytes?.byteLength) return null;
  const isPng =
    bytes.length > 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47;
  try {
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
  } catch {
    try {
      return isPng ? await doc.embedJpg(bytes) : await doc.embedPng(bytes);
    } catch {
      return null;
    }
  }
}

function fittedSize(image: PDFImage, maxW: number, maxH: number): { w: number; h: number } {
  const ratio = image.width / Math.max(image.height, 1);
  let w = maxW;
  let h = w / ratio;
  if (h > maxH) {
    h = maxH;
    w = h * ratio;
  }
  return { w, h };
}

function drawFooter(ctx: LayoutCtx): void {
  const { page, logoEstrategic, logoCliente } = ctx;
  const footerTop = FOOTER_H;

  page.drawLine({
    start: { x: MARGIN_X, y: footerTop },
    end: { x: PAGE_W - MARGIN_X, y: footerTop },
    thickness: 0.8,
    color: COR_LINE,
  });

  const logoMaxH = 28;
  const logoMaxW = 110;
  if (logoEstrategic) {
    const { w, h } = fittedSize(logoEstrategic, logoMaxW, logoMaxH);
    page.drawImage(logoEstrategic, {
      x: MARGIN_X,
      y: (footerTop - h) / 2,
      width: w,
      height: h,
    });
  }

  if (logoCliente) {
    const { w, h } = fittedSize(logoCliente, logoMaxW, logoMaxH);
    page.drawImage(logoCliente, {
      x: PAGE_W - MARGIN_X - w,
      y: (footerTop - h) / 2,
      width: w,
      height: h,
    });
  }

  // Numeracao fica apenas em stampTotalPages (evita sobreposicao).
}

function drawField(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
  x: number,
  yFromTop: number,
  width: number,
  label: string,
  value: string,
): void {
  page.drawText(sanitizePdfText(label), {
    x,
    y: topToPdfY(yFromTop + 9),
    size: 7.5,
    font: fontBold,
    color: COR_MUTED,
  });
  page.drawText(truncate(value, font, 10, width - 2), {
    x,
    y: topToPdfY(yFromTop + 22),
    size: 10,
    font,
    color: COR_TEXTO,
  });
}

function drawCabecalhoCompleto(ctx: LayoutCtx): number {
  const { page, font, fontBold, cabecalho } = ctx;
  let y = MARGIN_TOP;

  // Barra superior
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 8,
    width: PAGE_W,
    height: 8,
    color: COR_HEADER_BAR,
  });
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 11,
    width: PAGE_W,
    height: 3,
    color: COR_ACCENT,
  });

  y += 6;
  page.drawText(sanitizePdfText("Relatório de Transmissão"), {
    x: MARGIN_X,
    y: topToPdfY(y + 14),
    size: 15,
    font: fontBold,
    color: COR_TEXTO,
  });
  const os = sanitizePdfText(`OS/WF ${cabecalho.osWf}`);
  const osW = fontBold.widthOfTextAtSize(os, 12);
  page.drawText(os, {
    x: PAGE_W - MARGIN_X - osW,
    y: topToPdfY(y + 14),
    size: 12,
    font: fontBold,
    color: COR_ACCENT,
  });
  y += 24;

  page.drawLine({
    start: { x: MARGIN_X, y: topToPdfY(y) },
    end: { x: PAGE_W - MARGIN_X, y: topToPdfY(y) },
    thickness: 0.7,
    color: COR_LINE,
  });
  y += 12;

  const col3 = CONTENT_W / 3;
  drawField(page, font, fontBold, MARGIN_X, y, col3 - 8, "Operadora", cabecalho.operadora);
  drawField(page, font, fontBold, MARGIN_X + col3, y, col3 - 8, "Cliente", cabecalho.cliente);
  drawField(page, font, fontBold, MARGIN_X + col3 * 2, y, col3 - 8, "Tipo", cabecalho.tipoExecucao);
  y += 32;

  drawField(page, font, fontBold, MARGIN_X, y, CONTENT_W, "Endereço", cabecalho.endereco);
  y += 32;

  drawField(page, font, fontBold, MARGIN_X, y, col3 - 8, "Cidade", cabecalho.cidade);
  drawField(page, font, fontBold, MARGIN_X + col3, y, col3 - 8, "Empreiteira", cabecalho.empreiteira);
  drawField(page, font, fontBold, MARGIN_X + col3 * 2, y, col3 - 8, "Início", cabecalho.dataInicio);
  y += 34;

  page.drawLine({
    start: { x: MARGIN_X, y: topToPdfY(y) },
    end: { x: PAGE_W - MARGIN_X, y: topToPdfY(y) },
    thickness: 0.7,
    color: COR_LINE,
  });
  y += 14;
  return y;
}

function drawCabecalhoContinuacao(ctx: LayoutCtx): number {
  const { page, font, fontBold, cabecalho } = ctx;
  let y = MARGIN_TOP;
  page.drawRectangle({
    x: 0,
    y: PAGE_H - 6,
    width: PAGE_W,
    height: 6,
    color: COR_ACCENT,
  });
  y += 8;
  const title = sanitizePdfText(`OS/WF ${cabecalho.osWf}`);
  page.drawText(title, {
    x: MARGIN_X,
    y: topToPdfY(y + 11),
    size: 10,
    font: fontBold,
    color: COR_TEXTO,
  });
  const op = sanitizePdfText(cabecalho.operadora);
  const ow = font.widthOfTextAtSize(op, 9);
  page.drawText(op, {
    x: PAGE_W - MARGIN_X - ow,
    y: topToPdfY(y + 11),
    size: 9,
    font,
    color: COR_MUTED,
  });
  y += 18;
  page.drawLine({
    start: { x: MARGIN_X, y: topToPdfY(y) },
    end: { x: PAGE_W - MARGIN_X, y: topToPdfY(y) },
    thickness: 0.6,
    color: COR_LINE,
  });
  y += 12;
  return y;
}

async function newPage(ctx: LayoutCtx, first: boolean): Promise<void> {
  ctx.page = ctx.doc.addPage([PAGE_W, PAGE_H]);
  ctx.pageIndex += 1;
  ctx.yFromTop = first ? drawCabecalhoCompleto(ctx) : drawCabecalhoContinuacao(ctx);
  drawFooter(ctx);
}

async function ensureSpace(ctx: LayoutCtx, needed: number): Promise<void> {
  if (ctx.lockBreak) return;
  if (remaining(ctx) >= needed) return;
  await newPage(ctx, false);
}

async function drawHeading(ctx: LayoutCtx, text: string): Promise<void> {
  const bandH = 24;
  await ensureSpace(ctx, bandH + 8);
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + bandH),
    width: CONTENT_W,
    height: bandH,
    color: COR_BAND,
  });
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + bandH),
    width: 4,
    height: bandH,
    color: COR_ACCENT,
  });
  ctx.page.drawText(sanitizePdfText(text), {
    x: MARGIN_X + 12,
    y: topToPdfY(ctx.yFromTop + 16),
    size: 11,
    font: ctx.fontBold,
    color: COR_TEXTO,
  });
  ctx.yFromTop += bandH + 8;
}

async function drawSubheader(ctx: LayoutCtx, text: string): Promise<void> {
  const lines = wrapText(text, ctx.fontBold, 10, CONTENT_W);
  await ensureSpace(ctx, lines.length * 13 + 8);
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 10,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.yFromTop += 13;
  }
  ctx.yFromTop += 6;
}

async function drawParagraph(ctx: LayoutCtx, text: string, label?: string): Promise<void> {
  if (label) {
    await ensureSpace(ctx, 24);
    ctx.page.drawText(sanitizePdfText(label), {
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 8,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.yFromTop += 12;
  }
  const lines = wrapText(text, ctx.font, 9.5, CONTENT_W);
  for (const line of lines) {
    await ensureSpace(ctx, 14);
    ctx.page.drawText(line || " ", {
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 9.5,
      font: ctx.font,
      color: COR_TEXTO,
    });
    ctx.yFromTop += 13;
  }
  ctx.yFromTop += 4;
}

function photoCellWidth(): number {
  return (CONTENT_W - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS;
}

function photoRowMetrics(items: { title?: string; caption?: string }[]): {
  titleH: number;
  captionH: number;
  rowH: number;
} {
  const withTitle = items.some((i) => Boolean(i.title?.trim()));
  const titleH = withTitle ? PHOTO_TITLE_H : 0;
  const captionH = withTitle ? PHOTO_LEGEND_H : CAPTION_H;
  return { titleH, captionH, rowH: titleH + PHOTO_CELL_H + captionH + GAP };
}

async function drawPhotoRow(ctx: LayoutCtx, items: EmbeddedPhoto[]): Promise<void> {
  const { titleH, captionH, rowH } = photoRowMetrics(items);
  if (!ctx.lockBreak && remaining(ctx) < rowH) await newPage(ctx, false);

  const cellW = photoCellWidth();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cellX = MARGIN_X + i * (cellW + PHOTO_GAP);
    let y = ctx.yFromTop;

    if (titleH > 0) {
      const ref = truncate(item.title?.trim() || "—", ctx.fontBold, 9, cellW - 4);
      ctx.page.drawText(ref, {
        x: cellX + 2,
        y: topToPdfY(y + 12),
        size: 9,
        font: ctx.fontBold,
        color: COR_TEXTO,
      });
      y += titleH;
    }

    const { w, h } = fittedSize(item.image, cellW - 4, PHOTO_CELL_H - 6);
    const x = cellX + (cellW - w) / 2;
    const yTop = y + (PHOTO_CELL_H - h) / 2;
    ctx.page.drawImage(item.image, {
      x,
      y: topToPdfY(yTop + h),
      width: w,
      height: h,
    });

    const legendTop = y + PHOTO_CELL_H;
    const captionRaw = item.caption?.trim() ?? "";
    if (captionRaw) {
      const lines = wrapText(captionRaw, ctx.font, 7.5, cellW - 4).slice(
        0,
        titleH > 0 ? 3 : 1,
      );
      let ly = legendTop + 10;
      for (const line of lines) {
        const lw = ctx.font.widthOfTextAtSize(line, 7.5);
        ctx.page.drawText(line, {
          x: cellX + (cellW - lw) / 2,
          y: topToPdfY(ly),
          size: 7.5,
          font: ctx.font,
          color: COR_MUTED,
        });
        ly += 10;
      }
    }
  }
  ctx.yFromTop += rowH;
}

async function embedPhotoItems(
  doc: PDFDocument,
  items: PdfPhotoItem[],
): Promise<EmbeddedPhoto[]> {
  const embedded: EmbeddedPhoto[] = [];
  for (const item of items) {
    const image = await embedEvidence(doc, item);
    if (image) embedded.push({ ...item, image });
  }
  return embedded;
}

async function drawPhotosFrom(
  ctx: LayoutCtx,
  embedded: EmbeddedPhoto[],
  fromIndex = 0,
): Promise<void> {
  if (!embedded.length) {
    await drawParagraph(ctx, "Fotos deste bloco indisponiveis no momento.", "Aviso");
    return;
  }
  for (let i = fromIndex; i < embedded.length; i += PHOTO_COLS) {
    await drawPhotoRow(ctx, embedded.slice(i, i + PHOTO_COLS));
  }
}

async function drawPhotos(ctx: LayoutCtx, items: PdfPhotoItem[]): Promise<void> {
  const embedded = await embedPhotoItems(ctx.doc, items);
  await drawPhotosFrom(ctx, embedded, 0);
}

function measureSubheader(text: string, font: PDFFont): number {
  return wrapText(text, font, 10, CONTENT_W).length * 13 + 6;
}

function measureParagraph(text: string, font: PDFFont, label?: string): number {
  let h = label ? 12 : 0;
  h += wrapText(text, font, 9.5, CONTENT_W).length * 13 + 4;
  return h;
}

function measurePhotos(items: PdfPhotoItem[]): number {
  if (!items.length) return 24;
  const rows = Math.ceil(items.length / PHOTO_COLS);
  let h = 0;
  for (let i = 0; i < items.length; i += PHOTO_COLS) {
    h += photoRowMetrics(items.slice(i, i + PHOTO_COLS)).rowH;
  }
  return h || rows * (PHOTO_CELL_H + CAPTION_H + GAP);
}

function measurePotenciaCard(card: PdfPotenciaCard): number {
  // titulo + meta row + aten rows + fibras header + fibras
  const atenRows = card.linhasAten.length;
  const fibraRows = Math.max(card.fibras.length, 1);
  return 22 + 40 + atenRows * 18 + 20 + 16 + fibraRows * 18 + 16;
}

async function measureGroupHeight(
  ctx: LayoutCtx,
  children: PdfAtomicBlock[],
): Promise<number> {
  let h = 0;
  for (const child of children) {
    if (child.kind === "subheader") h += measureSubheader(child.text, ctx.fontBold);
    else if (child.kind === "paragraph") h += measureParagraph(child.text, ctx.font, child.label);
    else if (child.kind === "photos") {
      h += measurePhotos(child.items);
    } else if (child.kind === "potenciaCard") h += measurePotenciaCard(child.card);
    else if (child.kind === "heading") h += 32;
  }
  return h + 4;
}

async function drawPotenciaCard(ctx: LayoutCtx, card: PdfPotenciaCard): Promise<void> {
  const needed = measurePotenciaCard(card);
  await ensureSpace(ctx, Math.min(needed, remaining(ctx) + 1 > 120 ? needed : 120));

  // Titulo
  ctx.page.drawText(sanitizePdfText(card.titulo), {
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + 12),
    size: 10,
    font: ctx.fontBold,
    color: COR_TEXTO,
  });
  ctx.yFromTop += 18;

  // Bloco 1 — meta 4 colunas
  const colW = CONTENT_W / 4;
  const metas: [string, string][] = [
    ["Comprimento do Trecho", card.km],
    ["No de Emendas", card.emendas],
    ["No de Conexoes", card.conexoes],
    ["Pi (dBm)", card.pi],
  ];
  for (let i = 0; i < metas.length; i++) {
    const [lab, val] = metas[i];
    const x = MARGIN_X + i * colW;
    ctx.page.drawText(sanitizePdfText(lab), {
      x,
      y: topToPdfY(ctx.yFromTop + 8),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.page.drawText(truncate(val, ctx.font, 9, colW - 6), {
      x,
      y: topToPdfY(ctx.yFromTop + 20),
      size: 9,
      font: ctx.font,
      color: COR_TEXTO,
    });
  }
  ctx.yFromTop += 28;

  // Bloco 2 — linhas de atenuacao
  const colRotulo = CONTENT_W * 0.62;
  const colValor = CONTENT_W * 0.2;
  for (const linha of card.linhasAten) {
    const rowH = 16;
    if (!ctx.lockBreak && remaining(ctx) < rowH + 4) await newPage(ctx, false);
    const bg =
      linha.destaque === "amarelo"
        ? COR_YELLOW
        : linha.destaque === "cinza"
          ? COR_GRAY_ROW
          : rgb(1, 1, 1);
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + rowH),
      width: CONTENT_W,
      height: rowH,
      color: bg,
      borderColor: COR_LINE,
      borderWidth: 0.5,
    });
    ctx.page.drawText(truncate(linha.rotulo, ctx.font, 7, colRotulo - 8), {
      x: MARGIN_X + 4,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 7,
      font: linha.destaque ? ctx.fontBold : ctx.font,
      color: COR_TEXTO,
    });
    ctx.page.drawText(sanitizePdfText(linha.valor), {
      x: MARGIN_X + colRotulo,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 8,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(sanitizePdfText(linha.unidade), {
      x: MARGIN_X + colRotulo + colValor,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 7,
      font: ctx.font,
      color: COR_MUTED,
    });
    ctx.yFromTop += rowH;
  }
  ctx.yFromTop += 8;

  // Bloco 3 — tabela fibras
  ctx.page.drawText(sanitizePdfText("Fibras"), {
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + 10),
    size: 9,
    font: ctx.fontBold,
    color: COR_TEXTO,
  });
  ctx.yFromTop += 14;

  const cols = ["Fibra No", "Po (dBm)", "Po - Pi (dB)", "Status"];
  const cw = CONTENT_W / 4;
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + 14),
    width: CONTENT_W,
    height: 14,
    color: COR_BAND,
  });
  for (let i = 0; i < cols.length; i++) {
    ctx.page.drawText(sanitizePdfText(cols[i]), {
      x: MARGIN_X + i * cw + 4,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 7.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
  }
  ctx.yFromTop += 14;

  if (!card.fibras.length) {
    ctx.page.drawText(sanitizePdfText("Nenhum teste registrado"), {
      x: MARGIN_X + 4,
      y: topToPdfY(ctx.yFromTop + 12),
      size: 8,
      font: ctx.font,
      color: COR_MUTED,
    });
    ctx.yFromTop += 18;
  } else {
    for (const fibra of card.fibras) {
      const rowH = 16;
      if (!ctx.lockBreak && remaining(ctx) < rowH + 4) await newPage(ctx, false);
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: topToPdfY(ctx.yFromTop + rowH),
        width: CONTENT_W,
        height: rowH,
        borderColor: COR_LINE,
        borderWidth: 0.4,
      });
      const vals = [fibra.numero, fibra.po, fibra.poPi, fibra.status];
      for (let i = 0; i < vals.length; i++) {
        const isStatus = i === 3;
        const color =
          isStatus && fibra.status === "OK"
            ? COR_OK
            : isStatus && fibra.status === "NAO OK"
              ? COR_NOK
              : COR_TEXTO;
        ctx.page.drawText(sanitizePdfText(vals[i]), {
          x: MARGIN_X + i * cw + 4,
          y: topToPdfY(ctx.yFromTop + 11),
          size: 8,
          font: isStatus ? ctx.fontBold : ctx.font,
          color,
        });
      }
      ctx.yFromTop += rowH;
    }
  }
  ctx.yFromTop += 10;
}

async function drawAtomic(ctx: LayoutCtx, block: PdfAtomicBlock): Promise<void> {
  if (block.kind === "heading") await drawHeading(ctx, block.text);
  else if (block.kind === "subheader") await drawSubheader(ctx, block.text);
  else if (block.kind === "paragraph") await drawParagraph(ctx, block.text, block.label);
  else if (block.kind === "photos") await drawPhotos(ctx, block.items);
  else if (block.kind === "potenciaCard") await drawPotenciaCard(ctx, block.card);
}

async function drawGroup(ctx: LayoutCtx, children: PdfAtomicBlock[]): Promise<void> {
  const height = await measureGroupHeight(ctx, children);
  const pageCapacity = PAGE_H - CONTENT_BOTTOM - MARGIN_TOP - 50;

  // Grupo cabe em uma pagina: break-inside avoid
  if (height <= pageCapacity) {
    if (remaining(ctx) < height) await newPage(ctx, false);
    ctx.lockBreak = true;
    try {
      for (const child of children) await drawAtomic(ctx, child);
    } finally {
      ctx.lockBreak = false;
    }
    return;
  }

  // Pares de Teste de Potencia (1550+1330): nunca separar entre paginas
  const potenciaCount = children.filter((c) => c.kind === "potenciaCard").length;
  if (potenciaCount >= 2) {
    if (remaining(ctx) < Math.min(height, pageCapacity)) await newPage(ctx, false);
    ctx.lockBreak = true;
    try {
      for (const child of children) await drawAtomic(ctx, child);
    } finally {
      ctx.lockBreak = false;
    }
    return;
  }

  // Grupo grande (ex.: "Outras fotos"): titulo + 1a linha de fotos juntos
  const photosIdx = children.findIndex((c) => c.kind === "photos");
  if (photosIdx >= 0) {
    const photosBlock = children[photosIdx] as Extract<PdfAtomicBlock, { kind: "photos" }>;
    const prefix = children.slice(0, photosIdx);
    const suffix = children.slice(photosIdx + 1);
    const embedded = await embedPhotoItems(ctx.doc, photosBlock.items);

    const prefixH = await measureGroupHeight(ctx, prefix);
    const firstRowItems = embedded.slice(0, PHOTO_COLS);
    const firstRowH = firstRowItems.length
      ? photoRowMetrics(firstRowItems).rowH
      : measurePhotos(photosBlock.items.slice(0, PHOTO_COLS));
    const keepH = prefixH + firstRowH;

    if (remaining(ctx) < keepH) await newPage(ctx, false);

    ctx.lockBreak = true;
    try {
      for (const child of prefix) await drawAtomic(ctx, child);
      if (embedded.length) {
        await drawPhotoRow(ctx, embedded.slice(0, PHOTO_COLS));
      } else {
        await drawParagraph(ctx, "Fotos deste bloco indisponiveis no momento.", "Aviso");
      }
    } finally {
      ctx.lockBreak = false;
    }

    if (embedded.length > PHOTO_COLS) {
      await drawPhotosFrom(ctx, embedded, PHOTO_COLS);
    }
    for (const child of suffix) await drawAtomic(ctx, child);
    return;
  }

  // Fallback: primeiros 2 filhos juntos
  const firstKeep = children.slice(0, Math.min(2, children.length));
  const keepH = await measureGroupHeight(ctx, firstKeep);
  if (remaining(ctx) < Math.min(keepH, pageCapacity * 0.45)) await newPage(ctx, false);
  ctx.lockBreak = true;
  try {
    for (const child of firstKeep) await drawAtomic(ctx, child);
  } finally {
    ctx.lockBreak = false;
  }
  for (const child of children.slice(firstKeep.length)) await drawAtomic(ctx, child);
}

async function renderBlocks(ctx: LayoutCtx, blocks: PdfContentBlock[]): Promise<void> {
  for (const block of blocks) {
    if (block.kind === "group") await drawGroup(ctx, block.children);
    else await drawAtomic(ctx, block);
  }
}

function stampTotalPages(doc: PDFDocument, font: PDFFont): void {
  const pages = doc.getPages();
  const total = pages.length;
  for (let i = 0; i < total; i++) {
    const label = sanitizePdfText(`Página ${i + 1} de ${total}`);
    const size = 8;
    const w = font.widthOfTextAtSize(label, size);
    const y = FOOTER_H / 2 - 3;
    // Limpa area central (evita residuos de numeracao antiga / sobreposicao)
    pages[i].drawRectangle({
      x: PAGE_W / 2 - 70,
      y: y - 2,
      width: 140,
      height: 12,
      color: rgb(1, 1, 1),
    });
    pages[i].drawText(label, {
      x: PAGE_W / 2 - w / 2,
      y,
      size,
      font,
      color: COR_MUTED,
    });
  }
}

function downloadBlob(bytes: Uint8Array, filename: string) {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Gera PDF generico profissional da plataforma.
 * Layout unico para todos os clientes; so o logo do rodape direito muda.
 */
export async function gerarPDFRelatorio(row: RelatorioTransmissao): Promise<void> {
  if (typeof window === "undefined") {
    throw new Error("Geracao de PDF deve ocorrer no navegador.");
  }

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const logoEstrategic = await embedLocalOrRemote(doc, LOGO_ESTRATEGIC);
  const logoCliente = await embedLocalOrRemote(doc, resolveClienteLogoUrl(row));

  const cabecalho = buildCabecalhoDados(row);
  const blocks = collectPdfBlocks(row);

  const ctx: LayoutCtx = {
    doc,
    font,
    fontBold,
    cabecalho,
    logoEstrategic,
    logoCliente,
    page: undefined as unknown as PDFPage,
    pageIndex: 0,
    yFromTop: 0,
    lockBreak: false,
  };

  await newPage(ctx, true);
  if (!blocks.length) {
    await drawParagraph(ctx, "Nenhum conteudo fotografico ou de andamento preenchido nesta OS.");
  } else {
    await renderBlocks(ctx, blocks);
  }

  stampTotalPages(doc, font);

  const pdfBytes = await doc.save();
  const safeOs = (row.os_wf || "os").replace(/[^\w.-]+/g, "_");
  downloadBlob(pdfBytes, `relatorio-${safeOs}.pdf`);
}

/** @deprecated Use gerarPDFRelatorio — mantido para imports antigos. */
export async function gerarPDFClaro(row: RelatorioTransmissao): Promise<void> {
  return gerarPDFRelatorio(row);
}
