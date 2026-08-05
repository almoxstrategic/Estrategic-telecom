import { useSyncExternalStore } from "react";

const STORAGE_KEY = "estrategic.kpis.ultima-importacao";
const UPDATE_EVENT = "kpi-ultima-importacao-updated";

type UltimaImportacaoSnapshot = {
  updatedAt: string | null;
};

const EMPTY: UltimaImportacaoSnapshot = { updatedAt: null };

function isClient(): boolean {
  return typeof window !== "undefined";
}

function loadSnapshot(): UltimaImportacaoSnapshot {
  if (!isClient()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as { updatedAt?: unknown };
    return {
      updatedAt:
        typeof parsed.updatedAt === "string" && parsed.updatedAt
          ? parsed.updatedAt
          : null,
    };
  } catch {
    return EMPTY;
  }
}

let snapshot = loadSnapshot();

export function markKpiUltimaImportacao(date: Date = new Date()): void {
  snapshot = { updatedAt: date.toISOString() };
  if (!isClient()) return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT));
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

export function useKpiUltimaImportacao(): string | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshot.updatedAt,
    () => null,
  );
}
