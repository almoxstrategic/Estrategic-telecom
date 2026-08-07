import type { AnaliticoHistoricoRow } from "./faturamento-service";
import type { PrecosOsMap } from "./precos-os-service";
import {
  isOsProdutiva,
  isOsReceitaFaturavelNaNota,
  normalizeToaLogin,
  statusNotaToa,
  valorPrecoOs,
  type ToaChamadoProcessado,
} from "./toa-store";

/** Chave de cruzamento contrato Analítico ↔ TOA. */
export function normalizeContratoKey(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  // Preferência: só dígitos (evita divergência "123" vs "123.0" / espaços).
  const digits = raw.replace(/\D/g, "");
  return digits || raw.toUpperCase();
}

export type GapSomenteAnalitico = {
  NR_CONTRATO: string;
  CD_OS: string;
  VALOR_SERVICO: number;
  DS_TIPO_OS: string;
};

export type GapSomenteToa = {
  Contrato: string;
  "Número da WO": string;
  "Nome do Técnico": string;
  "Total de O.S. Produtivas": number;
  "Receita Projetada": number;
};

export type ConciliacaoAnaliticoToa = {
  faltandoNoToa: GapSomenteAnalitico[];
  faltandoNoAnalitico: GapSomenteToa[];
};

function receitaProjetadaNota(
  chamado: ToaChamadoProcessado,
  precosOs: PrecosOsMap | Record<string, number>,
): number {
  let total = 0;
  for (const ordem of chamado.ordensDeServico) {
    if (!isOsReceitaFaturavelNaNota(ordem, chamado.ordensDeServico)) continue;
    total += valorPrecoOs(precosOs, ordem.tipoOs);
  }
  return total;
}

/**
 * Conciliação financeira por contrato (NR_CONTRATO ↔ Contrato).
 * - Faltando no TOA: linhas do Analítico cujo contrato não aparece no TOA.
 * - Faltando no Analítico: notas TOA produtivas cujo contrato não aparece no Analítico.
 */
export function conciliarAnaliticoVsToa(
  analitico: AnaliticoHistoricoRow[],
  toa: ToaChamadoProcessado[],
  options?: {
    nomePorLogin?: (login: string) => string;
    precosOs?: PrecosOsMap | Record<string, number>;
  },
): ConciliacaoAnaliticoToa {
  const nomePorLogin =
    options?.nomePorLogin ?? ((login: string) => normalizeToaLogin(login));
  const precosOs = options?.precosOs ?? {};

  const contratosToa = new Set<string>();
  for (const chamado of toa) {
    const key = normalizeContratoKey(chamado.contrato);
    if (key) contratosToa.add(key);
  }

  const contratosAnalitico = new Set<string>();
  for (const row of analitico) {
    const key = normalizeContratoKey(row.nr_contrato);
    if (key) contratosAnalitico.add(key);
  }

  const faltandoNoToa: GapSomenteAnalitico[] = [];
  for (const row of analitico) {
    const key = normalizeContratoKey(row.nr_contrato);
    if (!key || contratosToa.has(key)) continue;
    faltandoNoToa.push({
      NR_CONTRATO: row.nr_contrato,
      CD_OS: row.cd_os,
      VALOR_SERVICO: Number(row.valor_servico) || 0,
      DS_TIPO_OS: row.ds_tipo_os || "",
    });
  }

  const faltandoNoAnalitico: GapSomenteToa[] = [];
  for (const chamado of toa) {
    if (statusNotaToa(chamado.ordensDeServico) !== "Produtiva") continue;
    const key = normalizeContratoKey(chamado.contrato);
    if (!key || contratosAnalitico.has(key)) continue;

    const osProdutivas = chamado.ordensDeServico.filter(isOsProdutiva).length;
    faltandoNoAnalitico.push({
      Contrato: chamado.contrato,
      "Número da WO": chamado.numeroWo,
      "Nome do Técnico": nomePorLogin(normalizeToaLogin(chamado.login)),
      "Total de O.S. Produtivas": osProdutivas,
      "Receita Projetada": Number(
        receitaProjetadaNota(chamado, precosOs).toFixed(2),
      ),
    });
  }

  return { faltandoNoToa, faltandoNoAnalitico };
}
