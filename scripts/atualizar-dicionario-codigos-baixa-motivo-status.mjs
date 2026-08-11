/**
 * Atualiza motivo_quebra e status_contrato em dicionario_codigos_baixa
 * a partir do mapeamento oficial (planilha).
 *
 * Uso:
 *   node --env-file=.env scripts/atualizar-dicionario-codigos-baixa-motivo-status.mjs
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const key =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.VITE_SUPABASE_ANON_KEY ||
  process.env.SUPABASE_ANON_KEY;

if (!url || !key) {
  console.error(
    "Defina VITE_SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (ou anon).",
  );
  process.exit(1);
}

const supabase = createClient(url, key);

/** Mapeamento oficial: "CODIGO - DESCRICAO" → classificação. */
const MAPEAMENTO = {
  "101 - ENDERECO NAO LOCALIZADO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "106 - CLIENTE AUSENTE": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "107 - ENTRADA NAO AUTORIZADA": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "110 - PROBLEMA NA TUBULACAO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "112 - SEM ACESSO AO DG / SOTAO / COMODO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "125 - CLIENTE DESISTE DA AGENDA": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "127 - AREA DE RISCO BLOQUEIO DE ENDERECO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "134 - ADEQUACAO MDU INICIADA MAS NAO CONCLUIDA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "203 - REDE EXTERNA COM PROBLEMA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "205 - FALTA TAP OU PASSIVO / TAP OU PASSIVO LOTADO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "206 - PREDIO SEM BACKBONE": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "209 - NAP LOTADA EM MDU": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "211 - FALTA NAP/NAP LOTADA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "217 - BACKBONE GPON COM PROBLEMA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "301 - TIPO DE OS INCORRETA": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "302 - DESISTENCIA DA ASSINATURA / SERVICO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "303 - INST MODELO CABO CASA NAO ACEITA PELO CLIENTE": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "305 - RUA NAO CABEADA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "306 - NAO RESIDE NO ENDERECO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "307 - RESIDENCIA EM CONSTRUCAO / REFORMA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "308 - INSTALACAO NAO CONTEMPLARA PADRAO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "312 - CLIENTE NAO SOLICITOU O SERVICO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "402 - DIVERGENCIA DE DADOS CADASTRAIS": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "409 - SERVICO CONCLUIDO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "999 - DESATRIBUIDO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "204 - BACKBONE COM PROBLEMA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "316 - RUA NAO CABEADA GPON": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "103 - CHUVA": { motivo_quebra: "TÉCNICO", status_contrato: "IMPRODUTIVO" },
  "201 - PROVEDOR COM PROBLEMA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "471 - RECONFIGURACAO DO SSID - SENHA EXTENSOR": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "472 - INSTRUCOES DE USO DO EQUIPAMENTO - EXTENSOR": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "473 - NECESSIDADE DE INSTALACAO VIA CABO ETHERNET": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "475 - VELOCIDADE DO EXTENSOR CONFORME CONTRATADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "476 - RECONFIGURADO - PAREAMENTO EXTENSORES": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "500 - READEQUACAO DE SINAL - PASSIVOS": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "510 - FONTE COM DEFEITO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "516 - T.T - TRAVADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "517 - T.T - QUEIMADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "518 - T.T - NAO HABILITA / NAO SINCRONIZA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "521 - T.T - INTERMITENTE": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "523 - T.T - ALCANCE WIFI": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "526 - T.T - ERRO DE LEITURA SMART": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "527 - T.T - NAO NAVEGA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "533 - RESET NA CONFIG TERMINAL - TRAVADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "534 - RESET NA CONFIG TERMINAL - SOLICIT SENHA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "536 - RECONFIGURADO ROTEADOR DO CLIENTE": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "537 - RECONFIGURADO EMTA/ROTEADOR NET-WIFI": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "540 - CONECTOR INTERNO OXIDADO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "541 - CONECTOR INTERNO MAL FEITO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "542 - CONECTOR INTERNO FORA DO PADRAO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "544 - CONECTOR TAP MAL FEITO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "545 - CONECTOR TAP - FORA DO PADRAO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "547 - CONECTOR MDU MAL FEITO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "552 - INSTRUCOES DO USO DA INTERATIVIDADE": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "553 - INSTRUCOES DE USO DO CONTROLE REMOTO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "555 - SEM DEFEITO NO PRODUTO VIRTUA RECLAMADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "558 - BOOT NO TERMINAL": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "560 - EQUIPAMENTO / REDE DE DADOS CLIENTE COM DEFEITO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "561 - PONTO SEM CADASTRO NAO REGULARIZADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "563 - RECONEXAO DOS CABOS NO EQUIPAMENTO DO CLIENTE": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "566 - REFEITO DROP": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "574 - CORRECAO EFETUADA NO DATA CENTER": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "584 - CONECTOR OPTICO INTERNO DANIFICADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "588 - CONECTOR OPTICO MDU/DIO DANIFICADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "589 - CONECTOR OPTICO REDE EXTERNA NAP DANIFICADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "478 - CONFIGURACAO CONCLUIDA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "425 - TROCA DE TECNOLOGIA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "430 - EQUIPAMENTO RETIRADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "505 - PASSIVO INTERNO QUEIM./DEGRAD. - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "477 - INSTALACAO MESH CABEADA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "557 - SEM DEFEITO NO PRODUTO NETFONE RECLAMADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "571 - ENCAMINHADO A EMBRATEL": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "591 - PATCH CORD COM DEFEITO TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "524 - T.T - SOLIC. CLIENTE": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "549 - VELOCIDADE DO VIRTUA CONFORME CONTRATADA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "562 - CABO RECONECTADO/IDENTIFICADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "100 - AGENDAMENTO NAO CUMPRIDO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "111 - REAGENDAMENTO SOLICITADO PELO CLIENTE": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "104 - FALTA DE MATERIAL": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  PENDENTE: { motivo_quebra: "TÉCNICO", status_contrato: "IMPRODUTIVO" },
  "583 - NECESSARIO REFAZER CABEAMENTO OPTICO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "594 - RECONFIGURACAO DA SENHA DE WI-FI": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "598 - SERVICO CONCLUIDO PARA CONSTRUCAO DE MDU": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "564 - CABOS ESPECIAIS COM DEFEITO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "126 - SITUAÇÃO DE RISCO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "999 - DESATRIBUÍDO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "567 - REFEITO CABEAMENTO COAXIAL": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "579 - LIMPEZA DE RUIDO EXECUTADA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "202 - NODE EM OUTAGE": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "528 - T.T - PROBLEMA DE FALHA NO AUDIO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "506 - PASSIVO INTERNO FORA DO PADRAO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "308 - INSTALACAO NAO CONTEMPLA PADRAO": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "328 - Entrega Concluida": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "514 - ENVIO DE HIT - HABILITAR CANAIS": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "126 - SITUACAO PONTUAL DE RISCO": {
    motivo_quebra: "COMERCIAL",
    status_contrato: "IMPRODUTIVO",
  },
  "586 - REFEITO CABEAMENTO OPTICO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "585 - LIMPEZA CONECTOR/ACOPLADOR OPTICO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "550 - CANAL NAO PERTECE AO PACOTE CONTRATADO": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "114 - HABILITACAO DE TELEFONE NAO LIBERADA": {
    motivo_quebra: "TÉCNICO",
    status_contrato: "IMPRODUTIVO",
  },
  "548 - CONECTOR MDU FORA DO PADRAO - TROCA": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "570 - NECESSARIO REFAZER CABEAMENTO COAXIAL": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
  "559 - RECONFIGURADO COMPUTADOR": {
    motivo_quebra: "PRODUTIVO",
    status_contrato: "PRODUTIVO",
  },
};

function stripAccents(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeText(value) {
  return stripAccents(value)
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeCodigo(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return String(n);
  return normalizeText(raw);
}

function parseChave(chave) {
  const raw = String(chave ?? "").trim();
  const match = raw.match(/^(\d+)\s*[-–—]\s*(.+)$/);
  if (match) {
    return {
      codigo: normalizeCodigo(match[1]),
      descricao: String(match[2] ?? "").trim(),
      chaveNorm: normalizeText(raw),
    };
  }
  return {
    codigo: "",
    descricao: raw,
    chaveNorm: normalizeText(raw),
  };
}

function rowMatches(row, parsed) {
  const codigoRow = normalizeCodigo(row.codigo);
  const descRow = normalizeText(row.descricao);
  const chaveRow = normalizeText(`${row.codigo} - ${row.descricao}`);

  if (parsed.codigo && codigoRow === parsed.codigo) return true;
  if (parsed.descricao && descRow === normalizeText(parsed.descricao)) return true;
  if (parsed.chaveNorm && chaveRow === parsed.chaveNorm) return true;
  return false;
}

async function main() {
  const { data: rows, error } = await supabase
    .from("dicionario_codigos_baixa")
    .select("codigo, descricao, motivo_quebra, status_contrato");

  if (error) {
    console.error("Erro ao ler dicionario_codigos_baixa:", error.message);
    process.exit(1);
  }

  const existentes = rows ?? [];
  console.log(`Linhas atuais no dicionário: ${existentes.length}`);
  console.log(`Entradas no mapeamento: ${Object.keys(MAPEAMENTO).length}`);

  /** @type {Map<string, { codigo: string, descricao: string, motivo_quebra: string, status_contrato: string }>} */
  const upserts = new Map();
  let matchedKeys = 0;
  let unmatchedKeys = 0;

  for (const [chave, valores] of Object.entries(MAPEAMENTO)) {
    const parsed = parseChave(chave);
    const hits = existentes.filter((row) => rowMatches(row, parsed));

    if (hits.length === 0) {
      unmatchedKeys += 1;
      if (parsed.codigo) {
        upserts.set(parsed.codigo, {
          codigo: parsed.codigo,
          descricao: parsed.descricao || chave,
          motivo_quebra: valores.motivo_quebra,
          status_contrato: valores.status_contrato,
        });
        console.log(`+ Inserir/atualizar por código novo: ${parsed.codigo} (${chave})`);
      } else {
        // Ex.: PENDENTE — tenta upsert por código textual
        const codigoTextual = normalizeCodigo(parsed.descricao) || "PENDENTE";
        upserts.set(codigoTextual, {
          codigo: codigoTextual.slice(0, 10),
          descricao: parsed.descricao || chave,
          motivo_quebra: valores.motivo_quebra,
          status_contrato: valores.status_contrato,
        });
        console.log(`+ Inserir chave textual: ${codigoTextual}`);
      }
      continue;
    }

    matchedKeys += 1;
    for (const hit of hits) {
      const codigo = normalizeCodigo(hit.codigo);
      upserts.set(codigo, {
        codigo,
        descricao: String(hit.descricao ?? parsed.descricao).trim(),
        motivo_quebra: valores.motivo_quebra,
        status_contrato: valores.status_contrato,
      });
    }
  }

  const payload = [...upserts.values()];
  console.log(`\nUpserts a aplicar: ${payload.length}`);
  console.log(`Chaves com match no banco: ${matchedKeys}`);
  console.log(`Chaves sem match (novas): ${unmatchedKeys}`);

  if (payload.length === 0) {
    console.log("Nada a atualizar.");
    return;
  }

  const { error: upsertError } = await supabase
    .from("dicionario_codigos_baixa")
    .upsert(payload, { onConflict: "codigo" });

  if (upsertError) {
    console.error("Erro no upsert:", upsertError.message);
    process.exit(1);
  }

  const { count, error: countError } = await supabase
    .from("dicionario_codigos_baixa")
    .select("codigo", { count: "exact", head: true })
    .not("motivo_quebra", "is", null);

  if (countError) {
    console.log("Upsert concluído (não foi possível contar preenchidos).");
  } else {
    console.log(
      `Concluído. Linhas com motivo_quebra preenchido: ${count ?? "?"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
