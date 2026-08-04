import type { KpiTopTecnico } from "@/lib/logistica-types";
import { formatTecnicoLabel } from "@/lib/tecnico-label";

export type KpiMockFiltro = {
  ano: number | null;
  mes: number | null;
  dia: number | null;
};

export type TecnicoDesempenhoMock = {
  id_tecnico: string;
  nome: string;
  primeiroNome: string;
  baixaMisc: number;
  notasFeitas: number;
  perdasNotas: number;
  receita: number;
  receitaPerda: number;
  freqRelativa: string;
  freqAbsoluta: string;
};

function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    return (h >>> 0) / 4294967296;
  };
}

export function chaveFiltroKpi(filtro: KpiMockFiltro): string {
  return `${filtro.ano ?? "todos"}-${filtro.mes ?? "todos"}-${filtro.dia ?? "todos"}`;
}

function formatPct(valor: number): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

/** Gera métricas mock de desempenho; recalcula quando ano/mês/dia mudam. */
export function gerarDesempenhoMock(
  tecnicos: KpiTopTecnico[],
  filtro: KpiMockFiltro,
): TecnicoDesempenhoMock[] {
  const filtroKey = chaveFiltroKpi(filtro);

  const base = tecnicos.map((tecnico) => {
    const rand = seededRandom(`${tecnico.id_tecnico}|${filtroKey}`);
    const notasFeitas = Math.floor(rand() * (150 - 50 + 1)) + 50;
    const perdasNotas = Math.floor(rand() * 20);
    const receita = notasFeitas * 85.5;
    const receitaPerda = perdasNotas * 85.5;
    const nome = formatTecnicoLabel(tecnico.nome_tecnico, tecnico.id_tecnico);
    const primeiroNome = nome.trim().split(/\s+/)[0] ?? nome;

    return {
      id_tecnico: tecnico.id_tecnico,
      nome,
      primeiroNome,
      baixaMisc: tecnico.total,
      notasFeitas,
      perdasNotas,
      receita,
      receitaPerda,
    };
  });

  const totalNotas = base.reduce((acc, t) => acc + t.notasFeitas, 0);
  const ordenados = [...base].sort((a, b) => b.notasFeitas - a.notasFeitas);

  let acumulado = 0;
  return ordenados.map((t) => {
    acumulado += t.notasFeitas;
    const freqRelativa = totalNotas > 0 ? (t.notasFeitas / totalNotas) * 100 : 0;
    const freqAbsoluta = totalNotas > 0 ? (acumulado / totalNotas) * 100 : 0;
    return {
      ...t,
      freqRelativa: formatPct(freqRelativa),
      freqAbsoluta: formatPct(freqAbsoluta),
    };
  });
}

export function somarToaMock(items: TecnicoDesempenhoMock[]): {
  totalNotasProdutivas: number;
  totalPerdaNotas: number;
} {
  return {
    totalNotasProdutivas: items.reduce((acc, t) => acc + t.notasFeitas, 0),
    totalPerdaNotas: items.reduce((acc, t) => acc + t.perdasNotas, 0),
  };
}
