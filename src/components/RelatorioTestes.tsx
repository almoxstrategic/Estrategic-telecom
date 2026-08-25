import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  FotoLabel,
  RelatorioFotoComControles,
} from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { inputClass, textareaObsClass } from "@/components/RelatorioRedeAcesso";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  deleteRelatorioPhoto,
  emptyTesteOtdrItem,
  emptyTesteOpticoItem,
  finalizeMedicaoInput,
  testeOpticoEstacaoAtivo,
  type StoredPhoto,
  type TesteOpticoFaixaPayload,
  type TesteOpticoItemPayload,
  type TesteOpticoPayload,
  type TesteOtdrItemPayload,
  type TestePotenciaPayload,
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";

type ChangeOpts = { immediate?: boolean };

/**
 * Campo de medição (dBm, km, etc.).
 * type="text" + inputMode="decimal" — evita teclado/type=number que bloqueia "-" no mobile.
 * Digitação livre (string); sanitização/normalização só no blur.
 */
function CampoMedicaoDecimal({
  id,
  label,
  value,
  onChange,
  disabled,
  placeholder,
}: {
  id?: string;
  label: string;
  value: string;
  onChange: (next: string, opts?: ChangeOpts) => void;
  disabled: boolean;
  placeholder?: string;
}) {
  return (
    <div>
      <label
        htmlFor={id}
        className="mb-1.5 block text-sm font-semibold print:mb-0.5 print:text-xs"
      >
        {label}
      </label>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        enterKeyHint="done"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={value}
        placeholder={placeholder}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          const next = finalizeMedicaoInput(value);
          if (next !== value) onChange(next, { immediate: true });
        }}
        className={inputClass()}
      />
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

function FotoUnica({
  foto,
  alt,
  readOnly,
  onPick,
}: {
  foto: StoredPhoto | null;
  alt: string;
  readOnly: boolean;
  onPick: (file: EvidencePhotoRef | null) => void;
}) {
  if (foto) {
    return (
      <RelatorioFotoComControles
        src={foto.url}
        alt={alt}
        compact
        canEdit={!readOnly}
        onDelete={() => {
          void deleteRelatorioPhoto(foto.path);
          onPick(null);
        }}
        onReplace={(file) => {
          void deleteRelatorioPhoto(foto.path);
          onPick(file);
        }}
      />
    );
  }
  if (readOnly) {
    return (
      <div className="flex h-48 max-h-[280px] w-full items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground print:h-64 print:max-h-[300px]">
        Sem foto
      </div>
    );
  }
  return (
    <PhotoUpload
      label="Foto"
      suffix="inicio"
      hideLabel
      compact
      value={null}
      onChange={(file) => {
        if (file) onPick(file);
      }}
    />
  );
}

function CardMedicaoCliente({
  titulo,
  faixa,
  alt,
  readOnly,
  onPatch,
  onUploadPhoto,
}: {
  titulo: string;
  faixa: TesteOpticoFaixaPayload;
  alt: string;
  readOnly: boolean;
  onPatch: (next: TesteOpticoFaixaPayload, opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const foto = faixa.fotos[0] ?? null;

  const pickFoto = async (file: EvidencePhotoRef | null) => {
    if (!file) {
      onPatch({ ...faixa, fotos: [] }, { immediate: true });
      return;
    }
    if (!onUploadPhoto) return;
    const stored = await onUploadPhoto(file);
    onPatch({ ...faixa, fotos: [stored] }, { immediate: true });
  };

  return (
    <div className="flex h-full break-inside-avoid flex-col space-y-3 rounded-xl border border-border p-4 print:break-inside-avoid print:space-y-1 print:p-2">
      <h3 className="text-sm font-bold print:mb-0 print:text-xs">{titulo}</h3>
      <CampoMedicaoDecimal
        label="Digite o dBm"
        value={faixa.dbm}
        placeholder="Ex: -18,5"
        disabled={readOnly}
        onChange={(dbm, opts) => onPatch({ ...faixa, dbm }, opts)}
      />
      <div className="flex-1">
        <FotoLabel>Foto</FotoLabel>
        <FotoUnica foto={foto} alt={alt} readOnly={readOnly} onPick={(file) => void pickFoto(file)} />
      </div>
      <div className="mt-auto w-full print:mt-1">
        <label className="mb-1.5 block text-sm font-semibold print:mb-0.5 print:text-xs">OBS</label>
        <textarea
          value={faixa.obs}
          onChange={(e) => onPatch({ ...faixa, obs: e.target.value })}
          rows={2}
          disabled={readOnly}
          className={textareaObsClass()}
        />
      </div>
    </div>
  );
}

function CardMedicaoEstacao({
  titulo,
  item,
  alt,
  readOnly,
  onPatch,
  onUploadPhoto,
}: {
  titulo: string;
  item: TesteOpticoItemPayload;
  alt: string;
  readOnly: boolean;
  onPatch: (next: TesteOpticoItemPayload, opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const pickFoto = async (file: EvidencePhotoRef | null) => {
    if (!file) {
      onPatch({ ...item, foto: null }, { immediate: true });
      return;
    }
    if (!onUploadPhoto) return;
    const stored = await onUploadPhoto(file);
    onPatch({ ...item, foto: stored }, { immediate: true });
  };

  return (
    <div className="flex h-full break-inside-avoid flex-col space-y-3 rounded-xl border border-border p-4 print:break-inside-avoid print:space-y-1 print:p-2">
      <h3 className="text-sm font-bold print:mb-0 print:text-xs">{titulo}</h3>
      <CampoMedicaoDecimal
        label="Digite o dBm"
        value={item.dbm}
        placeholder="Ex: -18,5"
        disabled={readOnly}
        onChange={(dbm, opts) => onPatch({ ...item, dbm }, opts)}
      />
      <div className="flex-1">
        <FotoLabel>Foto</FotoLabel>
        <FotoUnica foto={item.foto} alt={alt} readOnly={readOnly} onPick={(file) => void pickFoto(file)} />
      </div>
      <div className="mt-auto w-full print:mt-1">
        <label className="mb-1.5 block text-sm font-semibold print:mb-0.5 print:text-xs">OBS</label>
        <textarea
          value={item.obs}
          onChange={(e) => onPatch({ ...item, obs: e.target.value })}
          rows={2}
          disabled={readOnly}
          className={textareaObsClass()}
        />
      </div>
    </div>
  );
}

function CampoNumeroFibra({
  value,
  onChange,
  disabled,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  disabled: boolean;
}) {
  const [draft, setDraft] = useState(value == null ? "" : String(value));

  useEffect(() => {
    setDraft(value == null ? "" : String(value));
  }, [value]);

  return (
    <div className="mx-auto w-full max-w-xs">
      <label className="mb-1.5 block text-center text-sm font-semibold">Nº Fibra:</label>
      <input
        type="text"
        inputMode="numeric"
        enterKeyHint="done"
        autoComplete="off"
        placeholder="Ex: 1"
        value={draft}
        disabled={disabled}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          const digits = draft.replace(/\D/g, "");
          if (!digits) {
            onChange(null);
            setDraft("");
            return;
          }
          const n = Math.trunc(Number(digits));
          if (!Number.isFinite(n) || n < 1) {
            onChange(null);
            setDraft("");
            return;
          }
          onChange(n);
          setDraft(String(n));
        }}
        className={inputClass()}
      />
    </div>
  );
}

function BlocoTesteOpticoCliente({
  value,
  readOnly,
  onChange,
  onUploadPhoto,
}: {
  value: TesteOpticoPayload["cliente"];
  readOnly: boolean;
  onChange: (next: TesteOpticoPayload["cliente"], opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const nm1550 = value.nm1550[0];
  const nm1330 = value.nm1330[0];
  if (!nm1550 || !nm1330) return null;

  return (
    <div className="space-y-4 break-inside-avoid rounded-2xl border border-border bg-card p-5 shadow-sm print:break-inside-avoid print:space-y-1 print:border-0 print:p-2 print:shadow-none">
      <h2 className="text-base font-bold print:mb-1 print:text-sm">Teste Óptico (No Cliente)</h2>
      <CampoNumeroFibra
        value={value.numeroFibra}
        disabled={readOnly}
        onChange={(numeroFibra) => onChange({ ...value, numeroFibra })}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 print:gap-2">
        <div className="min-w-0 w-full break-inside-avoid">
          <CardMedicaoCliente
            titulo="1550nm"
            faixa={nm1550}
            alt="Cliente 1550nm"
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(faixa, opts) => onChange({ ...value, nm1550: [faixa] }, opts)}
          />
        </div>
        <div className="min-w-0 w-full break-inside-avoid">
          <CardMedicaoCliente
            titulo="1330nm"
            faixa={nm1330}
            alt="Cliente 1330nm"
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(faixa, opts) => onChange({ ...value, nm1330: [faixa] }, opts)}
          />
        </div>
      </div>
    </div>
  );
}

function BlocoTesteOpticoEstacao({
  value,
  readOnly,
  onChange,
  onUploadPhoto,
  onRemover,
}: {
  value: TesteOpticoPayload["estacao"];
  readOnly: boolean;
  onChange: (next: TesteOpticoPayload["estacao"], opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
  onRemover?: () => void;
}) {
  const nm1550 = value.nm1550[0];
  const nm1330 = value.nm1330[0];
  if (!nm1550 || !nm1330) return null;

  return (
    <div className="relative space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-base font-bold">Teste Óptico (Na Estação)</h2>
        {readOnly || !onRemover ? null : (
          <button
            type="button"
            onClick={onRemover}
            className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
            aria-label="Remover teste óptico na estação"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
      <CampoNumeroFibra
        value={value.numeroFibra}
        disabled={readOnly}
        onChange={(numeroFibra) => onChange({ ...value, numeroFibra })}
      />
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="min-w-0">
          <CardMedicaoEstacao
            titulo="1550nm"
            item={nm1550}
            alt="Estação 1550nm"
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(item, opts) => onChange({ ...value, nm1550: [item] }, opts)}
          />
        </div>
        <div className="min-w-0">
          <CardMedicaoEstacao
            titulo="1330nm"
            item={nm1330}
            alt="Estação 1330nm"
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(item, opts) => onChange({ ...value, nm1330: [item] }, opts)}
          />
        </div>
      </div>
    </div>
  );
}

export function RelatorioTesteOptico({
  value,
  onChange,
  onUploadPhoto,
  readOnly,
}: {
  value: TesteOpticoPayload;
  onChange: (next: TesteOpticoPayload, opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
  readOnly: boolean;
}) {
  const [mostrarEstacao, setMostrarEstacao] = useState(() => testeOpticoEstacaoAtivo(value.estacao));

  useEffect(() => {
    if (testeOpticoEstacaoAtivo(value.estacao)) setMostrarEstacao(true);
  }, [value.estacao]);

  const removerEstacao = () => {
    void deleteRelatorioPhoto(value.estacao.nm1550[0]?.foto?.path);
    void deleteRelatorioPhoto(value.estacao.nm1330[0]?.foto?.path);
    setMostrarEstacao(false);
    onChange(
      {
        ...value,
        estacao: {
          numeroFibra: null,
          nm1550: [emptyTesteOpticoItem()],
          nm1330: [emptyTesteOpticoItem()],
        },
      },
      { immediate: true },
    );
  };

  return (
    <div className="space-y-5 break-inside-avoid print:break-inside-avoid print:space-y-2">
      <BlocoTesteOpticoCliente
        value={value.cliente}
        readOnly={readOnly}
        onUploadPhoto={onUploadPhoto}
        onChange={(cliente, opts) => onChange({ ...value, cliente }, opts)}
      />
      {mostrarEstacao ? (
        <div className="print:hidden">
          <BlocoTesteOpticoEstacao
            value={value.estacao}
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onChange={(estacao, opts) => onChange({ ...value, estacao }, opts)}
            onRemover={readOnly ? undefined : removerEstacao}
          />
        </div>
      ) : readOnly ? null : (
        <BotaoAdicionar
          label="Adicionar Teste Óptico (Na Estação)"
          onClick={() => setMostrarEstacao(true)}
        />
      )}
    </div>
  );
}

export function RelatorioTestePotencia({
  tipoExecucao,
  valueEmpresarial,
  valueImplantacao,
  onChangeEmpresarial,
  onChangeImplantacao,
  onUploadPhoto,
  readOnly,
}: {
  tipoExecucao: TipoExecucao;
  valueEmpresarial: TestePotenciaPayload;
  valueImplantacao: TestePotenciaPayload;
  onChangeEmpresarial: (next: TestePotenciaPayload, opts?: ChangeOpts) => void;
  onChangeImplantacao: (next: TestePotenciaPayload, opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
  readOnly: boolean;
}) {
  const isImplantacao = tipoExecucao === "implantacao";
  const value = isImplantacao ? valueImplantacao : valueEmpresarial;
  const onChange = isImplantacao ? onChangeImplantacao : onChangeEmpresarial;

  const patchItem = (id: string, patch: Partial<TesteOtdrItemPayload>, opts?: ChangeOpts) => {
    onChange(
      { ...value, otdr: value.otdr.map((item) => (item.id === id ? { ...item, ...patch } : item)) },
      opts,
    );
  };

  const pickFoto = async (id: string, file: EvidencePhotoRef | null) => {
    if (!file) {
      patchItem(id, { foto: null }, { immediate: true });
      return;
    }
    if (!onUploadPhoto) return;
    const stored = await onUploadPhoto(file);
    patchItem(id, { foto: stored }, { immediate: true });
  };

  return (
    <div className="space-y-4 break-inside-avoid rounded-2xl border border-border bg-card p-5 shadow-sm print:break-before-avoid print:break-inside-avoid print:space-y-1 print:border-0 print:p-2 print:shadow-none">
      <h2 className="text-base font-bold print:mb-1 print:text-sm">Teste OTDR</h2>
      <div className="print:mb-1">
        <CampoMedicaoDecimal
          id="comprimento-trecho-otdr"
          label="Comprimento do trecho óptico testado (km):"
          value={value.comprimentoTrechoKm ?? ""}
          placeholder="Ex: 2,9"
          disabled={readOnly}
          onChange={(comprimentoTrechoKm, opts) =>
            onChange({ ...value, comprimentoTrechoKm }, opts)
          }
        />
      </div>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2 print:gap-2">
        {value.otdr.map((item, index) => (
          <div
            key={item.id}
            className="relative flex h-full min-w-0 w-full break-inside-avoid flex-col space-y-3 rounded-xl border border-border p-4 print:space-y-1 print:p-2"
          >
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm font-semibold">Teste {index + 1}</p>
              {!readOnly && index >= 1 ? (
                <button
                  type="button"
                  onClick={() => {
                    void deleteRelatorioPhoto(item.foto?.path);
                    onChange(
                      { ...value, otdr: value.otdr.filter((row) => row.id !== item.id) },
                      { immediate: true },
                    );
                  }}
                  className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10"
                  aria-label={`Excluir teste ${index + 1}`}
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              ) : null}
            </div>
            <div className="flex-1">
              <FotoLabel>Foto</FotoLabel>
              <FotoUnica
                foto={item.foto}
                alt={`OTDR teste ${index + 1}`}
                readOnly={readOnly}
                onPick={(file) => void pickFoto(item.id, file)}
              />
            </div>
            <div className="mt-auto w-full">
              <label className="mb-1.5 block text-sm font-semibold">OBS</label>
              <textarea
                value={item.obs}
                onChange={(e) => patchItem(item.id, { obs: e.target.value })}
                rows={2}
                disabled={readOnly}
                className={textareaObsClass()}
              />
            </div>
          </div>
        ))}
      </div>
      {readOnly ? null : (
        <BotaoAdicionar
          label="Adicionar mais teste"
          onClick={() =>
            onChange({ ...value, otdr: [...value.otdr, emptyTesteOtdrItem()] }, { immediate: true })
          }
        />
      )}
    </div>
  );
}
