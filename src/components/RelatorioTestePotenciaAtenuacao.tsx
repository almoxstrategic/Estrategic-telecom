import { useMemo } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import {
  calcularAtenuacaoFibra,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  formatarDb,
  parseNumeroCampo,
  textoOuTraco,
  type TesteOpticoFaixaPayload,
  type TesteOpticoPayload,
  type TestePotenciaJanelaPayload,
  type TestePotenciaPayload,
} from "@/lib/relatorios-transmissao";

type ChangeOpts = { immediate?: boolean };

export function RelatorioTestePotenciaAtenuacao({
  testeOptico,
  otdr,
  value1550,
  value1330,
  onChange1550,
  onChange1330,
  readOnly,
}: {
  testeOptico: TesteOpticoPayload;
  otdr: TestePotenciaPayload;
  value1550: TestePotenciaJanelaPayload;
  value1330: TestePotenciaJanelaPayload;
  onChange1550: (next: TestePotenciaJanelaPayload, opts?: ChangeOpts) => void;
  onChange1330: (next: TestePotenciaJanelaPayload, opts?: ChangeOpts) => void;
  readOnly: boolean;
}) {
  const km = otdr.otdr[0]?.distancia ?? "";
  const pi1550 = testeOptico.estacao.nm1550[0]?.dbm ?? "";
  const pi1330 = testeOptico.estacao.nm1330[0]?.dbm ?? "";

  return (
    <div className="space-y-4">
      <JanelaCard
        titulo="TESTE DE POTÊNCIA - 1550nm"
        km={km}
        pi={pi1550}
        faixaCliente={testeOptico.cliente.nm1550}
        value={value1550}
        onChange={onChange1550}
        readOnly={readOnly}
      />
      <JanelaCard
        titulo="TESTE DE POTÊNCIA - 1330nm"
        km={km}
        pi={pi1330}
        faixaCliente={testeOptico.cliente.nm1330}
        value={value1330}
        onChange={onChange1330}
        readOnly={readOnly}
      />
    </div>
  );
}

function fibrasDeCliente(faixa: TesteOpticoFaixaPayload) {
  return [{ numero: "01", potenciaMedida: faixa.dbm ?? "" }];
}

function JanelaCard({
  titulo,
  km,
  pi,
  faixaCliente,
  value,
  onChange,
  readOnly,
}: {
  titulo: string;
  km: string;
  pi: string;
  faixaCliente: TesteOpticoFaixaPayload;
  value: TestePotenciaJanelaPayload;
  onChange: (next: TestePotenciaJanelaPayload, opts?: ChangeOpts) => void;
  readOnly: boolean;
}) {
  const atenuacaoMax = useMemo(
    () => calcularAtenuacaoMaxima(km, value.emendas, value.conexoes),
    [km, value.emendas, value.conexoes],
  );
  const minimoAdmissivel = useMemo(
    () => calcularMinimoAdmissivel(pi, atenuacaoMax),
    [pi, atenuacaoMax],
  );
  const fibras = useMemo(() => fibrasDeCliente(faixaCliente), [faixaCliente]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{titulo}</h2>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <CampoImportado label="Comprimento do Trecho (km)" value={km} />
        <CampoNumero
          label="Nº de Emendas"
          value={value.emendas}
          disabled={readOnly}
          onChange={(emendas) => onChange({ ...value, emendas })}
        />
        <CampoNumero
          label="Nº de Conexões"
          value={value.conexoes}
          disabled={readOnly}
          onChange={(conexoes) => onChange({ ...value, conexoes })}
        />
        <CampoImportado label="Referência do Instrumento (Pi) em dBm" value={pi} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Callout tom="cinza" rotulo="Atenuação Máxima">
          {formatarDb(atenuacaoMax)} dB
        </Callout>
        <Callout tom="verde" rotulo="Valor Mínimo Admissível (Po)">
          {minimoAdmissivel == null ? "—" : `${formatarDb(minimoAdmissivel)} dBm`}
        </Callout>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Fibras</h3>
        <p className="text-xs text-muted-foreground">
          Potência medida (Po) importada do Teste Óptico (No Cliente).
        </p>
        <div className="hidden gap-2 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem]">
          <span>Fibra Nº</span>
          <span>Potência Medida - Po (dBm)</span>
          <span>Atenuação (dB)</span>
          <span>Status</span>
        </div>
        <div className="space-y-3">
          {fibras.map((fibra) => (
            <LinhaFibra
              key={fibra.numero}
              numero={fibra.numero}
              potenciaMedida={fibra.potenciaMedida}
              pi={pi}
              minimoAdmissivel={minimoAdmissivel}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function LinhaFibra({
  numero,
  potenciaMedida,
  pi,
  minimoAdmissivel,
}: {
  numero: string;
  potenciaMedida: string;
  pi: string;
  minimoAdmissivel: number | null;
}) {
  const atenuacao = calcularAtenuacaoFibra(potenciaMedida, pi);
  const po = parseNumeroCampo(potenciaMedida);
  const status =
    po == null || minimoAdmissivel == null ? null : po >= minimoAdmissivel ? "aprovado" : "reprovado";

  return (
    <div className="grid grid-cols-2 items-end gap-3 rounded-xl border border-border p-3 md:grid-cols-[4.5rem_minmax(0,1fr)_minmax(0,1fr)_8rem] md:items-center">
      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Fibra Nº</p>
        <p className="rounded-lg border border-input bg-muted px-4 py-3 text-base">{numero}</p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Potência Medida - Po (dBm)</p>
        <CampoImportadoCompacto value={potenciaMedida} />
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Atenuação (dB)</p>
        <p className="rounded-lg border border-input bg-muted px-4 py-3 text-base tabular-nums">
          {atenuacao == null ? "—" : `${formatarDb(atenuacao)} dB`}
        </p>
      </div>
      <div>
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Status</p>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function CampoNumero({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputClass()}
      />
    </div>
  );
}

function CampoImportado({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-semibold">{label}</label>
      <input
        value={textoOuTraco(value)}
        readOnly
        tabIndex={-1}
        className={`${inputClass()} cursor-default bg-muted`}
      />
      <p className="mt-1 text-xs text-muted-foreground">Importado automaticamente</p>
    </div>
  );
}

function CampoImportadoCompacto({ value }: { value: string }) {
  return (
    <div>
      <input
        value={textoOuTraco(value)}
        readOnly
        tabIndex={-1}
        className={`${inputClass()} cursor-default bg-muted`}
      />
      <p className="mt-1 text-xs text-muted-foreground">Importado automaticamente</p>
    </div>
  );
}

function Callout({
  rotulo,
  tom,
  children,
}: {
  rotulo: string;
  tom: "cinza" | "verde";
  children: string;
}) {
  return (
    <div
      className={`rounded-xl px-4 py-3 ${
        tom === "verde" ? "bg-emerald-50 text-emerald-900" : "bg-muted text-foreground"
      }`}
    >
      <p className="text-xs font-medium opacity-80">{rotulo}</p>
      <p className="mt-0.5 text-lg font-bold tabular-nums">{children}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "aprovado" | "reprovado" | null }) {
  if (status == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (status === "aprovado") {
    return (
      <span className="inline-flex rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
        ✅ Aprovado
      </span>
    );
  }
  return (
    <span className="inline-flex rounded-full bg-red-600 px-2.5 py-1 text-xs font-semibold text-white">
      ❌ Reprovado
    </span>
  );
}
