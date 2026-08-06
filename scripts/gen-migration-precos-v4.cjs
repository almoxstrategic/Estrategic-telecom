/**
 * Gera migration SQL a partir do catálogo calibrado.
 * Uso: node scripts/gen-migration-precos-v4.cjs
 */
const fs = require("fs");
const path = require("path");

const cat = require("./calibration-output/catalogo-proposto.json");
const RESUMO = {
  52: "ADESÃO",
  55: "MUDANÇA DE ENDEREÇO",
  95: "ADESÃO",
  149: "SERVIÇOS",
  190: "SERVIÇOS",
};

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const values = cat
  .map((c) => {
    const tipo = c.tipo === "SEM RESUMO" ? RESUMO[c.idTipoOs] || "SERVIÇOS" : c.tipo;
    return `  ('${esc(tipo)}', '${esc(c.tipoAtividade)}', ${Number(c.valor).toFixed(2)})`;
  })
  .join(",\n");

const sql = `-- Catálogo de preços TOA calibrado no Analítico Claro (dez/25–jun/26).
-- Média histórica para tipos variáveis; valor fixo para estáveis; 0 se nunca pago.

insert into public.precos_os (tipo, tipo_os, valor)
values
${values}
on conflict (tipo_os) do update
set
  tipo = excluded.tipo,
  valor = excluded.valor;
`;

const out = path.join(
  __dirname,
  "../supabase/migrations/036_precos_os_calibrado_analitico.sql",
);
fs.writeFileSync(out, sql);
console.log("wrote", out, "rows", cat.length);
