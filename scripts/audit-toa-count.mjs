/**
 * Auditoria TOA — espelha parseToaFile + processarChamadosTOA (código atual).
 */
import XLSX from "xlsx";

const PATH = process.argv[2] || "c:/Users/Estrategic PE0454DQ/OneDrive/Desktop/TOA.xlsx";

function trimCell(value) {
  return String(value ?? "")
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
function normalizeNumeroWo(v) {
  return String(v ?? "").trim().replace(/\s+/g, "");
}
function normalizeMatricula(v) {
  return trimCell(v).toUpperCase();
}
/** Espelho de spreadsheet-import.parseToaData */
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
function extrairNumeroCodBaixa(codBaixaBruto) {
  const match = String(codBaixaBruto ?? "").trim().match(/^(\d+)/);
  if (!match) return null;
  const cod = Number.parseInt(match[1], 10);
  return Number.isFinite(cod) ? cod : null;
}
function rowsFromMatrix(matrix) {
  if (matrix.length < 2) return [];
  const headers = matrix[0].map((h) => trimCell(h));
  return matrix.slice(1).map((cells) => {
    const row = {};
    headers.forEach((h, i) => {
      if (!h) return;
      row[h] = trimCell(cells[i]);
    });
    return row;
  });
}
function monthKey(iso) {
  return iso && iso.length >= 7 ? iso.slice(0, 7) : "??";
}
function extractOsSlots(row) {
  const ordens = [];
  for (let indice = 1; indice <= 10; indice++) {
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
    if (!numeroOs && !codBaixaBruto) continue;
    ordens.push({
      indice,
      numeroOs,
      codBaixaBruto,
      status: pick(row, `Status da O.S ${indice}`, `Status da OS ${indice}`),
      tipoOs: pick(row, `Tipo O.S ${indice}`, `Tipo OS ${indice}`),
    });
  }
  return ordens;
}

const wb = XLSX.readFile(PATH, { type: "file" });
const sheet = wb.Sheets["Page 1"];
const matrix = XLSX.utils.sheet_to_json(sheet, {
  header: 1,
  defval: "",
  raw: false,
  dateNF: "dd/mm/yyyy",
});
const rawRows = rowsFromMatrix(matrix);
console.log("Linhas Page 1:", rawRows.length);

const statusAtiv = new Map();
for (const row of rawRows) {
  const s = pick(row, "Status da Atividade") || "(vazio)";
  statusAtiv.set(s, (statusAtiv.get(s) || 0) + 1);
}
console.log("Status da Atividade:", Object.fromEntries(statusAtiv));

// Excel methodology: unique WO by month (any row with WO+parseable date)
const excel = new Map();
for (const row of rawRows) {
  const data = parseToaData(pick(row, "Data"));
  const wo = normalizeNumeroWo(pick(row, "Número da WO", "Numero da WO", "Número WO"));
  const mk = monthKey(data);
  if (!excel.has(mk)) {
    excel.set(mk, {
      brutas: 0,
      unique: new Set(),
      uniqueComOsSlot: new Set(),
      uniqueConcluido: new Set(),
      uniqueComCodBaixa: new Set(),
    });
  }
  const b = excel.get(mk);
  b.brutas += 1;
  if (!wo) continue;
  b.unique.add(wo);
  const slots = extractOsSlots(row);
  if (slots.length > 0) b.uniqueComOsSlot.add(wo);
  const status = (pick(row, "Status da Atividade") || "").toLowerCase();
  if (status === "concluído" || status === "concluido") b.uniqueConcluido.add(wo);
  if (slots.some((o) => extrairNumeroCodBaixa(o.codBaixaBruto) !== null)) {
    b.uniqueComCodBaixa.add(wo);
  }
}

console.log("\n=== EXCEL por mês ===");
for (const mk of [...excel.keys()].sort()) {
  const b = excel.get(mk);
  console.log(
    `${mk}: brutas=${b.brutas} unicas=${b.unique.size} unicasComSlotOS=${b.uniqueComOsSlot.size} unicasComCodBaixa=${b.uniqueComCodBaixa.size} unicasConcluido=${b.uniqueConcluido.size}`,
  );
}

// Pipeline app
const drops = {
  noData: 0,
  noLogin: 0,
  noWo: 0,
  noOsSlots: 0,
  noCodBaixa: 0,
  okBeforeDedupe: 0,
};
const dropNoOsByMonth = new Map();
const dropNoCodByMonth = new Map();
const dropNoOsByStatus = new Map();
const dropNoLoginByMonth = new Map();
const parsed = [];

for (const row of rawRows) {
  const data = parseToaData(pick(row, "Data"));
  const login = normalizeMatricula(pick(row, "Login do Técnico"));
  const wo = normalizeNumeroWo(pick(row, "Número da WO", "Numero da WO", "Número WO"));
  const statusAtividade = pick(row, "Status da Atividade");
  const slots = extractOsSlots(row);
  const mk = monthKey(data);

  if (!data) {
    drops.noData++;
    continue;
  }
  if (!login) {
    drops.noLogin++;
    dropNoLoginByMonth.set(mk, (dropNoLoginByMonth.get(mk) || 0) + 1);
    continue;
  }
  if (!wo) {
    drops.noWo++;
    continue;
  }
  if (slots.length === 0) {
    drops.noOsSlots++;
    dropNoOsByMonth.set(mk, (dropNoOsByMonth.get(mk) || 0) + 1);
    const st = statusAtividade || "(vazio)";
    dropNoOsByStatus.set(st, (dropNoOsByStatus.get(st) || 0) + 1);
    continue;
  }

  const ordens = [];
  for (const ordem of slots) {
    if (!ordem.numeroOs && !ordem.codBaixaBruto) continue;
    const cod = extrairNumeroCodBaixa(ordem.codBaixaBruto);
    if (cod === null) continue;
    ordens.push({ ...ordem, codBaixa: cod });
  }
  if (ordens.length === 0) {
    drops.noCodBaixa++;
    dropNoCodByMonth.set(mk, (dropNoCodByMonth.get(mk) || 0) + 1);
    continue;
  }

  drops.okBeforeDedupe++;
  parsed.push({ data, login, numeroWo: wo, contrato: pick(row, "Contrato"), statusAtividade, ordens, mk });
}

// Dedupe: last wins (global, like processarChamadosTOA)
const byWo = new Map();
for (const c of parsed) byWo.set(c.numeroWo, c);
const deduped = [...byWo.values()];

console.log("\n=== FILTROS APP ===");
console.log(drops);
console.log("após dedupe global por WO:", deduped.length);
console.log("duplicatas removidas:", drops.okBeforeDedupe - deduped.length);
console.log("drop sem O.S. por status:", Object.fromEntries(dropNoOsByStatus));
console.log("drop sem login por mês:", Object.fromEntries([...dropNoLoginByMonth].sort()));
console.log("drop sem O.S. por mês:", Object.fromEntries([...dropNoOsByMonth].sort()));
console.log("drop sem Cód Baixa numérico por mês:", Object.fromEntries([...dropNoCodByMonth].sort()));

// App counts BY MONTH of the surviving WO's date (after global dedupe)
const appMonth = new Map();
for (const c of deduped) {
  if (!appMonth.has(c.mk)) appMonth.set(c.mk, new Set());
  appMonth.get(c.mk).add(c.numeroWo);
}

// Alternative: dedupe within month only (if bug counted rows not deduped)
const appNoDedupeMonth = new Map();
for (const c of parsed) {
  if (!appNoDedupeMonth.has(c.mk)) appNoDedupeMonth.set(c.mk, 0);
  appNoDedupeMonth.set(c.mk, appNoDedupeMonth.get(c.mk) + 1);
}
const appDedupePerMonth = new Map();
for (const c of parsed) {
  if (!appDedupePerMonth.has(c.mk)) appDedupePerMonth.set(c.mk, new Set());
  appDedupePerMonth.get(c.mk).add(c.numeroWo);
}

console.log("\n=== COMPARAÇÃO (alvo usuário: Jun 561, jul 740, ago 84) ===");
console.log(
  "mês | excelUnicas | excelUnicasComCod | appDedupeGlobal | appDedupeNoMes | appSemDedupe(linhas)",
);
for (const mk of [...new Set([...excel.keys(), ...appMonth.keys()])].sort()) {
  if (mk === "??") continue;
  const e = excel.get(mk);
  console.log(
    `${mk} | ${e?.unique.size ?? 0} | ${e?.uniqueComCodBaixa.size ?? 0} | ${appMonth.get(mk)?.size ?? 0} | ${appDedupePerMonth.get(mk)?.size ?? 0} | ${appNoDedupeMonth.get(mk) ?? 0}`,
  );
}

// Cross-month WO collision: same WO appears in multiple months in Excel
const woMonths = new Map();
for (const row of rawRows) {
  const data = parseToaData(pick(row, "Data"));
  const wo = normalizeNumeroWo(pick(row, "Número da WO", "Numero da WO", "Número WO"));
  if (!wo || !data) continue;
  const mk = monthKey(data);
  if (!woMonths.has(wo)) woMonths.set(wo, new Set());
  woMonths.get(wo).add(mk);
}
const multiMonth = [...woMonths.entries()].filter(([, s]) => s.size > 1);
console.log("\nWOs que aparecem em mais de um mês:", multiMonth.length);
if (multiMonth.length) {
  console.log("exemplos:", multiMonth.slice(0, 8).map(([w, s]) => `${w}=>${[...s].join(",")}`));
}

// July: reconcile 740 vs 703
for (const mk of ["2026-06", "2026-07", "2026-08"]) {
  const excelSet = excel.get(mk)?.unique ?? new Set();
  const appSet = appDedupePerMonth.get(mk) ?? new Set();
  const missing = [...excelSet].filter((w) => !appSet.has(w));
  const extra = [...appSet].filter((w) => !excelSet.has(w));
  console.log(`\n${mk}: missing=${missing.length} extra=${extra.length}`);

  const why = { noLogin: 0, noOs: 0, noCod: 0, status: new Map(), sample: [] };
  for (const wo of missing) {
    const rows = rawRows.filter(
      (r) =>
        normalizeNumeroWo(pick(r, "Número da WO", "Numero da WO")) === wo &&
        monthKey(parseToaData(pick(r, "Data"))) === mk,
    );
    let classified = false;
    for (const row of rows) {
      const login = normalizeMatricula(pick(row, "Login do Técnico"));
      const slots = extractOsSlots(row);
      const st = pick(row, "Status da Atividade") || "(vazio)";
      if (!login) {
        why.noLogin++;
        classified = true;
        break;
      }
      if (slots.length === 0) {
        why.noOs++;
        why.status.set(st, (why.status.get(st) || 0) + 1);
        if (why.sample.length < 5) {
          why.sample.push({ wo, st, login, data: pick(row, "Data") });
        }
        classified = true;
        break;
      }
      if (!slots.some((o) => extrairNumeroCodBaixa(o.codBaixaBruto) !== null)) {
        why.noCod++;
        classified = true;
        break;
      }
    }
    if (!classified) why.noOs++; // fallback
  }
  console.log("  missing reasons:", {
    noLogin: why.noLogin,
    noOs: why.noOs,
    noCod: why.noCod,
    byStatus: Object.fromEntries(why.status),
    sample: why.sample,
  });
}

// Match user numbers: which definition equals 561, 740, 84?
const targets = { "2026-06": 561, "2026-07": 740, "2026-08": 84 };
console.log("\n=== QUAL DEFINIÇÃO BATE COM A APP DO USUÁRIO? ===");
for (const [mk, target] of Object.entries(targets)) {
  const candidates = {
    excelUnicas: excel.get(mk)?.unique.size,
    excelComSlot: excel.get(mk)?.uniqueComOsSlot.size,
    excelComCod: excel.get(mk)?.uniqueComCodBaixa.size,
    excelConcluido: excel.get(mk)?.uniqueConcluido.size,
    appDedupeGlobal: appMonth.get(mk)?.size,
    appDedupeMes: appDedupePerMonth.get(mk)?.size,
    appLinhas: appNoDedupeMonth.get(mk),
  };
  console.log(mk, "target", target, candidates);
}
