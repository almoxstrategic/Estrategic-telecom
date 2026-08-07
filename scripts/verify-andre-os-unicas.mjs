/**
 * André / 170349593: notas por WO + O.S. únicas por número.
 */
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
function normTipo(v) {
  return trim(v)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
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
function isProd(ordem) {
  return ordem.exec && ordem.cod > 0 && isCodProd(ordem.cod);
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

const aparicoes = [];
for (const r of andre) {
  const wo = nwo(pick(r, "Número da WO"));
  for (let i = 1; i <= 10; i++) {
    const n = pick(r, `Número da O.S ${i}`);
    const cBruto = pick(r, `Cód de Baixa ${i}`);
    const s = pick(r, `Status da O.S ${i}`);
    if (!n && !cBruto) continue;
    const cod = codNum(cBruto) ?? 0;
    aparicoes.push({
      wo,
      n,
      cBruto,
      s,
      cod,
      exec: isExec(s),
      prod: isExec(s) && cod > 0 && isCodProd(cod),
    });
  }
}

const notas = new Map();
for (const a of aparicoes) {
  if (!notas.has(a.wo)) notas.set(a.wo, []);
  notas.get(a.wo).push(a);
}

console.log("=== Por WO (visita) ===");
for (const [wo, list] of notas) {
  const prod = list.filter((x) => x.prod).length;
  console.log({
    wo,
    statusNota: prod > 0 ? "Produtiva" : "Improdutiva",
    slots: list.map((x) => `${x.n} → ${x.s} / ${x.cBruto}`),
  });
}

// Dedupe O.S. por número: prevalece produtiva
const unicas = new Map();
for (const a of aparicoes) {
  const prev = unicas.get(a.n);
  if (!prev || (a.prod && !prev.prod) || (a.prod === prev.prod && a.wo > prev.wo)) {
    unicas.set(a.n, a);
  }
}

console.log("\n=== O.S. únicas (por Nº) — prevalece produtiva ===");
for (const [n, a] of unicas) {
  console.log({
    numeroOs: n,
    resultado: a.prod ? "Produtiva" : "Improdutiva",
    veioDaWO: a.wo,
    baixa: a.cBruto,
    status: a.s,
  });
}

const u = [...unicas.values()];
console.log("\nResumo KPI desejado pelo usuário: 2 WO, 2 O.S., 1 prod + 1 improd");
console.log("Resumo com regra (O.S. única + prevalece prod):", {
  notas: notas.size,
  notasProd: [...notas.values()].filter((l) => l.some((x) => x.prod)).length,
  notasImprod: [...notas.values()].filter((l) => !l.some((x) => x.prod)).length,
  osUnicas: u.length,
  osProd: u.filter((x) => x.prod).length,
  osImprod: u.filter((x) => !x.prod).length,
});
console.log(
  "Obs: neste arquivo as DUAS O.S. na 2ª WO estão Executada/409 — por isso O.S. únicas ficam 2 produtivas, não 1+1.",
);
