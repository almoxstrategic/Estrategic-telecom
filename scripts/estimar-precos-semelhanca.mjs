/**
 * Estima preços zerados em precos_os por semelhança de categoria + descrição.
 * Rode após a calibração por moda do Analítico.
 *
 *   node --env-file=.env scripts/estimar-precos-semelhanca.mjs
 *
 * No app: botão "Atualizar Catálogo via Histórico" já encadeia esta etapa.
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

const STOP = new Set([
  "DE",
  "DA",
  "DO",
  "DAS",
  "DOS",
  "E",
  "A",
  "O",
  "EM",
  "NO",
  "NA",
  "COM",
  "PARA",
  "POR",
]);

function normalize(s) {
  return String(s || "")
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ");
}

function tokens(desc) {
  const semCodigo = String(desc || "").replace(/^\s*\d+\s*[-–—:]?\s*/, "");
  return new Set(
    normalize(semCodigo)
      .split(/[^A-Z0-9]+/)
      .filter((t) => t.length >= 3 && !STOP.has(t)),
  );
}

function jaccard(a, b) {
  const ta = tokens(a);
  const tb = tokens(b);
  if (!ta.size || !tb.size) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter++;
  return inter / (ta.size + tb.size - inter);
}

function moda(valores) {
  const freq = new Map();
  for (const v of valores) {
    const r = Math.round(Number(v) * 100) / 100;
    if (!(r > 0)) continue;
    freq.set(r, (freq.get(r) || 0) + 1);
  }
  let best = 0;
  let n = 0;
  for (const [v, c] of freq) {
    if (c > n || (c === n && v > best)) {
      best = v;
      n = c;
    }
  }
  return best;
}

function media(valores) {
  const limpos = valores.map(Number).filter((v) => v > 0);
  if (!limpos.length) return 0;
  return Math.round((limpos.reduce((s, v) => s + v, 0) / limpos.length) * 100) / 100;
}

const { data, error } = await supabase
  .from("precos_os")
  .select("tipo, tipo_os, valor, is_estimado");
if (error) throw error;

const rows = (data || []).map((r) => ({
  tipo: String(r.tipo || "").trim(),
  tipoAtividade: String(r.tipo_os || "").trim(),
  valor: Number(r.valor) || 0,
}));

const comPreco = rows.filter((r) => r.valor > 0);
const semPreco = rows.filter((r) => r.valor <= 0);
const porTipo = new Map();
for (const p of comPreco) {
  const k = normalize(p.tipo || "SERVICOS");
  if (!porTipo.has(k)) porTipo.set(k, []);
  porTipo.get(k).push(p);
}

const payload = [];
for (const alvo of semPreco) {
  const peers = porTipo.get(normalize(alvo.tipo || "SERVICOS")) || [];
  if (peers.length) {
    let best = peers[0];
    let bestScore = jaccard(alvo.tipoAtividade, best.tipoAtividade);
    for (const peer of peers.slice(1)) {
      const s = jaccard(alvo.tipoAtividade, peer.tipoAtividade);
      if (s > bestScore) {
        best = peer;
        bestScore = s;
      }
    }
    const valores = peers.map((p) => p.valor);
    let valor = 0;
    let metodo = "";
    if (bestScore >= 0.25) {
      valor = best.valor;
      metodo = `irmao←${best.tipoAtividade}`;
    } else {
      valor = moda(valores) || media(valores);
      metodo = valor === moda(valores) ? "moda_categoria" : "media_categoria";
    }
    if (valor > 0) {
      payload.push({
        tipo: alvo.tipo,
        tipo_os: alvo.tipoAtividade,
        valor,
        is_estimado: true,
        updated_at: new Date().toISOString(),
      });
      console.log(`${alvo.tipoAtividade} → ${valor} (${metodo}, sim=${bestScore.toFixed(2)})`);
    }
    continue;
  }

  let best = comPreco[0];
  let bestScore = jaccard(alvo.tipoAtividade, best.tipoAtividade);
  for (const peer of comPreco.slice(1)) {
    const s = jaccard(alvo.tipoAtividade, peer.tipoAtividade);
    if (s > bestScore) {
      best = peer;
      bestScore = s;
    }
  }
  if (bestScore >= 0.35) {
    payload.push({
      tipo: alvo.tipo,
      tipo_os: alvo.tipoAtividade,
      valor: best.valor,
      is_estimado: true,
      updated_at: new Date().toISOString(),
    });
    console.log(
      `${alvo.tipoAtividade} → ${best.valor} (irmao_global←${best.tipoAtividade}, sim=${bestScore.toFixed(2)})`,
    );
  }
}

if (!payload.length) {
  console.log("Nada a estimar.");
  process.exit(0);
}

const { error: upErr } = await supabase
  .from("precos_os")
  .upsert(payload, { onConflict: "tipo_os" });
if (upErr) throw upErr;
console.log(`UPSERT estimado ok: ${payload.length} tipo(s).`);
