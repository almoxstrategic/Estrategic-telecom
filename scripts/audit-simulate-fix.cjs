const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const catSrc = fs.readFileSync(
  path.join(__dirname, "../src/lib/toa-atividades-catalogo.ts"),
  "utf8",
);
const cat = [
  ...catSrc.matchAll(/tipoAtividade:\s*"([^"]+)",\s*valor:\s*([0-9.]+)/g),
].map((m) => [m[1], Number(m[2])]);
const byCode = new Map();
for (const [t, v] of cat) {
  const c = (t.match(/^(\d+)/) || [])[1];
  if (c) byCode.set(c, v);
}
function price(tipo) {
  const c = (String(tipo).match(/^(\d+)/) || [])[1];
  return c && byCode.has(c) ? byCode.get(c) : 0;
}
function prod(c) {
  return c != null && c !== 571 && c >= 409 && c < 600;
}
function exec(s) {
  return String(s).trim().toUpperCase() === "EXECUTADA";
}
function parseYm(raw) {
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    return d ? d.y * 100 + d.m : null;
  }
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (!m) return null;
  let y = +m[3];
  if (y < 100) y += 2000;
  return y * 100 + +m[2];
}

const medias = {
  1: 217.3,
  43: 217.16,
  12: 186.45,
  191: 184.52,
  156: 63.4,
  188: 96.38,
  83: 116.27,
  44: 172.76,
};
function priceFix(tipo) {
  const c = +(String(tipo).match(/^(\d+)/) || [])[1];
  if (medias[c] != null) return medias[c];
  return price(tipo);
}

const toa = XLSX.utils.sheet_to_json(
  XLSX.readFile(path.join(DESKTOP, "TOA.xlsx")).Sheets["Page 1"],
  { defval: "", raw: true },
);

let junRaw = 0,
  junNoDup = 0,
  junNoDupMedia = 0,
  julRaw = 0,
  julNoDup = 0,
  julNoDupMedia = 0;

for (const row of toa) {
  const ym = parseYm(row.Data);
  if (ym !== 202606 && ym !== 202607) continue;
  const ordens = [];
  for (let i = 1; i <= 10; i++) {
    const n = String(row[`Número da O.S ${i}`] || "").trim();
    const cb = String(row[`Cód de Baixa ${i}`] || "").trim();
    if (!n && !cb) continue;
    const cod = +((cb.match(/^(\d+)/) || [])[1] || 0);
    if (!cod) continue;
    ordens.push({
      tipo: String(row[`Tipo O.S ${i}`] || "").trim(),
      cod,
      status: String(row[`Status da O.S ${i}`] || "").trim(),
    });
  }
  const has1 = ordens.some(
    (o) => o.tipo.startsWith("1 ") && exec(o.status) && prod(o.cod),
  );
  for (const o of ordens) {
    if (!(exec(o.status) && prod(o.cod))) continue;
    const is43with1 = has1 && o.tipo.startsWith("43 ");
    const p = price(o.tipo);
    const pm = priceFix(o.tipo);
    if (ym === 202606) {
      junRaw += p;
      if (!is43with1) {
        junNoDup += p;
        junNoDupMedia += pm;
      }
    } else {
      julRaw += p;
      if (!is43with1) {
        julNoDup += p;
        julNoDupMedia += pm;
      }
    }
  }
}

const out = {
  junRaw: +junRaw.toFixed(2),
  junNoDup: +junNoDup.toFixed(2),
  junNoDupMedia: +junNoDupMedia.toFixed(2),
  julRaw: +julRaw.toFixed(2),
  julNoDup: +julNoDup.toFixed(2),
  julNoDupMedia: +julNoDupMedia.toFixed(2),
  anaJun: 70683.16,
  gapAposFixJun: +(junNoDupMedia - 70683.16).toFixed(2),
};
console.log(JSON.stringify(out, null, 2));
fs.writeFileSync(
  path.join(__dirname, "audit-output", "simulate-fix.json"),
  JSON.stringify(out, null, 2),
);
