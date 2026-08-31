import { useSyncExternalStore } from "react";

export type KpiImportacaoSource = "consumo" | "toa";

const STORAGE_KEYS: Record<KpiImportacaoSource, string> = {
  consumo: "estrategic.kpis.ultima-importacao.consumo",
  toa: "estrategic.kpis.ultima-importacao.toa",
};

const LEGACY_STORAGE_KEY = "estrategic.kpis.ultima-importacao";
const UPDATE_EVENT = "kpi-ultima-importacao-updated";

type UltimaImportacaoSnapshot = {
  updatedAt: string | null;
};

const EMPTY: UltimaImportacaoSnapshot = { updatedAt: null };

function isClient(): boolean {
  return typeof window !== "undefined";
}

function loadSourceSnapshot(source: KpiImportacaoSource): UltimaImportacaoSnapshot {
  if (!isClient()) return EMPTY;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEYS[source]);
    if (!raw && source === "toa") {
      const legacy = window.localStorage.getItem(LEGACY_STORAGE_KEY);
      if (legacy) {
        const parsed = JSON.parse(legacy) as { updatedAt?: unknown };
        return {
          updatedAt:
            typeof parsed.updatedAt === "string" && parsed.updatedAt
              ? parsed.updatedAt
              : null,
        };
      }
    }
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

function loadAllSnapshots(): Record<KpiImportacaoSource, UltimaImportacaoSnapshot> {
  return {
    consumo: loadSourceSnapshot("consumo"),
    toa: loadSourceSnapshot("toa"),
  };
}

let snapshots = loadAllSnapshots();

export function markKpiUltimaImportacao(
  source: KpiImportacaoSource,
  date: Date = new Date(),
): void {
  snapshots = {
    ...snapshots,
    [source]: { updatedAt: date.toISOString() },
  };
  if (!isClient()) return;
  window.localStorage.setItem(
    STORAGE_KEYS[source],
    JSON.stringify(snapshots[source]),
  );
  if (source === "toa") {
    window.localStorage.removeItem(LEGACY_STORAGE_KEY);
  }
  window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: { source } }));
}

function subscribe(listener: () => void): () => void {
  if (!isClient()) return () => {};
  const handleUpdate = () => {
    snapshots = loadAllSnapshots();
    listener();
  };
  window.addEventListener(UPDATE_EVENT, handleUpdate);
  window.addEventListener("storage", handleUpdate);
  return () => {
    window.removeEventListener(UPDATE_EVENT, handleUpdate);
    window.removeEventListener("storage", handleUpdate);
  };
}

export function useKpiUltimaImportacao(source: KpiImportacaoSource): string | null {
  return useSyncExternalStore(
    subscribe,
    () => snapshots[source].updatedAt,
    () => null,
  );
}
