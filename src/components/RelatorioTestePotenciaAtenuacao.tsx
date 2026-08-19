import { useMemo, type ReactNode } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import { FIBER_COLORS, corFibraPorNumero } from "@/lib/fiber-colors";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoFibra,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  formatarDb,
  parseNumeroCampo,
  textoOuTraco,
  totalConexoesCalculado,
  totalEmendasCalculado,
  type QuantidadesRedePayload,
  type TesteOpticoPayload,
  type TestePotenciaPayload,
} from "@/lib/relatorios-transmissao";

type JanelaNm = "1550" | "1330";
type PontoMedicao = "cliente" | "estacao";

const CARDS: { janela: JanelaNm; ponto: PontoMedicao; titulo: string }[] = [
  { janela: "1550", ponto: "cliente", titulo: "TESTE DE POTÊNCIA - 1550nm (No Cliente)" },
  { janela: "1330", ponto: "cliente", titulo: "TESTE DE POTÊNCIA - 1330nm (No Cliente)" },
  { janela: "1550", ponto: "estacao", titulo: "TESTE DE POTÊNCIA - 1550nm (Na Estação)" },
  { janela: "1330", ponto: "estacao", titulo: "TESTE DE POTÊNCIA - 1330nm (Na Estação)" },
];

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
  const kmRaw = String(testeOtdr.comprimentoTrechoKm || "0").replace(",", ".");
  const km = parseFloat(kmRaw) || 0;
  const totalEmendas = totalEmendasCalculado(
    redeAcesso.qtdCaixasEmenda,
    redeCliente.qtdCaixasEmenda,
  );
  const totalConexoes = totalConexoesCalculado(totalEmendas);

  return (
    <div className="space-y-4">
      <LegendaCoresFibra />
      {CARDS.map((card) => (
        <JanelaCard
          key={card.titulo}
          titulo={card.titulo}
          janela={card.janela}
          ponto={card.ponto}
          km={km}
          testeOptico={testeOptico}
          totalEmendas={totalEmendas}
          totalConexoes={totalConexoes}
        />
      ))}
    </div>
  );
}

function dbmTexto(raw: unknown): string {
  if (!raw || typeof raw !== "object") return "";
  const obj = raw as { dbm?: unknown; dBm?: unknown };
  const valor = obj.dbm ?? obj.dBm;
  return valor == null ? "" : String(valor);
}

function listaOuItem(raw: unknown): unknown[] {
  if (raw == null) return [];
  return Array.isArray(raw) ? raw : [raw];
}

function janelaCliente(testeOptico: TesteOpticoPayload, janela: JanelaNm) {
  return janela === "1550" ? testeOptico.cliente?.nm1550 : testeOptico.cliente?.nm1330;
}

function janelaEstacao(testeOptico: TesteOpticoPayload, janela: JanelaNm) {
  return janela === "1550" ? testeOptico.estacao?.nm1550 : testeOptico.estacao?.nm1330;
}

/** Pi e Po vêm da mesma localidade (cliente ou estação), 1:1 com o card. */
function piDoPonto(
  testeOptico: TesteOpticoPayload,
  janela: JanelaNm,
  ponto: PontoMedicao,
): number | null {
  const origem =
    ponto === "cliente"
      ? janelaCliente(testeOptico, janela)
      : janelaEstacao(testeOptico, janela);
  return parseNumeroCampo(dbmTexto(listaOuItem(origem)[0]));
}

/** Po = medições no ponto do card. */
function fibrasDoPonto(
  testeOptico: TesteOpticoPayload,
  janela: JanelaNm,
  ponto: PontoMedicao,
) {
  const origem =
    ponto === "cliente"
      ? janelaCliente(testeOptico, janela)
      : janelaEstacao(testeOptico, janela);
  const informado =
    ponto === "cliente"
      ? testeOptico.cliente?.numeroFibra
      : testeOptico.estacao?.numeroFibra;
  return listaOuItem(origem).map((item, index) => {
    const numero =
      informado != null && informado >= 1 ? informado : index + 1;
    return {
      numero: String(numero).padStart(2, "0"),
      numeroFibra: numero,
      potenciaMedida: dbmTexto(item),
    };
  });
}

function JanelaCard({
  titulo,
  janela,
  ponto,
  km,
  testeOptico,
  totalEmendas,
  totalConexoes,
}: {
  titulo: string;
  janela: JanelaNm;
  ponto: PontoMedicao;
  km: number;
  testeOptico: TesteOpticoPayload;
  totalEmendas: number;
  totalConexoes: number;
}) {
  const pi = piDoPonto(testeOptico, janela, ponto);
  const fibras = fibrasDoPonto(testeOptico, janela, ponto);
  const janelaNm = `${janela} nm`;
  const origemPo = ponto === "cliente" ? "No Cliente" : "Na Estação";
  const atenMaxima = useMemo(
    () => calcularAtenuacaoMaxima(km, totalEmendas, totalConexoes),
    [km, totalEmendas, totalConexoes],
  );
  const valorMinimoAdmissivel = useMemo(
    () => calcularMinimoAdmissivel(pi, atenMaxima),
    [pi, atenMaxima],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{titulo}</h2>
      <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-4">
        <CampoImportado
          label="Comprimento do Trecho (km)"
          value={km.toLocaleString("pt-BR", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          }) + " km"}
        />
        <CampoImportado label="Nº de Emendas" value={String(totalEmendas)} />
        <CampoImportado label="Nº de Conexões" value={String(totalConexoes)} />
        <CampoImportado
          label="Referência do Instrumento (Pi) em dBm"
          value={pi == null ? "" : formatarDb(pi, 2)}
        />
      </div>
      <ValoresReferencia
        janelaNm={janelaNm}
        valorMinimoAdmissivel={
          valorMinimoAdmissivel == null ? "—" : formatarDb(valorMinimoAdmissivel, 2)
        }
      />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Fibras</h3>
        <p className="text-xs text-muted-foreground">
          Potência medida (Po) importada do Teste Óptico ({origemPo}).
        </p>
        <div className="hidden gap-4 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-4">
          <span>Fibra Nº</span>
          <span>Potência Medida - Po (dBm)</span>
          <span>Atenuação (dB)</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-border">
          {fibras.map((fibra, index) => (
            <LinhaFibra
              key={`${janela}-${ponto}-${index}`}
              numero={fibra.numero}
              numeroFibra={fibra.numeroFibra}
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
  numeroFibra,
  potenciaMedida,
  pi,
  valorMinimoAdmissivel,
}: {
  numero: string;
  numeroFibra: number;
  potenciaMedida: string;
  pi: number | null;
  valorMinimoAdmissivel: number | null;
}) {
  const po = parseNumeroCampo(potenciaMedida);
  const atenuacao = calcularAtenuacaoFibra(potenciaMedida, pi);
  const status =
    po == null || pi == null || valorMinimoAdmissivel == null
      ? null
      : po >= valorMinimoAdmissivel
        ? "aprovado"
        : "reprovado";
  const colorCode = corFibraPorNumero(numeroFibra);

  return (
    <div className="grid grid-cols-2 items-center gap-4 py-2 md:grid-cols-4">
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Fibra Nº</p>
        <div className="flex items-center gap-2">
          <span
            title={colorCode.label}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-sm text-[10px] font-bold ${colorCode.bg}`}
          >
            {colorCode.sigla}
          </span>
          <span className={`${inputClass()} cursor-default bg-muted font-medium text-gray-700`}>
            {numero}
          </span>
        </div>
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
  valorMinimoAdmissivel: string;
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
          valor={valorMinimoAdmissivel}
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

function LegendaCoresFibra() {
  return (
    <div className="my-6 flex w-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
      <p className="mb-2 text-xs font-semibold text-gray-700">
        Padrão de cores da fibra (Telebrás/ABNT) — repete a cada 12 fibras
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {FIBER_COLORS.map((cor, index) => (
          <span
            key={cor.sigla}
            title={`${String(index + 1).padStart(2, "0")} · ${cor.label}`}
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 text-[10px] font-bold ${cor.bg}`}
          >
            {cor.sigla}
          </span>
        ))}
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

function StatusBadge({ status }: { status: "aprovado" | "reprovado" | null }) {
  if (status == null) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  if (status === "aprovado") {
    return <span className="text-green-600 font-bold">✅ OK</span>;
  }
  return <span className="text-red-600 font-bold">❌ NÃO OK</span>;
}
