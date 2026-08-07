import type { DimMaterialRow, WoCabecalhoRow, WoConsumoRow, EstoqueFisicoRow } from "./logistica-types";
import { normalizeMatricula } from "./auth-identificacao";
import { normalizeMaterialCode } from "./material-code";
import { parseLocaleNumber } from "./parse-locale-number";
import type { ToaLinha } from "./toa-store";

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

/**
 * Consolidado IAT: lê a aba "Consolidado" (ou fallback legado / 1ª aba).
 * Retorna linhas normalizadas para analitico_historico (62 campos).
 */
export async function parseAnaliticoFaturamentoFile(
  file: File,
): Promise<import("./faturamento-service").AnaliticoHistoricoRow[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    throw new Error("A importação do Analítico aceita somente Excel (.xlsx/.xls).");
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });

  const consolidadoName = workbook.SheetNames.find(
    (n) => n.trim().toLowerCase() === "consolidado",
  );
  const monthSheets = workbook.SheetNames.filter((n) =>
    /^Notas e valores de /i.test(n),
  );

  let sheets: string[] = [];
  if (consolidadoName) {
    sheets = [consolidadoName];
  } else if (monthSheets.length > 0) {
    sheets = monthSheets;
  } else if (workbook.Sheets.ANALITICO) {
    sheets = ["ANALITICO"];
  } else if (workbook.SheetNames.length > 0) {
    sheets = [workbook.SheetNames[0]!];
  }

  if (sheets.length === 0) {
    throw new Error(
      'Planilha sem aba "Consolidado", "Notas e valores de …" ou "ANALITICO".',
    );
  }

  const { mapAnaliticoSheetRow } = await import("./faturamento-service");
  const out: NonNullable<ReturnType<typeof mapAnaliticoSheetRow>>[] = [];

  for (const sheetName of sheets) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: null,
      raw: true,
      blankrows: false,
    });
    for (const row of rows) {
      const normalized: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(row)) {
        const key = k.trim();
        if (
          v == null ||
          v === undefined ||
          (typeof v === "number" && Number.isNaN(v))
        ) {
          normalized[key] = null;
        } else {
          normalized[key] = v;
        }
      }
      const mapped = mapAnaliticoSheetRow(normalized);
      if (mapped) out.push(mapped);
    }
  }

  if (out.length === 0) {
    throw new Error(
      "Nenhuma linha válida encontrada (DATA_BASE e CD_OS são obrigatórios).",
    );
  }

  return out;
}


function parseToaData(value: string): string {
  const raw = trimCell(value);
  if (!raw) return "";

  const brasileira = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/);
  if (brasileira) {
    const [, dia, mes, anoRaw] = brasileira;
    const ano = anoRaw!.length === 2 ? `20${anoRaw}` : anoRaw;
    return `${ano}-${mes!.padStart(2, "0")}-${dia!.padStart(2, "0")}`;
  }

  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]!.padStart(2, "0")}-${iso[3]!.padStart(2, "0")}`;
  }

  const serial = Number(raw.replace(",", "."));
  if (Number.isFinite(serial) && serial > 0) {
    const excelEpochUtc = Date.UTC(1899, 11, 30);
    const date = new Date(excelEpochUtc + Math.trunc(serial) * 86_400_000);
    if (!Number.isNaN(date.getTime())) {
      const ano = date.getUTCFullYear();
      const mes = String(date.getUTCMonth() + 1).padStart(2, "0");
      const dia = String(date.getUTCDate()).padStart(2, "0");
      return `${ano}-${mes}-${dia}`;
    }
  }

  return "";
}

/**
 * Exportação TOA: por regra, somente a aba exatamente chamada `Page 1`
 * pode alimentar os KPIs.
 *
 * Cada linha é um chamado (WO/Contrato). Dentro dela, as O.S. ocupam
 * slots 1–10: Número da O.S X, Cód de Baixa X, Status da O.S X, Tipo O.S X.
 */
export async function parseToaFile(file: File): Promise<ToaLinha[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xls")) {
    throw new Error("A importação TOA aceita somente arquivos Excel (.xlsx ou .xls).");
  }

  const XLSX = await import("xlsx");
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: "array" });
  const sheet = workbook.Sheets["Page 1"];

  if (!sheet) {
    throw new Error('A planilha deve conter uma aba chamada exatamente "Page 1".');
  }

  const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, {
    header: 1,
    defval: "",
    raw: false,
    dateNF: "dd/mm/yyyy",
  }) as string[][];

  return rowsFromMatrix(matrix)
    .map((row) => {
      const ordensDeServico: ToaLinha["ordensDeServico"] = [];

      for (let indice = 1; indice <= 10; indice += 1) {
        const numeroOs = pick(
          row,
          `Número da O.S ${indice}`,
          `Numero da O.S ${indice}`,
          `Número da OS ${indice}`,
          `Numero da OS ${indice}`,
        );
        const codBaixaBruto = pick(
          row,
          `Cód de Baixa ${indice}`,
          `Cod de Baixa ${indice}`,
          `Código de Baixa ${indice}`,
          `Codigo de Baixa ${indice}`,
        );
        // Slot válido se Número da O.S. ou Cód de Baixa estiver preenchido.
        if (!numeroOs && !codBaixaBruto) continue;

        ordensDeServico.push({
          indice,
          numeroOs,
          codBaixaBruto,
          status: pick(
            row,
            `Status da O.S ${indice}`,
            `Status da OS ${indice}`,
            `Status O.S ${indice}`,
            `Status OS ${indice}`,
          ),
          tipoOs: pick(
            row,
            `Tipo O.S ${indice}`,
            `Tipo OS ${indice}`,
            `Tipo O.S. ${indice}`,
          ),
        });
      }

      return {
        data: parseToaData(pick(row, "Data")),
        loginTecnico: normalizeMatricula(pick(row, "Login do Técnico")),
        numeroWo: pick(row, "Número da WO", "Numero da WO", "Número WO"),
        contrato: pick(row, "Contrato"),
        ordensDeServico,
      };
    })
    .filter(
      (linha) =>
        Boolean(linha.data && linha.loginTecnico && linha.ordensDeServico.length > 0),
    );
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

/** Estoque BTP / dim_materiais: Material + Descr. Material (e aliases). */
function mapEstoqueRow(row: RawRow): DimMaterialRow | null {
  const material = pick(row, "Material", "Cod material", "Cod. material", "Código material");
  const descr = pick(row, "Descr. Material", "Descr.Material", "Descr Material", "Nomenclatura");

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

export type EstoqueBtpImportRow = {
  codigo: string;
  descricao: string;
};

/** Miscelâneas — Estoque BTP: cabeçalhos exatos `Material` e `Descr. Material`. */
const ESTOQUE_BTP_EXACT_COLUMNS = {
  codigo: ["Material"],
  descricao: ["Descr. Material"],
} as const;

function estoqueBtpPick(row: RawRow, exactNames: readonly string[], ...aliases: string[]): string {
  for (const exact of exactNames) {
    for (const [key, value] of Object.entries(row)) {
      if (trimCell(key) === exact) {
        const text = trimCell(value);
        if (text) return text;
      }
    }
  }
  return pick(row, ...exactNames, ...aliases);
}

function mapEstoqueBtpRow(row: RawRow): EstoqueBtpImportRow | null {
  const codigoRaw = estoqueBtpPick(row, ESTOQUE_BTP_EXACT_COLUMNS.codigo, "Material");
  if (!codigoRaw) return null;

  const codigo = normalizeMaterialCode(codigoRaw);
  if (!codigo) return null;

  const descricao =
    estoqueBtpPick(
      row,
      ESTOQUE_BTP_EXACT_COLUMNS.descricao,
      "Descr. Material",
      "Descr.Material",
      "Descr Material",
    ) || codigo;

  return { codigo, descricao: descricao.trim() };
}

export async function parseEstoqueBtpFile(file: File): Promise<EstoqueBtpImportRow[]> {
  const raw = await parseSpreadsheet(file);
  const map = new Map<string, EstoqueBtpImportRow>();

  for (const row of raw) {
    const mapped = mapEstoqueBtpRow(row);
    if (mapped) map.set(mapped.codigo, mapped);
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

export type EstoqueBaseImportRow = {
  codigoAlternativo: string;
  estoqueAtual: number;
  estoqueReservado: number;
  estoqueDisponivel: number;
};

/** Miscelâneas — Estoque Base: colunas exatas da planilha. */
const ESTOQUE_BASE_EXACT_COLUMNS = {
  codigoAlternativo: ["Código Alternativo"],
  estoqueAtual: ["Estoque Atual"],
  estoqueReservado: ["Estoque Reservado"],
  estoqueDisponivel: ["Estoque Disponível"],
} as const;

function estoqueBasePick(row: RawRow, exactNames: readonly string[], ...aliases: string[]): string {
  for (const exact of exactNames) {
    for (const [key, value] of Object.entries(row)) {
      if (trimCell(key) === exact) {
        const text = trimCell(value);
        if (text) return text;
      }
    }
  }
  return pick(row, ...exactNames, ...aliases);
}

function mapEstoqueBaseRow(row: RawRow): EstoqueBaseImportRow | null {
  const codigoRaw = estoqueBasePick(
    row,
    ESTOQUE_BASE_EXACT_COLUMNS.codigoAlternativo,
    "Codigo Alternativo",
    "Código Alternativo",
  );
  if (!codigoRaw) return null;

  const codigoAlternativo = normalizeMaterialCode(codigoRaw);
  if (!codigoAlternativo) return null;

  return {
    codigoAlternativo,
    estoqueAtual: parseNumber(
      estoqueBasePick(row, ESTOQUE_BASE_EXACT_COLUMNS.estoqueAtual, "Estoque Atual"),
    ),
    estoqueReservado: parseNumber(
      estoqueBasePick(row, ESTOQUE_BASE_EXACT_COLUMNS.estoqueReservado, "Estoque Reservado"),
    ),
    estoqueDisponivel: parseNumber(
      estoqueBasePick(row, ESTOQUE_BASE_EXACT_COLUMNS.estoqueDisponivel, "Estoque Disponivel", "Estoque Disponível"),
    ),
  };
}

export async function parseEstoqueBaseFile(file: File): Promise<EstoqueBaseImportRow[]> {
  const raw = await parseSpreadsheet(file);
  const map = new Map<string, EstoqueBaseImportRow>();

  for (const row of raw) {
    const mapped = mapEstoqueBaseRow(row);
    if (mapped) map.set(mapped.codigoAlternativo, mapped);
  }

  return [...map.values()];
}

export type EstoqueAtlasRow = {
  tipo: string;
  modelo: string;
  /** Coluna da planilha `Número Série` → estado `numeroSerie` (UI: Nº Serie). */
  numeroSerie: string;
  estado: string;
  dataUltimaAlteracao: string;
  /** Coluna da planilha `Responsavél` (typo do arquivo) → estado `responsavel`. */
  responsavel: string;
};

/** Colunas exatas do Excel de origem (Serializados / Estoque Atlas). */
const ATLAS_EXACT_COLUMNS = {
  tipo: ["Tipo"],
  modelo: ["Modelo"],
  numeroSerie: ["Número Série"],
  estado: ["Estado"],
  dataUltimaAlteracao: ["Data Última Alteração"],
  /** Grafia com erro de digitação no arquivo físico (acento no 'e'). */
  responsavel: ["Responsavél"],
} as const;

function isBlankMatrixRow(cells: string[]): boolean {
  return cells.every((c) => trimCell(c) === "");
}

/**
 * Prioriza match exato do cabeçalho (trim), depois aliases normalizados.
 * Necessário para grafias com typo do Excel (ex: Responsavél).
 */
function atlasPick(row: RawRow, exactNames: readonly string[], ...aliases: string[]): string {
  for (const exact of exactNames) {
    for (const [key, value] of Object.entries(row)) {
      if (trimCell(key) === exact) {
        const text = trimCell(value);
        if (text) return text;
      }
    }
  }
  return pick(row, ...exactNames, ...aliases);
}

function findAtlasHeaderRowIndex(matrix: string[][]): number {
  const maxScan = Math.min(matrix.length, 40);
  for (let i = 0; i < maxScan; i++) {
    const cells = matrix[i] ?? [];
    if (isBlankMatrixRow(cells)) continue;

    const trimmed = cells.map((c) => trimCell(c));
    const normalized = trimmed.map((c) => normalizeHeader(c));

    const hasTipo =
      trimmed.includes("Tipo") || normalized.includes("tipo");
    const hasModelo =
      trimmed.includes("Modelo") || normalized.includes("modelo");
    const hasSerie =
      trimmed.includes("Número Série") ||
      normalized.some(
        (h) =>
          h === "numero serie" ||
          h === "numero de serie" ||
          h === "n serie" ||
          h === "no serie",
      );
    const hasEstado =
      trimmed.includes("Estado") || normalized.includes("estado");

    if (hasTipo && hasModelo && hasSerie) return i;
    if (hasTipo && hasModelo && hasEstado) return i;
  }
  return -1;
}

function matrixToRawRowsFromHeader(matrix: string[][], headerIndex: number): RawRow[] {
  const headerCells = (matrix[headerIndex] ?? []).map((h) => trimCell(h));
  const rows: RawRow[] = [];

  for (let r = headerIndex + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    if (isBlankMatrixRow(cells)) continue;

    const row: RawRow = {};
    let hasAny = false;
    headerCells.forEach((header, i) => {
      if (!header) return;
      const value = trimCell(cells[i]);
      // Mantém a grafia exata do Excel (ex: "Responsavél", "Número Série")
      row[header] = value;
      if (value) hasAny = true;
    });
    if (hasAny) rows.push(row);
  }

  return rows;
}

async function parseAtlasSpreadsheetMatrix(file: File): Promise<string[][]> {
  const name = file.name.toLowerCase();
  if (name.endsWith(".xlsx") || name.endsWith(".xls")) {
    const XLSX = await import("xlsx");
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) return [];
    const sheet = workbook.Sheets[sheetName];
    return XLSX.utils.sheet_to_json<string[]>(sheet, {
      header: 1,
      defval: "",
      raw: false,
      blankrows: false,
    }) as string[][];
  }

  const text = await file.text();
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/);
  if (lines.length === 0) return [];
  const delimiter = detectDelimiter(lines.find((l) => l.trim()) ?? ",");
  return lines
    .filter((l) => l.trim())
    .map((line) => splitCsvLine(line, delimiter).map((c) => trimCell(c)));
}

/**
 * Serializados — Estoque Atlas.
 * Planilha: Tipo | Modelo | Número Série | Estado | Data Última Alteração | Responsavél
 * Estado: tipo | modelo | numeroSerie | estado | dataUltimaAlteracao | responsavel
 */
function mapEstoqueAtlasRow(row: RawRow): EstoqueAtlasRow | null {
  const tipo = atlasPick(row, ATLAS_EXACT_COLUMNS.tipo);
  const modelo = atlasPick(row, ATLAS_EXACT_COLUMNS.modelo);
  const numeroSerie = atlasPick(row, ATLAS_EXACT_COLUMNS.numeroSerie, "Numero Serie", "Número Serie");
  const estado = atlasPick(row, ATLAS_EXACT_COLUMNS.estado);
  const dataUltimaAlteracao = atlasPick(
    row,
    ATLAS_EXACT_COLUMNS.dataUltimaAlteracao,
    "Data Ultima Alteracao",
  );
  // Typo do arquivo: "Responsavél" — também aceita a grafia correta como fallback
  const responsavel = atlasPick(
    row,
    ATLAS_EXACT_COLUMNS.responsavel,
    "Responsável",
    "Responsavel",
  );

  if (!tipo && !modelo && !numeroSerie) return null;

  return {
    tipo: tipo || "—",
    modelo: modelo || "—",
    numeroSerie: numeroSerie || "—",
    estado: estado || "—",
    dataUltimaAlteracao: dataUltimaAlteracao || "—",
    responsavel: responsavel || "—",
  };
}

export async function parseEstoqueAtlasFile(file: File): Promise<EstoqueAtlasRow[]> {
  const matrix = await parseAtlasSpreadsheetMatrix(file);
  if (matrix.length === 0) return [];

  let headerIndex = findAtlasHeaderRowIndex(matrix);
  if (headerIndex < 0) {
    headerIndex = matrix.findIndex((row) => !isBlankMatrixRow(row));
  }
  if (headerIndex < 0) return [];

  const raw = matrixToRawRowsFromHeader(matrix, headerIndex);
  const rows: EstoqueAtlasRow[] = [];

  for (const row of raw) {
    const mapped = mapEstoqueAtlasRow(row);
    if (mapped) rows.push(mapped);
  }

  return rows;
}

export type EstoqueCampoRow = {
  nome: string;
  descricao: string;
  modelo: string;
  numeroSerie: string;
  status: string;
  dataRetirada: string;
};

/** Colunas exatas do Excel — Estoque Campo (Serializados). */
const CAMPO_EXACT_COLUMNS = {
  nome: ["Nome"],
  descricao: ["DESCRIÇÃO"],
  modelo: ["MODELO", "Modelo"],
  numeroSerie: ["N° DE SERIE"],
  status: ["STATUS"],
  dataRetirada: ["DATA DE RETIRADA"],
} as const;

function findCampoHeaderRowIndex(matrix: string[][]): number {
  const maxScan = Math.min(matrix.length, 40);
  for (let i = 0; i < maxScan; i++) {
    const cells = matrix[i] ?? [];
    if (isBlankMatrixRow(cells)) continue;

    const trimmed = cells.map((c) => trimCell(c));
    const normalized = trimmed.map((c) => normalizeHeader(c));

    const hasNome = trimmed.includes("Nome") || normalized.includes("nome");
    const hasDescricao =
      trimmed.includes("DESCRIÇÃO") ||
      normalized.includes("descricao") ||
      normalized.includes("descricao");
    const hasSerie =
      trimmed.includes("N° DE SERIE") ||
      normalized.some(
        (h) =>
          h === "n de serie" ||
          h === "no de serie" ||
          h === "n° de serie" ||
          h === "numero de serie" ||
          h === "n serie",
      );
    const hasStatus = trimmed.includes("STATUS") || normalized.includes("status");

    if (hasNome && (hasDescricao || hasSerie || hasStatus)) return i;
  }
  return -1;
}

/**
 * Serializados — Estoque Campo.
 * Planilha: Nome | DESCRIÇÃO | N° DE SERIE | STATUS | DATA DE RETIRADA (+ MODELO opcional)
 */
function mapEstoqueCampoRow(row: RawRow): EstoqueCampoRow | null {
  const nome = atlasPick(row, CAMPO_EXACT_COLUMNS.nome);
  const descricao = atlasPick(
    row,
    CAMPO_EXACT_COLUMNS.descricao,
    "DESCRICAO",
    "Descrição",
    "Descricao",
  );
  const modelo = atlasPick(row, CAMPO_EXACT_COLUMNS.modelo);
  const numeroSerie = atlasPick(
    row,
    CAMPO_EXACT_COLUMNS.numeroSerie,
    "Nº DE SERIE",
    "N° DE SÉRIE",
    "N DE SERIE",
    "NUMERO DE SERIE",
    "Número de Série",
  );
  const status = atlasPick(row, CAMPO_EXACT_COLUMNS.status, "Status");
  const dataRetirada = atlasPick(
    row,
    CAMPO_EXACT_COLUMNS.dataRetirada,
    "Data de Retirada",
    "DATA DE RETIRADA",
  );

  if (!nome && !descricao && !numeroSerie) return null;

  return {
    nome: nome || "—",
    descricao: descricao || "—",
    modelo: modelo || "",
    numeroSerie: numeroSerie || "—",
    status: status || "—",
    dataRetirada: dataRetirada || "—",
  };
}

export async function parseEstoqueCampoFile(file: File): Promise<EstoqueCampoRow[]> {
  const matrix = await parseAtlasSpreadsheetMatrix(file);
  if (matrix.length === 0) return [];

  let headerIndex = findCampoHeaderRowIndex(matrix);
  if (headerIndex < 0) {
    headerIndex = matrix.findIndex((row) => !isBlankMatrixRow(row));
  }
  if (headerIndex < 0) return [];

  const raw = matrixToRawRowsFromHeader(matrix, headerIndex);
  const rows: EstoqueCampoRow[] = [];

  for (const row of raw) {
    const mapped = mapEstoqueCampoRow(row);
    if (mapped) rows.push(mapped);
  }

  return rows;
}
