import { useSyncExternalStore } from "react";

export type ToaLinha = {
  data: string;
  loginTecnico: string;
  numeroWo: string;
  contrato: string;
  codBaixaBruto: string;
  tipoOs: string;
};

export const TABELA_PRECOS_TOA: Record<string, number> = {
  "24 - MUDANCA DE PACOTE": 98.81,
  "31 - REFAZER INSTALACAO": 218.48,
  "15 - MUDANCA DE LOCAL DE PONTO": 167.07,
  "12 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA": 174.78,
  "1 - ADESAO - INSTALACAO DE ASSINATURA": 100,
};

export type ToaNotaProcessada = {
  data: string;
  login: string;
  numeroWo: string;
  contrato: string;
  codBaixa: number;
  /** Texto original da planilha (código + descrição, quando houver). */
  codBaixaBruto: string;
  tipoOs: string;
  isProdutiva: boolean;
  valorReceita: number;
  valorPerda: number;
};

export type ToaResumoTecnico = {
  notasFeitas: number;
  perdasNotas: number;
  receitaBruta: number;
  receitaPerda: number;
};

export type ToaAgregado = {
  resumoPorTecnico: Record<string, ToaResumoTecnico>;
  totalProdutivas: number;
  totalPerdas: number;
};

export type ToaSnapshot = {
  notasProcessadas: ToaNotaProcessada[];
  updatedAt: string | null;
};

const STORAGE_KEY = "estrategic.kpis.toa";
const UPDATE_EVENT = "toa-kpis-updated";

const EMPTY_SNAPSHOT: ToaSnapshot = {
  notasProcessadas: [],
  updatedAt: null,
};

function isClient(): boolean {
  return typeof window !== "undefined";
}

export function normalizeToaLogin(value: string): string {
  return value.trim().toUpperCase();
}

function normalizeTipoOs(value: string): string {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toUpperCase();
}

export function processarNotasTOA(linhas: ToaLinha[]): ToaNotaProcessada[] {
  const notasProcessadas: ToaNotaProcessada[] = [];

  for (const linha of linhas) {
    const login = normalizeToaLogin(linha.loginTecnico);
    const codBaixaBruto = linha.codBaixaBruto.trim();
    const data = linha.data.trim();
    const tipoOs = linha.tipoOs.trim();

    if (!login || !codBaixaBruto || !data) continue;

    const match = codBaixaBruto.match(/^(\d+)/);
    if (!match) continue;

    const codBaixa = Number.parseInt(match[1]!, 10);
    const isProdutiva = codBaixa >= 409 && codBaixa <= 599;
    const valorServico = TABELA_PRECOS_TOA[normalizeTipoOs(tipoOs)] ?? 0;
    notasProcessadas.push({
      login,
      codBaixa,
      codBaixaBruto,
      tipoOs,
      isProdutiva,
      valorReceita: isProdutiva ? valorServico : 0,
      valorPerda: isProdutiva ? 0 : valorServico,
      data,
      numeroWo: linha.numeroWo.trim(),
      contrato: linha.contrato.trim(),
    });
  }

  return notasProcessadas;
}

function normalizeNota(value: unknown): ToaNotaProcessada | null {
  if (!value || typeof value !== "object") return null;
  const nota = value as Record<string, unknown>;
  if (
    typeof nota.data !== "string" ||
    typeof nota.login !== "string" ||
    typeof nota.numeroWo !== "string" ||
    typeof nota.contrato !== "string" ||
    typeof nota.codBaixa !== "number" ||
    typeof nota.isProdutiva !== "boolean"
  ) {
    return null;
  }

  return {
    data: nota.data.trim(),
    login: normalizeToaLogin(nota.login),
    numeroWo: nota.numeroWo.trim(),
    contrato: nota.contrato.trim(),
    codBaixa: nota.codBaixa,
    codBaixaBruto:
      typeof nota.codBaixaBruto === "string" && nota.codBaixaBruto.trim()
        ? nota.codBaixaBruto.trim()
        : String(nota.codBaixa),
    tipoOs: typeof nota.tipoOs === "string" ? nota.tipoOs.trim() : "",
    isProdutiva: nota.isProdutiva,
    valorReceita:
      typeof nota.valorReceita === "number" && Number.isFinite(nota.valorReceita)
        ? nota.valorReceita
        : 0,
    valorPerda:
      typeof nota.valorPerda === "number" && Number.isFinite(nota.valorPerda)
        ? nota.valorPerda
        : 0,
  };
}

export function filtrarNotasToa(
  notas: ToaNotaProcessada[],
  filtro: { ano: number | null; mes: number | null; dia: number | null },
): ToaNotaProcessada[] {
  return notas.filter((nota) => {
    const [ano, mes, dia] = nota.data.split("-").map(Number);
    if (!ano || !mes || !dia) return false;
    if (filtro.ano !== null && ano !== filtro.ano) return false;
    if (filtro.mes !== null && mes !== filtro.mes) return false;
    if (filtro.dia !== null && dia !== filtro.dia) return false;
    return true;
  });
}

export function agregarNotasToa(notas: ToaNotaProcessada[]): ToaAgregado {
  const resumoPorTecnico: Record<string, ToaResumoTecnico> = {};
  let totalProdutivas = 0;
  let totalPerdas = 0;

  for (const nota of notas) {
    const resumo = resumoPorTecnico[nota.login] ?? {
      notasFeitas: 0,
      perdasNotas: 0,
      receitaBruta: 0,
      receitaPerda: 0,
    };

    if (nota.isProdutiva) {
      resumo.notasFeitas += 1;
      resumo.receitaBruta += nota.valorReceita;
      totalProdutivas += 1;
    } else {
      resumo.perdasNotas += 1;
      resumo.receitaPerda += nota.valorPerda;
      totalPerdas += 1;
    }
    resumoPorTecnico[nota.login] = resumo;
  }

  return { resumoPorTecnico, totalProdutivas, totalPerdas };
}

function loadSnapshot(): ToaSnapshot {
  if (!isClient()) return EMPTY_SNAPSHOT;

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_SNAPSHOT;
    const parsed = JSON.parse(raw) as {
      notasProcessadas?: unknown;
      updatedAt?: unknown;
    };
    const notasProcessadas = Array.isArray(parsed.notasProcessadas)
      ? parsed.notasProcessadas
          .map(normalizeNota)
          .filter((nota): nota is ToaNotaProcessada => nota !== null)
      : [];

    return {
      notasProcessadas,
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : null,
    };
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

let snapshot = loadSnapshot();

export function saveToaNotas(notas: ToaNotaProcessada[]): ToaSnapshot {
  const notasProcessadas = notas
    .map(normalizeNota)
    .filter((nota): nota is ToaNotaProcessada => nota !== null);
  snapshot = {
    notasProcessadas,
    updatedAt: new Date().toISOString(),
  };

  if (isClient()) {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(snapshot),
    );
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }

  return snapshot;
}

function subscribe(listener: () => void): () => void {
  if (!isClient()) return () => {};

  const handleUpdate = () => {
    snapshot = loadSnapshot();
    listener();
  };
  window.addEventListener(UPDATE_EVENT, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

function getSnapshot(): ToaSnapshot {
  return snapshot;
}

export function useToaSnapshot(): ToaSnapshot {
  return useSyncExternalStore(subscribe, getSnapshot, () => EMPTY_SNAPSHOT);
}
