import { Plus, X } from "lucide-react";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ExpandableImage } from "@/components/ExpandableImage";
import type { EvidencePhotoRef } from "@/lib/types";
import type { StoredPhoto } from "@/lib/relatorios-transmissao";

export type FotoSlot = {
  id: string;
  file: EvidencePhotoRef | null;
  stored: StoredPhoto | null;
};

export function newFotoSlot(): FotoSlot {
  return { id: crypto.randomUUID(), file: null, stored: null };
}

export function slotsFromStored(fotos: StoredPhoto[], minSlots: number): FotoSlot[] {
  const slots = fotos.map((stored) => ({
    id: crypto.randomUUID(),
    file: null as EvidencePhotoRef | null,
    stored,
  }));
  while (slots.length < minSlots) slots.push(newFotoSlot());
  return slots;
}

export function RelatorioFotosBloco({
  title,
  hint,
  slots,
  onChange,
  obs,
  onObsChange,
  onPickPhoto,
  minSlots: _minSlots = 1,
  readOnly = false,
}: {
  title: string;
  hint?: string;
  slots: FotoSlot[];
  onChange: (slots: FotoSlot[]) => void;
  obs: string;
  onObsChange: (obs: string) => void;
  onPickPhoto?: (slotId: string, file: EvidencePhotoRef | null) => void;
  minSlots?: number;
  readOnly?: boolean;
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

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div>
        <h2 className="text-base font-bold">{title}</h2>
        {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
      </div>

      {slots.map((slot, index) => (
        <div key={slot.id} className="space-y-2">
          {slot.file && !readOnly ? (
            <PhotoUpload
              label={`Foto ${index + 1}`}
              suffix={index === 0 ? "inicio" : "fim"}
              value={slot.file}
              onChange={(file) => handlePick(slot.id, file)}
            />
          ) : slot.stored ? (
            <div>
              <div className="mb-2 flex items-center justify-between">
                <div className="text-sm font-semibold">Foto {index + 1}</div>
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => {
                      updateSlot(slot.id, { stored: null, file: null });
                      onPickPhoto?.(slot.id, null);
                    }}
                    className="rounded-lg p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    aria-label="Remover foto"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="overflow-hidden rounded-xl border border-border">
                <ExpandableImage src={slot.stored.url} alt={`Foto ${index + 1}`} />
              </div>
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
      ))}

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
  );
}
