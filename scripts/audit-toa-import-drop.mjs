import * as XLSX from "xlsx";
import fs from "fs";

function trimCell(v) {
  return String(v ?? "").trim();
}
function normalizeHeader(h) {
  return String(h ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ");
}
function normalizeMatricula(v) {
  return trimCell(v).toUpperCase();
}
function normalizeNumeroWo(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, "");
}
function normalizeTipoOs(v) {
  return String(v ?? "")
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}
function isStatusAtividadeContabilizavel(status) {
  const s = normalizeTipoOs(status);
  if (!s) return true;
  return s !== "CANCELADO" && s !== "SUSPENSO";
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
function isStatusExecutada(status) {
  return normalizeTipoOs(status) === "EXECUTADA";
}
function isCodBaixaProdutivo(c) {
  if (c === 571) return false;
  return c >= 409 && c < 600;
}
function extrairNumeroCodBaixa(s) {
  const m = String(s ?? "")
    .trim()
    .match(/^(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

/** Replica rowsFromMatrix: last duplicate header wins */
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

function pick(row, ...aliases) {
  for (const alias of aliases) {
    if (Object.prototype.hasOwnProperty.call(row, alias)) {
      const v = trimCell(row[alias]);
      if (v) return v;
    }
  }
  const wanted = new Set(aliases.map(normalizeHeader));
  for (const [k, v] of Object.entries(row)) {
    if (!wanted.has(normalizeHeader(k))) continue;
    const t = trimCell(v);
    if (t) return t;
  }
  return "";
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
const dupes = new Map();
headers.forEach((h, i) => {
  if (!h) return;
  if (!dupes.has(h)) dupes.set(h, []);
  dupes.get(h).push(i);
});
console.log(
  "Duplicate headers:",
  [...dupes.entries()].filter(([, idxs]) => idxs.length > 1),
);

const rows = rowsFromMatrix(matrix);
const wosWanted = new Set([
  "03230|739647607",
  "03230|739678847",
  "03230|739688441",
  "03230|739687114",
  "03230|739699245",
]);

let parsedOk = 0;
let droppedNoKeys = 0;
let droppedStatus = 0;
const jonathan = [];
const wantedTrace = [];

for (const row of rows) {
  const data = parseToaData(pick(row, "Data"));
  const login = normalizeMatricula(
    pick(row, "Login do Técnico", "ID do Recurso", "Id do Recurso"),
  );
  const numeroWo = normalizeNumeroWo(
    pick(row, "Número da WO", "Numero da WO", "Número WO"),
  );
  const statusAtividade = pick(
    row,
    "Status da Atividade",
    "Status Atividade",
    "status da atividade",
  );
  const ordens = [];
  for (let indice = 1; indice <= 10; indice += 1) {
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
    const status = pick(
      row,
      `Status da O.S ${indice}`,
      `Status da OS ${indice}`,
      `Status O.S ${indice}`,
      `Status OS ${indice}`,
    );
    const tipoOs = pick(
      row,
      `Tipo O.S ${indice}`,
      `Tipo OS ${indice}`,
      `Tipo O.S. ${indice}`,
    );
    const cod = extrairNumeroCodBaixa(codBaixaBruto) ?? 0;
    ordens.push({
      indice,
      numeroOs,
      codBaixaBruto,
      status,
      tipoOs,
      isExecutada: isStatusExecutada(status),
      isProdutiva: cod > 0 && isCodBaixaProdutivo(cod),
    });
  }

  const isWanted = wosWanted.has(numeroWo) || login === "Z674225";

  if (!data || !login || !numeroWo || ordens.length === 0) {
    if (isWanted) {
      wantedTrace.push({
        why: "missing keys / no OS",
        data,
        login,
        numeroWo,
        os: ordens.length,
        statusAtividade,
        rawData: row["Data"],
        rawWo: row["Número da WO"],
      });
    }
    droppedNoKeys += 1;
    continue;
  }
  if (!isStatusAtividadeContabilizavel(statusAtividade)) {
    if (isWanted) {
      wantedTrace.push({
        why: "status atividade filter",
        statusAtividade,
        numeroWo,
        data,
      });
    }
    droppedStatus += 1;
    continue;
  }

  parsedOk += 1;
  if (login === "Z674225") {
    const prod = ordens.some((o) => o.isExecutada && o.isProdutiva);
    jonathan.push({
      numeroWo,
      data,
      statusAtividade,
      prod,
      firstOs: ordens[0],
    });
  }
  if (wosWanted.has(numeroWo)) {
    wantedTrace.push({
      why: "KEPT",
      numeroWo,
      data,
      login,
      statusAtividade,
      firstOs: ordens[0],
      prod: ordens.some((o) => o.isExecutada && o.isProdutiva),
    });
  }
}

console.log({
  totalRows: rows.length,
  parsedOk,
  droppedNoKeys,
  droppedStatus,
  jonathanCount: jonathan.length,
  jonathanProd: jonathan.filter((j) => j.prod).length,
  jonathanImprod: jonathan.filter((j) => !j.prod).length,
});
console.log("wantedTrace:", JSON.stringify(wantedTrace, null, 2));
console.log(
  "jonathan by date:",
  jonathan.map((j) => `${j.data} ${j.numeroWo} prod=${j.prod}`),
);

// Check pick() for Número da O.S headers vs actual
const osHeaders = headers.filter((h) => /n[uú]mero da o\.?s/i.test(h));
console.log("OS number headers in sheet:", osHeaders);
