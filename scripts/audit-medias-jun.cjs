/**
 * Médias VALOR_SERVICO por ID_TIPO_OS no Analítico DATA_BASE 202606.
 */
const XLSX = require("xlsx");
const path = require("path");
const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const ana = XLSX.utils.sheet_to_json(
  XLSX.readFile(path.join(DESKTOP, "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx"))
    .Sheets.ANALITICO,
  { defval: "", raw: true },
);
function money(v) {
  if (typeof v === "number") return v;
  return Number(String(v).replace(",", ".")) || 0;
}
const by = {};
for (const r of ana) {
  if (String(r.DATA_BASE) !== "202606" && r.DATA_BASE !== 202606) continue;
  const id = String(r.ID_TIPO_OS).trim();
  const v = money(r.VALOR_SERVICO);
  if (!by[id]) by[id] = { n: 0, sum: 0, ds: String(r.DS_TIPO_OS).trim() };
  by[id].n++;
  by[id].sum += v;
}
const out = Object.entries(by)
  .map(([id, x]) => ({
    id: Number(id),
    ds: x.ds,
    n: x.n,
    media: Math.round((x.sum / x.n) * 100) / 100,
  }))
  .sort((a, b) => a.id - b.id);
console.log(JSON.stringify(out, null, 2));
