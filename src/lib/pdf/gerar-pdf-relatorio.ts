import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "pdf-lib";
import { getSupabaseClient } from "@/lib/supabase";
import { corFibraPorNumero } from "@/lib/fiber-colors";
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
import {
  buildPdfResumoExecutivo,
  tituloBlocoResumo,
  type PdfResumoCaboResumo,
  type PdfResumoExecutivo,
} from "@/lib/pdf/resumo-executivo";
import { formatResumoNumero, type ResumoCadernoLinha } from "@/lib/resumo-caderno";

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
/** Altura da celula de foto (A4, 2 colunas) — padrao do relatorio. */
const PHOTO_CELL_H = 250;
/** Altura Optico/OTDR — ocupa melhor a pagina sem forcar quebra do bloco. */
const PHOTO_CELL_H_COMPACT = 185;
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
/** Fundo sutil do painel chave-valor compacto (#f8f9fa). */
const COR_KV_BG = rgb(0.973, 0.976, 0.98);
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
  // Cabeçalho essencial: Operadora, Cliente, OS/WF (topo), Cidade, Início.
  drawField(page, font, fontBold, MARGIN_X, y, col3 - 8, "Operadora", cabecalho.operadora);
  drawField(page, font, fontBold, MARGIN_X + col3, y, col3 - 8, "Cliente", cabecalho.cliente);
  drawField(page, font, fontBold, MARGIN_X + col3 * 2, y, col3 - 8, "Cidade", cabecalho.cidade);
  y += 32;

  drawField(page, font, fontBold, MARGIN_X, y, col3 - 8, "Início", cabecalho.dataInicio);
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
  const lines = wrapText(text, ctx.fontBold, 9.5, CONTENT_W);
  await ensureSpace(ctx, lines.length * 12 + 4);
  for (const line of lines) {
    ctx.page.drawText(line, {
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 9.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.yFromTop += 12;
  }
  ctx.yFromTop += 3;
}

function measureKvGrid(fields: { label: string; value: string }[], cols: number): number {
  if (!fields.length) return 0;
  const rows = Math.ceil(fields.length / cols);
  const rowH = 28;
  const pad = 6;
  return pad * 2 + rows * rowH + 4;
}

async function drawKvGrid(
  ctx: LayoutCtx,
  fields: { label: string; value: string }[],
  cols: 2 | 3 | 4 = 3,
): Promise<void> {
  if (!fields.length) return;
  const gap = 6;
  const pad = 6;
  const rowH = 28;
  const rows = Math.ceil(fields.length / cols);
  const blockH = pad * 2 + rows * rowH;
  await ensureSpace(ctx, blockH + 4);

  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + blockH),
    width: CONTENT_W,
    height: blockH,
    color: COR_KV_BG,
    borderColor: COR_LINE,
    borderWidth: 0.4,
  });

  const colW = (CONTENT_W - pad * 2 - gap * (cols - 1)) / cols;
  for (let i = 0; i < fields.length; i++) {
    const field = fields[i]!;
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN_X + pad + col * (colW + gap);
    const y = ctx.yFromTop + pad + row * rowH;
    ctx.page.drawText(truncate(field.label, ctx.fontBold, 6.5, colW - 2), {
      x,
      y: topToPdfY(y + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.page.drawText(truncate(field.value, ctx.font, 9, colW - 2), {
      x,
      y: topToPdfY(y + 21),
      size: 9,
      font: ctx.font,
      color: COR_TEXTO,
    });
  }
  ctx.yFromTop += blockH + 4;
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

function photoCellHeight(compact?: boolean): number {
  return compact ? PHOTO_CELL_H_COMPACT : PHOTO_CELL_H;
}

function photoCellWidth(): number {
  return (CONTENT_W - PHOTO_GAP * (PHOTO_COLS - 1)) / PHOTO_COLS;
}

function photoRowMetrics(
  items: { title?: string; caption?: string }[],
  compact?: boolean,
): {
  titleH: number;
  captionH: number;
  cellH: number;
  rowH: number;
} {
  const withTitle = items.some((i) => Boolean(i.title?.trim()));
  const withCaption = items.some((i) => Boolean(i.caption?.trim()));
  const titleH = withTitle ? (compact ? 14 : PHOTO_TITLE_H) : 0;
  const captionH = withCaption
    ? compact
      ? 12
      : withTitle
        ? PHOTO_LEGEND_H
        : CAPTION_H
    : 0;
  const cellH = photoCellHeight(compact);
  const gap = compact ? 6 : GAP;
  return { titleH, captionH, cellH, rowH: titleH + cellH + captionH + gap };
}

async function drawPhotoRow(
  ctx: LayoutCtx,
  items: EmbeddedPhoto[],
  compact?: boolean,
): Promise<void> {
  const { titleH, cellH, rowH } = photoRowMetrics(items, compact);
  if (!ctx.lockBreak && remaining(ctx) < rowH) await newPage(ctx, false);

  const cellW = photoCellWidth();
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const cellX = MARGIN_X + i * (cellW + PHOTO_GAP);
    let y = ctx.yFromTop;

    if (titleH > 0) {
      const ref = truncate(item.title?.trim() || "—", ctx.fontBold, 9, cellW - 4);
      const rw = ctx.fontBold.widthOfTextAtSize(ref, 9);
      ctx.page.drawText(ref, {
        x: cellX + (cellW - rw) / 2,
        y: topToPdfY(y + 12),
        size: 9,
        font: ctx.fontBold,
        color: COR_TEXTO,
      });
      y += titleH;
    }

    const { w, h } = fittedSize(item.image, cellW - 4, cellH - 6);
    const x = cellX + (cellW - w) / 2;
    const yTop = y + (cellH - h) / 2;
    ctx.page.drawImage(item.image, {
      x,
      y: topToPdfY(yTop + h),
      width: w,
      height: h,
    });

    const legendTop = y + cellH;
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
  compact?: boolean,
): Promise<void> {
  if (!embedded.length) {
    await drawParagraph(ctx, "Fotos deste bloco indisponiveis no momento.", "Aviso");
    return;
  }
  for (let i = fromIndex; i < embedded.length; i += PHOTO_COLS) {
    await drawPhotoRow(ctx, embedded.slice(i, i + PHOTO_COLS), compact);
  }
}

async function drawPhotos(
  ctx: LayoutCtx,
  items: PdfPhotoItem[],
  compact?: boolean,
): Promise<void> {
  const embedded = await embedPhotoItems(ctx.doc, items);
  await drawPhotosFrom(ctx, embedded, 0, compact);
}

function measureSubheader(text: string, font: PDFFont): number {
  return wrapText(text, font, 9.5, CONTENT_W).length * 12 + 3;
}

function measureParagraph(text: string, font: PDFFont, label?: string): number {
  let h = label ? 12 : 0;
  h += wrapText(text, font, 9.5, CONTENT_W).length * 13 + 4;
  return h;
}

function measurePhotos(items: PdfPhotoItem[], compact?: boolean): number {
  if (!items.length) return 24;
  const rows = Math.ceil(items.length / PHOTO_COLS);
  let h = 0;
  for (let i = 0; i < items.length; i += PHOTO_COLS) {
    h += photoRowMetrics(items.slice(i, i + PHOTO_COLS), compact).rowH;
  }
  return h || rows * (photoCellHeight(compact) + CAPTION_H + GAP);
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
    else if (child.kind === "kvGrid") h += measureKvGrid(child.fields, child.cols ?? 3);
    else if (child.kind === "photos") {
      h += measurePhotos(child.items, child.compact);
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

  // Bloco 1 — meta 4 colunas estritas, text-left
  const metaGap = 8;
  const colW = (CONTENT_W - metaGap * 3) / 4;
  const metas: [string, string][] = [
    ["Comprimento do Trecho", card.km],
    ["No de Emendas", card.emendas],
    ["No de Conexoes", card.conexoes],
    ["Pi (dBm)", card.pi],
  ];
  for (let i = 0; i < metas.length; i++) {
    const [lab, val] = metas[i];
    const x = MARGIN_X + i * (colW + metaGap);
    ctx.page.drawText(sanitizePdfText(lab), {
      x,
      y: topToPdfY(ctx.yFromTop + 8),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.page.drawText(truncate(val, ctx.font, 9, colW - 2), {
      x,
      y: topToPdfY(ctx.yFromTop + 20),
      size: 9,
      font: ctx.font,
      color: COR_TEXTO,
    });
  }
  ctx.yFromTop += 30;

  // Bloco 2 — grid 12 colunas: rotulo 8 | valor 2 (direita) | unidade 2
  const span8 = (CONTENT_W * 8) / 12;
  const span2 = CONTENT_W / 6;
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
    // Col 1 — rotulo (text-left)
    ctx.page.drawText(truncate(linha.rotulo, ctx.font, 7, span8 - 10), {
      x: MARGIN_X + 4,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 7,
      font: linha.destaque ? ctx.fontBold : ctx.font,
      color: COR_TEXTO,
    });
    // Col 2 — valor (text-right)
    const valorTxt = sanitizePdfText(linha.valor);
    const valorW = ctx.fontBold.widthOfTextAtSize(valorTxt, 8);
    const valorColX = MARGIN_X + span8;
    ctx.page.drawText(valorTxt, {
      x: valorColX + span2 - 4 - valorW,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 8,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    // Col 3 — unidade (text-left)
    ctx.page.drawText(sanitizePdfText(linha.unidade), {
      x: MARGIN_X + span8 + span2 + 4,
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
    const label = sanitizePdfText(cols[i]);
    const size = 7.5;
    const tw = ctx.fontBold.widthOfTextAtSize(label, size);
    // Fibra No: text-left; demais: text-center
    const x =
      i === 0
        ? MARGIN_X + 4
        : MARGIN_X + i * cw + (cw - tw) / 2;
    ctx.page.drawText(label, {
      x,
      y: topToPdfY(ctx.yFromTop + 10),
      size,
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
      const rowH = 18;
      if (!ctx.lockBreak && remaining(ctx) < rowH + 4) await newPage(ctx, false);
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: topToPdfY(ctx.yFromTop + rowH),
        width: CONTENT_W,
        height: rowH,
        borderColor: COR_LINE,
        borderWidth: 0.4,
      });

      // Coluna Fibra No: badge + numero (flex-like, text-left)
      const telebras = corFibraPorNumero(
        fibra.numeroFibra,
        card.padraoCoresFibra === "eua" ? "eua" : "br",
      );
      const badgeW = 18;
      const badgeH = 11;
      const badgeX = MARGIN_X + 4;
      const badgeYPdf = topToPdfY(ctx.yFromTop + (rowH + badgeH) / 2);
      ctx.page.drawRectangle({
        x: badgeX,
        y: badgeYPdf,
        width: badgeW,
        height: badgeH,
        color: rgb(telebras.fill[0] / 255, telebras.fill[1] / 255, telebras.fill[2] / 255),
        borderColor: telebras.sigla === "BR" ? COR_LINE : undefined,
        borderWidth: telebras.sigla === "BR" ? 0.5 : undefined,
      });
      const siglaW = ctx.fontBold.widthOfTextAtSize(telebras.sigla, 6.5);
      ctx.page.drawText(telebras.sigla, {
        x: badgeX + (badgeW - siglaW) / 2,
        y: badgeYPdf + 2.5,
        size: 6.5,
        font: ctx.fontBold,
        color: rgb(telebras.text[0] / 255, telebras.text[1] / 255, telebras.text[2] / 255),
      });
      ctx.page.drawText(sanitizePdfText(fibra.numero), {
        x: badgeX + badgeW + 5,
        y: topToPdfY(ctx.yFromTop + 12),
        size: 8,
        font: ctx.font,
        color: COR_TEXTO,
      });

      // Po, Po-Pi, Status — text-center alinhado aos cabecalhos
      const vals = [fibra.po, fibra.poPi, fibra.status];
      for (let i = 0; i < vals.length; i++) {
        const col = i + 1;
        const isStatus = i === 2;
        const color =
          isStatus && fibra.status === "OK"
            ? COR_OK
            : isStatus && fibra.status === "NAO OK"
              ? COR_NOK
              : COR_TEXTO;
        const txt = sanitizePdfText(vals[i]);
        const size = 8;
        const font = isStatus ? ctx.fontBold : ctx.font;
        const tw = font.widthOfTextAtSize(txt, size);
        ctx.page.drawText(txt, {
          x: MARGIN_X + col * cw + (cw - tw) / 2,
          y: topToPdfY(ctx.yFromTop + 12),
          size,
          font,
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
  else if (block.kind === "kvGrid") await drawKvGrid(ctx, block.fields, block.cols ?? 3);
  else if (block.kind === "photos") await drawPhotos(ctx, block.items, block.compact);
  else if (block.kind === "potenciaCard") await drawPotenciaCard(ctx, block.card);
}

async function drawGroup(ctx: LayoutCtx, children: PdfAtomicBlock[]): Promise<void> {
  const height = await measureGroupHeight(ctx, children);
  const pageCapacity = PAGE_H - CONTENT_BOTTOM - MARGIN_TOP - 50;

  const headings = children
    .filter((c): c is Extract<PdfAtomicBlock, { kind: "heading" }> => c.kind === "heading")
    .map((c) => c.text);
  const isOpticoOtdrBundle =
    headings.some((t) => /teste\s*optico/i.test(t)) &&
    headings.some((t) => /teste\s*otdr/i.test(t));

  // Optico + OTDR: bloco unico inquebravel (nova pagina se nao couber no restante)
  if (isOpticoOtdrBundle) {
    if (remaining(ctx) < Math.min(height, pageCapacity)) await newPage(ctx, false);
    ctx.lockBreak = true;
    try {
      for (const child of children) await drawAtomic(ctx, child);
    } finally {
      ctx.lockBreak = false;
    }
    return;
  }

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
    const compact = photosBlock.compact;
    const prefix = children.slice(0, photosIdx);
    const suffix = children.slice(photosIdx + 1);
    const embedded = await embedPhotoItems(ctx.doc, photosBlock.items);

    const prefixH = await measureGroupHeight(ctx, prefix);
    const firstRowItems = embedded.slice(0, PHOTO_COLS);
    const firstRowH = firstRowItems.length
      ? photoRowMetrics(firstRowItems, compact).rowH
      : measurePhotos(photosBlock.items.slice(0, PHOTO_COLS), compact);
    const keepH = prefixH + firstRowH;

    if (remaining(ctx) < keepH) await newPage(ctx, false);

    ctx.lockBreak = true;
    try {
      for (const child of prefix) await drawAtomic(ctx, child);
      if (embedded.length) {
        await drawPhotoRow(ctx, embedded.slice(0, PHOTO_COLS), compact);
      } else {
        await drawParagraph(ctx, "Fotos deste bloco indisponiveis no momento.", "Aviso");
      }
    } finally {
      ctx.lockBreak = false;
    }

    if (embedded.length > PHOTO_COLS) {
      await drawPhotosFrom(ctx, embedded, PHOTO_COLS, compact);
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

async function drawResumoKv(
  ctx: LayoutCtx,
  items: [string, string][],
  cols = 2,
): Promise<void> {
  const gap = 8;
  const colW = (CONTENT_W - gap * (cols - 1)) / cols;
  const rowH = 28;
  for (let i = 0; i < items.length; i += cols) {
    await ensureSpace(ctx, rowH + 4);
    for (let c = 0; c < cols; c++) {
      const item = items[i + c];
      if (!item) continue;
      const x = MARGIN_X + c * (colW + gap);
      drawField(ctx.page, ctx.font, ctx.fontBold, x, ctx.yFromTop, colW, item[0], item[1]);
    }
    ctx.yFromTop += rowH;
  }
}

async function drawResumoSectionTitle(ctx: LayoutCtx, text: string): Promise<void> {
  const h = 18;
  await ensureSpace(ctx, h + 6);
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + h),
    width: CONTENT_W,
    height: h,
    color: COR_BAND,
  });
  ctx.page.drawText(sanitizePdfText(text), {
    x: MARGIN_X + 6,
    y: topToPdfY(ctx.yFromTop + 12),
    size: 9,
    font: ctx.fontBold,
    color: COR_TEXTO,
  });
  ctx.yFromTop += h + 6;
}

async function drawCaboResumoPair(
  ctx: LayoutCtx,
  titulo: string,
  re: PdfResumoCaboResumo,
  rc: PdfResumoCaboResumo,
  opts?: { forceNewPage?: boolean },
): Promise<void> {
  const rows: [string, string, string][] = [
    ["Modelo do cabo", re.modelo, rc.modelo],
    ["Marcacao Inicial", re.marcacaoInicial, rc.marcacaoInicial],
    ["Marcacao Final", re.marcacaoFinal, rc.marcacaoFinal],
    ["Total de cabos (qtd)", re.qtdCabos, rc.qtdCabos],
    ["Total metragem (m)", re.totalMetros, rc.totalMetros],
  ];
  const labelW = CONTENT_W * 0.34;
  const valW = CONTENT_W * 0.33;
  const rowH = 14;
  const titleH = 18 + 6;
  const blockH = titleH + rowH + rows.length * rowH + 6;

  if (opts?.forceNewPage) {
    await newPage(ctx, false);
  } else {
    await ensureSpace(ctx, blockH);
  }

  ctx.lockBreak = true;
  try {
    await drawResumoSectionTitle(ctx, titulo);
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + rowH),
      width: CONTENT_W,
      height: rowH,
      color: COR_GRAY_ROW,
    });
    ctx.page.drawText(sanitizePdfText("Campo"), {
      x: MARGIN_X + 3,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 7,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.page.drawText(sanitizePdfText("RE"), {
      x: MARGIN_X + labelW + 3,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 7,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.page.drawText(sanitizePdfText("RC"), {
      x: MARGIN_X + labelW + valW + 3,
      y: topToPdfY(ctx.yFromTop + 10),
      size: 7,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
    ctx.yFromTop += rowH;

    for (const [lab, vRe, vRc] of rows) {
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: topToPdfY(ctx.yFromTop + rowH),
        width: CONTENT_W,
        height: rowH,
        borderColor: COR_LINE,
        borderWidth: 0.4,
      });
      ctx.page.drawText(truncate(lab, ctx.font, 7, labelW - 6), {
        x: MARGIN_X + 3,
        y: topToPdfY(ctx.yFromTop + 10),
        size: 7,
        font: ctx.font,
        color: COR_TEXTO,
      });
      ctx.page.drawText(truncate(vRe, ctx.font, 7, valW - 6), {
        x: MARGIN_X + labelW + 3,
        y: topToPdfY(ctx.yFromTop + 10),
        size: 7,
        font: ctx.font,
        color: COR_TEXTO,
      });
      ctx.page.drawText(truncate(vRc, ctx.font, 7, valW - 6), {
        x: MARGIN_X + labelW + valW + 3,
        y: topToPdfY(ctx.yFromTop + 10),
        size: 7,
        font: ctx.font,
        color: COR_TEXTO,
      });
      ctx.yFromTop += rowH;
    }
    ctx.yFromTop += 6;
  } finally {
    ctx.lockBreak = false;
  }
}

async function drawMedicoesTable(
  ctx: LayoutCtx,
  bloco: ResumoCadernoLinha["bloco"],
  linhas: ResumoCadernoLinha[],
): Promise<void> {
  const rows = linhas.filter((l) => l.bloco === bloco);
  if (!rows.length) return;

  if (bloco === "acessos") {
    await drawMedicoesTableAcessosRc(ctx, rows);
    return;
  }

  await drawResumoSectionTitle(ctx, tituloBlocoResumo(bloco));

  const colLabel = CONTENT_W * 0.28;
  const colVal = CONTENT_W * 0.14;
  const colTotal = CONTENT_W * 0.14;
  const headerH = 16;
  const rowH = 13;

  await ensureSpace(ctx, headerH + rowH + 4);
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + headerH),
    width: CONTENT_W,
    height: headerH,
    color: COR_GRAY_ROW,
  });
  const headers: [string, number][] = [
    ["Resumo RE", MARGIN_X + 2],
    ["Valor", MARGIN_X + colLabel + 2],
    ["TOTAL", MARGIN_X + colLabel + colVal + 2],
    ["Valor", MARGIN_X + colLabel + colVal + colTotal + 2],
    ["Resumo RC", MARGIN_X + colLabel + colVal * 2 + colTotal + 2],
  ];
  for (const [lab, x] of headers) {
    ctx.page.drawText(sanitizePdfText(lab), {
      x,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
  }
  ctx.yFromTop += headerH;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]!;
    await ensureSpace(ctx, rowH + 2);
    if (idx % 2 === 1) {
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: topToPdfY(ctx.yFromTop + rowH),
        width: CONTENT_W,
        height: rowH,
        color: rgb(0.98, 0.98, 0.98),
      });
    }
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + rowH),
      width: CONTENT_W,
      height: rowH,
      borderColor: COR_LINE,
      borderWidth: 0.35,
    });

    const labelRc = row.labelRc ?? row.label;
    const unidadeRc = row.unidadeRc ?? row.unidade;
    const reTxt = formatResumoNumero(row.re, row.unidade);
    const rcTxt = formatResumoNumero(row.rc, unidadeRc);
    const totalTxt = row.omitTotal ? "—" : formatResumoNumero(row.total, row.unidade);
    const reComUn =
      row.unidade === "SIM/NÃO" ? reTxt : `${reTxt} ${row.unidade}`.trim();
    const rcComUn =
      unidadeRc === "SIM/NÃO" ? rcTxt : `${rcTxt} ${unidadeRc}`.trim();
    const totComUn =
      row.omitTotal || row.unidade === "SIM/NÃO" ? totalTxt : `${totalTxt} ${row.unidade}`.trim();

    ctx.page.drawText(truncate(row.label, ctx.font, 6.5, colLabel - 4), {
      x: MARGIN_X + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.font,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(reComUn, ctx.fontBold, 6.5, colVal - 4), {
      x: MARGIN_X + colLabel + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(totComUn, ctx.fontBold, 6.5, colTotal - 4), {
      x: MARGIN_X + colLabel + colVal + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(rcComUn, ctx.fontBold, 6.5, colVal - 4), {
      x: MARGIN_X + colLabel + colVal + colTotal + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(labelRc, ctx.font, 6.5, colLabel - 4), {
      x: MARGIN_X + colLabel + colVal * 2 + colTotal + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.font,
      color: COR_TEXTO,
    });
    ctx.yFromTop += rowH;
  }
  ctx.yFromTop += 8;
}

/** Acessos/equipamentos: Cliente (RC) + Estação/PPC + TOTAL. */
async function drawMedicoesTableAcessosRc(
  ctx: LayoutCtx,
  rows: ResumoCadernoLinha[],
): Promise<void> {
  await drawResumoSectionTitle(ctx, tituloBlocoResumo("acessos"));

  const colLabel = CONTENT_W * 0.4;
  const colVal = CONTENT_W * 0.2;
  const headerH = 16;
  const rowH = 13;

  await ensureSpace(ctx, headerH + rowH + 4);
  ctx.page.drawRectangle({
    x: MARGIN_X,
    y: topToPdfY(ctx.yFromTop + headerH),
    width: CONTENT_W,
    height: headerH,
    color: COR_GRAY_ROW,
  });
  const headers: [string, number][] = [
    ["Equipamento / item", MARGIN_X + 2],
    ["Cliente (RC)", MARGIN_X + colLabel + 2],
    ["Estação/PPC", MARGIN_X + colLabel + colVal + 2],
    ["TOTAL", MARGIN_X + colLabel + colVal * 2 + 2],
  ];
  for (const [lab, x] of headers) {
    ctx.page.drawText(sanitizePdfText(lab), {
      x,
      y: topToPdfY(ctx.yFromTop + 11),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_MUTED,
    });
  }
  ctx.yFromTop += headerH;

  for (let idx = 0; idx < rows.length; idx++) {
    const row = rows[idx]!;
    await ensureSpace(ctx, rowH + 2);
    if (idx % 2 === 1) {
      ctx.page.drawRectangle({
        x: MARGIN_X,
        y: topToPdfY(ctx.yFromTop + rowH),
        width: CONTENT_W,
        height: rowH,
        color: rgb(0.98, 0.98, 0.98),
      });
    }
    ctx.page.drawRectangle({
      x: MARGIN_X,
      y: topToPdfY(ctx.yFromTop + rowH),
      width: CONTENT_W,
      height: rowH,
      borderColor: COR_LINE,
      borderWidth: 0.35,
    });

    // Preferência: rótulo neutro do tipo; na linha de totais, texto curto.
    const label =
      row.id === "eq-instalados"
        ? "Quantidade de EQUIPAMENTOS instalados"
        : row.labelRc ?? row.label;
    const unidade = row.unidadeRc ?? row.unidade;
    const clienteTxt = formatResumoNumero(row.rc, unidade);
    const estacaoTxt = formatResumoNumero(row.re, row.unidade);
    const totalTxt = row.omitTotal
      ? "—"
      : formatResumoNumero(
          Number.isFinite(row.total) ? row.total : row.re + row.rc,
          row.unidade,
        );
    const fmt = (v: string, un: string) =>
      un === "SIM/NÃO" ? v : `${v} ${un}`.trim();

    ctx.page.drawText(truncate(label, ctx.font, 6.5, colLabel - 4), {
      x: MARGIN_X + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.font,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(fmt(clienteTxt, unidade), ctx.fontBold, 6.5, colVal - 4), {
      x: MARGIN_X + colLabel + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(fmt(estacaoTxt, row.unidade), ctx.fontBold, 6.5, colVal - 4), {
      x: MARGIN_X + colLabel + colVal + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.page.drawText(truncate(fmt(totalTxt, row.unidade), ctx.fontBold, 6.5, colVal - 4), {
      x: MARGIN_X + colLabel + colVal * 2 + 2,
      y: topToPdfY(ctx.yFromTop + 9),
      size: 6.5,
      font: ctx.fontBold,
      color: COR_TEXTO,
    });
    ctx.yFromTop += rowH;
  }
  ctx.yFromTop += 8;
}

/**
 * Folha de rosto: Resumo Executivo consolidado (alimentado pela aba Medições + cadastro).
 * Pode ocupar 1–2 páginas; o detalhe fotográfico começa em página seguinte.
 */
async function drawResumoExecutivo(ctx: LayoutCtx, data: PdfResumoExecutivo): Promise<void> {
  await drawHeading(ctx, "0. Resumo Executivo Consolidado");

  await drawResumoSectionTitle(ctx, "Dados da rede (especificos)");
  await drawResumoKv(ctx, [
    ["Tecnologia do Acesso", data.tecnologiaAcesso],
  ], 2);

  await drawResumoSectionTitle(ctx, "Equipamentos e Fibras");
  await drawResumoKv(ctx, [
    ["Instalacao de equip. CLIENTE", data.instalacaoEquipCliente],
    ["Instalacao de equip. Estacao/PPC", data.instalacaoEquipEstacao],
    ["Quantidade de Fibras (FO)", data.quantidadeFibrasFo],
    ["Identificacao da Estacao/PPC", data.identificacaoEstacao],
  ], 2);

  await drawCaboResumoPair(ctx, "Lançamento Aéreo — cabos (RE x RC)", data.caboAereoRe, data.caboAereoRc);
  await drawMedicoesTable(ctx, "aereo", data.linhas);
  await drawMedicoesTable(ctx, "aterramento", data.linhas);
  await drawCaboResumoPair(
    ctx,
    "Lançamento Subterrâneo — cabos (RE x RC)",
    data.caboSubRe,
    data.caboSubRc,
    { forceNewPage: true },
  );
  await drawMedicoesTable(ctx, "subterraneo", data.linhas);
  await drawMedicoesTable(ctx, "acessos", data.linhas);

  // Detalhe técnico (Potência / OTDR) e evidências começam em página seguinte.
  await newPage(ctx, false);
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
  const resumo = buildPdfResumoExecutivo(row);
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
  await drawResumoExecutivo(ctx, resumo);

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
