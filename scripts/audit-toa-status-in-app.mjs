import XLSX from "xlsx";

const PATH = "c:/Users/Estrategic PE0454DQ/OneDrive/Desktop/TOA.xlsx";
function trim(v) {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function nh(k) {
  return trim(k)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function pick(row, ...a) {
  const m = new Map(Object.entries(row).map(([k, v]) => [nh(k), trim(v)]));
  for (const x of a) {
    const h = m.get(nh(x));
    if (h) return h;
  }
  return "";
}
function nwo(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "");
}
function pdata(v) {
  const r = trim(v);
  const m = r.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})/);
  if (!m) return "";
  const y = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
}
function codNum(v) {
  const m = String(v ?? "")
    .trim()
    .match(/^(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}

const wb = XLSX.readFile(PATH);
const sheet = wb.Sheets["Page 1"];
const matrix = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
  dateNF: "dd/mm/yyyy",
});
const headers = matrix[0].map(trim);
const rows = matrix.slice(1).map((cells) => {
  const row = {};
  headers.forEach((h, i) => {
    if (h) row[h] = trim(cells[i]);
  });
  return row;
});

function hasValidCod(row) {
  for (let i = 1; i <= 10; i++) {
    const num = pick(row, `Número da O.S ${i}`, `Numero da O.S ${i}`);
    const cod = pick(row, `Cód de Baixa ${i}`, `Cod de Baixa ${i}`);
    if (!num && !cod) continue;
    if (codNum(cod) !== null) return true;
  }
  return false;
}

const byMonth = new Map();
for (const row of rows) {
  const d = pdata(pick(row, "Data"));
  if (!d) continue;
  const mk = d.slice(0, 7);
  const wo = nwo(pick(row, "Número da WO"));
  const login = pick(row, "Login do Técnico");
  if (!wo || !login || !hasValidCod(row)) continue;
  const st = pick(row, "Status da Atividade") || "(vazio)";
  if (!byMonth.has(mk)) byMonth.set(mk, new Map());
  const m = byMonth.get(mk);
  if (!m.has(wo)) m.set(wo, st);
}

for (const mk of [...byMonth.keys()].sort()) {
  const statuses = new Map();
  for (const st of byMonth.get(mk).values()) {
    statuses.set(st, (statuses.get(st) || 0) + 1);
  }
  console.log(mk, "total", byMonth.get(mk).size, Object.fromEntries(statuses));
}
