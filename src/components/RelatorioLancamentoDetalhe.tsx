import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { EditarContratoOsDialog } from "@/components/EditarContratoOsDialog";
import {
  FOTO_SLOT_CLASS,
  FotoLabel,
  RelatorioFotoComControles,
} from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
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
  CampoCoordenadas,
  CampoQuantidade,
  ChoiceButton,
  CordoalhaSimNaoCard,
  RefTituloInput,
  RelatorioAbasCampo,
  inputClass,
  type AbaCampo,
} from "@/components/RelatorioRedeAcesso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import type { EvidencePhotoRef } from "@/lib/types";
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
  apenasDigitos,
  calcularMetragemCaboTotal,
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
}: {
  fotos: StoredPhoto[];
  labels?: string[];
  /** OBS exibida sob a foto (modo leitura). Vazia = sem texto. */
  legenda?: string;
  canEdit?: boolean;
  onRemovePhoto?: (index: number) => void;
  onReplacePhoto?: (index: number, file: EvidencePhotoRef) => void;
}) {
  if (!fotos.length) {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="flex min-w-0 flex-col gap-1">
          <FotoLabel>{labels?.[0]}</FotoLabel>
          <div className={FOTO_SLOT_CLASS}>Sem foto</div>
        </div>
      </div>
    );
  }
  const legendaTrim = legenda?.trim() || "";
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      {fotos.map((foto, index) => (
        <div key={`${foto.path}-${index}`} className="flex min-w-0 flex-col gap-1">
          {labels?.[index] ? <FotoLabel>{labels[index]}</FotoLabel> : null}
          <RelatorioFotoComControles
            src={foto.url}
            alt={labels?.[index] || "Evidência"}
            canEdit={canEdit}
            onDelete={onRemovePhoto ? () => onRemovePhoto(index) : undefined}
            onReplace={onReplacePhoto ? (file) => onReplacePhoto(index, file) : undefined}
          />
          {legendaTrim ? (
            <p className="text-center text-sm text-muted-foreground">{legendaTrim}</p>
          ) : null}
        </div>
      ))}
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
}: {
  inicio: StoredPhoto | null;
  fim: StoredPhoto | null;
  legenda?: string;
  canEdit?: boolean;
  onRemoveCampo?: (campo: "fotoInicio" | "fotoFim") => void;
  onReplaceCampo?: (campo: "fotoInicio" | "fotoFim", file: EvidencePhotoRef) => void;
}) {
  const legendaTrim = legenda?.trim() || "";
  return (
    <div className="grid w-full grid-cols-1 gap-4 md:grid-cols-2">
      {(
        [
          ["Foto Inicial", inicio, "fotoInicio"],
          ["Foto Final", fim, "fotoFim"],
        ] as const
      ).map(([label, foto, campo]) => (
        <div key={campo} className="flex min-w-0 flex-col gap-1">
          <FotoLabel>{label}</FotoLabel>
          {foto ? (
            <RelatorioFotoComControles
              src={foto.url}
              alt={label}
              canEdit={canEdit}
              onDelete={onRemoveCampo ? () => onRemoveCampo(campo) : undefined}
              onReplace={onReplaceCampo ? (file) => onReplaceCampo(campo, file) : undefined}
            />
          ) : (
            <div className={FOTO_SLOT_CLASS}>Sem foto</div>
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
    <div className="space-y-1.5">
      <label className="block text-sm font-semibold">OBS</label>
      <textarea
        value={local}
        onChange={(e) => setLocal(e.target.value)}
        onBlur={() => {
          if (onChange && local !== value) onChange(local);
        }}
        rows={3}
        disabled={!onChange}
        className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:bg-muted"
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
      <p className="text-sm text-gray-500">{label}</p>
      <p className={empty ? "mt-0.5 font-normal text-gray-400" : "mt-0.5 font-medium text-gray-900"}>
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
}: {
  title: string;
  obs?: string | null;
  fotos: StoredPhoto[];
  caboFotos?: { inicio: StoredPhoto | null; fim: StoredPhoto | null };
  canEdit?: boolean;
  onAdd?: (file: EvidencePhotoRef) => void;
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
    !coordenadas
  ) {
    return null;
  }
  return (
    <div className="flex h-full flex-col rounded-xl border border-border/80 bg-muted/20 p-4">
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
      {quantidadeLabel ? (
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
          />
        ) : (
          <Photos
            fotos={fotos}
            legenda={!onObsChange ? obs ?? undefined : undefined}
            canEdit={canEdit}
            onRemovePhoto={onRemovePhoto}
            onReplacePhoto={onReplacePhoto}
          />
        )}
      </div>
      {onObsChange ? (
        <div className="mt-auto w-full space-y-3 pt-4">
          <ObsEditavel value={obs ?? ""} onChange={onObsChange} />
          {canEdit && onAdd && !(caboFotos && Boolean(caboFotos.inicio) && Boolean(caboFotos.fim)) ? (
            <div className={uploading ? "pointer-events-none opacity-60" : undefined}>
              <PhotoUpload
                key={uploadKey}
                label="Adicionar foto"
                suffix="inicio"
                value={null}
                onChange={(file) => {
                  if (file) onAdd(file);
                }}
              />
            </div>
          ) : null}
        </div>
      ) : canEdit && onAdd && !(caboFotos && Boolean(caboFotos.inicio) && Boolean(caboFotos.fim)) ? (
        <div className={`mt-auto w-full pt-4 ${uploading ? "pointer-events-none opacity-60" : ""}`}>
          <PhotoUpload
            key={uploadKey}
            label="Adicionar foto"
            suffix="inicio"
            value={null}
            onChange={(file) => {
              if (file) onAdd(file);
            }}
          />
        </div>
      ) : null}
    </div>
  );
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

function simNao(value: boolean | null | undefined) {
  if (value === true) return "SIM";
  if (value === false) return "NÃO";
  return "—";
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
    <div className="space-y-2">
      <p className="text-sm text-gray-500">{label}</p>
      <div className="flex max-w-sm gap-2">
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
      <h4 className="text-sm font-semibold text-gray-900">{titulo}</h4>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        {list.map((item, index) => (
          <div
            key={item.id}
            className="flex h-full flex-col gap-3 rounded-xl border border-border/80 bg-muted/20 p-4"
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
  onReplacePhoto,
  uploadingCategoria,
  onUpdatePayload,
  canEditCadastro = false,
  onCadastroSaved,
  onUploadPhoto,
}: {
  row: RelatorioTransmissao;
  canEditPhotos: boolean;
  onAddPhoto: (categoria: RelatorioFotoCategoria, file: EvidencePhotoRef) => void;
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
  const cabos = payload?.metragensCabo ?? [];
  const cabosRc = payload?.metragensCaboRc ?? [];
  const fotosCabosCount = cabos.reduce(
    (acc, cabo) => acc + Number(Boolean(cabo.fotoInicio)) + Number(Boolean(cabo.fotoFim)),
    0,
  );
  const fotosCabosRcCount = cabosRc.reduce(
    (acc, cabo) => acc + Number(Boolean(cabo.fotoInicio)) + Number(Boolean(cabo.fotoFim)),
    0,
  );
  const blocoCount = (categoria: RelatorioFotoCategoria) => {
    if (categoria === "metragensCabo") return fotosCabosCount;
    if (categoria === "metragensCaboRc") return fotosCabosRcCount;
    if (categoria === "outrasFotos") return payload?.outrasFotos.length ?? 0;
    if (categoria === "outrasFotosRc") return payload?.outrasFotosRc.length ?? 0;
    if (categoria === "outrasFotosEqCliente") return payload?.outrasFotosEqCliente.length ?? 0;
    if (categoria === "outrasFotosEqEstacao") return payload?.outrasFotosEqEstacao.length ?? 0;
    if (categoria === "eqClienteDgo") return payload?.eqClienteDgo.length ?? 0;
    if (categoria === "eqClienteEquipamentos") return payload?.eqClienteEquipamentos.length ?? 0;
    if (categoria === "eqEstacaoDgo") return payload?.eqEstacaoDgo.length ?? 0;
    if (categoria === "eqEstacaoEquipamento") return payload?.eqEstacaoEquipamento.length ?? 0;
    const grupo = payload?.[categoria as RelatorioFotoGrupoKey];
    return grupo && "fotos" in grupo ? grupo.fotos.length : 0;
  };
  const blocoProps = (categoria: RelatorioFotoCategoria) => ({
    canEdit: canEditPhotos,
    onAdd: (file: EvidencePhotoRef) => onAddPhoto(categoria, file),
    uploadKey: `${row.id}-${categoria}-${blocoCount(categoria)}`,
    uploading: uploadingCategoria === categoria,
  });

  const patchPayload = (next: RelatorioPayload) => {
    onUpdatePayload?.(next);
  };

  const patchQtdCaixas = (lado: "redeAcesso" | "redeCliente", qtdCaixasEmenda: number | null) => {
    if (!payload) return;
    const next: RelatorioPayload = {
      ...payload,
      [lado]: {
        ...(payload[lado] ?? emptyQuantidadesRede()),
        qtdCaixasEmenda,
      },
    };
    const janela = janelaPotenciaDerivada(next.redeAcesso, next.redeCliente);
    patchPayload({ ...next, testePotencia1550: janela, testePotencia1330: janela });
  };

  const patchQtdFiberloop = (
    lado: "redeAcesso" | "redeCliente",
    qtdFiberloopInstalado: number | null,
  ) => {
    if (!payload) return;
    patchPayload({
      ...payload,
      [lado]: {
        ...(payload[lado] ?? emptyQuantidadesRede()),
        qtdFiberloopInstalado,
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

  const renderGrupo = (title: string, key: RelatorioFotoGrupoKey) => {
    const grupo = payload?.[key];
    const redeCliente = payload?.redeCliente ?? emptyQuantidadesRede();
    const redeAcesso = payload?.redeAcesso ?? emptyQuantidadesRede();
    const qtd =
      payload && (isEmpresarial || isImplantacao) && key === "caixaEmenda"
        ? {
            quantidade: redeAcesso.qtdCaixasEmenda ?? null,
            quantidadeLabel: "Quantidade de Caixas de Emenda",
            quantidadePlaceholder: "Ex: 4",
            onQuantidadeChange: canEditPhotos
              ? (qtdCaixasEmenda: number | null) => patchQtdCaixas("redeAcesso", qtdCaixasEmenda)
              : undefined,
          }
        : payload && isEmpresarial && key === "rcCaixaEmenda"
          ? {
              quantidade: redeCliente.qtdCaixasEmenda ?? null,
              quantidadeLabel: "Quantidade de Caixas de Emenda",
              quantidadePlaceholder: "Ex: 1",
              onQuantidadeChange: canEditPhotos
                ? (qtdCaixasEmenda: number | null) => patchQtdCaixas("redeCliente", qtdCaixasEmenda)
                : undefined,
              coordenadas: redeCliente.caixaEmendaAcomodacao?.coordenadas ?? emptyCoordenadas(),
              coordenadasTitle: "Coordenadas da Caixa de Emenda",
              onCoordenadasChange: canEditPhotos
                ? (coordenadas: { latitude: string; longitude: string }) => {
                    if (!payload) return;
                    patchPayload({
                      ...payload,
                      redeCliente: {
                        ...redeCliente,
                        caixaEmendaAcomodacao: { coordenadas },
                      },
                    });
                  }
                : undefined,
            }
          : payload && key === "sobraTecnica"
            ? {
                quantidade: redeAcesso.qtdFiberloopInstalado ?? null,
                quantidadeLabel: "Quantidade de Fiberloop instalado",
                quantidadePlaceholder: "Ex: 2",
                onQuantidadeChange: canEditPhotos
                  ? (qtdFiberloopInstalado: number | null) =>
                      patchQtdFiberloop("redeAcesso", qtdFiberloopInstalado)
                  : undefined,
              }
            : payload && isEmpresarial && key === "rcSobraTecnica"
              ? {
                  quantidade: redeCliente.qtdFiberloopInstalado ?? null,
                  quantidadeLabel: "Quantidade de Fiberloop instalado",
                  quantidadePlaceholder: "Ex: 2",
                  onQuantidadeChange: canEditPhotos
                    ? (qtdFiberloopInstalado: number | null) =>
                        patchQtdFiberloop("redeCliente", qtdFiberloopInstalado)
                    : undefined,
                }
              : payload && key === "aterramentoTerrometro"
                ? {
                    quantidade: redeAcesso.aterramento?.totalHastes ?? null,
                    quantidadeLabel: "Total de Hastes (5/8):",
                    quantidadePlaceholder: "Ex: 4",
                    onQuantidadeChange: canEditPhotos
                      ? (totalHastes: number | null) => {
                          if (!payload) return;
                          patchPayload({
                            ...payload,
                            redeAcesso: {
                              ...redeAcesso,
                              aterramento: { ...redeAcesso.aterramento, totalHastes },
                            },
                          });
                        }
                      : undefined,
                  }
                : {};
    return (
      <EvidenciaBloco
        key={key}
        title={title}
        obs={grupo?.obs}
        fotos={grupo?.fotos ?? []}
        {...qtd}
        onObsChange={
          canEditPhotos
            ? (obs) => {
                if (!payload) return;
                patchPayload({ ...payload, [key]: { ...payload[key], obs } });
              }
            : undefined
        }
        onRemovePhoto={
          canEditPhotos
            ? (index) => {
                if (!payload) return;
                const old = payload[key].fotos[index];
                patchPayload({ ...payload, [key]: removeFotoGrupoAt(payload[key], index) });
                void deleteRelatorioPhoto(old?.path);
              }
            : undefined
        }
        onReplacePhoto={
          canEditPhotos && onReplacePhoto
            ? (index, file) => onReplacePhoto(key, file, { index })
            : undefined
        }
        {...blocoProps(key)}
      />
    );
  };

  const renderCabo = (
    cabo: CaboMetragemPayload,
    index: number,
    categoria: "metragensCabo" | "metragensCaboRc",
    titulo: string,
  ) => {
    const patchCaboCampos = (patch: Partial<CaboMetragemPayload>) => {
      if (!payload || !canEditPhotos) return;
      patchPayload({
        ...payload,
        [categoria]: payload[categoria].map((item) => {
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
      });
    };

    return (
      <div key={cabo.id} className="flex h-full flex-col gap-3">
        <div className="space-y-3 rounded-xl border border-border/80 bg-muted/20 p-4">
          <p className="text-sm font-semibold text-gray-900">{titulo}</p>
          <div>
            <p className="text-xs text-gray-500">Tipo do cabo</p>
            <input
              type="number"
              inputMode="numeric"
              value={cabo.tipoCabo}
              disabled={!canEditPhotos}
              onChange={(e) => patchCaboCampos({ tipoCabo: e.target.value })}
              placeholder="Ex: 12"
              className={inputClass()}
            />
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <div>
              <p className="text-xs text-gray-500">Marcação Inicial (m)</p>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={cabo.marcacaoInicial}
                disabled={!canEditPhotos}
                onChange={(e) => patchCaboCampos({ marcacaoInicial: e.target.value })}
                className={inputClass()}
              />
            </div>
            <div>
              <p className="text-xs text-gray-500">Marcação Final (m)</p>
              <input
                type="number"
                inputMode="decimal"
                step="any"
                value={cabo.marcacaoFinal}
                disabled={!canEditPhotos}
                onChange={(e) => patchCaboCampos({ marcacaoFinal: e.target.value })}
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
        <EvidenciaBloco
          title="Fotos do cabo"
          obs={cabo.obs}
          fotos={[]}
          caboFotos={{ inicio: cabo.fotoInicio, fim: cabo.fotoFim }}
          onObsChange={
            canEditPhotos
              ? (obs) => {
                  if (!payload) return;
                  patchPayload({
                    ...payload,
                    [categoria]: payload[categoria].map((item) =>
                      item.id === cabo.id ? { ...item, obs } : item,
                    ),
                  });
                }
              : undefined
          }
          onRemove={
            canEditPhotos && index >= 1
              ? () => {
                  if (!payload) return;
                  patchPayload({
                    ...payload,
                    [categoria]: removeExtraById(payload[categoria], cabo.id),
                  });
                }
              : undefined
          }
          onRemoveCaboCampo={
            canEditPhotos
              ? (campo) => {
                  if (!payload) return;
                  const old = cabo[campo];
                  patchPayload({
                    ...payload,
                    [categoria]: payload[categoria].map((item) =>
                      item.id === cabo.id ? { ...item, [campo]: null } : item,
                    ),
                  });
                  void deleteRelatorioPhoto(old?.path);
                }
              : undefined
          }
          onReplaceCaboCampo={
            canEditPhotos && onReplacePhoto
              ? (campo, file) => onReplacePhoto(categoria, file, { caboId: cabo.id, campo })
              : undefined
          }
          {...blocoProps(categoria)}
          onAdd={
            canEditPhotos && onReplacePhoto && !(cabo.fotoInicio && cabo.fotoFim)
              ? (file) => {
                  const campo = cabo.fotoInicio ? "fotoFim" : "fotoInicio";
                  onReplacePhoto(categoria, file, { caboId: cabo.id, campo });
                }
              : undefined
          }
        />
      </div>
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
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">{heading}</h3>
        {visiveis.length ? (
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
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

  const mostrarEstacao =
    Boolean(payload?.relatorioEstacao) ||
    Boolean(payload?.estacaoEntregaAcesso?.trim()) ||
    Boolean(payload?.eqEstacaoGeral?.fotos.length) ||
    Boolean(payload?.outrasFotosEqEstacao?.length);

  return (
    <div className="space-y-6">
      <div className="relative rounded-2xl border border-border bg-white p-5 shadow-sm md:p-6">
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
        <p className="text-sm text-gray-500">Endereço</p>
        <p className="mt-0.5 pr-28 text-lg font-medium">
          <span className={row.endereco?.trim() ? "text-gray-900" : "font-normal text-gray-400"}>
            {displayCadastral(row.endereco)}
          </span>
          <span className="text-gray-400"> · </span>
          <span className={row.cidade?.trim() ? "text-gray-900" : "font-normal text-gray-400"}>
            {displayCadastral(row.cidade)}
          </span>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 md:grid-cols-4 lg:grid-cols-5">
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

      {row.status === "pendente" ? (
        <div className="rounded-xl border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-900">
          <p className="font-semibold">Pendência enviada ao técnico</p>
          <p className="mt-1">
            {row.motivo_pendencia?.trim() || "A supervisão sinalizou uma pendência."}
          </p>
        </div>
      ) : null}

      <RelatorioAbasCampo abaAtiva={abaAtiva} onChange={setAbaAtiva} abas={abasVisiveis} />

      {abaAtiva === "RE" ? (
        <div className="space-y-6">
          <LancamentoCabosControle
            label="Lançamento cabos (RE)"
            value={payload?.lancamentoRe}
            disabled={!canEditPhotos}
            onChange={(next) => {
              if (!payload) return;
              patchPayload({
                ...payload,
                lancamentoRe: next,
                metragensCabo:
                  next && payload.metragensCabo.length === 0
                    ? [emptyCaboMetragem()]
                    : payload.metragensCabo,
              });
            }}
          />
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CordoalhaSimNaoCard
              title="Lançado cordoalha?"
              quantidadeLabel="Quantidade de cordoalha lançada:"
              quantidadePlaceholder="Ex: 50"
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
            <CordoalhaSimNaoCard
              title="Cordoalha existente?"
              quantidadeLabel="Quantidade de cordoalha existente:"
              quantidadePlaceholder="Ex: 120"
              value={payload?.redeAcesso?.cordoalhaExistente ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (cordoalhaExistente) => {
                      if (!payload) return;
                      const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeAcesso: { ...redeAcesso, cordoalhaExistente },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
          </div>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Postes e metragem
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {payload?.lancamentoRe === true ? (
                <div className="flex h-full flex-col gap-3">
                  {cabos.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "metragensCabo",
                      `Cabo ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || calcularMetragemCaboTotal(cabo.marcacaoInicial, cabo.marcacaoFinal) || "—"} m`,
                    ),
                  )}
                  {canEditPhotos ? (
                    <BotaoAdicionar
                      label="Adicionar cabo"
                      onClick={() => {
                        if (!payload) return;
                        patchPayload({
                          ...payload,
                          metragensCabo: [...payload.metragensCabo, emptyCaboMetragem()],
                        });
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
              {renderGrupo("Poste de conexão", "posteConexao")}
              <CordoalhaSimNaoCard
                title="Postes novo com nova cordoalha?"
                quantidadeLabel="Quantidade de Poste com nova cordoalha:"
                quantidadePlaceholder="Ex: 10"
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
              <CordoalhaSimNaoCard
                title="Postes com cordoalha Existente?"
                quantidadeLabel="Quantidade de Postes com cordoalha Existente:"
                quantidadePlaceholder="Ex: 10"
                value={payload?.redeAcesso?.postesCordoalhaExistente ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (postesCordoalhaExistente) => {
                        if (!payload) return;
                        const redeAcesso = payload.redeAcesso ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeAcesso: { ...redeAcesso, postesCordoalhaExistente },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Caixas de emenda
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {renderGrupo("Caixa de emenda", "caixaEmenda")}
              {renderGrupo("Const. de duto subterraneio (MD ou MND)", "dutoSubterraneo")}
              {renderGrupo("Sobra técnica / Fiberloop instalado", "sobraTecnica")}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Demais evidências
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {(
                [
                  ["Plaqueta de Identificação", "plaquetaIdentificacao"],
                  ["Novo aterramento do poste", "novoAterramentoPoste"],
                  ["Aterramento - TERROMETRO", "aterramentoTerrometro"],
                  ["Posição DGO/DIO", "posicaoConexaoEstacao"],
                  ["Etiqueta na estação/PPC", "etiquetaIdentificacao"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
            </div>
            {renderOutrasSecao("outrasFotos", "Outras fotos")}
          </section>
        </div>
      ) : null}

      {abaAtiva === "RC" ? (
        <div className="space-y-6">
          <CampoCoordenadas
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
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div className="space-y-1.5 sm:col-span-2">
              <label htmlFor="admin-tecnologia-acesso" className="block text-sm text-gray-500">
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
            <div className="sm:col-span-2 lg:col-span-2">
              <LancamentoCabosControle
                label="Lançamento cabos (RC)"
                value={payload?.lancamentoRc}
                disabled={!canEditPhotos}
                onChange={(next) => {
                  if (!payload) return;
                  patchPayload({
                    ...payload,
                    lancamentoRc: next,
                    metragensCaboRc:
                      next && payload.metragensCaboRc.length === 0
                        ? [emptyCaboMetragem()]
                        : payload.metragensCaboRc,
                  });
                }}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <CordoalhaSimNaoCard
              title="Lançado cordoalha?"
              quantidadeLabel="Quantidade de cordoalha lançada:"
              quantidadePlaceholder="Ex: 50"
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
              quantidadeLabel="Quantidade de cordoalha existente:"
              quantidadePlaceholder="Ex: 120"
              value={payload?.redeCliente?.cordoalhaExistente ?? emptyCordoalhaBloco()}
              onChange={
                canEditPhotos
                  ? (cordoalhaExistente) => {
                      if (!payload) return;
                      const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                      patchPayload({
                        ...payload,
                        redeCliente: { ...redeCliente, cordoalhaExistente },
                      });
                    }
                  : undefined
              }
              disabled={!canEditPhotos}
            />
          </div>
          <section className="space-y-3">
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {payload?.lancamentoRc === true ? (
                <div className="flex h-full flex-col gap-3">
                  {cabosRc.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "metragensCaboRc",
                      `Cabo RC ${index + 1} — tipo ${cabo.tipoCabo || "n/d"} · ${cabo.metragem || calcularMetragemCaboTotal(cabo.marcacaoInicial, cabo.marcacaoFinal) || "—"} m`,
                    ),
                  )}
                  {canEditPhotos ? (
                    <BotaoAdicionar
                      label="Adicionar cabo"
                      onClick={() => {
                        if (!payload) return;
                        patchPayload({
                          ...payload,
                          metragensCaboRc: [...payload.metragensCaboRc, emptyCaboMetragem()],
                        });
                      }}
                    />
                  ) : null}
                </div>
              ) : null}
              {renderGrupo("Poste de conexão (Rede cliente com Rede Externa)", "rcPosteConexao")}
              <CordoalhaSimNaoCard
                title="Postes novo com nova cordoalha?"
                quantidadeLabel="Quantidade de Poste com nova cordoalha:"
                quantidadePlaceholder="Ex: 10"
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
                quantidadeLabel="Quantidade de Postes com cordoalha Existente:"
                quantidadePlaceholder="Ex: 10"
                value={payload?.redeCliente?.postesCordoalhaExistente ?? emptyCordoalhaBloco()}
                onChange={
                  canEditPhotos
                    ? (postesCordoalhaExistente) => {
                        if (!payload) return;
                        const redeCliente = payload.redeCliente ?? emptyQuantidadesRede();
                        patchPayload({
                          ...payload,
                          redeCliente: { ...redeCliente, postesCordoalhaExistente },
                        });
                      }
                    : undefined
                }
                disabled={!canEditPhotos}
              />
              {(
                [
                  ["Caixa de emenda na acomodação (Rede cliente com Rede Externa)", "rcCaixaEmenda"],
                  ["Terminação do cabo no cliente (PTO/Roseta - área interna)", "rcTerminacaoCabo"],
                  ["Plaqueta de Identificação - Terminação do cabo no cliente", "rcPlaquetaIdentificacao"],
                  ["Entrada do cabo no cliente (Área interna)", "rcEntradaInterna"],
                  ["Entrada do cabo no cliente (Área externa)", "rcEntradaExterna"],
                  ["Sobra técnica / Fiberloop instalado", "rcSobraTecnica"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
            </div>
            {renderOutrasSecao("outrasFotosRc", "Outras fotos")}
          </section>
        </div>
      ) : null}

      {abaAtiva === "equipamento" ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Equipamentos no Cliente
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {(
                [
                  ["Cliente - (Entrada/Fachada)", "eqClienteFachada"],
                  ["Cliente - Ambiente (geral da sala)", "eqClienteAmbiente"],
                  ["(Rack ou Local)", "eqClienteRack"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
            </div>

            <AdminListaEquipamentos
              titulo="DGO /DID; Roseta ou Pach panel"
              addLabel="Adicionar mais DGO/Roseta/Patch Panel"
              showIdentificacao={false}
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
              titulo="Equipamentos (No Cliente)"
              addLabel="Adicionar mais Equipamento"
              showIdentificacao
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

            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {renderGrupo("Identificação SGP no Cliente", "eqClienteSgp")}
            </div>
            {renderOutrasSecao("outrasFotosEqCliente", "Outras fotos")}
          </section>
          {mostrarEstacao ? (
            <section className="space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Equipamentos na Estação/PPC
              </h3>
              <p className="text-sm text-muted-foreground">
                Relatório fotográfico da estação: {simNao(payload?.relatorioEstacao)}
                {payload?.estacaoEntregaAcesso ? ` · ${payload.estacaoEntregaAcesso}` : ""}
              </p>
              <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
                {(
                  [
                    ["Estação - (Foto geral da estação/PPC)", "eqEstacaoGeral"],
                    ["(Rack ou Local Instalação)", "eqEstacaoRack"],
                  ] as const
                ).map(([title, key]) => renderGrupo(title, key))}
              </div>

              <AdminListaEquipamentos
                titulo="Equipamento instalado (Na estação/PPC)"
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

              <AdminListaEquipamentos
                titulo="DGO / DID / ROUTER (Conexão)"
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

              {renderOutrasSecao("outrasFotosEqEstacao", "Outras fotos")}
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Relatório fotográfico da estação/PPC não foi adicionado.
            </p>
          )}

          <EquipamentosIpsCard
            title="Equipamentos Instalados No cliente"
            value={payload?.equipamento?.configuracaoCliente ?? emptyEquipamentoConexoes().configuracaoCliente}
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
          <EquipamentosIpsCard
            title="Equipamentos Instalados Na estação"
            value={payload?.equipamento?.configuracaoEstacao ?? emptyEquipamentoConexoes().configuracaoEstacao}
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
        </div>
      ) : null}

      {abaAtiva === "teste-optico" || abaAtiva === "teste-otdr" ? (
        <>
          <div className="print:hidden">
            {abaAtiva === "teste-optico" ? (
              <RelatorioTesteOptico
                readOnly={!canEditPhotos}
                value={payload?.testeOptico ?? emptyTesteOptico()}
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
        />
      ) : null}

      {abaAtiva === "infraestrutura" ? (
        <AbaInfraestrutura
          value={payload?.infraestrutura ?? emptyInfraestrutura()}
          onChange={
            canEditPhotos && payload
              ? (infraestrutura) => patchPayload({ ...payload, infraestrutura })
              : undefined
          }
          readOnly={!canEditPhotos}
        />
      ) : null}
      {abaAtiva === "medicoes" ? <AbaMedicoes /> : null}
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
