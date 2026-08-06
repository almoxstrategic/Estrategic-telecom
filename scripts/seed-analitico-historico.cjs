/**
 * Seed analitico_historico a partir do Excel gabarito (abas mensais).
 * Gera JSON em scripts/calibration-output/analitico-seed.json
 * Uso: node scripts/seed-analitico-historico.cjs
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const PATH_ANALITICO = path.join(
  DESKTOP,
  "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx",
);
const OUT = path.join(__dirname, "calibration-output", "analitico-seed.json");

const MONTH_SHEETS = [
  "Notas e valores de Dezembro",
  "Notas e valores de Janeiro",
  "Notas e valores de Fevereiro",
  "Notas e valores de Março",
  "Notas e valores de Abril",
  "Notas e valores de Maio",
  "Notas e valores de Junho",
];

function money(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const s = String(v ?? "")
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

function parseDh(raw) {
  if (raw == null || raw === "") return null;
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}`;
  }
  const s = String(raw).trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (m) {
    return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  return null;
}

function esc(s) {
  return String(s ?? "").replace(/'/g, "''");
}

const wb = XLSX.readFile(PATH_ANALITICO);
const all = [];
const byBase = {};

for (const sheetName of MONTH_SHEETS) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) {
    console.warn("aba ausente", sheetName);
    continue;
  }
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
  for (const r of rows) {
    const data_base = Number(String(r.DATA_BASE).replace(/\D/g, "")) || 0;
    const cd_os = String(r.CD_OS ?? "")
      .trim()
      .replace(/\.0$/, "");
    if (!data_base || !cd_os) continue;
    const rec = {
      data_base,
      nr_contrato: String(r.NR_CONTRATO ?? "").trim(),
      cd_os,
      id_tipo_os: Number(String(r.ID_TIPO_OS).match(/\d+/)?.[0] || NaN) || null,
      ds_tipo_os: String(r.DS_TIPO_OS ?? "").trim(),
      cd_baixa: Number(String(r.CD_BAIXA).match(/\d+/)?.[0] || NaN) || null,
      qtde: money(r.QTDE) || 1,
      valor_servico: money(r.VALOR_SERVICO),
      dh_baixa: parseDh(r.DH_BAIXA),
      tipo_os_consolid: String(r.TIPO_OS_CONSOLID ?? "").trim(),
      nm_cidade: String(r.NM_CIDADE ?? "").trim(),
    };
    all.push(rec);
    byBase[data_base] = (byBase[data_base] || 0) + 1;
  }
}

fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(all));

// Also write SQL batches for MCP apply
const sqlDir = path.join(__dirname, "calibration-output", "analitico-sql");
fs.mkdirSync(sqlDir, { recursive: true });
const BATCH = 150;
let batchIdx = 0;
for (let i = 0; i < all.length; i += BATCH) {
  const chunk = all.slice(i, i + BATCH);
  const values = chunk
    .map((r) => {
      const idTipo = r.id_tipo_os == null ? "null" : String(r.id_tipo_os);
      const cdBaixa = r.cd_baixa == null ? "null" : String(r.cd_baixa);
      const dh = r.dh_baixa ? `'${r.dh_baixa}'` : "null";
      return `(${r.data_base}, '${esc(r.nr_contrato)}', '${esc(r.cd_os)}', ${idTipo}, '${esc(r.ds_tipo_os)}', ${cdBaixa}, ${r.qtde}, ${r.valor_servico}, ${dh}, '${esc(r.tipo_os_consolid)}', '${esc(r.nm_cidade)}')`;
    })
    .join(",\n");
  const sql = `insert into public.analitico_historico (data_base, nr_contrato, cd_os, id_tipo_os, ds_tipo_os, cd_baixa, qtde, valor_servico, dh_baixa, tipo_os_consolid, nm_cidade)\nvalues\n${values};\n`;
  fs.writeFileSync(path.join(sqlDir, `batch-${String(batchIdx).padStart(3, "0")}.sql`), sql);
  batchIdx += 1;
}

console.log("rows", all.length, "byBase", byBase, "batches", batchIdx, "out", OUT);
