import { useSyncExternalStore } from "react";
import type { KpisFiltro } from "@/lib/logistica-types";

type Listener = () => void;

let filtroState: KpisFiltro = { mes: null, ano: null, dia: null };
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): KpisFiltro {
  return filtroState;
}

export function getKpiFiltro(): KpisFiltro {
  return filtroState;
}

export function setKpiFiltro(
  next: KpisFiltro | ((prev: KpisFiltro) => KpisFiltro),
): void {
  filtroState = typeof next === "function" ? next(filtroState) : next;
  emit();
}

export function patchKpiFiltro(partial: Partial<KpisFiltro>): void {
  setKpiFiltro((prev) => ({ ...prev, ...partial }));
}

/** Estado compartilhado dos filtros de KPI (ano/mês/dia) entre módulos. */
export function useKpiFiltro(): KpisFiltro {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
