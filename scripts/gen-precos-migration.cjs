const fs = require("fs");
const path = require("path");

const catalogPath = path.join(
  __dirname,
  "../src/lib/toa-atividades-catalogo.ts",
);
const src = fs.readFileSync(catalogPath, "utf8");
const match = src.match(
  /export const ATIVIDADES_TOA_CATALOGO[^=]*=\s*(\[[\s\S]*?\]);/,
);
if (!match) {
  console.error("Catalog array not found");
  process.exit(1);
}

const catalog = Function(`"use strict"; return (${match[1]});`)();

function esc(s) {
  return String(s).replace(/'/g, "''");
}

const values = catalog
  .map(
    (e) =>
      `  ('${esc(e.tipo)}', '${esc(e.tipoAtividade)}', ${Number(e.valor).toFixed(2)})`,
  )
  .join(",\n");

const sql = `-- Atualiza a tabela oficial de preços TOA (RESUMO + ATIVIDADE + Valor).
alter table public.precos_os
  add column if not exists tipo text not null default '';

insert into public.precos_os (tipo, tipo_os, valor)
values
${values}
on conflict (tipo_os) do update
set
  tipo = excluded.tipo,
  valor = excluded.valor,
  updated_at = now();
`;

fs.writeFileSync(
  path.join(__dirname, "../supabase/migrations/034_precos_os_analitico.sql"),
  sql,
);
console.log("rows", catalog.length);
