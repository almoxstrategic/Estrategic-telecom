/** Remove espaços e zeros à esquerda do código legado (ex: "00022065513" → "22065513"). */
export function normalizeMaterialCode(code: string): string {
  const trimmed = code.replace(/\u00a0/g, " ").trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, "");
  return withoutLeadingZeros || trimmed;
}

/** Label padronizado para selects: "22065513 - CABO DROP" */
export function formatMaterialLabel(code: string, descr: string): string {
  return `${normalizeMaterialCode(code)} - ${descr.trim()}`;
}
