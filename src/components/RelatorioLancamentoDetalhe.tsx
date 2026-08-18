import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { EditarContratoOsDialog } from "@/components/EditarContratoOsDialog";
import { ExpandableImage } from "@/components/ExpandableImage";
import { PhotoUpload } from "@/components/PhotoUpload";
import { ABAS_CAMPO, type AbaCampo } from "@/components/RelatorioRedeAcesso";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDebouncedEffect } from "@/hooks/use-debounced-effect";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  labelTecnicosAtribuidos,
  removeExtraById,
  removeFotoGrupoAt,
  type CaboMetragemPayload,
  type RelatorioFotoCategoria,
  type RelatorioFotoGrupoKey,
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
  onRemovePhoto,
}: {
  fotos: StoredPhoto[];
  labels?: string[];
  onRemovePhoto?: (index: number) => void;
}) {
  if (!fotos.length) return null;
  const duasColunas = Boolean(labels?.length) || fotos.length <= 2;
  return (
    <div className={`grid gap-2 ${duasColunas ? "grid-cols-2" : "grid-cols-2 md:grid-cols-3"}`}>
      {fotos.map((foto, index) => (
        <div key={`${foto.path}-${index}`} className="relative flex min-w-0 flex-col gap-1">
          {labels?.[index] ? <p className="text-sm font-bold">{labels[index]}</p> : null}
          {onRemovePhoto && index >= 1 ? (
            <button
              type="button"
              onClick={() => onRemovePhoto(index)}
              className="absolute right-1 top-7 z-10 rounded-lg bg-white/90 p-1 text-destructive shadow hover:bg-destructive/10"
              aria-label="Excluir foto extra"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
          <ExpandableImage
            src={foto.url}
            alt={labels?.[index] || "Evidência"}
            className="h-40 w-full rounded-md object-cover"
          />
        </div>
      ))}
    </div>
  );
}

function CaboFotos({
  inicio,
  fim,
}: {
  inicio: StoredPhoto | null;
  fim: StoredPhoto | null;
}) {
  if (!inicio && !fim) return null;
  return (
    <div className="grid w-full grid-cols-2 gap-2">
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-bold">Foto Inicial</p>
        {inicio ? (
          <ExpandableImage
            src={inicio.url}
            alt="Foto Inicial"
            className="h-40 w-full rounded-md object-cover"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
            Sem foto
          </div>
        )}
      </div>
      <div className="flex min-w-0 flex-col gap-1">
        <p className="text-sm font-bold">Foto Final</p>
        {fim ? (
          <ExpandableImage
            src={fim.url}
            alt="Foto Final"
            className="h-40 w-full rounded-md object-cover"
          />
        ) : (
          <div className="flex h-40 w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground">
            Sem foto
          </div>
        )}
      </div>
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
}) {
  if (!fotos.length && !caboFotos?.inicio && !caboFotos?.fim && !obs && !canEdit && !onObsChange) {
    return null;
  }
  return (
    <div className="flex h-full flex-col rounded-xl border border-border/80 bg-muted/20 p-4">
      <div className="space-y-3">
        <div className="flex items-start justify-between gap-2">
          <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
          {onRemove ? (
            <button
              type="button"
              onClick={onRemove}
              className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
              aria-label={`Excluir ${title}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          ) : null}
        </div>
        {caboFotos ? (
          <CaboFotos inicio={caboFotos.inicio} fim={caboFotos.fim} />
        ) : (
          <Photos fotos={fotos} onRemovePhoto={onRemovePhoto} />
        )}
      </div>
      <div className="mt-auto space-y-3 pt-4">
        <ObsEditavel value={obs ?? ""} onChange={onObsChange} />
        {canEdit && onAdd ? (
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
    </div>
  );
}

function MetragemDesabilitada({ title }: { title: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center rounded-xl border border-border bg-gray-100 p-6 opacity-60">
      <h4 className="text-sm font-semibold text-gray-900">{title}</h4>
      <div className="flex min-h-[100px] items-center justify-center">
        <span className="rounded-full bg-white px-3 py-1.5 text-center text-sm font-semibold text-gray-700">
          Sem lançamento de cabos nesta OS
        </span>
      </div>
    </div>
  );
}

function simNao(value: boolean | null | undefined) {
  if (value === true) return "SIM";
  if (value === false) return "NÃO";
  return "—";
}

export function RelatorioDetalhe({
  row,
  canEditPhotos,
  onAddPhoto,
  uploadingCategoria,
  onUpdatePayload,
  canEditCadastro = false,
  onCadastroSaved,
}: {
  row: RelatorioTransmissao;
  canEditPhotos: boolean;
  onAddPhoto: (categoria: RelatorioFotoCategoria, file: EvidencePhotoRef) => void;
  uploadingCategoria: RelatorioFotoCategoria | null;
  onUpdatePayload?: (payload: RelatorioPayload) => void;
  canEditCadastro?: boolean;
  onCadastroSaved?: (saved: RelatorioTransmissao) => void;
}) {
  const [abaAtiva, setAbaAtiva] = useState<AbaCampo>("RE");
  const [modalEdicaoAberto, setModalEdicaoAberto] = useState(false);
  const isEmpresarial = row.tipo_execucao === "empresarial";
  const abasVisiveis = isEmpresarial
    ? ABAS_CAMPO
    : ABAS_CAMPO.filter((aba) => aba.id === "RE");

  useEffect(() => {
    setAbaAtiva("RE");
  }, [row.id]);

  useEffect(() => {
    if (!isEmpresarial) setAbaAtiva("RE");
  }, [isEmpresarial]);

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
    return payload?.[categoria].fotos.length ?? 0;
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

  const renderGrupo = (title: string, key: RelatorioFotoGrupoKey) => {
    const grupo = payload?.[key];
    return (
      <EvidenciaBloco
        key={key}
        title={title}
        obs={grupo?.obs}
        fotos={grupo?.fotos ?? []}
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
                patchPayload({ ...payload, [key]: removeFotoGrupoAt(payload[key], index) });
              }
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
  ) => (
    <EvidenciaBloco
      key={cabo.id}
      title={titulo}
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
              patchPayload({ ...payload, [categoria]: removeExtraById(payload[categoria], cabo.id) });
            }
          : undefined
      }
      {...blocoProps(categoria)}
    />
  );

  const renderOutra = (
    item: RelatorioPayload["outrasFotos"][number],
    index: number,
    categoria: "outrasFotos" | "outrasFotosRc" | "outrasFotosEqCliente" | "outrasFotosEqEstacao",
    titulo: string,
  ) => (
    <EvidenciaBloco
      key={item.id}
      title={titulo}
      obs={item.obs}
      fotos={item.foto ? [item.foto] : []}
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
        canEditPhotos && index >= 1
          ? () => {
              if (!payload) return;
              patchPayload({ ...payload, [categoria]: removeExtraById(payload[categoria], item.id) });
            }
          : undefined
      }
    />
  );

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

      <nav className="flex w-full border-b border-border" aria-label="Seções do relatório">
        {abasVisiveis.map((aba) => {
          const ativa = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => setAbaAtiva(aba.id)}
              className={`${abasVisiveis.length > 1 ? "min-w-0 flex-1" : ""} px-2 py-3 text-center text-xs sm:px-3 sm:text-sm transition ${
                ativa
                  ? "border-b-2 border-green-600 font-bold text-green-700"
                  : "border-b-2 border-transparent font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              {aba.label}
            </button>
          );
        })}
      </nav>

      {abaAtiva === "RE" ? (
        <div className="space-y-6">
          <MetaField label="Lançamento cabos (RE)" value={simNao(payload?.lancamentoRe)} />
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Postes e metragem
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              {payload?.lancamentoRe === false ? (
                <MetragemDesabilitada title="Metragem de cabo (RE)" />
              ) : (
                <>
                  {cabos.length === 0 && canEditPhotos ? (
                    <EvidenciaBloco
                      title="Metragem de cabo (RE)"
                      obs={null}
                      fotos={[]}
                      {...blocoProps("metragensCabo")}
                    />
                  ) : null}
                  {cabos.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "metragensCabo",
                      `Cabo ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`,
                    ),
                  )}
                </>
              )}
              {renderGrupo("Poste de conexão", "posteConexao")}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Caixas de emenda
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              {renderGrupo("Caixa de emenda", "caixaEmenda")}
              {renderGrupo("Sobra técnica", "sobraTecnica")}
            </div>
          </section>
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Demais evidências
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              {(
                [
                  ["Plaqueta de Identificação", "plaquetaIdentificacao"],
                  ["Novo aterramento do poste", "novoAterramentoPoste"],
                  ["Aterramento - TERROMETRO", "aterramentoTerrometro"],
                  ["Posição DGO/DIO", "posicaoConexaoEstacao"],
                  ["Etiqueta na estação/PPC", "etiquetaIdentificacao"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
              {(payload?.outrasFotos ?? []).map((item, index) =>
                item.foto || item.ref || item.obs || item.obsAdmin
                  ? renderOutra(item, index, "outrasFotos", `Outra — ${item.ref || "sem REF"}`)
                  : null,
              )}
              <EvidenciaBloco
                title="Outras fotos"
                obs={null}
                fotos={[]}
                {...blocoProps("outrasFotos")}
              />
            </div>
          </section>
        </div>
      ) : null}

      {abaAtiva === "RC" ? (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <MetaField label="Tecnologia de Acesso" value={payload?.tecnologiaAcesso || "—"} />
            <MetaField label="Lançamento cabos (RC)" value={simNao(payload?.lancamentoRc)} />
          </div>
          <section className="space-y-3">
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              {payload?.lancamentoRc === false ? (
                <MetragemDesabilitada title="Metragem de cabo (RC)" />
              ) : (
                <>
                  {cabosRc.length === 0 && canEditPhotos ? (
                    <EvidenciaBloco
                      title="Metragem de cabo (RC)"
                      obs={null}
                      fotos={[]}
                      {...blocoProps("metragensCaboRc")}
                    />
                  ) : null}
                  {cabosRc.map((cabo, index) =>
                    renderCabo(
                      cabo,
                      index,
                      "metragensCaboRc",
                      `Cabo RC ${index + 1} — ${cabo.tipoCabo || "tipo n/d"} · ${cabo.metragem || "—"}`,
                    ),
                  )}
                </>
              )}
              {(
                [
                  ["Poste de conexão (Rede cliente com Rede Externa)", "rcPosteConexao"],
                  ["Caixa de emenda na acomodação (Rede cliente com Rede Externa)", "rcCaixaEmenda"],
                  ["Terminação do cabo no cliente (PTO/Roseta - área interna)", "rcTerminacaoCabo"],
                  ["Plaqueta de Identificação - Terminação do cabo no cliente", "rcPlaquetaIdentificacao"],
                  ["Entrada do cabo no cliente (Área interna)", "rcEntradaInterna"],
                  ["Entrada do cabo no cliente (Área externa)", "rcEntradaExterna"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
              {(payload?.outrasFotosRc ?? []).map((item, index) =>
                item.foto || item.ref || item.obs || item.obsAdmin
                  ? renderOutra(item, index, "outrasFotosRc", `Outra (RC) — ${item.ref || "sem REF"}`)
                  : null,
              )}
              <EvidenciaBloco
                title="Outras fotos (RC)"
                obs={null}
                fotos={[]}
                {...blocoProps("outrasFotosRc")}
              />
            </div>
          </section>
        </div>
      ) : null}

      {abaAtiva === "equipamento" ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Equipamentos no Cliente
            </h3>
            <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
              {(
                [
                  ["Cliente - (Entrada/Fachada)", "eqClienteFachada"],
                  ["Cliente - Ambiente (geral da sala)", "eqClienteAmbiente"],
                  ["(Rack ou Local)", "eqClienteRack"],
                  ["DGO /DID; Roseta ou Pach panel", "eqClienteDgo"],
                  ["Equipamentos (No Cliente)", "eqClienteEquipamentos"],
                  ["Etiqueta de Identificação", "eqClienteEtiqueta"],
                  ["Identificação SGP no Cliente", "eqClienteSgp"],
                ] as const
              ).map(([title, key]) => renderGrupo(title, key))}
              {(payload?.outrasFotosEqCliente ?? []).map((item, index) =>
                item.foto || item.ref || item.obs || item.obsAdmin
                  ? renderOutra(
                      item,
                      index,
                      "outrasFotosEqCliente",
                      `Outra (Equip. cliente) — ${item.ref || "sem REF"}`,
                    )
                  : null,
              )}
              <EvidenciaBloco
                title="Outras fotos (Equip. cliente)"
                obs={null}
                fotos={[]}
                {...blocoProps("outrasFotosEqCliente")}
              />
            </div>
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
              <div className="grid grid-cols-1 items-stretch gap-4 xl:grid-cols-2">
                {(
                  [
                    ["Estação - (Foto geral da estação/PPC)", "eqEstacaoGeral"],
                    ["(Rack ou Local Instalação)", "eqEstacaoRack"],
                    ["Equipamento instalado (Na estação/PPC)", "eqEstacaoEquipamento"],
                    ["Etiqueta de identificação", "eqEstacaoEtiqueta"],
                    ["DGO / DID / ROUTER (Conexão)", "eqEstacaoDgo"],
                  ] as const
                ).map(([title, key]) => renderGrupo(title, key))}
                {(payload?.outrasFotosEqEstacao ?? []).map((item, index) =>
                  item.foto || item.ref || item.obs || item.obsAdmin
                    ? renderOutra(
                        item,
                        index,
                        "outrasFotosEqEstacao",
                        `Outra (Estação/PPC) — ${item.ref || "sem REF"}`,
                      )
                    : null,
                )}
                <EvidenciaBloco
                  title="Outras fotos (Estação/PPC)"
                  obs={null}
                  fotos={[]}
                  {...blocoProps("outrasFotosEqEstacao")}
                />
              </div>
            </section>
          ) : (
            <p className="text-sm text-muted-foreground">
              Relatório fotográfico da estação/PPC não foi adicionado.
            </p>
          )}
        </div>
      ) : null}

      {abaAtiva === "teste-optico" || abaAtiva === "teste-potencia" ? (
        <p className="rounded-xl border border-dashed border-border bg-muted/20 p-4 text-sm text-muted-foreground">
          Campos em definição.
        </p>
      ) : null}
    </div>
  );
}
