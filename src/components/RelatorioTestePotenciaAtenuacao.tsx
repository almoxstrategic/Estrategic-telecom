import { useMemo, type ReactNode } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import { FIBER_COLORS, corFibraPorNumero } from "@/lib/fiber-colors";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
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

function campoEmBranco(raw: unknown): boolean {
  return String(raw ?? "").trim() === "";
}

function numeroFibraDoItem(raw: unknown): number | null {
  if (!raw || typeof raw !== "object") return null;
  const n = (raw as { numeroFibra?: unknown }).numeroFibra;
  if (typeof n === "number" && Number.isFinite(n) && n >= 1) return Math.trunc(n);
  if (typeof n === "string" && n.trim()) {
    const parsed = Number(n.replace(",", "."));
    if (Number.isFinite(parsed) && parsed >= 1) return Math.trunc(parsed);
  }
  return null;
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
  const lista = janela === "1550" ? testeOptico.cliente?.nm1550 : testeOptico.cliente?.nm1330;
  return listaOuItem(lista).slice(0, 1).map((item) => ({
    ...(typeof item === "object" && item ? item : {}),
    numeroFibra: testeOptico.cliente?.numeroFibra,
  }));
}

function janelaEstacao(testeOptico: TesteOpticoPayload, janela: JanelaNm) {
  const lista = janela === "1550" ? testeOptico.estacao?.nm1550 : testeOptico.estacao?.nm1330;
  return listaOuItem(lista).slice(0, 1).map((item) => ({
    ...(typeof item === "object" && item ? item : {}),
    numeroFibra: testeOptico.estacao?.numeroFibra,
  }));
}

function piTextoDoPonto(
  testeOptico: TesteOpticoPayload,
  janela: JanelaNm,
  ponto: PontoMedicao,
): string {
  const origem =
    ponto === "cliente"
      ? janelaCliente(testeOptico, janela)
      : janelaEstacao(testeOptico, janela);
  return dbmTexto(listaOuItem(origem)[0]);
}

/** Pi e Po vêm da mesma localidade (cliente ou estação), 1:1 com o card. */
function piDoPonto(
  testeOptico: TesteOpticoPayload,
  janela: JanelaNm,
  ponto: PontoMedicao,
): number | null {
  return parseNumeroCampo(piTextoDoPonto(testeOptico, janela, ponto));
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
  return listaOuItem(origem).map((item, index) => {
    const informado = numeroFibraDoItem(item);
    const numeroDaFibra = informado || index + 1;
    return {
      numero: String(numeroDaFibra).padStart(2, "0"),
      numeroFibra: numeroDaFibra,
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
  const referenciaPi = piTextoDoPonto(testeOptico, janela, ponto);
  const fibras = fibrasDoPonto(testeOptico, janela, ponto);
  const janelaNm = `${janela} nm`;
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
        atenMaxima={atenMaxima}
        valorMinimoAdmissivel={
          valorMinimoAdmissivel == null ? "—" : formatarDb(valorMinimoAdmissivel, 2)
        }
      />
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Fibras</h3>
        <p className="text-xs text-muted-foreground">
          Potência medida (Po) gerada automaticamente pela Atenuação Máxima.
        </p>
        <div className="hidden gap-4 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-4">
          <span>Fibra Nº</span>
          <span>Po (dBm)</span>
          <span>Po - Pi (dB)</span>
          <span>Status</span>
        </div>
        <div className="divide-y divide-border">
          {fibras.map((fibra, index) => {
            const numeroDaFibra = fibra.numeroFibra || index + 1;
            return (
            <LinhaFibra
              key={`${janela}-${ponto}-${index}`}
              numero={String(numeroDaFibra).padStart(2, "0")}
              numeroFibra={numeroDaFibra}
              atenMaxima={atenMaxima}
              referenciaPi={referenciaPi}
              valorMinimoAdmissivel={valorMinimoAdmissivel}
            />
            );
          })}
        </div>
      </div>
    </section>
  );
}

function LinhaFibra({
  numero,
  numeroFibra,
  atenMaxima,
  referenciaPi,
  valorMinimoAdmissivel,
}: {
  numero: string;
  numeroFibra: number;
  atenMaxima: number;
  referenciaPi: string;
  valorMinimoAdmissivel: number | null;
}) {
  const piEmBranco = campoEmBranco(referenciaPi);
  const valPo = -Math.abs(atenMaxima);
  const valPi = parseFloat(String(referenciaPi || "0").replace(",", ".")) || 0;
  const atenuacao = valPo - valPi;
  const status =
    piEmBranco || valorMinimoAdmissivel == null
      ? null
      : valPo >= valorMinimoAdmissivel
        ? "aprovado"
        : "reprovado";
  const colorCode = corFibraPorNumero(numeroFibra);
  const poFormatado = valPo.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const atenuacaoFormatada = `${atenuacao.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })} dB`;

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
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po (dBm)</p>
        <input
          value={poFormatado}
          readOnly
          tabIndex={-1}
          className={`${inputClass()} cursor-default bg-muted`}
        />
      </div>
      <div className="min-w-0">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po - Pi (dB)</p>
        <p className={`${inputClass()} cursor-default bg-muted tabular-nums`}>
          {piEmBranco ? "—" : atenuacaoFormatada}
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
  atenMaxima,
  valorMinimoAdmissivel,
}: {
  janelaNm: string;
  atenMaxima: number;
  valorMinimoAdmissivel: string;
}) {
  const atenMaximaExibida = `-${Math.abs(atenMaxima).toFixed(2)}`;
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
          rotulo={`ATENUAÇÃO MÁXIMA - ${janelaNm}:`}
          valor={atenMaximaExibida}
          unidade="dB"
          destaqueCinza
        />
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
  destaqueCinza = false,
}: {
  rotulo: ReactNode;
  valor: string;
  unidade: string;
  destaque?: boolean;
  destaqueCinza?: boolean;
}) {
  const fundo = destaque ? "bg-yellow-100" : destaqueCinza ? "bg-gray-100" : "bg-white";
  return (
    <tr className={`border border-gray-300 ${fundo}`}>
      <td className={`px-3 py-2 ${destaqueCinza ? "font-semibold" : ""}`}>{rotulo}</td>
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
