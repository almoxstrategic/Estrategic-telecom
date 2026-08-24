import { useEffect, useId, useState, type ReactNode, type RefObject } from "react";
import { ChevronDown, ChevronUp, Plus, Trash2 } from "lucide-react";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { FotoLabel, RelatorioFotoComControles } from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { RelatorioFotosBloco, type FotoSlot } from "@/components/RelatorioFotosBloco";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  apenasDigitos,
  calcularMetragemCaboTotal,
  deleteRelatorioPhoto,
  type AmbienteRede,
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
  | "teste-potencia"
  | "infraestrutura"
  | "medicoes"
  | "contatos";

export const ABAS_CAMPO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Externa (RE)" },
  { id: "RC", label: "Rede Cliente (RC)" },
  { id: "equipamento", label: "Equipamento" },
  { id: "teste-optico", label: "Teste Óptico" },
  { id: "teste-otdr", label: "Teste OTDR" },
  { id: "teste-potencia", label: "Teste de Potência" },
  { id: "infraestrutura", label: "Infraestrutura" },
  { id: "medicoes", label: "Medições" },
  { id: "contatos", label: "Contatos" },
];

/** App de campo (técnico): sem Contatos nem Medições (abas só no painel do gestor). */
export const ABAS_CAMPO_TECNICO: { id: AbaCampo; label: string }[] = ABAS_CAMPO.filter(
  (aba) => aba.id !== "contatos" && aba.id !== "medicoes",
);

export const ABAS_CAMPO_IMPLANTACAO: { id: AbaCampo; label: string }[] = [
  { id: "RE", label: "Rede Externa (RE)" },
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
      className={`w-full min-w-0 flex-1 rounded-lg border px-2 py-1.5 text-sm font-semibold leading-tight transition ${
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

/** Header sticky (~64px) + faixa das abas — ponto em que CABOS “toca” o menu. */
const ABAS_COMPACT_THRESHOLD_PX = 150;

export function RelatorioAbasCampo({
  abaAtiva,
  onChange,
  abas = ABAS_CAMPO,
  compactTriggerRef,
}: {
  abaAtiva: AbaCampo;
  onChange: (aba: AbaCampo) => void;
  abas?: { id: AbaCampo; label: string }[];
  /** Quando o topo deste elemento chega perto do menu sticky, as abas colapsam. */
  compactTriggerRef?: RefObject<HTMLElement | null>;
}) {
  const [isScrolled, setIsScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const trigger = compactTriggerRef?.current;
      if (trigger) {
        const cabosPosition = trigger.getBoundingClientRect().top;
        setIsScrolled(cabosPosition <= ABAS_COMPACT_THRESHOLD_PX);
        return;
      }
      setIsScrolled(window.scrollY > 50);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [compactTriggerRef, abaAtiva]);

  return (
    <>
      <nav
        className={`sticky top-16 z-40 bg-background py-2 shadow-sm transition-all duration-300 ${
          isScrolled
            ? "flex flex-nowrap items-center gap-2 overflow-x-auto whitespace-nowrap px-2 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]"
            : "flex flex-wrap justify-center gap-2"
        }`}
        aria-label="Seções do relatório"
      >
        {abas.map((aba) => {
          const ativa = abaAtiva === aba.id;
          return (
            <button
              key={aba.id}
              type="button"
              onClick={() => onChange(aba.id)}
              className={`shrink-0 rounded-full border px-3 py-1.5 text-center text-xs font-semibold transition md:text-sm ${
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

      {isScrolled ? (
        <button
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
          className="fixed bottom-24 right-4 z-50 flex h-10 w-10 items-center justify-center rounded-full bg-gray-800 text-white shadow-lg transition-all hover:bg-gray-700"
          aria-label="Voltar ao topo"
        >
          <ChevronUp className="h-5 w-5" />
        </button>
      ) : null}
    </>
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

export type RedeAccordionSection = "cabos" | "poste" | "caixa" | "outras";

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
  /** Bloco expansível onde o card aparece (RE/RC). */
  section?: RedeAccordionSection;
  quantidade?: number | null;
  quantidadeLabel?: string;
  quantidadePlaceholder?: string;
  onQuantidadeChange?: (value: number | null) => void;
  coordenadas?: { latitude: string; longitude: string };
  coordenadasTitle?: string;
  onCoordenadasChange?: (next: { latitude: string; longitude: string }) => void;
  /** Seletor Aéreo / Subterrâneo no card. */
  showAmbienteToggle?: boolean;
  ambiente?: AmbienteRede | null;
  onAmbienteChange?: (ambiente: AmbienteRede) => void;
};

export function AmbienteToggle({
  value,
  onChange,
  disabled = false,
}: {
  value: AmbienteRede | null | undefined;
  onChange?: (ambiente: AmbienteRede) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className="grid w-full grid-cols-2 gap-2"
      role="radiogroup"
      aria-label="Ambiente de execução"
    >
      <ChoiceButton
        active={value === "aereo"}
        onClick={() => onChange?.("aereo")}
        disabled={disabled || !onChange}
      >
        Aéreo
      </ChoiceButton>
      <ChoiceButton
        active={value === "subterraneo"}
        onClick={() => onChange?.("subterraneo")}
        disabled={disabled || !onChange}
      >
        Subterrâneo
      </ChoiceButton>
    </div>
  );
}

function AccordionBloco({
  title,
  children,
  rootRef,
}: {
  title: string;
  children: ReactNode;
  rootRef?: RefObject<HTMLElement | null>;
}) {
  return (
    <details
      ref={rootRef as RefObject<HTMLDetailsElement | null> | undefined}
      className="group rounded-2xl border border-border bg-card shadow-sm open:shadow-md"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 text-base font-bold [&::-webkit-details-marker]:hidden">
        <span>{title}</span>
        <ChevronDown className="h-5 w-5 shrink-0 text-muted-foreground transition group-open:rotate-180" />
      </summary>
      <div className="space-y-4 border-t border-border px-5 pb-5 pt-4">{children}</div>
    </details>
  );
}

function renderGrupoFotoCard(
  grupo: GrupoFotoCampo,
  {
    readOnly,
    onGrupoPhoto,
  }: {
    readOnly: boolean;
    onGrupoPhoto: (
      grupoKey: RelatorioFotoGrupoKey,
      slotId: string,
      file: EvidencePhotoRef | null,
      ambiente?: AmbienteRede | null,
    ) => void;
  },
) {
  return (
    <RelatorioFotosBloco
      key={`${grupo.grupoKey}-${grupo.ambiente ?? "na"}`}
      title={grupo.title}
      hint={grupo.hint}
      headerExtra={
        grupo.showAmbienteToggle || grupo.quantidadeLabel || grupo.coordenadas ? (
          <div className="space-y-3">
            {grupo.showAmbienteToggle ? (
              <AmbienteToggle
                value={grupo.ambiente}
                onChange={grupo.onAmbienteChange}
                disabled={readOnly}
              />
            ) : null}
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
      onPickPhoto={(id, file) => onGrupoPhoto(grupo.grupoKey, id, file, grupo.ambiente)}
    />
  );
}

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

export function CordoalhaSimNaoCard({
  title,
  quantidadeLabel,
  quantidadePlaceholder,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  quantidadeLabel: string;
  quantidadePlaceholder: string;
  value: { isSim: boolean | null; quantidade: number | null };
  onChange?: (next: { isSim: boolean | null; quantidade: number | null }) => void;
  disabled?: boolean;
}) {
  const sim = value.isSim === true;
  return (
    <div className="space-y-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{title}</h2>
      <div className="grid grid-cols-2 gap-2">
        <ChoiceButton
          active={value.isSim === true}
          onClick={() => onChange?.({ ...value, isSim: true })}
          disabled={disabled || !onChange}
        >
          SIM
        </ChoiceButton>
        <ChoiceButton
          active={value.isSim === false}
          onClick={() => onChange?.({ isSim: false, quantidade: null })}
          disabled={disabled || !onChange}
        >
          NÃO
        </ChoiceButton>
      </div>
      {sim ? (
        <CampoQuantidade
          label={quantidadeLabel}
          placeholder={quantidadePlaceholder}
          value={value.quantidade}
          onChange={(quantidade) => onChange?.({ ...value, isSim: true, quantidade })}
          disabled={disabled || !onChange}
        />
      ) : null}
    </div>
  );
}

export function RelatorioRedeAcesso({
  readOnly,
  header,
  lancamentoTitle = "Lançamento cabos (RE)?",
  lancamentoRe,
  onLancamentoRe,
  lancamentoAmbiente,
  onLancamentoAmbienteChange,
  fiberloopInstalado,
  onFiberloopInstaladoChange,
  cordoalhaLancada,
  onCordoalhaLancadaChange,
  cordoalhaExistente,
  onCordoalhaExistenteChange,
  postesNovaCordoalha,
  onPostesNovaCordoalhaChange,
  postesCordoalhaExistente,
  onPostesCordoalhaExistenteChange,
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
  cabosRef,
}: {
  readOnly: boolean;
  header?: ReactNode;
  lancamentoTitle?: string;
  lancamentoRe: "sim" | "nao" | "";
  onLancamentoRe: (value: "sim" | "nao") => void;
  lancamentoAmbiente?: AmbienteRede | null;
  onLancamentoAmbienteChange?: (ambiente: AmbienteRede) => void;
  fiberloopInstalado?: { isSim: boolean | null; quantidade: number | null };
  onFiberloopInstaladoChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  cordoalhaLancada?: { isSim: boolean | null; quantidade: number | null };
  onCordoalhaLancadaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  cordoalhaExistente?: { isSim: boolean | null; quantidade: number | null };
  onCordoalhaExistenteChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  postesNovaCordoalha?: { isSim: boolean | null; quantidade: number | null };
  onPostesNovaCordoalhaChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
  postesCordoalhaExistente?: { isSim: boolean | null; quantidade: number | null };
  onPostesCordoalhaExistenteChange?: (next: {
    isSim: boolean | null;
    quantidade: number | null;
  }) => void;
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
    ambiente?: AmbienteRede | null,
  ) => void;
  outras: OutraFotoState[];
  onOutrasChange: (updater: (prev: OutraFotoState[]) => OutraFotoState[]) => void;
  onOutraPhoto: (itemId: string, file: EvidencePhotoRef | null) => void;
  showObsAdmin?: boolean;
  /** Âncora para o menu de abas colapsar ao alcançar o bloco CABOS. */
  cabosRef?: RefObject<HTMLElement | null>;
}) {
  void showObsAdmin;
  const mostrarMetragem = lancamentoRe === "sim";
  const mostrarCordoalha = Boolean(cordoalhaLancada && cordoalhaExistente);
  const mostrarPostes = Boolean(postesNovaCordoalha && postesCordoalhaExistente);
  const gruposCabos = grupos.filter((g) => g.section === "cabos");
  const gruposPoste = grupos.filter((g) => g.section === "poste");
  const gruposCaixa = grupos.filter((g) => g.section === "caixa");
  const fotoCtx = { readOnly, onGrupoPhoto };

  return (
    <EvidencePhotoPasteProvider>
      <div className="space-y-5">
        {header}

        <AccordionBloco title="CABOS" rootRef={cabosRef}>
          <div className="space-y-3 rounded-2xl border border-border bg-background p-5 shadow-sm">
            <h2 className="text-base font-bold">{lancamentoTitle}</h2>
            <div className="flex w-full flex-col gap-3">
              <div className="grid grid-cols-2 gap-2">
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
              {onLancamentoAmbienteChange ? (
                <AmbienteToggle
                  value={lancamentoAmbiente}
                  onChange={onLancamentoAmbienteChange}
                  disabled={readOnly}
                />
              ) : null}
            </div>

            {mostrarMetragem ? (
              <div className="space-y-4 border-t border-border pt-4">
                <h2 className="text-base font-bold">Metragem de cabo</h2>
                {cabos.map((cabo, index) => (
                  <div
                    key={cabo.id}
                    className="relative flex flex-col space-y-3 rounded-xl border border-border p-4"
                  >
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
                        type="number"
                        inputMode="numeric"
                        value={cabo.tipoCabo}
                        onChange={(e) =>
                          onPatchCabo(cabo.id, { tipoCabo: apenasDigitos(e.target.value) })
                        }
                        placeholder="Ex: 12"
                        disabled={readOnly}
                        className={inputClass()}
                      />
                    </div>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Marcação Inicial (m)
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={cabo.marcacaoInicial}
                          onChange={(e) => {
                            const marcacaoInicial = e.target.value;
                            onPatchCabo(cabo.id, {
                              marcacaoInicial,
                              metragem: calcularMetragemCaboTotal(
                                marcacaoInicial,
                                cabo.marcacaoFinal,
                              ),
                            });
                          }}
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
                      <div>
                        <label className="mb-1.5 block text-sm font-semibold">
                          Marcação Final (m)
                        </label>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          value={cabo.marcacaoFinal}
                          onChange={(e) => {
                            const marcacaoFinal = e.target.value;
                            onPatchCabo(cabo.id, {
                              marcacaoFinal,
                              metragem: calcularMetragemCaboTotal(
                                cabo.marcacaoInicial,
                                marcacaoFinal,
                              ),
                            });
                          }}
                          disabled={readOnly}
                          className={inputClass()}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-semibold">
                        Metragem Total (m)
                      </label>
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
          </div>

          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            {gruposCabos.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))}
          </div>

          {fiberloopInstalado &&
          onFiberloopInstaladoChange &&
          lancamentoAmbiente !== "subterraneo" ? (
            <CordoalhaSimNaoCard
              title="Fiberloop instalado?"
              quantidadeLabel="Quantidade de Fiberloop instalado"
              quantidadePlaceholder="Ex: 2"
              value={fiberloopInstalado}
              onChange={onFiberloopInstaladoChange}
              disabled={readOnly}
            />
          ) : null}
        </AccordionBloco>

        <AccordionBloco title="POSTE">
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            {gruposPoste.map((grupo) => {
              const isPoste =
                grupo.grupoKey === "posteConexao" || grupo.grupoKey === "rcPosteConexao";
              return (
                <div key={grupo.grupoKey} className="contents">
                  {renderGrupoFotoCard(grupo, fotoCtx)}
                  {isPoste && mostrarCordoalha ? (
                    <>
                      <CordoalhaSimNaoCard
                        title="Lançado cordoalha?"
                        quantidadeLabel="Quantidade de cordoalha lançada:"
                        quantidadePlaceholder="Ex: 50"
                        value={cordoalhaLancada!}
                        onChange={onCordoalhaLancadaChange}
                        disabled={readOnly}
                      />
                      <CordoalhaSimNaoCard
                        title="Cordoalha existente?"
                        quantidadeLabel="Quantidade de cordoalha existente:"
                        quantidadePlaceholder="Ex: 120"
                        value={cordoalhaExistente!}
                        onChange={onCordoalhaExistenteChange}
                        disabled={readOnly}
                      />
                    </>
                  ) : null}
                  {isPoste && mostrarPostes ? (
                    <>
                      <CordoalhaSimNaoCard
                        title="Postes novo com nova cordoalha?"
                        quantidadeLabel="Quantidade de Poste com nova cordoalha:"
                        quantidadePlaceholder="Ex: 10"
                        value={postesNovaCordoalha!}
                        onChange={onPostesNovaCordoalhaChange}
                        disabled={readOnly}
                      />
                      <CordoalhaSimNaoCard
                        title="Postes com cordoalha Existente?"
                        quantidadeLabel="Quantidade de Postes com cordoalha Existente:"
                        quantidadePlaceholder="Ex: 10"
                        value={postesCordoalhaExistente!}
                        onChange={onPostesCordoalhaExistenteChange}
                        disabled={readOnly}
                      />
                    </>
                  ) : null}
                </div>
              );
            })}
          </div>
        </AccordionBloco>

        <AccordionBloco title="CAIXA DE EMENDA">
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
            {gruposCaixa.map((grupo) => renderGrupoFotoCard(grupo, fotoCtx))}
          </div>
        </AccordionBloco>

        <AccordionBloco title="OUTRAS FOTOS">
          <RelatorioOutrasFotos
            title="Outras fotos"
            outras={outras}
            onOutrasChange={onOutrasChange}
            onOutraPhoto={onOutraPhoto}
            readOnly={readOnly}
          />
        </AccordionBloco>
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
