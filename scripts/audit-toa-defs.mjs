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

function monthStats(pred) {
  const m = new Map();
  for (const row of rows) {
    const d = pdata(pick(row, "Data"));
    if (!d) continue;
    const mk = d.slice(0, 7);
    const wo = nwo(pick(row, "Número da WO", "Numero da WO"));
    if (!wo) continue;
    if (!pred(row)) continue;
    if (!m.has(mk)) m.set(mk, new Set());
    m.get(mk).add(wo);
  }
  return Object.fromEntries([...m].sort().map(([k, s]) => [k, s.size]));
}

const hasLogin = (r) => !!pick(r, "Login do Técnico");
const concluido = (r) =>
  ["concluído", "concluido"].includes(
    pick(r, "Status da Atividade").toLowerCase(),
  );
const notCancelSusp = (r) => {
  const s = pick(r, "Status da Atividade").toLowerCase();
  return s !== "cancelado" && s !== "suspenso";
};

console.log("all unique", monthStats(() => true));
console.log("with login", monthStats(hasLogin));
console.log("concluido", monthStats(concluido));
console.log("not cancel/suspenso", monthStats(notCancelSusp));
console.log(
  "login+not cancel/suspenso",
  monthStats((r) => hasLogin(r) && notCancelSusp(r)),
);
console.log(
  "login+concluido",
  monthStats((r) => hasLogin(r) && concluido(r)),
);
console.log("user targets Jun607 jul703 ago90 / app 561 740 84");
