import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { PhotoUpload } from "@/components/PhotoUpload";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import type { EvidencePhotoRef } from "@/lib/types";
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
}) {
  const updateSlot = (id: string, patch: Partial<FotoSlot>) => {
    onChange(slots.map((slot) => (slot.id === id ? { ...slot, ...patch } : slot)));
  };

  const handlePick = (id: string, file: EvidencePhotoRef | null) => {
    if (onPickPhoto) {
      onPickPhoto(id, file);
      return;
    }
    updateSlot(id, { file, stored: file ? null : undefined });
  };

  const removerSlot = (index: number) => {
    if (index < minSlots) return;
    const removed = slots[index];
    void deleteRelatorioPhoto(removed?.stored?.path);
    onChange(slots.filter((_, i) => i !== index));
  };

  const isFlat = variant === "flat";

  return (
    <div
      id={id}
      className={
        isFlat
          ? "flex scroll-mt-36 flex-col space-y-3 border-b border-gray-100 pb-6 last:border-b-0 last:pb-0"
          : "flex h-full scroll-mt-36 flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
      }
    >
      <div>
        <h2
          className={
            isFlat
              ? "mb-3 font-semibold text-gray-800"
              : "text-base font-bold"
          }
        >
          {title}
        </h2>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>
      {headerExtra}

      {slots.map((slot, index) => {
        const podeExcluir = !readOnly && index >= minSlots;
        return (
          <div key={slot.id} className="relative space-y-2">
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
            {slot.file && !readOnly ? (
              <PhotoUpload
                label={`Foto ${index + 1}`}
                suffix={index === 0 ? "inicio" : "fim"}
                value={slot.file}
                onChange={(file) => handlePick(slot.id, file)}
              />
            ) : slot.stored ? (
              <div>
                <div className="mb-1 pr-8">
                  <FotoLabel>{`Foto ${index + 1}`}</FotoLabel>
                </div>
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
              </div>
            ) : readOnly ? (
              <p className="text-sm text-muted-foreground">Sem foto {index + 1}.</p>
            ) : (
              <PhotoUpload
                label={`Foto ${index + 1}`}
                suffix={index === 0 ? "inicio" : "fim"}
                value={null}
                onChange={(file) => handlePick(slot.id, file)}
              />
            )}
          </div>
        );
      })}

      <div className="mt-auto w-full space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">OBS</label>
          <textarea
            value={obs}
            onChange={(e) => onObsChange(e.target.value)}
            rows={3}
            disabled={readOnly}
            className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
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
}
