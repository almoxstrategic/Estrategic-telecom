import { useMemo, type ReactNode } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoFibra,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  formatarDb,
  formatarKm,
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
  testeOtdr,
  redeAcesso,
  redeCliente,
}: {
  testeOptico: TesteOpticoPayload;
  testeOtdr: TestePotenciaPayload;
  redeAcesso: QuantidadesRedePayload;
  redeCliente: QuantidadesRedePayload;
}) {
  const km = parseNumeroCampo(testeOtdr.comprimentoTrechoKm ?? "") ?? 0;
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
        janelaNm="1550 nm"
        km={km}
        pi={pi1550}
        faixaCliente={testeOptico.cliente.nm1550}
        totalEmendas={totalEmendas}
        totalConexoes={totalConexoes}
      />
      <JanelaCard
        titulo="TESTE DE POTÊNCIA - 1330nm"
        janelaNm="1330 nm"
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
  janelaNm,
  km,
  pi,
  faixaCliente,
  totalEmendas,
  totalConexoes,
}: {
  titulo: string;
  janelaNm: string;
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
      <ValoresReferencia janelaNm={janelaNm} valorMinimoAdmissivel={valorMinimoAdmissivel} />
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

function ValoresReferencia({
  janelaNm,
  valorMinimoAdmissivel,
}: {
  janelaNm: string;
  valorMinimoAdmissivel: number;
}) {
  return (
    <table className="mb-4 w-full border-collapse text-xs text-gray-700 md:text-sm">
      <tbody>
        <LinhaRef
          rotulo={`ATENUAÇÃO DA FIBRA NA JANELA ÓPTICA DE ${janelaNm}:`}
          valor={ATEN_KM.toFixed(2)}
          unidade="dB/Km"
        />
        <LinhaRef rotulo="ATENUAÇÃO POR EMENDA:" valor={ATEN_EMENDA.toFixed(2)} unidade="dB" />
        <LinhaRef rotulo="PERDA POR CONEXÃO:" valor={PERDA_CONEXAO.toFixed(2)} unidade="dB" />
        <LinhaRef
          rotulo={
            <>
              Valor Mínimo Admissível para a Potência Medida{" "}
              <span className="font-semibold text-red-600">Po</span>:
            </>
          }
          valor={formatarDb(valorMinimoAdmissivel, 2)}
          unidade="dBm"
          destaque
        />
      </tbody>
    </table>
  );
}

function LinhaRef({
  rotulo,
  valor,
  unidade,
  destaque = false,
}: {
  rotulo: ReactNode;
  valor: string;
  unidade: string;
  destaque?: boolean;
}) {
  return (
    <tr className={`border border-gray-300 ${destaque ? "bg-yellow-100" : "bg-white"}`}>
      <td className="px-3 py-2">{rotulo}</td>
      <td className="w-24 px-3 py-2 text-center font-semibold tabular-nums">{valor}</td>
      <td className="w-20 px-3 py-2 text-gray-600">{unidade}</td>
    </tr>
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

function StatusBadge({ status }: { status: "aprovado" | "reprovado" | null }) {
  if (status == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (status === "aprovado") {
    return <span className="text-green-600 font-bold">✅ OK</span>;
  }
  return <span className="text-red-600 font-bold">❌ NÃO OK</span>;
}
