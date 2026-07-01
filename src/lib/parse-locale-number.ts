/**
 * Higieniza Qtd Baixada do Consolidado Revisado (PT-BR, inteiro).
 * Regra: string → remove pontos → descarta após vírgula → parseInt.
 * Ex: "1.586,00" → 1586 | "1586,00" → 1586
 */
export function parseQtdBaixada(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;

  const raw = String(value).replace(/\u00a0/g, " ").trim();
  if (!raw) return 0;

  const semPontos = raw.replace(/\./g, "");
  const inteiro = (semPontos.split(",")[0] ?? "").trim();
  const n = parseInt(inteiro, 10);
  return Number.isNaN(n) ? 0 : n;
}

/**
 * Parse genérico para colunas numéricas não-inteiras (sla, status).
 */
export function parseLocaleNumber(value: string | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : 0;
  }

  const trimmed = String(value).replace(/\u00a0/g, " ").trim();
  if (!trimmed) return 0;

  const hasComma = trimmed.includes(",");
  const hasDot = trimmed.includes(".");

  if (hasComma && hasDot) {
    const n = Number(trimmed.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  if (hasComma) {
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? n : 0;
  }

  if (hasDot) {
    const segments = trimmed.split(".");
    const allNumeric = segments.every((s) => /^\d+$/.test(s));
    if (allNumeric && segments.length > 1) {
      const last = segments[segments.length - 1]!;
      if (segments.length > 2 || last.length === 3) {
        const n = Number(segments.join(""));
        return Number.isFinite(n) ? n : 0;
      }
    }
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : 0;
  }

  const n = Number(trimmed);
  return Number.isFinite(n) ? n : 0;
}

/** Exibição de quantidades inteiras (sem casas decimais). */
export function formatQuantidade(value: number): string {
  const n = Math.trunc(Number(value));
  if (!Number.isFinite(n)) return "0";
  return n.toLocaleString("pt-BR", { maximumFractionDigits: 0 });
}
