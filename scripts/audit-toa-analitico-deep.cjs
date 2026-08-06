/**
 * Investigação complementar: origem do R$ 378k e qualidade do join.
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const wbAna = XLSX.readFile(
  path.join(DESKTOP, "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx"),
);
const wbToa = XLSX.readFile(path.join(DESKTOP, "TOA.xlsx"));

const ana = XLSX.utils.sheet_to_json(wbAna.Sheets["ANALITICO"], {
  defval: "",
  raw: true,
});
const toa = XLSX.utils.sheet_to_json(wbToa.Sheets["Page 1"], {
  defval: "",
  raw: true,
});

function money(v) {
  if (typeof v === "number") return v;
  const s = String(v || "")
    .replace(/R\$\s?/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!s) return 0;
  if (s.includes(",") && s.includes(".")) {
    return Number(s.replace(/\./g, "").replace(",", ".")) || 0;
  }
  if (s.includes(",")) return Number(s.replace(",", ".")) || 0;
  return Number(s) || 0;
}

function parseDate(raw) {
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    return d ? d.y * 100 + d.m : null;
  }
  const s = String(raw || "");
  const m = s.match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  return y * 100 + +m[2];
}

function normOs(s) {
  return String(s)
    .trim()
    .replace(/\.0$/, "")
    .replace(/\D/g, "");
}

let sum = 0;
const byBase = {};
const byPrest = {};
for (const r of ana) {
  const v = money(r.VALOR_SERVICO);
  sum += v;
  const db = String(r.DATA_BASE);
  byBase[db] = (byBase[db] || 0) + v;
  const p = String(r.DS_PRESTADORA_SERVICO || "").slice(0, 50);
  byPrest[p] = (byPrest[p] || 0) + v;
}

console.log("SUM ALL VALOR_SERVICO", sum.toFixed(2));
console.log("by DATA_BASE", byBase);
console.log("by prestadora", byPrest);
console.log("delta vs 378127.49", (378127.49 - sum).toFixed(2));

// Din sheets
for (const name of wbAna.SheetNames) {
  const grid = XLSX.utils.sheet_to_json(wbAna.Sheets[name], {
    header: 1,
    defval: "",
  });
  console.log("\n==== Sheet", name, "dims", grid.length, "x", (grid[0] || []).length);
  for (let i = 0; i < Math.min(12, grid.length); i++) {
    console.log(i, JSON.stringify(grid[i]).slice(0, 300));
  }
}

// Key formats
console.log("\nAna CD_OS typeof samples:");
const types = {};
for (const r of ana.slice(0, 200)) {
  const t = typeof r.CD_OS;
  types[t] = (types[t] || 0) + 1;
}
console.log(types);
console.log(
  "samples",
  ana.slice(0, 8).map((r) => ({
    CD_OS: r.CD_OS,
    NR: r.NR_CONTRATO,
    tOS: typeof r.CD_OS,
    tNR: typeof r.NR_CONTRATO,
  })),
);

const toaOsSet = new Set();
const toaJunOs = new Set();
const toaContrato = new Set();
const dates = {};
let junOs = 0;
let julOs = 0;
for (const r of toa) {
  const ym = parseDate(r.Data);
  dates[ym] = (dates[ym] || 0) + 1;
  const c = String(r.Contrato || "").trim();
  if (c) toaContrato.add(normOs(c));
  for (let i = 1; i <= 10; i++) {
    const o = String(r[`Número da O.S ${i}`] || "").trim();
    if (!o) continue;
    toaOsSet.add(normOs(o));
    if (ym === 202606) {
      junOs++;
      toaJunOs.add(normOs(o));
    }
    if (ym === 202607) julOs++;
  }
}

const anaOs = new Set(ana.map((r) => normOs(r.CD_OS)));
const anaJun = ana.filter(
  (r) => String(r.DATA_BASE) === "202606" || r.DATA_BASE === 202606,
);
const anaJunOs = new Set(anaJun.map((r) => normOs(r.CD_OS)));
const anaContrato = new Set(ana.map((r) => normOs(r.NR_CONTRATO)));

let interOs = 0;
for (const o of toaOsSet) if (anaOs.has(o)) interOs++;
let interJun = 0;
for (const o of toaJunOs) if (anaJunOs.has(o)) interJun++;
let interCt = 0;
for (const c of toaContrato) if (anaContrato.has(c)) interCt++;

console.log("\nTOA notas by month", dates);
console.log("TOA OS jun/jul row-slots", junOs, julOs);
console.log("unique TOA OS", toaOsSet.size, "unique Ana OS", anaOs.size, "inter", interOs);
console.log(
  "TOA jun unique",
  toaJunOs.size,
  "Ana 202606 unique",
  anaJunOs.size,
  "inter",
  interJun,
);
console.log(
  "contrato inter",
  interCt,
  "/",
  toaContrato.size,
  "toa vs",
  anaContrato.size,
  "ana",
);

// Why low match: maybe analitico has months before June when TOA only has Jun+Jul
const anaJunInToa = anaJun.filter((r) => toaOsSet.has(normOs(r.CD_OS)));
const anaJunNotInToa = anaJun.filter((r) => !toaOsSet.has(normOs(r.CD_OS)));
console.log(
  "Ana 202606 in TOA (any month):",
  anaJunInToa.length,
  "valor",
  anaJunInToa.reduce((s, r) => s + money(r.VALOR_SERVICO), 0).toFixed(2),
);
console.log(
  "Ana 202606 NOT in TOA:",
  anaJunNotInToa.length,
  "valor",
  anaJunNotInToa.reduce((s, r) => s + money(r.VALOR_SERVICO), 0).toFixed(2),
);

// Check WO number as join key
const toaWo = new Set();
for (const r of toa) {
  const w = normOs(r["Número da WO"]);
  if (w) toaWo.add(w);
}
let woAsOs = 0;
for (const r of anaJun) {
  if (toaWo.has(normOs(r.CD_OS))) woAsOs++;
}
console.log("Ana jun CD_OS matches TOA WO?", woAsOs);

// Length distribution of OS numbers
function lenDist(set) {
  const d = {};
  for (const x of set) {
    const L = x.length;
    d[L] = (d[L] || 0) + 1;
  }
  return d;
}
console.log("TOA OS len dist", lenDist(toaOsSet));
console.log("Ana OS len dist", lenDist(anaOs));
console.log("sample TOA OS", [...toaOsSet].slice(0, 8));
console.log("sample Ana OS", [...anaOs].slice(0, 8));

// Check if CD_OS in analitico equals Número da WO in TOA for matched contracts
let ctMatchOsMismatch = 0;
let ctAndOsMatch = 0;
for (const r of anaJun.slice(0, 500)) {
  const ct = normOs(r.NR_CONTRATO);
  const os = normOs(r.CD_OS);
  if (toaContrato.has(ct)) {
    if (toaOsSet.has(os)) ctAndOsMatch++;
    else ctMatchOsMismatch++;
  }
}
console.log("among sample: contrato+os", ctAndOsMatch, "contrato only", ctMatchOsMismatch);

// Average ticket June
const junVal = anaJun.reduce((s, r) => s + money(r.VALOR_SERVICO), 0);
console.log("Ana jun n", anaJun.length, "avg ticket", (junVal / anaJun.length).toFixed(2));

// Reconstruct user 378k: maybe sum of pivot "média * contagem" wrongly, or all months
console.log("\nHypothesis all months sum:", sum.toFixed(2));
console.log("Hypothesis jun * ~5.35?", (70683.16 * 5.35).toFixed(2));

// From Din (2) earlier: counts for ADESAO in 202606 = 194, etc. Sum all VALOR might be in Total Geral column
const din2 = XLSX.utils.sheet_to_json(wbAna.Sheets["Din_$_Estrategic (2)"], {
  header: 1,
  defval: "",
});
// Look for total row
for (let i = 0; i < din2.length; i++) {
  const row = din2[i];
  const joined = row.join("|");
  if (/total/i.test(joined) || /378|370|70683|179/.test(joined)) {
    console.log("interesting din2 row", i, JSON.stringify(row).slice(0, 400));
  }
}

const out = {
  sumAll: +sum.toFixed(2),
  byBase,
  anaJunInToa: anaJunInToa.length,
  anaJunNotInToa: anaJunNotInToa.length,
  anaJunInToaValor: +anaJunInToa
    .reduce((s, r) => s + money(r.VALOR_SERVICO), 0)
    .toFixed(2),
  anaJunNotInToaValor: +anaJunNotInToa
    .reduce((s, r) => s + money(r.VALOR_SERVICO), 0)
    .toFixed(2),
  interOs,
  toaOsSize: toaOsSet.size,
  anaOsSize: anaOs.size,
  dates,
};
fs.writeFileSync(
  path.join(__dirname, "audit-output", "join-deep.json"),
  JSON.stringify(out, null, 2),
);
console.log("\nWrote join-deep.json");
