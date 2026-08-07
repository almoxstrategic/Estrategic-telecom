/**
 * Utilitário CLI: descobre moda de valor_servico no analitico_historico
 * e faz UPSERT em precos_os.
 *
 * Uso (com .env do projeto):
 *   node --env-file=.env scripts/atualizar-catalogo-precos-moda.mjs
 *
 * Preferência no app: botão "Atualizar Catálogo via Histórico" no KPI.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou anon).");
  process.exit(1);
}

const supabase = createClient(url, key);

function roundMoney(v) {
  return Math.round(Number(v) * 100) / 100;
}

function moda(valores) {
  const freq = new Map();
  for (const bruto of valores) {
    const v = roundMoney(bruto);
    if (!Number.isFinite(v) || v <= 0) continue;
    freq.set(v, (freq.get(v) || 0) + 1);
  }
  let best = 0;
  let nBest = 0;
  for (const [valor, n] of freq) {
    if (n > nBest || (n === nBest && valor > best)) {
      best = valor;
      nBest = n;
    }
  }
  return { moda: best, frequencia: nBest };
}

const pageSize = 1000;
let from = 0;
const buckets = new Map();

for (;;) {
  const { data, error } = await supabase
    .from("analitico_historico")
    .select("id_tipo_os, ds_tipo_os, valor_servico")
    .not("id_tipo_os", "is", null)
    .gt("valor_servico", 0)
    .order("id", { ascending: true })
    .range(from, from + pageSize - 1);
  if (error) throw error;
  const rows = data || [];
  if (rows.length === 0) break;
  for (const row of rows) {
    const id = Number(row.id_tipo_os);
    const valor = Number(row.valor_servico);
    if (!Number.isFinite(id) || id <= 0 || !Number.isFinite(valor) || valor <= 0) {
      continue;
    }
    const ds = String(row.ds_tipo_os || "").trim();
    let b = buckets.get(id);
    if (!b) {
      b = { valores: [], dsFreq: new Map() };
      buckets.set(id, b);
    }
    b.valores.push(valor);
    if (ds) b.dsFreq.set(ds, (b.dsFreq.get(ds) || 0) + 1);
  }
  if (rows.length < pageSize) break;
  from += pageSize;
}

const payload = [];
for (const [id, b] of [...buckets.entries()].sort((a, c) => a[0] - c[0])) {
  const { moda: valor, frequencia } = moda(b.valores);
  if (frequencia <= 0 || valor <= 0) continue;
  let ds = "";
  let dsN = 0;
  for (const [d, n] of b.dsFreq) {
    if (n > dsN || (n === dsN && d.length > ds.length)) {
      ds = d;
      dsN = n;
    }
  }
  const tipo_os = ds ? `${id} - ${ds}` : String(id);
  payload.push({
    tipo: "SERVIÇOS",
    tipo_os,
    valor,
    updated_at: new Date().toISOString(),
  });
  console.log(
    `${tipo_os}: moda=${valor} (freq=${frequencia}/${b.valores.length})`,
  );
}

if (payload.length === 0) {
  console.log("Nada para upsert.");
  process.exit(0);
}

const { error } = await supabase
  .from("precos_os")
  .upsert(payload, { onConflict: "tipo_os" });
if (error) throw error;
console.log(`UPSERT ok: ${payload.length} tipo(s) de O.S.`);
