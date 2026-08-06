const fs = require("fs");
const XLSX = require("xlsx");

const wb = XLSX.readFile(
  "C:/Users/Estrategic PE0454DQ/OneDrive/Desktop/CÓDIGOS_BAIXA_e_Atividades_TOA.xlsx",
);
const cod = XLSX.utils.sheet_to_json(wb.Sheets["Código de baixa"], {
  defval: "",
});
const atv = XLSX.utils.sheet_to_json(wb.Sheets["Atividade TOA"], {
  defval: "",
});

function extractCod(s) {
  const m = String(s).match(/^(\d+)/);
  return m ? Number(m[1]) : null;
}

const byCod = new Map();
for (const row of cod) {
  const codigo = String(row["CÓDIGO"] || "").trim();
  const statusRaw = String(row["STATUS CONTRATO"] || "")
    .trim()
    .toUpperCase();
  const n = extractCod(codigo);
  if (n == null) continue;
  byCod.set(n, statusRaw === "PRODUTIVO" ? "PRODUTIVO" : "IMPRODUTIVO");
}

const atividades = atv
  .map((r) => ({
    tipoAtividade: String(r["ATIVIDADES NO TOA"] || "").trim(),
    tipo: String(r["RESUMO"] || "").trim(),
  }))
  .filter((a) => a.tipoAtividade);

const codLines = [...byCod.entries()]
  .sort((a, b) => a[0] - b[0])
  .map(([c, s]) => `  ${c}: "${s}",`)
  .join("\n");

const codTs = `/**
 * De/para de Cód de Baixa (aba "Código de baixa" da planilha
 * CÓDIGOS_BAIXA_e_Atividades_TOA).
 * Gerado a partir da planilha oficial da empresa.
 */
export type ClassificacaoCodBaixa = "PRODUTIVO" | "IMPRODUTIVO";

export const CLASSIFICACAO_COD_BAIXA: Record<number, ClassificacaoCodBaixa> = {
${codLines}
};
`;

const atvLines = atividades
  .map(
    (a) =>
      `  { tipo: ${JSON.stringify(a.tipo)}, tipoAtividade: ${JSON.stringify(a.tipoAtividade)} },`,
  )
  .join("\n");

const atvTs = `/**
 * Catálogo de atividades TOA (aba "Atividade TOA").
 * Tipo = RESUMO; Tipo de Atividade = ATIVIDADES NO TOA.
 * Valores iniciais em 0 — editáveis no modal de preços.
 */
export type AtividadeToaCatalogo = {
  tipo: string;
  tipoAtividade: string;
};

export const ATIVIDADES_TOA_CATALOGO: AtividadeToaCatalogo[] = [
${atvLines}
];
`;

fs.writeFileSync(
  "C:/Users/Estrategic PE0454DQ/Documents/GitHub/Estrategic-telecom/src/lib/toa-cod-baixa-mapa.ts",
  codTs,
);
fs.writeFileSync(
  "C:/Users/Estrategic PE0454DQ/Documents/GitHub/Estrategic-telecom/src/lib/toa-atividades-catalogo.ts",
  atvTs,
);
console.log("codes", byCod.size, "atividades", atividades.length);
