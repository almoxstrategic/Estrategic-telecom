/**
 * Verifica que as 5 WOs produtivas do Z674225 (29–30/07) sobrevivem ao parse+process
 * e que julho ultrapassa 1000 O.S. (motivo do corte silencioso no fetch).
 */
import * as XLSX from "xlsx";
import fs from "fs";
import { createRequire } from "module";
import { pathToFileURL } from "url";

// Carrega via tsx se disponível; senão replica mínima
const WOS = [
  "03230|739647607",
  "03230|739678847",
  "03230|739688441",
  "03230|739687114",
  "03230|739699245",
];

function trimCell(v) {
  return String(v ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
function normalizeHeader(key) {
  return trimCell(key)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function pick(row, ...aliases) {
  const map = new Map();
  for (const [k, v] of Object.entries(row)) {
    map.set(normalizeHeader(k), trimCell(v));
  }
  for (const alias of aliases) {
    const hit = map.get(normalizeHeader(alias));
    if (hit !== undefined && hit !== "") return hit;
  }
  return "";
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
  return "";
}
function normalizeNumeroWo(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "");
}
function normalizeStatus(s) {
  return String(s ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
function isExecutada(s) {
  const n = normalizeStatus(s);
  return n === "EXECUTADA" || n === "EXECUTADO";
}
function isCodProd(c) {
  return c !== 571 && c >= 409 && c < 600;
}

const path = "C:/Users/Vinicius/Desktop/MODELO BASICOatual. (14).xlsx";
const wb = XLSX.read(fs.readFileSync(path), { type: "buffer" });
const matrix = XLSX.utils.sheet_to_json(wb.Sheets["Page 1"], {
  header: 1,
  defval: "",
  raw: false,
  dateNF: "dd/mm/yyyy",
});
const headers = matrix[0].map((h) => trimCell(h));
const rows = matrix.slice(1).map((cells) => {
  const row = {};
  headers.forEach((h, i) => {
    if (!h) return;
    row[h] = trimCell(cells[i]);
  });
  return row;
});

const flat = [];
const keptWos = new Set();
let julOs = 0;

for (const row of rows) {
  const data = parseToaData(pick(row, "Data"));
  const login = pick(row, "Login do Técnico").toUpperCase();
  const wo = normalizeNumeroWo(pick(row, "Número da WO", "Numero da WO"));
  if (!data || !login || !wo) continue;

  const statusAtiv = pick(row, "Status da Atividade");
  let osCount = 0;
  for (let i = 1; i <= 10; i++) {
    const numeroOs = pick(row, `Número da O.S ${i}`, `Numero da O.S ${i}`);
    const codBruto = pick(row, `Cód de Baixa ${i}`, `Cod de Baixa ${i}`);
    const status = pick(row, `Status da O.S ${i}`, `Status da OS ${i}`);
    const tipoOs = pick(row, `Tipo O.S ${i}`, `Tipo OS ${i}`);
    if (!numeroOs && !codBruto && !status && !tipoOs) continue;
    osCount += 1;
    const cod = Number((codBruto.match(/^(\d+)/) || [])[1] || 0);
    flat.push({
      data,
      login,
      wo,
      statusAtiv,
      numeroOs,
      cod,
      status,
      prod: isExecutada(status) && isCodProd(cod),
    });
  }
  if (osCount === 0) {
    flat.push({
      data,
      login,
      wo,
      statusAtiv,
      numeroOs: "",
      cod: 0,
      status: "",
      prod: false,
    });
  }
  keptWos.add(wo);
  if (data.startsWith("2026-07")) julOs += Math.max(osCount, 1);
}

const found = WOS.map((w) => {
  const rowsW = flat.filter((r) => r.wo === w);
  return {
    wo: w,
    kept: rowsW.length > 0,
    prod: rowsW.some((r) => r.prod),
    rows: rowsW,
  };
});

const jonathanJulProd = flat.filter(
  (r) =>
    r.login === "Z674225" &&
    r.data.startsWith("2026-07") &&
    r.prod &&
    normalizeStatus(r.statusAtiv) !== "CANCELADO" &&
    normalizeStatus(r.statusAtiv) !== "SUSPENSO",
);

console.log(
  JSON.stringify(
    {
      julyOsApprox: julOs,
      julyWouldBeTruncatedAt1000: julOs > 1000,
      missingWosWouldAppearAfterPage1:
        julOs > 1000
          ? "YES — days 29-30 fall after row 1000 when ordered by date ASC"
          : "no",
      wantedWos: found.map((f) => ({
        wo: f.wo,
        keptInImport: f.kept,
        productive: f.prod,
      })),
      jonathanJulProdWos: [
        ...new Set(jonathanJulProd.map((r) => r.wo)),
      ],
      allWantedKept: found.every((f) => f.kept && f.prod),
    },
    null,
    2,
  ),
);
