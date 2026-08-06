/**
 * Passo 1 — Extração e calibração do gabarito Analítico Claro (dez–jun).
 * Uso: node scripts/calibrate-precos-analitico.cjs
 */
const XLSX = require("xlsx");
const fs = require("fs");
const path = require("path");

const DESKTOP = "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop";
const PATH_ANALITICO = path.join(
  DESKTOP,
  "ANALITICO FATURAMENTO ESTRATEGIC - 202606.xlsx",
);
const PATH_ATIV = path.join(DESKTOP, "CÓDIGOS_BAIXA_e_Atividades_TOA.xlsx");
const OUT_DIR = path.join(__dirname, "calibration-output");

const MONTH_SHEETS = [
  { sheet: "Notas e valores de Dezembro", label: "Dezembro", ym: 202512, checksumValor: 1961.94, checksumNotas: 14 },
  { sheet: "Notas e valores de Janeiro", label: "Janeiro", ym: 202601, checksumValor: 45591.6, checksumNotas: 289 },
  { sheet: "Notas e valores de Fevereiro", label: "Fevereiro", ym: 202602, checksumValor: 29540.22, checksumNotas: 184 },
  { sheet: "Notas e valores de Março", label: "Março", ym: 202603, checksumValor: 65150.56, checksumNotas: 386 },
  { sheet: "Notas e valores de Abril", label: "Abril", ym: 202604, checksumValor: 79742.31, checksumNotas: 482 },
  { sheet: "Notas e valores de Maio", label: "Maio", ym: 202605, checksumValor: 77097.27, checksumNotas: 413 },
  { sheet: "Notas e valores de Junho", label: "Junho", ym: 202606, checksumValor: 70683.16, checksumNotas: 394 },
];

/** Regra atual da app: PRODUTIVO = 409–599 exceto 571 */
function isCodBaixaProdutivoApp(cod) {
  if (cod == null || Number.isNaN(cod)) return false;
  if (cod === 571) return false;
  return cod >= 409 && cod < 600;
}

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

function qtde(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const n = Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

function normDs(s) {
  return String(s ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase();
}

function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const wb = XLSX.readFile(PATH_ANALITICO);
  const wbAtiv = XLSX.readFile(PATH_ATIV);

  const ativRows = XLSX.utils.sheet_to_json(wbAtiv.Sheets["Atividade TOA"], {
    defval: "",
    raw: false,
  });
  const codBaixaRows = XLSX.utils.sheet_to_json(
    wbAtiv.Sheets["Código de baixa"],
    { defval: "", raw: false },
  );

  const ativByCode = new Map();
  for (const r of ativRows) {
    const raw = String(r["ATIVIDADES NO TOA"] ?? "").trim();
    const resumo = String(r["RESUMO"] ?? "").trim();
    const m = raw.match(/^(\d+)/);
    if (!m) continue;
    ativByCode.set(Number(m[1]), { tipoAtividade: raw, resumo });
  }

  const statusByCodBaixa = new Map();
  for (const r of codBaixaRows) {
    const raw = String(r["CÓDIGO"] ?? "").trim();
    const m = raw.match(/^(\d+)/);
    if (!m) continue;
    statusByCodBaixa.set(Number(m[1]), {
      bruto: raw,
      motivo: String(r["MOTIVO QUEBRA"] ?? "").trim(),
      statusContrato: String(r["STATUS CONTRATO"] ?? "").trim().toUpperCase(),
    });
  }

  const allRows = [];
  const checksumReport = [];

  for (const month of MONTH_SHEETS) {
    const sheet = wb.Sheets[month.sheet];
    if (!sheet) {
      checksumReport.push({
        ...month,
        ok: false,
        error: "ABA_AUSENTE",
      });
      continue;
    }
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    let soma = 0;
    let somaQtdeMult = 0;
    const contratos = new Set();
    const cdOs = new Set();

    for (const r of rows) {
      const valor = money(r.VALOR_SERVICO);
      const q = qtde(r.QTDE);
      const idTipo = Number(String(r.ID_TIPO_OS).match(/\d+/)?.[0] || NaN);
      const cdBaixa = Number(String(r.CD_BAIXA).match(/\d+/)?.[0] || NaN);
      const rec = {
        mes: month.label,
        ym: month.ym,
        nrContrato: String(r.NR_CONTRATO ?? "").trim(),
        cdOs: String(r.CD_OS ?? "").trim(),
        idTipoOs: idTipo,
        dsTipoOs: String(r.DS_TIPO_OS ?? "").trim(),
        cdBaixa,
        qtde: q,
        valorServico: valor,
        valorXQtde: round2(valor * q),
        tipoOsConsolid: String(r.TIPO_OS_CONSOLID ?? "").trim(),
        dhBaixa: String(r.DH_BAIXA ?? ""),
        dataBase: String(r.DATA_BASE ?? ""),
      };
      allRows.push(rec);
      soma += valor;
      somaQtdeMult += valor * q;
      if (rec.nrContrato) contratos.add(rec.nrContrato);
      if (rec.cdOs) cdOs.add(rec.cdOs);
    }

    const somaR = round2(soma);
    const delta = round2(somaR - month.checksumValor);
    checksumReport.push({
      mes: month.label,
      ym: month.ym,
      linhas: rows.length,
      checksumNotas: month.checksumNotas,
      matchNotas: rows.length === month.checksumNotas,
      somaValorServico: somaR,
      checksumValor: month.checksumValor,
      deltaValor: delta,
      matchValor: Math.abs(delta) < 0.02,
      somaSeMultQtde: round2(somaQtdeMult),
      contratosUnicos: contratos.size,
      cdOsUnicos: cdOs.size,
    });
  }

  // ---- CD_BAIXA ----
  const baixaDist = {};
  const baixaImprodutivaComReceita = [];
  for (const r of allRows) {
    const k = String(r.cdBaixa);
    if (!baixaDist[k]) baixaDist[k] = { n: 0, valor: 0 };
    baixaDist[k].n += 1;
    baixaDist[k].valor += r.valorServico;

    if (!isCodBaixaProdutivoApp(r.cdBaixa) && r.valorServico !== 0) {
      baixaImprodutivaComReceita.push({
        mes: r.mes,
        cdOs: r.cdOs,
        cdBaixa: r.cdBaixa,
        mapaStatus: statusByCodBaixa.get(r.cdBaixa)?.statusContrato || "?",
        idTipoOs: r.idTipoOs,
        dsTipoOs: r.dsTipoOs,
        valor: r.valorServico,
      });
    }
  }

  // ---- QTDE ----
  const qtdeDist = {};
  let qtdeGt1 = 0;
  for (const r of allRows) {
    const q = r.qtde || 1;
    qtdeDist[q] = (qtdeDist[q] || 0) + 1;
    if (q > 1) qtdeGt1++;
  }

  // ---- Por tipo de O.S. (histórico completo) ----
  const byTipo = new Map();
  for (const r of allRows) {
    const id = r.idTipoOs;
    if (!Number.isFinite(id)) continue;
    if (!byTipo.has(id)) {
      byTipo.set(id, {
        idTipoOs: id,
        dsTipoOs: r.dsTipoOs,
        n: 0,
        sum: 0,
        valores: [],
        meses: {},
        cdBaixaSet: new Set(),
      });
    }
    const t = byTipo.get(id);
    t.n += 1;
    t.sum += r.valorServico;
    t.valores.push(round2(r.valorServico));
    t.meses[r.mes] = (t.meses[r.mes] || 0) + 1;
    if (Number.isFinite(r.cdBaixa)) t.cdBaixaSet.add(r.cdBaixa);
    // keep most common ds
    if (r.dsTipoOs && r.dsTipoOs.length > (t.dsTipoOs || "").length) {
      t.dsTipoOs = r.dsTipoOs;
    }
  }

  const tipoStats = [...byTipo.values()]
    .map((t) => {
      const vals = t.valores.slice().sort((a, b) => a - b);
      const uniq = [...new Set(vals)];
      const min = vals[0];
      const max = vals[vals.length - 1];
      const media = round2(t.sum / t.n);
      const mediana =
        vals.length % 2 === 1
          ? vals[(vals.length - 1) / 2]
          : round2((vals[vals.length / 2 - 1] + vals[vals.length / 2]) / 2);
      // moda
      const freq = {};
      for (const v of vals) freq[v] = (freq[v] || 0) + 1;
      const moda = Number(
        Object.entries(freq).sort((a, b) => b[1] - a[1] || Number(b[0]) - Number(a[0]))[0][0],
      );
      const ativ = ativByCode.get(t.idTipoOs);
      const stable = max - min < 0.02;
      return {
        idTipoOs: t.idTipoOs,
        dsTipoOs: t.dsTipoOs.replace(/^\s+/, ""),
        tipoAtividadeToa: ativ?.tipoAtividade || `${t.idTipoOs} - ${t.dsTipoOs.replace(/^\s+/, "")}`,
        resumoToa: ativ?.resumo || null,
        noMapaAtividadeToa: Boolean(ativ),
        n: t.n,
        media,
        mediana,
        moda,
        min,
        max,
        spread: round2(max - min),
        stable,
        valoresDistintos: uniq.length,
        amostraValores: uniq.slice(0, 12),
        meses: t.meses,
        cdBaixas: [...t.cdBaixaSet].sort((a, b) => a - b),
        /** Preço recomendado para projeção: média histórica (quando variável) ou valor fixo */
        precoRecomendado: stable ? moda : media,
        precoEstrategia: stable ? "fixo" : "media_historica",
      };
    })
    .sort((a, b) => b.n - a.n || a.idTipoOs - b.idTipoOs);

  // Tipos no mapa TOA sem pagamento no Analítico
  const pagosIds = new Set(tipoStats.map((t) => t.idTipoOs));
  const mapaSemPagamento = [...ativByCode.entries()]
    .filter(([id]) => !pagosIds.has(id))
    .map(([id, v]) => ({
      idTipoOs: id,
      tipoAtividade: v.tipoAtividade,
      resumo: v.resumo,
      precoRecomendado: 0,
      observacao: "Presente no DE/PARA TOA, nunca pago no Analítico dez–jun",
    }));

  // Valor negativo / zero
  const negativos = allRows.filter((r) => r.valorServico < 0);
  const zeros = allRows.filter((r) => r.valorServico === 0);

  // Contratos com múltiplas O.S. pagas no mesmo mês
  const multiOsPorContratoMes = {};
  const byCtMes = new Map();
  for (const r of allRows) {
    const k = `${r.ym}|${r.nrContrato}`;
    if (!byCtMes.has(k)) byCtMes.set(k, []);
    byCtMes.get(k).push(r);
  }
  let contratosMultiOs = 0;
  const exemplosMulti = [];
  for (const [k, list] of byCtMes) {
    if (list.length > 1) {
      contratosMultiOs++;
      if (exemplosMulti.length < 8) {
        exemplosMulti.push({
          chave: k,
          n: list.length,
          tipos: list.map((x) => `${x.idTipoOs}:${x.valorServico}`),
          total: round2(list.reduce((s, x) => s + x.valorServico, 0)),
        });
      }
    }
  }
  multiOsPorContratoMes.contratosComMaisDeUmaOs = contratosMultiOs;
  multiOsPorContratoMes.exemplos = exemplosMulti;

  // Co-ocorrência: tipo 43 pago junto com tipo 1 no mesmo contrato+mês?
  let ct43com1 = 0;
  let ct43sozinho = 0;
  for (const [, list] of byCtMes) {
    const ids = new Set(list.map((x) => x.idTipoOs));
    if (ids.has(43) && ids.has(1)) ct43com1++;
    else if (ids.has(43)) ct43sozinho++;
  }

  const checksumOk = checksumReport.every((c) => c.matchNotas && c.matchValor);
  const totalValor = round2(allRows.reduce((s, r) => s + r.valorServico, 0));
  const totalChecksum = round2(
    MONTH_SHEETS.reduce((s, m) => s + m.checksumValor, 0),
  );

  const catalogoProposto = [
    ...tipoStats.map((t) => ({
      idTipoOs: t.idTipoOs,
      tipo: t.resumoToa || "SEM RESUMO",
      tipoAtividade: t.tipoAtividadeToa,
      valor: t.precoRecomendado,
      fonte: t.precoEstrategia,
      nHistorico: t.n,
      min: t.min,
      max: t.max,
      media: t.media,
      moda: t.moda,
    })),
    ...mapaSemPagamento.map((t) => ({
      idTipoOs: t.idTipoOs,
      tipo: t.resumo,
      tipoAtividade: t.tipoAtividade,
      valor: 0,
      fonte: "nunca_pago",
      nHistorico: 0,
      min: 0,
      max: 0,
      media: 0,
      moda: 0,
    })),
  ].sort((a, b) => a.idTipoOs - b.idTipoOs);

  // Simulação: se usarmos só média/fixo por tipo, quão perto chegamos dos checksums?
  const precoPorId = new Map(
    tipoStats.map((t) => [t.idTipoOs, t.precoRecomendado]),
  );
  const simPorMes = [];
  for (const month of MONTH_SHEETS) {
    const rows = allRows.filter((r) => r.ym === month.ym);
    let proj = 0;
    for (const r of rows) {
      proj += precoPorId.get(r.idTipoOs) ?? 0;
    }
    proj = round2(proj);
    simPorMes.push({
      mes: month.label,
      real: month.checksumValor,
      projetadoComMediaModa: proj,
      delta: round2(proj - month.checksumValor),
      erroPct: round2(
        (Math.abs(proj - month.checksumValor) / month.checksumValor) * 100,
      ),
    });
  }

  const report = {
    generatedAt: new Date().toISOString(),
    files: { PATH_ANALITICO, PATH_ATIV },
    checksumOk,
    totalLinhas: allRows.length,
    totalValor,
    totalChecksum,
    deltaTotal: round2(totalValor - totalChecksum),
    checksumReport,
    regrasDescobertas: {
      qtde: {
        dist: qtdeDist,
        qtdeGt1,
        conclusao:
          qtdeGt1 === 0
            ? "QTDE sempre 1 — VALOR_SERVICO já é o valor final da linha; não multiplicar."
            : "Há QTDE>1 — avaliar se VALOR_SERVICO é unitário.",
      },
      cdBaixa: {
        dist: Object.fromEntries(
          Object.entries(baixaDist).map(([k, v]) => [
            k,
            { n: v.n, valor: round2(v.valor) },
          ]),
        ),
        improdutivosAppComReceita: baixaImprodutivaComReceita.length,
        amostraImprodutivos: baixaImprodutivaComReceita.slice(0, 20),
        conclusao:
          baixaImprodutivaComReceita.length === 0
            ? "Nenhum CD_BAIXA fora da regra PRODUTIVO (409–599≠571) gerou receita no Analítico."
            : "Há códigos fora da regra atual com receita — revisar regra de produtividade.",
      },
      tipo43vs1: {
        contratosMesCom43e1: ct43com1,
        contratosMesCom43Sozinho: ct43sozinho,
        conclusao:
          ct43com1 === 0
            ? "No Analítico, tipo 43 nunca coexiste com tipo 1 no mesmo contrato+mês (Claro não paga os dois)."
            : "Há co-ocorrência 1+43 no Analítico — revisar hipótese de bundling.",
      },
      multiOs: multiOsPorContratoMes,
      valoresNegativos: {
        n: negativos.length,
        soma: round2(negativos.reduce((s, r) => s + r.valorServico, 0)),
        amostra: negativos.slice(0, 10),
      },
      valoresZero: { n: zeros.length },
    },
    topTiposPorVolume: tipoStats.slice(0, 25).map((t) => ({
      id: t.idTipoOs,
      ds: t.dsTipoOs,
      n: t.n,
      media: t.media,
      moda: t.moda,
      min: t.min,
      max: t.max,
      spread: t.spread,
      estrategia: t.precoEstrategia,
      preco: t.precoRecomendado,
      noMapaToa: t.noMapaAtividadeToa,
    })),
    tiposVariaveis: tipoStats
      .filter((t) => !t.stable)
      .map((t) => ({
        id: t.idTipoOs,
        ds: t.dsTipoOs,
        n: t.n,
        min: t.min,
        max: t.max,
        media: t.media,
        moda: t.moda,
        amostra: t.amostraValores,
      })),
    mapaSemPagamento: mapaSemPagamento.slice(0, 40),
    simPrecisaoCatalogo: simPorMes,
    erroMedioAbsPct: round2(
      simPorMes.reduce((s, m) => s + m.erroPct, 0) / simPorMes.length,
    ),
  };

  fs.writeFileSync(
    path.join(OUT_DIR, "calibration-report.json"),
    JSON.stringify(report, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "catalogo-proposto.json"),
    JSON.stringify(catalogoProposto, null, 2),
  );
  fs.writeFileSync(
    path.join(OUT_DIR, "tipo-stats.json"),
    JSON.stringify(tipoStats, null, 2),
  );

  // CSV preços
  const csv = [
    "idTipoOs,tipoAtividade,resumo,n,media,moda,min,max,precoRecomendado,estrategia,noMapaToa",
    ...tipoStats.map(
      (t) =>
        `${t.idTipoOs},"${t.tipoAtividadeToa}","${t.resumoToa || ""}",${t.n},${t.media},${t.moda},${t.min},${t.max},${t.precoRecomendado},${t.precoEstrategia},${t.noMapaAtividadeToa}`,
    ),
  ].join("\n");
  fs.writeFileSync(path.join(OUT_DIR, "precos-calibrados.csv"), csv);

  console.log("\n========== CHECKSUMS ==========");
  for (const c of checksumReport) {
    console.log(
      `${c.mes}: linhas ${c.linhas}/${c.checksumNotas} ${c.matchNotas ? "OK" : "FAIL"} | valor ${c.somaValorServico} vs ${c.checksumValor} Δ=${c.deltaValor} ${c.matchValor ? "OK" : "FAIL"}`,
    );
  }
  console.log(
    `\nTOTAL ${totalValor} vs checksum ${totalChecksum} Δ=${report.deltaTotal} | checksumOk=${checksumOk}`,
  );
  console.log("\n========== REGRAS ==========");
  console.log(report.regrasDescobertas.qtde.conclusao);
  console.log(report.regrasDescobertas.cdBaixa.conclusao);
  console.log(report.regrasDescobertas.tipo43vs1.conclusao);
  console.log(
    "CD_BAIXA dist:",
    JSON.stringify(report.regrasDescobertas.cdBaixa.dist),
  );
  console.log(
    "Improdutivos app c/ receita:",
    report.regrasDescobertas.cdBaixa.improdutivosAppComReceita,
  );
  console.log(
    "Negativos:",
    report.regrasDescobertas.valoresNegativos.n,
    "soma",
    report.regrasDescobertas.valoresNegativos.soma,
  );
  console.log(
    "Tipos variáveis (spread>0):",
    report.tiposVariaveis.length,
  );
  console.log(
    "Simulação catálogo média/moda — erro médio abs %:",
    report.erroMedioAbsPct,
  );
  for (const s of simPorMes) {
    console.log(
      `  ${s.mes}: real ${s.real} proj ${s.projetadoComMediaModa} Δ ${s.delta} (${s.erroPct}%)`,
    );
  }
  console.log("\nTop 10 tipos:");
  for (const t of report.topTiposPorVolume.slice(0, 10)) {
    console.log(
      `  ${t.id} n=${t.n} media=${t.media} moda=${t.moda} [${t.min}-${t.max}] → ${t.preco} (${t.estrategia})`,
    );
  }
  console.log("\nSaída:", OUT_DIR);
}

main();
