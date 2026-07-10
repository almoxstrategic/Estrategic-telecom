import type { DimMaterialRow, WoCabecalhoRow, WoConsumoRow, EstoqueFisicoRow } from "./logistica-types";
import { normalizeMatricula } from "./auth-identificacao";
import { normalizeMaterialCode } from "./material-code";
import { parseLocaleNumber } from "./parse-locale-number";

type RawRow = Record<string, string>;

/** Remove espaços normais, NBSP e outros whitespace nas bordas. */
function trimCell(value: unknown): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeHeader(key: string): string {
  return trimCell(key)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}

function pick(row: RawRow, ...aliases: string[]): string {
  const map = new Map<string, string>();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeHeader(k), trimCell(v));
  }
  for (const alias of aliases) {
    const hit = map.get(normalizeHeader(alias));
    if (hit !== undefined && hit !== "") return hit;
  }
  return "";
}

function parseNumber(value: string): number {
  return parseLocaleNumber(value);
}

/** Data de atendimento (WO) — DD/MM/AAAA do Consolidado Revisado. */
function parseDataAtendimento(value: string): string | null {
  const raw = trimCell(value);
  if (!raw) return null;

  const slash = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (slash) {
    const [, d, m, y] = slash;
    return `${y}-${m!.padStart(2, "0")}-${d!.padStart(2, "0")}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  return null;
}

/** Converte data exportada pelo SAPUI5 (DD/MM/YYYY ou serial Excel) para YYYY-MM-DD. */
function converterDataSAP(dataString: unknown): string | null {
  if (!dataString) return null;

  if (!Number.isNaN(Number(dataString)) && typeof dataString === "number") {
    const dataExcel = new Date((dataString - (25567 + 2)) * 86400 * 1000);
    if (Number.isNaN(dataExcel.getTime())) return null;
    return dataExcel.toISOString().slice(0, 10);
  }

  const str = String(dataString).trim();
  if (!str) return null;

  if (str.includes("/")) {
    const parteData = str.split(" ")[0] ?? str;
    const partes = parteData.split("/");

    if (partes.length === 3) {
      return `${partes[2]}-${partes[1]!.padStart(2, "0")}-${partes[0]!.padStart(2, "0")}`;
    }
  }

  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10);
  }

  return null;
}

function lerDataAtendimentoCabecalho(row: RawRow): string {
  const chavesExatas = [
    "Data Atendimento",
    "dataAtendimento",
    "Data de atendimento(WO)",
    "Data de atendimento (WO)",
    "Data de atendimento",
    "Data",
    "Data de criação",
  ];

  for (const chave of chavesExatas) {
    const valor = row[chave];
    if (valor !== undefined && trimCell(valor) !== "") return trimCell(valor);
  }

  const aliasesNormalizados = new Set(chavesExatas.map((chave) => normalizeHeader(chave)));
  for (const [chave, valor] of Object.entries(row)) {
    if (!aliasesNormalizados.has(normalizeHeader(chave))) continue;
    const texto = trimCell(valor);
    if (texto) return texto;
  }

  return "";
}

function splitCsvLine(line: string, delimiter: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === delimiter && !inQuotes) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out;
}

function detectDelimiter(headerLine: string): string {
  const commas = (headerLine.match(/,/g) ?? []).length;
  const semis = (headerLine.match(/;/g) ?? []).length;
  return semis > commas ? ";" : ",";
}

function rowsFromMatrix(matrix: string[][]): RawRow[] {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => trimCell(h));
  return matrix.slice(1).map((cells) => {
    const row: RawRow = {};
    headers.forEach((h, i) => {
      if (!h) return;
      row[h] = trimCell(cells[i]);
    });
    return row;
  });
}

async function parseXlsx(file: File): Promise<RawRow[]> {
  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) return [];
  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
  }) as string[][];
  return rowsFromMatrix(matrix);
}

async function parseCsv(file: File): Promise<RawRow[]> {
  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];

  const delimiter = detectDelimiter(lines[0]);
  const headers = splitCsvLine(lines[0], delimiter).map((h) => trimCell(h));
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line, delimiter);
    const row: RawRow = {};
    headers.forEach((h, i) => {
      if (!h) return;
      row[h] = trimCell(cells[i]);
    });
    return row;
  });
}

export async function parseSpreadsheet(file: File): Promise<RawRow[]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    return parseXlsx(file);
  }
  return parseCsv(file);
}

export async function parseWoCabecalhoFile(file: File): Promise<WoCabecalhoRow[]> {
  const raw = await parseSpreadsheet(file);
  const rows: WoCabecalhoRow[] = [];

  for (const row of raw) {
    const workOrderId = pick(row, "workOrderID", "work_order_id", "wo", "work order id");
    const idTecnico = normalizeMatricula(
      pick(row, "idTecnico", "id_tecnico", "matricula", "id tecnico"),
    );
    const statusRaw = pick(row, "status");
    const slaRaw = pick(row, "sla");
    const dataAtendimentoBruta = lerDataAtendimentoCabecalho(row);

    if (!workOrderId || !idTecnico) continue;

    const novoRegistro: WoCabecalhoRow = {
      work_order_id: workOrderId,
      id_tecnico: idTecnico,
      status: Math.trunc(parseNumber(statusRaw)),
      sla: parseNumber(slaRaw),
      dataAtendimento: dataAtendimentoBruta ? converterDataSAP(dataAtendimentoBruta) : null,
    };

    rows.push(novoRegistro);
  }

  return rows;
}

/**
 * Qtd Baixada do Consolidado Revisado (ex: "5,000" → 5 unidades inteiras).
 * Usado exclusivamente neste upload — não reutilizar nos demais.
 */
function parseConsolidadoQtdBaixada(value: unknown): number {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;

  const comPonto = raw.replace(",", ".");
  const n = parseFloat(comPonto);
  if (Number.isNaN(n)) return 0;

  return Math.trunc(n);
}

/**
 * Consolidado Revisado (legado):
 * WO → workOrderID | Técnico → idTecnico | Material | Descr. Material | Qtd Baixada
 */
function mapConsolidadoConsumoRow(row: RawRow): WoConsumoRow | null {
  const workOrderId = pick(row, "WO", "workOrderID", "work_order_id");
  const idTecnico = normalizeMatricula(pick(row, "Técnico", "Tecnico", "idTecnico", "id_tecnico"));
  const material = pick(row, "Material");
  const descr = pick(row, "Descr. Material", "Descr.Material");
  const qtdRaw = pick(row, "Qtd Baixada");
  const dataAtendimentoRaw = pick(
    row,
    "Data de atendimento(WO)",
    "Data de atendimento (WO)",
    "Data de atendimento",
    "Data Atendimento",
  );

  if (!workOrderId || !idTecnico || !material) return null;

  const materialCode = normalizeMaterialCode(material);
  if (!materialCode) return null;

  return {
    work_order_id: workOrderId.trim(),
    id_tecnico: idTecnico,
    material: materialCode,
    descr_material: (descr || material).trim(),
    qtd_baixada: parseConsolidadoQtdBaixada(qtdRaw),
    data_atendimento: parseDataAtendimento(dataAtendimentoRaw),
  };
}

export async function parseWoConsumoFile(file: File): Promise<WoConsumoRow[]> {
  const raw = await parseSpreadsheet(file);
  const rows: WoConsumoRow[] = [];

  for (const row of raw) {
    const mapped = mapConsolidadoConsumoRow(row);
    if (mapped) rows.push(mapped);
  }

  return rows;
}

/** Consulta de Estoque: Material + Descr. Material */
function mapEstoqueRow(row: RawRow): DimMaterialRow | null {
  const material = pick(row, "Material");
  const descr = pick(row, "Descr. Material", "Descr.Material", "Descr Material");

  if (!material) return null;

  const materialCode = normalizeMaterialCode(material);
  if (!materialCode) return null;

  return {
    material: materialCode,
    descr_material: (descr || material).trim(),
  };
}

export async function parseDimMateriaisFile(file: File): Promise<DimMaterialRow[]> {
  const raw = await parseSpreadsheet(file);
  const map = new Map<string, DimMaterialRow>();

  for (const row of raw) {
    const mapped = mapEstoqueRow(row);
    if (mapped) map.set(mapped.material, mapped);
  }

  return [...map.values()];
}

/** Upload D — Estoque Físico: Material, Descr. Material, Qtd Física, Qtd Campo */
function mapEstoqueFisicoRow(row: RawRow): EstoqueFisicoRow | null {
  const material = pick(row, "Material");
  const descr = pick(row, "Descr. Material", "Descr.Material", "Descr Material", "Descrição Material");
  const qtdFisicaRaw = pick(
    row,
    "Qtd Física",
    "Qtd Fisica",
    "Quantidade Física",
    "Quantidade Fisica",
  );
  const qtdCampoRaw = pick(row, "Qtd Campo", "Quantidade Campo");

  if (!material) return null;

  const materialCode = normalizeMaterialCode(material);
  if (!materialCode) return null;

  return {
    material: materialCode,
    descricao_material: (descr || material).trim(),
    quantidade_fisica: parseNumber(qtdFisicaRaw),
    quantidade_campo: parseNumber(qtdCampoRaw),
  };
}

export async function parseEstoqueFisicoFile(file: File): Promise<EstoqueFisicoRow[]> {
  const raw = await parseSpreadsheet(file);
  const map = new Map<string, EstoqueFisicoRow>();

  for (const row of raw) {
    const mapped = mapEstoqueFisicoRow(row);
    if (mapped) map.set(mapped.material, mapped);
  }

  return [...map.values()];
}
