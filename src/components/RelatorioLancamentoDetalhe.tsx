import { useEffect, useState, type ReactNode } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { PendenciaItemFrame } from "@/components/pendencias/PendenciaItemFrame";
import { usePendencias } from "@/components/pendencias/PendenciasContext";
import {
  pendenciaFotoGrupo,
  pendenciaMetragemCabo,
  pendenciaPergunta,
  type PendenciaItemDef,
} from "@/lib/pendencias-itens";
import { EditarContratoOsDialog } from "@/components/EditarContratoOsDialog";
import {
  FOTO_SLOT_CLASS,
  FotoLabel,
  RelatorioFotoComControles,
} from "@/components/RelatorioFotoComControles";
import { PhotoUpload, FOTO_SLOTS_ROW_CLASS, FOTO_SLOT_WRAP_CLASS, FOTO_CABO_PAIR_CLASS, FOTO_CABO_SLOT_WRAP_CLASS } from "@/components/PhotoUpload";
import { RelatorioTesteOptico, RelatorioTestePotencia } from "@/components/RelatorioTestes";
import { RelatorioTestePotenciaAtenuacao } from "@/components/RelatorioTestePotenciaAtenuacao";
import {
  AbaContatos,
  AbaInfraestrutura,
  AbaMedicoes,
  EquipamentosIpsCard,
} from "@/components/RelatorioAbasPlaceholder";
import {
  ABAS_CAMPO,
  ABAS_CAMPO_IMPLANTACAO,
  AccordionBloco,
  CampoCoordenadas,
  CampoQuantidade,
  ChoiceButton,
  CordoalhaSimNaoCard,
  AmbienteToggle,
  RefTituloInput,
  RelatorioAbasCampo,
  inputClass,
  type AbaCampo,
} from "@/components/RelatorioRedeAcesso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import type { EvidencePhotoRef } from "@/lib/types";
import { planCaboMetragemGalleryAssignments } from "@/lib/cabo-metragem-gallery";
import {
  deleteRelatorioPhoto,
  emptyCaboMetragem,
  emptyCoordenadas,
  emptyCordoalhaBloco,
  emptyDgoClienteItem,
  emptyEquipamentoClienteItem,
  emptyEquipamentoConexoes,
  emptyContatos,
  emptyInfraestrutura,
  emptyQuantidadesRede,
  emptyTesteOptico,
  emptyTestePotencia,
  emptyLancamentoPorAmbiente,
  isFotoGrupoPorAmbienteKey,
  looksLikeFotoGrupoPorAmbiente,
  simDerivadoLancamento,
  apenasDigitos,
  calcularMetragemCaboTotal,
  finalizeMedicaoInput,
  janelaPotenciaDerivada,
  labelTecnicosAtribuidos,
  removeExtraById,
  removeFotoGrupoAt,
  type CaboMetragemPayload,
  type DgoClienteItemPayload,
  type EquipamentoClienteItemPayload,
  type RelatorioFotoCategoria,
  type RelatorioFotoGrupoKey,
  type EscopoPayload,
  type RelatorioPayload,
  type RelatorioStatus,
  type RelatorioTransmissao,
  type StoredPhoto,
  type AmbienteRede,
  type FotoGrupoPayload,
  type LancamentoPorAmbientePayload,
  type QuantidadesRedePayload,
} from "@/lib/relatorios-transmissao";

export function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

export function formatDateTimePendencia(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const data = new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
  }).format(d);
  const hora = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
  return `${data} às ${hora}`;
}

function tipoLabel(tipo: RelatorioTransmissao["tipo_execucao"]) {
  if (tipo === "implantacao") return "Implantação";
  if (tipo === "empresarial") return "Empresarial";
  return "Ainda não informado";
}

export function StatusBadge({ status }: { status: RelatorioStatus }) {
  if (status === "avisado") {
    return (
      <Badge className="border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600">
        Avisado
      </Badge>
    );
  }
  if (status === "pendente") {
    return (
      <Badge className="border-orange-600 bg-orange-500 text-white hover:bg-orange-500">
        Pendenciado
      </Badge>
    );
  }
  if (status === "fechado") {
    return <Badge variant="secondary">Fechado</Badge>;
  }
  return (
    <Badge variant="secondary" className="bg-gray-200 text-gray-700 hover:bg-gray-200">
      Em andamento
    </Badge>
  );
}

function Photos({
  fotos,
  labels,
  legenda,
  canEdit,
  onRemovePhoto,
  onReplacePhoto,
  onAdd,
  onAddMany,
  uploadKey,
  uploading,
}: {
  fotos: StoredPhoto[];
  labels?: string[];
  /** OBS exibida sob a foto (modo leitura). Vazia = sem texto. */
  legenda?: string;
  canEdit?: boolean;
  onRemovePhoto?: (index: number) => void;
  onReplacePhoto?: (index: number, file: EvidencePhotoRef) => void;
  onAdd?: (file: EvidencePhotoRef) => void;
  /** Upload múltiplo da galeria (gestor/técnico) — processa toda a seleção. */
  onAddMany?: (files: EvidencePhotoRef[]) => void;
  uploadKey?: string;
  uploading?: boolean;
}) {
  const legendaTrim = legenda?.trim() || "";
  const showEmptyUpload = Boolean(canEdit && onAdd && fotos.length === 0);

  const handleGalleryFiles = (photos: EvidencePhotoRef[]) => {
    if (photos.length === 0) return;
    if (photos.length === 1) {
      onAdd?.(photos[0]);
      return;
    }
    if (onAddMany) {
      onAddMany(photos);
      return;
    }
    for (const photo of photos) {
      onAdd?.(photo);
    }
  };

  if (!fotos.length) {
    return (
      <div className={`${FOTO_SLOTS_ROW_CLASS} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
        <div className={FOTO_SLOT_WRAP_CLASS}>
          <FotoLabel>{labels?.[0]}</FotoLabel>
          {showEmptyUpload ? (
            <PhotoUpload
              key={uploadKey}
              label={labels?.[0] || "Foto"}
              hideLabel
              suffix="inicio"
              value={null}
              onChange={(file) => {
                if (file) onAdd?.(file);
              }}
              onGalleryFiles={handleGalleryFiles}
              compact
              hideHelperText
            />
          ) : (
            <div className={FOTO_SLOT_CLASS}>Sem foto</div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={FOTO_SLOTS_ROW_CLASS}>
      {fotos.map((foto, index) => (
        <div key={`${foto.path}-${index}`} className={FOTO_SLOT_WRAP_CLASS}>
          <FotoLabel>{labels?.[index]}</FotoLabel>
          <RelatorioFotoComControles
            src={foto.url}
            alt={labels?.[index] || "Evidência"}
            canEdit={canEdit}
            onDelete={onRemovePhoto ? () => onRemovePhoto(index) : undefined}
            onReplace={onReplacePhoto ? (file) => onReplacePhoto(index, file) : undefined}
            onGalleryFiles={
              onAdd || onAddMany
                ? (photos) => {
                    if (photos.length === 0) return;
                    // 1ª foto substitui o slot atual; demais entram como novas.
                    if (onReplacePhoto && photos[0]) onReplacePhoto(index, photos[0]);
                    const rest = photos.slice(1);
                    if (rest.length === 0) return;
                    if (onAddMany) onAddMany(rest);
                    else for (const photo of rest) onAdd?.(photo);
                  }
                : undefined
            }
          />
          {legendaTrim ? (
            <p className="text-center text-sm text-muted-foreground">{legendaTrim}</p>
          ) : null}
        </div>
      ))}
      {canEdit && onAdd ? (
        <div className={`${FOTO_SLOT_WRAP_CLASS} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          <FotoLabel>{labels?.[fotos.length]}</FotoLabel>
          <PhotoUpload
            key={`${uploadKey}-extra`}
            label="Nova foto"
            hideLabel
            suffix="fim"
            value={null}
            onChange={(file) => {
              if (file) onAdd(file);
            }}
            onGalleryFiles={handleGalleryFiles}
            compact
            hideHelperText
          />
        </div>
      ) : null}
    </div>
  );
}

function CaboFotos({
  inicio,
  fim,
  legenda,
  canEdit,
  onRemoveCampo,
  onReplaceCampo,
  onGalleryFiles,
  uploading,
  pairLayout = false,
}: {
  inicio: StoredPhoto | null;
  fim: StoredPhoto | null;
  legenda?: string;
  canEdit?: boolean;
  onRemoveCampo?: (campo: "fotoInicio" | "fotoFim") => void;
  onReplaceCampo?: (campo: "fotoInicio" | "fotoFim", file: EvidencePhotoRef) => void;
  /** Galeria múltipla: distribui fotos e pode criar novos cabos no pai. */
  onGalleryFiles?: (campo: "fotoInicio" | "fotoFim", photos: EvidencePhotoRef[]) => void;
  uploading?: boolean;
  /** true = Foto Inicial | Final em grid-cols-2 (card Metragem). */
  pairLayout?: boolean;
}) {
  const legendaTrim = legenda?.trim() || "";
  const rowClass = pairLayout ? FOTO_CABO_PAIR_CLASS : FOTO_SLOTS_ROW_CLASS;
  const wrapClass = pairLayout ? FOTO_CABO_SLOT_WRAP_CLASS : FOTO_SLOT_WRAP_CLASS;
  return (
    <div className={`${rowClass} ${uploading ? "pointer-events-none opacity-60" : ""}`}>
      {(
        [
          ["Foto Inicial", inicio, "fotoInicio", "inicio"],
          ["Foto Final", fim, "fotoFim", "fim"],
        ] as const
      ).map(([label, foto, campo, suffix]) => (
        <div key={campo} className={wrapClass}>
          <FotoLabel>{label}</FotoLabel>
          {foto ? (
            <RelatorioFotoComControles
              src={foto.url}
              alt={label}
              canEdit={canEdit}
              fillWidth={pairLayout}
              onDelete={onRemoveCampo ? () => onRemoveCampo(campo) : undefined}
              onReplace={onReplaceCampo ? (file) => onReplaceCampo(campo, file) : undefined}
              onGalleryFiles={
                onGalleryFiles
                  ? (photos) => onGalleryFiles(campo, photos)
                  : undefined
              }
            />
          ) : canEdit && onReplaceCampo ? (
            <PhotoUpload
              label={label}
              hideLabel
              suffix={suffix}
              value={null}
              onChange={(file) => {
                if (file) onReplaceCampo(campo, file);
              }}
              onGalleryFiles={(photos) => {
                if (onGalleryFiles) {
                  onGalleryFiles(campo, photos);
                  return;
                }
                if (campo === "fotoInicio") {
                  if (photos[0]) onReplaceCampo("fotoInicio", photos[0]);
                  if (photos[1] && !fim) onReplaceCampo("fotoFim", photos[1]);
                  return;
                }
                if (photos[0]) onReplaceCampo("fotoFim", photos[0]);
              }}
              compact
              hideHelperText
              fillWidth={pairLayout}
            />
          ) : (
            <div className={pairLayout ? `${FOTO_SLOT_CLASS} max-w-none` : FOTO_SLOT_CLASS}>
              Sem foto
            </div>
          )}
          {legendaTrim ? (
            <p className="text-center text-sm text-muted-foreground">{legendaTrim}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function ObsEditavel({
  value,
  onChange,
}: {
  value: string;
  onChange?: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useDebouncedEffect(
    () => {
      if (onChange && local !== value) onChange(local);
    },
    [local],
    500,
    Boolean(onChange),
  );

  return (
    <div className="w-full space-y-1.5">
      <label className="block text-sm font-semibold">OBS</label>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (onChange && local !== value) onChange(local);
        }}
        rows={2}
        disabled={!onChange}
        className="box-border w-full min-h-[64px] resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
      />
    </div>
  );
}

function RefTituloEditavel({
  value,
  onChange,
}: {
  value: string;
  onChange?: (value: string) => void;
}) {
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  useDebouncedEffect(
    () => {
      if (onChange && local !== value) onChange(local);
    },
    [local],
    500,
    Boolean(onChange),
  );

  return (
    <RefTituloInput
      value={local}
      onChange={onChange ? setLocal : undefined}
      onBlur={() => {
        if (onChange && local !== value) onChange(local);
      }}
      disabled={!onChange}
    />
  );
}

function MetaField({ label, value }: { label: string; value: string }) {
  const empty = value === "Não informado";
  return (
    <div className="min-w-0">
      <p className="text-xs font-bold uppercase tracking-wider text-gray-500">{label}</p>
      <p className={empty ? "mt-0.5 text-sm font-normal text-gray-400" : "mt-0.5 text-sm font-medium text-gray-900"}>
        {value}
      </p>
    </div>
  );
}

function displayCadastral(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "Não informado";
}

function formatDateCadastral(value: string | null | undefined) {
  if (!value) return "Não informado";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return "Não informado";
  return d.toLocaleDateString("pt-BR");
}

function EvidenciaBloco({
  title,
  obs,
  fotos,
  caboFotos,
  canEdit,
  onAdd,
  onAddMany,
  uploadKey,
  uploading,
  onObsChange,
  onRemove,
  onRemovePhoto,
  onReplacePhoto,
  onRemoveCaboCampo,
  onReplaceCaboCampo,
  onTitleChange,
  quantidade,
  quantidadeLabel,
  quantidadePlaceholder,
  onQuantidadeChange,
  coordenadas,
  coordenadasTitle,
  onCoordenadasChange,
  headerExtra,
  pendencia,
}: {
  title: string;
  obs?: string | null;
  fotos: StoredPhoto[];
  caboFotos?: { inicio: StoredPhoto | null; fim: StoredPhoto | null };
  canEdit?: boolean;
  onAdd?: (file: EvidencePhotoRef) => void;
  onAddMany?: (files: EvidencePhotoRef[]) => void;
  uploadKey?: string;
  uploading?: boolean;
  onObsChange?: (value: string) => void;
  onRemove?: () => void;
  onRemovePhoto?: (index: number) => void;
  onReplacePhoto?: (index: number, file: EvidencePhotoRef) => void;
  onRemoveCaboCampo?: (campo: "fotoInicio" | "fotoFim") => void;
  onReplaceCaboCampo?: (campo: "fotoInicio" | "fotoFim", file: EvidencePhotoRef) => void;
  onTitleChange?: (value: string) => void;
  quantidade?: number | null;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  onQuantidadeChange?: (value: number | null) => void;
  coordenadas?: { latitude: string; longitude: string };
  coordenadasTitle?: string;
  onCoordenadasChange?: (next: { latitude: string; longitude: string }) => void;
  headerExtra?: ReactNode;
  pendencia?: PendenciaItemDef;
}) {
  if (
    !fotos.length &&
    !caboFotos?.inicio &&
    !caboFotos?.fim &&
    !obs &&
    !canEdit &&
    !onObsChange &&
    !onTitleChange &&
    quantidadeLabel == null &&
    !onQuantidadeChange &&
    !coordenadas &&
    !headerExtra
  ) {
    return null;
  }
  const body = (
    <div className="flex h-full flex-col rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        {onTitleChange ? (
          <RefTituloEditavel value={title} onChange={onTitleChange} />
        ) : (
          <h4 className="text-sm font-semibold text-gray-900">{title || "Outra foto"}</h4>
        )}
        {onRemove ? (
          <button
            type="button"
            onClick={onRemove}
            className={`${onTitleChange ? "mt-6" : ""} shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10`}
            aria-label={`Excluir ${title}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>
      {headerExtra ? <div className="mt-3">{headerExtra}</div> : null}
      {onQuantidadeChange || quantidadeLabel ? (
        <CampoQuantidade
          label={quantidadeLabel}
          placeholder={quantidadePlaceholder ?? "Ex: 0"}
          value={quantidade ?? null}
          onChange={onQuantidadeChange}
          disabled={!onQuantidadeChange}
        />
      ) : null}
      {coordenadas ? (
        <div className="mt-3">
          <CampoCoordenadas
            title={coordenadasTitle ?? "Coordenadas"}
            value={coordenadas}
            onChange={onCoordenadasChange}
            disabled={!onCoordenadasChange}
            embedded
          />
        </div>
      ) : null}
      <div className="mt-3 flex-1">
        {caboFotos ? (
          <CaboFotos
            inicio={caboFotos.inicio}
            fim={caboFotos.fim}
            legenda={!onObsChange ? obs ?? undefined : undefined}
            canEdit={canEdit}
            onRemoveCampo={onRemoveCaboCampo}
            onReplaceCampo={onReplaceCaboCampo}
            uploading={uploading}
          />
        ) : (
          <Photos
            fotos={fotos}
            legenda={!onObsChange ? obs ?? undefined : undefined}
            canEdit={canEdit}
            onRemovePhoto={onRemovePhoto}
            onReplacePhoto={onReplacePhoto}
            onAdd={canEdit ? onAdd : undefined}
            onAddMany={canEdit ? onAddMany : undefined}
            uploadKey={uploadKey}
            uploading={uploading}
          />
        )}
      </div>
      {onObsChange ? (
        <div className="mt-4 w-full min-w-0">
          <ObsEditavel value={obs ?? ""} onChange={onObsChange} />
        </div>
      ) : null}
    </div>
  );
  if (!pendencia) return body;
  return <PendenciaItemFrame def={pendencia}>{body}</PendenciaItemFrame>;
}

function PostePerguntaQuadrante({
  title,
  value,
  onChange,
  disabled,
  quantidadeLabel,
  quantidadePlaceholder,
  hideQuantidade = false,
  pendencia,
}: {
  title: string;
  value: { isSim: boolean | null; quantidade: number | null };
  onChange?: (next: { isSim: boolean | null; quantidade: number | null }) => void;
  disabled?: boolean;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  hideQuantidade?: boolean;
  pendencia?: PendenciaItemDef;
}) {
  const sim = value.isSim === true;
  const inner = (
    <div className="flex flex-col gap-2 rounded-xl border border-gray-100 bg-gray-50/60 p-4">
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceButton
          active={value.isSim === true}
          disabled={disabled || !onChange}
          onClick={() =>
            onChange?.(
              hideQuantidade
                ? { isSim: true, quantidade: null }
                : { ...value, isSim: true },
            )
          }
        >
          SIM
        </ChoiceButton>
        <ChoiceButton
          active={value.isSim === false}
          disabled={disabled || !onChange}
          onClick={() => onChange?.({ isSim: false, quantidade: null })}
        >
          NÃO
        </ChoiceButton>
      </div>
      {!hideQuantidade && sim && quantidadeLabel ? (
        <CampoQuantidade
          label={quantidadeLabel}
          placeholder={quantidadePlaceholder ?? "Ex: 0"}
          value={value.quantidade}
          onChange={(quantidade) => onChange?.({ ...value, isSim: true, quantidade })}
          disabled={disabled || !onChange}
        />
      ) : null}
    </div>
  );
  if (!pendencia) return inner;
  return <PendenciaItemFrame def={pendencia}>{inner}</PendenciaItemFrame>;
}

function BotaoAdicionar({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-primary/40 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/5"
    >
      <Plus className="h-4 w-4" /> {label}
    </button>
  );
}

function emptyOutraFoto(): EscopoPayload["outrasFotos"][number] {
  return { id: crypto.randomUUID(), ref: "", foto: null, obs: "", obsAdmin: "" };
}

function LancamentoCabosControle({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: boolean | null | undefined;
  disabled: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="space-y-3">
      <h2 className="font-semibold text-gray-800">{label}</h2>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceButton active={value === true} disabled={disabled} onClick={() => onChange(true)}>
          SIM
        </ChoiceButton>
        <ChoiceButton active={value === false} disabled={disabled} onClick={() => onChange(false)}>
          NÃO
        </ChoiceButton>
      </div>
    </div>
  );
}

function AdminListaEquipamentos({
  titulo,
  addLabel,
  showIdentificacao,
  itemLabel,
  itens,
  canEdit,
  onPatchList,
  emptyItem,
  onUploadPhoto,
}: {
  titulo: string;
  addLabel: string;
  showIdentificacao: boolean;
  itemLabel?: string;
  itens: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[];
  canEdit: boolean;
  onPatchList: (next: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[]) => void;
  emptyItem: () => EquipamentoClienteItemPayload | DgoClienteItemPayload;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const [fallback] = useState(() => emptyItem());
  const list = itens.length ? itens : [fallback];
  const label = itemLabel ?? (showIdentificacao ? "Equipamento" : "DGO/Roseta");

  const patchItem = (
    id: string,
    patch: Partial<EquipamentoClienteItemPayload & DgoClienteItemPayload>,
  ) => {
    onPatchList(list.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  };

  const setFoto = async (id: string, campo: "foto" | "etiqueta", file: EvidencePhotoRef | null) => {
    if (!canEdit) return;
    if (!file) {
      const current = list.find((row) => row.id === id);
      void deleteRelatorioPhoto(current?.[campo]?.path);
      patchItem(id, { [campo]: null });
      return;
    }
    if (!onUploadPhoto) return;
    const current = list.find((row) => row.id === id);
    const stored = await onUploadPhoto(file);
    void deleteRelatorioPhoto(current?.[campo]?.path);
    patchItem(id, { [campo]: stored });
  };

  return (
    <div className="space-y-3">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500">{titulo}</h4>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3 lg:grid-cols-3">
        {list.map((item, index) => (
          <div
            key={item.id}
            className="flex h-full flex-col gap-3 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
          >
            <div className="flex items-start justify-between gap-2">
              <h5 className="text-sm font-semibold text-gray-900">
                {label} {index + 1}
              </h5>
              {canEdit && index >= 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    void deleteRelatorioPhoto(item.foto?.path);
                    void deleteRelatorioPhoto(item.etiqueta?.path);
                    onPatchList(removeExtraById(list, item.id));
                  }}
                  className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label="Excluir item"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {(
                [
                  ["Tipo equipamento", "tipoEquipamento"],
                  ["Modelo", "modelo"],
                  ["Fabricante", "fabricante"],
                  ["SGP", "sgp"],
                  ...(showIdentificacao
                    ? ([["Identificação", "identificacao"]] as const)
                    : []),
                ] as const
              ).map(([label, key]) => (
                <div key={key}>
                  <p className="text-xs text-gray-500">{label}</p>
                  <input
                    type="text"
                    value={
                      key === "identificacao"
                        ? "identificacao" in item
                          ? item.identificacao
                          : ""
                        : item[key]
                    }
                    disabled={!canEdit}
                    onChange={(e) => patchItem(item.id, { [key]: e.target.value })}
                    className={inputClass()}
                  />
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {(
                [
                  ["Foto do equipamento", "foto"],
                  ["Etiqueta de Identificação", "etiqueta"],
                ] as const
              ).map(([label, campo]) => {
                const foto = item[campo];
                return (
                  <div key={campo}>
                    <FotoLabel>{label}</FotoLabel>
                    {foto ? (
                      <RelatorioFotoComControles
                        src={foto.url}
                        alt={label}
                        canEdit={canEdit}
                        onDelete={canEdit ? () => void setFoto(item.id, campo, null) : undefined}
                        onReplace={
                          canEdit ? (file) => void setFoto(item.id, campo, file) : undefined
                        }
                      />
                    ) : canEdit ? (
                      <PhotoUpload
                        label={label}
                        value={null}
                        onChange={(file) => void setFoto(item.id, campo, file)}
                      />
                    ) : (
                      <p className="text-sm text-muted-foreground">Sem foto</p>
                    )}
                  </div>
                );
              })}
            </div>

            <div>
              <p className="text-xs text-gray-500">OBS</p>
              <textarea
                value={item.obs}
                disabled={!canEdit}
                rows={2}
                onChange={(e) => patchItem(item.id, { obs: e.target.value })}
                className={inputClass()}
              />
            </div>
          </div>
        ))}
      </div>
      {canEdit ? (
        <button
          type="button"
          onClick={() => onPatchList([...list, emptyItem()])}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      ) : null}
    </div>
  );
}

export function RelatorioDetalhe({
  row,
  canEditPhotos,
  onAddPhoto,
  onAddPhotos,
  onReplacePhoto,
  uploadingCategoria,
  onUpdatePayload,
  canEditCadastro = false,
  onCadastroSaved,
  onUploadPhoto,
}: {
  row: RelatorioTransmissao;
  canEditPhotos: boolean;
  onAddPhoto: (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
    ambiente?: AmbienteRede,
  ) => void;
  onAddPhotos?: (
    categoria: RelatorioFotoCategoria,
    files: EvidencePhotoRef[],
    ambiente?: AmbienteRede,
  ) => void;
  onReplacePhoto?: (
    categoria: RelatorioFotoCategoria,
    file: EvidencePhotoRef,
    meta: {
      index?: number;
      caboId?: string;
      campo?: "fotoInicio" | "fotoFim";
      outraId?: string;
      itemId?: string;
      campoItem?: "foto" | "etiqueta";
      ambiente?: AmbienteRede;
    },
  ) => void;
  uploadingCategoria: RelatorioFotoCategoria | null;
  onUpdatePayload?: (payload: RelatorioPayload) => void;
  canEditCadastro?: boolean;
  onCadastroSaved?: (saved: RelatorioTransmissao) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const [abaAtiva, setAbaAtiva] = useState<AbaCampo>("RE");
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const [abaLancamentoRe, setAbaLancamentoRe] = useState<AmbienteRede>("aereo");
  const [abaLancamentoRc, setAbaLancamentoRc] = useState<AmbienteRede>("aereo");
  const [abasGrupos, setAbasGrupos] = useState<Partial<Record<RelatorioFotoGrupoKey, AmbienteRede>>>(
    {},
  );
  const pendenciasCtx = usePendencias();
  useEffect(() => {
    pendenciasCtx?.registerAbaController({ setAba: setAbaAtiva });
    return () => pendenciasCtx?.registerAbaController(null);
  }, [pendenciasCtx]);
  const isEmpresarial = row.tipo_execucao === "empresarial";
  const isImplantacao = row.tipo_execucao === "implantacao";
  const abasVisiveis = isEmpresarial
    ? ABAS_CAMPO
    : isImplantacao
      ? ABAS_CAMPO_IMPLANTACAO
      : ABAS_CAMPO_IMPLANTACAO.filter((aba) => aba.id === "RE");

  useEffect(() => {
    setAbaAtiva("RE");
  }, [row.id]);

  useEffect(() => {
    if (isEmpresarial) return;
    setAbaAtiva((atual) =>
      atual === "RE" || (isImplantacao && atual === "teste-otdr") ? atual : "RE",
    );
  }, [isEmpresarial, isImplantacao]);

  const payload = row.payload;
  const lancamentoCabosRe = payload?.lancamentoCabosRe ?? emptyLancamentoPorAmbiente();
  const lancamentoCabosRc = payload?.lancamentoCabosRc ?? emptyLancamentoPorAmbiente();
  const countFotosCabos = (list: CaboMetragemPayload[]) =>
    list.reduce(
      (acc, cabo) => acc + Number(Boolean(cabo.fotoInicio)) + Number(Boolean(cabo.fotoFim)),
      0,
    );
  const blocoCount = (categoria: RelatorioFotoCategoria, ambiente?: AmbienteRede) => {
    if (categoria === "metragensCabo") {
      const dual = payload?.lancamentoCabosRe ?? emptyLancamentoPorAmbiente();
      const aba = ambiente ?? "aereo";
      return countFotosCabos(dual[aba].metragens);
    }
    if (categoria === "metragensCaboRc") {
      const dual = payload?.lancamentoCabosRc ?? emptyLancamentoPorAmbiente();
      const aba = ambiente ?? "aereo";
      return countFotosCabos(dual[aba].metragens);
    }
    if (categoria === "outrasFotos") return payload?.outrasFotos.length ?? 0;
    if (categoria === "outrasFotosRc") return payload?.outrasFotosRc.length ?? 0;
    if (categoria === "outrasFotosEqCliente") return payload?.outrasFotosEqCliente.length ?? 0;
    if (categoria === "outrasFotosEqEstacao") return payload?.outrasFotosEqEstacao.length ?? 0;
    if (categoria === "eqClienteDgo") return payload?.eqClienteDgo.length ?? 0;
    if (categoria === "eqClienteEquipamentos") return payload?.eqClienteEquipamentos.length ?? 0;
    if (categoria === "eqEstacaoDgo") return payload?.eqEstacaoDgo.length ?? 0;
    if (categoria === "eqEstacaoEquipamento") return payload?.eqEstacaoEquipamento.length ?? 0;
    const grupo = payload?.[categoria as RelatorioFotoGrupoKey];
    if (grupo && looksLikeFotoGrupoPorAmbiente(grupo)) {
      if (ambiente) return grupo[ambiente].fotos.length;
      return grupo.aereo.fotos.length + grupo.subterraneo.fotos.length;
    }
    return grupo && "fotos" in grupo ? (grupo as FotoGrupoPayload).fotos.length : 0;
  };
  const blocoProps = (categoria: RelatorioFotoCategoria, ambiente?: AmbienteRede) => ({
    canEdit: canEditPhotos,
    onAdd: (file: EvidencePhotoRef) => onAddPhoto(categoria, file, ambiente),
    onAddMany: onAddPhotos
      ? (files: EvidencePhotoRef[]) => onAddPhotos(categoria, files, ambiente)
      : undefined,
    uploadKey: `${row.id}-${categoria}-${ambiente ?? "all"}-${blocoCount(categoria, ambiente)}`,
    uploading: uploadingCategoria === categoria,
  });

  const patchPayload = (next: RelatorioPayload) => {
    onUpdatePayload?.(next);
  };

  const patchLancamentoCabos = (
    dualKey: "lancamentoCabosRe" | "lancamentoCabosRc",
    ambiente: AmbienteRede,
    mutator: LancamentoPorAmbientePayload[AmbienteRede] extends infer B
      ? (bloco: B) => B
      : never,
  ) => {
    if (!payload) return;
    const dual = payload[dualKey];
    const nextDual = { ...dual, [ambiente]: mutator(dual[ambiente]) };
    if (dualKey === "lancamentoCabosRe") {
      patchPayload({
        ...payload,
        lancamentoCabosRe: nextDual,
        lancamentoRe: simDerivadoLancamento(nextDual),
        lancamentoReAmbiente: ambiente,
        metragensCabo: nextDual.aereo.metragens,
      });
      return;
    }
    patchPayload({
      ...payload,
      lancamentoCabosRc: nextDual,
      lancamentoRc: simDerivadoLancamento(nextDual),
      lancamentoRcAmbiente: ambiente,
      metragensCaboRc: nextDual.aereo.metragens,
    });
  };

  const patchQtdCaixas = (
    lado: "redeAcesso" | "redeCliente",
    ambiente: AmbienteRede,
    qtd: number | null,
  ) => {
    if (!payload) return;
    const current = payload[lado] ?? emptyQuantidadesRede();
    const por = { ...current.qtdCaixasEmendaPorAmbiente, [ambiente]: qtd };
    const next: RelatorioPayload = {
      ...payload,
      [lado]: {
        ...current,
        qtdCaixasEmendaPorAmbiente: por,
        qtdCaixasEmenda: (por.aereo || 0) + (por.subterraneo || 0) || null,
      },
    };
    const janela = janelaPotenciaDerivada(next.redeAcesso, next.redeCliente);
    patchPayload({ ...next, testePotencia1550: janela, testePotencia1330: janela });
  };

  const patchRedeCampo = (
    lado: "redeAcesso" | "redeCliente",
    patch: Partial<QuantidadesRedePayload>,
  ) => {
    if (!payload) return;
    const current = payload[lado] ?? emptyQuantidadesRede();
    patchPayload({
      ...payload,
      [lado]: { ...current, ...patch },
    });
  };

  const renderAterramentoQtds = (lado: "redeAcesso" | "redeCliente") => {
    const rede = payload?.[lado] ?? emptyQuantidadesRede();
    return (
      <div className="space-y-1 border-b border-gray-100 pb-4">
        <CampoQuantidade
          label="Quant. de pontos de Aterramento"
          placeholder="Ex: 2"
          value={rede.aterramento?.pontosAterramento ?? null}
          onChange={
            canEditPhotos
              ? (pontosAterramento) =>
                  patchRedeCampo(lado, {
                    aterramento: {
                      totalHastes: rede.aterramento?.totalHastes ?? null,
                      pontosAterramento,
                    },
                  })
              : undefined
          }
          disabled={!canEditPhotos}
        />
        <CampoQuantidade
          label="ATERRAMENTO -> TOTAL DE HASTES (5/8)"
          placeholder="Ex: 4"
          value={rede.aterramento?.totalHastes ?? null}
          onChange={
            canEditPhotos
              ? (totalHastes) =>
                  patchRedeCampo(lado, {
                    aterramento: {
                      pontosAterramento: rede.aterramento?.pontosAterramento ?? null,
                      totalHastes,
                    },
                  })
              : undefined
          }
          disabled={!canEditPhotos}
        />
      </div>
    );
  };

  const renderTotalPostes = (lado: "redeAcesso" | "redeCliente", variante: "RE" | "RC") => {
    const rede = payload?.[lado] ?? emptyQuantidadesRede();
    return (
      <div className="border-b border-gray-100 pb-4">
        <CampoQuantidade
          label={`Total de poste (${variante})`}
          placeholder="Ex: 12"
          value={rede.qtdTotalPostes ?? null}
          onChange={
            canEditPhotos
              ? (qtdTotalPostes) => patchRedeCampo(lado, { qtdTotalPostes })
              : undefined
          }
          disabled={!canEditPhotos}
        />
      </div>
    );
  };

  const renderConstrucaoCaixaSubterranea = (lado: "redeAcesso" | "redeCliente") => {
    const rede = payload?.[lado] ?? emptyQuantidadesRede();
    return (
      <CordoalhaSimNaoCard
        title="Construído caixa subterrânea?"
        quantidadeLabel="Quantidade de Caixas Subterrâneas"
        quantidadePlaceholder="Ex: 1"
        value={rede.construcaoCaixaSubterranea ?? emptyCordoalhaBloco()}
        onChange={
          canEditPhotos
            ? (construcaoCaixaSubterranea) =>
                patchRedeCampo(lado, { construcaoCaixaSubterranea })
            : undefined
        }
        disabled={!canEditPhotos}
        variant="flat"
      />
    );
  };

  const renderCaixaEmendaExistente = (lado: "redeAcesso" | "redeCliente", variante: "RE" | "RC") => {
    const rede = payload?.[lado] ?? emptyQuantidadesRede();
    return (
      <CordoalhaSimNaoCard
        title="Caixa de emenda existente?"
        hideQuantidade
        value={rede.caixaEmendaExistente ?? emptyCordoalhaBloco()}
        onChange={
          canEditPhotos
            ? (caixaEmendaExistente) =>
                patchRedeCampo(lado, {
                  caixaEmendaExistente: {
                    isSim: caixaEmendaExistente.isSim,
                    quantidade: null,
                  },
                })
            : undefined
        }
        disabled={!canEditPhotos}
        variant="flat"
        pendencia={pendenciaPergunta({
          aba: variante,
          secao: `Caixa de emenda (${variante})`,
          subbloco: "Caixa de emenda existente?",
          key: "caixa.caixaEmendaExistente",
        })}
      />
    );
  };

  const patchQtdFiberloop = (
    lado: "redeAcesso" | "redeCliente",
    qtdFiberloopInstalado: number | null,
  ) => {
    if (!payload) return;
    const current = payload[lado] ?? emptyQuantidadesRede();
    const fiberloopInstalado = {
      ...current.fiberloopInstalado,
      quantidade: qtdFiberloopInstalado,
      isSim: qtdFiberloopInstalado == null ? current.fiberloopInstalado?.isSim ?? null : true,
    };
    patchPayload({
      ...payload,
      [lado]: {
        ...current,
        fiberloopInstalado,
        qtdFiberloopInstalado:
          fiberloopInstalado.isSim === true ? fiberloopInstalado.quantidade : null,
      },
    });
  };

  const adicionarOutra = (
    categoria: "outrasFotos" | "outrasFotosRc" | "outrasFotosEqCliente" | "outrasFotosEqEstacao",
  ) => {
    if (!payload) return;
    patchPayload({
      ...payload,
      [categoria]: [...payload[categoria], emptyOutraFoto()],
    });
  };

  const abaGrupoDe = (key: RelatorioFotoGrupoKey): AmbienteRede =>
    abasGrupos[key] === "subterraneo" ? "subterraneo" : "aereo";

  const renderGrupo = (
    title: string,
    key: RelatorioFotoGrupoKey,
    comAmbiente = false,
    herdarAmbienteDe?: RelatorioFotoGrupoKey,
  ) => {
    const dualKey =
      (comAmbiente || !!herdarAmbienteDe) && isFotoGrupoPorAmbienteKey(key);
    const aba = herdarAmbienteDe ? abaGrupoDe(herdarAmbienteDe) : abaGrupoDe(key);
    const raw = payload?.[key];
    const grupo: FotoGrupoPayload | undefined = dualKey
      ? looksLikeFotoGrupoPorAmbiente(raw)
        ? raw[aba]
        : undefined
      : (raw as FotoGrupoPayload | undefined);
    const redeCliente = payload?.redeCliente ?? emptyQuantidadesRede();
    const redeAcesso = payload?.redeAcesso ?? emptyQuantidadesRede();
    const qtd =
      payload && (isEmpresarial || isImplantacao) && key === "caixaEmenda"
        ? {
            quantidade: redeAcesso.qtdCaixasEmendaPorAmbiente[aba] ?? null,
            quantidadeLabel: "Quantidade de Caixas de Emenda",
            quantidadePlaceholder: "Ex: 4",
            onQuantidadeChange: canEditPhotos
              ? (qtdCaixasEmenda: number | null) =>
                  patchQtdCaixas("redeAcesso", aba, qtdCaixasEmenda)
              : undefined,
          }
        : payload && isEmpresarial && key === "rcCaixaEmenda"
          ? {
              quantidade: redeCliente.qtdCaixasEmendaPorAmbiente[aba] ?? null,
              quantidadeLabel: "Quantidade de Caixas de Emenda",
              quantidadePlaceholder: "Ex: 1",
              onQuantidadeChange: canEditPhotos
                ? (qtdCaixasEmenda: number | null) =>
                    patchQtdCaixas("redeCliente", aba, qtdCaixasEmenda)
                : undefined,
              coordenadas:
                redeCliente.caixaEmendaAcomodacaoPorAmbiente[aba]?.coordenadas ??
                emptyCoordenadas(),
              coordenadasTitle: "Coordenadas da Caixa de Emenda",
              onCoordenadasChange: canEditPhotos
                ? (coordenadas: { latitude: string; longitude: string }) => {
                    if (!payload) return;
                    patchPayload({
                      ...payload,
                      redeCliente: {
                        ...redeCliente,
                        caixaEmendaAcomodacaoPorAmbiente: {
                          ...redeCliente.caixaEmendaAcomodacaoPorAmbiente,
                          [aba]: { coordenadas },
                        },
                        caixaEmendaAcomodacao:
                          aba === "aereo" ? { coordenadas } : redeCliente.caixaEmendaAcomodacao,
                      },
                    });
                  }
                : undefined,
            }
          : payload && (key === "dutoSubterraneo" || key === "rcDutoSubterraneo")
            ? {
                quantidade:
                  (key === "dutoSubterraneo" ? redeAcesso : redeCliente).metrosDutoSubterraneo ??
                  null,
                quantidadePlaceholder: "Ex: 120",
                onQuantidadeChange: canEditPhotos
                  ? (metrosDutoSubterraneo: number | null) =>
                      patchRedeCampo(
                        key === "dutoSubterraneo" ? "redeAcesso" : "redeCliente",
                        { metrosDutoSubterraneo },
                      )
                  : undefined,
              }
            : {};
    const patchSlice = (nextSlice: FotoGrupoPayload) => {
      if (!payload) return;
      if (dualKey && looksLikeFotoGrupoPorAmbiente(raw)) {
        patchPayload({
          ...payload,
          [key]: { ...raw, [aba]: nextSlice },
        });
        return;
      }
      patchPayload({ ...payload, [key]: nextSlice });
    };
    const bloco = (
      <EvidenciaBloco
        key={`${key}-${aba}`}
        title={title}
        obs={grupo?.obs}
        fotos={grupo?.fotos ?? []}
        {...qtd}
        pendencia={pendenciaFotoGrupo({
          aba: key.startsWith("rc")
            ? "RC"
            : key.startsWith("eq")
              ? "equipamento"
              : "RE",
          grupoKey: key,
          title,
        })}
        headerExtra={
          comAmbiente ? (
            <AmbienteToggle
              value={aba}
              onChange={(ambiente) => setAbasGrupos((prev) => ({ ...prev, [key]: ambiente }))}
              disabled={false}
            />
          ) : undefined
        }
        onObsChange={
          canEditPhotos
            ? (obs) => {
                if (!grupo) return;
                patchSlice({ ...grupo, obs });
              }
            : undefined
        }
        onRemovePhoto={
          canEditPhotos
            ? (index) => {
                if (!grupo) return;
                const old = grupo.fotos[index];
                patchSlice(removeFotoGrupoAt(grupo, index));
                void deleteRelatorioPhoto(old?.path);
              }
            : undefined
        }
        onReplacePhoto={
          canEditPhotos && onReplacePhoto
            ? (index, file) =>
                onReplacePhoto(key, file, { index, ambiente: dualKey ? aba : undefined })
            : undefined
        }
        {...blocoProps(key, dualKey ? aba : undefined)}
      />
    );
    return bloco;
  };

  const renderCabo = (
    cabo: CaboMetragemPayload,
    index: number,
    dualKey: "lancamentoCabosRe" | "lancamentoCabosRc",
    ambiente: AmbienteRede,
    titulo: string,
  ) => {
    const categoria = dualKey === "lancamentoCabosRe" ? "metragensCabo" : "metragensCaboRc";
    const patchCaboCampos = (patch: Partial<CaboMetragemPayload>) => {
      if (!payload || !canEditPhotos) return;
      patchLancamentoCabos(dualKey, ambiente, (lado) => ({
        ...lado,
        metragens: lado.metragens.map((item) => {
          if (item.id !== cabo.id) return item;
          const next = { ...item, ...patch };
          if ("marcacaoInicial" in patch || "marcacaoFinal" in patch) {
            next.metragem = calcularMetragemCaboTotal(next.marcacaoInicial, next.marcacaoFinal);
          }
          if ("tipoCabo" in patch && patch.tipoCabo != null) {
            next.tipoCabo = apenasDigitos(patch.tipoCabo);
          }
          return next;
        }),
      }));
    };

    return (
      <PendenciaItemFrame
        key={cabo.id}
        def={pendenciaMetragemCabo({
          aba: dualKey === "lancamentoCabosRe" ? "RE" : "RC",
          caboId: cabo.id,
          index,
        })}
      >
      <div
        className="rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          {canEditPhotos && index >= 1 ? (
            <button
              type="button"
              onClick={() => {
                patchLancamentoCabos(dualKey, ambiente, (lado) => ({
                  ...lado,
                  metragens: removeExtraById(lado.metragens, cabo.id),
                }));
              }}
              className="shrink-0 rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
              aria-label={`Excluir ${titulo}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
          <div className="space-y-3">
            <div>
              <p className="text-xs text-gray-500">Tipo do cabo</p>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={cabo.tipoCabo}
                disabled={!canEditPhotos}
                onChange={(e) => patchCaboCampos({ tipoCabo: e.target.value })}
                onBlur={(e) =>
                  patchCaboCampos({ tipoCabo: apenasDigitos(e.target.value) })
                }
                placeholder="Ex: 12"
                className={inputClass()}
              />
            </div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <div>
                <p className="text-xs text-gray-500">Marcação Inicial (m)</p>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={cabo.marcacaoInicial}
                  disabled={!canEditPhotos}
                  onChange={(e) => patchCaboCampos({ marcacaoInicial: e.target.value })}
                  onBlur={(e) =>
                    patchCaboCampos({
                      marcacaoInicial: finalizeMedicaoInput(e.target.value),
                    })
                  }
                  className={inputClass()}
                />
              </div>
              <div>
                <p className="text-xs text-gray-500">Marcação Final (m)</p>
                <input
                  type="text"
                  inputMode="decimal"
                  autoComplete="off"
                  value={cabo.marcacaoFinal}
                  disabled={!canEditPhotos}
                  onChange={(e) => patchCaboCampos({ marcacaoFinal: e.target.value })}
                  onBlur={(e) =>
                    patchCaboCampos({
                      marcacaoFinal: finalizeMedicaoInput(e.target.value),
                    })
                  }
                  className={inputClass()}
                />
              </div>
            </div>
            <div>
              <p className="text-xs text-gray-500">Metragem Total (m)</p>
              <input
                type="text"
                readOnly
                value={
                  cabo.metragem ||
                  calcularMetragemCaboTotal(cabo.marcacaoInicial, cabo.marcacaoFinal)
                }
                className={`${inputClass()} cursor-default bg-gray-100`}
                tabIndex={-1}
              />
            </div>
          </div>

          <div className="min-w-0">
            <CaboFotos
              inicio={cabo.fotoInicio}
              fim={cabo.fotoFim}
              canEdit={canEditPhotos}
              pairLayout
              uploading={uploadingCategoria === categoria}
              onRemoveCampo={
                canEditPhotos
                  ? (campo) => {
                      const old = cabo[campo];
                      patchLancamentoCabos(dualKey, ambiente, (lado) => ({
                        ...lado,
                        metragens: lado.metragens.map((item) =>
                          item.id === cabo.id ? { ...item, [campo]: null } : item,
                        ),
                      }));
                      void deleteRelatorioPhoto(old?.path);
                    }
                  : undefined
              }
              onReplaceCampo={
                canEditPhotos && onReplacePhoto
                  ? (campo, file) =>
                      onReplacePhoto(categoria, file, { caboId: cabo.id, campo, ambiente })
                  : undefined
              }
              onGalleryFiles={
                canEditPhotos && onReplacePhoto
                  ? (campo, photos) => {
                      void (async () => {
                        if (photos.length === 0) return;
                        if (photos.length === 1) {
                          onReplacePhoto(categoria, photos[0], {
                            caboId: cabo.id,
                            campo,
                            ambiente,
                          });
                          return;
                        }
                        const metragensAtuais =
                          payload?.[dualKey]?.[ambiente]?.metragens ?? [cabo];
                        const { assignments, newCabos } =
                          planCaboMetragemGalleryAssignments(metragensAtuais, photos, {
                            startCaboId: cabo.id,
                            startCampo: campo,
                          });

                        if (onUploadPhoto) {
                          const storedList = await Promise.all(
                            assignments.map((item) => onUploadPhoto(item.file)),
                          );
                          patchLancamentoCabos(dualKey, ambiente, (lado) => {
                            const ids = new Set(lado.metragens.map((c) => c.id));
                            let metragens = [
                              ...lado.metragens,
                              ...newCabos.filter((c) => !ids.has(c.id)),
                            ];
                            for (let i = 0; i < assignments.length; i++) {
                              const a = assignments[i];
                              metragens = metragens.map((item) =>
                                item.id === a.caboId
                                  ? { ...item, [a.campo]: storedList[i] }
                                  : item,
                              );
                            }
                            return { ...lado, metragens };
                          });
                          return;
                        }

                        if (newCabos.length > 0) {
                          patchLancamentoCabos(dualKey, ambiente, (lado) => {
                            const ids = new Set(lado.metragens.map((c) => c.id));
                            const extras = newCabos.filter((c) => !ids.has(c.id));
                            return {
                              ...lado,
                              metragens: extras.length
                                ? [...lado.metragens, ...extras]
                                : lado.metragens,
                            };
                          });
                        }
                        window.setTimeout(() => {
                          for (const item of assignments) {
                            onReplacePhoto(categoria, item.file, {
                              caboId: item.caboId,
                              campo: item.campo,
                              ambiente,
                            });
                          }
                        }, 0);
                      })();
                    }
                  : undefined
              }
            />
          </div>
        </div>

        <div className="mt-4 w-full min-w-0">
          {canEditPhotos ? (
            <ObsEditavel
              value={cabo.obs}
              onChange={(obs) => {
                patchLancamentoCabos(dualKey, ambiente, (lado) => ({
                  ...lado,
                  metragens: lado.metragens.map((item) =>
                    item.id === cabo.id ? { ...item, obs } : item,
                  ),
                }));
              }}
            />
          ) : cabo.obs?.trim() ? (
            <p className="text-sm text-muted-foreground">{cabo.obs}</p>
          ) : null}
        </div>
      </div>
      </PendenciaItemFrame>
    );
  };

  const renderOutra = (
    item: EscopoPayload["outrasFotos"][number],
    categoria: "outrasFotos" | "outrasFotosRc" | "outrasFotosEqCliente" | "outrasFotosEqEstacao",
  ) => (
    <EvidenciaBloco
      key={item.id}
      title={item.ref}
      obs={item.obs}
      fotos={item.foto ? [item.foto] : []}
      onTitleChange={
        canEditPhotos
          ? (ref) => {
              if (!payload) return;
              patchPayload({
                ...payload,
                [categoria]: payload[categoria].map((rowItem) =>
                  rowItem.id === item.id ? { ...rowItem, ref } : rowItem,
                ),
              });
            }
          : undefined
      }
      onObsChange={
        canEditPhotos
          ? (obs) => {
              if (!payload) return;
              patchPayload({
                ...payload,
                [categoria]: payload[categoria].map((rowItem) =>
                  rowItem.id === item.id ? { ...rowItem, obs } : rowItem,
                ),
              });
            }
          : undefined
      }
      onRemove={
        canEditPhotos
          ? () => {
              if (!payload) return;
              patchPayload({
                ...payload,
                [categoria]: payload[categoria].filter((rowItem) => rowItem.id !== item.id),
              });
              void deleteRelatorioPhoto(item.foto?.path);
            }
          : undefined
      }
      onRemovePhoto={
        canEditPhotos
          ? () => {
              if (!payload) return;
              patchPayload({
                ...payload,
                [categoria]: payload[categoria].map((rowItem) =>
                  rowItem.id === item.id ? { ...rowItem, foto: null } : rowItem,
                ),
              });
              void deleteRelatorioPhoto(item.foto?.path);
            }
          : undefined
      }
      onReplacePhoto={
        canEditPhotos && onReplacePhoto
          ? (_index, file) => onReplacePhoto(categoria, file, { outraId: item.id })
          : undefined
      }
      canEdit={canEditPhotos}
      onAdd={
        canEditPhotos && onReplacePhoto && !item.foto
          ? (file) => onReplacePhoto(categoria, file, { outraId: item.id })
          : undefined
      }
      uploadKey={`${row.id}-${categoria}-${item.id}`}
      uploading={uploadingCategoria === categoria}
    />
  );

  const renderOutrasSecao = (
    categoria: "outrasFotos" | "outrasFotosRc" | "outrasFotosEqCliente" | "outrasFotosEqEstacao",
    heading: string,
  ) => {
    const items = payload?.[categoria] ?? [];
    const visiveis = canEditPhotos
      ? items
      : items.filter((item) => item.foto || item.ref || item.obs || item.obsAdmin);
    return (
      <section className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-3">{heading}</h3>
        {visiveis.length ? (
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
            {visiveis.map((item) => renderOutra(item, categoria))}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Nenhum bloco adicional.</p>
        )}
        {canEditPhotos ? (
          <BotaoAdicionar label="Adicionar mais fotos" onClick={() => adicionarOutra(categoria)} />
        ) : null}
      </section>
    );
  };

  return (
    <div className="space-y-5">
      <div className="relative rounded-xl border border-gray-100 bg-white p-4 shadow-sm">
        {canEditCadastro ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="absolute right-4 top-4 text-muted-foreground"
            onClick={() => setModalEdicaoAberto(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            Editar Dados
          </Button>
        ) : null}
        <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Endereço</p>
        <p className="mt-1 pr-28 text-base font-medium">
          <span className={row.endereco?.trim() ? "text-gray-900" : "font-normal text-gray-400"}>
            {displayCadastral(row.endereco)}
          </span>
          <span className="text-gray-400"> · </span>
          <span className={row.cidade?.trim() ? "text-gray-900" : "font-normal text-gray-400"}>
            {displayCadastral(row.cidade)}
          </span>
        </p>
        <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 md:grid-cols-4 lg:grid-cols-5">
          <MetaField label="Operadora" value={row.cliente_operadora || "Claro"} />
          <MetaField label="Cliente" value={displayCadastral(row.cliente)} />
          <MetaField label="Responsável" value={displayCadastral(row.responsavel)} />
          <MetaField label="Empreiteira" value={displayCadastral(row.equipe_empreiteira)} />
          <MetaField
            label="Equipe"
            value={
              row.tecnicos_atribuidos.length
                ? labelTecnicosAtribuidos(row)
                : "Não informado"
            }
          />
          <MetaField label="Início" value={formatDateCadastral(row.data_inicio_execucao)} />
          <MetaField label="Tipo" value={tipoLabel(row.tipo_execucao)} />
        </div>
      </div>

      {canEditCadastro ? (
        <EditarContratoOsDialog
          open={modalEdicaoAberto}
          onOpenChange={setModalEdicaoAberto}
          row={row}
          onSaved={(saved) => onCadastroSaved?.(saved)}
        />
      ) : null}

      <RelatorioAbasCampo
        abaAtiva={abaAtiva}
        onChange={setAbaAtiva}
        abas={abasVisiveis}
        temPendencia={row.status === "pendente" || (payload?.pendenciasItens?.length ?? 0) > 0}
        motivoPendencia={row.motivo_pendencia}
        pendenciasItens={payload?.pendenciasItens ?? []}
        layoutMode="gestor"
      />

      {abaAtiva === "RE" ? (
        <div className="space-y-4">
          <AccordionBloco
            title="LANÇAMENTO (RE)"
            id="secao-cabos"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RE.lancamento"
          >
            <div className="border-b border-gray-100 pb-6">
              <div className="flex w-full flex-col gap-3">
                <LancamentoCabosControle
                  label="Lançamento cabos (RE)?"
                  value={lancamentoCabosRe[abaLancamentoRe].isSim}
                  disabled={!canEditPhotos}
                  onChange={(next) => {
                    patchLancamentoCabos("lancamentoCabosRe", abaLancamentoRe, (lado) => ({
                      ...lado,
                      isSim: next,
                      metragens:
                        next && lado.metragens.length === 0 ? [emptyCaboMetragem()] : lado.metragens,
                    }));
                  }}
                />
                <AmbienteToggle
                  value={abaLancamentoRe}
                  onChange={(ambiente) => {
                    setAbaLancamentoRe(ambiente);
                    if (!payload) return;
                    patchPayload({ ...payload, lancamentoReAmbiente: ambiente });
                  }}
                  disabled={false}
                />
              </div>
            </div>
            {lancamentoCabosRe[abaLancamentoRe].isSim === true ? (
              <div className="space-y-4 border-b border-gray-100 pb-6">
                <h2 className="font-semibold text-gray-800">Metragem de cabo</h2>
                <div className="flex flex-col gap-4">
                  {lancamentoCabosRe[abaLancamentoRe].metragens.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "lancamentoCabosRe",
                      abaLancamentoRe,
                      `Cabo ${index + 1}`,
                    ),
                  )}
                  {canEditPhotos ? (
                    <BotaoAdicionar
                      label="Adicionar mais cabo"
                      onClick={() => {
                        patchLancamentoCabos("lancamentoCabosRe", abaLancamentoRe, (lado) => ({
                          ...lado,
                          metragens: [...lado.metragens, emptyCaboMetragem()],
                        }));
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {renderGrupo("Sobra técnica", "sobraTecnica", true)}
            {abaLancamentoRe !== "subterraneo" ? (
              <CordoalhaSimNaoCard
                title="Fiberloop instalado?"
                quantidadeLabel="Quantidade de Fiberloop instalado"
                quantidadePlaceholder="Ex: 2"
                variant="flat"
                value={payload?.redeAcesso?.fiberloopInstalado ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (fiberloopInstalado) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: {
                            ...redeAcesso,
                            fiberloopInstalado,
                            qtdFiberloopInstalado:
                              fiberloopInstalado.isSim === true
                                ? fiberloopInstalado.quantidade
                                : null,
                          },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
            ) : null}
            {renderGrupo(
              "Const. de duto subterrâneo (MD ou MND) — metros (MT)",
              "dutoSubterraneo",
            )}
            {renderConstrucaoCaixaSubterranea("redeAcesso")}
          </AccordionBloco>

          <AccordionBloco
            title="POSTE (RE)"
            id="secao-poste"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RE.poste"
          >
            {renderGrupo("Poste de conexão", "posteConexao")}
            {renderTotalPostes("redeAcesso", "RE")}
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              <PostePerguntaQuadrante
                title="Cordoalha existente?"
                hideQuantidade
                pendencia={pendenciaPergunta({
                  aba: "RE",
                  secao: "Poste (RE)",
                  subbloco: "Cordoalha existente?",
                  key: "poste.cordoalhaExistente",
                })}
                value={payload?.redeAcesso?.cordoalhaExistente ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (cordoalhaExistente) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: {
                            ...redeAcesso,
                            cordoalhaExistente: {
                              isSim: cordoalhaExistente.isSim,
                              quantidade: null,
                            },
                          },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
              <PostePerguntaQuadrante
                title="Postes com cordoalha existente?"
                hideQuantidade
                pendencia={pendenciaPergunta({
                  aba: "RE",
                  secao: "Poste (RE)",
                  subbloco: "Postes com cordoalha existente?",
                  key: "poste.postesCordoalhaExistente",
                })}
                value={payload?.redeAcesso?.postesCordoalhaExistente ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (postesCordoalhaExistente) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: {
                            ...redeAcesso,
                            postesCordoalhaExistente: {
                              isSim: postesCordoalhaExistente.isSim,
                              quantidade: null,
                            },
                          },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
              <PostePerguntaQuadrante
                title="Lançado cordoalha?"
                quantidadeLabel="Quantidade de cordoalha lançada:"
                quantidadePlaceholder="Ex: 50"
                pendencia={pendenciaPergunta({
                  aba: "RE",
                  secao: "Poste (RE)",
                  subbloco: "Lançado cordoalha?",
                  key: "poste.cordoalhaLancada",
                })}
                value={payload?.redeAcesso?.cordoalhaLancada ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (cordoalhaLancada) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: { ...redeAcesso, cordoalhaLancada },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
              <PostePerguntaQuadrante
                title="Postes novo com nova cordoalha?"
                quantidadeLabel="Quantidade de Poste com nova cordoalha:"
                quantidadePlaceholder="Ex: 10"
                pendencia={pendenciaPergunta({
                  aba: "RE",
                  secao: "Poste (RE)",
                  subbloco: "Postes novo com nova cordoalha?",
                  key: "poste.postesNovaCordoalha",
                })}
                value={payload?.redeAcesso?.postesNovaCordoalha ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (postesNovaCordoalha) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: { ...redeAcesso, postesNovaCordoalha },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
            </div>
            {renderGrupo("Novo aterramento do poste", "novoAterramentoPoste")}
            {renderAterramentoQtds("redeAcesso")}
          </AccordionBloco>

          <AccordionBloco
            title="CAIXA DE EMENDA (RE)"
            id="secao-caixa-emenda"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RE.caixa"
          >
            {renderCaixaEmendaExistente("redeAcesso", "RE")}
            {renderGrupo("Caixa de emenda", "caixaEmenda", true)}
            {renderGrupo(
              "Plaqueta de Identificação - Caixa de emenda",
              "plaquetaIdentificacao",
              false,
              "caixaEmenda",
            )}
          </AccordionBloco>

          <AccordionBloco
            title="OUTRAS FOTOS (RE)"
            id="secao-outras-fotos"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RE.outras"
          >
            {renderOutrasSecao("outrasFotos", "Outras fotos")}
          </AccordionBloco>
        </div>
      ) : null}

      {abaAtiva === "RC" ? (
        <div className="space-y-4">
          <AccordionBloco
            title="LOCAL (RC)"
            id="secao-local"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RC.local"
          >
            <CampoCoordenadas
              id="secao-coordenadas-cliente"
              title="Coordenadas do Cliente"
              value={payload?.redeCliente?.coordenadas ?? emptyCoordenadas()}
              onChange={
                canEditPhotos
                  ? (coordenadas) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: { ...redeCliente, coordenadas },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
              embedded
            />
            {(
              [
                ["Cliente - (Entrada/Fachada)", "eqClienteFachada"],
                ["Cliente - Ambiente (geral da sala)", "eqClienteAmbiente"],
                ["(Rack ou Local)", "eqClienteRack"],
              ] as const
            ).map(([title, key]) => renderGrupo(title, key))}
          </AccordionBloco>

          <AccordionBloco
            title="LANÇAMENTO (RC)"
            id="secao-cabos"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RC.lancamento"
          >
            <div className="border-b border-gray-100 pb-6">
              <div className="flex w-full flex-col gap-3">
                <LancamentoCabosControle
                  label="Lançamento cabos (RC)?"
                  value={lancamentoCabosRc[abaLancamentoRc].isSim}
                  disabled={!canEditPhotos}
                  onChange={(next) => {
                    patchLancamentoCabos("lancamentoCabosRc", abaLancamentoRc, (lado) => ({
                      ...lado,
                      isSim: next,
                      metragens:
                        next && lado.metragens.length === 0 ? [emptyCaboMetragem()] : lado.metragens,
                    }));
                  }}
                />
                <AmbienteToggle
                  value={abaLancamentoRc}
                  onChange={(ambiente) => {
                    setAbaLancamentoRc(ambiente);
                    if (!payload) return;
                    patchPayload({ ...payload, lancamentoRcAmbiente: ambiente });
                  }}
                  disabled={false}
                />
              </div>
            </div>
            {lancamentoCabosRc[abaLancamentoRc].isSim === true ? (
              <div className="space-y-4 border-b border-gray-100 pb-6">
                <h2 className="font-semibold text-gray-800">Metragem de cabo</h2>
                <div className="flex flex-col gap-4">
                  {lancamentoCabosRc[abaLancamentoRc].metragens.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "lancamentoCabosRc",
                      abaLancamentoRc,
                      `Cabo ${index + 1}`,
                    ),
                  )}
                  {canEditPhotos ? (
                    <BotaoAdicionar
                      label="Adicionar mais cabo"
                      onClick={() => {
                        patchLancamentoCabos("lancamentoCabosRc", abaLancamentoRc, (lado) => ({
                          ...lado,
                          metragens: [...lado.metragens, emptyCaboMetragem()],
                        }));
                      }}
                    />
                  ) : null}
                </div>
              </div>
            ) : null}
            {renderGrupo("Entrada do cabo no cliente (Área externa)", "rcEntradaExterna")}
            {renderGrupo("Entrada do cabo no cliente (Área interna)", "rcEntradaInterna")}
            {renderGrupo(
              "Terminação do cabo no cliente (PTO/Roseta - área interna)",
              "rcTerminacaoCabo",
            )}
            {renderGrupo("Sobra técnica", "rcSobraTecnica", true)}
            {abaLancamentoRc !== "subterraneo" ? (
              <CordoalhaSimNaoCard
                id="secao-fiberloopInstalado"
                title="Fiberloop instalado?"
                quantidadeLabel="Quantidade de Fiberloop instalado"
                quantidadePlaceholder="Ex: 2"
                variant="flat"
                value={payload?.redeCliente?.fiberloopInstalado ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (fiberloopInstalado) => {
                        if (!payload) return;
                        const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeCliente: {
                            ...redeCliente,
                            fiberloopInstalado,
                            qtdFiberloopInstalado:
                              fiberloopInstalado.isSim === true
                                ? fiberloopInstalado.quantidade
                                : null,
                          },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
            ) : null}
            {renderGrupo(
              "Const. de duto subterrâneo (MD ou MND) — metros (MT)",
              "rcDutoSubterraneo",
            )}
            {renderConstrucaoCaixaSubterranea("redeCliente")}
          </AccordionBloco>

          <AccordionBloco
            title="POSTE (RC)"
            id="secao-poste"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RC.poste"
          >
            {renderGrupo("Poste de conexão (Rede cliente com Rede Externa)", "rcPosteConexao")}
            {renderTotalPostes("redeCliente", "RC")}
            <CordoalhaSimNaoCard
              title="Lançado cordoalha?"
              quantidadeLabel="Quantidade de cordoalha lançada:"
              quantidadePlaceholder="Ex: 50"
              variant="flat"
              value={payload?.redeCliente?.cordoalhaLancada ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (cordoalhaLancada) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: { ...redeCliente, cordoalhaLancada },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
            <CordoalhaSimNaoCard
              title="Cordoalha existente?"
              hideQuantidade
              variant="flat"
              value={payload?.redeCliente?.cordoalhaExistente ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (cordoalhaExistente) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: {
                          ...redeCliente,
                          cordoalhaExistente: {
                            isSim: cordoalhaExistente.isSim,
                            quantidade: null,
                          },
                        },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
            <CordoalhaSimNaoCard
              title="Postes novo com nova cordoalha?"
              quantidadeLabel="Quantidade de Poste com nova cordoalha:"
              quantidadePlaceholder="Ex: 10"
              variant="flat"
              value={payload?.redeCliente?.postesNovaCordoalha ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (postesNovaCordoalha) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: { ...redeCliente, postesNovaCordoalha },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
            <CordoalhaSimNaoCard
              title="Postes com cordoalha Existente?"
              hideQuantidade
              variant="flat"
              value={payload?.redeCliente?.postesCordoalhaExistente ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (postesCordoalhaExistente) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: {
                          ...redeCliente,
                          postesCordoalhaExistente: {
                            isSim: postesCordoalhaExistente.isSim,
                            quantidade: null,
                          },
                        },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
            {renderGrupo("Novo aterramento do poste", "rcNovoAterramentoPoste")}
            {renderAterramentoQtds("redeCliente")}
          </AccordionBloco>

          <AccordionBloco
            title="CAIXA DE EMENDA (RC)"
            id="secao-caixa-emenda"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RC.caixa"
          >
            {renderCaixaEmendaExistente("redeCliente", "RC")}
            {renderGrupo(
              "Caixa de emenda na acomodação (Rede cliente com Rede Externa)",
              "rcCaixaEmenda",
              true,
            )}
            {renderGrupo(
              "Plaqueta de Identificação - Caixa de emenda",
              "rcPlaquetaIdentificacao",
              false,
              "rcCaixaEmenda",
            )}
          </AccordionBloco>

          <AccordionBloco
            title="OUTRAS FOTOS (RC)"
            id="secao-outras-fotos"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="RC.outras"
          >
            {renderOutrasSecao("outrasFotosRc", "Outras fotos")}
          </AccordionBloco>
        </div>
      ) : null}

      {abaAtiva === "equipamento" ? (
        <div className="space-y-4">
          <AccordionBloco
            title="EQUIPAMENTO NO CLIENTE"
            id="secao-eq-cliente"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="EQ.cliente"
          >
            <div
              id="secao-tecnologia-acesso"
              className="scroll-mt-36 space-y-1.5 rounded-xl border border-gray-100 bg-white p-4 shadow-sm"
            >
              <label htmlFor="admin-tecnologia-acesso" className="block text-sm font-semibold">
                Tecnologia de Acesso
              </label>
              <input
                id="admin-tecnologia-acesso"
                type="text"
                value={payload?.tecnologiaAcesso ?? ""}
                placeholder="EX: FO ABC"
                disabled={!canEditPhotos}
                onChange={(e) => {
                  if (!payload || !canEditPhotos) return;
                  patchPayload({ ...payload, tecnologiaAcesso: e.target.value });
                }}
                className={inputClass()}
              />
            </div>

            <AdminListaEquipamentos
              titulo="DGO/Roseta"
              addLabel="Adicionar mais DGO/Roseta/Patch Panel"
              showIdentificacao={false}
              itemLabel="DGO/Roseta"
              itens={payload?.eqClienteDgo ?? []}
              canEdit={canEditPhotos}
              onUploadPhoto={onUploadPhoto}
              onPatchList={(next) => {
                if (!payload) return;
                patchPayload({ ...payload, eqClienteDgo: next as DgoClienteItemPayload[] });
              }}
              emptyItem={emptyDgoClienteItem}
            />

            <AdminListaEquipamentos
              titulo="Equipamento"
              addLabel="Adicionar mais Equipamento"
              showIdentificacao
              itemLabel="Equipamento"
              itens={payload?.eqClienteEquipamentos ?? []}
              canEdit={canEditPhotos}
              onUploadPhoto={onUploadPhoto}
              onPatchList={(next) => {
                if (!payload) return;
                patchPayload({
                  ...payload,
                  eqClienteEquipamentos: next as EquipamentoClienteItemPayload[],
                });
              }}
              emptyItem={emptyEquipamentoClienteItem}
            />

            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
              {renderGrupo("Identificação SGP no Cliente", "eqClienteSgp")}
            </div>

            <EquipamentosIpsCard
              title="Configuração equipamento no cliente"
              value={
                payload?.equipamento?.configuracaoCliente ??
                emptyEquipamentoConexoes().configuracaoCliente
              }
              onChange={
                canEditPhotos && payload
                  ? (configuracaoCliente) =>
                      patchPayload({
                        ...payload,
                        equipamento: {
                          ...(payload.equipamento ?? emptyEquipamentoConexoes()),
                          configuracaoCliente,
                        },
                      })
                  : undefined
              }
              readOnly={!canEditPhotos}
            />
          </AccordionBloco>

          <AccordionBloco
            title="EQUIPAMENTO NA ESTAÇÃO"
            id="secao-eq-estacao"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="EQ.estacao"
          >
            <p
              id="secao-estacao-entrega-acesso"
              className="scroll-mt-36 text-sm text-muted-foreground"
            >
              Estação Entrega de Acesso
              {payload?.estacaoEntregaAcesso ? `: ${payload.estacaoEntregaAcesso}` : ""}
            </p>

            <AdminListaEquipamentos
              titulo="DGO / DID / ROUTER"
              addLabel="Adicionar DGO / DID / ROUTER"
              showIdentificacao={false}
              itemLabel="DGO / DID / ROUTER"
              itens={payload?.eqEstacaoDgo ?? []}
              canEdit={canEditPhotos}
              onUploadPhoto={onUploadPhoto}
              onPatchList={(next) => {
                if (!payload) return;
                patchPayload({ ...payload, eqEstacaoDgo: next as DgoClienteItemPayload[] });
              }}
              emptyItem={emptyDgoClienteItem}
            />

            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 lg:grid-cols-3">
              {(
                [
                  ["Posição de conexão na Estação/PPC (DGO/DIO)", "posicaoConexaoEstacao"],
                  ["ETIQUETA DE IDENTIFICAÇÃO NA ESTAÇÃO/PPC", "etiquetaIdentificacao"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
            </div>

            <AdminListaEquipamentos
              titulo="Equipamento"
              addLabel="Adicionar mais Equipamento"
              showIdentificacao
              itemLabel="Equipamento"
              itens={payload?.eqEstacaoEquipamento ?? []}
              canEdit={canEditPhotos}
              onUploadPhoto={onUploadPhoto}
              onPatchList={(next) => {
                if (!payload) return;
                patchPayload({
                  ...payload,
                  eqEstacaoEquipamento: next as EquipamentoClienteItemPayload[],
                });
              }}
              emptyItem={emptyEquipamentoClienteItem}
            />

            <EquipamentosIpsCard
              title="Configuração equipamento na estação"
              value={
                payload?.equipamento?.configuracaoEstacao ??
                emptyEquipamentoConexoes().configuracaoEstacao
              }
              onChange={
                canEditPhotos && payload
                  ? (configuracaoEstacao) =>
                      patchPayload({
                        ...payload,
                        equipamento: {
                          ...(payload.equipamento ?? emptyEquipamentoConexoes()),
                          configuracaoEstacao,
                        },
                      })
                  : undefined
              }
              readOnly={!canEditPhotos}
            />
          </AccordionBloco>

          <AccordionBloco
            title="OUTRAS FOTOS"
            id="secao-outras-fotos"
            stickTabsAtViewportTop={false}
            defaultOpen
            pendenciaBloco="EQ.outras"
          >
            {renderOutrasSecao("outrasFotosEqCliente", "Outras fotos")}
          </AccordionBloco>
        </div>
      ) : null}

      {abaAtiva === "teste-optico" || abaAtiva === "teste-otdr" ? (
        <>
          <div className="print:hidden">
            {abaAtiva === "teste-optico" ? (
              <RelatorioTesteOptico
                readOnly={!canEditPhotos}
                value={payload?.testeOptico ?? emptyTesteOptico()}
                padraoCoresFibra={
                  payload?.padraoCoresFibra === "eua" ? "eua" : "br"
                }
                onPadraoCoresFibraChange={
                  canEditPhotos && payload
                    ? (padraoCoresFibra) => patchPayload({ ...payload, padraoCoresFibra })
                    : undefined
                }
                onChange={(next) => {
                  if (!payload) return;
                  patchPayload({ ...payload, testeOptico: next });
                }}
                onUploadPhoto={canEditPhotos ? onUploadPhoto : undefined}
              />
            ) : null}
            {abaAtiva === "teste-otdr" ? (
              <RelatorioTestePotencia
                tipoExecucao={isImplantacao ? "implantacao" : "empresarial"}
                readOnly={!canEditPhotos}
                valueEmpresarial={payload?.testePotenciaEmpresarial ?? emptyTestePotencia()}
                valueImplantacao={payload?.testePotenciaImplantacao ?? emptyTestePotencia()}
                onChangeEmpresarial={(next) => {
                  if (!payload) return;
                  patchPayload({ ...payload, testePotenciaEmpresarial: next });
                }}
                onChangeImplantacao={(next) => {
                  if (!payload) return;
                  patchPayload({ ...payload, testePotenciaImplantacao: next });
                }}
                onUploadPhoto={canEditPhotos ? onUploadPhoto : undefined}
              />
            ) : null}
          </div>
          {/* Bloco unico inquebravel so na impressao (Optico + OTDR juntos) */}
          <div className="hidden break-inside-avoid print:block print:space-y-2">
            <RelatorioTesteOptico
              readOnly
              value={payload?.testeOptico ?? emptyTesteOptico()}
              padraoCoresFibra={payload?.padraoCoresFibra === "eua" ? "eua" : "br"}
              onChange={() => undefined}
            />
            <RelatorioTestePotencia
              tipoExecucao={isImplantacao ? "implantacao" : "empresarial"}
              readOnly
              valueEmpresarial={payload?.testePotenciaEmpresarial ?? emptyTestePotencia()}
              valueImplantacao={payload?.testePotenciaImplantacao ?? emptyTestePotencia()}
              onChangeEmpresarial={() => undefined}
              onChangeImplantacao={() => undefined}
            />
          </div>
        </>
      ) : null}

      {abaAtiva === "teste-potencia" ? (
        <RelatorioTestePotenciaAtenuacao
          testeOptico={payload?.testeOptico ?? emptyTesteOptico()}
          testeOtdr={payload?.testePotenciaEmpresarial ?? emptyTestePotencia()}
          redeAcesso={payload?.redeAcesso ?? emptyQuantidadesRede()}
          redeCliente={payload?.redeCliente ?? emptyQuantidadesRede()}
          padraoCoresFibra={payload?.padraoCoresFibra === "eua" ? "eua" : "br"}
          readOnly={!canEditPhotos}
          onPadraoCoresFibraChange={
            canEditPhotos && payload
              ? (padraoCoresFibra) => patchPayload({ ...payload, padraoCoresFibra })
              : undefined
          }
        />
      ) : null}

      {abaAtiva === "infraestrutura" ? (
        <AbaInfraestrutura
          layoutMode="gestor"
          value={payload?.infraestrutura ?? emptyInfraestrutura()}
          onChange={
            canEditPhotos && payload
              ? (infraestrutura) => patchPayload({ ...payload, infraestrutura })
              : undefined
          }
          readOnly={!canEditPhotos}
        />
      ) : null}
      {abaAtiva === "medicoes" ? (
        <AbaMedicoes payload={payload} clienteNome={row.cliente} />
      ) : null}
      {abaAtiva === "contatos" ? (
        <AbaContatos
          value={payload?.contatos ?? emptyContatos()}
          onChange={
            canEditPhotos && payload
              ? (contatos) => patchPayload({ ...payload, contatos })
              : undefined
          }
          readOnly={!canEditPhotos}
        />
      ) : null}
    </div>
  );
}
