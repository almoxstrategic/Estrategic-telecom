import { useState, useEffect } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RelatorioFotosBloco } from "@/components/RelatorioFotosBloco";
import {
  AccordionBloco,
  RelatorioOutrasFotos,
  inputClass,
  textareaObsClass,
  type GrupoFotoCampo,
  type OutraFotoState,
} from "@/components/RelatorioRedeAcesso";
import { EquipamentosIpsCard } from "@/components/RelatorioAbasPlaceholder";
import { TipoEquipamentoCombobox } from "@/components/TipoEquipamentoCombobox";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  deleteRelatorioPhoto,
  emptyDgoClienteItem,
  emptyEquipamentoClienteItem,
  removeExtraById,
  type DgoClienteItemPayload,
  type EquipamentoClienteItemPayload,
  type EquipamentoRedeIpsPayload,
  type RelatorioFotoGrupoKey,
  type StoredPhoto,
} from "@/lib/relatorios-transmissao";

type CampoFotoEq = "foto" | "etiqueta";

function CampoTexto({
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClass()}
      />
    </div>
  );
}

function FotoParCampo({
  label,
  stored,
  readOnly,
  onPick,
}: {
  label: string;
  stored: StoredPhoto | null;
  readOnly: boolean;
  onPick: (file: EvidencePhotoRef | null) => void;
}) {
  if (stored) {
    return (
      <div>
        <div className="mb-1">
          <FotoLabel>{label}</FotoLabel>
        </div>
        <RelatorioFotoComControles
          src={stored.url}
          alt={label}
          canEdit={!readOnly}
          onDelete={
            !readOnly
              ? () => {
                  void deleteRelatorioPhoto(stored.path);
                  onPick(null);
                }
              : undefined
          }
          onReplace={
            !readOnly
              ? (file) => {
                  void deleteRelatorioPhoto(stored.path);
                  onPick(file);
                }
              : undefined
          }
        />
      </div>
    );
  }
  if (readOnly) {
    return (
      <div>
        <FotoLabel>{label}</FotoLabel>
        <p className="text-sm text-muted-foreground">Sem foto</p>
      </div>
    );
  }
  return <PhotoUpload label={label} value={null} onChange={onPick} />;
}

function EquipamentoItemCard({
  title,
  index,
  item,
  showIdentificacao,
  tipoEquipamentoFixo,
  readOnly,
  canRemove,
  onPatch,
  onRemove,
  onPhoto,
}: {
  title: string;
  index: number;
  item: EquipamentoClienteItemPayload | DgoClienteItemPayload;
  showIdentificacao: boolean;
  /** Quando definido, trava o tipo (ex.: bloco Roseta → Roseta). */
  tipoEquipamentoFixo?: string;
  readOnly: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<EquipamentoClienteItemPayload & DgoClienteItemPayload>) => void;
  onRemove: () => void;
  onPhoto: (campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
}) {
  useEffect(() => {
    if (!tipoEquipamentoFixo || readOnly) return;
    if (item.tipoEquipamento?.trim() === tipoEquipamentoFixo) return;
    onPatch({ tipoEquipamento: tipoEquipamentoFixo });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- normaliza tipo fixo do card
  }, [item.id, tipoEquipamentoFixo, readOnly]);

  return (
    <div className="flex h-full flex-col space-y-4 border-b border-gray-100 pb-4 last:border-b-0 last:pb-0">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base font-bold">
          {title} {index + 1}
        </h3>
        {canRemove && !readOnly ? (
          <button
            type="button"
            onClick={() => {
              void deleteRelatorioPhoto(item.foto?.path);
              void deleteRelatorioPhoto(item.etiqueta?.path);
              onRemove();
            }}
            className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
            aria-label={`Excluir ${title} ${index + 1}`}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="min-w-0">
          <label className="mb-1.5 block text-sm font-semibold">Tipo equipamento</label>
          {tipoEquipamentoFixo ? (
            <TipoEquipamentoCombobox
              value={item.tipoEquipamento?.trim() || tipoEquipamentoFixo}
              onChange={() => {}}
              disabled
            />
          ) : (
            <TipoEquipamentoCombobox
              value={item.tipoEquipamento}
              onChange={(tipoEquipamento) => onPatch({ tipoEquipamento })}
              disabled={readOnly}
            />
          )}
        </div>
        <CampoTexto
          label="Modelo"
          value={item.modelo}
          onChange={(modelo) => onPatch({ modelo })}
          disabled={readOnly}
        />
        <CampoTexto
          label="Fabricante"
          value={item.fabricante}
          onChange={(fabricante) => onPatch({ fabricante })}
          disabled={readOnly}
        />
        <CampoTexto
          label="SGP"
          value={item.sgp}
          onChange={(sgp) => onPatch({ sgp })}
          disabled={readOnly}
        />
        {showIdentificacao ? (
          <CampoTexto
            label="Identificação"
            value={"identificacao" in item ? item.identificacao : ""}
            onChange={(identificacao) => onPatch({ identificacao })}
            disabled={readOnly}
            placeholder="Identificação do equipamento"
          />
        ) : null}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <FotoParCampo
          label="Foto do equipamento"
          stored={item.foto}
          readOnly={readOnly}
          onPick={(file) => onPhoto("foto", file)}
        />
        <FotoParCampo
          label="Etiqueta de Identificação"
          stored={item.etiqueta}
          readOnly={readOnly}
          onPick={(file) => onPhoto("etiqueta", file)}
        />
      </div>

      <div className="w-full min-w-0">
        <label className="mb-1.5 block text-sm font-semibold">OBS</label>
        <textarea
          value={item.obs}
          onChange={(e) => onPatch({ obs: e.target.value })}
          disabled={readOnly}
          rows={2}
          className={textareaObsClass()}
          placeholder="Observações"
        />
      </div>
    </div>
  );
}

function ListaItensEquipamento({
  id,
  itemLabel,
  itens,
  showIdentificacao,
  tipoEquipamentoFixo,
  addLabel,
  readOnly,
  onChange,
  onPhoto,
  emptyItem,
}: {
  id?: string;
  itemLabel: string;
  itens: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[];
  showIdentificacao: boolean;
  tipoEquipamentoFixo?: string;
  addLabel: string;
  readOnly: boolean;
  onChange: (next: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[]) => void;
  onPhoto: (itemId: string, campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
  emptyItem: () => EquipamentoClienteItemPayload | DgoClienteItemPayload;
}) {
  const [fallback] = useState(() => emptyItem());
  const list = itens.length ? itens : [fallback];
  return (
    <div id={id} className="scroll-mt-36 space-y-4">
      <div className="flex flex-col gap-4">
        {list.map((item, index) => (
          <EquipamentoItemCard
            key={item.id}
            title={itemLabel}
            index={index}
            item={item}
            showIdentificacao={showIdentificacao}
            tipoEquipamentoFixo={tipoEquipamentoFixo}
            readOnly={readOnly}
            canRemove={index >= 1}
            onPatch={(patch) =>
              onChange(list.map((row) => (row.id === item.id ? { ...row, ...patch } : row)))
            }
            onRemove={() => onChange(removeExtraById(list, item.id))}
            onPhoto={(campo, file) => onPhoto(item.id, campo, file)}
          />
        ))}
      </div>
      {!readOnly ? (
        <button
          type="button"
          onClick={() => onChange([...list, emptyItem()])}
          className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
        >
          <Plus className="h-4 w-4" /> {addLabel}
        </button>
      ) : null}
    </div>
  );
}

const flatSectionClass = "border-b border-gray-100 pb-6 last:border-b-0 last:pb-0";

export function RelatorioEquipamento({
  readOnly,
  showObsAdmin = false,
  stickTabsAtViewportTop = true,
  tecnologiaAcesso = "",
  onTecnologiaAcessoChange,
  gruposCliente,
  equipamentosCliente,
  onEquipamentosClienteChange,
  onEquipamentoClientePhoto,
  dgosCliente,
  onDgosClienteChange,
  onDgoClientePhoto,
  outrasCliente,
  onOutrasClienteChange,
  onOutraClientePhoto,
  estacaoEntregaAcesso,
  onEstacaoEntregaAcesso,
  equipamentosEstacao,
  onEquipamentosEstacaoChange,
  onEquipamentoEstacaoPhoto,
  dgosEstacao,
  onDgosEstacaoChange,
  onDgoEstacaoPhoto,
  gruposConexaoEstacao = [],
  onGrupoPhoto,
  configuracaoCliente,
  onConfiguracaoClienteChange,
  configuracaoEstacao,
  onConfiguracaoEstacaoChange,
}: {
  readOnly: boolean;
  showObsAdmin?: boolean;
  stickTabsAtViewportTop?: boolean;
  tecnologiaAcesso?: string;
  onTecnologiaAcessoChange?: (value: string) => void;
  gruposCliente: GrupoFotoCampo[];
  equipamentosCliente: EquipamentoClienteItemPayload[];
  onEquipamentosClienteChange: (next: EquipamentoClienteItemPayload[]) => void;
  onEquipamentoClientePhoto: (
    itemId: string,
    campo: CampoFotoEq,
    file: EvidencePhotoRef | null,
  ) => void;
  dgosCliente: DgoClienteItemPayload[];
  onDgosClienteChange: (next: DgoClienteItemPayload[]) => void;
  onDgoClientePhoto: (itemId: string, campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
  outrasCliente: OutraFotoState[];
  onOutrasClienteChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraClientePhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  estacaoEntregaAcesso: string;
  onEstacaoEntregaAcesso: (value: string) => void;
  equipamentosEstacao: EquipamentoClienteItemPayload[];
  onEquipamentosEstacaoChange: (next: EquipamentoClienteItemPayload[]) => void;
  onEquipamentoEstacaoPhoto: (
    itemId: string,
    campo: CampoFotoEq,
    file: EvidencePhotoRef | null,
  ) => void;
  dgosEstacao: DgoClienteItemPayload[];
  onDgosEstacaoChange: (next: DgoClienteItemPayload[]) => void;
  onDgoEstacaoPhoto: (itemId: string, campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
  gruposConexaoEstacao?: GrupoFotoCampo[];
  onGrupoPhoto: (
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
  ) => void;
  configuracaoCliente: EquipamentoRedeIpsPayload;
  onConfiguracaoClienteChange: (next: EquipamentoRedeIpsPayload) => void;
  configuracaoEstacao: EquipamentoRedeIpsPayload;
  onConfiguracaoEstacaoChange: (next: EquipamentoRedeIpsPayload) => void;
}) {
  void showObsAdmin;
  const sgpGrupo = gruposCliente.find((g) => g.grupoKey === "eqClienteSgp");

  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        <AccordionBloco
          title="EQUIPAMENTO NO CLIENTE"
          id="secao-eq-cliente"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco="EQ.cliente"
        >
          <div
            id="secao-tecnologia-acesso"
            className={`scroll-mt-36 space-y-3 ${flatSectionClass}`}
          >
            <label htmlFor="tecnologia-acesso" className="mb-1.5 block text-sm font-semibold">
              Tecnologia de Acesso
            </label>
            <input
              id="tecnologia-acesso"
              type="text"
              value={tecnologiaAcesso}
              onChange={(e) => onTecnologiaAcessoChange?.(e.target.value)}
              placeholder="EX: FO ABC"
              disabled={readOnly || !onTecnologiaAcessoChange}
              className={inputClass()}
            />
          </div>

          <div className={flatSectionClass}>
            <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Roseta
            </h4>
            <ListaItensEquipamento
              id="secao-eq-dgo-cliente"
              itemLabel="Roseta"
              itens={dgosCliente}
              showIdentificacao={false}
              tipoEquipamentoFixo="Roseta"
              addLabel="Adicionar mais Roseta"
              readOnly={readOnly}
              onChange={(next) => onDgosClienteChange(next as DgoClienteItemPayload[])}
              onPhoto={onDgoClientePhoto}
              emptyItem={emptyDgoClienteItem}
            />
          </div>

          <div className={flatSectionClass}>
            <ListaItensEquipamento
              id="secao-eq-equipamentos-cliente"
              itemLabel="Equipamento"
              itens={equipamentosCliente}
              showIdentificacao
              addLabel="Adicionar mais Equipamento"
              readOnly={readOnly}
              onChange={(next) =>
                onEquipamentosClienteChange(next as EquipamentoClienteItemPayload[])
              }
              onPhoto={onEquipamentoClientePhoto}
              emptyItem={emptyEquipamentoClienteItem}
            />
          </div>

          {sgpGrupo ? (
            <div className={flatSectionClass}>
              <RelatorioFotosBloco
                id={`secao-${sgpGrupo.grupoKey}`}
                title={sgpGrupo.title}
                hint={sgpGrupo.hint}
                variant="flat"
                slots={sgpGrupo.slots}
                onChange={sgpGrupo.onChange}
                obs={sgpGrupo.obs}
                onObsChange={sgpGrupo.onObsChange}
                minSlots={sgpGrupo.minSlots}
                readOnly={readOnly}
                onPickPhoto={(id, file) => onGrupoPhoto(sgpGrupo.grupoKey, id, file)}
              />
            </div>
          ) : null}

          <div id="secao-eq-config-cliente" className="scroll-mt-36">
            <EquipamentosIpsCard
              title="Configuração equipamento no cliente"
              value={configuracaoCliente}
              onChange={onConfiguracaoClienteChange}
              readOnly={readOnly}
              embedded
            />
          </div>
        </AccordionBloco>

        <AccordionBloco
          title="EQUIPAMENTO NA ESTAÇÃO"
          id="secao-eq-estacao"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco="EQ.estacao"
        >
          <div
            id="secao-estacao-entrega-acesso"
            className={`scroll-mt-36 space-y-3 ${flatSectionClass}`}
          >
            <label htmlFor="estacao-entrega-acesso" className="mb-1.5 block text-sm font-semibold">
              Estação Entrega de Acesso
            </label>
            <input
              id="estacao-entrega-acesso"
              type="text"
              value={estacaoEntregaAcesso}
              onChange={(e) => onEstacaoEntregaAcesso(e.target.value)}
              placeholder="Nome / identificação da estação"
              disabled={readOnly}
              className={inputClass()}
            />
          </div>

          <div className={flatSectionClass}>
            <ListaItensEquipamento
              id="secao-eq-dgo-estacao"
              itemLabel="DGO / DID / ROUTER"
              itens={dgosEstacao}
              showIdentificacao={false}
              addLabel="Adicionar DGO / DID / ROUTER"
              readOnly={readOnly}
              onChange={(next) => onDgosEstacaoChange(next as DgoClienteItemPayload[])}
              onPhoto={onDgoEstacaoPhoto}
              emptyItem={emptyDgoClienteItem}
            />
          </div>

          {gruposConexaoEstacao.map((grupo) => (
            <div key={grupo.grupoKey} className={flatSectionClass}>
              <RelatorioFotosBloco
                id={`secao-${grupo.grupoKey}`}
                title={grupo.title}
                hint={grupo.hint}
                variant="flat"
                slots={grupo.slots}
                onChange={grupo.onChange}
                obs={grupo.obs}
                onObsChange={grupo.onObsChange}
                minSlots={grupo.minSlots}
                readOnly={readOnly}
                onPickPhoto={(id, file) => onGrupoPhoto(grupo.grupoKey, id, file)}
              />
            </div>
          ))}

          <div className={flatSectionClass}>
            <ListaItensEquipamento
              id="secao-eq-equipamentos-estacao"
              itemLabel="Equipamento"
              itens={equipamentosEstacao}
              showIdentificacao
              addLabel="Adicionar mais Equipamento"
              readOnly={readOnly}
              onChange={(next) =>
                onEquipamentosEstacaoChange(next as EquipamentoClienteItemPayload[])
              }
              onPhoto={onEquipamentoEstacaoPhoto}
              emptyItem={emptyEquipamentoClienteItem}
            />
          </div>

          <div id="secao-eq-config-estacao" className="scroll-mt-36">
            <EquipamentosIpsCard
              title="Configuração equipamento na estação"
              value={configuracaoEstacao}
              onChange={onConfiguracaoEstacaoChange}
              readOnly={readOnly}
              embedded
            />
          </div>
        </AccordionBloco>

        <AccordionBloco
          title="OUTRAS FOTOS"
          id="secao-eq-outras-fotos"
          stickTabsAtViewportTop={stickTabsAtViewportTop}
          pendenciaBloco="EQ.outras"
        >
          <RelatorioOutrasFotos
            title="Outras fotos"
            outras={outrasCliente}
            onOutrasChange={onOutrasClienteChange}
            onOutraPhoto={onOutraClientePhoto}
            readOnly={readOnly}
            variant="flat"
          />
        </AccordionBloco>
      </div>
    </EvidencePhotoPasteProvider>
  );
}
