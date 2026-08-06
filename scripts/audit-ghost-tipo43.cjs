/**
 * Por que O.S. tipo 43 do TOA não entram no Analítico?
 * Hipótese: Claro fatura só a O.S. "principal" do contrato / nota.
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const wbToa = XLSX.readFile(path.join(DESKTOP, "TOA.xlsx"));
const wbAna = XLSX.readFile(
  path.join(DESKTOP, "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx"),
);
const toa = XLSX.utils.sheet_to_json(wbToa.Sheets["Page 1"], {
  defval: "",
  raw: true,
});
const ana = XLSX.utils.sheet_to_json(wbAna.Sheets["ANALITICO"], {
  defval: "",
  raw: true,
});

function normOs(s) {
  return String(s)
    .trim()
    .replace(/\.0$/, "")
    .replace(/\D/g, "");
}
function parseToaDate(raw) {
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return { y: d.y, m: d.m, day: d.d };
  }
  const m = String(raw || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  return { y, m: +m[2], day: +m[1] };
}
function extrairCod(raw) {
  const m = String(raw || "").trim().match(/^(\d+)/);
  return m ? +m[1] : null;
}
function isProd(cod) {
  return cod != null && cod !== 571 && cod >= 409 && cod < 600;
}
function isExec(s) {
  return String(s || "").trim().toUpperCase() === "EXECUTADA";
}

const anaJunByOs = new Map();
const anaJunByContrato = new Map();
for (const r of ana) {
  if (String(r.DATA_BASE) !== "202606" && r.DATA_BASE !== 202606) continue;
  const os = normOs(r.CD_OS);
  const ct = normOs(r.NR_CONTRATO);
  anaJunByOs.set(os, r);
  if (!anaJunByContrato.has(ct)) anaJunByContrato.set(ct, []);
  anaJunByContrato.get(ct).push(r);
}

let ghost43 = 0;
let ghost43SameContratoHasAna = 0;
let ghost43SameNotaHasAnaOs = 0;
let ghost43Alone = 0;
const siblingTipos = {};
const examples = [];

for (const row of toa) {
  const data = parseToaDate(row.Data);
  if (!data || data.y !== 2026 || data.m !== 6) continue;

  // collect all OS on this note
  const ordens = [];
  for (let i = 1; i <= 10; i++) {
    const numeroOs = String(row[`Número da O.S ${i}`] || "").trim();
    const codBaixaBruto = String(row[`Cód de Baixa ${i}`] || "").trim();
    if (!numeroOs && !codBaixaBruto) continue;
    const cod = extrairCod(codBaixaBruto);
    if (cod == null) continue;
    ordens.push({
      i,
      numeroOs,
      osKey: normOs(numeroOs),
      cod,
      status: String(row[`Status da O.S ${i}`] || "").trim(),
      tipoOs: String(row[`Tipo O.S ${i}`] || "").trim(),
      inAna: anaJunByOs.has(normOs(numeroOs)),
    });
  }

  const contrato = normOs(row.Contrato);
  const notaHasAnyAna = ordens.some((o) => o.inAna);
  const contratoHasAna = anaJunByContrato.has(contrato);

  for (const o of ordens) {
    if (!o.tipoOs.startsWith("43 ")) continue;
    if (!isExec(o.status) || !isProd(o.cod)) continue;
    if (o.inAna) continue;
    ghost43++;
    if (notaHasAnyAna) ghost43SameNotaHasAnaOs++;
    else if (contratoHasAna) ghost43SameContratoHasAna++;
    else ghost43Alone++;

    for (const s of ordens) {
      if (s.osKey === o.osKey) continue;
      const t = s.tipoOs || "(vazio)";
      siblingTipos[t] = (siblingTipos[t] || 0) + 1;
    }

    if (examples.length < 15) {
      const anaSiblings = (anaJunByContrato.get(contrato) || []).map((r) => ({
        cdOs: r.CD_OS,
        tipo: `${r.ID_TIPO_OS} - ${String(r.DS_TIPO_OS).trim()}`,
        valor: r.VALOR_SERVICO,
      }));
      examples.push({
        contrato: row.Contrato,
        ghostOs: o.numeroOs,
        siblingsToa: ordens.map((x) => ({
          os: x.numeroOs,
          tipo: x.tipoOs,
          inAna: x.inAna,
          status: x.status,
          cod: x.cod,
        })),
        anaSiblings,
      });
    }
  }
}

// How many tipo 43 IN analitico june also appear in TOA with siblings
let ana43 = 0;
let ana43withToaSibling1 = 0;
for (const r of ana) {
  if (String(r.DATA_BASE) !== "202606" && r.DATA_BASE !== 202606) continue;
  if (String(r.ID_TIPO_OS) !== "43") continue;
  ana43++;
}

// Date alignment matched
let sameDay = 0,
  diffDay = 0;
const dayDelta = {};
for (const row of toa) {
  const data = parseToaDate(row.Data);
  if (!data || data.y !== 2026 || data.m !== 6) continue;
  for (let i = 1; i <= 10; i++) {
    const os = normOs(row[`Número da O.S ${i}`]);
    if (!os || !anaJunByOs.has(os)) continue;
    const a = anaJunByOs.get(os);
    const dh = String(a.DH_BAIXA || "");
    const m = dh.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (!m) continue;
    const dayA = +m[1];
    const monthA = +m[2];
    if (monthA === data.m && dayA === data.day) sameDay++;
    else {
      diffDay++;
      const delta = dayA - data.day;
      dayDelta[delta] = (dayDelta[delta] || 0) + 1;
    }
  }
}

const out = {
  ghost43,
  ghost43SameNotaHasAnaOs,
  ghost43SameContratoHasAna,
  ghost43Alone,
  siblingTipos: Object.entries(siblingTipos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15),
  ana43,
  dateAlign: { sameDay, diffDay, dayDelta },
  examples,
};

fs.writeFileSync(
  path.join(__dirname, "audit-output", "ghost-tipo43.json"),
  JSON.stringify(out, null, 2),
);
console.log(JSON.stringify({ ...out, examples: out.examples.slice(0, 3) }, null, 2));
