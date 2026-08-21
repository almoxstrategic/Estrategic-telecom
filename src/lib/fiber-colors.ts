export const FIBER_COLORS = [
  { sigla: "VD", label: "Verde", bg: "bg-green-500 text-white", fill: [34, 197, 94], text: [255, 255, 255] },
  { sigla: "AM", label: "Amarelo", bg: "bg-yellow-400 text-black", fill: [250, 204, 21], text: [0, 0, 0] },
  { sigla: "BR", label: "Branco", bg: "bg-white border border-gray-300 text-black", fill: [255, 255, 255], text: [0, 0, 0] },
  { sigla: "AZ", label: "Azul", bg: "bg-blue-600 text-white", fill: [37, 99, 235], text: [255, 255, 255] },
  { sigla: "VM", label: "Vermelho", bg: "bg-red-600 text-white", fill: [220, 38, 38], text: [255, 255, 255] },
  { sigla: "VT", label: "Violeta", bg: "bg-purple-600 text-white", fill: [147, 51, 234], text: [255, 255, 255] },
  { sigla: "MA", label: "Marrom", bg: "bg-amber-800 text-white", fill: [146, 64, 14], text: [255, 255, 255] },
  { sigla: "RO", label: "Rosa", bg: "bg-pink-400 text-white", fill: [244, 114, 182], text: [255, 255, 255] },
  { sigla: "PR", label: "Preto", bg: "bg-black text-white", fill: [0, 0, 0], text: [255, 255, 255] },
  { sigla: "CZ", label: "Cinza", bg: "bg-gray-400 text-black", fill: [156, 163, 175], text: [0, 0, 0] },
  { sigla: "LR", label: "Laranja", bg: "bg-orange-500 text-white", fill: [249, 115, 22], text: [255, 255, 255] },
  { sigla: "AQ", label: "Aqua", bg: "bg-cyan-400 text-black", fill: [34, 211, 238], text: [0, 0, 0] },
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
