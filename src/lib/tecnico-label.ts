/** Exibe nome do técnico cadastrado ou matrícula como fallback. */
export function formatTecnicoLabel(
  nome: string | null | undefined,
  matricula: string,
): string {
  const n = nome?.trim();
  if (n && n !== "—") return n;
  return matricula.trim();
}

/** Título do modal de detalhes: "Nome (Matrícula)" ou só matrícula. */
export function formatTecnicoModalTitle(
  nome: string | null | undefined,
  matricula: string,
): string {
  const m = matricula.trim();
  const n = nome?.trim();
  if (n && n !== "—") return `${n} (${m})`;
  return m;
}
