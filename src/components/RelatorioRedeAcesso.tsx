import type { ReactNode } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RelatorioFotosBloco, type FotoSlot } from "@/components/RelatorioFotosBloco";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  deleteRelatorioPhoto,
  type CaboMetragemPayload,
  type RelatorioFotoGrupoKey,
  type StoredPhoto,
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
  obsAdmin: string;
};

export function emptyOutraFoto(): OutraFotoState {
  return { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "", obsAdmin: "" };
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
  obsAdmin?: string;
  onObsAdminChange?: (obs: string) => void;
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
  onRemoveCabo,
  onCaboPhoto,
  grupos,
  onGrupoPhoto,
  outras,
  onOutrasChange,
  onOutraPhoto,
  showObsAdmin = false,
}: {
  readOnly: boolean;
  header?: ReactNode;
  lancamentoTitle?: string;
  lancamentoRe: "sim" | "nao" | "";
  onLancamentoRe: (value: "sim" | "nao") => void;
  cabos: CaboMetragemPayload[];
  onPatchCabo: (id: string, patch: Partial<CaboMetragemPayload>) => void;
  onAddCabo: () => void;
  onRemoveCabo?: (id: string) => void;
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
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  showObsAdmin?: boolean;
}) {
  const mostrarMetragem = lancamentoRe === "sim";
  const metragemDesabilitada = lancamentoRe === "nao";

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

        <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
        {metragemDesabilitada ? (
          <div className="pointer-events-none flex h-full flex-col rounded-2xl border border-border bg-gray-100 p-5 opacity-60 shadow-sm">
            <h2 className="text-base font-bold">Metragem de cabo</h2>
            <div className="flex min-h-[120px] flex-1 items-center justify-center">
              <span className="rounded-full bg-white px-3 py-1.5 text-center text-sm font-semibold text-gray-700">
                Sem lançamento de cabos nesta OS
              </span>
            </div>
          </div>
        ) : mostrarMetragem ? (
          <div className="flex h-full flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-base font-bold">Metragem de cabo</h2>
            {cabos.map((cabo, index) => (
              <div key={cabo.id} className="relative flex flex-col space-y-3 rounded-xl border border-border p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold">Cabo {index + 1}</p>
                  {!readOnly && index >= 1 && onRemoveCabo ? (
                    <button
                      type="button"
                      onClick={() => onRemoveCabo(cabo.id)}
                      className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                      aria-label={`Excluir cabo ${index + 1}`}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  ) : null}
                </div>
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
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="flex min-w-0 flex-col gap-1">
                    <FotoLabel>Foto Inicial</FotoLabel>
                    {cabo.fotoInicio ? (
                      <RelatorioFotoComControles
                        src={cabo.fotoInicio.url}
                        alt="Foto Inicial"
                        canEdit={!readOnly}
                        onDelete={() => {
                          void deleteRelatorioPhoto(cabo.fotoInicio?.path);
                          onCaboPhoto(cabo.id, "fotoInicio", null);
                        }}
                        onReplace={(file) => {
                          void deleteRelatorioPhoto(cabo.fotoInicio?.path);
                          onCaboPhoto(cabo.id, "fotoInicio", file);
                        }}
                      />
                    ) : readOnly ? (
                      <p className="text-sm text-muted-foreground">Sem foto inicial.</p>
                    ) : (
                      <PhotoUpload
                        label="Foto Inicial"
                        suffix="inicio"
                        hideLabel
                        compact
                        value={null}
                        onChange={(file) => {
                          if (file) onCaboPhoto(cabo.id, "fotoInicio", file);
                        }}
                      />
                    )}
                  </div>
                  <div className="flex min-w-0 flex-col gap-1">
                    <FotoLabel>Foto Final</FotoLabel>
                    {cabo.fotoFim ? (
                      <RelatorioFotoComControles
                        src={cabo.fotoFim.url}
                        alt="Foto Final"
                        canEdit={!readOnly}
                        onDelete={() => {
                          void deleteRelatorioPhoto(cabo.fotoFim?.path);
                          onCaboPhoto(cabo.id, "fotoFim", null);
                        }}
                        onReplace={(file) => {
                          void deleteRelatorioPhoto(cabo.fotoFim?.path);
                          onCaboPhoto(cabo.id, "fotoFim", file);
                        }}
                      />
                    ) : readOnly ? (
                      <p className="text-sm text-muted-foreground">Sem foto final.</p>
                    ) : (
                      <PhotoUpload
                        label="Foto Final"
                        suffix="fim"
                        hideLabel
                        compact
                        value={null}
                        onChange={(file) => {
                          if (file) onCaboPhoto(cabo.id, "fotoFim", file);
                        }}
                      />
                    )}
                  </div>
                </div>
                <div className="mt-auto w-full">
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
        </div>

        <RelatorioOutrasFotos
          title="Outras fotos"
          outras={outras}
          onOutrasChange={onOutrasChange}
          onOutraPhoto={onOutraPhoto}
          readOnly={readOnly}
        />
      </div>
    </EvidencePhotoPasteProvider>
  );
}

export function RelatorioOutrasFotos({
  title = "Outras fotos",
  outras,
  onOutrasChange,
  onOutraPhoto,
  readOnly,
  showObsAdmin = false,
}: {
  title?: string;
  outras: OutraFotoState[];
  onOutrasChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  readOnly: boolean;
  showObsAdmin?: boolean;
}) {
  const removerItem = (id: string, path?: string) => {
    void deleteRelatorioPhoto(path);
    onOutrasChange((prev) => {
      const index = prev.findIndex((row) => row.id === id);
      if (index < 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  };

  return (
    <div className="flex h-full flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{title}</h2>
      {outras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
      ) : (
        outras.map((item, index) => (
          <div key={item.id} className="relative flex flex-col space-y-3 rounded-xl border border-border p-4">
            {!readOnly && index >= 1 ? (
              <button
                type="button"
                onClick={() => removerItem(item.id, item.stored?.path)}
                className="absolute right-3 top-3 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                aria-label={`Excluir foto extra ${index + 1}`}
              >
                <Trash2 className="h-4 w-4" />
              </button>
            ) : null}
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
            <FotoLabel>Foto</FotoLabel>
            {item.stored ? (
              <RelatorioFotoComControles
                src={item.stored.url}
                alt={item.ref || "Outra foto"}
                canEdit={!readOnly}
                onDelete={() => {
                  void deleteRelatorioPhoto(item.stored?.path);
                  onOutraPhoto(item.id, null);
                }}
                onReplace={(file) => {
                  void deleteRelatorioPhoto(item.stored?.path);
                  onOutraPhoto(item.id, file);
                }}
              />
            ) : readOnly ? (
              <p className="text-sm text-muted-foreground">Sem foto.</p>
            ) : (
              <PhotoUpload
                label="Foto"
                suffix={index === 0 ? "inicio" : "fim"}
                hideLabel
                compact
                value={null}
                onChange={(file) => {
                  if (file) onOutraPhoto(item.id, file);
                }}
              />
            )}
            <div className="mt-auto w-full">
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
              { id: crypto.randomUUID(), ref: "", file: null, stored: null, obs: "", obsAdmin: "" },
            ])
          }
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Adicionar mais fotos
        </button>
      )}
    </div>
  );
}
