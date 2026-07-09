/** Remove espaços e zeros à esquerda do código legado (ex: "00022065513" → "22065513"). */
export function normalizeMaterialCode(code: string): string {
  const trimmed = code.replace(/\u00a0/g, " ").trim();
  const withoutLeadingZeros = trimmed.replace(/^0+/, "");
  return withoutLeadingZeros || trimmed;
}

type MaterialComTotal = {
  material: string;
  descr_material: string;
  total: number;
};

/** Consolida itens pelo código do material, somando totais e mantendo a 1ª descrição. */
export function consolidarMateriaisPorCodigo<T extends MaterialComTotal>(items: T[]): T[] {
  const acc = new Map<string, T>();

  for (const item of items) {
    const chave = normalizeMaterialCode(String(item.material).trim());
    if (!chave) continue;

    const existente = acc.get(chave);
    if (existente) {
      existente.total += item.total;
      continue;
    }

    acc.set(chave, {
      ...item,
      material: chave,
      descr_material: item.descr_material.trim(),
      total: item.total,
    });
  }

  return [...acc.values()];
}

type TopMaterialItem = {
  descricao: string;
  sku: string;
  total: number;
};

/** Consolida ranking de materiais pelo SKU/código, somando totais e mantendo a 1ª descrição. */
export function consolidarTopMateriaisPorCodigo(items: TopMaterialItem[]): TopMaterialItem[] {
  const acc = new Map<string, TopMaterialItem>();

  for (const item of items) {
    const chave = normalizeMaterialCode(String(item.sku).trim());
    if (!chave) continue;

    const existente = acc.get(chave);
    if (existente) {
      existente.total += item.total;
      continue;
    }

    acc.set(chave, {
      descricao: item.descricao.trim(),
      sku: chave,
      total: item.total,
    });
  }

  return [...acc.values()].sort((a, b) => b.total - a.total);
}

type MaterialComQtd = {
  material: string;
  descr_material: string;
  qtd_baixada: number;
};

/** Consolida consumo por técnico pelo código do material. */
export function consolidarMateriaisPorCodigoQtd<T extends MaterialComQtd>(items: T[]): T[] {
  const acc = new Map<string, T>();

  for (const item of items) {
    const chave = normalizeMaterialCode(String(item.material).trim());
    if (!chave) continue;

    const existente = acc.get(chave);
    if (existente) {
      existente.qtd_baixada += item.qtd_baixada;
      continue;
    }

    acc.set(chave, {
      ...item,
      material: chave,
      descr_material: item.descr_material.trim(),
      qtd_baixada: item.qtd_baixada,
    });
  }

  return [...acc.values()];
}

/** Label padronizado para selects: "22065513 - CABO DROP" */
export function formatMaterialLabel(code: string, descr: string): string {
  return `${normalizeMaterialCode(code)} - ${descr.trim()}`;
}
