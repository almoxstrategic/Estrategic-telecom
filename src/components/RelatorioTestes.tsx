import { useRef } from "react";
import { Plus, Trash2 } from "lucide-react";
import {
  FOTO_SLOT_CLASS,
  FotoLabel,
  RelatorioFotoComControles,
} from "@/components/RelatorioFotoComControles";
import { PhotoUpload } from "@/components/PhotoUpload";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import { prepareEvidencePhotoFile } from "@/lib/evidence-photo-file";
import type { EvidencePhotoRef } from "@/lib/types";
import {
  deleteRelatorioPhoto,
  emptyTesteOpticoItem,
  emptyTesteOtdrItem,
  type StoredPhoto,
  type TesteOpticoFaixaPayload,
  type TesteOpticoItemPayload,
  type TesteOpticoPayload,
  type TesteOtdrItemPayload,
  type TestePotenciaPayload,
  type TipoExecucao,
} from "@/lib/relatorios-transmissao";

type ChangeOpts = { immediate?: boolean };

function AdicionarFotoExtra({ onPick }: { onPick: (file: EvidencePhotoRef) => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <BotaoAdicionar label="Adicionar foto" onClick={() => fileRef.current?.click()} />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/jpg,image/png,image/heic,image/heif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          void prepareEvidencePhotoFile(file).then(onPick);
        }}
      />
    </>
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
    return <div className={FOTO_SLOT_CLASS}>Sem foto</div>;
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

function TesteClienteColuna({
  titulo,
  faixa,
  readOnly,
  onPatch,
  onUploadPhoto,
}: {
  titulo: string;
  faixa: TesteOpticoFaixaPayload;
  readOnly: boolean;
  onPatch: (next: TesteOpticoFaixaPayload, opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const adicionarFoto = async (file: EvidencePhotoRef) => {
    if (!onUploadPhoto) return;
    const stored = await onUploadPhoto(file);
    onPatch({ ...faixa, fotos: [...faixa.fotos, stored] }, { immediate: true });
  };

  return (
    <div className="flex h-full flex-col space-y-3 rounded-xl border border-border p-4">
      <h3 className="text-sm font-bold">{titulo}</h3>
      <div>
        <label className="mb-1.5 block text-sm font-semibold">Digite o dBm</label>
        <input
          inputMode="decimal"
          value={faixa.dbm}
          onChange={(e) => onPatch({ ...faixa, dbm: e.target.value })}
          placeholder="dBm"
          disabled={readOnly}
          className={inputClass()}
        />
      </div>
      <div className="flex-1 space-y-2">
        <FotoLabel>Foto</FotoLabel>
        {faixa.fotos.length === 0 ? (
          <FotoUnica foto={null} alt={titulo} readOnly={readOnly} onPick={(file) => {
            if (file) void adicionarFoto(file);
          }} />
        ) : (
          faixa.fotos.map((foto, index) => (
            <RelatorioFotoComControles
              key={`${foto.path}-${index}`}
              src={foto.url}
              alt={`${titulo} ${index + 1}`}
              canEdit={!readOnly}
              onDelete={() => {
                void deleteRelatorioPhoto(foto.path);
                onPatch(
                  { ...faixa, fotos: faixa.fotos.filter((_, i) => i !== index) },
                  { immediate: true },
                );
              }}
              onReplace={(file) => {
                void deleteRelatorioPhoto(foto.path);
                void (async () => {
                  if (!onUploadPhoto) return;
                  const stored = await onUploadPhoto(file);
                  onPatch(
                    {
                      ...faixa,
                      fotos: faixa.fotos.map((item, i) => (i === index ? stored : item)),
                    },
                    { immediate: true },
                  );
                })();
              }}
            />
          ))
        )}
      </div>
      <div className="mt-auto w-full space-y-3">
        <div>
          <label className="mb-1.5 block text-sm font-semibold">OBS</label>
          <textarea
            value={faixa.obs}
            onChange={(e) => onPatch({ ...faixa, obs: e.target.value })}
            rows={3}
            disabled={readOnly}
            className={inputClass()}
          />
        </div>
        {readOnly ? null : (
          <AdicionarFotoExtra onPick={(file) => void adicionarFoto(file)} />
        )}
      </div>
    </div>
  );
}

function TesteEstacaoColuna({
  titulo,
  itens,
  readOnly,
  onChange,
  onUploadPhoto,
}: {
  titulo: string;
  itens: TesteOpticoItemPayload[];
  readOnly: boolean;
  onChange: (next: TesteOpticoItemPayload[], opts?: ChangeOpts) => void;
  onUploadPhoto?: (file: EvidencePhotoRef) => Promise<StoredPhoto>;
}) {
  const patchItem = (id: string, patch: Partial<TesteOpticoItemPayload>, opts?: ChangeOpts) => {
    onChange(
      itens.map((item) => (item.id === id ? { ...item, ...patch } : item)),
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
    <div className="flex h-full flex-col gap-3">
      <h3 className="text-sm font-bold">{titulo}</h3>
      {itens.map((item, index) => (
        <div
          key={item.id}
          className="relative flex h-full flex-col space-y-3 rounded-xl border border-border p-4"
        >
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm font-semibold">Teste {index + 1}</p>
            {!readOnly && index >= 1 ? (
              <button
                type="button"
                onClick={() => {
                  void deleteRelatorioPhoto(item.foto?.path);
                  onChange(
                    itens.filter((row) => row.id !== item.id),
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
          <div>
            <label className="mb-1.5 block text-sm font-semibold">Digite o dBm</label>
            <input
              inputMode="decimal"
              value={item.dbm}
              onChange={(e) => patchItem(item.id, { dbm: e.target.value })}
              placeholder="dBm"
              disabled={readOnly}
              className={inputClass()}
            />
          </div>
          <div className="flex-1">
            <FotoLabel>Foto</FotoLabel>
            <FotoUnica
              foto={item.foto}
              alt={`${titulo} teste ${index + 1}`}
              readOnly={readOnly}
              onPick={(file) => void pickFoto(item.id, file)}
            />
          </div>
          <div className="mt-auto w-full">
            <label className="mb-1.5 block text-sm font-semibold">OBS</label>
            <textarea
              value={item.obs}
              onChange={(e) => patchItem(item.id, { obs: e.target.value })}
              rows={3}
              disabled={readOnly}
              className={inputClass()}
            />
          </div>
        </div>
      ))}
      {readOnly ? null : (
        <BotaoAdicionar
          label="Adicionar mais teste"
          onClick={() => onChange([...itens, emptyTesteOpticoItem()], { immediate: true })}
        />
      )}
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
  return (
    <div className="max-w-xs">
      <label className="mb-1.5 block text-sm font-semibold">Nº Fibra:</label>
      <input
        type="number"
        min={1}
        step={1}
        inputMode="numeric"
        placeholder="Ex: 1"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const raw = e.target.value;
          if (raw === "") {
            onChange(null);
            return;
          }
          const n = Number(raw);
          if (!Number.isFinite(n) || n < 1) return;
          onChange(Math.trunc(n));
        }}
        className={inputClass()}
      />
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
  return (
    <div className="space-y-5">
      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">Teste Óptico (No Cliente)</h2>
        <CampoNumeroFibra
          value={value.cliente.numeroFibra}
          disabled={readOnly}
          onChange={(numeroFibra) =>
            onChange({ ...value, cliente: { ...value.cliente, numeroFibra } })
          }
        />
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          <TesteClienteColuna
            titulo="1550nm"
            faixa={value.cliente.nm1550}
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(faixa, opts) =>
              onChange(
                { ...value, cliente: { ...value.cliente, nm1550: faixa } },
                opts,
              )
            }
          />
          <TesteClienteColuna
            titulo="1330nm"
            faixa={value.cliente.nm1330}
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onPatch={(faixa, opts) =>
              onChange(
                { ...value, cliente: { ...value.cliente, nm1330: faixa } },
                opts,
              )
            }
          />
        </div>
      </div>

      <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="text-base font-bold">Teste Óptico (Na Estação)</h2>
        <CampoNumeroFibra
          value={value.estacao.numeroFibra}
          disabled={readOnly}
          onChange={(numeroFibra) =>
            onChange({ ...value, estacao: { ...value.estacao, numeroFibra } })
          }
        />
        <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
          <TesteEstacaoColuna
            titulo="1550nm"
            itens={value.estacao.nm1550}
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onChange={(itens, opts) =>
              onChange(
                { ...value, estacao: { ...value.estacao, nm1550: itens } },
                opts,
              )
            }
          />
          <TesteEstacaoColuna
            titulo="1330nm"
            itens={value.estacao.nm1330}
            readOnly={readOnly}
            onUploadPhoto={onUploadPhoto}
            onChange={(itens, opts) =>
              onChange(
                { ...value, estacao: { ...value.estacao, nm1330: itens } },
                opts,
              )
            }
          />
        </div>
      </div>
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
    <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">Teste OTDR</h2>
      <div>
        <label className="mb-1.5 block text-sm font-semibold" htmlFor="comprimento-trecho-otdr">
          Comprimento do trecho óptico testado (km):
        </label>
        <input
          id="comprimento-trecho-otdr"
          type="number"
          min={0}
          step={0.001}
          inputMode="decimal"
          placeholder="Ex: 1.932"
          value={value.comprimentoTrechoKm ?? ""}
          disabled={readOnly}
          onChange={(e) => onChange({ ...value, comprimentoTrechoKm: e.target.value })}
          className={inputClass()}
        />
      </div>
      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-2">
        {value.otdr.map((item, index) => (
          <div
            key={item.id}
            className="relative flex h-full flex-col space-y-3 rounded-xl border border-border p-4"
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
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Digite a Distância</label>
              <input
                inputMode="decimal"
                value={item.distancia}
                onChange={(e) => patchItem(item.id, { distancia: e.target.value })}
                placeholder="Distância"
                disabled={readOnly}
                className={inputClass()}
              />
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
                rows={3}
                disabled={readOnly}
                className={inputClass()}
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
