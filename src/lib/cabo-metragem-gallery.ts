import { emptyCaboMetragem, type CaboMetragemPayload } from "@/lib/relatorios-transmissao";
import type { EvidencePhotoRef } from "@/lib/types";

export type CaboFotoCampo = "fotoInicio" | "fotoFim";

export type CaboMetragemGalleryAssignment = {
  caboId: string;
  campo: CaboFotoCampo;
  file: EvidencePhotoRef;
  /** true quando o cabo foi criado nesta distribuição. */
  isNew: boolean;
};

type CaboFotoSlotRef = {
  caboId: string;
  campo: CaboFotoCampo;
  empty: boolean;
};

/**
 * Planeja a distribuição de N fotos da galeria em slots de metragem (2 por cabo).
 *
 * 1. Preenche slots vagos dos cabos existentes (Inicial → Final, na ordem dos cards).
 * 2. Se sobrarem fotos, cria novos cabos automaticamente.
 *
 * Quando `startCaboId`/`startCampo` apontam para um slot vago, a 1ª foto vai para ele;
 * em seguida preenche os demais vagos na ordem do documento.
 */
export function planCaboMetragemGalleryAssignments(
  cabos: Pick<CaboMetragemPayload, "id" | "fotoInicio" | "fotoFim">[],
  photos: EvidencePhotoRef[],
  options?: {
    startCaboId?: string;
    startCampo?: CaboFotoCampo;
  },
): {
  assignments: CaboMetragemGalleryAssignment[];
  /** Cabos novos a inserir na lista (na ordem de criação). */
  newCabos: CaboMetragemPayload[];
} {
  if (photos.length === 0) {
    return { assignments: [], newCabos: [] };
  }

  const slots: CaboFotoSlotRef[] = [];
  for (const cabo of cabos) {
    slots.push({
      caboId: cabo.id,
      campo: "fotoInicio",
      empty: !cabo.fotoInicio,
    });
    slots.push({
      caboId: cabo.id,
      campo: "fotoFim",
      empty: !cabo.fotoFim,
    });
  }

  const vacant = slots.filter((s) => s.empty);
  let orderedVacant = vacant;

  if (options?.startCaboId && options.startCampo) {
    const startIdx = vacant.findIndex(
      (s) => s.caboId === options.startCaboId && s.campo === options.startCampo,
    );
    if (startIdx > 0) {
      orderedVacant = [vacant[startIdx], ...vacant.filter((_, i) => i !== startIdx)];
    }
  }

  const assignments: CaboMetragemGalleryAssignment[] = [];
  const newCabos: CaboMetragemPayload[] = [];
  let photoIdx = 0;

  for (const slot of orderedVacant) {
    if (photoIdx >= photos.length) break;
    assignments.push({
      caboId: slot.caboId,
      campo: slot.campo,
      file: photos[photoIdx],
      isNew: false,
    });
    photoIdx += 1;
  }

  while (photoIdx < photos.length) {
    const novo = emptyCaboMetragem();
    newCabos.push(novo);
    assignments.push({
      caboId: novo.id,
      campo: "fotoInicio",
      file: photos[photoIdx],
      isNew: true,
    });
    photoIdx += 1;
    if (photoIdx >= photos.length) break;
    assignments.push({
      caboId: novo.id,
      campo: "fotoFim",
      file: photos[photoIdx],
      isNew: true,
    });
    photoIdx += 1;
  }

  return { assignments, newCabos };
}
