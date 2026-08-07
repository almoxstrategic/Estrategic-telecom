/**
 * Valida o cenário André / contrato 170349593 no TOA.xlsx
 * com a regra atual (processarChamadosTOA).
 */
import XLSX from "xlsx";
import { readFileSync } from "fs";
import { createRequire } from "module";

// Inline minimal mirror — run via dynamic import of compiled? Use duplicated logic.
// Prefer importing from source via tsx if available; else mirror key checks.

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
function normTipo(v) {
  return trim(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}
function isContabil(st) {
  const s = normTipo(st);
  if (!s) return true;
  return s !== "CANCELADO" && s !== "SUSPENSO";
}
function codNum(v) {
  const m = String(v ?? "")
    .trim()
    .match(/^(\d+)/);
  return m ? Number.parseInt(m[1], 10) : null;
}
function isCodProd(c) {
  return c !== 571 && c >= 409 && c < 600;
}
function isExec(s) {
  return normTipo(s) === "EXECUTADA";
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

const andre = rows.filter(
  (r) =>
    pick(r, "Contrato") === "170349593" &&
    pick(r, "Login do Técnico").toUpperCase() === "Z639722",
);

const notas = [];
for (const r of andre) {
  const statusAtiv = pick(r, "Status da Atividade");
  if (!isContabil(statusAtiv)) continue;
  const wo = nwo(pick(r, "Número da WO"));
  const os = [];
  for (let i = 1; i <= 10; i++) {
    const n = pick(r, `Número da O.S ${i}`);
    const c = pick(r, `Cód de Baixa ${i}`);
    const s = pick(r, `Status da O.S ${i}`);
    const t = pick(r, `Tipo O.S ${i}`);
    if (!n && !c) continue;
    const cod = codNum(c) ?? 0;
    const prod = isExec(s) && cod > 0 && isCodProd(cod);
    const improd = cod > 0 && !prod;
    os.push({ n, c, s, t, prod, improd });
  }
  if (!os.length) continue;
  notas.push({
    wo,
    data: pdata(pick(r, "Data")),
    statusAtiv,
    osProd: os.filter((o) => o.prod).length,
    osImprod: os.filter((o) => o.improd).length,
    statusNota: os.some((o) => o.prod) ? "Produtiva" : "Improdutiva",
    os,
  });
}

const byWo = new Map();
for (const n of notas) byWo.set(n.wo, n);
const unicas = [...byWo.values()];

console.log("Contrato 170349593 / Z639722");
console.log("Notas (WOs):", unicas.length);
for (const n of unicas) {
  console.log({
    wo: n.wo,
    statusNota: n.statusNota,
    osProd: n.osProd,
    osImprod: n.osImprod,
    detalhe: n.os.map((o) => `${o.n}|${o.s}|${o.c}|prod=${o.prod}`),
  });
}
console.log("Esperado: 2 notas (WOs distintas), mesmas O.S. números com baixas independentes");
console.log(
  "Totais:",
  {
    notas: unicas.length,
    prod: unicas.filter((n) => n.statusNota === "Produtiva").length,
    improd: unicas.filter((n) => n.statusNota === "Improdutiva").length,
    osProd: unicas.reduce((s, n) => s + n.osProd, 0),
    osImprod: unicas.reduce((s, n) => s + n.osImprod, 0),
  },
);
