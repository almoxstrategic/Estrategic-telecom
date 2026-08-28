/**
 * Reajuste global definitivo de precos_os (+0,74128% / fator 1,0074128).
 * Alinha projeção financeira ao repasse consolidado por contrato.
 *
 * Uso:
 *   node --env-file=.env scripts/reajuste-precos-os-repasse.mjs
 *   node --env-file=.env scripts/reajuste-precos-os-repasse.mjs --dry-run
 */
import fs from "fs";
import path from "path";
import { createClient } from "@supabase/supabase-js";

export const FATOR_REPASSE_OS = 1.0074128;
export const PERCENTUAL_REPASSE_OS = 0.74128;

function roundMoney(v) {
  return Math.round(Number(v) * 100) / 100;
}

function createSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY.");
  }
  return createClient(url, key);
}

async function main() {
  const dryRun = process.argv.includes("--dry-run");
  const supabase = createSupabase();

  const { data, error } = await supabase
    .from("precos_os")
    .select("tipo, tipo_os, valor, is_estimado")
    .order("tipo_os", { ascending: true });
  if (error) throw error;

  const payload = (data ?? []).map((row) => {
    const atual = Number(row.valor) || 0;
    const novo = atual > 0 ? roundMoney(atual * FATOR_REPASSE_OS) : 0;
    return {
      tipo: row.tipo,
      tipo_os: row.tipo_os,
      valor: novo,
      is_estimado: Boolean(row.is_estimado),
      updated_at: new Date().toISOString(),
      _antes: atual,
    };
  });

  const alterados = payload.filter((p) => p._antes > 0 && p.valor !== p._antes);
  console.log(`Fator: ${FATOR_REPASSE_OS} (+${PERCENTUAL_REPASSE_OS}%)`);
  console.log(`Registros: ${payload.length} | Reajustados: ${alterados.length}`);

  for (const p of alterados.slice(0, 15)) {
    console.log(`${p.tipo_os}: ${p._antes} → ${p.valor}`);
  }
  if (alterados.length > 15) console.log(`… +${alterados.length - 15} registro(s)`);

  const outDir = path.join(process.cwd(), "scripts/calibration-output");
  fs.mkdirSync(outDir, { recursive: true });
  const reportPath = path.join(outDir, "reajuste-repasse-074128.json");
  fs.writeFileSync(
    reportPath,
    JSON.stringify(
      {
        fator: FATOR_REPASSE_OS,
        percentual: PERCENTUAL_REPASSE_OS,
        dryRun,
        alteracoes: alterados.map((p) => ({
          tipo_os: p.tipo_os,
          antes: p._antes,
          depois: p.valor,
        })),
        geradoEm: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  console.log(`Relatório: ${reportPath}`);

  if (dryRun) {
    console.log("Dry-run — nenhuma gravação.");
    return;
  }

  const upsertPayload = payload.map(({ _antes, ...rest }) => rest);
  let up = await supabase
    .from("precos_os")
    .upsert(upsertPayload, { onConflict: "tipo_os" });
  if (up.error && /is_estimado/i.test(up.error.message)) {
    const sem = upsertPayload.map(({ is_estimado: _e, ...r }) => r);
    up = await supabase.from("precos_os").upsert(sem, { onConflict: "tipo_os" });
  }
  if (up.error) throw up.error;
  console.log("precos_os atualizado com sucesso.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
