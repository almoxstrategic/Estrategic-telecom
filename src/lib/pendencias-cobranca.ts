import type { PendenciaEvidencia } from "./logistica-types";

export function filtrarWosPendentesDoTecnico(
  rows: PendenciaEvidencia[],
  idTecnico: string,
): PendenciaEvidencia[] {
  const idNormalizado = idTecnico.trim().toUpperCase();
  return rows.filter(
    (row) =>
      !row.tem_evidencia && row.id_tecnico.trim().toUpperCase() === idNormalizado,
  );
}

export function obterDataHojeIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

export function filtrarWosParaIncrementoCobranca(
  pendentes: PendenciaEvidencia[],
  dataHoje: string,
): PendenciaEvidencia[] {
  return pendentes.filter((row) => row.ultima_data_cobranca !== dataHoje);
}
