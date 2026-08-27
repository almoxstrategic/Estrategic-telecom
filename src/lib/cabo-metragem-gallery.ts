import { emptyCaboMetragem, type CaboMetragemPayload } from "@/lib/relatorios-transmissao";
import {
  planSmartPairedListUpload,
  type SmartPairedAssignment,
} from "@/lib/smart-multi-upload";
import type { EvidencePhotoRef } from "@/lib/types";

export type CaboFotoCampo = "fotoInicio" | "fotoFim";

export type CaboMetragemGalleryAssignment = {
  caboId: string;
  campo: CaboFotoCampo;
  file: EvidencePhotoRef;
  /** true quando o cabo foi criado nesta distribuição. */
  isNew: boolean;
};

const CAMPOS_CABO = ["fotoInicio", "fotoFim"] as const satisfies readonly CaboFotoCampo[];

/**
 * Planeja a distribuição em esteira de N fotos da galeria em slots de metragem (2 por cabo).
 *
 * A partir do slot clicado: substitui/preenche em sequência (Inicial → Final) e,
 * se sobrarem fotos, cria novos cabos automaticamente.
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
  const startCaboId = options?.startCaboId ?? cabos[0]?.id;
  const startCampo = options?.startCampo ?? "fotoInicio";
  if (!startCaboId || photos.length === 0) {
    return { assignments: [], newCabos: [] };
  }

  const { assignments, newItems } = planSmartPairedListUpload(
    cabos as CaboMetragemPayload[],
    photos,
    {
      campos: CAMPOS_CABO,
      startItemId: startCaboId,
      startCampo,
      createEmptyItem: emptyCaboMetragem,
    },
  );

  return {
    assignments: assignments.map(
      (a: SmartPairedAssignment<CaboFotoCampo, EvidencePhotoRef>) => ({
        caboId: a.itemId,
        campo: a.campo,
        file: a.file,
        isNew: a.isNewItem,
      }),
    ),
    newCabos: newItems,
  };
}
