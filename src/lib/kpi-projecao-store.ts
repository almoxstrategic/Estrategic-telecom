import { useSyncExternalStore } from "react";

export const PERCENTUAL_AUMENTO_STORAGE_KEY = "@mvp:percentualAumento";
const UPDATE_EVENT = "kpi-percentual-aumento-updated";

type Listener = () => void;

function isClient(): boolean {
  return typeof window !== "undefined";
}

function parsePercentual(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const numero = Number(value.replace(",", "."));
    if (Number.isFinite(numero)) return numero;
  }
  return 0;
}

function loadPercentualAumento(): number {
  if (!isClient()) return 0;
  try {
    return parsePercentual(
      window.localStorage.getItem(PERCENTUAL_AUMENTO_STORAGE_KEY),
    );
  } catch {
    return 0;
  }
}

let percentualAumentoState = loadPercentualAumento();
const listeners = new Set<Listener>();

function emit(): void {
  listeners.forEach((listener) => listener());
}

function subscribe(listener: Listener): () => void {
  if (!isClient()) return () => {};

  const handleUpdate = () => {
    percentualAumentoState = loadPercentualAumento();
    listener();
  };

  listeners.add(listener);
  window.addEventListener(UPDATE_EVENT, handleUpdate);
  window.addEventListener("storage", handleUpdate);

  return () => {
    listeners.delete(listener);
    window.removeEventListener(UPDATE_EVENT, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

function getSnapshot(): number {
  return percentualAumentoState;
}

export function getPercentualAumento(): number {
  return percentualAumentoState;
}

export function setPercentualAumento(valor: number | string | null | undefined): number {
  const next =
    valor === null || valor === undefined || String(valor).trim() === ""
      ? 0
      : parsePercentual(valor);

  percentualAumentoState = next;

  if (isClient()) {
    window.localStorage.setItem(PERCENTUAL_AUMENTO_STORAGE_KEY, String(next));
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
  }

  emit();
  return next;
}

/** Projeção de aumento (%) compartilhada entre telas de KPI. */
export function usePercentualAumento(): number {
  return useSyncExternalStore(subscribe, getSnapshot, () => 0);
}
