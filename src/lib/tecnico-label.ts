/** Exibe nome do técnico cadastrado ou matrícula como fallback. */
export function formatTecnicoLabel(
  nome: string | null | undefined,
  matricula: string,
): string {
  const n = nome?.trim();
  if (n && n !== "—") return n;
  return matricula.trim();
}
