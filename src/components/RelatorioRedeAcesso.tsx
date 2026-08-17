import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { ExpandableImage } from "@/components/ExpandableImage";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RelatorioFotosBloco, type FotoSlot } from "@/components/RelatorioFotosBloco";
import type { EvidencePhotoRef } from "@/lib/types";
import type {
  CaboMetragemPayload,
  RelatorioFotoGrupoKey,
  StoredPhoto,
} from "@/lib/relatorios-transmissao";

export type AbaCampo = "RE" | "RC" | "equipamento" | "teste-optico" | "teste-potencia";

export const ABAS_CAMPO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Acesso (RE)" },
  { id: "RC", label: "Rede Cliente (RC)" },
  { id: "equipamento", label: "Equipamento" },
  { id: "teste-optico", label: "Teste Óptico" },
  { id: "teste-potencia", label: "Teste Potência" },
];

export type OutraFotoState = {
  id: string;
  ref: string;
  file: EvidencePhotoRef | null;
  stored: StoredPhoto | null;
  obs: string;
};

export function emptyOutraFoto(): OutraFotoState {
  return { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" };
}

export function inputClass() {
  return "w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted";
}

export function ChoiceButton({
  active,
  children,
  onClick,
  disabled = false,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      } disabled:cursor-not-allowed disabled:opacity-60`}
    >
      {children}
    </button>
  );
}

export function RelatorioAbasCampo({
  abaAtiva,
  onChange,
}: {
  abaAtiva: AbaCampo;
  onChange: (aba: AbaCampo) => void;
}) {
  return (
    <nav className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1" aria-label="Seções do relatório">
      {ABAS_CAMPO.map((aba) => {
        const ativa = abaAtiva === aba.id;
        return (
          <button
            key={aba.id}
            type="button"
            onClick={() => onChange(aba.id)}
            className={`shrink-0 rounded-full border px-3 py-2 text-xs font-semibold whitespace-nowrap transition ${
              ativa
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border bg-card text-muted-foreground hover:bg-muted"
            }`}
          >
            {aba.label}
          </button>
        );
      })}
    </nav>
  );
}

export function RelatorioAbaFixa({ label }: { label: string }) {
  return (
    <div className="-mx-1 px-1 pb-1" aria-label={label}>
      <span className="inline-flex rounded-full border border-primary bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground">
        {label}
      </span>
    </div>
  );
}

export type GrupoFotoCampo = {
  title: string;
  hint?: string;
  minSlots?: number;
  slots: FotoSlot[];
  obs: string;
  onChange: (slots: FotoSlot[]) => void;
  onObsChange: (obs: string) => void;
  grupoKey: RelatorioFotoGrupoKey;
};

export function RelatorioRedeAcesso({
  readOnly,
  header,
  lancamentoTitle = "Lançamento cabos (RE)?",
  lancamentoRe,
  onLancamentoRe,
  cabos,
  onPatchCabo,
  onAddCabo,
  onCaboPhoto,
  grupos,
  onGrupoPhoto,
  outras,
  onOutrasChange,
  onOutraPhoto,
}: {
  readOnly: boolean;
  header?: ReactNode;
  lancamentoTitle?: string;
  lancamentoRe: "sim" | "nao" | "";
  onLancamentoRe: (value: "sim" | "nao") => void;
  cabos: CaboMetragemPayload[];
  onPatchCabo: (id: string, patch: Partial<CaboMetragemPayload>) => void;
  onAddCabo: () => void;
  onCaboPhoto: (
    caboId: string,
    campo: "fotoInicio" | "fotoFim",
    file: EvidencePhotoRef | null,
  ) => void;
  grupos: GrupoFotoCampo[];
  onGrupoPhoto: (
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
  ) => void;
  outras: OutraFotoState[];
  onOutrasChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef) => void;
}) {
  const mostrarMetragem = lancamentoRe === "sim";

  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        {header}
        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-bold">{lancamentoTitle}</h2>
          <div className="flex gap-2">
            <ChoiceButton
              active={lancamentoRe === "sim"}
              onClick={() => onLancamentoRe("sim")}
              disabled={readOnly}
            >
              SIM
            </ChoiceButton>
            <ChoiceButton
              active={lancamentoRe === "nao"}
              onClick={() => onLancamentoRe("nao")}
              disabled={readOnly}
            >
              NÃO
            </ChoiceButton>
          </div>
        </div>

        {mostrarMetragem ? (
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">Metragem de cabo</h2>
            {cabos.map((cabo, index) => (
              <div key={cabo.id} className="space-y-3 rounded-xl border border-border p-4">
                <p className="text-sm font-semibold">Cabo {index + 1}</p>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Tipo do cabo</label>
                  <input
                    type="text"
                    value={cabo.tipoCabo}
                    onChange={(e) => onPatchCabo(cabo.id, { tipoCabo: e.target.value })}
                    placeholder="Ex: 12FO"
                    disabled={readOnly}
                    className={inputClass()}
                  />
                </div>
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Metragem</label>
                  <input
                    inputMode="decimal"
                    value={cabo.metragem}
                    onChange={(e) => onPatchCabo(cabo.id, { metragem: e.target.value })}
                    disabled={readOnly}
                    className={inputClass()}
                  />
                </div>
                {cabo.fotoInicio ? (
                  <div className="overflow-hidden rounded-xl border">
                    <p className="px-2 pt-2 text-sm font-semibold">Foto inicial</p>
                    <ExpandableImage src={cabo.fotoInicio.url} alt="Foto inicial" />
                    {readOnly ? null : (
                      <button
                        type="button"
                        className="w-full py-2 text-xs text-primary"
                        onClick={() => onCaboPhoto(cabo.id, "fotoInicio", null)}
                      >
                        Trocar foto
                      </button>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="text-sm text-muted-foreground">Sem foto inicial.</p>
                ) : (
                  <PhotoUpload
                    label="Foto inicial"
                    suffix="inicio"
                    value={null}
                    onChange={(file) => {
                      if (file) onCaboPhoto(cabo.id, "fotoInicio", file);
                    }}
                  />
                )}
                {cabo.fotoFim ? (
                  <div className="overflow-hidden rounded-xl border">
                    <p className="px-2 pt-2 text-sm font-semibold">Foto final</p>
                    <ExpandableImage src={cabo.fotoFim.url} alt="Foto final" />
                    {readOnly ? null : (
                      <button
                        type="button"
                        className="w-full py-2 text-xs text-primary"
                        onClick={() => onCaboPhoto(cabo.id, "fotoFim", null)}
                      >
                        Trocar foto
                      </button>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="text-sm text-muted-foreground">Sem foto final.</p>
                ) : (
                  <PhotoUpload
                    label="Foto final"
                    suffix="fim"
                    value={null}
                    onChange={(file) => {
                      if (file) onCaboPhoto(cabo.id, "fotoFim", file);
                    }}
                  />
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                  <textarea
                    value={cabo.obs}
                    onChange={(e) => onPatchCabo(cabo.id, { obs: e.target.value })}
                    rows={3}
                    disabled={readOnly}
                    className={inputClass()}
                  />
                </div>
              </div>
            ))}
            {readOnly ? null : (
              <button
                type="button"
                onClick={onAddCabo}
                className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
              >
                <Plus className="h-4 w-4" /> Adicionar mais cabo
              </button>
            )}
          </div>
        ) : null}

        {grupos.map((grupo) => (
          <RelatorioFotosBloco
            key={grupo.grupoKey}
            title={grupo.title}
            hint={grupo.hint}
            slots={grupo.slots}
            onChange={grupo.onChange}
            obs={grupo.obs}
            onObsChange={grupo.onObsChange}
            minSlots={grupo.minSlots}
            readOnly={readOnly}
            onPickPhoto={(id, file) => onGrupoPhoto(grupo.grupoKey, id, file)}
          />
        ))}

        <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-bold">Outras fotos</h2>
          {outras.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
          ) : (
            outras.map((item, index) => (
              <div key={item.id} className="space-y-3 rounded-xl border border-border p-4">
                <label className="mb-1.5 block text-sm font-semibold">REF:</label>
                <input
                  type="text"
                  value={item.ref}
                  onChange={(e) =>
                    onOutrasChange((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, ref: e.target.value } : row)),
                    )
                  }
                  className={inputClass()}
                  disabled={readOnly}
                />
                {item.stored ? (
                  <div>
                    <ExpandableImage src={item.stored.url} alt={item.ref || "Outra foto"} />
                    {readOnly ? null : (
                      <button
                        type="button"
                        className="mt-1 text-xs text-primary"
                        onClick={() =>
                          onOutrasChange((prev) =>
                            prev.map((row) =>
                              row.id === item.id ? { ...row, stored: null, file: null } : row,
                            ),
                          )
                        }
                      >
                        Trocar foto
                      </button>
                    )}
                  </div>
                ) : readOnly ? (
                  <p className="text-sm text-muted-foreground">Sem foto.</p>
                ) : (
                  <PhotoUpload
                    label="Foto"
                    suffix={index === 0 ? "inicio" : "fim"}
                    value={null}
                    onChange={(file) => {
                      if (file) onOutraPhoto(item.id, file);
                    }}
                  />
                )}
                <div>
                  <label className="mb-1.5 block text-sm font-semibold">OBS</label>
                  <textarea
                    value={item.obs}
                    onChange={(e) =>
                      onOutrasChange((prev) =>
                        prev.map((row) => (row.id === item.id ? { ...row, obs: e.target.value } : row)),
                      )
                    }
                    rows={2}
                    disabled={readOnly}
                    className={inputClass()}
                  />
                </div>
              </div>
            ))
          )}
          {readOnly ? null : (
            <button
              type="button"
              onClick={() =>
                onOutrasChange((prev) => [
                  ...prev,
                  { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "" },
                ])
              }
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" /> Adicionar mais fotos
            </button>
          )}
        </div>
      </div>
    </EvidencePhotoPasteProvider>
  );
}
