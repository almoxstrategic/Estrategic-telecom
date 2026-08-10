import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  ArrowDown,
  ArrowUp,
  BarChart3,
  ClipboardCheck,
  DollarSign,
  Download,
  FilterX,
  TrendingUp,
  Users,
  X,
  XCircle,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { KpiTopTecnico } from "@/lib/logistica-types";
import { formatQuantidade } from "@/lib/parse-locale-number";
import type { PrecoOs, PrecosOsMap } from "@/lib/precos-os-service";
import {
  getPercentualAumento,
  setPercentualAumento,
  usePercentualAumento,
} from "@/lib/kpi-projecao-store";
import { isTecnicoDemitido, type TecnicoProfile } from "@/lib/team-service";
import { ATIVIDADES_TOA_CATALOGO } from "@/lib/toa-atividades-catalogo";
import {
  filtrarAnaliticoPorDhBaixa,
  formatDhBaixaDisplay,
  parseDhBaixaAnoMes,
  resumirAnaliticoHistorico,
  filtrarToaOsContabilizaveis,
  type AnaliticoHistoricoRow,
  type ToaImportacaoRow,
} from "@/lib/faturamento-service";
import { conciliarAnaliticoVsToa } from "@/lib/faturamento-conciliacao";
import {
  agregarChamadosToa,
  agregarKpisToaFlat,
  dedupeChamadosPorNumeroWo,
  filtrarChamadosToa,
  filtrarToaOsRows,
  flattenChamadosToa,
  isOsImprodutiva,
  isOsProdutiva,
  isOsReceitaFaturavelNaNota,
  isCodBaixaProdutivo,
  isStatusAtividadeContabilizavel,
  isStatusExecutada,
  normalizeTipoOs,
  normalizeToaLogin,
  statusNotaToa,
  valorPrecoOs,
  valorReceitaFaturadaOs,
  type ToaChamadoProcessado,
  type ToaResumoTecnico,
} from "@/lib/toa-store";
import {
  formatarIntervaloSemanaLabel,
  type KpiSemanaFiltro,
} from "@/lib/kpi-semana";

type KpiFiltroPeriodo = {
  ano: number | null;
  mes: number | null;
  dia: number | null;
  semana?: KpiSemanaFiltro;
};

type TecnicoSelecionado = {
  login: string;
  nome: string;
};

type TipoDetalheNotas = "produtivas" | "perdas";

/**
 * 1 linha = 1 O.S. (toa_importacoes).
 * Ordem mental alinhada à UI de detalhamento (Receita só existe na exibição).
 */
type ToaOsDetalheLinha = {
  data: string;
  idToa: string;
  tecnico: string;
  tipoAtividade: string;
  codBaixa: number | null;
  contrato: string;
  numeroWo: string;
  numeroOs: string;
  tipoOs: string;
  statusOs: string;
  endereco: string;
  bairro: string;
  inicioFim: string;
  duracao: string;
  categoriasCapacidade: string;
  statusNota: "Produtiva" | "Improdutiva";
  /** Calculada no front (catálogo) — não persiste em toa_importacoes. */
  receita: number;
  /** true se a O.S. entra na receita projetada (não bundlada). */
  contaReceitaFaturada: boolean;
};

export type ModoFaturamentoKpi =
  | "ONLY_ANALITICO"
  | "ONLY_TOA"
  | "COMPARISON_MODE"
  | "vazio"
  | "indefinido";

type KpiDesempenhoTecnicosProps = {
  tecnicos: KpiTopTecnico[];
  tecnicosEquipe: TecnicoProfile[];
  /** @deprecated Preferir recálculo interno via chamados + precosOs. Mantido por compat. */
  resumoToa?: Record<string, ToaResumoTecnico>;
  /** Linhas flat do banco (1 = 1 O.S.) — fonte dos cards de volume TOA. */
  toaOsRows?: ToaImportacaoRow[];
  chamadosProcessados: ToaChamadoProcessado[];
  filtroPeriodo: KpiFiltroPeriodo;
  demitidosKeys: Set<string>;
  precosOs: PrecosOsMap;
  onSalvarPrecos: (precos: PrecoOs[]) => Promise<void>;
  /** Força regravação do catálogo calibrado no Supabase e invalida cache local. */
  onRecalcularBase?: () => Promise<void>;
  /** Descobre moda no Analítico, estima zeros por semelhança e atualiza precos_os. */
  onAtualizarCatalogoViaHistorico?: () => Promise<{
    atualizados: number;
    estimados: number;
  }>;
  /** Fonte de dados: disponibilidade Analítico / TOA no mês. */
  modoFaturamento?: ModoFaturamentoKpi;
  analiticoRows?: AnaliticoHistoricoRow[];
};

type AbaDetalhamento = "analitico" | "toa" | "simular-fatura";

type FaturaSimuladaLinha = {
  contrato: string;
  numeroOs: string;
  tipoOs: string;
  codBaixa: number | null;
  dataBaixa: string;
  valorServico: number;
};

type FiltroTop = "Geral" | "Top 10" | "Top 5" | "Top 3";

type SortKey = "statusNota" | "receita" | "data";

type SortConfig = {
  key: SortKey | null;
  direction: "asc" | "desc";
};

type TecnicoDesempenho = {
  id_tecnico: string;
  nome: string;
  primeiroNome: string;
  baixaMisc: number;
  mediaMaterialPorNota: number;
  totalNotasFeitas: number;
  notasProdutivas: number;
  notasImprodutivas: number;
  osProdutivas: number;
  osImprodutivas: number;
  aproveitamento: number;
  mediaAproveitamento: string;
  receita: number;
  receitaPerda: number;
  freqRelativa: string;
  freqAbsoluta: string;
};

type ChartBarPayload = {
  login: string;
  nome: string;
  nomeCompleto: string;
  notasProdutivas: number;
  notasImprodutivas: number;
  receitaGanha: number;
  receitaPerda: number;
  aproveitamento: number;
  pareto: number;
};

const MESES_LABEL = [
  { value: 1, label: "Janeiro" },
  { value: 2, label: "Fevereiro" },
  { value: 3, label: "Março" },
  { value: 4, label: "Abril" },
  { value: 5, label: "Maio" },
  { value: 6, label: "Junho" },
  { value: 7, label: "Julho" },
  { value: 8, label: "Agosto" },
  { value: 9, label: "Setembro" },
  { value: 10, label: "Outubro" },
  { value: 11, label: "Novembro" },
  { value: 12, label: "Dezembro" },
] as const;

function mesAbreviado(mes: number): string {
  const label =
    MESES_LABEL.find((m) => m.value === mes)?.label ?? String(mes);
  return label.slice(0, 3);
}

/** Ex.: "Dez 2025 - Jun 2026" a partir de DH_BAIXA do Analítico. */
function formatPeriodoAnaliticoCards(
  rows: AnaliticoHistoricoRow[],
): string {
  let minYm: number | null = null;
  let maxYm: number | null = null;

  for (const row of rows) {
    const parts = parseDhBaixaAnoMes(row.dh_baixa);
    if (!parts) continue;
    const ym = parts.ano * 100 + parts.mes;
    if (minYm === null || ym < minYm) minYm = ym;
    if (maxYm === null || ym > maxYm) maxYm = ym;
  }

  if (minYm === null || maxYm === null) return "";

  const fmt = (ym: number) =>
    `${mesAbreviado(ym % 100)} ${Math.floor(ym / 100)}`;

  if (minYm === maxYm) return fmt(minYm);
  return `${fmt(minYm)} - ${fmt(maxYm)}`;
}

function formatReceita(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

/** Ordem de exportação = ordem visual do detalhamento (Receita só na UI/Excel). */
const COLUNAS_EXCEL_OS_TOA = [
  "Data",
  "IdTOA",
  "Técnico",
  "Tipo de Atividade",
  "Cod Baixa",
  "Contrato",
  "WO",
  "OS",
  "Tipo OS",
  "Status",
  "Endereço",
  "Bairro",
  "Início - Fim",
  "Duração",
  "Categorias da Capacidade",
  "Status da nota",
  "Receita",
] as const;

const TH_OS_TOA =
  "px-1 py-1.5 text-left text-[11px] font-semibold leading-tight text-muted-foreground";
const TD_OS_TOA =
  "max-w-0 truncate whitespace-nowrap px-1 py-1 text-[11px] leading-tight text-gray-700";

function ColgroupOsToa() {
  return (
    <colgroup>
      <col style={{ width: "4%" }} />
      <col style={{ width: "4.5%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "6.5%" }} />
      <col style={{ width: "3.5%" }} />
      <col style={{ width: "5%" }} />
      <col style={{ width: "4.5%" }} />
      <col style={{ width: "4.5%" }} />
      <col style={{ width: "7%" }} />
      <col style={{ width: "5%" }} />
      <col style={{ width: "12%" }} />
      <col style={{ width: "5%" }} />
      <col style={{ width: "6%" }} />
      <col style={{ width: "3.5%" }} />
      <col style={{ width: "8%" }} />
      <col style={{ width: "6%" }} />
      <col style={{ width: "7%" }} />
    </colgroup>
  );
}

function formatDataBr(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate;
  return `${dia}/${mes}/${ano}`;
}

const DIAS_SEMANA_PT = [
  "Domingo",
  "Segunda-Feira",
  "Terça-Feira",
  "Quarta-Feira",
  "Quinta-Feira",
  "Sexta-Feira",
  "Sábado",
] as const;

/** Ex.: 03/08 (03/08/2026 - Quarta-Feira) */
function formatTooltipDataComDiaSemana(isoDate: string): string {
  const [anoStr, mesStr, diaStr] = isoDate.split("-");
  const ano = Number(anoStr);
  const mes = Number(mesStr);
  const dia = Number(diaStr);
  if (!ano || !mes || !dia) return formatDataBr(isoDate);

  const data = new Date(ano, mes - 1, dia);
  const dd = String(dia).padStart(2, "0");
  const mm = String(mes).padStart(2, "0");
  const diaSemana = DIAS_SEMANA_PT[data.getDay()] ?? "";
  return `${dd}/${mm} (${dd}/${mm}/${ano} - ${diaSemana})`;
}

function descricaoPeriodoLocal(filtro: KpiFiltroPeriodo): string {
  if (filtro.mes === null || filtro.ano === null) {
    return "Histórico completo";
  }
  const mesLabel =
    MESES_LABEL.find((m) => m.value === filtro.mes)?.label ?? String(filtro.mes);
  if (filtro.dia !== null) {
    return `${String(filtro.dia).padStart(2, "0")}/${String(filtro.mes).padStart(2, "0")}/${filtro.ano}`;
  }
  if (filtro.semana && filtro.semana !== "Todos") {
    const intervalo = formatarIntervaloSemanaLabel(
      filtro.semana,
      filtro.ano,
      filtro.mes,
    );
    if (intervalo) {
      return `${mesLabel} ${filtro.ano} - ${filtro.semana} (${intervalo})`;
    }
  }
  return `${mesLabel} de ${filtro.ano}`;
}

/**
 * Varre data_toa e devolve o range mês/ano (ex.: "Junho 2026 - Agosto 2026").
 * Retorna null se não houver datas válidas.
 */
export function formatarRangeMesAnoToa(
  rows: Array<{ data_toa: string }>,
): string | null {
  let minIso: string | null = null;
  let maxIso: string | null = null;

  for (const row of rows) {
    const iso = String(row.data_toa ?? "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) continue;
    if (!minIso || iso < minIso) minIso = iso;
    if (!maxIso || iso > maxIso) maxIso = iso;
  }

  if (!minIso || !maxIso) return null;

  const formatMesAno = (iso: string): string => {
    const ano = Number(iso.slice(0, 4));
    const mes = Number(iso.slice(5, 7));
    const mesLabel =
      MESES_LABEL.find((m) => m.value === mes)?.label ?? String(mes);
    return `${mesLabel} ${ano}`;
  };

  const inicio = formatMesAno(minIso);
  const fim = formatMesAno(maxIso);
  if (inicio === fim) return inicio;
  return `${inicio} - ${fim}`;
}

function limiteDoFiltro(filtro: FiltroTop): number | null {
  switch (filtro) {
    case "Top 10":
      return 10;
    case "Top 5":
      return 5;
    case "Top 3":
      return 3;
    default:
      return null;
  }
}

function formatPct(valor: number): string {
  return `${valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

const GRID_HISTORICO =
  "grid grid-cols-[minmax(90px,1fr)_minmax(80px,0.9fr)_minmax(70px,0.7fr)_minmax(140px,1.4fr)_minmax(70px,0.7fr)_minmax(110px,1.1fr)_minmax(90px,1fr)_minmax(80px,0.8fr)_minmax(90px,0.9fr)_minmax(100px,1fr)_minmax(60px,0.6fr)_minmax(100px,1fr)] gap-2";

function TabelaDetalhamentoAnalitico({
  rows,
}: {
  rows: AnaliticoHistoricoRow[];
}) {
  const [busca, setBusca] = useState("");
  const resumo = useMemo(() => resumirAnaliticoHistorico(rows), [rows]);

  const linhas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const base = [...rows].sort((a, b) => {
      const da = a.dh_baixa || "";
      const db = b.dh_baixa || "";
      if (da !== db) return da.localeCompare(db);
      return (a.cd_os || "").localeCompare(b.cd_os || "", "pt-BR");
    });
    if (!termo) return base;
    return base.filter((r) => {
      return (
        (r.nr_contrato || "").toLowerCase().includes(termo) ||
        (r.cd_os || "").toLowerCase().includes(termo) ||
        (r.ds_tipo_os || "").toLowerCase().includes(termo) ||
        (r.tipo_os_consolid || "").toLowerCase().includes(termo) ||
        (r.terminal || "").toLowerCase().includes(termo) ||
        String(r.id_tipo_os ?? "").includes(termo) ||
        String(r.cd_baixa ?? "").includes(termo)
      );
    });
  }, [rows, busca]);

  return (
    <>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <input
          type="search"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar contrato, CD_OS, tipo, terminal..."
          aria-label="Buscar no Analítico"
          className="w-full rounded-md border border-gray-300 bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 md:w-80"
        />
      </div>

      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma nota do Analítico com DH_BAIXA no período. Importe o
          consolidado em Administração → Importação.
        </p>
      ) : linhas.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhum resultado para “{busca.trim()}”.
        </p>
      ) : (
        <div className="w-full overflow-x-auto">
          <div
            className={`${GRID_HISTORICO} min-w-[1280px] items-end border-b border-border px-2 py-2 text-[11px] font-semibold leading-tight text-muted-foreground`}
          >
            <span className="text-left">NR_CONTRATO</span>
            <span className="text-center">CD_OS</span>
            <span className="text-center">ID_TIPO_OS</span>
            <span className="text-left">DS_TIPO_OS</span>
            <span className="text-center">CD_BAIXA</span>
            <span className="text-left">TIPO_OS_CONSOLID</span>
            <span className="text-center">TERMINAL</span>
            <span className="text-center">TIPO_TERM</span>
            <span className="text-center">DH_BAIXA</span>
            <span className="text-left">TIPO_EDIFICACAO</span>
            <span className="text-center">QTDE</span>
            <span className="text-right">VALOR_SERVICO</span>
          </div>
          <div className="max-h-[28rem] overflow-y-auto">
            {linhas.map((row, idx) => (
              <div
                key={row.id ?? `${row.cd_os}-${row.dh_baixa}-${idx}`}
                className={`${GRID_HISTORICO} min-w-[1280px] items-center border-b border-border/60 px-2 py-2 text-xs`}
              >
                <span className="tabular-nums">{row.nr_contrato || "—"}</span>
                <span className="text-center tabular-nums">
                  {row.cd_os || "—"}
                </span>
                <span className="text-center tabular-nums">
                  {row.id_tipo_os ?? "—"}
                </span>
                <span className="truncate" title={row.ds_tipo_os || undefined}>
                  {row.ds_tipo_os || "—"}
                </span>
                <span className="text-center tabular-nums">
                  {row.cd_baixa ?? "—"}
                </span>
                <span
                  className="truncate"
                  title={row.tipo_os_consolid || undefined}
                >
                  {row.tipo_os_consolid || "—"}
                </span>
                <span className="text-center tabular-nums">
                  {row.terminal || "—"}
                </span>
                <span className="text-center">{row.tipo_term || "—"}</span>
                <span className="text-center tabular-nums">
                  {formatDhBaixaDisplay(row.dh_baixa)}
                </span>
                <span
                  className="truncate"
                  title={row.tipo_edificacao || undefined}
                >
                  {row.tipo_edificacao || "—"}
                </span>
                <span className="text-center tabular-nums">
                  {row.qtde == null
                    ? "—"
                    : formatQuantidade(Number(row.qtde))}
                </span>
                <span className="text-right font-medium tabular-nums text-green-700">
                  {formatReceita(Number(row.valor_servico) || 0)}
                </span>
              </div>
            ))}
          </div>
          <div
            className={`${GRID_HISTORICO} min-w-[1280px] items-center border-t border-border bg-muted/40 px-2 py-3 text-xs font-semibold`}
          >
            <span>Total ({formatQuantidade(resumo.totalNotas)})</span>
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
            <span className="text-right tabular-nums text-green-700">
              {formatReceita(resumo.receitaTotal)}
            </span>
          </div>
        </div>
      )}
    </>
  );
}

/** Painel somente Analítico: cards + detalhamento filtrado por DH_BAIXA. */
function KpiDesempenhoHistoricoAnalitico({
  rows,
  filtroPeriodo,
}: {
  rows: AnaliticoHistoricoRow[];
  filtroPeriodo: KpiFiltroPeriodo;
}) {
  const rowsFiltradas = useMemo(
    () => filtrarAnaliticoPorDhBaixa(rows, filtroPeriodo),
    [rows, filtroPeriodo],
  );
  const resumo = useMemo(
    () => resumirAnaliticoHistorico(rowsFiltradas),
    [rowsFiltradas],
  );
  const periodoLabel = useMemo(
    () => descricaoPeriodoLocal(filtroPeriodo),
    [filtroPeriodo],
  );

  return (
    <div className="w-full space-y-6">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50/80 px-4 py-3 text-sm text-emerald-900">
        Modo Analítico Claro — {periodoLabel}. Valores reais validados/pagos
        (filtro por DH_BAIXA).
      </div>

      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
            <span className="text-sm font-medium text-muted-foreground">
              Total de notas
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-gray-900">
            {formatQuantidade(resumo.totalNotas)}
          </div>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-5">
          <div className="flex items-center gap-2">
            <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
            <span className="text-sm font-medium text-muted-foreground">
              Receita (Analítico)
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-green-600">
            {formatReceita(resumo.receitaTotal)}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Users className="h-4 w-4 text-primary" />
            Detalhamento Analítico
          </h2>
        </div>
        <TabelaDetalhamentoAnalitico rows={rowsFiltradas} />
      </div>
    </div>
  );
}

export function KpiDesempenhoTecnicos({
  tecnicos,
  tecnicosEquipe,
  resumoToa: _resumoToaProp,
  toaOsRows = [],
  chamadosProcessados,
  filtroPeriodo,
  demitidosKeys,
  precosOs,
  onSalvarPrecos,
  onRecalcularBase,
  onAtualizarCatalogoViaHistorico,
  modoFaturamento = "indefinido",
  analiticoRows = [],
}: KpiDesempenhoTecnicosProps) {
  // Histórico geral (Ano/Mês = Todos) ou ano sem mês → renderiza painel
  // quando houver TOA e/ou Analítico, em vez de bloquear com empty state.
  const historicoGeral =
    filtroPeriodo.ano === null && filtroPeriodo.mes === null;
  const anoSemMes =
    filtroPeriodo.ano !== null && filtroPeriodo.mes === null;
  const semDadosFaturamento =
    toaOsRows.length === 0 && analiticoRows.length === 0;

  if (
    modoFaturamento === "indefinido" &&
    !historicoGeral &&
    !anoSemMes
  ) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        Selecione <strong>mês</strong> e <strong>ano</strong> no filtro para
        carregar o faturamento. O modo (Analítico, TOA ou comparação) depende
        dos dados importados no período.
      </p>
    );
  }

  if (
    modoFaturamento === "vazio" ||
    (modoFaturamento === "indefinido" &&
      (historicoGeral || anoSemMes) &&
      semDadosFaturamento)
  ) {
    return (
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
        Nenhum dado de <strong>Analítico</strong> nem de <strong>TOA</strong>{" "}
        para o período. Importe em Administração → Importação.
      </p>
    );
  }

  if (modoFaturamento === "ONLY_ANALITICO") {
    return (
      <KpiDesempenhoHistoricoAnalitico
        rows={analiticoRows}
        filtroPeriodo={filtroPeriodo}
      />
    );
  }

  return (
    <KpiDesempenhoProjecaoToa
      tecnicos={tecnicos}
      tecnicosEquipe={tecnicosEquipe}
      resumoToa={_resumoToaProp}
      toaOsRows={toaOsRows}
      chamadosProcessados={chamadosProcessados}
      filtroPeriodo={filtroPeriodo}
      demitidosKeys={demitidosKeys}
      precosOs={precosOs}
      onSalvarPrecos={onSalvarPrecos}
      onRecalcularBase={onRecalcularBase}
      onAtualizarCatalogoViaHistorico={onAtualizarCatalogoViaHistorico}
      modoFaturamento={
        modoFaturamento === "COMPARISON_MODE" ? "COMPARISON_MODE" : "ONLY_TOA"
      }
      analiticoRows={analiticoRows}
    />
  );
}

function KpiDesempenhoProjecaoToa({
  tecnicos,
  tecnicosEquipe,
  resumoToa: _resumoToaProp,
  toaOsRows = [],
  chamadosProcessados,
  filtroPeriodo,
  demitidosKeys,
  precosOs,
  onSalvarPrecos,
  onRecalcularBase,
  onAtualizarCatalogoViaHistorico,
  modoFaturamento = "ONLY_TOA",
  analiticoRows = [],
}: Omit<KpiDesempenhoTecnicosProps, "modoFaturamento"> & {
  modoFaturamento: "ONLY_TOA" | "COMPARISON_MODE";
}) {
  const isComparacao = modoFaturamento === "COMPARISON_MODE";
  const historicoGeral =
    filtroPeriodo.ano === null && filtroPeriodo.mes === null;
  /** Macro: Analítico + TOA no histórico geral (ou comparação mensal). */
  const mostrarCardsAnaliticoEToa =
    isComparacao || (historicoGeral && analiticoRows.length > 0);
  const [activeTab, setActiveTab] = useState<AbaDetalhamento>("toa");

  useEffect(() => {
    setActiveTab("toa");
  }, [mostrarCardsAnaliticoEToa, filtroPeriodo.ano, filtroPeriodo.mes]);

  useEffect(() => {
    if (activeTab === "analitico" && !mostrarCardsAnaliticoEToa) {
      setActiveTab("toa");
    }
  }, [activeTab, mostrarCardsAnaliticoEToa]);

  const analiticoFiltrado = useMemo(
    () => filtrarAnaliticoPorDhBaixa(analiticoRows, filtroPeriodo),
    [analiticoRows, filtroPeriodo],
  );
  const resumoAnalitico = useMemo(
    () => resumirAnaliticoHistorico(analiticoFiltrado),
    [analiticoFiltrado],
  );
  const periodoAnaliticoLabel = useMemo(
    () => formatPeriodoAnaliticoCards(analiticoFiltrado),
    [analiticoFiltrado],
  );
  const [filtroTop, setFiltroTop] = useState<FiltroTop>("Geral");
  const [buscaTecnico, setBuscaTecnico] = useState("");
  const percentualAumento = usePercentualAumento();
  const [percentualAumentoTexto, setPercentualAumentoTexto] = useState(() =>
    String(getPercentualAumento()),
  );
  const [recalculandoBase, setRecalculandoBase] = useState(false);
  const [atualizandoCatalogoHistorico, setAtualizandoCatalogoHistorico] =
    useState(false);
  const [tecnicoSelecionado, setTecnicoSelecionado] =
    useState<TecnicoSelecionado | null>(null);
  const [detalheNotasTipo, setDetalheNotasTipo] =
    useState<TipoDetalheNotas | null>(null);
  /** Aba do detalhamento inferior TOA (produtivas / perdas). */
  const [abaNotasToa, setAbaNotasToa] =
    useState<TipoDetalheNotas>("produtivas");
  const [buscaDetalheNotas, setBuscaDetalheNotas] = useState("");
  const [filtroLocalAno, setFiltroLocalAno] = useState<number | null>(
    filtroPeriodo.ano,
  );
  const [filtroLocalMes, setFiltroLocalMes] = useState<number | null>(
    filtroPeriodo.mes,
  );
  const [filtroLocalDia, setFiltroLocalDia] = useState<number | null>(
    filtroPeriodo.dia,
  );
  const [buscaWoContrato, setBuscaWoContrato] = useState("");
  const [filtroTipoOsModal, setFiltroTipoOsModal] = useState("todos");
  const [filtroCodBaixaModal, setFiltroCodBaixaModal] = useState("todos");
  const [filtroStatusModal, setFiltroStatusModal] = useState("todos");
  const [sortConfig, setSortConfig] = useState<SortConfig>({
    key: null,
    direction: "asc",
  });
  const [isTabelaPrecosOpen, setIsTabelaPrecosOpen] = useState(false);
  const [buscaTipoOs, setBuscaTipoOs] = useState("");
  const [valoresEditados, setValoresEditados] = useState<Record<string, string>>(
    {},
  );
  const [tiposResumoEditados, setTiposResumoEditados] = useState<
    Record<string, string>
  >({});
  const [salvandoPrecos, setSalvandoPrecos] = useState(false);

  const fecharTabelaPrecos = () => {
    setIsTabelaPrecosOpen(false);
    setBuscaTipoOs("");
    setValoresEditados({});
    setTiposResumoEditados({});
  };

  const abrirDetalheTecnico = (login: string, nome: string) => {
    setFiltroLocalAno(filtroPeriodo.ano);
    setFiltroLocalMes(filtroPeriodo.mes);
    setFiltroLocalDia(filtroPeriodo.dia);
    setBuscaWoContrato("");
    setFiltroTipoOsModal("todos");
    setFiltroCodBaixaModal("todos");
    setFiltroStatusModal("todos");
    setTecnicoSelecionado({
      login: normalizeToaLogin(login),
      nome,
    });
  };

  const abrirDetalheNotas = (tipo: TipoDetalheNotas) => {
    setBuscaDetalheNotas("");
    setBuscaTecnico("");
    setAbaNotasToa(tipo);
    setActiveTab("toa");
    setDetalheNotasTipo(tipo);
  };

  const fecharDetalheNotas = () => {
    setDetalheNotasTipo(null);
    setBuscaDetalheNotas("");
  };

  const filtroLocalPeriodo = useMemo(
    () => ({
      ano: filtroLocalAno,
      mes: filtroLocalMes,
      dia: filtroLocalDia,
    }),
    [filtroLocalAno, filtroLocalMes, filtroLocalDia],
  );

  const periodoLabelLocal = useMemo(
    () => descricaoPeriodoLocal(filtroLocalPeriodo),
    [filtroLocalPeriodo],
  );

  /**
   * Fonte única de verdade: mesmas regras preditivas do card, tabela e drill-down.
   * Contagem de Nota = WO única (não Contrato).
   * Cancelado/suspenso ficam no banco, mas fora do KPI.
   */
  const chamadosToaPeriodo = useMemo(
    () =>
      dedupeChamadosPorNumeroWo(
        filtrarChamadosToa(chamadosProcessados, filtroPeriodo),
      ).filter((c) => isStatusAtividadeContabilizavel(c.statusAtividade)),
    [chamadosProcessados, filtroPeriodo],
  );

  /** Linhas flat (1 O.S.) no período — cards de volume usam status_* do banco. */
  const toaOsPeriodo = useMemo(
    () =>
      filtrarToaOsContabilizaveis(
        filtrarToaOsRows(toaOsRows, filtroPeriodo),
      ),
    [toaOsRows, filtroPeriodo],
  );

  /** Range dinâmico a partir das data_toa do dataset (ex.: "Junho 2026 - Agosto 2026"). */
  const rangePeriodoToa = useMemo(
    () => formatarRangeMesAnoToa(toaOsPeriodo),
    [toaOsPeriodo],
  );

  const kpisToaFlat = useMemo(
    () => agregarKpisToaFlat(toaOsPeriodo),
    [toaOsPeriodo],
  );

  const resumoToa = useMemo(() => {
    const agregado = agregarChamadosToa(chamadosToaPeriodo, precosOs);
    const flatResumo = kpisToaFlat.resumoPorTecnico;
    const merged: Record<string, ToaResumoTecnico> = {};
    const logins = new Set([
      ...Object.keys(agregado.resumoPorTecnico),
      ...Object.keys(flatResumo),
    ]);
    for (const login of logins) {
      const receita = agregado.resumoPorTecnico[login];
      const volume = flatResumo[login];
      merged[login] = {
        totalNotasFeitas:
          volume?.totalNotasFeitas ?? receita?.totalNotasFeitas ?? 0,
        notasProdutivas:
          volume?.notasProdutivas ?? receita?.notasProdutivas ?? 0,
        notasImprodutivas:
          volume?.notasImprodutivas ?? receita?.notasImprodutivas ?? 0,
        osProdutivas: volume?.osProdutivas ?? receita?.osProdutivas ?? 0,
        osImprodutivas: volume?.osImprodutivas ?? receita?.osImprodutivas ?? 0,
        receitaFaturada: receita?.receitaFaturada ?? 0,
        receitaPerda: receita?.receitaPerda ?? 0,
      };
    }
    return merged;
  }, [chamadosToaPeriodo, precosOs, kpisToaFlat]);

  const enriquecidos = useMemo<TecnicoDesempenho[]>(() => {
    const kpisPorLogin = new Map(
      tecnicos.map((tecnico) => [normalizeToaLogin(tecnico.id_tecnico), tecnico]),
    );
    const nomesPorLogin = new Map<string, string>();

    for (const row of toaOsPeriodo) {
      const login = normalizeToaLogin(row.login_tecnico);
      const nome = row.nome_tecnico?.trim();
      if (login && nome && !nomesPorLogin.has(login)) {
        nomesPorLogin.set(login, nome);
      }
    }

    for (const chamado of chamadosToaPeriodo) {
      const login = normalizeToaLogin(chamado.login);
      const nome = chamado.nomeTecnico?.trim();
      if (login && nome && !nomesPorLogin.has(login)) {
        nomesPorLogin.set(login, nome);
      }
    }

    for (const tecnico of tecnicosEquipe) {
      for (const identificador of [
        tecnico.identificacao,
        tecnico.login,
        tecnico.id,
      ]) {
        if (identificador?.trim()) {
          const key = normalizeToaLogin(identificador);
          if (!nomesPorLogin.has(key)) {
            nomesPorLogin.set(key, tecnico.nome);
          }
        }
      }
    }

    const base = Object.entries(resumoToa).map(([login, resumo]) => {
      const loginNormalizado = normalizeToaLogin(login);
      const tecnicoKpi = kpisPorLogin.get(loginNormalizado);
      const nome =
        nomesPorLogin.get(loginNormalizado) ||
        tecnicoKpi?.nome_tecnico?.trim() ||
        loginNormalizado;
      const totalOs = resumo.osProdutivas + resumo.osImprodutivas;
      const aproveitamento =
        totalOs > 0 ? (resumo.osProdutivas / totalOs) * 100 : 0;
      const baixaMisc = tecnicoKpi?.total ?? 0;
      const totalNotasFeitas = resumo.totalNotasFeitas;
      const mediaMaterialPorNota =
        totalNotasFeitas > 0 ? baixaMisc / totalNotasFeitas : 0;

      return {
        id_tecnico: loginNormalizado,
        nome,
        primeiroNome: nome.trim().split(/\s+/)[0] ?? nome,
        baixaMisc,
        mediaMaterialPorNota,
        totalNotasFeitas,
        notasProdutivas: resumo.notasProdutivas,
        notasImprodutivas: resumo.notasImprodutivas,
        osProdutivas: resumo.osProdutivas,
        osImprodutivas: resumo.osImprodutivas,
        aproveitamento,
        mediaAproveitamento: formatPct(aproveitamento),
        receita: resumo.receitaFaturada,
        receitaPerda: resumo.receitaPerda,
        freqRelativa: "",
        freqAbsoluta: "",
      };
    });

    const totalVolume = base.reduce(
      (total, tecnico) => total + tecnico.totalNotasFeitas,
      0,
    );
    const ordenados = [...base].sort(
      (a, b) => b.notasProdutivas - a.notasProdutivas,
    );
    let acumulado = 0;

    return ordenados.map((tecnico) => {
      acumulado += tecnico.totalNotasFeitas;
      return {
        ...tecnico,
        freqRelativa: formatPct(
          totalVolume > 0
            ? (tecnico.totalNotasFeitas / totalVolume) * 100
            : 0,
        ),
        freqAbsoluta: formatPct(
          totalVolume > 0 ? (acumulado / totalVolume) * 100 : 0,
        ),
      };
    });
  }, [resumoToa, tecnicos, tecnicosEquipe, toaOsPeriodo, chamadosToaPeriodo]);

  const fatorProjecao = 1 + percentualAumento / 100;

  const atualizarPercentualAumento = (valor: string) => {
    setPercentualAumentoTexto(valor);
    setPercentualAumento(valor.trim() === "" ? 0 : valor);
  };
  const requestSort = (key: SortKey) => {
    setSortConfig((prev) => {
      if (prev.key === key && prev.direction === "asc") {
        return { key, direction: "desc" };
      }
      return { key, direction: "asc" };
    });
  };

  const iconeOrdenacao = (key: SortKey) => {
    if (sortConfig.key !== key) return null;
    return sortConfig.direction === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 shrink-0" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 shrink-0" />
    );
  };

  const cabecalhoOrdenavel = (label: string, key: SortKey) => (
    <button
      type="button"
      onClick={() => requestSort(key)}
      className="inline-flex w-full cursor-pointer select-none items-center justify-center gap-1 rounded-md px-1 py-0.5 text-center leading-tight hover:bg-gray-100"
    >
      <span>{label}</span>
      {iconeOrdenacao(key)}
    </button>
  );

  const {
    totalNotasProdutivas,
    totalPerdaNotas,
    receitaTotal,
    totalNotasToa,
  } = useMemo(() => {
    const agregado = agregarChamadosToa(chamadosToaPeriodo, precosOs);
    const usarFlat = toaOsPeriodo.length > 0;
    return {
      totalNotasProdutivas: usarFlat
        ? kpisToaFlat.notasProdutivas
        : agregado.totalNotasProdutivas,
      totalPerdaNotas: usarFlat
        ? kpisToaFlat.notasImprodutivas
        : agregado.totalNotasImprodutivas,
      receitaTotal: agregado.receitaFaturadaTotal * fatorProjecao,
      totalNotasToa: usarFlat
        ? kpisToaFlat.totalNotas
        : agregado.totalNotasFeitas,
    };
  }, [chamadosToaPeriodo, precosOs, fatorProjecao, kpisToaFlat, toaOsPeriodo.length]);

  const tituloVisaoGeral = useMemo(() => {
    const { ano, mes, dia, semana } = filtroPeriodo;
    if (
      ano !== null &&
      mes !== null &&
      dia === null &&
      semana &&
      semana !== "Todos"
    ) {
      const mesLabel =
        MESES_LABEL.find((m) => m.value === mes)?.label ?? String(mes);
      const intervalo = formatarIntervaloSemanaLabel(semana, ano, mes);
      if (intervalo) {
        return `Visão Geral de Desempenho — ${mesLabel} ${ano} - ${semana} (${intervalo})`;
      }
    }
    if (rangePeriodoToa) {
      return `Visão Geral de Desempenho — ${rangePeriodoToa}`;
    }
    return "Visão Geral de Desempenho";
  }, [filtroPeriodo, rangePeriodoToa]);

  const tiposOsImportados = useMemo(() => {
    const map = new Map<
      string,
      {
        chave: string;
        tipo: string;
        tipoAtividade: string;
        valor: number;
        isEstimado: boolean;
      }
    >();

    for (const entrada of ATIVIDADES_TOA_CATALOGO) {
      const chave = normalizeTipoOs(entrada.tipoAtividade);
      const preco = precosOs[chave];
      map.set(chave, {
        chave,
        tipo: preco?.tipo?.trim() || entrada.tipo,
        tipoAtividade: entrada.tipoAtividade,
        valor: Number(preco?.valor ?? entrada.valor) || 0,
        isEstimado: Boolean(preco?.isEstimado),
      });
    }

    for (const chamado of chamadosProcessados) {
      for (const ordem of chamado.ordensDeServico) {
        const tipoOs = ordem.tipoOs?.trim();
        if (!tipoOs) continue;

        const chave = normalizeTipoOs(tipoOs);
        if (map.has(chave)) continue;

        const preco = precosOs[chave];
        map.set(chave, {
          chave,
          tipo: preco?.tipo ?? "",
          tipoAtividade: tipoOs,
          valor: Number(preco?.valor) || 0,
          isEstimado: Boolean(preco?.isEstimado),
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      const byTipo = a.tipo.localeCompare(b.tipo, "pt-BR", {
        sensitivity: "base",
      });
      if (byTipo !== 0) return byTipo;
      return a.tipoAtividade.localeCompare(b.tipoAtividade, "pt-BR", {
        sensitivity: "base",
      });
    });
  }, [chamadosProcessados, precosOs]);

  const tiposOsFiltrados = useMemo(() => {
    const termo = buscaTipoOs.trim().toLowerCase();
    if (!termo) return tiposOsImportados;
    return tiposOsImportados.filter(
      ({ tipo, tipoAtividade }) =>
        tipo.toLowerCase().includes(termo) ||
        tipoAtividade.toLowerCase().includes(termo),
    );
  }, [buscaTipoOs, tiposOsImportados]);

  useEffect(() => {
    if (!isTabelaPrecosOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        fecharTabelaPrecos();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isTabelaPrecosOpen]);

  useEffect(() => {
    if (!detalheNotasTipo) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        fecharDetalheNotas();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [detalheNotasTipo]);

  useEffect(() => {
    if (!isTabelaPrecosOpen) return;

    // Sempre realinha drafts ao catálogo/preços atuais (evita modal com valores antigos).
    setValoresEditados(
      Object.fromEntries(
        tiposOsImportados.map(({ chave, valor }) => [
          chave,
          valor.toFixed(2),
        ]),
      ),
    );
    setTiposResumoEditados(
      Object.fromEntries(
        tiposOsImportados.map(({ chave, tipo }) => [chave, tipo]),
      ),
    );
  }, [isTabelaPrecosOpen, tiposOsImportados]);

  const abrirTabelaPrecos = () => {
    setBuscaTipoOs("");
    setValoresEditados(
      Object.fromEntries(
        tiposOsImportados.map(({ chave, valor }) => [
          chave,
          valor.toFixed(2),
        ]),
      ),
    );
    setTiposResumoEditados(
      Object.fromEntries(
        tiposOsImportados.map(({ chave, tipo }) => [chave, tipo]),
      ),
    );
    setIsTabelaPrecosOpen(true);
  };

  const recalcularBase = async () => {
    if (!onRecalcularBase || recalculandoBase) return;
    setRecalculandoBase(true);
    try {
      await onRecalcularBase();
      toast.success(
        "Base de preços recalculada. Receita projetada atualizada em todos os cards.",
      );
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível recalcular a base de preços.");
    } finally {
      setRecalculandoBase(false);
    }
  };

  const atualizarCatalogoViaHistorico = async () => {
    if (!onAtualizarCatalogoViaHistorico || atualizandoCatalogoHistorico) return;
    setAtualizandoCatalogoHistorico(true);
    try {
      const { atualizados, estimados } = await onAtualizarCatalogoViaHistorico();
      if (atualizados === 0 && estimados === 0) {
        toast.success(
          "Nenhum preço novo no Analítico e nada a estimar por semelhança.",
        );
      } else {
        toast.success(
          `Catálogo: ${formatQuantidade(atualizados)} do histórico` +
            (estimados > 0
              ? ` + ${formatQuantidade(estimados)} estimado(s) por semelhança.`
              : "."),
        );
      }
    } catch (err) {
      console.error(err);
      toast.error("Não foi possível atualizar o catálogo via histórico.");
    } finally {
      setAtualizandoCatalogoHistorico(false);
    }
  };

  const salvarValoresAlterados = async () => {
    let temValorInvalido = false;
    const alterados = tiposOsImportados.flatMap(
      ({ chave, tipo, tipoAtividade, valor }) => {
        const novoValor = Number(valoresEditados[chave] ?? valor);
        const novoTipo = (tiposResumoEditados[chave] ?? tipo).trim();
        if (!Number.isFinite(novoValor) || novoValor < 0) {
          toast.error(`Informe um valor válido para ${tipoAtividade}.`);
          temValorInvalido = true;
          return [];
        }
        const valorAlterado = Math.abs(novoValor - valor) >= 0.005;
        const tipoAlterado = novoTipo !== tipo.trim();
        return valorAlterado || tipoAlterado
          ? [
              {
                tipo: novoTipo,
                tipoAtividade,
                valor: novoValor,
                isEstimado: false,
              },
            ]
          : [];
      },
    );

    if (temValorInvalido) return;

    if (alterados.length === 0) {
      toast.info("Nenhum valor foi alterado.");
      return;
    }

    setSalvandoPrecos(true);
    try {
      await onSalvarPrecos(alterados);
      toast.success("Tabela de preços atualizada.");
    } catch (err) {
      console.error("Erro ao salvar preços de OS:", err);
      toast.error("Não foi possível salvar a tabela de preços.");
    } finally {
      setSalvandoPrecos(false);
    }
  };

  const chartData = useMemo(() => {
    const comProjecao = enriquecidos.map((tecnico) => {
      const receitaGanha = tecnico.receita * fatorProjecao;
      const receitaPerda = tecnico.receitaPerda * fatorProjecao;
      const totalNotas = tecnico.notasProdutivas + tecnico.notasImprodutivas;
      const aproveitamento =
        totalNotas > 0
          ? (tecnico.notasProdutivas / totalNotas) * 100
          : 0;
      return {
        ...tecnico,
        receitaGanha,
        receitaPerda,
        aproveitamento,
      };
    });

    const ordenados = [...comProjecao].sort(
      (a, b) => b.notasProdutivas - a.notasProdutivas,
    );
    const limite = limiteDoFiltro(filtroTop);
    const fatia = limite === null ? ordenados : ordenados.slice(0, limite);
    const totalNotasFatia = fatia.reduce(
      (acc, t) => acc + t.notasProdutivas,
      0,
    );

    let notasAcumuladas = 0;
    return fatia.map((t) => {
      notasAcumuladas += t.notasProdutivas;
      const pareto =
        totalNotasFatia > 0
          ? Math.round((notasAcumuladas / totalNotasFatia) * 1000) / 10
          : 0;

      return {
        login: t.id_tecnico,
        nome: t.primeiroNome,
        nomeCompleto: t.nome,
        notasProdutivas: t.notasProdutivas,
        notasImprodutivas: t.notasImprodutivas,
        receitaGanha: t.receitaGanha,
        receitaPerda: t.receitaPerda,
        aproveitamento: t.aproveitamento,
        pareto,
      } satisfies ChartBarPayload;
    });
  }, [enriquecidos, fatorProjecao, filtroTop]);

  const selecionarTecnicoDoGrafico = (data: unknown) => {
    const raw = data as ChartBarPayload & { payload?: ChartBarPayload };
    const payload = raw?.payload ?? raw;
    if (!payload?.login) return;
    abrirDetalheTecnico(
      payload.login,
      payload.nomeCompleto || payload.nome || payload.login,
    );
  };

  const chamadosDoTecnicoBrutos = useMemo(() => {
    if (!tecnicoSelecionado) return [];
    const login = normalizeToaLogin(tecnicoSelecionado.login);
    return chamadosProcessados.filter((chamado) => chamado.login === login);
  }, [tecnicoSelecionado, chamadosProcessados]);

  const anosDisponiveisModal = useMemo(() => {
    const anos = new Set<number>();
    for (const chamado of chamadosDoTecnicoBrutos) {
      const ano = Number(chamado.data.split("-")[0]);
      if (ano) anos.add(ano);
    }
    return [...anos].sort((a, b) => b - a);
  }, [chamadosDoTecnicoBrutos]);

  const mesesDisponiveisModal = useMemo(() => {
    if (filtroLocalAno === null) return [];
    const meses = new Set<number>();
    for (const chamado of chamadosDoTecnicoBrutos) {
      const [ano, mes] = chamado.data.split("-").map(Number);
      if (ano === filtroLocalAno && mes) meses.add(mes);
    }
    return [...meses].sort((a, b) => a - b);
  }, [chamadosDoTecnicoBrutos, filtroLocalAno]);

  const osDoTecnico = useMemo(() => {
    if (!tecnicoSelecionado) return [];
    const chamadosFiltradosPeriodo = filtrarChamadosToa(
      chamadosDoTecnicoBrutos,
      filtroLocalPeriodo,
    );
    return flattenChamadosToa(chamadosFiltradosPeriodo).sort((a, b) => {
      const byDate = a.data.localeCompare(b.data);
      if (byDate !== 0) return byDate;
      return a.numeroWo.localeCompare(b.numeroWo, "pt-BR");
    });
  }, [tecnicoSelecionado, chamadosDoTecnicoBrutos, filtroLocalPeriodo]);

  const statusNotaPorWoTecnico = useMemo(() => {
    const map = new Map<string, "Produtiva" | "Improdutiva">();
    if (!tecnicoSelecionado) return map;
    const chamadosFiltradosPeriodo = filtrarChamadosToa(
      chamadosDoTecnicoBrutos,
      filtroLocalPeriodo,
    );
    for (const chamado of chamadosFiltradosPeriodo) {
      map.set(chamado.numeroWo, statusNotaToa(chamado.ordensDeServico));
    }
    return map;
  }, [tecnicoSelecionado, chamadosDoTecnicoBrutos, filtroLocalPeriodo]);

  const receitaPeriodoModal = useMemo(() => {
    return osDoTecnico.reduce((total, os) => {
      return total + valorReceitaFaturadaOs(os, precosOs);
    }, 0);
  }, [osDoTecnico, precosOs]);

  const tiposOsModal = useMemo(() => {
    const unicos = new Map<string, string>();
    for (const os of osDoTecnico) {
      const tipoOs = os.tipoOs?.trim();
      if (!tipoOs) continue;
      const chave = normalizeTipoOs(tipoOs);
      if (!unicos.has(chave)) unicos.set(chave, tipoOs);
    }
    return [...unicos.values()].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [osDoTecnico]);

  const codigosBaixaModal = useMemo(() => {
    const unicos = new Map<string, string>();
    for (const os of osDoTecnico) {
      const codigo = (os.codBaixaBruto || String(os.codBaixa) || "").trim();
      if (!codigo) continue;
      if (!unicos.has(codigo)) unicos.set(codigo, codigo);
    }
    return [...unicos.values()].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { numeric: true, sensitivity: "base" }),
    );
  }, [osDoTecnico]);

  const statusOsModal = useMemo(() => {
    const unicos = new Set<string>();
    for (const os of osDoTecnico) {
      const status = (os.status || "").trim();
      if (status) unicos.add(status);
    }
    return [...unicos].sort((a, b) =>
      a.localeCompare(b, "pt-BR", { sensitivity: "base" }),
    );
  }, [osDoTecnico]);

  const osDoTecnicoTabela = useMemo(() => {
    const termo = buscaWoContrato.trim().toLowerCase();
    const tipoFiltro =
      filtroTipoOsModal === "todos"
        ? null
        : normalizeTipoOs(filtroTipoOsModal);
    const codBaixaFiltro =
      filtroCodBaixaModal === "todos" ? null : filtroCodBaixaModal;
    const statusFiltro =
      filtroStatusModal === "todos" ? null : filtroStatusModal;

    return osDoTecnico.filter((os) => {
      if (tipoFiltro && normalizeTipoOs(os.tipoOs) !== tipoFiltro) {
        return false;
      }

      const codigo = (os.codBaixaBruto || String(os.codBaixa) || "").trim();
      if (codBaixaFiltro && codigo !== codBaixaFiltro) {
        return false;
      }

      if (statusFiltro && (os.status || "").trim() !== statusFiltro) {
        return false;
      }

      if (!termo) return true;
      const wo = (os.numeroWo || "").toLowerCase();
      const contrato = (os.contrato || "").toLowerCase();
      return wo.includes(termo) || contrato.includes(termo);
    });
  }, [
    osDoTecnico,
    buscaWoContrato,
    filtroTipoOsModal,
    filtroCodBaixaModal,
    filtroStatusModal,
  ]);

  const tendenciaPorData = useMemo(() => {
    const porData = new Map<
      string,
      { data: string; dataLabel: string; produtivas: number; improdutivas: number }
    >();

    for (const os of osDoTecnico) {
      const atual = porData.get(os.data) ?? {
        data: os.data,
        dataLabel: formatDataBr(os.data),
        produtivas: 0,
        improdutivas: 0,
      };
      if (isOsProdutiva(os)) atual.produtivas += 1;
      else if (isOsImprodutiva(os)) atual.improdutivas += 1;
      porData.set(os.data, atual);
    }

    return [...porData.values()].sort((a, b) => a.data.localeCompare(b.data));
  }, [osDoTecnico]);

  const nomesColaboradorPorLogin = useMemo(() => {
    const nomes = new Map<string, string>();

    for (const tecnico of tecnicosEquipe) {
      for (const identificador of [
        tecnico.identificacao,
        tecnico.login,
        tecnico.id,
      ]) {
        if (identificador?.trim()) {
          nomes.set(normalizeToaLogin(identificador), tecnico.nome);
        }
      }
    }

    for (const tecnico of tecnicos) {
      const login = normalizeToaLogin(tecnico.id_tecnico);
      const nome = tecnico.nome_tecnico?.trim();
      if (nome && !nomes.has(login)) {
        nomes.set(login, nome);
      }
    }

    for (const tecnico of enriquecidos) {
      if (!nomes.has(tecnico.id_tecnico)) {
        nomes.set(tecnico.id_tecnico, tecnico.nome);
      }
    }

    return nomes;
  }, [tecnicosEquipe, tecnicos, enriquecidos]);

  /** Mapa WO → set de numero_os faturáveis (regra de bundling). */
  const osFaturaveisPorWo = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const chamado of chamadosToaPeriodo) {
      const wo = chamado.numeroWo;
      const set = new Set<string>();
      for (const ordem of chamado.ordensDeServico) {
        if (isOsReceitaFaturavelNaNota(ordem, chamado.ordensDeServico)) {
          const numeroOs =
            (ordem.numeroOs || "").trim() || String(ordem.indice);
          set.add(numeroOs);
        }
      }
      map.set(wo, set);
    }
    return map;
  }, [chamadosToaPeriodo]);

  /** Detalhamento TOA: 1 linha = 1 O.S. (toa_importacoes). */
  const osDetalheToa = useMemo<ToaOsDetalheLinha[]>(() => {
    if (toaOsPeriodo.length > 0) {
      return toaOsPeriodo.map((row) => {
        const numeroOs = String(row.numero_os ?? "").trim();
        const faturaveis = osFaturaveisPorWo.get(row.numero_wo);
        const contaReceitaFaturada = faturaveis?.has(numeroOs) === true;
        const valorCatalogo = valorPrecoOs(precosOs, row.tipo_os);
        return {
          data: row.data_toa,
          idToa: normalizeToaLogin(row.login_tecnico),
          tecnico:
            row.nome_tecnico?.trim() ||
            nomesColaboradorPorLogin.get(normalizeToaLogin(row.login_tecnico)) ||
            normalizeToaLogin(row.login_tecnico),
          statusNota: row.status_nota,
          contrato: row.contrato || "",
          numeroWo: row.numero_wo || "",
          numeroOs,
          tipoOs: row.tipo_os || "",
          codBaixa: row.cod_baixa,
          statusOs: row.status_os || "",
          receita: valorCatalogo * fatorProjecao,
          contaReceitaFaturada,
          endereco: row.endereco || "",
          bairro: row.bairro || "",
          inicioFim: row.inicio_fim || "",
          duracao: row.duracao || "",
          tipoAtividade: row.tipo_atividade || "",
          categoriasCapacidade: row.categorias_capacidade || "",
        };
      });
    }

    // Fallback: achata chamados processados quando não há flat no banco.
    const linhas: ToaOsDetalheLinha[] = [];
    for (const chamado of chamadosToaPeriodo) {
      const login = normalizeToaLogin(chamado.login);
      const statusNota = statusNotaToa(chamado.ordensDeServico);
      const tecnico =
        chamado.nomeTecnico?.trim() ||
        nomesColaboradorPorLogin.get(login) ||
        login;
      for (const ordem of chamado.ordensDeServico) {
        const numeroOs =
          (ordem.numeroOs || "").trim() || String(ordem.indice);
        const codBaixa =
          ordem.codBaixa > 0
            ? ordem.codBaixa
            : null;
        if (!numeroOs && !codBaixa) continue;
        const valorCatalogo = valorPrecoOs(precosOs, ordem.tipoOs);
        linhas.push({
          data: chamado.data,
          idToa: login,
          tecnico,
          statusNota,
          contrato: chamado.contrato || "",
          numeroWo: chamado.numeroWo || "",
          numeroOs,
          tipoOs: ordem.tipoOs || "",
          codBaixa,
          statusOs: ordem.status || "",
          receita: valorCatalogo * fatorProjecao,
          contaReceitaFaturada: isOsReceitaFaturavelNaNota(
            ordem,
            chamado.ordensDeServico,
          ),
          endereco: chamado.endereco || "",
          bairro: chamado.bairro || "",
          inicioFim: chamado.inicioFim || "",
          duracao: chamado.duracao || "",
          tipoAtividade: chamado.tipoAtividade || "",
          categoriasCapacidade: chamado.categoriasCapacidade || "",
        });
      }
    }
    return linhas;
  }, [
    toaOsPeriodo,
    chamadosToaPeriodo,
    precosOs,
    fatorProjecao,
    nomesColaboradorPorLogin,
    osFaturaveisPorWo,
  ]);

  const filtrarOsPorTipoNota = (
    rows: ToaOsDetalheLinha[],
    tipo: TipoDetalheNotas,
  ) => {
    const desejaProdutiva = tipo === "produtivas";
    return rows.filter((row) =>
      desejaProdutiva
        ? row.statusNota === "Produtiva"
        : row.statusNota === "Improdutiva",
    );
  };

  const osTabelaInferior = useMemo(
    () => filtrarOsPorTipoNota(osDetalheToa, abaNotasToa),
    [osDetalheToa, abaNotasToa],
  );

  const osTabelaFiltradas = useMemo(() => {
    const termo = buscaTecnico.trim().toLowerCase();
    if (!termo) return osTabelaInferior;
    return osTabelaInferior.filter((row) => {
      const tecnico = (row.tecnico || "").toLowerCase();
      const idToa = (row.idToa || "").toLowerCase();
      const wo = (row.numeroWo || "").toLowerCase();
      const contrato = (row.contrato || "").toLowerCase();
      const os = (row.numeroOs || "").toLowerCase();
      const tipo = (row.tipoOs || "").toLowerCase();
      return (
        tecnico.includes(termo) ||
        idToa.includes(termo) ||
        wo.includes(termo) ||
        contrato.includes(termo) ||
        os.includes(termo) ||
        tipo.includes(termo)
      );
    });
  }, [osTabelaInferior, buscaTecnico]);

  /**
   * Mini-card Total: mesma regra do card Receita (TOA) / receitaPerda.
   * Produtivas → só O.S. com contaReceitaFaturada (evita double-count de bundling).
   * Perdas → soma o valor de catálogo das O.S. da aba (WOs improdutivas).
   */
  const totalReceitaTabelaVisivel = useMemo(() => {
    if (abaNotasToa === "produtivas") {
      return osTabelaFiltradas.reduce((acc, row) => {
        if (!row.contaReceitaFaturada) return acc;
        return acc + (Number(row.receita) || 0);
      }, 0);
    }
    return osTabelaFiltradas.reduce(
      (acc, row) => acc + (Number(row.receita) || 0),
      0,
    );
  }, [abaNotasToa, osTabelaFiltradas]);

  /**
   * Simular Fatura: 1 O.S. pagadora por Contrato (1ª produtiva cronológica).
   * Contrato vazio → agrupa por numero_wo.
   */
  const dadosFaturaSimulada = useMemo<FaturaSimuladaLinha[]>(() => {
    type Candidata = {
      grupoKey: string;
      contrato: string;
      numeroOs: string;
      tipoOs: string;
      codBaixa: number | null;
      dataBaixa: string;
      sortKey: string;
      valorServico: number;
    };

    const porContrato = new Map<string, Candidata[]>();

    const pushCandidata = (cand: Candidata) => {
      const lista = porContrato.get(cand.grupoKey) ?? [];
      lista.push(cand);
      porContrato.set(cand.grupoKey, lista);
    };

    if (toaOsPeriodo.length > 0) {
      for (const row of toaOsPeriodo) {
        const codBaixa = row.cod_baixa ?? 0;
        const produtiva =
          isStatusExecutada(row.status_os || "") &&
          codBaixa > 0 &&
          isCodBaixaProdutivo(codBaixa);
        if (!produtiva) continue;

        const contrato = String(row.contrato ?? "").trim();
        const wo = String(row.numero_wo ?? "").trim();
        const numeroOs = String(row.numero_os ?? "").trim();
        const grupoKey = contrato || wo || numeroOs;
        if (!grupoKey) continue;

        const dataBaixa = String(row.data_toa ?? "").slice(0, 10);
        pushCandidata({
          grupoKey,
          contrato: contrato || wo || "—",
          numeroOs: numeroOs || "—",
          tipoOs: String(row.tipo_os ?? "").trim() || "—",
          codBaixa: row.cod_baixa,
          dataBaixa,
          sortKey: `${dataBaixa}|${String(row.inicio_fim ?? "").trim()}|${numeroOs}`,
          valorServico: valorPrecoOs(precosOs, row.tipo_os) * fatorProjecao,
        });
      }
    } else {
      for (const chamado of chamadosToaPeriodo) {
        const contrato = String(chamado.contrato ?? "").trim();
        const wo = String(chamado.numeroWo ?? "").trim();
        const dataBaixa = String(chamado.data ?? "").slice(0, 10);
        for (const ordem of chamado.ordensDeServico) {
          if (!isOsProdutiva(ordem)) continue;
          const numeroOs =
            (ordem.numeroOs || "").trim() || String(ordem.indice);
          const grupoKey = contrato || wo || numeroOs;
          if (!grupoKey) continue;
          pushCandidata({
            grupoKey,
            contrato: contrato || wo || "—",
            numeroOs: numeroOs || "—",
            tipoOs: String(ordem.tipoOs ?? "").trim() || "—",
            codBaixa: ordem.codBaixa > 0 ? ordem.codBaixa : null,
            dataBaixa,
            sortKey: `${dataBaixa}|${String(chamado.inicioFim ?? "").trim()}|${numeroOs}`,
            valorServico: valorPrecoOs(precosOs, ordem.tipoOs) * fatorProjecao,
          });
        }
      }
    }

    const selecionadas: FaturaSimuladaLinha[] = [];
    for (const candidatas of porContrato.values()) {
      candidatas.sort((a, b) => a.sortKey.localeCompare(b.sortKey));
      const primeira = candidatas[0];
      if (!primeira) continue;
      selecionadas.push({
        contrato: primeira.contrato,
        numeroOs: primeira.numeroOs,
        tipoOs: primeira.tipoOs,
        codBaixa: primeira.codBaixa,
        dataBaixa: primeira.dataBaixa,
        valorServico: primeira.valorServico,
      });
    }

    return selecionadas.sort((a, b) => {
      const byDate = b.dataBaixa.localeCompare(a.dataBaixa);
      if (byDate !== 0) return byDate;
      return a.contrato.localeCompare(b.contrato, "pt-BR");
    });
  }, [toaOsPeriodo, chamadosToaPeriodo, precosOs, fatorProjecao]);

  const totalFaturaSimulada = useMemo(
    () =>
      dadosFaturaSimulada.reduce(
        (acc, row) => acc + (Number(row.valorServico) || 0),
        0,
      ),
    [dadosFaturaSimulada],
  );

  const osTabelaOrdenadas = useMemo(() => {
    if (!sortConfig.key) {
      return [...osTabelaFiltradas].sort((a, b) => {
        const byDate = b.data.localeCompare(a.data);
        if (byDate !== 0) return byDate;
        const byWo = a.numeroWo.localeCompare(b.numeroWo, "pt-BR");
        if (byWo !== 0) return byWo;
        return a.numeroOs.localeCompare(b.numeroOs, "pt-BR");
      });
    }
    const key = sortConfig.key;
    const fator = sortConfig.direction === "asc" ? 1 : -1;
    return [...osTabelaFiltradas].sort((a, b) => {
      const valorA =
        key === "receita"
          ? a.receita
          : key === "data"
            ? a.data
            : a.statusNota === "Produtiva"
              ? 1
              : 0;
      const valorB =
        key === "receita"
          ? b.receita
          : key === "data"
            ? b.data
            : b.statusNota === "Produtiva"
              ? 1
              : 0;
      if (valorA < valorB) return -1 * fator;
      if (valorA > valorB) return 1 * fator;
      return a.numeroWo.localeCompare(b.numeroWo, "pt-BR");
    });
  }, [osTabelaFiltradas, sortConfig]);

  const osDetalheCard = useMemo<ToaOsDetalheLinha[]>(() => {
    if (!detalheNotasTipo) return [];
    return filtrarOsPorTipoNota(osDetalheToa, detalheNotasTipo).sort(
      (a, b) => {
        const byDate = a.data.localeCompare(b.data);
        if (byDate !== 0) return byDate;
        const byNome = a.tecnico.localeCompare(b.tecnico, "pt-BR");
        if (byNome !== 0) return byNome;
        const byWo = a.numeroWo.localeCompare(b.numeroWo, "pt-BR");
        if (byWo !== 0) return byWo;
        return a.numeroOs.localeCompare(b.numeroOs, "pt-BR");
      },
    );
  }, [detalheNotasTipo, osDetalheToa]);

  const osDetalheCardFiltradas = useMemo(() => {
    const termo = buscaDetalheNotas.trim().toLowerCase();
    if (!termo) return osDetalheCard;

    return osDetalheCard.filter((row) => {
      const contrato = (row.contrato || "").toLowerCase();
      const wo = (row.numeroWo || "").toLowerCase();
      const nome = (row.tecnico || "").toLowerCase();
      const idToa = (row.idToa || "").toLowerCase();
      const os = (row.numeroOs || "").toLowerCase();
      return (
        contrato.includes(termo) ||
        wo.includes(termo) ||
        nome.includes(termo) ||
        idToa.includes(termo) ||
        os.includes(termo)
      );
    });
  }, [osDetalheCard, buscaDetalheNotas]);

  const mapearOsParaExcel = (rows: ToaOsDetalheLinha[]) =>
    rows.map((row) => ({
      Data: formatDataBr(row.data),
      IdTOA: row.idToa || "—",
      Técnico: row.tecnico || "—",
      "Tipo de Atividade": row.tipoAtividade || "—",
      "Cod Baixa": row.codBaixa ?? "",
      Contrato: row.contrato || "—",
      WO: row.numeroWo || "—",
      OS: row.numeroOs || "—",
      "Tipo OS": row.tipoOs || "—",
      Status: row.statusOs || "—",
      Endereço: row.endereco || "—",
      Bairro: row.bairro || "—",
      "Início - Fim": row.inicioFim || "—",
      Duração: row.duracao || "—",
      "Categorias da Capacidade": row.categoriasCapacidade || "—",
      "Status da nota": row.statusNota,
      Receita: Number(row.receita.toFixed(2)),
    }));

  const exportarDetalheNotasExcel = () => {
    if (!detalheNotasTipo) return;

    if (osDetalheCardFiltradas.length === 0) {
      toast.error("Nenhuma O.S. visível para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      mapearOsParaExcel(osDetalheCardFiltradas),
      {
        header: [...COLUNAS_EXCEL_OS_TOA],
      },
    );
    const workbook = XLSX.utils.book_new();
    const sheetName =
      detalheNotasTipo === "produtivas" ? "Notas Produtivas" : "Perdas";
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);

    const hoje = new Date().toISOString().slice(0, 10);
    const prefixo =
      detalheNotasTipo === "produtivas"
        ? "Detalhamento_Notas_Produtivas"
        : "Detalhamento_Perdas";
    XLSX.writeFile(workbook, `${prefixo}_${hoje}.xlsx`);
    toast.success(
      `Excel exportado: ${formatQuantidade(osDetalheCardFiltradas.length)} O.S.`,
    );
  };

  const exportarNotasDetalhamentoExcel = () => {
    if (osTabelaFiltradas.length === 0) {
      toast.error("Nenhuma O.S. no período para exportar.");
      return;
    }

    const worksheet = XLSX.utils.json_to_sheet(
      mapearOsParaExcel(osTabelaFiltradas),
      {
        header: [...COLUNAS_EXCEL_OS_TOA],
      },
    );
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "O.S. TOA");

    const mesAno =
      filtroPeriodo.mes !== null && filtroPeriodo.ano !== null
        ? `${String(filtroPeriodo.mes).padStart(2, "0")}${filtroPeriodo.ano}`
        : "Completo";
    XLSX.writeFile(workbook, `Exportacao_OS_TOA_${mesAno}.xlsx`);
    toast.success(
      `Excel exportado: ${formatQuantidade(osTabelaFiltradas.length)} O.S.`,
    );
  };

  const exportarComparacaoConciliacao = () => {
    if (analiticoFiltrado.length === 0 || toaOsPeriodo.length === 0) {
      toast.error(
        "É necessário ter Analítico e TOA no período para gerar a conciliação.",
      );
      return;
    }

    const { faltandoNoToa, faltandoNoAnalitico } = conciliarAnaliticoVsToa(
      analiticoFiltrado,
      toaOsPeriodo,
    );

    if (faltandoNoToa.length === 0 && faltandoNoAnalitico.length === 0) {
      toast.success(
        "Conciliação sem gaps: todas as O.S. cruzaram entre Analítico e TOA.",
      );
    }

    const workbook = XLSX.utils.book_new();
    const sheetCobrar =
      faltandoNoAnalitico.length > 0
        ? XLSX.utils.json_to_sheet(faltandoNoAnalitico)
        : XLSX.utils.aoa_to_sheet([
            [
              "Nome Técnico",
              "Login",
              "Status de atividade",
              "Contrato",
              "Número WO",
              "Número OS",
              "Tipo OS",
              "Cód Baixa",
              "Data TOA",
            ],
          ]);
    const sheetNaoRegistrado =
      faltandoNoToa.length > 0
        ? XLSX.utils.json_to_sheet(faltandoNoToa)
        : XLSX.utils.aoa_to_sheet([
            ["Contrato", "CD_OS", "Tipo OS", "Data Baixa", "Valor Serviço"],
          ]);

    XLSX.utils.book_append_sheet(
      workbook,
      sheetCobrar,
      "Falta no Analitico (Cobrar)",
    );
    XLSX.utils.book_append_sheet(
      workbook,
      sheetNaoRegistrado,
      "Falta no TOA (Não Registrado)",
    );

    XLSX.writeFile(workbook, "Conciliacao_Analitico_vs_TOA.xlsx");
    toast.success(
      `Conciliação exportada: ${formatQuantidade(faltandoNoAnalitico.length)} cobrar (falta no Analítico), ${formatQuantidade(faltandoNoToa.length)} não registrado (falta no TOA).`,
    );
  };

  const tituloDetalheNotas =
    detalheNotasTipo === "produtivas"
      ? "Detalhamento de Notas Produtivas"
      : detalheNotasTipo === "perdas"
        ? "Detalhamento de Perdas"
        : "";

  return (
    <div className="w-full space-y-6">
      {mostrarCardsAnaliticoEToa ? (
        <>
          <div className="rounded-lg border border-sky-200 bg-sky-50/80 px-4 py-3 text-sm text-sky-900">
            {historicoGeral
              ? "Histórico geral — Analítico Claro (faturamento real) e TOA (projeção) consolidados. Use as abas abaixo para alternar o detalhamento."
              : "Modo comparação — Analítico Claro e TOA disponíveis no período. Use as abas abaixo para alternar o detalhamento."}
          </div>
          <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total de notas (Analítico)
                  {periodoAnaliticoLabel
                    ? ` - ${periodoAnaliticoLabel}`
                    : ""}
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(resumoAnalitico.totalNotas)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Total de notas / WOs (TOA)
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(totalNotasToa)}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 shrink-0 text-emerald-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Receita (Analítico)
                  {periodoAnaliticoLabel
                    ? ` - ${periodoAnaliticoLabel}`
                    : ""}
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-emerald-600">
                {formatReceita(resumoAnalitico.receitaTotal)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => abrirDetalheNotas("produtivas")}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-green-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500"
              aria-label="Abrir detalhamento de notas produtivas TOA"
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Notas produtivas (Ctt c/ OS &gt;= 1 prod.)
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(totalNotasProdutivas)}
              </div>
            </button>
            <button
              type="button"
              onClick={() => abrirDetalheNotas("perdas")}
              className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-red-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500"
              aria-label="Abrir detalhamento de notas improdutivas TOA"
            >
              <div className="flex items-center gap-2">
                <XCircle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Notas improdutivas (Ctt c/ Sem OS prod.)
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(totalPerdaNotas)}
              </div>
            </button>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Receita (TOA)
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold text-green-600">
                {formatReceita(receitaTotal)}
              </div>
            </div>
          </div>
        </>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 shrink-0 text-blue-600" />
              <span className="text-sm font-medium text-muted-foreground">
                Total de notas / WOs (TOA)
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">
              {formatQuantidade(totalNotasToa)}
            </div>
          </div>
          <button
            type="button"
            onClick={() => abrirDetalheNotas("produtivas")}
            className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-green-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500"
            aria-label="Abrir detalhamento de notas produtivas"
          >
            <div className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">
                Notas produtivas (Ctt c/ OS &gt;= 1 prod.)
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">
              {formatQuantidade(totalNotasProdutivas)}
            </div>
          </button>
          <button
            type="button"
            onClick={() => abrirDetalheNotas("perdas")}
            className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-red-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500"
            aria-label="Abrir detalhamento de perdas de notas"
          >
            <div className="flex items-center gap-2">
              <XCircle className="h-5 w-5 shrink-0 text-red-600" />
              <span className="text-sm font-medium text-muted-foreground">
                Notas improdutivas (Ctt c/ Sem OS prod.)
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold text-gray-900">
              {formatQuantidade(totalPerdaNotas)}
            </div>
          </button>
          <div className="rounded-xl border border-gray-200 bg-white p-5">
            <div className="flex items-center gap-2">
              <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
              <span className="text-sm font-medium text-muted-foreground">
                Receita (TOA)
              </span>
            </div>
            <div className="mt-3 text-3xl font-bold text-green-600">
              {formatReceita(receitaTotal)}
            </div>
          </div>
        </div>
      )}

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between items-center gap-3">
          <h2 className="flex min-w-0 flex-wrap items-center gap-2 font-bold text-foreground">
            <BarChart3 className="h-4 w-4 shrink-0 text-primary" />
            <span className="leading-snug">{tituloVisaoGeral}</span>
          </h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground">
            Visualizar:
            <select
              value={filtroTop}
              onChange={(e) => setFiltroTop(e.target.value as FiltroTop)}
              className="border border-gray-300 text-sm rounded-md px-2 py-1 outline-none text-foreground bg-background"
            >
              <option value="Geral">Geral</option>
              <option value="Top 10">Top 10</option>
              <option value="Top 5">Top 5</option>
              <option value="Top 3">Top 3</option>
            </select>
          </label>
        </div>

        <div className="mt-4 h-80 w-full">
          {chartData.length === 0 ? (
            <div className="flex h-full items-center justify-center rounded-lg bg-gray-50 text-sm text-muted-foreground">
              Nenhum técnico com baixa no período selecionado.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={chartData}
                margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" />
                <XAxis
                  dataKey="nome"
                  tick={{ fontSize: 11, cursor: "pointer" }}
                  interval={0}
                  angle={chartData.length > 8 ? -35 : 0}
                  textAnchor={chartData.length > 8 ? "end" : "middle"}
                  height={chartData.length > 8 ? 56 : 30}
                  onClick={(state) => {
                    const index =
                      typeof state?.index === "number" ? state.index : -1;
                    const item = index >= 0 ? chartData[index] : null;
                    if (item) selecionarTecnicoDoGrafico(item);
                  }}
                />
                <YAxis
                  yAxisId="left"
                  allowDecimals={false}
                  tick={{ fontSize: 11 }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fontSize: 11 }}
                  tickFormatter={(v) => `${v}%`}
                />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.[0]) return null;
                    const item = payload[0].payload as ChartBarPayload;
                    const totalNotas =
                      item.notasProdutivas + item.notasImprodutivas;
                    const aproveitamento =
                      totalNotas > 0
                        ? (item.notasProdutivas / totalNotas) * 100
                        : 0;
                    return (
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                        <p className="font-bold">{item.nomeCompleto}</p>
                        <p className="text-green-600">
                          Notas Produtivas:{" "}
                          {formatQuantidade(item.notasProdutivas)} -{" "}
                          {formatReceita(item.receitaGanha)}
                        </p>
                        <p className="text-red-600">
                          Notas Improdutivas:{" "}
                          {formatQuantidade(item.notasImprodutivas)} -{" "}
                          {formatReceita(item.receitaPerda)}
                        </p>
                        <p className="text-gray-700">
                          Aproveitamento:{" "}
                          {aproveitamento.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </p>
                        <p className="text-amber-500">
                          Pareto:{" "}
                          {item.pareto.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </p>
                      </div>
                    );
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  align="center"
                  content={({ payload }) => {
                    if (!payload?.length) return null;
                    return (
                      <ul className="mt-2 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
                        {payload.map((entry) => (
                          <li
                            key={String(entry.value)}
                            className="inline-flex items-center gap-2 text-sm text-muted-foreground"
                          >
                            <span
                              className="inline-block h-3 w-3 shrink-0 rounded-sm"
                              style={{ backgroundColor: entry.color }}
                              aria-hidden
                            />
                            <span>{entry.value}</span>
                          </li>
                        ))}
                      </ul>
                    );
                  }}
                />
                <Bar
                  yAxisId="left"
                  dataKey="notasProdutivas"
                  name="Notas Produtivas"
                  fill="#16a34a"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data) => selecionarTecnicoDoGrafico(data)}
                />
                <Bar
                  yAxisId="left"
                  dataKey="notasImprodutivas"
                  name="Notas Improdutivas"
                  fill="#dc2626"
                  radius={[4, 4, 0, 0]}
                  cursor="pointer"
                  onClick={(data) => selecionarTecnicoDoGrafico(data)}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="pareto"
                  name="Pareto"
                  stroke="#f59e0b"
                  strokeWidth={3}
                  dot={{ r: 4 }}
                />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div className="mt-6 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex flex-wrap items-start gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
              <Users className="h-4 w-4 text-primary" />
              Detalhamento TOA
            </h2>
            {activeTab === "toa" || activeTab === "simular-fatura" ? (
              <button
                type="button"
                onClick={abrirTabelaPrecos}
                className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-300"
                title="Ver Tabela de Preços"
                aria-label="Ver tabela de preços"
              >
                ?
              </button>
            ) : null}
          </div>

          {activeTab === "toa" || activeTab === "simular-fatura" ? (
            <div className="ml-auto flex flex-col items-end gap-2">
              {(onRecalcularBase || onAtualizarCatalogoViaHistorico) && (
                <div className="flex flex-wrap items-center justify-end gap-2">
                  {onRecalcularBase ? (
                    <button
                      type="button"
                      onClick={() => void recalcularBase()}
                      disabled={recalculandoBase || atualizandoCatalogoHistorico}
                      className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 transition hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Regrava o catálogo calibrado no Supabase e invalida cache local de preços"
                    >
                      {recalculandoBase ? "Recalculando…" : "Recalcular Base"}
                    </button>
                  ) : null}
                  {onAtualizarCatalogoViaHistorico ? (
                    <button
                      type="button"
                      onClick={() => void atualizarCatalogoViaHistorico()}
                      disabled={atualizandoCatalogoHistorico || recalculandoBase}
                      className="rounded-md border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 transition hover:bg-sky-100 disabled:cursor-not-allowed disabled:opacity-60"
                      title="Calcula a moda de valor_servico no Analítico e faz upsert em precos_os"
                    >
                      {atualizandoCatalogoHistorico
                        ? "Atualizando catálogo…"
                        : "Atualizar Catálogo via Histórico"}
                    </button>
                  ) : null}
                </div>
              )}
              <div
                className="flex shrink-0 flex-col items-end justify-center rounded-lg border border-gray-200 bg-gray-50 px-4 py-1.5 shadow-sm"
                title={
                  activeTab === "simular-fatura"
                    ? "Soma da 1ª O.S. produtiva por contrato (fatura simulada)"
                    : abaNotasToa === "produtivas"
                      ? "Receita faturável (mesma regra do card Receita TOA), filtrada pela tabela"
                      : "Valor estimado deixado na mesa nas O.S. visíveis (aba Perdas)"
                }
              >
                <span className="text-xs text-gray-500">
                  {activeTab === "simular-fatura"
                    ? "Total (Fatura simulada)"
                    : abaNotasToa === "produtivas"
                      ? "Total (Receita Gerada)"
                      : "Total (Deixado na mesa)"}
                </span>
                <span
                  className={`text-sm font-bold tabular-nums ${
                    activeTab === "simular-fatura"
                      ? "text-green-600"
                      : abaNotasToa === "produtivas"
                        ? "text-green-600"
                        : "text-red-500"
                  }`}
                >
                  {formatReceita(
                    activeTab === "simular-fatura"
                      ? totalFaturaSimulada
                      : abaNotasToa === "perdas"
                        ? -Math.abs(totalReceitaTabelaVisivel)
                        : totalReceitaTabelaVisivel,
                  )}
                </span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="mb-4">
          <div
            className="inline-flex rounded-lg border border-border bg-muted/40 p-1"
            role="tablist"
            aria-label="Fonte do detalhamento"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "toa"}
              onClick={() => setActiveTab("toa")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                activeTab === "toa"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Detalhamento TOA
            </button>
            {mostrarCardsAnaliticoEToa ? (
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === "analitico"}
                onClick={() => setActiveTab("analitico")}
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  activeTab === "analitico"
                    ? "bg-white text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Analítico Claro
              </button>
            ) : null}
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "simular-fatura"}
              onClick={() => setActiveTab("simular-fatura")}
              className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                activeTab === "simular-fatura"
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Simular Fatura
            </button>
          </div>
        </div>

        {activeTab === "analitico" ? (
          <TabelaDetalhamentoAnalitico rows={analiticoFiltrado} />
        ) : activeTab === "simular-fatura" ? (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-end gap-3">
              <label className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Aumento (%)
                </span>
                <input
                  type="number"
                  step="0.1"
                  value={percentualAumentoTexto}
                  onChange={(e) => atualizarPercentualAumento(e.target.value)}
                  placeholder="0"
                  aria-label="Aumento percentual"
                  className="w-24 rounded-md border border-gray-300 bg-background px-3 py-2 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </label>
            </div>
            {dadosFaturaSimulada.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma O.S. produtiva no período para simular a fatura.
              </p>
            ) : (
              <div className="relative max-h-[500px] overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full table-fixed border-collapse text-[11px]">
                  <colgroup>
                    <col style={{ width: "18%" }} />
                    <col style={{ width: "14%" }} />
                    <col style={{ width: "28%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "12%" }} />
                    <col style={{ width: "16%" }} />
                  </colgroup>
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-border">
                      <th className={`${TH_OS_TOA} bg-white`}>Contrato</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Cód OS</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Tipo OS</th>
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        Cód de baixa
                      </th>
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        Data Baixa
                      </th>
                      <th className={`${TH_OS_TOA} bg-white text-right`}>
                        Valor serviço
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dadosFaturaSimulada.map((row, idx) => (
                      <tr
                        key={`${row.contrato}-${row.numeroOs}-${row.dataBaixa}-${idx}`}
                        className="border-b border-border/60 hover:bg-muted/40"
                      >
                        <td
                          className={`${TD_OS_TOA} tabular-nums`}
                          title={row.contrato}
                        >
                          {row.contrato}
                        </td>
                        <td
                          className={`${TD_OS_TOA} font-semibold tabular-nums text-gray-900`}
                          title={row.numeroOs}
                        >
                          {row.numeroOs}
                        </td>
                        <td className={TD_OS_TOA} title={row.tipoOs}>
                          {row.tipoOs}
                        </td>
                        <td
                          className={`${TD_OS_TOA} text-center tabular-nums`}
                          title={
                            row.codBaixa != null
                              ? String(row.codBaixa)
                              : undefined
                          }
                        >
                          {row.codBaixa ?? "—"}
                        </td>
                        <td className={`${TD_OS_TOA} text-center tabular-nums`}>
                          {formatDataBr(row.dataBaixa)}
                        </td>
                        <td
                          className={`${TD_OS_TOA} text-right font-bold tabular-nums text-green-600`}
                          title={formatReceita(row.valorServico)}
                        >
                          {formatReceita(row.valorServico)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        ) : (
          <>
            <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:gap-4">
              <div
                className="inline-flex shrink-0 rounded-lg border border-border bg-muted/40 p-1"
                role="tablist"
                aria-label="Tipo de detalhamento TOA"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={abaNotasToa === "produtivas"}
                  onClick={() => setAbaNotasToa("produtivas")}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    abaNotasToa === "produtivas"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Detalhamento de Notas Produtivas
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={abaNotasToa === "perdas"}
                  onClick={() => setAbaNotasToa("perdas")}
                  className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                    abaNotasToa === "perdas"
                      ? "bg-white text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Detalhamento de Perdas
                </button>
              </div>

              <div className="flex w-full flex-col gap-3 sm:flex-row sm:items-center sm:justify-end lg:ml-auto lg:w-auto">
                <input
                  type="search"
                  value={buscaTecnico}
                  onChange={(e) => setBuscaTecnico(e.target.value)}
                  placeholder="Buscar por WO, OS, contrato, IdTOA ou técnico..."
                  aria-label="Buscar O.S. por WO, OS, contrato, IdTOA ou técnico"
                  className="w-full rounded-md border border-gray-300 bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 md:w-80"
                />

                <div className="flex w-full flex-wrap items-center gap-3 sm:w-auto sm:justify-end">
                  <button
                    type="button"
                    onClick={exportarNotasDetalhamentoExcel}
                    className="inline-flex items-center gap-2 rounded-md border border-green-300 bg-green-50 px-3 py-2 text-sm font-semibold text-green-800 transition hover:bg-green-100"
                    title="Exportar O.S. do detalhamento TOA com colunas de toa_importacoes"
                    aria-label="Exportar Excel com O.S. do período"
                  >
                    <Download className="h-4 w-4" />
                    Exportar Excel (O.S.)
                  </button>

                  {mostrarCardsAnaliticoEToa ? (
                    <button
                      type="button"
                      onClick={exportarComparacaoConciliacao}
                      className="inline-flex items-center gap-2 rounded-md border border-sky-300 bg-sky-50 px-3 py-2 text-sm font-semibold text-sky-900 transition hover:bg-sky-100"
                      title="Exporta gaps: contratos só no Analítico vs só no TOA (notas produtivas)"
                      aria-label="Exportar comparação Analítico vs TOA"
                    >
                      <Download className="h-4 w-4" />
                      Exportar Comparação
                    </button>
                  ) : null}

                  <label className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-muted-foreground">
                      <TrendingUp className="h-4 w-4 text-primary" />
                      Aumento (%)
                    </span>
                    <input
                      type="number"
                      step="0.1"
                      value={percentualAumentoTexto}
                      onChange={(e) =>
                        atualizarPercentualAumento(e.target.value)
                      }
                      placeholder="0"
                      aria-label="Aumento percentual"
                      className="w-24 rounded-md border border-gray-300 bg-background px-3 py-2 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
                    />
                  </label>
                </div>
              </div>
            </div>
            {osTabelaInferior.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma O.S. no período para este detalhamento.
              </p>
            ) : osTabelaFiltradas.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhuma O.S. encontrada para “{buscaTecnico.trim()}”.
              </p>
            ) : (
              <div className="relative max-h-[500px] overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full table-fixed border-collapse text-[11px]">
                  <ColgroupOsToa />
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-border">
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        {cabecalhoOrdenavel("Data", "data")}
                      </th>
                      <th className={`${TH_OS_TOA} bg-white`}>IdTOA</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Técnico</th>
                      <th
                        className={`${TH_OS_TOA} bg-white`}
                        title="Tipo de Atividade"
                      >
                        Tipo Ativ.
                      </th>
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        Cod
                      </th>
                      <th className={`${TH_OS_TOA} bg-white`}>Contrato</th>
                      <th className={`${TH_OS_TOA} bg-white`}>WO</th>
                      <th className={`${TH_OS_TOA} bg-white`}>OS</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Tipo OS</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Status</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Endereço</th>
                      <th className={`${TH_OS_TOA} bg-white`}>Bairro</th>
                      <th
                        className={`${TH_OS_TOA} bg-white`}
                        title="Início - Fim"
                      >
                        Início-Fim
                      </th>
                      <th className={`${TH_OS_TOA} bg-white`}>Dur.</th>
                      <th
                        className={`${TH_OS_TOA} bg-white`}
                        title="Categorias da Capacidade"
                      >
                        Categorias
                      </th>
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        {cabecalhoOrdenavel("Status da nota", "statusNota")}
                      </th>
                      <th className={`${TH_OS_TOA} bg-white text-center`}>
                        {cabecalhoOrdenavel("Receita", "receita")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {osTabelaOrdenadas.map((row, index) => {
                      const isDemitido = isTecnicoDemitido(
                        demitidosKeys,
                        row.idToa,
                        row.tecnico,
                      );
                      const ganhoReal =
                        row.statusNota === "Produtiva" &&
                        row.contaReceitaFaturada &&
                        row.receita > 0;
                      const perdaReal =
                        row.statusNota === "Improdutiva" && row.receita > 0;
                      const receitaExibida = perdaReal
                        ? -Math.abs(row.receita)
                        : row.receita;
                      return (
                        <tr
                          key={`${row.numeroWo}-${row.numeroOs}-${row.codBaixa}-${index}`}
                          className="border-b border-border last:border-b-0"
                        >
                          <td
                            className={`${TD_OS_TOA} text-center tabular-nums`}
                            title={formatDataBr(row.data)}
                          >
                            {formatDataBr(row.data)}
                          </td>
                          <td className={`${TD_OS_TOA} tabular-nums`} title={row.idToa}>
                            {row.idToa || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.tecnico}>
                            <button
                              type="button"
                              onClick={() =>
                                abrirDetalheTecnico(row.idToa, row.tecnico)
                              }
                              className={
                                isDemitido
                                  ? "block w-full truncate text-left font-medium text-gray-500 hover:underline"
                                  : "block w-full truncate text-left font-medium text-primary hover:underline"
                              }
                              title={row.tecnico}
                            >
                              {row.tecnico}
                            </button>
                          </td>
                          <td className={TD_OS_TOA} title={row.tipoAtividade}>
                            {row.tipoAtividade || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} text-center tabular-nums`}
                            title={
                              row.codBaixa != null ? String(row.codBaixa) : ""
                            }
                          >
                            {row.codBaixa ?? "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} tabular-nums`}
                            title={row.contrato}
                          >
                            {row.contrato || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} font-semibold tabular-nums text-gray-900`}
                            title={row.numeroWo}
                          >
                            {row.numeroWo || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} tabular-nums`}
                            title={row.numeroOs}
                          >
                            {row.numeroOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.tipoOs}>
                            {row.tipoOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.statusOs}>
                            {row.statusOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.endereco}>
                            {row.endereco || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.bairro}>
                            {row.bairro || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.inicioFim}>
                            {row.inicioFim || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.duracao}>
                            {row.duracao || "—"}
                          </td>
                          <td
                            className={TD_OS_TOA}
                            title={row.categoriasCapacidade}
                          >
                            {row.categoriasCapacidade || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} text-center font-semibold ${
                              row.statusNota === "Produtiva"
                                ? "text-green-700"
                                : "text-red-600"
                            }`}
                            title={row.statusNota}
                          >
                            {row.statusNota}
                          </td>
                          <td
                            className={`${TD_OS_TOA} text-center font-bold tabular-nums ${
                              ganhoReal
                                ? "text-green-600"
                                : perdaReal
                                  ? "text-red-600"
                                  : "text-gray-500"
                            }`}
                            title={formatReceita(receitaExibida)}
                          >
                            {formatReceita(receitaExibida)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {detalheNotasTipo !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-detalhe-notas-titulo"
          onClick={fecharDetalheNotas}
        >
            <div
              className="max-h-[90vh] w-[min(98vw,100%)] max-w-[98vw] overflow-y-auto rounded-lg bg-white p-4 shadow-xl sm:p-6"
              onClick={(e) => e.stopPropagation()}
            >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3
                  id="modal-detalhe-notas-titulo"
                  className="text-lg font-bold text-gray-900"
                >
                  {tituloDetalheNotas}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatQuantidade(osDetalheCardFiltradas.length)}
                  {buscaDetalheNotas.trim()
                    ? ` de ${formatQuantidade(osDetalheCard.length)}`
                    : ""}{" "}
                  O.S. no período selecionado
                </p>
              </div>
              <button
                type="button"
                onClick={fecharDetalheNotas}
                className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar detalhamento de notas"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <input
                type="text"
                value={buscaDetalheNotas}
                onChange={(e) => setBuscaDetalheNotas(e.target.value)}
                placeholder="Pesquisar por Contrato, WO, OS, IdTOA ou Técnico..."
                aria-label="Pesquisar por Contrato, WO, OS, IdTOA ou Técnico"
                className="w-full flex-1 rounded-md border border-gray-300 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <button
                type="button"
                onClick={exportarDetalheNotasExcel}
                className="inline-flex items-center justify-center gap-2 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-foreground transition hover:bg-gray-50"
              >
                <Download className="h-4 w-4" />
                Exportar para Excel
              </button>
            </div>

            <div className="w-full rounded-lg border border-gray-200">
              <table className="w-full table-fixed border-collapse text-[11px]">
                <ColgroupOsToa />
                <thead className="bg-gray-50">
                  <tr>
                    <th className={`${TH_OS_TOA} text-center`}>Data</th>
                    <th className={TH_OS_TOA}>IdTOA</th>
                    <th className={TH_OS_TOA}>Técnico</th>
                    <th className={TH_OS_TOA} title="Tipo de Atividade">
                      Tipo Ativ.
                    </th>
                    <th className={`${TH_OS_TOA} text-center`}>Cod</th>
                    <th className={TH_OS_TOA}>Contrato</th>
                    <th className={TH_OS_TOA}>WO</th>
                    <th className={TH_OS_TOA}>OS</th>
                    <th className={TH_OS_TOA}>Tipo OS</th>
                    <th className={TH_OS_TOA}>Status</th>
                    <th className={TH_OS_TOA}>Endereço</th>
                    <th className={TH_OS_TOA}>Bairro</th>
                    <th className={TH_OS_TOA} title="Início - Fim">
                      Início-Fim
                    </th>
                    <th className={TH_OS_TOA}>Dur.</th>
                    <th className={TH_OS_TOA} title="Categorias da Capacidade">
                      Categorias
                    </th>
                    <th className={`${TH_OS_TOA} text-center`}>Status nota</th>
                    <th className={`${TH_OS_TOA} text-center`}>Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {osDetalheCardFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={17}
                        className="px-3 py-8 text-center text-[11px] text-muted-foreground"
                      >
                        Nenhuma O.S. para exibir.
                      </td>
                    </tr>
                  ) : (
                    osDetalheCardFiltradas.map((row, index) => {
                      const ganhoReal =
                        row.statusNota === "Produtiva" &&
                        row.contaReceitaFaturada &&
                        row.receita > 0;
                      const perdaReal =
                        row.statusNota === "Improdutiva" && row.receita > 0;
                      const receitaExibida = perdaReal
                        ? -Math.abs(row.receita)
                        : row.receita;

                      return (
                        <tr
                          key={`${row.data}-${row.idToa}-${row.numeroWo}-${row.numeroOs}-${index}`}
                          className="border-t border-gray-100"
                        >
                          <td
                            className={`${TD_OS_TOA} text-center tabular-nums`}
                            title={formatDataBr(row.data)}
                          >
                            {formatDataBr(row.data)}
                          </td>
                          <td
                            className={`${TD_OS_TOA} tabular-nums`}
                            title={row.idToa}
                          >
                            {row.idToa || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} font-medium text-gray-900`}
                            title={row.tecnico}
                          >
                            {row.tecnico}
                          </td>
                          <td className={TD_OS_TOA} title={row.tipoAtividade}>
                            {row.tipoAtividade || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} text-center tabular-nums`}
                            title={
                              row.codBaixa != null ? String(row.codBaixa) : ""
                            }
                          >
                            {row.codBaixa ?? "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.contrato}>
                            {row.contrato || "—"}
                          </td>
                          <td
                            className={`${TD_OS_TOA} font-semibold text-gray-800`}
                            title={row.numeroWo}
                          >
                            {row.numeroWo || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.numeroOs}>
                            {row.numeroOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.tipoOs}>
                            {row.tipoOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.statusOs}>
                            {row.statusOs || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.endereco}>
                            {row.endereco || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.bairro}>
                            {row.bairro || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.inicioFim}>
                            {row.inicioFim || "—"}
                          </td>
                          <td className={TD_OS_TOA} title={row.duracao}>
                            {row.duracao || "—"}
                          </td>
                          <td
                            className={TD_OS_TOA}
                            title={row.categoriasCapacidade}
                          >
                            {row.categoriasCapacidade || "—"}
                          </td>
                          <td className={`${TD_OS_TOA} text-center`}>
                            <span
                              className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                                row.statusNota === "Produtiva"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                              title={row.statusNota}
                            >
                              {row.statusNota}
                            </span>
                          </td>
                          <td
                            className={`${TD_OS_TOA} text-center tabular-nums ${
                              ganhoReal
                                ? "font-medium text-green-600"
                                : perdaReal
                                  ? "font-medium text-red-600"
                                  : "font-normal text-gray-400"
                            }`}
                            title={formatReceita(receitaExibida)}
                          >
                            {formatReceita(receitaExibida)}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {tecnicoSelecionado !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-detalhe-tecnico-titulo"
          onClick={() => setTecnicoSelecionado(null)}
        >
          <div
            className="max-h-[90vh] w-11/12 max-w-5xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3
                  id="modal-detalhe-tecnico-titulo"
                  className="text-lg font-bold text-gray-900"
                >
                  {tecnicoSelecionado.login} - {tecnicoSelecionado.nome} -{" "}
                  {periodoLabelLocal}
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">
                  {formatQuantidade(osDoTecnico.length)} O.S. no período
                  selecionado · Receita: {formatReceita(receitaPeriodoModal)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setTecnicoSelecionado(null)}
                className="rounded-md p-2 text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
                aria-label="Fechar detalhamento"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mb-4 flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Ano:
                <select
                  value={filtroLocalAno !== null ? String(filtroLocalAno) : "todos"}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "todos") {
                      setFiltroLocalAno(null);
                      setFiltroLocalMes(null);
                      setFiltroLocalDia(null);
                      return;
                    }
                    const ano = Number(value);
                    setFiltroLocalAno(ano);
                    setFiltroLocalMes(null);
                    setFiltroLocalDia(null);
                  }}
                  className="rounded-md border border-gray-300 bg-background px-2 py-1 text-sm text-foreground outline-none"
                >
                  <option value="todos">Todos</option>
                  {anosDisponiveisModal.map((ano) => (
                    <option key={ano} value={ano}>
                      {ano}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Mês:
                <select
                  value={filtroLocalMes !== null ? String(filtroLocalMes) : "todos"}
                  disabled={filtroLocalAno === null}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (value === "todos") {
                      setFiltroLocalMes(null);
                      setFiltroLocalDia(null);
                      return;
                    }
                    setFiltroLocalMes(Number(value));
                    setFiltroLocalDia(null);
                  }}
                  className="rounded-md border border-gray-300 bg-background px-2 py-1 text-sm text-foreground outline-none disabled:opacity-50"
                >
                  <option value="todos">Todos</option>
                  {mesesDisponiveisModal.map((mes) => {
                    const label =
                      MESES_LABEL.find((item) => item.value === mes)?.label ??
                      String(mes);
                    return (
                      <option key={mes} value={mes}>
                        {label}
                      </option>
                    );
                  })}
                </select>
              </label>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                Dia:
                <select
                  value={filtroLocalDia !== null ? String(filtroLocalDia) : "todos"}
                  disabled={filtroLocalAno === null || filtroLocalMes === null}
                  onChange={(e) => {
                    const value = e.target.value;
                    setFiltroLocalDia(value === "todos" ? null : Number(value));
                  }}
                  className="rounded-md border border-gray-300 bg-background px-2 py-1 text-sm text-foreground outline-none disabled:opacity-50"
                >
                  <option value="todos">Todos</option>
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((dia) => (
                    <option key={dia} value={dia}>
                      {dia}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                onClick={() => {
                  setFiltroLocalAno(null);
                  setFiltroLocalMes(null);
                  setFiltroLocalDia(null);
                }}
                className="ml-auto inline-flex items-center gap-1.5 rounded-md border border-gray-300 px-3 py-1 text-sm font-medium text-muted-foreground transition hover:bg-gray-100 hover:text-foreground"
              >
                <FilterX className="h-4 w-4" />
                Limpar filtros
              </button>
            </div>

            <div className="mb-6 h-64 w-full rounded-lg border border-gray-200 p-3">
              {tendenciaPorData.length === 0 ? (
                <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota encontrada para este técnico no período.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={tendenciaPorData}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis
                      dataKey="dataLabel"
                      tick={{ fontSize: 11 }}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const item = payload[0].payload as {
                          data: string;
                          dataLabel: string;
                          produtivas: number;
                          improdutivas: number;
                        };
                        return (
                          <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                            <p className="font-semibold">
                              {formatTooltipDataComDiaSemana(item.data)}
                            </p>
                            <p className="text-green-600">
                              Produtivas: {formatQuantidade(item.produtivas)}
                            </p>
                            <p className="text-red-600">
                              Quebra/Improdutivo:{" "}
                              {formatQuantidade(item.improdutivas)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="produtivas"
                      name="Notas Produtivas"
                      stroke="#16a34a"
                      strokeWidth={3}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                    <Line
                      type="monotone"
                      dataKey="improdutivas"
                      name="Quebra/Improdutivo"
                      stroke="#dc2626"
                      strokeWidth={2}
                      strokeDasharray="4 4"
                      dot={{ r: 2 }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>

            <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
              <input
                type="text"
                value={buscaWoContrato}
                onChange={(e) => setBuscaWoContrato(e.target.value)}
                placeholder="Pesquisar WO ou Contrato..."
                aria-label="Pesquisar WO ou Contrato"
                className="w-full rounded-md border border-gray-300 bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="shrink-0">Tipo de OS:</span>
                <select
                  value={filtroTipoOsModal}
                  onChange={(e) => setFiltroTipoOsModal(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-background px-2 py-2 text-sm text-foreground outline-none"
                >
                  <option value="todos">Todos</option>
                  {tiposOsModal.map((tipoOs) => (
                    <option key={tipoOs} value={tipoOs}>
                      {tipoOs}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="shrink-0">Cód de Baixa:</span>
                <select
                  value={filtroCodBaixaModal}
                  onChange={(e) => setFiltroCodBaixaModal(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-background px-2 py-2 text-sm text-foreground outline-none"
                >
                  <option value="todos">Todos</option>
                  {codigosBaixaModal.map((codigo) => (
                    <option key={codigo} value={codigo}>
                      {codigo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
                <span className="shrink-0">Status:</span>
                <select
                  value={filtroStatusModal}
                  onChange={(e) => setFiltroStatusModal(e.target.value)}
                  className="min-w-0 flex-1 rounded-md border border-gray-300 bg-background px-2 py-2 text-sm text-foreground outline-none"
                >
                  <option value="todos">Todos</option>
                  {statusOsModal.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">IdTOA</th>
                    <th className="px-3 py-2 font-semibold">Técnico</th>
                    <th className="px-3 py-2 font-semibold">Status da nota</th>
                    <th className="px-3 py-2 font-semibold">Contrato</th>
                    <th className="px-3 py-2 font-semibold">WO</th>
                    <th className="px-3 py-2 font-semibold">OS</th>
                    <th className="px-3 py-2 font-semibold">Tipo OS</th>
                    <th className="px-3 py-2 font-semibold">Cod Baixa</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Receita</th>
                  </tr>
                </thead>
                <tbody>
                  {osDoTecnicoTabela.length === 0 ? (
                    <tr>
                      <td
                        colSpan={11}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        Nenhuma O.S. para exibir.
                      </td>
                    </tr>
                  ) : (
                    osDoTecnicoTabela.map((os, index) => {
                      const valorCatalogo = valorPrecoOs(precosOs, os.tipoOs);
                      const valorNota = valorReceitaFaturadaOs(os, precosOs);
                      const ganhoReal = os.contaReceitaFaturada && valorNota > 0;
                      const perdaReal = isOsImprodutiva(os) && valorCatalogo > 0;
                      const statusNota =
                        statusNotaPorWoTecnico.get(os.numeroWo) ??
                        (os.isProdutiva ? "Produtiva" : "Improdutiva");

                      return (
                        <tr
                          key={`${os.data}-${os.numeroWo}-${os.numeroOs}-${os.codBaixa}-${index}`}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2 tabular-nums text-gray-800">
                            {formatDataBr(os.data)}
                          </td>
                          <td className="px-3 py-2 tabular-nums text-gray-700">
                            {tecnicoSelecionado.login}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {tecnicoSelecionado.nome}
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                                statusNota === "Produtiva"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-red-50 text-red-700"
                              }`}
                            >
                              {statusNota}
                            </span>
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.contrato || "—"}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {os.numeroWo || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-800">
                            {os.numeroOs || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.tipoOs || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.codBaixaBruto || String(os.codBaixa)}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.status || "—"}
                          </td>
                          <td
                            className={`whitespace-nowrap px-3 py-2 tabular-nums ${
                              ganhoReal
                                ? "font-medium text-green-600"
                                : perdaReal
                                  ? "font-medium text-red-600"
                                  : "font-normal text-gray-400"
                            }`}
                          >
                            {formatReceita(
                              perdaReal
                                ? -Math.abs(valorCatalogo)
                                : valorNota > 0
                                  ? valorNota
                                  : valorCatalogo,
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {isTabelaPrecosOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
          onClick={fecharTabelaPrecos}
        >
          <div
            className="w-11/12 max-w-2xl rounded-lg bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-800">
                Valores por Tipo de O.S.
              </h3>
              <button
                type="button"
                onClick={fecharTabelaPrecos}
                className="font-bold text-gray-500 hover:text-red-500"
                aria-label="Fechar tabela de preços"
              >
                X
              </button>
            </div>

            <input
              type="search"
              value={buscaTipoOs}
              onChange={(event) => setBuscaTipoOs(event.target.value)}
              placeholder="Buscar Tipo de O.S..."
              aria-label="Buscar Tipo de O.S."
              className="mb-4 w-full rounded-md border border-gray-300 px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
            />

            <div className="max-h-96 overflow-y-auto">
              <table className="w-full text-left text-sm text-gray-500">
                <thead className="border-b bg-gray-50 text-xs text-gray-700">
                  <tr>
                    <th className="px-4 py-2">Tipo</th>
                    <th className="px-4 py-2">Tipo de Atividade</th>
                    <th className="px-4 py-2 text-right">Valor (R$)</th>
                    <th className="px-4 py-2 text-center">Origem</th>
                  </tr>
                </thead>
                <tbody>
                  {tiposOsImportados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Nenhum Tipo de O.S. encontrado na importação TOA.
                      </td>
                    </tr>
                  ) : tiposOsFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={4}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Nenhum Tipo de O.S. encontrado para “{buscaTipoOs.trim()}”.
                      </td>
                    </tr>
                  ) : (
                    tiposOsFiltrados.map(
                      ({ chave, tipo, tipoAtividade, valor, isEstimado }) => (
                      <tr key={chave} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2">
                          <input
                            type="text"
                            value={tiposResumoEditados[chave] ?? tipo}
                            onChange={(event) =>
                              setTiposResumoEditados((atuais) => ({
                                ...atuais,
                                [chave]: event.target.value,
                              }))
                            }
                            aria-label={`Tipo resumo de ${tipoAtividade}`}
                            className="w-full min-w-[80px] rounded-md border border-gray-300 px-2 py-1 text-sm text-gray-900 outline-none focus:ring-2 focus:ring-green-500"
                          />
                        </td>
                        <td className="px-4 py-2 font-medium text-gray-900">
                          {tipoAtividade}
                        </td>
                        <td className="px-4 py-2">
                          <input
                            type="number"
                            min="0"
                            step="0.01"
                            value={valoresEditados[chave] ?? valor.toFixed(2)}
                            onChange={(event) =>
                              setValoresEditados((atuais) => ({
                                ...atuais,
                                [chave]: event.target.value,
                              }))
                            }
                            aria-label={`Valor de ${tipoAtividade}`}
                            className={`w-28 rounded-md border px-2 py-1 text-right tabular-nums outline-none focus:ring-2 focus:ring-green-500 ${
                              Number(valoresEditados[chave] ?? valor) <= 0
                                ? "border-orange-300 font-medium text-orange-500"
                                : isEstimado
                                  ? "border-amber-300 bg-amber-50 font-semibold text-amber-800"
                                  : "border-gray-300 font-semibold text-green-600"
                            }`}
                          />
                        </td>
                        <td className="px-4 py-2 text-center">
                          {Number(valoresEditados[chave] ?? valor) <= 0 ? (
                            <span className="text-xs text-orange-500">—</span>
                          ) : isEstimado ? (
                            <span
                              className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-900"
                              title="Valor estimado por semelhança de categoria/descrição"
                            >
                              ✓ Estimado
                            </span>
                          ) : (
                            <span
                              className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700"
                              title="Valor calibrado pelo histórico Analítico ou edição manual"
                            >
                              Histórico
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center text-xs text-gray-400">
              * Verde = histórico/manual · Amarelo = estimado por semelhança ·
              Laranja = ainda sem preço.
            </p>
            <button
              type="button"
              onClick={() => void salvarValoresAlterados()}
              disabled={salvandoPrecos || tiposOsImportados.length === 0}
              className="mt-4 w-full rounded-md bg-green-600 px-4 py-2 font-semibold text-white transition-colors hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {salvandoPrecos ? "Salvando..." : "Salvar Valores"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
