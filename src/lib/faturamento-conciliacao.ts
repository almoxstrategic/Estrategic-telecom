import type {
  AnaliticoHistoricoRow,
  ToaImportacaoRow,
} from "./faturamento-service";
import {
  isCodBaixaProdutivo,
  isStatusExecutada,
  normalizeToaLogin,
} from "./toa-store";

/** Normaliza contrato para cruzamento (só dígitos quando houver). */
export function normalizeContratoKey(value: string): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw.toUpperCase();
}

/** Normaliza número de O.S. / CD_OS para a mesma chave. */
export function normalizeOsKey(value: string | number | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const digits = raw.replace(/\D/g, "");
  return digits || raw.toUpperCase();
}

/**
 * Normaliza datas de TOA / Analítico para YYYY-MM-DD
 * (evita fuso, barras vs hífens e timestamps).
 */
export function normalizeDateKey(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  const br = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (br) {
    return `${br[3]}-${br[2]!.padStart(2, "0")}-${br[1]!.padStart(2, "0")}`;
  }

  const ts = Date.parse(raw);
  if (!Number.isNaN(ts)) {
    const d = new Date(ts);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }

  return "";
}

/** Chave composta: contrato + O.S. */
export function chaveConciliacaoOs(
  contrato: string,
  numeroOs: string | number | null | undefined,
): string {
  const c = normalizeContratoKey(contrato);
  const os = normalizeOsKey(numeroOs);
  if (!c || !os) return "";
  return `${c}_${os}`;
}

export type GapFaltaNoAnalitico = {
  "Nome Técnico": string;
  Login: string;
  Contrato: string;
  "Número WO": string;
  "Número OS": string;
  "Tipo OS": string;
  "Cód Baixa": number | string;
  "Data TOA": string;
};

export type GapFaltaNoToa = {
  Contrato: string;
  CD_OS: string;
  "Tipo OS": string;
  "Data Baixa": string;
  "Valor Serviço": number;
};

export type ConciliacaoAnaliticoToa = {
  /** Trabalhamos (TOA produtivo) e não foi pago no Analítico. */
  faltandoNoAnalitico: GapFaltaNoAnalitico[];
  /** Foi pago no Analítico mas não está no TOA. */
  faltandoNoToa: GapFaltaNoToa[];
};

function isToaOsProdutivaFlat(
  row: Pick<ToaImportacaoRow, "status_os" | "cod_baixa">,
): boolean {
  const cod =
    row.cod_baixa != null && Number.isFinite(Number(row.cod_baixa))
      ? Number(row.cod_baixa)
      : 0;
  return (
    isStatusExecutada(row.status_os || "") &&
    cod > 0 &&
    isCodBaixaProdutivo(cod)
  );
}

/**
 * Conciliação O.S. a O.S. (flat):
 * chave = contrato/nr_contrato + numero_os/cd_os.
 *
 * - Falta no Analítico: O.S. produtivas do TOA sem par no Analítico.
 * - Falta no TOA: linhas do Analítico sem par no TOA.
 */
export function conciliarAnaliticoVsToa(
  analitico: AnaliticoHistoricoRow[],
  toaOs: ToaImportacaoRow[],
  options?: {
    /** Se true (padrão), só cobra O.S. produtivas do TOA. */
    somenteProdutivasToa?: boolean;
  },
): ConciliacaoAnaliticoToa {
  const somenteProdutivas = options?.somenteProdutivasToa !== false;

  const chavesAnalitico = new Set<string>();
  for (const row of analitico) {
    const key = chaveConciliacaoOs(row.nr_contrato, row.cd_os);
    if (key) chavesAnalitico.add(key);
  }

  const chavesToa = new Set<string>();
  for (const row of toaOs) {
    const key = chaveConciliacaoOs(row.contrato, row.numero_os);
    if (key) chavesToa.add(key);
  }

  const faltandoNoAnalitico: GapFaltaNoAnalitico[] = [];
  const vistosToa = new Set<string>();
  for (const row of toaOs) {
    if (somenteProdutivas && !isToaOsProdutivaFlat(row)) continue;
    const key = chaveConciliacaoOs(row.contrato, row.numero_os);
    if (!key || chavesAnalitico.has(key) || vistosToa.has(key)) continue;
    vistosToa.add(key);

    faltandoNoAnalitico.push({
      "Nome Técnico": (row.nome_tecnico || "").trim() || row.login_tecnico,
      Login: normalizeToaLogin(row.login_tecnico),
      Contrato: row.contrato,
      "Número WO": row.numero_wo,
      "Número OS": row.numero_os,
      "Tipo OS": row.tipo_os || "",
      "Cód Baixa": row.cod_baixa ?? "",
      "Data TOA": normalizeDateKey(row.data_toa) || row.data_toa,
    });
  }

  const faltandoNoToa: GapFaltaNoToa[] = [];
  const vistosAnalitico = new Set<string>();
  for (const row of analitico) {
    const key = chaveConciliacaoOs(row.nr_contrato, row.cd_os);
    if (!key || chavesToa.has(key) || vistosAnalitico.has(key)) continue;
    vistosAnalitico.add(key);

    faltandoNoToa.push({
      Contrato: row.nr_contrato,
      CD_OS: row.cd_os,
      "Tipo OS": row.ds_tipo_os || "",
      "Data Baixa": normalizeDateKey(row.dh_baixa) || row.dh_baixa || "",
      "Valor Serviço": Number(row.valor_servico) || 0,
    });
  }

  return { faltandoNoAnalitico, faltandoNoToa };
}
