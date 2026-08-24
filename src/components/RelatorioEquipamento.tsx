import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RelatorioFotosBloco } from "@/components/RelatorioFotosBloco";
import {
  ChoiceButton,
  RelatorioOutrasFotos,
  inputClass,
  type GrupoFotoCampo,
  type OutraFotoState,
} from "@/components/RelatorioRedeAcesso";
import { EquipamentosIpsCard } from "@/components/RelatorioAbasPlaceholder";
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
  readOnly: boolean;
  canRemove: boolean;
  onPatch: (patch: Partial<EquipamentoClienteItemPayload & DgoClienteItemPayload>) => void;
  onRemove: () => void;
  onPhoto: (campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
}) {
  return (
    <div className="flex h-full flex-col space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
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
        <CampoTexto
          label="Tipo equipamento"
          value={item.tipoEquipamento}
          onChange={(tipoEquipamento) => onPatch({ tipoEquipamento })}
          disabled={readOnly}
          placeholder="Ex: ONT, Switch"
        />
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

      <div>
        <label className="mb-1.5 block text-sm font-semibold">OBS</label>
        <textarea
          value={item.obs}
          onChange={(e) => onPatch({ obs: e.target.value })}
          disabled={readOnly}
          rows={2}
          className={inputClass()}
          placeholder="Observações"
        />
      </div>
    </div>
  );
}

function ListaItensEquipamento({
  tituloSecao,
  itemLabel,
  itens,
  showIdentificacao,
  addLabel,
  readOnly,
  onChange,
  onPhoto,
  emptyItem,
}: {
  tituloSecao: string;
  itemLabel: string;
  itens: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[];
  showIdentificacao: boolean;
  addLabel: string;
  readOnly: boolean;
  onChange: (next: (EquipamentoClienteItemPayload | DgoClienteItemPayload)[]) => void;
  onPhoto: (itemId: string, campo: CampoFotoEq, file: EvidencePhotoRef | null) => void;
  emptyItem: () => EquipamentoClienteItemPayload | DgoClienteItemPayload;
}) {
  const [fallback] = useState(() => emptyItem());
  const list = itens.length ? itens : [fallback];
  return (
    <div className="space-y-4 md:col-span-2">
      <h2 className="text-base font-bold">{tituloSecao}</h2>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        {list.map((item, index) => (
          <EquipamentoItemCard
            key={item.id}
            title={itemLabel}
            index={index}
            item={item}
            showIdentificacao={showIdentificacao}
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

export function RelatorioEquipamento({
  readOnly,
  showObsAdmin = false,
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
  relatorioEstacao,
  onRelatorioEstacao,
  estacaoEntregaAcesso,
  onEstacaoEntregaAcesso,
  gruposEstacao,
  equipamentosEstacao,
  onEquipamentosEstacaoChange,
  onEquipamentoEstacaoPhoto,
  dgosEstacao,
  onDgosEstacaoChange,
  onDgoEstacaoPhoto,
  outrasEstacao,
  onOutrasEstacaoChange,
  onOutraEstacaoPhoto,
  gruposConexaoEstacao = [],
  onGrupoPhoto,
  configuracaoCliente,
  onConfiguracaoClienteChange,
  configuracaoEstacao,
  onConfiguracaoEstacaoChange,
}: {
  readOnly: boolean;
  showObsAdmin?: boolean;
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
  relatorioEstacao: "sim" | "nao";
  onRelatorioEstacao: (value: "sim" | "nao") => void;
  estacaoEntregaAcesso: string;
  onEstacaoEntregaAcesso: (value: string) => void;
  gruposEstacao: GrupoFotoCampo[];
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
  outrasEstacao: OutraFotoState[];
  onOutrasEstacaoChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraEstacaoPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
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

  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        <h2 className="text-base font-bold">Equipamentos no Cliente</h2>
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          {gruposCliente
            .filter((grupo) => grupo.grupoKey !== "eqClienteSgp")
            .map((grupo) => (
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

          <ListaItensEquipamento
            tituloSecao="DGO /DID; Roseta ou Pach panel"
            itemLabel="DGO/Roseta"
            itens={dgosCliente}
            showIdentificacao={false}
            addLabel="Adicionar mais DGO/Roseta/Patch Panel"
            readOnly={readOnly}
            onChange={(next) => onDgosClienteChange(next as DgoClienteItemPayload[])}
            onPhoto={onDgoClientePhoto}
            emptyItem={emptyDgoClienteItem}
          />

          <ListaItensEquipamento
            tituloSecao="Equipamentos (No Cliente)"
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

          {gruposCliente
            .filter((grupo) => grupo.grupoKey === "eqClienteSgp")
            .map((grupo) => (
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
          outras={outrasCliente}
          onOutrasChange={onOutrasClienteChange}
          onOutraPhoto={onOutraClientePhoto}
          readOnly={readOnly}
        />

        {gruposConexaoEstacao.length ? (
          <div className="space-y-3">
            <h2 className="text-base font-bold">Conexão na Estação/PPC</h2>
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {gruposConexaoEstacao.map((grupo) => (
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
          </div>
        ) : null}

        <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-base font-bold">
            Adicionar Relatório fotográfico (Equipamento de acesso na Estação/PPC)?
          </h2>
          <div className="flex gap-2">
            <ChoiceButton
              active={relatorioEstacao === "sim"}
              onClick={() => onRelatorioEstacao("sim")}
              disabled={readOnly}
            >
              SIM
            </ChoiceButton>
            <ChoiceButton
              active={relatorioEstacao === "nao"}
              onClick={() => onRelatorioEstacao("nao")}
              disabled={readOnly}
            >
              NÃO
            </ChoiceButton>
          </div>
        </div>

        {relatorioEstacao === "sim" ? (
          <div className="space-y-5">
            <h2 className="text-base font-bold">Equipamentos na Estação/PPC</h2>
            <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
              <label
                htmlFor="estacao-entrega-acesso"
                className="mb-1.5 block text-sm font-semibold"
              >
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
            <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
              {gruposEstacao.map((grupo) => (
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

              <ListaItensEquipamento
                tituloSecao="Equipamento instalado (Na estação/PPC)"
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

              <ListaItensEquipamento
                tituloSecao="DGO / DID / ROUTER (Conexão)"
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
            <RelatorioOutrasFotos
              title="Outras fotos"
              outras={outrasEstacao}
              onOutrasChange={onOutrasEstacaoChange}
              onOutraPhoto={onOutraEstacaoPhoto}
              readOnly={readOnly}
            />
          </div>
        ) : null}

        <div className="space-y-4">
          <EquipamentosIpsCard
            title="Equipamentos Instalados No cliente"
            value={configuracaoCliente}
            onChange={onConfiguracaoClienteChange}
            readOnly={readOnly}
          />
          <EquipamentosIpsCard
            title="Equipamentos Instalados Na estação"
            value={configuracaoEstacao}
            onChange={onConfiguracaoEstacaoChange}
            readOnly={readOnly}
          />
        </div>
      </div>
    </EvidencePhotoPasteProvider>
  );
}
