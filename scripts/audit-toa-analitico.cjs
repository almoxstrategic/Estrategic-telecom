/**
 * Auditoria TOA × Analítico Claro — faturamento junho/julho.
 * Uso: node scripts/audit-toa-analitico.cjs
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const PATH_TOA = path.join(DESKTOP, "TOA.xlsx");
const PATH_ANALITICO = path.join(
  DESKTOP,
  "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx",
);
const PATH_ATIV = path.join(DESKTOP, "CÓDIGOS_BAIXA_e_Atividades_TOA.xlsx");
const OUT_DIR = path.join(__dirname, "audit-output");

// Catálogo espelhado da app (toa-atividades-catalogo.ts)
const CATALOGO = [
  ["24 - MUDANCA DE PACOTE", 98.81],
  ["43 - ADESAO - INSTALAR PONTO VIRTUA", 414.61],
  ["156 - INSTALACAO WIFI MESH", 105.38],
  ["12 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA", 269.89],
  ["48 - VISITA TECNICA - VIRTUA", 0],
  ["1 - ADESAO - INSTALACAO DE ASSINATURA", 279.06],
  ["516 - ADESAO ENTREGA STREAMING", 38.56],
  ["161 - VISITA TECNICA STREAMING", 0],
  ["261 - VISTORIA DE CASOS ESPECIAIS EPO", 0],
  ["31 - REFAZER INSTALACAO", 218.48],
  ["69 - RETORNO DE CREDENCIADA", 0],
  ["44 - INSTALAR PONTO VIRTUA", 199.33],
  ["158 - VISITA TECNICA WIFI MESH", 0],
  ["50 - VISITA TECNICA - VOIP", 0],
  ["57 - MUDANCA DE PACOTE DIGITAL", 98.81],
  ["15 - MUDANCA DE LOCAL DE PONTO", 167.07],
  ["211 - MANUTENCAO RETORNO COP", 0],
  ["33 - REINSTALACAO - ASSINATURA", 115.67],
  ["512 - REINSTALACAO ENTREGA STREAMING", 0],
  ["129 - MANUTENCAO REPARO NO DROP", 0],
  ["188 - MANUTENCAO PREVENTIVA INDOOR I", 128.51],
  ["32 - DESCONEXAO I C/ RETIRADA DE EQUIPAMENTO", 0],
  ["510 - BASE ENTREGA STREAMING", 0],
  ["87 - RETIRAR EMTA", 0],
  ["79 - DESCONEXAO OPCAO C/ RETIRADA DE EQUIPAMENTO", 0],
  ["5 - RETIRAR EQUIPAMENTO", 0],
  ["173 - RETIRADA WIFI MESH", 0],
  ["305 - SUBS CONTROLE REMOTO STREAMING", 0],
  ["303 - SUBSTITUICAO DE CONTROLE REMOTO", 0],
  ["86 - RETIRAR DIGITAL", 0],
  ["513 - RETIRADA ENTREGA STREAMING", 0],
  ["514 - MUDANCA DE ENDERECO ENTREGA STREAMING", 0],
  ["515 - MUDANCA DE LOCAL DE PONTO ENTREGA STREAMING", 0],
  ["2 - ADESAO - INSTALACAO DE ASSINATURA DIGITAL", 279.06],
  ["3 - ADESAO - INSTALACAO DE ASSINATURA VOIP", 279.06],
  ["4 - ADESAO - INSTALACAO DE ASSINATURA DIGITAL + VOIP", 279.06],
  ["6 - RETIRAR DIGITAL E EQUIPAMENTO", 0],
  ["7 - RETIRAR DIGITAL E EQUIPAMENTO VOIP", 0],
  ["8 - RETIRAR DIGITAL E EQUIPAMENTO DIGITAL + VOIP", 0],
  ["9 - RETIRAR DIGITAL E EQUIPAMENTO DIGITAL + VOIP + EMTA", 0],
  ["10 - RETIRAR DIGITAL E EQUIPAMENTO DIGITAL + EMTA", 0],
  ["11 - RETIRAR DIGITAL E EQUIPAMENTO VOIP + EMTA", 0],
  ["13 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA DIGITAL", 269.89],
  ["14 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA VOIP", 269.89],
  ["16 - MUDANCA DE LOCAL DE PONTO DIGITAL", 167.07],
  ["17 - MUDANCA DE LOCAL DE PONTO VOIP", 167.07],
  ["18 - MUDANCA DE LOCAL DE PONTO DIGITAL + VOIP", 167.07],
  ["19 - MUDANCA DE LOCAL DE PONTO DIGITAL + EMTA", 167.07],
  ["20 - MUDANCA DE LOCAL DE PONTO VOIP + EMTA", 167.07],
  ["21 - MUDANCA DE LOCAL DE PONTO DIGITAL + VOIP + EMTA", 167.07],
  ["22 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA DIGITAL + VOIP", 269.89],
  ["25 - MUDANCA DE PACOTE DIGITAL + VOIP", 98.81],
  ["26 - MUDANCA DE PACOTE VOIP", 98.81],
  ["27 - MUDANCA DE PACOTE DIGITAL + EMTA", 98.81],
  ["28 - MUDANCA DE PACOTE VOIP + EMTA", 98.81],
  ["29 - MUDANCA DE PACOTE DIGITAL + VOIP + EMTA", 98.81],
  ["30 - MUDANCA DE PACOTE DIGITAL + VOIP + EMTA + WIFI", 98.81],
  ["34 - REINSTALACAO - ASSINATURA DIGITAL", 115.67],
  ["35 - REINSTALACAO - ASSINATURA VOIP", 115.67],
  ["36 - REINSTALACAO - ASSINATURA DIGITAL + VOIP", 115.67],
  ["45 - INSTALAR PONTO VIRTUA DIGITAL", 199.33],
  ["46 - INSTALAR PONTO VIRTUA VOIP", 199.33],
  ["47 - INSTALAR PONTO VIRTUA DIGITAL + VOIP", 199.33],
  ["49 - VISITA TECNICA - DIGITAL", 0],
];

function normKey(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function parseMoney(v) {
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

function parseQtde(v) {
  if (typeof v === "number") return v;
  const s = String(v ?? "").replace(",", ".").trim();
  return Number(s) || 0;
}

function parseToaDate(raw) {
  // "01/06/26" or Excel serial
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return { y: d.y, m: d.m, day: d.d, iso: `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` };
  }
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return null;
  let y = Number(m[3]);
  if (y < 100) y += 2000;
  const month = Number(m[2]);
  const day = Number(m[1]);
  return { y, m: month, day, iso: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
}

function parseAnaliticoDate(raw) {
  if (typeof raw === "number") {
    const d = XLSX.SSF.parse_date_code(raw);
    if (!d) return null;
    return { y: d.y, m: d.m, day: d.d, iso: `${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` };
  }
  const s = String(raw ?? "").trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const y = Number(m[3]);
  return { y, m: month, day, iso: `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}` };
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

function billingCycleFromDate(d) {
  // Hipótese dia 21→20: se day >= 21 → ciclo próximo mês; senão ciclo mês atual
  if (!d) return null;
  let y = d.y;
  let m = d.m;
  if (d.day >= 21) {
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return y * 100 + m;
}

function ymKey(y, m) {
  return y * 100 + m;
}

function brl(n) {
  return Number(n || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function buildPriceMap() {
  const byFull = new Map();
  const byCode = new Map();
  for (const [tipo, valor] of CATALOGO) {
    byFull.set(normKey(tipo), valor);
    const code = extrairCod(tipo);
    if (code != null) byCode.set(code, valor);
  }
  return { byFull, byCode };
}

function lookupPrice(tipoOs, priceMap) {
  const k = normKey(tipoOs);
  if (priceMap.byFull.has(k)) return priceMap.byFull.get(k);
  // try match by leading code
  const code = extrairCod(tipoOs);
  if (code != null && priceMap.byCode.has(code)) return priceMap.byCode.get(code);
  // try partial: strip accents already in normKey
  for (const [key, val] of priceMap.byFull) {
    if (k.includes(key) || key.includes(k)) return val;
  }
  return null;
}

function expandToaOs(rows) {
  const out = [];
  for (const row of rows) {
    const data = parseToaDate(row["Data"]);
    const contrato = String(row["Contrato"] ?? "").trim();
    const wo = String(row["Número da WO"] ?? "").trim();
    const tecnico = String(row["técnicos"] ?? row["Concluiu Atividade"] ?? "").trim();
    const statusAtiv = String(row["Status da Atividade"] ?? "").trim();

    for (let i = 1; i <= 10; i++) {
      const numeroOs = String(row[`Número da O.S ${i}`] ?? "").trim();
      const codBaixaBruto = String(row[`Cód de Baixa ${i}`] ?? "").trim();
      if (!numeroOs && !codBaixaBruto) continue;
      const cod = extrairCod(codBaixaBruto);
      if (cod == null) continue;
      const status = String(row[`Status da O.S ${i}`] ?? "").trim();
      const tipoOs = String(row[`Tipo O.S ${i}`] ?? row["Tipo de O.S"] ?? "").trim();
      out.push({
        data,
        ym: data ? ymKey(data.y, data.m) : null,
        ciclo21: data ? billingCycleFromDate(data) : null,
        contrato,
        wo,
        tecnico,
        statusAtiv,
        slot: i,
        numeroOs,
        cod,
        codBaixaBruto,
        status,
        tipoOs,
        isExec: isExecutada(status),
        isProd: isProdutivo(cod),
      });
    }
  }
  return out;
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const priceMap = buildPriceMap();

  console.log("Carregando planilhas...");
  const wbToa = XLSX.readFile(PATH_TOA);
  const wbAna = XLSX.readFile(PATH_ANALITICO);
  const wbAtiv = XLSX.readFile(PATH_ATIV);

  const toaRows = XLSX.utils.sheet_to_json(wbToa.Sheets["Page 1"], {
    defval: "",
    raw: true,
  });
  const anaRows = XLSX.utils.sheet_to_json(wbAna.Sheets["ANALITICO"], {
    defval: "",
    raw: true,
  });
  const ativRows = XLSX.utils.sheet_to_json(wbAtiv.Sheets["Atividade TOA"], {
    defval: "",
    raw: false,
  });
  const codBaixaMap = XLSX.utils.sheet_to_json(wbAtiv.Sheets["Código de baixa"], {
    defval: "",
    raw: false,
  });

  console.log(`TOA notas: ${toaRows.length}`);
  console.log(`Analítico linhas: ${anaRows.length}`);
  console.log(`Atividades mapa: ${ativRows.length}`);
  console.log(`Cód baixa mapa: ${codBaixaMap.length}`);

  const toaOs = expandToaOs(toaRows);
  console.log(`TOA O.S. expandido: ${toaOs.length}`);

  // Enrich TOA with our price
  for (const os of toaOs) {
    const preco = lookupPrice(os.tipoOs, priceMap);
    os.precoApp = preco;
    os.receitaApp =
      os.isExec && os.isProd && preco != null ? preco : 0;
    os.classApp =
      os.isExec && os.isProd
        ? "PRODUTIVO_FATURAVEL"
        : os.isProd
          ? "PRODUTIVO_NAO_EXEC"
          : "IMPRODUTIVO";
  }

  // Normalize analitico
  const ana = anaRows.map((r, idx) => {
    const dataBase = Number(String(r.DATA_BASE).replace(/\D/g, "")) || 0;
    const dhBaixa = parseAnaliticoDate(r.DH_BAIXA);
    const dhInstal = parseAnaliticoDate(r.DH_INSTAL);
    const valor = parseMoney(r.VALOR_SERVICO);
    const qtde = parseQtde(r.QTDE) || 1;
    return {
      idx,
      dataBase,
      nrContrato: String(r.NR_CONTRATO ?? "").trim(),
      cdOs: String(r.CD_OS ?? "").trim(),
      idTipoOs: String(r.ID_TIPO_OS ?? "").trim(),
      dsTipoOs: String(r.DS_TIPO_OS ?? "").trim(),
      cdBaixa: Number(String(r.CD_BAIXA).match(/\d+/)?.[0] || NaN),
      dhBaixa,
      dhInstal,
      qtde,
      valorUnit: valor,
      valorTotal: valor * (qtde || 1), // test both
      valorAsIs: valor, // assume VALOR_SERVICO already final
      prestadora: String(r.DS_PRESTADORA_SERVICO ?? "").trim(),
    };
  });

  // ---- Passo 1: chave de cruzamento ----
  const joinStats = {
    byContrato: 0,
    byCdOs: 0,
    byBoth: 0,
    anaOnlyContrato: 0,
    anaOnlyOs: 0,
  };

  const toaByContrato = new Map();
  const toaByOs = new Map();
  for (const os of toaOs) {
    if (os.contrato) {
      if (!toaByContrato.has(os.contrato)) toaByContrato.set(os.contrato, []);
      toaByContrato.get(os.contrato).push(os);
    }
    if (os.numeroOs) {
      if (!toaByOs.has(os.numeroOs)) toaByOs.set(os.numeroOs, []);
      toaByOs.get(os.numeroOs).push(os);
    }
  }

  let matchOs = 0;
  let matchContratoOnly = 0;
  let noMatch = 0;
  for (const a of ana) {
    const byOs = a.cdOs && toaByOs.has(a.cdOs);
    const byC = a.nrContrato && toaByContrato.has(a.nrContrato);
    if (byOs) matchOs++;
    else if (byC) matchContratoOnly++;
    else noMatch++;
  }
  joinStats.byCdOs = matchOs;
  joinStats.byContratoOnly = matchContratoOnly;
  joinStats.noMatch = noMatch;
  joinStats.matchRateOs = ((matchOs / ana.length) * 100).toFixed(1) + "%";

  // Reverse: TOA OS in analitico?
  let toaInAna = 0;
  let toaNotInAna = 0;
  const anaByOs = new Map();
  const anaByContrato = new Map();
  for (const a of ana) {
    if (a.cdOs) {
      if (!anaByOs.has(a.cdOs)) anaByOs.set(a.cdOs, []);
      anaByOs.get(a.cdOs).push(a);
    }
    if (a.nrContrato) {
      if (!anaByContrato.has(a.nrContrato)) anaByContrato.set(a.nrContrato, []);
      anaByContrato.get(a.nrContrato).push(a);
    }
  }
  for (const os of toaOs) {
    if (os.numeroOs && anaByOs.has(os.numeroOs)) toaInAna++;
    else toaNotInAna++;
  }

  // ---- Passo 2: ciclo / DATA_BASE ----
  const byDataBase = {};
  const byDhBaixaMonth = {};
  const byDhBaixaCiclo21 = {};
  for (const a of ana) {
    byDataBase[a.dataBase] = (byDataBase[a.dataBase] || 0) + a.valorAsIs;
    if (a.dhBaixa) {
      const ym = ymKey(a.dhBaixa.y, a.dhBaixa.m);
      byDhBaixaMonth[ym] = (byDhBaixaMonth[ym] || 0) + a.valorAsIs;
      const c = billingCycleFromDate(a.dhBaixa);
      byDhBaixaCiclo21[c] = (byDhBaixaCiclo21[c] || 0) + a.valorAsIs;
    }
  }

  // Compare DATA_BASE vs calendar month of DH_BAIXA
  const mismatchDate = { sameMonth: 0, prevMonth: 0, nextMonth: 0, other: 0, noDh: 0 };
  const dayOfBaixaHist = {};
  for (const a of ana) {
    if (!a.dhBaixa) {
      mismatchDate.noDh++;
      continue;
    }
    dayOfBaixaHist[a.dhBaixa.day] = (dayOfBaixaHist[a.dhBaixa.day] || 0) + 1;
    const ymBaixa = ymKey(a.dhBaixa.y, a.dhBaixa.m);
    if (ymBaixa === a.dataBase) mismatchDate.sameMonth++;
    else if (ymBaixa === a.dataBase - 1 || (a.dataBase % 100 === 1 && ymBaixa === (Math.floor(a.dataBase / 100) - 1) * 100 + 12))
      mismatchDate.prevMonth++;
    else if (ymBaixa < a.dataBase) mismatchDate.prevMonth++;
    else if (ymBaixa > a.dataBase) mismatchDate.nextMonth++;
    else mismatchDate.other++;
  }

  // How often ciclo 21-20 matches DATA_BASE
  let cicloMatch = 0;
  let cicloMismatch = 0;
  for (const a of ana) {
    if (!a.dhBaixa) continue;
    const c = billingCycleFromDate(a.dhBaixa);
    if (c === a.dataBase) cicloMatch++;
    else cicloMismatch++;
  }

  // TOA receita by calendar month vs ciclo 21
  function sumToaReceita(predicate) {
    let n = 0;
    let fat = 0;
    let perda = 0;
    let semPreco = 0;
    for (const os of toaOs) {
      if (!predicate(os)) continue;
      n++;
      if (os.receitaApp > 0) fat += os.receitaApp;
      else if (os.isProd === false && os.precoApp != null) perda += os.precoApp;
      if (os.isExec && os.isProd && os.precoApp == null) semPreco++;
    }
    return { n, fat, perda, semPreco };
  }

  const toaJunCal = sumToaReceita((os) => os.ym === 202606);
  const toaJulCal = sumToaReceita((os) => os.ym === 202607);
  const toaJunCiclo = sumToaReceita((os) => os.ciclo21 === 202606);
  const toaJulCiclo = sumToaReceita((os) => os.ciclo21 === 202607);

  // Analítico by DATA_BASE
  function sumAna(db) {
    let n = 0;
    let v = 0;
    let vQtde = 0;
    for (const a of ana) {
      if (a.dataBase !== db) continue;
      n++;
      v += a.valorAsIs;
      vQtde += a.valorUnit * (a.qtde || 1);
    }
    return { n, v, vQtde };
  }
  const anaJun = sumAna(202606);
  const anaJul = sumAna(202607);
  const anaAll = {
    n: ana.length,
    v: ana.reduce((s, a) => s + a.valorAsIs, 0),
    bases: [...new Set(ana.map((a) => a.dataBase))].sort(),
  };

  // QTDE analysis
  const qtdeDist = {};
  let qtdeGt1 = 0;
  let extraFromQtde = 0;
  for (const a of ana) {
    const q = a.qtde || 1;
    qtdeDist[q] = (qtdeDist[q] || 0) + 1;
    if (q > 1) {
      qtdeGt1++;
      extraFromQtde += a.valorUnit * (q - 1);
    }
  }

  // ---- Passo 3: Falsos negativos / positivos ----
  // App rule: calendar month filter on TOA Data
  // For June FN: in Analítico DATA_BASE=202606 with valor>0, but our TOA rule would NOT count receita
  // For July FP: our TOA calendar July counts receita, but not in Analítico 202607 (or zero)

  function findMatch(a) {
    if (a.cdOs && toaByOs.has(a.cdOs)) return toaByOs.get(a.cdOs);
    if (a.nrContrato && toaByContrato.has(a.nrContrato)) return toaByContrato.get(a.nrContrato);
    return [];
  }

  const falsosNegJun = [];
  for (const a of ana) {
    if (a.dataBase !== 202606 || a.valorAsIs <= 0) continue;
    const matches = findMatch(a);
    if (matches.length === 0) {
      falsosNegJun.push({
        motivo: "NAO_NO_TOA",
        nrContrato: a.nrContrato,
        cdOs: a.cdOs,
        dsTipoOs: a.dsTipoOs.trim(),
        cdBaixa: a.cdBaixa,
        valor: a.valorAsIs,
        qtde: a.qtde,
        dhBaixa: a.dhBaixa?.iso || "",
        dataBase: a.dataBase,
      });
      continue;
    }
    // Prefer OS-level match
    const osMatch =
      matches.find((m) => m.numeroOs === a.cdOs) || matches[0];
    const wouldCount = osMatch.isExec && osMatch.isProd && (osMatch.precoApp || 0) > 0;
    // Also check if filtered out by month: TOA date not in June calendar
    const inJunCal = osMatch.ym === 202606;
    if (!wouldCount || !inJunCal) {
      falsosNegJun.push({
        motivo: !matches.length
          ? "NAO_NO_TOA"
          : !inJunCal
            ? `FORA_MES_TOA_${osMatch.ym}`
            : !osMatch.isExec
              ? `STATUS_${osMatch.status || "VAZIO"}`
              : !osMatch.isProd
                ? `COD_IMPROD_${osMatch.cod}`
                : osMatch.precoApp == null
                  ? "SEM_PRECO_CATALOGO"
                  : osMatch.precoApp === 0
                    ? "PRECO_ZERO"
                    : "OUTRO",
        nrContrato: a.nrContrato,
        cdOs: a.cdOs,
        dsTipoOs: a.dsTipoOs.trim(),
        cdBaixa: a.cdBaixa,
        valor: a.valorAsIs,
        qtde: a.qtde,
        dhBaixa: a.dhBaixa?.iso || "",
        dataBase: a.dataBase,
        toaData: osMatch.data?.iso || "",
        toaStatus: osMatch.status,
        toaCod: osMatch.cod,
        toaTipo: osMatch.tipoOs,
        toaPreco: osMatch.precoApp,
        toaYm: osMatch.ym,
      });
    }
  }

  // Falsos positivos July: TOA calendar July with receitaApp > 0, not paid in analitico 202607
  const falsosPosJul = [];
  const anaJunOs = new Set(
    ana.filter((a) => a.dataBase === 202606).map((a) => a.cdOs),
  );
  const anaJulOs = new Set(
    ana.filter((a) => a.dataBase === 202607).map((a) => a.cdOs),
  );
  const anaAllOs = new Set(ana.map((a) => a.cdOs));
  const anaAllContrato = new Set(ana.map((a) => a.nrContrato));

  for (const os of toaOs) {
    if (os.ym !== 202607 || os.receitaApp <= 0) continue;
    const inAnaJul = anaJulOs.has(os.numeroOs);
    const inAnaAny = anaAllOs.has(os.numeroOs) || anaAllContrato.has(os.contrato);
    const inAnaJun = anaJunOs.has(os.numeroOs);
    if (!inAnaJul) {
      const anaHits = anaByOs.get(os.numeroOs) || [];
      const bases = [...new Set(anaHits.map((a) => a.dataBase))];
      const valorAna = anaHits.reduce((s, a) => s + a.valorAsIs, 0);
      falsosPosJul.push({
        motivo: !inAnaAny
          ? "AUSENTE_ANALITICO"
          : inAnaJun
            ? "FATURADO_EM_JUNHO_DATA_BASE"
            : bases.length
              ? `FATURADO_EM_${bases.join("_")}`
              : "VALOR_ZERO_OU_OUTRO",
        contrato: os.contrato,
        numeroOs: os.numeroOs,
        tipoOs: os.tipoOs,
        cod: os.cod,
        status: os.status,
        receitaApp: os.receitaApp,
        toaData: os.data?.iso || "",
        basesAna: bases.join(","),
        valorAna,
      });
    }
  }

  // Motivo breakdowns
  function countBy(arr, key) {
    const m = {};
    for (const x of arr) {
      const k = x[key] || "?";
      m[k] = (m[k] || 0) + 1;
    }
    return m;
  }
  function sumBy(arr, key, valKey) {
    const m = {};
    for (const x of arr) {
      const k = x[key] || "?";
      m[k] = (m[k] || 0) + (x[valKey] || 0);
    }
    return m;
  }

  // ---- Passo 4: preço vs VALOR_SERVICO ----
  const priceCompare = [];
  let priceMatch = 0;
  let priceDiff = 0;
  let priceMissing = 0;
  for (const a of ana) {
    if (a.dataBase !== 202606 && a.dataBase !== 202607) continue;
    // Build tipo from ID + DS like TOA
    const tipoLike = `${a.idTipoOs} - ${a.dsTipoOs.trim()}`.replace(/\s+/g, " ");
    const preco = lookupPrice(tipoLike, priceMap) ?? lookupPrice(a.dsTipoOs, priceMap);
    const delta = preco == null ? null : Math.abs(preco - a.valorAsIs);
    if (preco == null) {
      priceMissing++;
    } else if (delta < 0.02) {
      priceMatch++;
    } else if (Math.abs(preco - a.valorUnit / (a.qtde || 1)) < 0.02) {
      priceMatch++;
    } else {
      priceDiff++;
      if (priceCompare.length < 40) {
        priceCompare.push({
          cdOs: a.cdOs,
          tipo: tipoLike,
          catalogo: preco,
          valorServico: a.valorAsIs,
          qtde: a.qtde,
          delta: +(preco - a.valorAsIs).toFixed(2),
          dataBase: a.dataBase,
        });
      }
    }
  }

  // Average VALOR_SERVICO by ID_TIPO_OS in June
  const avgByTipo = {};
  for (const a of ana) {
    if (a.dataBase !== 202606) continue;
    const id = a.idTipoOs;
    if (!avgByTipo[id]) avgByTipo[id] = { n: 0, sum: 0, ds: a.dsTipoOs.trim(), valores: new Set() };
    avgByTipo[id].n++;
    avgByTipo[id].sum += a.valorAsIs;
    avgByTipo[id].valores.add(+a.valorAsIs.toFixed(2));
  }
  const avgTipoList = Object.entries(avgByTipo)
    .map(([id, v]) => ({
      id,
      ds: v.ds,
      n: v.n,
      media: +(v.sum / v.n).toFixed(2),
      distintos: [...v.valores].sort((a, b) => a - b).slice(0, 8),
      catalogo: lookupPrice(`${id} - ${v.ds}`, priceMap),
    }))
    .sort((a, b) => b.n - a.n);

  // Reconcile: matched OS June — app vs ana value
  let matchedJunApp = 0;
  let matchedJunAna = 0;
  let matchedJunCount = 0;
  for (const a of ana) {
    if (a.dataBase !== 202606) continue;
    const hits = toaByOs.get(a.cdOs) || [];
    if (!hits.length) continue;
    const os = hits[0];
    matchedJunCount++;
    matchedJunAna += a.valorAsIs;
    matchedJunApp += os.receitaApp || 0;
  }

  // User reported numbers
  const reported = {
    anaJun: 378127.49,
    appJun: 180165.76,
    anaJul: 98000.0,
    appJul: 250529.23,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    files: { PATH_TOA, PATH_ANALITICO, PATH_ATIV },
    counts: {
      toaNotas: toaRows.length,
      toaOs: toaOs.length,
      anaLinhas: ana.length,
      anaDataBases: anaAll.bases,
    },
    join: {
      ...joinStats,
      toaOsInAna: toaInAna,
      toaOsNotInAna: toaNotInAna,
      toaOsInAnaPct: ((toaInAna / toaOs.length) * 100).toFixed(1) + "%",
    },
    reported,
    analitico: {
      byDataBase: Object.fromEntries(
        Object.entries(byDataBase).map(([k, v]) => [k, +v.toFixed(2)]),
      ),
      byDhBaixaMonth: Object.fromEntries(
        Object.entries(byDhBaixaMonth).map(([k, v]) => [k, +v.toFixed(2)]),
      ),
      byDhBaixaCiclo21: Object.fromEntries(
        Object.entries(byDhBaixaCiclo21).map(([k, v]) => [k, +v.toFixed(2)]),
      ),
      jun: anaJun,
      jul: anaJul,
      all: { n: anaAll.n, v: +anaAll.v.toFixed(2) },
      dateAlignment: mismatchDate,
      ciclo21vsDataBase: { cicloMatch, cicloMismatch, matchPct: ((cicloMatch / (cicloMatch + cicloMismatch || 1)) * 100).toFixed(1) + "%" },
      dayOfBaixaHist,
    },
    toaApp: {
      junCalendario: toaJunCal,
      julCalendario: toaJulCal,
      junCiclo21: toaJunCiclo,
      julCiclo21: toaJulCiclo,
    },
    qtde: { dist: qtdeDist, qtdeGt1, extraFromQtde: +extraFromQtde.toFixed(2) },
    priceAudit: {
      priceMatch,
      priceDiff,
      priceMissing,
      sampleDiffs: priceCompare,
      topTiposJun: avgTipoList.slice(0, 25),
    },
    matchedJun: {
      count: matchedJunCount,
      ana: +matchedJunAna.toFixed(2),
      app: +matchedJunApp.toFixed(2),
      gap: +(matchedJunAna - matchedJunApp).toFixed(2),
    },
    falsosNegativosJunho: {
      count: falsosNegJun.length,
      valorTotal: +falsosNegJun.reduce((s, x) => s + x.valor, 0).toFixed(2),
      porMotivoCount: countBy(falsosNegJun, "motivo"),
      porMotivoValor: Object.fromEntries(
        Object.entries(sumBy(falsosNegJun, "motivo", "valor")).map(([k, v]) => [
          k,
          +v.toFixed(2),
        ]),
      ),
      amostra: falsosNegJun.slice(0, 30),
    },
    falsosPositivosJulho: {
      count: falsosPosJul.length,
      valorApp: +falsosPosJul.reduce((s, x) => s + x.receitaApp, 0).toFixed(2),
      porMotivoCount: countBy(falsosPosJul, "motivo"),
      porMotivoValor: Object.fromEntries(
        Object.entries(sumBy(falsosPosJul, "motivo", "receitaApp")).map(
          ([k, v]) => [k, +v.toFixed(2)],
        ),
      ),
      amostra: falsosPosJul.slice(0, 30),
    },
  };

  // Write outputs
  fs.writeFileSync(
    path.join(OUT_DIR, "report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "falsos-negativos-junho.json"),
    JSON.stringify(falsosNegJun, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "falsos-positivos-julho.json"),
    JSON.stringify(falsosPosJul, null, 2),
  );

  // CSV summaries
  function toCsv(rows, cols) {
    const esc = (v) => {
      const s = String(v ?? "");
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
  }
  fs.writeFileSync(
    path.join(OUT_DIR, "falsos-negativos-junho.csv"),
    toCsv(falsosNegJun, [
      "motivo",
      "nrContrato",
      "cdOs",
      "dsTipoOs",
      "cdBaixa",
      "valor",
      "qtde",
      "dhBaixa",
      "toaData",
      "toaStatus",
      "toaCod",
      "toaTipo",
      "toaPreco",
      "toaYm",
    ]),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "falsos-positivos-julho.csv"),
    toCsv(falsosPosJul, [
      "motivo",
      "contrato",
      "numeroOs",
      "tipoOs",
      "cod",
      "status",
      "receitaApp",
      "toaData",
      "basesAna",
      "valorAna",
    ]),
  );

  // Console summary
  console.log("\n========== RESUMO AUDITORIA ==========");
  console.log("Join CD_OS match:", joinStats.matchRateOs, `(${matchOs}/${ana.length})`);
  console.log("TOA OS presentes no Analítico:", ((toaInAna / toaOs.length) * 100).toFixed(1) + "%");
  console.log("\nDATA_BASE totais:", report.analitico.byDataBase);
  console.log("DH_BAIXA mês calendário:", report.analitico.byDhBaixaMonth);
  console.log("DH_BAIXA ciclo 21-20:", report.analitico.byDhBaixaCiclo21);
  console.log("Alinhamento DATA_BASE vs DH_BAIXA mês:", mismatchDate);
  console.log("Ciclo 21-20 == DATA_BASE?", report.analitico.ciclo21vsDataBase);
  console.log("\n--- Comparação usuário ---");
  console.log(`Ana Jun reportado: ${brl(reported.anaJun)} | Ana DATA_BASE 202606: ${brl(anaJun.v)} | Ana*QTDE: ${brl(anaJun.vQtde)}`);
  console.log(`App Jun reportado: ${brl(reported.appJun)} | TOA cal jun: ${brl(toaJunCal.fat)} | TOA ciclo jun: ${brl(toaJunCiclo.fat)}`);
  console.log(`Ana jul reportado: ${brl(reported.anaJul)} | Ana DATA_BASE 202607: ${brl(anaJul.v)}`);
  console.log(`App jul reportado: ${brl(reported.appJul)} | TOA cal jul: ${brl(toaJulCal.fat)} | TOA ciclo jul: ${brl(toaJulCiclo.fat)}`);
  console.log("\nQTDE > 1:", qtdeGt1, "extra se multiplicar:", brl(extraFromQtde));
  console.log("\nFalsos Neg Jun:", falsosNegJun.length, brl(report.falsosNegativosJunho.valorTotal));
  console.log("  motivos:", report.falsosNegativosJunho.porMotivoValor);
  console.log("Falsos Pos Jul:", falsosPosJul.length, brl(report.falsosPositivosJulho.valorApp));
  console.log("  motivos:", report.falsosPositivosJulho.porMotivoValor);
  console.log("\nPreço catálogo vs VALOR_SERVICO: match", priceMatch, "diff", priceDiff, "missing", priceMissing);
  console.log("Matched OS jun ana vs app:", brl(matchedJunAna), "vs", brl(matchedJunApp));
  console.log("\nArquivos em", OUT_DIR);
}

main();
