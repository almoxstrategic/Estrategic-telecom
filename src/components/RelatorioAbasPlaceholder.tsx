import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { ChoiceButton, inputClass } from "@/components/RelatorioRedeAcesso";
import {
  emptyMedicaoTomada,
  type ContatosPayload,
  type EquipamentoRedeIpsPayload,
  type InfraestruturaPayload,
  type MedicaoTomadaPayload,
} from "@/lib/relatorios-transmissao";

type CommonProps = {
  readOnly?: boolean;
};

function TextField({
  label,
  value,
  onChange,
  disabled,
  inputMode,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email";
  type?: string;
  placeholder?: string;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        type={type}
        inputMode={inputMode}
        value={value}
        placeholder={placeholder}
        disabled={disabled || !onChange}
        onChange={(e) => onChange?.(e.target.value)}
        className={inputClass()}
      />
    </div>
  );
}

export function EquipamentosIpsCard({
  title,
  value,
  onChange,
  readOnly = false,
}: {
  title: string;
  value: EquipamentoRedeIpsPayload;
  onChange?: (next: EquipamentoRedeIpsPayload) => void;
  readOnly?: boolean;
}) {
  const patch = (partial: Partial<EquipamentoRedeIpsPayload>) =>
    onChange?.({ ...value, ...partial });
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField
          label="Host Name"
          value={value.hostName}
          onChange={(hostName) => patch({ hostName })}
          disabled={readOnly}
        />
        <TextField
          label="IP ETH"
          value={value.ipEth}
          onChange={(ipEth) => patch({ ipEth })}
          disabled={readOnly}
        />
        <TextField
          label="IP GW"
          value={value.ipGw}
          onChange={(ipGw) => patch({ ipGw })}
          disabled={readOnly}
        />
        <TextField
          label="IP DMLAN"
          value={value.ipDmlan}
          onChange={(ipDmlan) => patch({ ipDmlan })}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

type InfraPerguntaKey = Exclude<keyof InfraestruturaPayload, "tomadas">;

const INFRA_PERGUNTAS: { key: InfraPerguntaKey; label: string }[] = [
  { key: "possuiEspacoRack", label: "Cliente possui espaço no RACK?" },
  { key: "tomadasNovoPadrao", label: "Tomadas elétricas novo padrão?" },
  { key: "pinagemPadraoCorreto", label: "Pinagem no padrão correto (N-F-T)?" },
  { key: "possuiNobreak", label: "Cliente possui NOBREAK?" },
  { key: "localClimatizado", label: "Local CLIMATIZADO?" },
];

function TomadaCard({
  index,
  value,
  onChange,
  readOnly,
}: {
  index: number;
  value: MedicaoTomadaPayload;
  onChange?: (next: MedicaoTomadaPayload) => void;
  readOnly?: boolean;
}) {
  const patch = (partial: Partial<MedicaoTomadaPayload>) =>
    onChange?.({ ...value, ...partial });
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">Tomada {index + 1}</h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <TextField
          label="Fase - Neutro (V)"
          type="number"
          inputMode="decimal"
          value={value.faseNeutro}
          onChange={(faseNeutro) => patch({ faseNeutro })}
          disabled={readOnly}
        />
        <TextField
          label="Terra - Fase (V)"
          type="number"
          inputMode="decimal"
          value={value.terraFase}
          onChange={(terraFase) => patch({ terraFase })}
          disabled={readOnly}
        />
        <TextField
          label="Terra - Neutro (V)"
          type="number"
          inputMode="decimal"
          value={value.terraNeutro}
          onChange={(terraNeutro) => patch({ terraNeutro })}
          disabled={readOnly}
        />
      </div>
    </div>
  );
}

export function AbaInfraestrutura({
  value,
  onChange,
  readOnly = false,
}: CommonProps & {
  value: InfraestruturaPayload;
  onChange?: (next: InfraestruturaPayload) => void;
}) {
  const tomadas = value.tomadas.length ? value.tomadas : [emptyMedicaoTomada()];
  return (
    <div className="space-y-3">
      {INFRA_PERGUNTAS.map(({ key, label }) => (
        <div
          key={key}
          className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-base font-bold">{label}</h2>
          <div className="flex gap-2">
            <ChoiceButton
              active={value[key] === true}
              onClick={() => onChange?.({ ...value, [key]: true })}
              disabled={readOnly || !onChange}
            >
              SIM
            </ChoiceButton>
            <ChoiceButton
              active={value[key] === false}
              onClick={() => onChange?.({ ...value, [key]: false })}
              disabled={readOnly || !onChange}
            >
              NÃO
            </ChoiceButton>
          </div>
        </div>
      ))}

      <div className="space-y-4 pt-1">
        {tomadas.map((tomada, index) => (
          <TomadaCard
            key={tomada.id}
            index={index}
            value={tomada}
            readOnly={readOnly}
            onChange={(next) =>
              onChange?.({
                ...value,
                tomadas: tomadas.map((t) => (t.id === next.id ? next : t)),
              })
            }
          />
        ))}
        {readOnly || !onChange ? null : (
          <button
            type="button"
            onClick={() =>
              onChange({ ...value, tomadas: [...tomadas, emptyMedicaoTomada()] })
            }
            className="inline-flex items-center gap-2 rounded-lg border border-primary/40 px-3 py-2 text-sm font-semibold text-primary hover:bg-primary/5"
          >
            <Plus className="h-4 w-4" /> Adicionar mais tomada
          </button>
        )}
      </div>
    </div>
  );
}

export function AbaMedicoes() {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-card p-8 text-center shadow-sm">
      <p className="text-sm text-muted-foreground">Sem formulários ativos</p>
    </div>
  );
}

function ContatoSubsecao({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-bold text-muted-foreground">{title}</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
    </div>
  );
}

export function AbaContatos({
  value,
  onChange,
  readOnly = false,
}: CommonProps & {
  value: ContatosPayload;
  onChange?: (next: ContatosPayload) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">Contato Cliente</h2>
        <ContatoSubsecao title="Local">
          <TextField
            label="Nome"
            value={value.cliente.local.nome}
            onChange={(nome) =>
              onChange?.({
                ...value,
                cliente: {
                  ...value.cliente,
                  local: { ...value.cliente.local, nome },
                },
              })
            }
            disabled={readOnly}
          />
          <TextField
            label="Telefone"
            value={value.cliente.local.telefone}
            onChange={(telefone) =>
              onChange?.({
                ...value,
                cliente: {
                  ...value.cliente,
                  local: { ...value.cliente.local, telefone },
                },
              })
            }
            disabled={readOnly}
          />
        </ContatoSubsecao>
        <ContatoSubsecao title="Remoto">
          <TextField
            label="Email"
            type="email"
            value={value.cliente.remoto.email}
            onChange={(email) =>
              onChange?.({
                ...value,
                cliente: {
                  ...value.cliente,
                  remoto: { ...value.cliente.remoto, email },
                },
              })
            }
            disabled={readOnly}
          />
          <TextField
            label="Telefone"
            value={value.cliente.remoto.telefone}
            onChange={(telefone) =>
              onChange?.({
                ...value,
                cliente: {
                  ...value.cliente,
                  remoto: { ...value.cliente.remoto, telefone },
                },
              })
            }
            disabled={readOnly}
          />
        </ContatoSubsecao>
      </div>

      <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">Contato Empresa Parceira</h2>
        <ContatoSubsecao title="Supervisor Responsável">
          <TextField
            label="Nome"
            value={value.empresaParceira.supervisor.nome}
            onChange={(nome) =>
              onChange?.({
                ...value,
                empresaParceira: {
                  ...value.empresaParceira,
                  supervisor: { ...value.empresaParceira.supervisor, nome },
                },
              })
            }
            disabled={readOnly}
          />
          <TextField
            label="Telefone"
            value={value.empresaParceira.supervisor.telefone}
            onChange={(telefone) =>
              onChange?.({
                ...value,
                empresaParceira: {
                  ...value.empresaParceira,
                  supervisor: { ...value.empresaParceira.supervisor, telefone },
                },
              })
            }
            disabled={readOnly}
          />
        </ContatoSubsecao>
        <ContatoSubsecao title="Técnico Responsável">
          <TextField
            label="Telefone"
            value={value.empresaParceira.tecnico.telefone}
            onChange={(telefone) =>
              onChange?.({
                ...value,
                empresaParceira: {
                  ...value.empresaParceira,
                  tecnico: { ...value.empresaParceira.tecnico, telefone },
                },
              })
            }
            disabled={readOnly}
          />
          <TextField
            label="Email"
            type="email"
            value={value.empresaParceira.tecnico.email}
            onChange={(email) =>
              onChange?.({
                ...value,
                empresaParceira: {
                  ...value.empresaParceira,
                  tecnico: { ...value.empresaParceira.tecnico, email },
                },
              })
            }
            disabled={readOnly}
          />
        </ContatoSubsecao>
      </div>
    </div>
  );
}
