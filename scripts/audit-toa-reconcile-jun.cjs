/**
 * Reconciliação fina: por que TOA junho ~170k vs Analítico 202606 ~70k.
 */
const XLSX = require("xlsx");
const path = require("path");
const fs = require("fs");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const report = require("./audit-output/report.json");

// Reuse price catalog from main script by requiring expand logic inline
const { spawnSync } = require("child_process");

// Load from previous expansion by re-running core quickly
const PATH_TOA = path.join(DESKTOP, "TOA.xlsx");
const PATH_ANALITICO = path.join(
  DESKTOP,
  "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx",
);

const CATALOGO_PATH = path.join(
  __dirname,
  "../src/lib/toa-atividades-catalogo.ts",
);
const catalogoSrc = fs.readFileSync(CATALOGO_PATH, "utf8");
const catalogo = [...catalogoSrc.matchAll(/tipoAtividade:\s*"([^"]+)",\s*valor:\s*([0-9.]+)/g)].map(
  (m) => [m[1], Number(m[2])],
);

function normKey(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}
function extrairCod(raw) {
  const m = String(raw ?? "").trim().match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}
function isProdutivo(cod) {
  if (cod == null) return false;
  if (cod === 571) return false;
  return cod >= 409 && cod < 600;
}
function isExecutada(status) {
  return normKey(status) === "EXECUTADA";
}
function parseToaDate(raw) {
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return { y: d.y, m: d.m, day: d.d };
  }
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  return { y, m: Number(m[2]), day: Number(m[1]) };
}
function money(v) {
  if (typeof v === "number") return v;
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
function normOs(s) {
  return String(s)
    .trim()
    .replace(/\.0$/, "")
    .replace(/\D/g, "");
}

const byFull = new Map();
const byCode = new Map();
for (const [tipo, valor] of catalogo) {
  byFull.set(normKey(tipo), valor);
  const c = extrairCod(tipo);
  if (c != null) byCode.set(c, valor);
}
function lookupPrice(tipoOs) {
  const k = normKey(tipoOs);
  if (byFull.has(k)) return byFull.get(k);
  const code = extrairCod(tipoOs);
  if (code != null && byCode.has(code)) return byCode.get(code);
  return null;
}

const wbToa = XLSX.readFile(PATH_TOA);
const wbAna = XLSX.readFile(PATH_ANALITICO);
const toaRows = XLSX.utils.sheet_to_json(wbToa.Sheets["Page 1"], {
  defval: "",
  raw: true,
});
const anaRows = XLSX.utils.sheet_to_json(wbAna.Sheets["ANALITICO"], {
  defval: "",
  raw: true,
});

const anaByOs = new Map();
const anaJunOs = new Set();
const anaAllOs = new Set();
for (const r of anaRows) {
  const os = normOs(r.CD_OS);
  const db = Number(String(r.DATA_BASE).replace(/\D/g, ""));
  const rec = {
    dataBase: db,
    valor: money(r.VALOR_SERVICO),
    cdBaixa: Number(String(r.CD_BAIXA).match(/\d+/)?.[0] || 0),
    ds: String(r.DS_TIPO_OS || "").trim(),
    id: String(r.ID_TIPO_OS || "").trim(),
    dhBaixa: String(r.DH_BAIXA || ""),
  };
  if (!anaByOs.has(os)) anaByOs.set(os, []);
  anaByOs.get(os).push(rec);
  anaAllOs.add(os);
  if (db === 202606) anaJunOs.add(os);
}

const buckets = {
  inAnaJun: { n: 0, app: 0, ana: 0 },
  inAnaOtherMonth: { n: 0, app: 0, ana: 0, bases: {} },
  notInAna: { n: 0, app: 0 },
  notFaturavel: { n: 0, app: 0 },
  semPreco: { n: 0 },
  precoZero: { n: 0 },
};
const notInAnaByTipo = {};
const notInAnaByCod = {};
const priceGap = { n: 0, sumApp: 0, sumAna: 0 };

const toaJunFat = [];

for (const row of toaRows) {
  const data = parseToaDate(row.Data);
  if (!data || data.y !== 2026 || data.m !== 6) continue;

  for (let i = 1; i <= 10; i++) {
    const numeroOs = String(row[`Número da O.S ${i}`] || "").trim();
    const codBaixaBruto = String(row[`Cód de Baixa ${i}`] || "").trim();
    if (!numeroOs && !codBaixaBruto) continue;
    const cod = extrairCod(codBaixaBruto);
    if (cod == null) continue;
    const status = String(row[`Status da O.S ${i}`] || "").trim();
    const tipoOs = String(row[`Tipo O.S ${i}`] || "").trim();
    const isExec = isExecutada(status);
    const isProd = isProdutivo(cod);
    const preco = lookupPrice(tipoOs);
    const receitaApp = isExec && isProd && preco != null ? preco : 0;

    if (!(isExec && isProd)) {
      buckets.notFaturavel.n++;
      continue;
    }
    if (preco == null) {
      buckets.semPreco.n++;
      continue;
    }
    if (preco === 0) {
      buckets.precoZero.n++;
      // still "faturavel" but zero
    }

    const osKey = normOs(numeroOs);
    const hits = anaByOs.get(osKey) || [];
    const hitJun = hits.find((h) => h.dataBase === 202606);

    if (hitJun) {
      buckets.inAnaJun.n++;
      buckets.inAnaJun.app += receitaApp;
      buckets.inAnaJun.ana += hitJun.valor;
      priceGap.n++;
      priceGap.sumApp += receitaApp;
      priceGap.sumAna += hitJun.valor;
    } else if (hits.length) {
      buckets.inAnaOtherMonth.n++;
      buckets.inAnaOtherMonth.app += receitaApp;
      const v = hits.reduce((s, h) => s + h.valor, 0);
      buckets.inAnaOtherMonth.ana += v;
      for (const h of hits) {
        buckets.inAnaOtherMonth.bases[h.dataBase] =
          (buckets.inAnaOtherMonth.bases[h.dataBase] || 0) + 1;
      }
    } else {
      buckets.notInAna.n++;
      buckets.notInAna.app += receitaApp;
      const t = tipoOs || "(vazio)";
      if (!notInAnaByTipo[t]) notInAnaByTipo[t] = { n: 0, app: 0 };
      notInAnaByTipo[t].n++;
      notInAnaByTipo[t].app += receitaApp;
      notInAnaByCod[cod] = (notInAnaByCod[cod] || 0) + 1;
      if (receitaApp > 0) {
        toaJunFat.push({
          os: numeroOs,
          contrato: String(row.Contrato || ""),
          tipoOs,
          cod,
          status,
          preco: receitaApp,
          data: `${data.day}/${data.m}/${data.y}`,
          tecnico: String(row.técnicos || ""),
        });
      }
    }
  }
}

const topTipos = Object.entries(notInAnaByTipo)
  .map(([tipo, v]) => ({ tipo, ...v, app: +v.app.toFixed(2) }))
  .sort((a, b) => b.app - a.app)
  .slice(0, 20);

// Also: Analítico June value variance for same ID_TIPO_OS
const byId = {};
for (const r of anaRows) {
  const db = Number(String(r.DATA_BASE).replace(/\D/g, ""));
  if (db !== 202606) continue;
  const id = String(r.ID_TIPO_OS);
  const v = money(r.VALOR_SERVICO);
  if (!byId[id]) byId[id] = { ds: String(r.DS_TIPO_OS).trim(), vals: [], cat: lookupPrice(`${id} - ${String(r.DS_TIPO_OS).trim()}`) };
  byId[id].vals.push(v);
}
const variance = Object.entries(byId)
  .map(([id, x]) => {
    const min = Math.min(...x.vals);
    const max = Math.max(...x.vals);
    const avg = x.vals.reduce((a, b) => a + b, 0) / x.vals.length;
    return {
      id,
      ds: x.ds,
      n: x.vals.length,
      min: +min.toFixed(2),
      max: +max.toFixed(2),
      avg: +avg.toFixed(2),
      catalogo: x.cat,
      spread: +(max - min).toFixed(2),
    };
  })
  .filter((x) => x.spread > 1)
  .sort((a, b) => b.n - a.n);

const out = {
  catalogoSize: catalogo.length,
  buckets: {
    inAnaJun: {
      n: buckets.inAnaJun.n,
      app: +buckets.inAnaJun.app.toFixed(2),
      ana: +buckets.inAnaJun.ana.toFixed(2),
      gap: +(buckets.inAnaJun.app - buckets.inAnaJun.ana).toFixed(2),
    },
    inAnaOtherMonth: {
      n: buckets.inAnaOtherMonth.n,
      app: +buckets.inAnaOtherMonth.app.toFixed(2),
      ana: +buckets.inAnaOtherMonth.ana.toFixed(2),
      bases: buckets.inAnaOtherMonth.bases,
    },
    notInAna: {
      n: buckets.notInAna.n,
      app: +buckets.notInAna.app.toFixed(2),
    },
    notFaturavel: buckets.notFaturavel.n,
    semPreco: buckets.semPreco.n,
    precoZero: buckets.precoZero.n,
  },
  totalAppJunFat:
    buckets.inAnaJun.app +
    buckets.inAnaOtherMonth.app +
    buckets.notInAna.app,
  topTiposNotInAna: topTipos,
  notInAnaByCod,
  priceGapMatched: {
    n: priceGap.n,
    sumApp: +priceGap.sumApp.toFixed(2),
    sumAna: +priceGap.sumAna.toFixed(2),
    gap: +(priceGap.sumApp - priceGap.sumAna).toFixed(2),
  },
  valorServicoVariavel: variance.slice(0, 20),
  sampleNotInAna: toaJunFat.slice(0, 25),
};

// Hypothesis: 378127 = média * contagem total?
out.hypothesis378k = {
  mediaJunTimesAllRows: +(179.39888 * 2162).toFixed(2),
  mediaTotalTimesAllRows: +(171.03009 * 2162).toFixed(2),
  sumAllMonths: 369767.06,
  sumAllPlusApprox: +(369767.06 + 8360).toFixed(2),
  mediaJunTimes2108: +(179.39888 * 2108).toFixed(2),
  adesaoAllMonthsFromDin: 195012.16,
};

fs.writeFileSync(
  path.join(__dirname, "audit-output", "reconcile-jun.json"),
  JSON.stringify(out, null, 2),
);
fs.writeFileSync(
  path.join(__dirname, "audit-output", "toa-jun-nao-no-analitico.csv"),
  [
    "os,contrato,tipoOs,cod,status,preco,data,tecnico",
    ...toaJunFat.map(
      (r) =>
        `${r.os},${r.contrato},"${r.tipoOs}",${r.cod},${r.status},${r.preco},${r.data},"${r.tecnico}"`,
    ),
  ].join("\n"),
);

console.log(JSON.stringify(out, null, 2));
console.log("\nnot-in-ana count with receita>0:", toaJunFat.length);
