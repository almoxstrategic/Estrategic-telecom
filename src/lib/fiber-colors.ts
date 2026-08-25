/** Cor de identificação de fibra (12 cores, cicla a cada tubo). */
export type FiberColor = {
  sigla: string;
  label: string;
  bg: string;
  fill: readonly [number, number, number];
  text: readonly [number, number, number];
};

/** Padrão Telebrás/ABNT (BR) ou EIA598-A (EUA). */
export type PadraoCoresFibra = "br" | "eua";

const VD: FiberColor = {
  sigla: "VD",
  label: "Verde",
  bg: "bg-green-500 text-white",
  fill: [34, 197, 94],
  text: [255, 255, 255],
};
const AM: FiberColor = {
  sigla: "AM",
  label: "Amarelo",
  bg: "bg-yellow-400 text-black",
  fill: [250, 204, 21],
  text: [0, 0, 0],
};
const BR: FiberColor = {
  sigla: "BR",
  label: "Branco",
  bg: "bg-white border border-gray-300 text-black",
  fill: [255, 255, 255],
  text: [0, 0, 0],
};
const AZ: FiberColor = {
  sigla: "AZ",
  label: "Azul",
  bg: "bg-blue-600 text-white",
  fill: [37, 99, 235],
  text: [255, 255, 255],
};
const VM: FiberColor = {
  sigla: "VM",
  label: "Vermelho",
  bg: "bg-red-600 text-white",
  fill: [220, 38, 38],
  text: [255, 255, 255],
};
const VT: FiberColor = {
  sigla: "VT",
  label: "Violeta",
  bg: "bg-purple-600 text-white",
  fill: [147, 51, 234],
  text: [255, 255, 255],
};
const MA: FiberColor = {
  sigla: "MA",
  label: "Marrom",
  bg: "bg-amber-800 text-white",
  fill: [146, 64, 14],
  text: [255, 255, 255],
};
const RO: FiberColor = {
  sigla: "RO",
  label: "Rosa",
  bg: "bg-pink-400 text-white",
  fill: [244, 114, 182],
  text: [255, 255, 255],
};
const PR: FiberColor = {
  sigla: "PR",
  label: "Preto",
  bg: "bg-black text-white",
  fill: [0, 0, 0],
  text: [255, 255, 255],
};
const CZ: FiberColor = {
  sigla: "CZ",
  label: "Cinza",
  bg: "bg-gray-400 text-black",
  fill: [156, 163, 175],
  text: [0, 0, 0],
};
const LR: FiberColor = {
  sigla: "LR",
  label: "Laranja",
  bg: "bg-orange-500 text-white",
  fill: [249, 115, 22],
  text: [255, 255, 255],
};
const AQ: FiberColor = {
  sigla: "AQ",
  label: "Aqua",
  bg: "bg-cyan-400 text-black",
  fill: [34, 211, 238],
  text: [0, 0, 0],
};

/** Sequência ABNT / Telebrás (1→12). */
export const FIBER_COLORS_BR: readonly FiberColor[] = [
  VD,
  AM,
  BR,
  AZ,
  VM,
  VT,
  MA,
  RO,
  PR,
  CZ,
  LR,
  AQ,
];

/** Sequência EIA598-A / EUA (1→12). */
export const FIBER_COLORS_EUA: readonly FiberColor[] = [
  AZ,
  LR,
  VD,
  MA,
  CZ,
  BR,
  VM,
  PR,
  AM,
  VT,
  RO,
  AQ,
];

/** Alias histórico = padrão BR. */
export const FIBER_COLORS = FIBER_COLORS_BR;

export function parsePadraoCoresFibra(raw: unknown): PadraoCoresFibra {
  return raw === "eua" ? "eua" : "br";
}

export function fiberColorsForPadrao(padrao: PadraoCoresFibra = "br"): readonly FiberColor[] {
  return padrao === "eua" ? FIBER_COLORS_EUA : FIBER_COLORS_BR;
}

export function corFibraPorIndice(index: number, padrao: PadraoCoresFibra = "br"): FiberColor {
  const colors = fiberColorsForPadrao(padrao);
  const i = Number.isFinite(index) ? Math.trunc(index) : 0;
  return colors[((i % 12) + 12) % 12]!;
}

/** Número da fibra no campo (1-based). */
export function corFibraPorNumero(numero: number, padrao: PadraoCoresFibra = "br"): FiberColor {
  const n = Number(numero);
  if (!Number.isFinite(n) || n < 1) return corFibraPorIndice(0, padrao);
  return corFibraPorIndice(Math.trunc(n) - 1, padrao);
}
