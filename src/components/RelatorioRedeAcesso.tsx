import { useId, type ReactNode } from "react";
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
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";

export type AbaCampo =
  | "RE"
  | "RC"
  | "equipamento"
  | "teste-optico"
  | "teste-otdr"
  | "teste-potencia";

export const ABAS_CAMPO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Acesso (RE)" },
  { id: "RC", label: "Rede Cliente (RC)" },
  { id: "equipamento", label: "Equipamento" },
  { id: "teste-optico", label: "Teste Óptico" },
  { id: "teste-otdr", label: "Teste OTDR" },
  { id: "teste-potencia", label: "Teste de Potência" },
];

export const ABAS_CAMPO_IMPLANTACAO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Acesso (RE)" },
  { id: "teste-otdr", label: "Teste OTDR" },
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

export const REF_TITULO_PLACEHOLDER = "Ex: Foto do quadro de energia";

export function RefTituloInput({
  value,
  onChange,
  onBlur,
  disabled = false,
}: {
  value: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="mb-1 block text-sm font-medium text-gray-700">
        Referência (REF)
      </label>
      <input
        id={id}
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        onBlur={onBlur}
        placeholder={REF_TITULO_PLACEHOLDER}
        disabled={disabled}
        className={inputClass()}
      />
    </div>
  );
}

export function ChoiceButton({
  active,
  children,
  onClick,
  disabled = false,
  locked = false,
}: {
  active: boolean;
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  locked?: boolean;
}) {
  const bloqueado = disabled || locked;
  return (
    <button
      type="button"
      onClick={bloqueado ? undefined : onClick}
      disabled={bloqueado}
      className={`flex-1 rounded-xl border px-4 py-3 text-sm font-semibold transition ${
        active
          ? `border-primary bg-primary text-primary-foreground ${locked ? "disabled:opacity-100" : ""}`
          : locked
            ? "border-border bg-muted text-muted-foreground opacity-40"
            : "border-border bg-background text-foreground hover:bg-muted"
      } ${locked ? "pointer-events-none cursor-default" : ""} ${
        bloqueado && !locked ? "disabled:cursor-not-allowed disabled:opacity-60" : ""
      }`}
    >
      {children}
    </button>
  );
}

export function TipoExecucaoPicker({
  value,
  onChange,
  locked = false,
  disabled = false,
  invalid = false,
}: {
  value: TipoExecucao | "";
  onChange?: (tipo: TipoExecucao) => void;
  locked?: boolean;
  disabled?: boolean;
  invalid?: boolean;
}) {
  return (
    <div
      className={`flex gap-2 ${locked ? "pointer-events-none" : ""} ${
        invalid ? "rounded-xl ring-1 ring-destructive" : ""
      }`}
      role="radiogroup"
      aria-label="Tipo de execução"
      aria-disabled={locked || disabled}
      aria-required={!locked}
      aria-invalid={invalid || undefined}
    >
      <ChoiceButton
        active={value === "implantacao"}
        locked={locked}
        disabled={disabled}
        onClick={() => onChange?.("implantacao")}
      >
        Implantação
      </ChoiceButton>
      <ChoiceButton
        active={value === "empresarial"}
        locked={locked}
        disabled={disabled}
        onClick={() => onChange?.("empresarial")}
      >
        Empresarial
      </ChoiceButton>
    </div>
  );
}

export function RelatorioAbasCampo({
  abaAtiva,
  onChange,
  abas = ABAS_CAMPO,
}: {
  abaAtiva: AbaCampo;
  onChange: (aba: AbaCampo) => void;
  abas?: { id: AbaCampo; label: string }[];
}) {
  return (
    <nav
      className="flex flex-wrap justify-center gap-2"
      aria-label="Seções do relatório"
    >
      {abas.map((aba) => {
        const ativa = abaAtiva === aba.id;
        return (
          <button
            key={aba.id}
            type="button"
            onClick={() => onChange(aba.id)}
            className={`w-auto rounded-full border px-3 py-1.5 text-center text-xs font-semibold md:text-sm transition ${
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

export function CampoCoordenadas({
  title = "Coordenadas",
  value,
  onChange,
  disabled = false,
  embedded = false,
}: {
  title?: string;
  value: { latitude: string; longitude: string };
  onChange?: (next: { latitude: string; longitude: string }) => void;
  disabled?: boolean;
  /** Sem card externo (quando já está dentro de outro bloco). */
  embedded?: boolean;
}) {
  const idLat = useId();
  const idLng = useId();
  const body = (
    <>
      <h3 className="text-sm font-bold">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor={idLat} className="mb-1.5 block text-sm font-semibold">
            Latitude (Y)
          </label>
          <input
            id={idLat}
            type="text"
            inputMode="decimal"
            placeholder="Ex: -23.550520"
            value={value.latitude}
            disabled={disabled || !onChange}
            onChange={(e) => onChange?.({ ...value, latitude: e.target.value })}
            className={inputClass()}
          />
        </div>
        <div>
          <label htmlFor={idLng} className="mb-1.5 block text-sm font-semibold">
            Longitude (X)
          </label>
          <input
            id={idLng}
            type="text"
            inputMode="decimal"
            placeholder="Ex: -46.633308"
            value={value.longitude}
            disabled={disabled || !onChange}
            onChange={(e) => onChange?.({ ...value, longitude: e.target.value })}
            className={inputClass()}
          />
        </div>
      </div>
    </>
  );
  if (embedded) return <div className="space-y-3">{body}</div>;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">{body}</div>
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
  quantidade?: number | null;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  onQuantidadeChange?: (value: number | null) => void;
  coordenadas?: { latitude: string; longitude: string };
  coordenadasTitle?: string;
  onCoordenadasChange?: (next: { latitude: string; longitude: string }) => void;
};

export function CampoQuantidade({
  label,
  placeholder,
  value,
  onChange,
  disabled = false,
}: {
  label: string;
  placeholder: string;
  value: number | null;
  onChange?: (value: number | null) => void;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="mb-4">
      <label htmlFor={id} className="mb-1.5 block text-sm font-semibold">
        {label}
      </label>
      <input
        id={id}
        type="number"
        min={0}
        step={1}
        inputMode="numeric"
        placeholder={placeholder}
        value={value ?? ""}
        disabled={disabled || !onChange}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange?.(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 0) return;
          onChange?.(Math.trunc(n));
        }}
        className={inputClass()}
      />
    </div>
  );
}

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

        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
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
            headerExtra={
              grupo.quantidadeLabel || grupo.coordenadas ? (
                <div className="space-y-3">
                  {grupo.quantidadeLabel ? (
                    <CampoQuantidade
                      label={grupo.quantidadeLabel}
                      placeholder={grupo.quantidadePlaceholder ?? "Ex: 0"}
                      value={grupo.quantidade ?? null}
                      onChange={grupo.onQuantidadeChange}
                      disabled={readOnly}
                    />
                  ) : null}
                  {grupo.coordenadas ? (
                    <CampoCoordenadas
                      title={grupo.coordenadasTitle ?? "Coordenadas"}
                      value={grupo.coordenadas}
                      onChange={grupo.onCoordenadasChange}
                      disabled={readOnly}
                      embedded
                    />
                  ) : null}
                </div>
              ) : null
            }
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
    onOutrasChange((prev) => prev.filter((row) => row.id !== id));
  };

  return (
    <div className="space-y-4">
      <h2 className="text-base font-bold">{title}</h2>
      {outras.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
      ) : (
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          {outras.map((item, index) => (
            <div
              key={item.id}
              className="relative flex h-full flex-col space-y-3 rounded-xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <RefTituloInput
                  value={item.ref}
                  disabled={readOnly}
                  onChange={(ref) =>
                    onOutrasChange((prev) =>
                      prev.map((row) => (row.id === item.id ? { ...row, ref } : row)),
                    )
                  }
                />
                {readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => removerItem(item.id, item.stored?.path)}
                    className="mt-6 shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                    aria-label={`Excluir foto extra ${index + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
              <div className="flex-1">
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
              </div>
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
          ))}
        </div>
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
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> Adicionar mais fotos
        </button>
      )}
    </div>
  );
}
