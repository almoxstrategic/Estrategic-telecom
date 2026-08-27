/**
 * Distribuição inteligente em esteira para upload múltiplo de fotos.
 *
 * A partir do slot onde o upload foi iniciado:
 * 1. A 1ª foto preenche/substitui esse slot.
 * 2. As seguintes seguem na ordem dos campos do mesmo item.
 * 3. Ao esgotar o item atual (e os itens seguintes já existentes),
 *    cria novos itens e continua a cascata.
 */

export type SmartPairedAssignment<TCampo extends string, TPhoto> = {
  itemId: string;
  campo: TCampo;
  file: TPhoto;
  /** true quando o item foi criado nesta distribuição. */
  isNewItem: boolean;
};

export type SmartSlotAssignment<TPhoto> = {
  slotId: string;
  file: TPhoto;
  /** true quando o slot foi criado nesta distribuição. */
  isNewSlot: boolean;
};

type FlatPairedSlot<TCampo extends string> = {
  itemId: string;
  campo: TCampo;
  isNewItem: boolean;
};

/**
 * Planeja a esteira em listas de itens com N campos de foto por item
 * (ex.: Cabo = fotoInicio/fotoFim; Equipamento = foto/etiqueta).
 */
export function planSmartPairedListUpload<
  TItem extends { id: string },
  TPhoto,
  TCampo extends string,
>(
  items: TItem[],
  photos: TPhoto[],
  options: {
    campos: readonly TCampo[];
    startItemId: string;
    startCampo: TCampo;
    createEmptyItem: () => TItem;
  },
): {
  assignments: SmartPairedAssignment<TCampo, TPhoto>[];
  /** Itens novos a anexar à lista (ordem de criação). */
  newItems: TItem[];
} {
  if (photos.length === 0 || options.campos.length === 0) {
    return { assignments: [], newItems: [] };
  }

  const slots: FlatPairedSlot<TCampo>[] = [];
  for (const item of items) {
    for (const campo of options.campos) {
      slots.push({ itemId: item.id, campo, isNewItem: false });
    }
  }

  let startIdx = slots.findIndex(
    (s) => s.itemId === options.startItemId && s.campo === options.startCampo,
  );
  if (startIdx < 0) startIdx = 0;

  const assignments: SmartPairedAssignment<TCampo, TPhoto>[] = [];
  const newItems: TItem[] = [];
  const camposCount = options.campos.length;

  for (let photoIdx = 0; photoIdx < photos.length; photoIdx++) {
    const targetIdx = startIdx + photoIdx;

    while (targetIdx >= slots.length) {
      const novo = options.createEmptyItem();
      newItems.push(novo);
      for (const campo of options.campos) {
        slots.push({ itemId: novo.id, campo, isNewItem: true });
      }
      // Segurança: createEmptyItem deve gerar id único; evita loop infinito.
      if (camposCount === 0) break;
    }

    const slot = slots[targetIdx];
    if (!slot) break;

    assignments.push({
      itemId: slot.itemId,
      campo: slot.campo,
      file: photos[photoIdx],
      isNewItem: slot.isNewItem,
    });
  }

  return { assignments, newItems };
}

/**
 * Planeja a esteira em uma lista linear de slots (ex.: RelatorioFotosBloco).
 * A partir do slot clicado, substitui/preenche em sequência e cria slots extras se necessário.
 */
export function planSmartSlotListUpload<TSlot extends { id: string }, TPhoto>(
  slots: TSlot[],
  photos: TPhoto[],
  options: {
    startSlotId: string;
    createEmptySlot: () => TSlot;
  },
): {
  assignments: SmartSlotAssignment<TPhoto>[];
  /** Lista completa após anexar slots novos (antes de gravar as fotos). */
  nextSlots: TSlot[];
} {
  if (photos.length === 0) {
    return { assignments: [], nextSlots: slots };
  }

  const nextSlots = slots.map((s) => ({ ...s }));
  let startIdx = nextSlots.findIndex((s) => s.id === options.startSlotId);
  if (startIdx < 0) startIdx = 0;

  const assignments: SmartSlotAssignment<TPhoto>[] = [];

  for (let photoIdx = 0; photoIdx < photos.length; photoIdx++) {
    const targetIdx = startIdx + photoIdx;
    while (targetIdx >= nextSlots.length) {
      nextSlots.push(options.createEmptySlot());
    }
    const slot = nextSlots[targetIdx];
    assignments.push({
      slotId: slot.id,
      file: photos[photoIdx],
      isNewSlot: !slots.some((s) => s.id === slot.id),
    });
  }

  return { assignments, nextSlots };
}

/**
 * Garante que os itens novos existam na lista (idempotente por id).
 */
export function ensureItemsAppended<TItem extends { id: string }>(
  list: TItem[],
  newItems: TItem[],
): TItem[] {
  if (newItems.length === 0) return list;
  const ids = new Set(list.map((item) => item.id));
  const extras = newItems.filter((item) => !ids.has(item.id));
  return extras.length ? [...list, ...extras] : list;
}
