export function formatRegistroCopyText(input: {
  contrato: string;
  wo: string;
  nomeTecnico: string;
  matricula: string;
}): string {
  return `Nº contrato: ${input.contrato.trim()}, Nº WO: ${input.wo.trim()}, Técnico: ${input.nomeTecnico.trim()}, TOA: ${input.matricula.trim()}`;
}

export function formatHistoricoCopyText(input: {
  contrato: string;
  wo: string;
  nomeTecnico: string;
  matricula: string;
  metragem: string | number;
}): string {
  return `Ctt: ${input.contrato.trim()}, WO: ${input.wo.trim()}, Nome do técnico: ${input.nomeTecnico.trim()}, IdToa: ${input.matricula.trim()}, Metragem: ${input.metragem}`;
}
