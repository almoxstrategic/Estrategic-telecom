import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PhotoUpload, FOTO_SLOTS_ROW_CLASS, FOTO_SLOT_WRAP_CLASS } from "@/components/PhotoUpload";
import { FOTO_SLOT_CLASS, FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PendenciaItemFrame } from "@/components/pendencias/PendenciaItemFrame";
import type { EvidencePhotoRef } from "@/lib/types";
import type { PendenciaItemDef } from "@/lib/pendencias-itens";
import { deleteRelatorioPhoto, type StoredPhoto } from "@/lib/relatorios-transmissao";

export type FotoSlot = {
  id: string;
  file: EvidencePhotoRef | null;
  stored: StoredPhoto | null;
};

export function newFotoSlot(): FotoSlot {
  return { id: crypto.randomUUID(), file: null, stored: null };
}

export function slotsFromStored(fotos: StoredPhoto[], minSlots: number): FotoSlot[] {
  const slots: FotoSlot[] = fotos.map((stored) => ({
    id: crypto.randomUUID(),
    file: null,
    stored,
  }));
  while (slots.length < minSlots) slots.push(newFotoSlot());
  return slots;
}

function slotIsEmpty(slot: FotoSlot): boolean {
  return !slot.file && !slot.stored;
}

export function RelatorioFotosBloco({
  title,
  hint,
  headerExtra,
  slots,
  onChange,
  obs,
  onObsChange,
  onPickPhoto,
  minSlots = 1,
  readOnly = false,
  id,
  variant = "card",
  pendencia,
}: {
  title: string;
  hint?: string;
  headerExtra?: ReactNode;
  slots: FotoSlot[];
  onChange: (slots: FotoSlot[]) => void;
  obs: string;
  onObsChange: (obs: string) => void;
  onPickPhoto?: (slotId: string, file: EvidencePhotoRef | null) => void;
  minSlots?: number;
  readOnly?: boolean;
  id?: string;
  /** Flat: sem card — para uso dentro de Accordion (RE/RC). */
  variant?: "card" | "flat";
  pendencia?: PendenciaItemDef;
}) {
  const updateSlot = (slotId: string, patch: Partial<FotoSlot>) => {
    onChange(slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)));
  };

  const handlePick = (slotId: string, file: EvidencePhotoRef | null) => {
    if (onPickPhoto) {
      onPickPhoto(slotId, file);
      return;
    }
    updateSlot(slotId, { file, stored: file ? null : undefined });
  };

  /** Distribui N fotos da galeria nos slots vazios a partir do slot clicado. */
  const distributeGalleryFiles = (fromSlotId: string, photos: EvidencePhotoRef[]) => {
    if (photos.length === 0) return;
    if (photos.length === 1) {
      handlePick(fromSlotId, photos[0]);
      return;
    }

    const startIdx = Math.max(
      0,
      slots.findIndex((slot) => slot.id === fromSlotId),
    );
    const working = slots.map((slot) => ({ ...slot }));
    const assignments: { slotId: string; file: EvidencePhotoRef }[] = [];
    let photoIdx = 0;

    for (let i = startIdx; i < working.length && photoIdx < photos.length; i++) {
      if (!slotIsEmpty(working[i])) continue;
      assignments.push({ slotId: working[i].id, file: photos[photoIdx] });
      photoIdx += 1;
    }

    while (photoIdx < photos.length) {
      const slot = newFotoSlot();
      working.push(slot);
      assignments.push({ slotId: slot.id, file: photos[photoIdx] });
      photoIdx += 1;
    }

    if (onPickPhoto) {
      if (working.length > slots.length) {
        onChange(
          working.map((slot) => {
            const prev = slots.find((s) => s.id === slot.id);
            return prev ?? { id: slot.id, file: null, stored: null };
          }),
        );
      }
      window.setTimeout(() => {
        for (const item of assignments) {
          onPickPhoto(item.slotId, item.file);
        }
      }, 0);
      return;
    }

    onChange(
      working.map((slot) => {
        const assigned = assignments.find((a) => a.slotId === slot.id);
        if (!assigned) return slot;
        return { ...slot, file: assigned.file, stored: null };
      }),
    );
  };

  const removerSlot = (index: number) => {
    if (index < minSlots) return;
    const removed = slots[index];
    void deleteRelatorioPhoto(removed?.stored?.path);
    onChange(slots.filter((_, i) => i !== index));
  };

  const isFlat = variant === "flat";

  const body = (
    <div
      id={pendencia ? undefined : id}
      className={
        isFlat
          ? "flex scroll-mt-36 flex-col space-y-3 border-b border-gray-100 pb-6 last:border-b-0 last:pb-0"
          : "flex h-full scroll-mt-36 flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      }
    >
      <div>
        <h2 className={isFlat ? "mb-3 font-semibold text-gray-800" : "text-base font-bold"}>
          {title}
        </h2>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {headerExtra}

      <div className={FOTO_SLOTS_ROW_CLASS}>
        {slots.map((slot, index) => {
          const podeExcluir = !readOnly && index >= minSlots;
          return (
            <div key={slot.id} className={`relative ${FOTO_SLOT_WRAP_CLASS}`}>
              {podeExcluir ? (
                <button
                  type="button"
                  onClick={() => removerSlot(index)}
                  className="absolute right-0 top-0 z-10 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label={`Excluir foto ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
              <div className="pr-8">
                <FotoLabel>{`Foto ${index + 1}`}</FotoLabel>
              </div>
              {slot.file && !readOnly ? (
                <PhotoUpload
                  label={`Foto ${index + 1}`}
                  suffix={index === 0 ? "inicio" : "fim"}
                  value={slot.file}
                  hideLabel
                  onChange={(file) => handlePick(slot.id, file)}
                  onGalleryFiles={(photos) => distributeGalleryFiles(slot.id, photos)}
                  compact
                  hideHelperText
                />
              ) : slot.stored ? (
                <RelatorioFotoComControles
                  src={slot.stored.url}
                  alt={`Foto ${index + 1}`}
                  canEdit={!readOnly}
                  onDelete={() => {
                    void deleteRelatorioPhoto(slot.stored?.path);
                    handlePick(slot.id, null);
                  }}
                  onReplace={(file) => {
                    void deleteRelatorioPhoto(slot.stored?.path);
                    handlePick(slot.id, file);
                  }}
                />
              ) : readOnly ? (
                <div className={FOTO_SLOT_CLASS}>Sem foto {index + 1}</div>
              ) : (
                <PhotoUpload
                  label={`Foto ${index + 1}`}
                  suffix={index === 0 ? "inicio" : "fim"}
                  value={null}
                  hideLabel
                  onChange={(file) => handlePick(slot.id, file)}
                  onGalleryFiles={(photos) => distributeGalleryFiles(slot.id, photos)}
                  compact
                  hideHelperText
                />
              )}
            </div>
          );
        })}
      </div>

      <div className="mt-4 w-full min-w-0 space-y-3">
        <div className="w-full">
          <label className="mb-1.5 block text-sm font-semibold">OBS</label>
          <textarea
            value={obs}
            onChange={(e) => onObsChange(e.target.value)}
            rows={2}
            disabled={readOnly}
            className="box-border w-full min-h-[64px] resize-y rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
          />
        </div>

        {readOnly ? null : (
          <button
            type="button"
            onClick={() => onChange([...slots, newFotoSlot()])}
            className="inline-flex items-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" /> Adicionar mais fotos
          </button>
        )}
      </div>
    </div>
  );

  if (!pendencia) return body;
  return <PendenciaItemFrame def={pendencia}>{body}</PendenciaItemFrame>;
}
