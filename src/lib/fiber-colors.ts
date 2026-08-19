export const FIBER_COLORS = [
  { sigla: "VD", label: "Verde", bg: "bg-green-500 text-white" },
  { sigla: "AM", label: "Amarelo", bg: "bg-yellow-400 text-black" },
  { sigla: "BR", label: "Branco", bg: "bg-white border border-gray-300 text-black" },
  { sigla: "AZ", label: "Azul", bg: "bg-blue-600 text-white" },
  { sigla: "VM", label: "Vermelho", bg: "bg-red-600 text-white" },
  { sigla: "VT", label: "Violeta", bg: "bg-purple-600 text-white" },
  { sigla: "MA", label: "Marrom", bg: "bg-amber-800 text-white" },
  { sigla: "RO", label: "Rosa", bg: "bg-pink-400 text-white" },
  { sigla: "PR", label: "Preto", bg: "bg-black text-white" },
  { sigla: "CZ", label: "Cinza", bg: "bg-gray-400 text-black" },
  { sigla: "LR", label: "Laranja", bg: "bg-orange-500 text-white" },
  { sigla: "AQ", label: "Aqua", bg: "bg-cyan-400 text-black" },
] as const;

export function corFibraPorIndice(index: number) {
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return FIBER_COLORS[((i % 12) + 12) % 12];
}

/** Número da fibra no campo (1 = VD, 3 = BR). */
export function corFibraPorNumero(numero: number) {
  const n = Number(numero);
  if (!Number.isFinite(n) || n < 1) return corFibraPorIndice(0);
  return corFibraPorIndice(Math.trunc(n) - 1);
}
