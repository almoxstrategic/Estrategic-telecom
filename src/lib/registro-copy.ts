export function formatRegistroCopyText(input: {
  contrato: string;
  wo: string;
  nomeTecnico: string;
  matricula: string;
}): string {
  return `Nº contrato: ${input.contrato.trim()}, Nº WO: ${input.wo.trim()}, Técnico: ${input.nomeTecnico.trim()}, TOA: ${input.matricula.trim()}`;
}
