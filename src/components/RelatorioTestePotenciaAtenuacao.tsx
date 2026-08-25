import { useMemo, useState, type ReactNode } from "react";
import { ChoiceButton, inputClass } from "@/components/RelatorioRedeAcesso";
import { FIBER_COLORS, corFibraPorNumero } from "@/lib/fiber-colors";
import {
  ATEN_EMENDA,
  ATEN_KM,
  PERDA_CONEXAO,
  calcularAtenuacaoMaxima,
  calcularMinimoAdmissivel,
  emptyQuantidadesRede,
  emptyTesteOptico,
  emptyTestePotencia,
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
type PadraoCoresFibra = "br" | "eua";

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
  testeOptico?: TesteOpticoPayload | null;
  testeOtdr?: TestePotenciaPayload | null;
  redeAcesso?: QuantidadesRedePayload | null;
  redeCliente?: QuantidadesRedePayload | null;
}) {
  const optico = testeOptico ?? emptyTesteOptico();
  const otdr = testeOtdr ?? emptyTestePotencia();
  const re = redeAcesso ?? emptyQuantidadesRede();
  const rc = redeCliente ?? emptyQuantidadesRede();
  const km = parseNumeroCampo(String(otdr.comprimentoTrechoKm ?? "")) ?? 0;
  const totalEmendas = totalEmendasCalculado(re.qtdCaixasEmenda, rc.qtdCaixasEmenda);
  const totalConexoes = totalConexoesCalculado(totalEmendas);

  return (
    <div className="space-y-4">
      <LegendaCoresFibra />
      {CARDS.filter((card) => card.ponto === "cliente").map((card) => (
        <JanelaCard
          key={card.titulo}
          titulo={card.titulo}
          janela={card.janela}
          ponto={card.ponto}
          km={km}
          testeOptico={optico}
          totalEmendas={totalEmendas}
          totalConexoes={totalConexoes}
        />
      ))}
    </div>
  );
}

function numeroSeguro(raw: unknown, fallback = 0): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  const n = parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) ? n : fallback;
}

function formatarPtBr(raw: unknown): string {
  return numeroSeguro(raw).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function campoEmBranco(raw: unknown): boolean {
  return String(raw ?? "").trim() === "";
}

function primeiroDbm(lista: unknown): string {
  const item = Array.isArray(lista) ? lista[0] : lista;
  if (!item || typeof item !== "object") return "";
  const valor = (item as { dbm?: unknown; dBm?: unknown }).dbm ?? (item as { dBm?: unknown }).dBm;
  return valor == null ? "" : String(valor);
}

function piTextoDoPonto(
  testeOptico: TesteOpticoPayload,
  janela: JanelaNm,
  ponto: PontoMedicao,
): string {
  const localidade = ponto === "cliente" ? testeOptico?.cliente : testeOptico?.estacao;
  return janela === "1550" ? primeiroDbm(localidade?.nm1550) : primeiroDbm(localidade?.nm1330);
}

function numeroFibraDoPonto(testeOptico: TesteOpticoPayload, ponto: PontoMedicao): number | null {
  const bruto =
    ponto === "cliente"
      ? testeOptico?.cliente?.numeroFibra
      : testeOptico?.estacao?.numeroFibra;
  const n = typeof bruto === "number" ? bruto : numeroSeguro(bruto, 0);
  return n >= 1 ? Math.trunc(n) : null;
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
  const referenciaPi = piTextoDoPonto(testeOptico, janela, ponto);
  const pi = parseNumeroCampo(referenciaPi);
  const numeroFibra = numeroFibraDoPonto(testeOptico, ponto);
  const janelaNm = `${janela} nm`;
  const kmSeguro = numeroSeguro(km, 0);
  const emendasSeguro = numeroSeguro(totalEmendas, 0);
  const conexoesSeguro = numeroSeguro(totalConexoes, 0);
  const atenMaxima = useMemo(
    () => calcularAtenuacaoMaxima(kmSeguro, emendasSeguro, conexoesSeguro),
    [kmSeguro, emendasSeguro, conexoesSeguro],
  );
  const valorMinimoAdmissivel = useMemo(
    () => calcularMinimoAdmissivel(pi, atenMaxima),
    [pi, atenMaxima],
  );

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-base font-bold">{titulo}</h2>
      <div className="mb-4 grid w-full grid-cols-2 gap-4 text-left md:grid-cols-4 print:grid-cols-4">
        <CampoImportado
          label="Comprimento do Trecho (km)"
          value={`${formatarPtBr(kmSeguro)} km`}
        />
        <CampoImportado label="Nº de Emendas" value={String(emendasSeguro)} />
        <CampoImportado label="Nº de Conexões" value={String(conexoesSeguro)} />
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
          <span className="text-left">Fibra Nº</span>
          <span className="text-center">Po (dBm)</span>
          <span className="text-center">Po - Pi (dB)</span>
          <span className="text-center">Status</span>
        </div>
        <div className="divide-y divide-border">
          {numeroFibra == null ? (
            <p className="py-3 text-sm text-muted-foreground">Nenhum teste registrado</p>
          ) : (
            <LinhaFibra
              numero={String(numeroFibra).padStart(2, "0")}
              numeroFibra={numeroFibra}
              atenMaxima={atenMaxima}
              referenciaPi={referenciaPi}
              valorMinimoAdmissivel={valorMinimoAdmissivel}
            />
          )}
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
  const valPo = -Math.abs(numeroSeguro(atenMaxima, 0));
  const valPi = parseNumeroCampo(String(referenciaPi || "0")) ?? 0;
  const atenuacao = valPo - valPi;
  const status =
    piEmBranco || valorMinimoAdmissivel == null
      ? null
      : valPo >= valorMinimoAdmissivel
        ? "aprovado"
        : "reprovado";
  const colorCode = corFibraPorNumero(numeroFibra);
  const poFormatado = formatarPtBr(valPo);
  const atenuacaoFormatada = `${formatarPtBr(atenuacao)} dB`;

  return (
    <div className="grid grid-cols-2 items-center gap-4 py-2 md:grid-cols-4">
      <div className="min-w-0 text-left">
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
      <div className="min-w-0 text-center">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po (dBm)</p>
        <input
          value={poFormatado}
          readOnly
          tabIndex={-1}
          className={`${inputClass()} cursor-default bg-muted text-center`}
        />
      </div>
      <div className="min-w-0 text-center">
        <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po - Pi (dB)</p>
        <p className={`${inputClass()} cursor-default bg-muted text-center tabular-nums`}>
          {piEmBranco ? "—" : atenuacaoFormatada}
        </p>
      </div>
      <div className="flex min-h-[48px] items-center justify-center md:min-h-0">
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
  const atenSegura = numeroSeguro(atenMaxima, 0);
  const atenMaximaExibida = `-${Math.abs(atenSegura).toFixed(2)}`;
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
      <td
        className={`w-2/3 px-3 py-2 text-left ${destaqueCinza ? "font-semibold" : ""}`}
      >
        {rotulo}
      </td>
      <td className="w-1/6 px-3 py-2 text-right font-bold tabular-nums">{valor}</td>
      <td className="w-1/6 px-3 py-2 pl-2 text-left text-gray-600">{unidade}</td>
    </tr>
  );
}

function LegendaCoresFibra() {
  const [padrao, setPadrao] = useState<PadraoCoresFibra>("br");
  const titulo =
    padrao === "br"
      ? "Padrão de cores da fibra (Telebrás/ABNT) — repete a cada 12 fibras"
      : "Padrão de cores da fibra (EUA) — em breve";

  return (
    <div className="my-6 flex w-full flex-col items-center justify-center rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-center">
      <div
        className="mb-3 grid w-full max-w-sm grid-cols-2 gap-2"
        role="radiogroup"
        aria-label="Padrão de cores da fibra"
      >
        <ChoiceButton active={padrao === "br"} onClick={() => setPadrao("br")}>
          Padrão BR
        </ChoiceButton>
        <ChoiceButton active={padrao === "eua"} onClick={() => setPadrao("eua")}>
          Padrão EUA
        </ChoiceButton>
      </div>
      <p className="mb-2 text-xs font-semibold text-gray-700">{titulo}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {FIBER_COLORS.map((cor, index) => (
          <span
            key={cor.sigla}
            title={`${String(index + 1).padStart(2, "0")} · ${cor.label}`}
            className={`inline-flex h-7 min-w-7 items-center justify-center rounded-sm px-1.5 text-[10px] font-bold ${cor.bg} ${
              padrao === "eua" ? "opacity-50" : ""
            }`}
          >
            {cor.sigla}
          </span>
        ))}
      </div>
      {padrao === "eua" ? (
        <p className="mt-2 text-[11px] text-gray-500">
          Paleta EUA ainda não disponível — exibindo referência BR.
        </p>
      ) : null}
    </div>
  );
}

function CampoImportado({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex h-full w-full flex-col justify-end text-left">
      <label className="mb-1.5 block text-left text-sm font-semibold leading-snug">{label}</label>
      <input
        value={textoOuTraco(value)}
        readOnly
        tabIndex={-1}
        className={`${inputClass()} cursor-default bg-muted text-left`}
      />
      <p className="mt-1 text-left text-[10px] leading-tight text-gray-400 md:text-xs">
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
