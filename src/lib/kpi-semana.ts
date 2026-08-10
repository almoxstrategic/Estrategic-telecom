/** Valores do filtro de semana no KPI Desempenho Técnicos. */
export type KpiSemanaFiltro =
  | "Todos"
  | "Semana 1"
  | "Semana 2"
  | "Semana 3"
  | "Semana 4"
  | "Semana 5";

export const KPI_SEMANA_OPCOES: readonly KpiSemanaFiltro[] = [
  "Todos",
  "Semana 1",
  "Semana 2",
  "Semana 3",
  "Semana 4",
  "Semana 5",
] as const;

/** Intervalos fixos de dias dentro do mês (Semana 5 vai até o último dia). */
const SEMANA_INTERVALOS: Record<
  Exclude<KpiSemanaFiltro, "Todos">,
  { inicio: number; fim: number | null }
> = {
  "Semana 1": { inicio: 1, fim: 7 },
  "Semana 2": { inicio: 8, fim: 14 },
  "Semana 3": { inicio: 15, fim: 21 },
  "Semana 4": { inicio: 22, fim: 28 },
  "Semana 5": { inicio: 29, fim: null },
};

export function isKpiSemanaFiltro(value: string): value is KpiSemanaFiltro {
  return (KPI_SEMANA_OPCOES as readonly string[]).includes(value);
}

/** Último dia do mês (1–12). */
export function ultimoDiaDoMes(ano: number, mes: number): number {
  return new Date(ano, mes, 0).getDate();
}

export function intervaloDiasDaSemana(
  semana: KpiSemanaFiltro,
  ano: number | null,
  mes: number | null,
): { inicio: number; fim: number } | null {
  if (semana === "Todos") return null;
  const base = SEMANA_INTERVALOS[semana];
  const fimMes =
    ano != null && mes != null ? ultimoDiaDoMes(ano, mes) : 31;
  const fim = base.fim ?? fimMes;
  if (base.inicio > fimMes) return null;
  return { inicio: base.inicio, fim: Math.min(fim, fimMes) };
}

export function diaPertenceASemana(
  dia: number,
  semana: KpiSemanaFiltro,
  ano: number | null,
  mes: number | null,
): boolean {
  if (semana === "Todos") return true;
  const intervalo = intervaloDiasDaSemana(semana, ano, mes);
  if (!intervalo) return false;
  return dia >= intervalo.inicio && dia <= intervalo.fim;
}

/** Ex.: "dia 01 até dia 07" */
export function formatarIntervaloSemanaLabel(
  semana: KpiSemanaFiltro,
  ano: number | null,
  mes: number | null,
): string | null {
  const intervalo = intervaloDiasDaSemana(semana, ano, mes);
  if (!intervalo) return null;
  const ini = String(intervalo.inicio).padStart(2, "0");
  const fim = String(intervalo.fim).padStart(2, "0");
  return `dia ${ini} até dia ${fim}`;
}
