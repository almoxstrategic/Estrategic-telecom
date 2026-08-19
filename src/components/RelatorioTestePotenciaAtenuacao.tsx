import { useMemo } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import {
  calcularAtenuacaoFibra,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  formatarDb,
  formatarKm,
  metrosParaKm,
  parseNumeroCampo,
  textoOuTraco,
  totalConexoesCalculado,
  totalEmendasCalculado,
  type QuantidadesRedePayload,
  type TesteOpticoFaixaPayload,
  type TesteOpticoPayload,
  type TestePotenciaPayload,
} from "@/lib/relatorios-transmissao";

export function RelatorioTestePotenciaAtenuacao({
  testeOptico,
  otdr,
  redeAcesso,
  redeCliente,
}: {
  testeOptico: TesteOpticoPayload;
  otdr: TestePotenciaPayload;
  redeAcesso: QuantidadesRedePayload;
  redeCliente: QuantidadesRedePayload;
}) {
  const km = metrosParaKm(otdr.otdr[0]?.distancia);
  const pi1550 = parseNumeroCampo(testeOptico.estacao.nm1550[0]?.dbm ?? "") ?? 0;
  const pi1330 = parseNumeroCampo(testeOptico.estacao.nm1330[0]?.dbm ?? "") ?? 0;
  const totalEmendas = totalEmendasCalculado(
    redeAcesso.qtdCaixasEmenda,
    redeCliente.qtdCaixasEmenda,
  );
  const totalConexoes = totalConexoesCalculado(totalEmendas);

  return (
    <div className="space-y-4">
      <JanelaCard
        titulo="TESTE DE POTÊNCIA - 1550nm"
        km={km}
        pi={pi1550}
        faixaCliente={testeOptico.cliente.nm1550}
        totalEmendas={totalEmendas}
        totalConexoes={totalConexoes}
      />
      <JanelaCard
        titulo="TESTE DE POTÊNCIA - 1330nm"
        km={km}
        pi={pi1330}
        faixaCliente={testeOptico.cliente.nm1330}
        totalEmendas={totalEmendas}
        totalConexoes={totalConexoes}
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
  totalEmendas,
  totalConexoes,
}: {
  titulo: string;
  km: number;
  pi: number;
  faixaCliente: TesteOpticoFaixaPayload;
  totalEmendas: number;
  totalConexoes: number;
}) {
  const atenMaxima = useMemo(
    () => calcularAtenuacaoMaxima(km, totalEmendas, totalConexoes),
    [km, totalEmendas, totalConexoes],
  );
  const valorMinimoAdmissivel = useMemo(
    () => calcularMinimoAdmissivel(pi, atenMaxima),
    [pi, atenMaxima],
  );
  const fibras = useMemo(() => fibrasDeCliente(faixaCliente), [faixaCliente]);

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{titulo}</h2>
      <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-4">
        <CampoImportado label="Comprimento do Trecho (km)" value={formatarKm(km)} />
        <CampoImportado label="Nº de Emendas" value={String(totalEmendas)} />
        <CampoImportado label="Nº de Conexões" value={String(totalConexoes)} />
        <CampoImportado label="Referência do Instrumento (Pi) em dBm" value={formatarDb(pi, 2)} />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Callout tom="cinza" rotulo="Atenuação Máxima">
          {formatarDb(atenMaxima, 3)} dB
        </Callout>
        <Callout tom="verde" rotulo="Valor Mínimo Admissível (Po)">
          {formatarDb(valorMinimoAdmissivel, 2)} dBm
        </Callout>
      </div>
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Fibras</h3>
        <p className="text-xs text-muted-foreground">
          Potência medida (Po) importada do Teste Óptico (No Cliente).
        </p>
        <div className="hidden gap-4 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-4">
          <span>Fibra Nº</span>
          <span>Potência Medida - Po (dBm)</span>
          <span>Atenuação (dB)</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-border">
          {fibras.map((fibra) => (
            <LinhaFibra
              key={fibra.numero}
              numero={fibra.numero}
              potenciaMedida={fibra.potenciaMedida}
              pi={pi}
              valorMinimoAdmissivel={valorMinimoAdmissivel}
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
  valorMinimoAdmissivel,
}: {
  numero: string;
  potenciaMedida: string;
  pi: number;
  valorMinimoAdmissivel: number;
}) {
  const po = parseNumeroCampo(potenciaMedida);
  const atenuacao = calcularAtenuacaoFibra(potenciaMedida, pi);
  const status =
    po == null ? null : po >= valorMinimoAdmissivel ? "aprovado" : "reprovado";

  return (
    <div className="grid grid-cols-2 items-center gap-4 py-2 md:grid-cols-4">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Fibra Nº</p>
        <p className={`${inputClass()} cursor-default bg-muted`}>{numero}</p>
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Potência Medida - Po (dBm)</p>
        <input
          value={textoOuTraco(po == null ? "" : formatarDb(po, 2))}
          readOnly
          tabIndex={-1}
          className={`${inputClass()} cursor-default bg-muted`}
        />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Atenuação (dB)</p>
        <p className={`${inputClass()} cursor-default bg-muted tabular-nums`}>
          {atenuacao == null ? "—" : `${formatarDb(atenuacao, 2)} dB`}
        </p>
      </div>
      <div className="flex min-h-[48px] items-center md:min-h-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Status</p>
        <StatusBadge status={status} />
      </div>
    </div>
  );
}

function CampoImportado({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full flex-col justify-end">
      <label className="mb-1.5 block text-sm font-semibold leading-snug">{label}</label>
      <input
        value={textoOuTraco(value)}
        readOnly
        tabIndex={-1}
        className={`${inputClass()} cursor-default bg-muted`}
      />
      <p className="mt-1 text-[10px] leading-tight text-gray-400 md:text-xs">
        Importado automaticamente
      </p>
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
      className={`flex min-h-[80px] flex-col justify-center rounded-lg p-4 ${
        tom === "verde" ? "bg-emerald-50 text-emerald-900" : "bg-muted text-foreground"
      }`}
    >
      <p className="text-xs font-medium opacity-80">{rotulo}</p>
      <p className="mt-0.5 text-xl font-bold tabular-nums">{children}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: "aprovado" | "reprovado" | null }) {
  if (status == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (status === "aprovado") {
    return <span className="text-green-600 font-bold">✅ OK</span>;
  }
  return <span className="text-red-600 font-bold">❌ NÃO OK</span>;
}
