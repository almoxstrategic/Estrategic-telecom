export type MonthlyProjectionInput = {
  currentTotal: number;
  daysPassed: number;
  totalDaysInMonth: number;
};

export type MonthlyProjectionResult = {
  projection: number;
  dailyAverage: number;
  daysRemaining: number;
};

/** Ponto diário do mês para projeção sazonal (seg–dom). */
export type DailyVolumePoint = {
  day: number;
  weekday: number;
  produtivas: number;
  improdutivas: number;
};

type WeekdayField = "produtivas" | "improdutivas";

/** Dias úteis = seg–sáb (exclui domingo). `mes` é 1–12. */
export function contarDiasUteisMes(ano: number, mes: number): number {
  if (!ano || mes < 1 || mes > 12) return 0;
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let total = 0;
  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    const dow = new Date(ano, mes - 1, dia).getDay();
    if (dow !== 0) total += 1;
  }
  return total;
}

/** Conta datas ISO únicas (YYYY-MM-DD) presentes nos registros. */
export function contarDiasUnicosComDados(datas: Iterable<string>): number {
  const set = new Set<string>();
  for (const raw of datas) {
    const iso = String(raw ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) set.add(iso);
  }
  return set.size;
}

function mediaArredondada(valores: number[]): number {
  if (valores.length === 0) return 0;
  return Math.round(valores.reduce((acc, n) => acc + n, 0) / valores.length);
}

/**
 * Médias por dia da semana (0=Dom … 6=Sáb) até o último dia com produção.
 * Inclui dias zerados no histórico; fallback = média global do período.
 */
function calcularMediasPorDiaSemana(
  historico: DailyVolumePoint[],
  field: WeekdayField,
): Record<number, number> {
  const buckets = new Map<number, number[]>();
  for (const d of historico) {
    const valores = buckets.get(d.weekday) ?? [];
    valores.push(d[field]);
    buckets.set(d.weekday, valores);
  }

  const mediaGlobal = mediaArredondada(historico.map((d) => d[field]));
  const medias: Record<number, number> = {};
  for (let js = 0; js <= 6; js += 1) {
    const valores = buckets.get(js);
    medias[js] = valores && valores.length > 0 ? mediaArredondada(valores) : mediaGlobal;
  }
  return medias;
}

/**
 * Projeção de fechamento por sazonalidade do dia da semana (Bas. Média):
 * soma do realizado + média histórica de cada weekday nos dias futuros restantes.
 *
 * Critério usado em /volume-notas (mais conservador que a projeção linear).
 */
export function calculateMonthlyProjectionByWeekday(
  dailyPoints: DailyVolumePoint[],
  field: WeekdayField = "produtivas",
): MonthlyProjectionResult {
  if (dailyPoints.length === 0) {
    return { projection: 0, dailyAverage: 0, daysRemaining: 0 };
  }

  const diasComValor = dailyPoints.filter((d) => d[field] > 0);
  const actualTotal = dailyPoints.reduce((acc, d) => acc + d[field], 0);

  if (diasComValor.length === 0) {
    return { projection: 0, dailyAverage: 0, daysRemaining: 0 };
  }

  const ultimoDiaComDados = Math.max(...diasComValor.map((d) => d.day));
  const historico = dailyPoints.filter((d) => d.day <= ultimoDiaComDados);
  const mediasPorSemana = calcularMediasPorDiaSemana(historico, field);

  let ghostTotal = 0;
  let daysRemaining = 0;
  for (const d of dailyPoints) {
    if (d.day > ultimoDiaComDados) {
      ghostTotal += mediasPorSemana[d.weekday] ?? 0;
      daysRemaining += 1;
    }
  }

  const dailyAverage =
    diasComValor.length > 0 ? actualTotal / diasComValor.length : 0;

  return {
    projection: Math.max(0, Math.round(actualTotal + ghostTotal)),
    dailyAverage,
    daysRemaining,
  };
}

/** Monta série diária completa do mês (inclui dias zerados). */
export function buildDailyVolumePoints(
  ano: number,
  mes: number,
  byDay: Map<number, { produtivas: number; improdutivas: number }>,
): DailyVolumePoint[] {
  const ultimoDia = new Date(ano, mes, 0).getDate();
  return Array.from({ length: ultimoDia }, (_, index) => {
    const day = index + 1;
    const bucket = byDay.get(day) ?? { produtivas: 0, improdutivas: 0 };
    return {
      day,
      weekday: new Date(ano, mes - 1, day).getDay(),
      produtivas: bucket.produtivas,
      improdutivas: bucket.improdutivas,
    };
  });
}

/**
 * Projeção linear (legado): Total + (Total / DiasDecorridos) × DiasRestantes.
 * Preferir `calculateMonthlyProjectionByWeekday` para KPIs de volume.
 */
export function calculateMonthlyProjection(
  input: MonthlyProjectionInput,
): MonthlyProjectionResult {
  const currentTotal = Math.max(0, input.currentTotal);
  const daysPassed = Math.max(0, input.daysPassed);
  const totalDaysInMonth = Math.max(0, input.totalDaysInMonth);
  const daysRemaining = Math.max(0, totalDaysInMonth - daysPassed);

  if (daysPassed <= 0 || totalDaysInMonth <= 0) {
    return {
      projection: Math.round(currentTotal),
      dailyAverage: 0,
      daysRemaining,
    };
  }

  const dailyAverage = currentTotal / daysPassed;
  const rawProjection = currentTotal + dailyAverage * daysRemaining;

  return {
    projection: Math.max(0, Math.round(rawProjection)),
    dailyAverage,
    daysRemaining,
  };
}

/** Converte pontos do gráfico de volume de notas para projeção compartilhada. */
export function calculateMonthlyProjectionFromChartDays(
  data: Array<{
    chave: string;
    diaJs?: number;
    produtivas: number;
    improdutivas: number;
  }>,
  field: WeekdayField = "produtivas",
): MonthlyProjectionResult {
  const dailyPoints: DailyVolumePoint[] = data.map((d) => ({
    day: Number(d.chave) || 0,
    weekday: d.diaJs ?? 0,
    produtivas: d.produtivas,
    improdutivas: d.improdutivas,
  }));
  return calculateMonthlyProjectionByWeekday(dailyPoints, field);
}

/** Série diária com valores fantasma para visualização no gráfico. */
export function applyWeekdayProjectionToChartDays<
  T extends {
    chave: string;
    diaJs?: number;
    produtivas: number;
    improdutivas: number;
    qtd_tecnicos: number;
  },
>(
  data: T[],
): Array<
  T & {
    produtivas_fantasma: number;
    tecnicos_fantasma: number | null;
  }
> {
  if (data.length === 0) {
    return data.map((d) => ({
      ...d,
      produtivas_fantasma: 0,
      tecnicos_fantasma: null,
    }));
  }

  const diasComProducao = data.filter((d) => d.produtivas > 0);
  if (diasComProducao.length === 0) {
    return data.map((d) => ({
      ...d,
      produtivas_fantasma: 0,
      tecnicos_fantasma: null,
    }));
  }

  const ultimoDiaComDados = Math.max(
    ...diasComProducao.map((d) => Number(d.chave) || 0),
  );
  const historico = data.filter((d) => (Number(d.chave) || 0) <= ultimoDiaComDados);

  const mediasProd = calcularMediasPorDiaSemana(
    historico.map((d) => ({
      day: Number(d.chave) || 0,
      weekday: d.diaJs ?? 0,
      produtivas: d.produtivas,
      improdutivas: d.improdutivas,
    })),
    "produtivas",
  );

  const mediasTec = (() => {
    const buckets = new Map<number, number[]>();
    for (const d of historico) {
      const valores = buckets.get(d.diaJs ?? 0) ?? [];
      valores.push(d.qtd_tecnicos);
      buckets.set(d.diaJs ?? 0, valores);
    }
    const mediaGlobal = mediaArredondada(historico.map((d) => d.qtd_tecnicos));
    const medias: Record<number, number> = {};
    for (let js = 0; js <= 6; js += 1) {
      const valores = buckets.get(js);
      medias[js] = valores && valores.length > 0 ? mediaArredondada(valores) : mediaGlobal;
    }
    return medias;
  })();

  return data.map((d) => {
    const diaNum = Number(d.chave) || 0;
    const isFuturo = diaNum > ultimoDiaComDados;
    const isAncora = diaNum === ultimoDiaComDados;
    const js = d.diaJs ?? 0;

    return {
      ...d,
      produtivas_fantasma: isFuturo ? (mediasProd[js] ?? 0) : 0,
      tecnicos_fantasma: isFuturo
        ? (mediasTec[js] ?? 0)
        : isAncora
          ? d.qtd_tecnicos
          : null,
    };
  });
}
