import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { RelatorioFotosBloco } from "@/components/RelatorioFotosBloco";
import {
  ChoiceButton,
  RelatorioOutrasFotos,
  inputClass,
  type GrupoFotoCampo,
  type OutraFotoState,
} from "@/components/RelatorioRedeAcesso";
import type { EvidencePhotoRef } from "@/lib/types";
import type { RelatorioFotoGrupoKey } from "@/lib/relatorios-transmissao";

export function RelatorioEquipamento({
  readOnly,
  gruposCliente,
  outrasCliente,
  onOutrasClienteChange,
  onOutraClientePhoto,
  relatorioEstacao,
  onRelatorioEstacao,
  estacaoEntregaAcesso,
  onEstacaoEntregaAcesso,
  gruposEstacao,
  outrasEstacao,
  onOutrasEstacaoChange,
  onOutraEstacaoPhoto,
  onGrupoPhoto,
}: {
  readOnly: boolean;
  gruposCliente: GrupoFotoCampo[];
  outrasCliente: OutraFotoState[];
  onOutrasClienteChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraClientePhoto: (itemId: string, file: EvidencePhotoRef) => void;
  relatorioEstacao: "sim" | "nao";
  onRelatorioEstacao: (value: "sim" | "nao") => void;
  estacaoEntregaAcesso: string;
  onEstacaoEntregaAcesso: (value: string) => void;
  gruposEstacao: GrupoFotoCampo[];
  outrasEstacao: OutraFotoState[];
  onOutrasEstacaoChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraEstacaoPhoto: (itemId: string, file: EvidencePhotoRef) => void;
  onGrupoPhoto: (
    grupoKey: RelatorioFotoGrupoKey,
    slotId: string,
    file: EvidencePhotoRef | null,
  ) => void;
}) {
  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        <h2 className="text-base font-bold">Equipamentos no Cliente</h2>
        {gruposCliente.map((grupo) => (
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
        <RelatorioOutrasFotos
          title="Outras fotos"
          outras={outrasCliente}
          onOutrasChange={onOutrasClienteChange}
          onOutraPhoto={onOutraClientePhoto}
          readOnly={readOnly}
        />

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
            <RelatorioOutrasFotos
              title="Outras fotos"
              outras={outrasEstacao}
              onOutrasChange={onOutrasEstacaoChange}
              onOutraPhoto={onOutraEstacaoPhoto}
              readOnly={readOnly}
            />
          </div>
        ) : null}
      </div>
    </EvidencePhotoPasteProvider>
  );
}
