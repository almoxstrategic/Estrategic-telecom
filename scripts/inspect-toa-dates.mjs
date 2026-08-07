import XLSX from "xlsx";

const PATH = "c:/Users/Estrategic PE0454DQ/OneDrive/Desktop/TOA.xlsx";
const wb = XLSX.readFile(PATH, { cellDates: true, raw: true });
const sheet = wb.Sheets["Page 1"];
const matrixRaw = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: true,
});
const matrixStr = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
  dateNF: "dd/mm/yyyy",
});

const headers = matrixStr[0].map((h) => String(h ?? ""));
console.log("total cols", headers.length);
headers.forEach((h, i) => {
  if (/data|wo|login|contrato|status da atividade/i.test(h)) {
    console.log(i, JSON.stringify(h));
  }
});

const hi = headers.findIndex((h) => h === "Data");
const hWo = headers.findIndex((h) => h === "Número da WO");
const hLogin = headers.findIndex((h) => h === "Login do Técnico");
console.log({ hi, hWo, hLogin });

for (let i = 1; i <= 8; i++) {
  console.log("row", i, {
    dataRaw: matrixRaw[i]?.[hi],
    dataType: typeof matrixRaw[i]?.[hi],
    dataIsDate: matrixRaw[i]?.[hi] instanceof Date,
    dataStr: matrixStr[i]?.[hi],
    woRaw: matrixRaw[i]?.[hWo],
    woStr: matrixStr[i]?.[hWo],
    login: matrixStr[i]?.[hLogin],
  });
}

// Count how many Data values parse with app logic
function trimCell(v) {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function parseToaData(value) {
  const raw = trimCell(value);
  if (!raw) return "";
  const brasileira = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/);
  if (brasileira) {
    const [, dia, mes, anoRaw] = brasileira;
    const ano = anoRaw.length === 2 ? `20${anoRaw}` : anoRaw;
    return `${ano}-${mes.padStart(2, "0")}-${dia.padStart(2, "0")}`;
  }
  const iso = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
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

const formats = new Map();
let parsedOk = 0;
let parsedFail = 0;
for (let i = 1; i < matrixStr.length; i++) {
  const s = matrixStr[i]?.[hi];
  const r = matrixRaw[i]?.[hi];
  const key = `${typeof r}:${r instanceof Date ? "Date" : ""}|str=${JSON.stringify(String(s).slice(0, 40))}`;
  formats.set(key, (formats.get(key) || 0) + 1);
  const p = parseToaData(s);
  if (p) parsedOk++;
  else parsedFail++;
}
console.log("parse ok/fail from str path", { parsedOk, parsedFail });
console.log(
  "top formats",
  [...formats.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15),
);

// Try Date object path
let fromDateObj = 0;
for (let i = 1; i < matrixRaw.length; i++) {
  const r = matrixRaw[i]?.[hi];
  if (r instanceof Date && !Number.isNaN(r.getTime())) fromDateObj++;
  else if (typeof r === "number") fromDateObj++;
}
console.log("raw date-like cells", fromDateObj);
