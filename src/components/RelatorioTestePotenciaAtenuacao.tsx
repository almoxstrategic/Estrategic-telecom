import { useMemo, type ReactNode } from "react";
import { inputClass } from "@/components/RelatorioRedeAcesso";
import { SeletorPadraoCoresFibra } from "@/components/SeletorPadraoCoresFibra";
import { corFibraPorNumero, type PadraoCoresFibra } from "@/lib/fiber-colors";
import { cn } from "@/lib/utils";
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
  padraoCoresFibra = "br",
  onPadraoCoresFibraChange,
  readOnly = false,
  /** `gestor` = 1550/1330 lado a lado (desktop) com componentes compactos. */
  layoutMode = "tecnico",
}: {
  testeOptico?: TesteOpticoPayload | null;
  testeOtdr?: TestePotenciaPayload | null;
  redeAcesso?: QuantidadesRedePayload | null;
  redeCliente?: QuantidadesRedePayload | null;
  padraoCoresFibra?: PadraoCoresFibra;
  onPadraoCoresFibraChange?: (next: PadraoCoresFibra) => void;
  readOnly?: boolean;
  layoutMode?: "tecnico" | "gestor";
}) {
  const isGestor = layoutMode === "gestor";
  const optico = testeOptico ?? emptyTesteOptico();
  const otdr = testeOtdr ?? emptyTestePotencia();
  const re = redeAcesso ?? emptyQuantidadesRede();
  const rc = redeCliente ?? emptyQuantidadesRede();
  const km = parseNumeroCampo(String(otdr.comprimentoTrechoKm ?? "")) ?? 0;
  const totalEmendas = totalEmendasCalculado(re.qtdCaixasEmenda, rc.qtdCaixasEmenda);
  const totalConexoes = totalConexoesCalculado(totalEmendas);
  const padrao = padraoCoresFibra === "eua" ? "eua" : "br";

  const cardsCliente = CARDS.filter((card) => card.ponto === "cliente");

  return (
    <div className="space-y-4">
      <SeletorPadraoCoresFibra
        value={padrao}
        onChange={readOnly ? undefined : onPadraoCoresFibraChange}
        readOnly={readOnly}
        showTitulo={false}
      />
      <div
        className={cn(
          isGestor
            ? "grid w-full min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-2"
            : "space-y-4",
        )}
      >
        {cardsCliente.map((card) => (
          <JanelaCard
            key={card.titulo}
            titulo={card.titulo}
            janela={card.janela}
            ponto={card.ponto}
            km={km}
            testeOptico={optico}
            totalEmendas={totalEmendas}
            totalConexoes={totalConexoes}
            padraoCoresFibra={padrao}
            compact={isGestor}
          />
        ))}
      </div>
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
  padraoCoresFibra,
  compact = false,
}: {
  titulo: string;
  janela: JanelaNm;
  ponto: PontoMedicao;
  km: number;
  testeOptico: TesteOpticoPayload;
  totalEmendas: number;
  totalConexoes: number;
  padraoCoresFibra: PadraoCoresFibra;
  compact?: boolean;
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
    <section
      className={cn(
        "min-w-0 space-y-3 rounded-2xl border border-border bg-card shadow-sm",
        compact ? "p-3 sm:p-4" : "space-y-4 p-5",
      )}
    >
      <h2 className={cn("font-bold", compact ? "text-sm leading-snug" : "text-base")}>{titulo}</h2>
      <div
        className={cn(
          "mb-3 grid w-full min-w-0 gap-3 text-left",
          compact
            ? "grid-cols-2"
            : "mb-4 grid-cols-2 gap-4 md:grid-cols-4 print:grid-cols-4",
        )}
      >
        <CampoImportado
          label="Comprimento do Trecho (km)"
          value={`${formatarPtBr(kmSeguro)} km`}
          compact={compact}
        />
        <CampoImportado label="Nº de Emendas" value={String(emendasSeguro)} compact={compact} />
        <CampoImportado label="Nº de Conexões" value={String(conexoesSeguro)} compact={compact} />
        <CampoImportado
          label="Referência do Instrumento (Pi) em dBm"
          value={pi == null ? "" : formatarDb(pi, 2)}
          compact={compact}
        />
      </div>
      <ValoresReferencia
        janelaNm={janelaNm}
        atenMaxima={atenMaxima}
        valorMinimoAdmissivel={
          valorMinimoAdmissivel == null ? "—" : formatarDb(valorMinimoAdmissivel, 2)
        }
        compact={compact}
      />
      <div className={cn("space-y-2", !compact && "space-y-3")}>
        <h3 className={cn("font-semibold", compact ? "text-xs" : "text-sm")}>Fibras</h3>
        <p className={cn("text-muted-foreground", compact ? "text-[10px] leading-snug" : "text-xs")}>
          Potência medida (Po) gerada automaticamente pela Atenuação Máxima.
        </p>
        <div
          className={cn(
            "hidden gap-2 px-1 font-medium text-muted-foreground md:grid md:grid-cols-4",
            compact ? "text-[10px]" : "gap-4 text-xs",
          )}
        >
          <span className="min-w-0 text-left">Fibra Nº</span>
          <span className="min-w-0 text-center">Po (dBm)</span>
          <span className="min-w-0 text-center">Po - Pi (dB)</span>
          <span className="min-w-0 text-center">Status</span>
        </div>
        <div className="divide-y divide-border">
          {numeroFibra == null ? (
            <p className={cn("py-3 text-muted-foreground", compact ? "text-xs" : "text-sm")}>
              Nenhum teste registrado
            </p>
          ) : (
            <LinhaFibra
              numero={String(numeroFibra).padStart(2, "0")}
              numeroFibra={numeroFibra}
              atenMaxima={atenMaxima}
              referenciaPi={referenciaPi}
              valorMinimoAdmissivel={valorMinimoAdmissivel}
              padraoCoresFibra={padraoCoresFibra}
              compact={compact}
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
  padraoCoresFibra,
  compact = false,
}: {
  numero: string;
  numeroFibra: number;
  atenMaxima: number;
  referenciaPi: string;
  valorMinimoAdmissivel: number | null;
  padraoCoresFibra: PadraoCoresFibra;
  compact?: boolean;
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
  const colorCode = corFibraPorNumero(numeroFibra, padraoCoresFibra);
  const poFormatado = formatarPtBr(valPo);
  const atenuacaoFormatada = `${formatarPtBr(atenuacao)} dB`;
  const campoCompacto = compact
    ? `${inputClass()} min-w-0 px-1.5 py-1.5 text-xs`
    : inputClass();

  return (
    <div
      className={cn(
        "grid min-w-0 items-center py-2",
        compact
          ? "grid-cols-4 gap-1.5 sm:gap-2"
          : "grid-cols-2 gap-4 md:grid-cols-4",
      )}
    >
      <div className="min-w-0 text-left">
        {!compact ? (
          <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Fibra Nº</p>
        ) : null}
        <div className="flex min-w-0 items-center gap-1.5">
          <span
            title={colorCode.label}
            className={cn(
              "flex shrink-0 items-center justify-center rounded-sm font-bold",
              colorCode.bg,
              compact ? "h-6 w-6 text-[9px]" : "h-7 w-7 text-[10px]",
            )}
          >
            {colorCode.sigla}
          </span>
          <span
            className={cn(
              campoCompacto,
              "min-w-0 flex-1 cursor-default truncate bg-muted font-medium text-gray-700",
            )}
          >
            {numero}
          </span>
        </div>
      </div>
      <div className="min-w-0 text-center">
        {!compact ? (
          <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po (dBm)</p>
        ) : null}
        <input
          value={poFormatado}
          readOnly
          tabIndex={-1}
          className={cn(campoCompacto, "w-full cursor-default bg-muted text-center tabular-nums")}
        />
      </div>
      <div className="min-w-0 text-center">
        {!compact ? (
          <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Po - Pi (dB)</p>
        ) : null}
        <p
          className={cn(
            campoCompacto,
            "w-full cursor-default truncate bg-muted text-center tabular-nums",
          )}
        >
          {piEmBranco ? "—" : atenuacaoFormatada}
        </p>
      </div>
      <div
        className={cn(
          "flex min-w-0 items-center justify-center",
          compact ? "min-h-0" : "min-h-[48px] md:min-h-0",
        )}
      >
        {!compact ? (
          <p className="mb-1 text-xs font-medium text-gray-700 md:sr-only">Status</p>
        ) : null}
        <StatusBadge status={status} compact={compact} />
      </div>
    </div>
  );
}

function ValoresReferencia({
  janelaNm,
  atenMaxima,
  valorMinimoAdmissivel,
  compact = false,
}: {
  janelaNm: string;
  atenMaxima: number;
  valorMinimoAdmissivel: string;
  compact?: boolean;
}) {
  const atenSegura = numeroSeguro(atenMaxima, 0);
  const atenMaximaExibida = `-${Math.abs(atenSegura).toFixed(2)}`;
  return (
    <table
      className={cn(
        "mb-3 w-full min-w-0 border-collapse text-gray-700",
        compact ? "mb-2 text-[10px] leading-snug" : "mb-4 text-xs md:text-sm",
      )}
    >
      <tbody>
        <LinhaRef
          rotulo={`ATENUAÇÃO DA FIBRA NA JANELA ÓPTICA DE ${janelaNm}:`}
          valor={ATEN_KM.toFixed(2)}
          unidade="dB/Km"
          compact={compact}
        />
        <LinhaRef
          rotulo="ATENUAÇÃO POR EMENDA:"
          valor={ATEN_EMENDA.toFixed(2)}
          unidade="dB"
          compact={compact}
        />
        <LinhaRef
          rotulo="PERDA POR CONEXÃO:"
          valor={PERDA_CONEXAO.toFixed(2)}
          unidade="dB"
          compact={compact}
        />
        <LinhaRef
          rotulo={`ATENUAÇÃO MÁXIMA - ${janelaNm}:`}
          valor={atenMaximaExibida}
          unidade="dB"
          destaqueCinza
          compact={compact}
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
          compact={compact}
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
  compact = false,
}: {
  rotulo: ReactNode;
  valor: string;
  unidade: string;
  destaque?: boolean;
  destaqueCinza?: boolean;
  compact?: boolean;
}) {
  const fundo = destaque ? "bg-yellow-100" : destaqueCinza ? "bg-gray-100" : "bg-white";
  const cellPad = compact ? "px-1.5 py-1" : "px-3 py-2";
  return (
    <tr className={`border border-gray-300 ${fundo}`}>
      <td
        className={cn(
          "w-2/3 min-w-0 text-left",
          cellPad,
          destaqueCinza && "font-semibold",
        )}
      >
        {rotulo}
      </td>
      <td className={cn("w-1/6 text-right font-bold tabular-nums", cellPad)}>{valor}</td>
      <td className={cn("w-1/6 pl-1 text-left text-gray-600", cellPad, !compact && "pl-2")}>
        {unidade}
      </td>
    </tr>
  );
}

function CampoImportado({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: string;
  compact?: boolean;
}) {
  return (
    <div className="flex h-full w-full min-w-0 flex-col justify-end text-left">
      <label
        className={cn(
          "mb-1 block text-left font-semibold leading-snug",
          compact ? "text-[11px]" : "mb-1.5 text-sm",
        )}
      >
        {label}
      </label>
      <input
        value={textoOuTraco(value)}
        readOnly
        tabIndex={-1}
        className={cn(
          inputClass(),
          "cursor-default bg-muted text-left",
          compact && "px-2 py-1.5 text-xs",
        )}
      />
      <p
        className={cn(
          "mt-1 text-left leading-tight text-gray-400",
          compact ? "text-[9px]" : "text-[10px] md:text-xs",
        )}
      >
        Importado automaticamente
      </p>
    </div>
  );
}

function StatusBadge({
  status,
  compact = false,
}: {
  status: "aprovado" | "reprovado" | null;
  compact?: boolean;
}) {
  if (status == null) {
    return (
      <span className={cn("text-muted-foreground", compact ? "text-xs" : "text-sm")}>—</span>
    );
  }
  if (status === "aprovado") {
    return (
      <span className={cn("font-bold text-green-600", compact ? "text-[11px]" : "text-sm")}>
        ✅ OK
      </span>
    );
  }
  return (
    <span
      className={cn(
        "font-bold text-red-600",
        compact ? "whitespace-nowrap text-[11px]" : "text-sm",
      )}
    >
      ❌ NÃO OK
    </span>
  );
}
