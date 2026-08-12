import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  Brain,
  CalendarDays,
  Clock,
  FilterX,
  Search,
  Sunrise,
  Sunset,
  Target,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FiltroCombobox } from "@/components/FiltroCombobox";
import { Top10CodigosBaixaChart } from "@/components/Top10CodigosBaixaChart";
import { agregarMotivosQuebra, type StatusContratoFiltro } from "@/components/MotivosQuebra";
import {
  fetchCompetenciasToa,
  fetchToaImportacoes,
  filtrarToaOsContabilizaveis,
  type ToaImportacaoRow,
} from "@/lib/faturamento-service";
import {
  descricaoDoCodigoBaixa,
  fetchDicionarioCodigosBaixa,
  motivoQuebraDoCodigo,
  normalizeCodigoBaixa,
  statusContratoDoCodigo,
  type DicionarioCodigosBaixaMap,
} from "@/lib/dicionario-codigos-baixa";
import {
  isCodBaixaProdutivo,
  isStatusExecutada,
  normalizeToaLogin,
} from "@/lib/toa-store";

const MESES = [
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

/** JS getDay(): 0=Dom … 6=Sáb — UI só Seg–Sáb. */
const DIAS_UTEIS = [
  { dow: 1, label: "Segunda", curto: "Seg" },
  { dow: 2, label: "Terça", curto: "Ter" },
  { dow: 3, label: "Quarta", curto: "Qua" },
  { dow: 4, label: "Quinta", curto: "Qui" },
  { dow: 5, label: "Sexta", curto: "Sex" },
  { dow: 6, label: "Sábado", curto: "Sáb" },
] as const;

const TECNICO_TODOS = "Todos";
const DESCRICAO_DESCONHECIDA = "Motivo Desconhecido";
const PIE_COLORS = {
  improdutivo: { manha: "#f59e0b", tarde: "#dc2626" },
  produtivo: { manha: "#4ade80", tarde: "#16a34a" },
} as const;

type Turno = "Manhã" | "Tarde";

type DiaSemanaAgg = {
  dow: number;
  dia: string;
  diaCurto: string;
  produtivas: number;
  improdutivas: number;
  taxaReprovacao: number;
};

type RankingUsoCodigoDia = {
  pct: number | null;
  janela: string | null;
};

type RankingUsoCodigo = {
  login: string;
  nome: string;
  usosCodigo: number;
  totalQuebras: number;
  representaPct: number;
  porDia: Record<number, RankingUsoCodigoDia>;
};

type AbaPainelInferior =
  | "rank-geral"
  | "ranking"
  | "janela"
  | "todos-codigos";

const ABAS_PAINEL_INFERIOR: ReadonlyArray<{
  id: AbaPainelInferior;
  label: string;
}> = [
  { id: "rank-geral", label: "Rank Geral" },
  { id: "ranking", label: "Ranking de Uso" },
  { id: "janela", label: "Janela Improdutiva" },
  { id: "todos-codigos", label: "Todos os códigos de baixa" },
];

type JanelaImprodutivaAgg = {
  janela: string;
  codigoVencedor: string;
  descricaoVencedor: string;
  tipoVencedor: string;
  /** Quebras (improdutivo) ou notas do status (produtivo) na janela. */
  quantidadeJanela: number;
  /** Denominador: total de notas na janela (improd.) ou total alvo (prod.). */
  totalBucket: number;
  representaPct: number;
};

type RaioXQuebra = {
  key: string;
  data: string;
  dia: string;
  hora: string;
  codBaixa: string;
  descricao: string;
  bairro: string;
  contrato: string;
  numeroWo: string;
};

type Top3TipoOsItem = {
  nome: string;
  percentual: number;
};

type TecnicoDiaDetalheAgg = {
  nome: string;
  produtivas: number;
  improdutivas: number;
  aproveitamento: number;
  top3Prod: Top3TipoOsItem[];
  top3Improd: Top3TipoOsItem[];
};

type OrdemDirecao = "asc" | "desc";

type OrdemDiaState = {
  coluna: "produtivas" | "improdutivas" | "aproveitamento";
  direcao: OrdemDirecao;
};

type OrdemMatrizState = {
  coluna: "produtivasTotal" | "aprovGeral" | number;
  direcao: OrdemDirecao;
};

type OrdemRankGeralState = {
  coluna:
    | "produtivasGeral"
    | "quebrasGeral"
    | "aproveitamento"
    | "reprovacao"
    | number;
  direcao: OrdemDirecao;
};

type DiaCelulaSemana = {
  aproveitamento: number | null;
  piorJanela: string | null;
};

type DiaCelulaRankGeral = {
  pct: number | null;
  janela: string | null;
};

type TecnicoSemanaMatrizAgg = {
  nome: string;
  produtivasTotal: number;
  aproveitamentoGeral: number;
  porDia: Record<number, DiaCelulaSemana>;
};

type RankGeralTecnicoAgg = {
  nome: string;
  produtivasGeral: number;
  quebrasGeral: number;
  aproveitamento: number;
  reprovacao: number;
  porDia: Record<number, DiaCelulaRankGeral>;
};

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function formatPct(n: number): string {
  return `${n.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatDataBr(isoDate: string): string {
  const [ano, mes, dia] = isoDate.split("-");
  if (!ano || !mes || !dia) return isoDate || "—";
  return `${dia}/${mes}/${ano}`;
}

function isLinhaOsImprodutiva(row: ToaImportacaoRow): boolean {
  const cod =
    row.cod_baixa != null && Number.isFinite(Number(row.cod_baixa))
      ? Number(row.cod_baixa)
      : 0;
  if (cod <= 0) return false;
  if (isStatusExecutada(row.status_os || "") && isCodBaixaProdutivo(cod)) {
    return false;
  }
  return true;
}

function parseIsoLocalParts(iso: string): {
  ano: number;
  mes: number;
  dia: number;
} | null {
  const s = String(iso ?? "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const ano = Number(s.slice(0, 4));
  const mes = Number(s.slice(5, 7));
  const dia = Number(s.slice(8, 10));
  if (!ano || mes < 1 || mes > 12 || dia < 1) return null;
  return { ano, mes, dia };
}

function diaDaSemanaFromIso(iso: string): number | null {
  const parts = parseIsoLocalParts(iso);
  if (!parts) return null;
  return new Date(parts.ano, parts.mes - 1, parts.dia).getDay();
}

/**
 * Extrai a hora real da baixa a partir de "Inicio-Fim".
 * Preferência: horário de FIM (conclusão/baixa); fallback: início.
 * Retorna hora 0–23 ou null.
 */
function extrairHoraBaixa(inicioFim: string | null | undefined): number | null {
  const s = String(inicioFim ?? "").trim();
  if (!s) return null;
  const matches = [...s.matchAll(/(\d{1,2})[:hH](\d{2})/g)];
  if (matches.length === 0) return null;
  const escolhido = matches[matches.length - 1]!;
  const hora = Number(escolhido[1]);
  if (!Number.isFinite(hora) || hora < 0 || hora > 23) return null;
  return hora;
}

/**
 * Hora da baixa para classificação de turno/janela.
 * Fonte da verdade: fim de inicio_fim. Fallback raro: início numérico da
 * janela SLA (só se inicio_fim estiver vazio) para não orphanar a nota.
 */
function horaBaixaDaRow(row: ToaImportacaoRow): number {
  const real = extrairHoraBaixa(row.inicio_fim);
  if (real != null) return real;
  const sla = String(row.janela_servico_1 ?? "").trim().match(/(\d{1,2})/);
  if (sla) {
    const h = Number(sla[1]);
    if (Number.isFinite(h) && h >= 0 && h <= 23) return h;
  }
  return 12;
}

/** Manhã: 00:00–11:59 | Tarde: 12:00–23:59 */
function classificarTurno(hora: number): Turno {
  return hora < 12 ? "Manhã" : "Tarde";
}

function padHoraFaixa(h: number): string {
  return String(h).padStart(2, "0");
}

/** Blocos de 4h alinhados ao turno (00-04…08-12 | 12-16…20-24). */
function janelaMacroDaHora(hora: number): string {
  const inicio = Math.floor(hora / 4) * 4;
  const fim = inicio + 4;
  return `${padHoraFaixa(inicio)} - ${padHoraFaixa(fim)}`;
}

/** Blocos de 1h dentro da macro (ex.: 08-09, 14-15). */
function janelaMicroDaHora(hora: number): string {
  const fim = hora + 1;
  return `${padHoraFaixa(hora)} - ${padHoraFaixa(fim)}`;
}

/** Turno da O.S. a partir da hora real da baixa. */
function turnoDaRow(row: ToaImportacaoRow): Turno {
  return classificarTurno(horaBaixaDaRow(row));
}

function formatHoraDeInicioFim(inicioFim: string | null | undefined): string {
  const s = String(inicioFim ?? "").trim();
  if (!s) return "—";
  const matches = [...s.matchAll(/(\d{1,2})[:hH](\d{2})/g)];
  if (matches.length === 0) return s.slice(0, 16) || "—";
  const escolhido = matches[matches.length - 1]!;
  return `${String(escolhido[1]).padStart(2, "0")}:${escolhido[2]}`;
}

/** Formata janelas "15 - 18" / "14:45 - 15:45" → "15h - 18h" / "14:45h - 15:45h". */
function formatarJanelaHorario(
  janela: string | null | undefined,
): string {
  const s = String(janela ?? "").trim();
  if (!s) return "—";
  const partes = s.split(/\s*-\s*/).map((p) => p.trim()).filter(Boolean);
  if (partes.length === 0) return "—";
  return partes
    .map((parte) => (parte.endsWith("h") || parte.endsWith("H") ? parte : `${parte}h`))
    .join(" - ");
}

function codigoDominanteNoMap(codigos: Map<string, number>): string {
  let melhor = "";
  let melhorQtd = 0;
  for (const [codigo, qtd] of codigos) {
    if (
      qtd > melhorQtd ||
      (qtd === melhorQtd &&
        (melhor === "" ||
          Number(codigo) - Number(melhor) < 0 ||
          (Number(codigo) === Number(melhor) &&
            codigo.localeCompare(melhor, "pt-BR") < 0)))
    ) {
      melhor = codigo;
      melhorQtd = qtd;
    }
  }
  return melhor || "—";
}

/**
 * Ranking consolidado por janela MACRO (4h), mesma matemática do card Macro:
 * - PRODUTIVO: volume da janela / total de notas produtivas (alvo)
 * - IMPRODUTIVO: quebras da janela / total de notas da janela
 * Ordenado do maior percentual para o menor.
 */
function agregarRankingJanelasMacro(params: {
  statusFiltro: StatusContratoFiltro;
  notasAlvo: ToaImportacaoRow[];
  notasFiltradas: ToaImportacaoRow[];
  dicionario: DicionarioCodigosBaixaMap;
  isQuebra: (nota: ToaImportacaoRow) => boolean;
}): JanelaImprodutivaAgg[] {
  const { statusFiltro, notasAlvo, notasFiltradas, dicionario, isQuebra } =
    params;
  const isImprodutivo = statusFiltro === "IMPRODUTIVO";

  type Bucket = {
    quantidade: number;
    total: number;
    codigos: Map<string, number>;
  };
  const buckets = new Map<string, Bucket>();

  if (isImprodutivo) {
    for (const nota of notasFiltradas) {
      const janela = janelaMacroDaHora(horaBaixaDaRow(nota));
      let b = buckets.get(janela);
      if (!b) {
        b = { quantidade: 0, total: 0, codigos: new Map() };
        buckets.set(janela, b);
      }
      b.total += 1;
      if (!isQuebra(nota)) continue;
      b.quantidade += 1;
      const codigo = normalizeCodigoBaixa(nota.cod_baixa);
      if (codigo) b.codigos.set(codigo, (b.codigos.get(codigo) ?? 0) + 1);
    }
  } else {
    const totalAlvo = notasAlvo.length;
    if (totalAlvo === 0) return [];
    for (const nota of notasAlvo) {
      const janela = janelaMacroDaHora(horaBaixaDaRow(nota));
      let b = buckets.get(janela);
      if (!b) {
        b = { quantidade: 0, total: totalAlvo, codigos: new Map() };
        buckets.set(janela, b);
      }
      b.quantidade += 1;
      const codigo = normalizeCodigoBaixa(nota.cod_baixa);
      if (codigo) b.codigos.set(codigo, (b.codigos.get(codigo) ?? 0) + 1);
    }
  }

  const resultado: JanelaImprodutivaAgg[] = [];
  for (const [janela, b] of buckets) {
    if (isImprodutivo && b.total === 0) continue;
    if (!isImprodutivo && b.quantidade === 0) continue;
    const codigoVencedor = codigoDominanteNoMap(b.codigos);
    const representaPct = isImprodutivo
      ? b.total > 0
        ? (b.quantidade / b.total) * 100
        : 0
      : b.total > 0
        ? (b.quantidade / b.total) * 100
        : 0;
    resultado.push({
      janela,
      codigoVencedor,
      descricaoVencedor:
        codigoVencedor === "—"
          ? "—"
          : descricaoDoCodigoBaixa(codigoVencedor, dicionario),
      tipoVencedor:
        codigoVencedor === "—"
          ? "—"
          : motivoQuebraDoCodigo(codigoVencedor, dicionario)?.trim() ||
            "Não classificado",
      quantidadeJanela: b.quantidade,
      totalBucket: b.total,
      representaPct,
    });
  }

  return resultado.sort(
    (a, b) =>
      b.representaPct - a.representaPct ||
      b.quantidadeJanela - a.quantidadeJanela ||
      a.janela.localeCompare(b.janela, "pt-BR"),
  );
}

function notaNoDiaLabel(row: ToaImportacaoRow, diaLabel: string): boolean {
  const dow = diaDaSemanaFromIso(row.data_toa);
  if (dow == null || dow === 0) return false;
  const meta = DIAS_UTEIS.find((d) => d.dow === dow);
  return meta?.label === diaLabel;
}

function nomeTecnicoRow(row: ToaImportacaoRow): string {
  const nome = row.nome_tecnico?.trim();
  if (nome) return nome;
  const login = normalizeToaLogin(row.login_tecnico);
  return login || "—";
}

function top3TipoOsLabels(notas: ToaImportacaoRow[]): Top3TipoOsItem[] {
  const counts = new Map<string, number>();
  for (const nota of notas) {
    const tipo = String(nota.tipo_os ?? "").trim() || "—";
    counts.set(tipo, (counts.get(tipo) ?? 0) + 1);
  }
  const total = [...counts.values()].reduce((acc, n) => acc + n, 0);
  if (total === 0) return [];
  return [...counts.entries()]
    .sort(
      (a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
    )
    .slice(0, 3)
    .map(([tipo, qtd]) => ({
      nome: tipo,
      percentual: (qtd / total) * 100,
    }));
}

function setaOrdenacao(
  ativa: boolean,
  direcao: OrdemDirecao,
): string {
  if (!ativa) return "";
  return direcao === "asc" ? " ↑" : " ↓";
}

function valorOrdenacaoComNulos(
  valor: number | null | undefined,
  direcao: OrdemDirecao,
): number {
  if (valor == null || !Number.isFinite(valor)) {
    return direcao === "desc"
      ? Number.NEGATIVE_INFINITY
      : Number.POSITIVE_INFINITY;
  }
  return valor;
}

function janelaDominantePorStatus(
  notas: ToaImportacaoRow[],
  dicionario: DicionarioCodigosBaixaMap,
  status: StatusContratoFiltro,
): string | null {
  const counts = new Map<string, number>();
  for (const row of notas) {
    const codigo = normalizeCodigoBaixa(row.cod_baixa);
    if (!codigo) continue;
    if (statusContratoDoCodigo(codigo, dicionario) !== status) continue;
    const janela = janelaMacroDaHora(horaBaixaDaRow(row));
    counts.set(janela, (counts.get(janela) ?? 0) + 1);
  }
  let melhor: string | null = null;
  let qtdMax = 0;
  for (const [janela, qtd] of counts) {
    if (
      qtd > qtdMax ||
      (qtd === qtdMax &&
        melhor != null &&
        janela.localeCompare(melhor, "pt-BR") < 0)
    ) {
      melhor = janela;
      qtdMax = qtd;
    } else if (melhor == null && qtd > 0) {
      melhor = janela;
      qtdMax = qtd;
    }
  }
  return melhor;
}

function piorJanelaImprodutiva(
  notas: ToaImportacaoRow[],
  dicionario: DicionarioCodigosBaixaMap,
): string | null {
  return janelaDominantePorStatus(notas, dicionario, "IMPRODUTIVO");
}

function piorJanelaDasNotas(notas: ToaImportacaoRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of notas) {
    const janela = janelaMacroDaHora(horaBaixaDaRow(row));
    counts.set(janela, (counts.get(janela) ?? 0) + 1);
  }
  let melhor: string | null = null;
  let qtdMax = 0;
  for (const [janela, qtd] of counts) {
    if (
      qtd > qtdMax ||
      (qtd === qtdMax &&
        melhor != null &&
        janela.localeCompare(melhor, "pt-BR") < 0)
    ) {
      melhor = janela;
      qtdMax = qtd;
    } else if (melhor == null && qtd > 0) {
      melhor = janela;
      qtdMax = qtd;
    }
  }
  return melhor;
}

function parseCodigoFromOpcao(label: string): string | null {
  const s = label.trim();
  if (!s || s === "Todos") return null;
  const match = s.match(/^(\d+)/);
  if (match) return match[1]!;
  return normalizeCodigoBaixa(s) || null;
}

/** 1 nota (WO) por chave — status_nota da visita. */
function dedupeNotasPorWo(rows: ToaImportacaoRow[]): ToaImportacaoRow[] {
  const map = new Map<string, ToaImportacaoRow>();
  for (const row of rows) {
    const wo = String(row.numero_wo ?? "").trim();
    const key =
      wo ||
      `${normalizeToaLogin(row.login_tecnico)}|${row.data_toa}|${row.contrato}`;
    if (!key) continue;
    const prev = map.get(key);
    if (!prev) {
      map.set(key, row);
      continue;
    }
    // Preferir marcar Produtiva se qualquer linha da WO for produtiva.
    if (
      prev.status_nota !== "Produtiva" &&
      row.status_nota === "Produtiva"
    ) {
      map.set(key, row);
    }
  }
  return [...map.values()];
}

export function AnaliseComportamento() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [dicionario, setDicionario] = useState<DicionarioCodigosBaixaMap>({});
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>(TECNICO_TODOS);
  const [codigoFiltro, setCodigoFiltro] = useState<string | null>(null);
  const [statusFiltro, setStatusFiltro] =
    useState<StatusContratoFiltro>("IMPRODUTIVO");
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [modalDiaAberto, setModalDiaAberto] = useState(false);
  const [diaFiltroModal, setDiaFiltroModal] = useState<string | null>(null);
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState("");
  const [modalAno, setModalAno] = useState<number | null>(null);
  const [modalMes, setModalMes] = useState<number | null>(null);
  const [rowsModal, setRowsModal] = useState<ToaImportacaoRow[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [modalTop10Aberto, setModalTop10Aberto] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState<AbaPainelInferior>("rank-geral");
  const [ordemDia, setOrdemDia] = useState<OrdemDiaState>({
    coluna: "produtivas",
    direcao: "desc",
  });
  const [ordemMatriz, setOrdemMatriz] = useState<OrdemMatrizState>({
    coluna: "produtivasTotal",
    direcao: "desc",
  });
  const [ordemRankGeral, setOrdemRankGeral] = useState<OrdemRankGeralState>({
    coluna: "produtivasGeral",
    direcao: "desc",
  });
  const [filtroJanela, setFiltroJanela] = useState("Todos");
  const [filtroDia, setFiltroDia] = useState("Todos");
  const [filtroCodBaixa, setFiltroCodBaixa] = useState("Todos");
  const [buscaCodBaixa, setBuscaCodBaixa] = useState("");
  const [buscaTecnicoRank, setBuscaTecnicoRank] = useState("");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [comps, dic] = await Promise.all([
          fetchCompetenciasToa(),
          fetchDicionarioCodigosBaixa().catch((err) => {
            console.error(
              "Erro ao carregar dicionário de códigos de baixa:",
              err,
            );
            return {} as DicionarioCodigosBaixaMap;
          }),
        ]);
        if (cancelled) return;
        setCompetencias(comps);
        setDicionario(dic);
      } catch {
        if (!cancelled) setCompetencias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (periodoSeeded || competencias.length === 0) return;
    const ultima = competencias[competencias.length - 1]!;
    setAno(Math.floor(ultima / 100));
    setMes(ultima % 100);
    setPeriodoSeeded(true);
  }, [competencias, periodoSeeded]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const flat = await fetchToaImportacoes({
          ano,
          mes,
          dia: null,
        });
        if (cancelled) return;
        setRows(filtrarToaOsContabilizaveis(flat));
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar análise de comportamento:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a análise de comportamento TOA.",
        );
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [ano, mes]);

  const anosDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      if (a >= 2000) set.add(a);
    }
    return [...set].sort((a, b) => b - a);
  }, [competencias]);

  const mesesDisponiveis = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      const m = ym % 100;
      if (ano !== null && a !== ano) continue;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [competencias, ano]);

  const mesesDisponiveisModal = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      const m = ym % 100;
      if (modalAno !== null && a !== modalAno) continue;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [competencias, modalAno]);

  const tecnicosDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const nome = nomeTecnicoRow(row);
      if (!nome || nome === "—") continue;
      if (!map.has(nome)) map.set(nome, nome);
    }
    return [...map.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  const opcoesCodigoBaixa = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      if (statusContratoDoCodigo(codigo, dicionario) !== statusFiltro) continue;
      if (map.has(codigo)) continue;
      const desc = descricaoDoCodigoBaixa(codigo, dicionario);
      map.set(codigo, `${codigo} - ${desc}`);
    }
    return [...map.entries()]
      .sort(
        (a, b) =>
          Number(a[0]) - Number(b[0]) || a[0].localeCompare(b[0], "pt-BR"),
      )
      .map(([, label]) => label);
  }, [rows, dicionario, statusFiltro]);

  const codigoFiltroLabel = useMemo(() => {
    if (!codigoFiltro) return "Todos";
    return (
      opcoesCodigoBaixa.find((opt) => parseCodigoFromOpcao(opt) === codigoFiltro) ??
      `${codigoFiltro} - ${descricaoDoCodigoBaixa(codigoFiltro, dicionario)}`
    );
  }, [codigoFiltro, opcoesCodigoBaixa, dicionario]);

  useEffect(() => {
    if (tecnicoFiltro === TECNICO_TODOS) return;
    if (!tecnicosDisponiveis.includes(tecnicoFiltro)) {
      setTecnicoFiltro(TECNICO_TODOS);
    }
  }, [tecnicosDisponiveis, tecnicoFiltro]);

  useEffect(() => {
    if (!codigoFiltro) return;
    const statusDoCodigo = statusContratoDoCodigo(codigoFiltro, dicionario);
    if (statusDoCodigo !== statusFiltro) {
      setCodigoFiltro(null);
    }
  }, [statusFiltro, codigoFiltro, dicionario]);

  const rowsFiltradas = useMemo(() => {
    if (tecnicoFiltro === TECNICO_TODOS) return rows;
    const alvo = tecnicoFiltro.trim().toLowerCase();
    return rows.filter(
      (row) => nomeTecnicoRow(row).trim().toLowerCase() === alvo,
    );
  }, [rows, tecnicoFiltro]);

  const notasFiltradas = useMemo(
    () => dedupeNotasPorWo(rowsFiltradas),
    [rowsFiltradas],
  );

  const quebrasOs = useMemo(
    () =>
      rowsFiltradas.filter(
        (row) =>
          row.status_nota === "Improdutiva" && isLinhaOsImprodutiva(row),
      ),
    [rowsFiltradas],
  );

  const porDiaSemana = useMemo((): DiaSemanaAgg[] => {
    const buckets = new Map<
      number,
      { produtivas: number; improdutivas: number }
    >();
    for (const d of DIAS_UTEIS) {
      buckets.set(d.dow, { produtivas: 0, improdutivas: 0 });
    }

    for (const nota of notasFiltradas) {
      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow == null || dow === 0) continue;
      const bucket = buckets.get(dow);
      if (!bucket) continue;
      if (nota.status_nota === "Produtiva") bucket.produtivas += 1;
      else bucket.improdutivas += 1;
    }

    return DIAS_UTEIS.map((d) => {
      const b = buckets.get(d.dow)!;
      const total = b.produtivas + b.improdutivas;
      return {
        dow: d.dow,
        dia: d.label,
        diaCurto: d.curto,
        produtivas: b.produtivas,
        improdutivas: b.improdutivas,
        taxaReprovacao: total > 0 ? (b.improdutivas / total) * 100 : 0,
      };
    });
  }, [notasFiltradas]);

  /** Notas do período (Ano/Mês/Técnico) no status selecionado — total geral. */
  const notasStatusGlobais = useMemo(() => {
    return rowsFiltradas.filter((row) => {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) return false;
      return statusContratoDoCodigo(codigo, dicionario) === statusFiltro;
    });
  }, [rowsFiltradas, dicionario, statusFiltro]);

  /** Base dos cards 1–4 e 6: com filtro de código, restringe; senão = globais. */
  const notasAlvo = useMemo(() => {
    if (!codigoFiltro) return notasStatusGlobais;
    return notasStatusGlobais.filter(
      (row) => normalizeCodigoBaixa(row.cod_baixa) === codigoFiltro,
    );
  }, [notasStatusGlobais, codigoFiltro]);

  const totalNotasGlobais = notasStatusGlobais.length;
  const totalNotasAlvo = notasAlvo.length;

  const rowsParaTop10 = useMemo(() => {
    if (!codigoFiltro) return rowsFiltradas;
    return rowsFiltradas.filter(
      (row) => normalizeCodigoBaixa(row.cod_baixa) === codigoFiltro,
    );
  }, [rowsFiltradas, codigoFiltro]);

  const porTurno = useMemo(() => {
    let manha = 0;
    let tarde = 0;
    for (const row of notasAlvo) {
      if (turnoDaRow(row) === "Manhã") manha += 1;
      else tarde += 1;
    }
    const cores =
      statusFiltro === "IMPRODUTIVO"
        ? PIE_COLORS.improdutivo
        : PIE_COLORS.produtivo;
    return {
      manha,
      tarde,
      chart: [
        { name: "Manhã", value: manha, fill: cores.manha },
        { name: "Tarde", value: tarde, fill: cores.tarde },
      ].filter((p) => p.value > 0),
    };
  }, [notasAlvo, statusFiltro]);

  const isQuebraCard = (nota: ToaImportacaoRow): boolean => {
    if (nota.status_nota !== "Improdutiva") return false;
    if (!codigoFiltro) return true;
    return normalizeCodigoBaixa(nota.cod_baixa) === codigoFiltro;
  };

  /** Card 4: volume (produtivo) ou taxa de reprovação (improdutivo). */
  const turnoMaiorFadiga = useMemo(() => {
    if (statusFiltro === "PRODUTIVO") {
      if (!notasAlvo.length) return null;
      if (porTurno.tarde > porTurno.manha) {
        return {
          turno: "Tarde" as const,
          quebras: porTurno.tarde,
          totalBucket: porTurno.tarde,
          taxa: 100,
        };
      }
      if (porTurno.manha > porTurno.tarde) {
        return {
          turno: "Manhã" as const,
          quebras: porTurno.manha,
          totalBucket: porTurno.manha,
          taxa: 100,
        };
      }
      return {
        turno: "Empate" as const,
        quebras: porTurno.manha,
        totalBucket: porTurno.manha,
        taxa: 100,
      };
    }

    if (!notasFiltradas.length) return null;

    let manhaQ = 0;
    let manhaT = 0;
    let tardeQ = 0;
    let tardeT = 0;
    for (const nota of notasFiltradas) {
      const turno = turnoDaRow(nota);
      if (turno === "Manhã") {
        manhaT += 1;
        if (isQuebraCard(nota)) manhaQ += 1;
      } else {
        tardeT += 1;
        if (isQuebraCard(nota)) tardeQ += 1;
      }
    }
    if (manhaT === 0 && tardeT === 0) return null;

    const taxaM = manhaT > 0 ? (manhaQ / manhaT) * 100 : 0;
    const taxaT = tardeT > 0 ? (tardeQ / tardeT) * 100 : 0;

    if (taxaT > taxaM || (taxaT === taxaM && tardeQ > manhaQ)) {
      return {
        turno: "Tarde" as const,
        quebras: tardeQ,
        totalBucket: tardeT,
        taxa: taxaT,
      };
    }
    if (taxaM > taxaT || (taxaM === taxaT && manhaQ > tardeQ)) {
      return {
        turno: "Manhã" as const,
        quebras: manhaQ,
        totalBucket: manhaT,
        taxa: taxaM,
      };
    }
    return {
      turno: "Empate" as const,
      quebras: manhaQ,
      totalBucket: manhaT,
      taxa: taxaM,
    };
  }, [statusFiltro, notasAlvo.length, porTurno, notasFiltradas, codigoFiltro]);

  type JanelaCardAgg = {
    janela: string;
    quantidade: number;
    totalBucket: number;
    taxa: number;
  };

  /**
   * Ranking + cards Macro/Micro: mesma base matemática.
   * Macro = 1ª linha do ranking por janela 4h (sem fragmentar por dia/turno/código).
   * Micro = melhor 1h dentro da macro vencedora.
   */
  const analiseJanelasMacro = useMemo(() => {
    const ranking = agregarRankingJanelasMacro({
      statusFiltro,
      notasAlvo,
      notasFiltradas,
      dicionario,
      isQuebra: isQuebraCard,
    });

    const topo = ranking[0];
    const macro: JanelaCardAgg | null = topo
      ? {
          janela: topo.janela,
          quantidade: topo.quantidadeJanela,
          totalBucket: topo.totalBucket,
          taxa: topo.representaPct,
        }
      : null;

    if (!macro) return { ranking, macro: null, micro: null };

    const vencedoraVolume = (
      counts: Map<string, number>,
    ): JanelaCardAgg | null => {
      let melhor: string | null = null;
      let quantidade = 0;
      for (const [janela, qtd] of counts) {
        if (
          qtd > quantidade ||
          (qtd === quantidade &&
            melhor != null &&
            janela.localeCompare(melhor, "pt-BR") < 0)
        ) {
          melhor = janela;
          quantidade = qtd;
        } else if (melhor == null && qtd > 0) {
          melhor = janela;
          quantidade = qtd;
        }
      }
      return melhor
        ? { janela: melhor, quantidade, totalBucket: quantidade, taxa: 100 }
        : null;
    };

    const vencedoraTaxa = (
      buckets: Map<string, { quebras: number; total: number }>,
    ): JanelaCardAgg | null => {
      let melhor: JanelaCardAgg | null = null;
      for (const [janela, b] of buckets) {
        if (b.total === 0) continue;
        const taxa = (b.quebras / b.total) * 100;
        const cand: JanelaCardAgg = {
          janela,
          quantidade: b.quebras,
          totalBucket: b.total,
          taxa,
        };
        if (
          !melhor ||
          cand.taxa > melhor.taxa ||
          (cand.taxa === melhor.taxa &&
            cand.quantidade > melhor.quantidade) ||
          (cand.taxa === melhor.taxa &&
            cand.quantidade === melhor.quantidade &&
            cand.janela.localeCompare(melhor.janela, "pt-BR") < 0)
        ) {
          melhor = cand;
        }
      }
      return melhor;
    };

    if (statusFiltro === "PRODUTIVO") {
      const countsMicro = new Map<string, number>();
      for (const row of notasAlvo) {
        const hora = horaBaixaDaRow(row);
        if (janelaMacroDaHora(hora) !== macro.janela) continue;
        const micro = janelaMicroDaHora(hora);
        countsMicro.set(micro, (countsMicro.get(micro) ?? 0) + 1);
      }
      return { ranking, macro, micro: vencedoraVolume(countsMicro) };
    }

    const bucketsMicro = new Map<string, { quebras: number; total: number }>();
    for (const nota of notasFiltradas) {
      const hora = horaBaixaDaRow(nota);
      if (janelaMacroDaHora(hora) !== macro.janela) continue;
      const micro = janelaMicroDaHora(hora);
      let b = bucketsMicro.get(micro);
      if (!b) {
        b = { quebras: 0, total: 0 };
        bucketsMicro.set(micro, b);
      }
      b.total += 1;
      if (isQuebraCard(nota)) b.quebras += 1;
    }

    return { ranking, macro, micro: vencedoraTaxa(bucketsMicro) };
  }, [statusFiltro, notasAlvo, notasFiltradas, dicionario, codigoFiltro]);

  const rankingPorJanelaBase = analiseJanelasMacro.ranking;
  const janelaImprodutivaMacro = analiseJanelasMacro.macro;
  const janelaImprodutivaMicro = analiseJanelasMacro.micro;

  const codOfensor = useMemo(() => {
    const counts = new Map<string, number>();
    const totalImprodutivas = notasStatusGlobais.length;

    for (const row of notasStatusGlobais) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      counts.set(codigo, (counts.get(codigo) ?? 0) + 1);
    }

    let melhorCodigo: string | null = null;
    let melhorQtd = 0;
    for (const [codigo, qtd] of counts) {
      if (
        qtd > melhorQtd ||
        (qtd === melhorQtd &&
          melhorCodigo != null &&
          Number(codigo) - Number(melhorCodigo) < 0)
      ) {
        melhorCodigo = codigo;
        melhorQtd = qtd;
      } else if (melhorCodigo == null && qtd > 0) {
        melhorCodigo = codigo;
        melhorQtd = qtd;
      }
    }

    if (!melhorCodigo || totalImprodutivas === 0) {
      return {
        totalImprodutivas,
        counts,
        ofensor: null as null | {
          codigo: string;
          quantidade: number;
          pct: number;
        },
      };
    }
    return {
      totalImprodutivas,
      counts,
      ofensor: {
        codigo: melhorCodigo,
        quantidade: melhorQtd,
        pct: (melhorQtd / totalImprodutivas) * 100,
      },
    };
  }, [notasStatusGlobais]);

  const codigoOfensorVencedor = codOfensor.ofensor?.codigo ?? null;
  const codigoAlvo = codigoFiltro || codigoOfensorVencedor;

  /** Card 5: ofensor global ou código filtrado vs total geral. */
  const cardCodigoExibido = useMemo(() => {
    if (!codigoFiltro) return codOfensor.ofensor;
    if (totalNotasGlobais === 0) return null;
    return {
      codigo: codigoFiltro,
      quantidade: totalNotasAlvo,
      pct: (totalNotasAlvo / totalNotasGlobais) * 100,
    };
  }, [codigoFiltro, codOfensor.ofensor, totalNotasAlvo, totalNotasGlobais]);

  const tipoOfensorMacro = useMemo(() => {
    if (!notasAlvo.length) return null;

    const counts = new Map<string, number>();
    for (const row of notasAlvo) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      const motivo =
        motivoQuebraDoCodigo(codigo, dicionario)?.trim() || "Não classificado";
      counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
    }

    let melhor: string | null = null;
    let quantidade = 0;
    for (const [motivo, qtd] of counts) {
      if (
        qtd > quantidade ||
        (qtd === quantidade &&
          melhor != null &&
          motivo.localeCompare(melhor, "pt-BR") < 0)
      ) {
        melhor = motivo;
        quantidade = qtd;
      } else if (melhor == null && qtd > 0) {
        melhor = motivo;
        quantidade = qtd;
      }
    }
    return melhor ? { motivo: melhor, quantidade } : null;
  }, [notasAlvo, dicionario]);

  /** Card 3: volume (produtivo) ou taxa de reprovação do dia (improdutivo). */
  const diaMaisCritico = useMemo(() => {
    if (statusFiltro === "PRODUTIVO") {
      if (!notasAlvo.length) return null;
      const counts = new Map<number, number>();
      for (const row of notasAlvo) {
        const dow = diaDaSemanaFromIso(row.data_toa);
        if (dow == null || dow === 0) continue;
        counts.set(dow, (counts.get(dow) ?? 0) + 1);
      }
      let bestDow: number | null = null;
      let bestQtd = 0;
      for (const [dow, qtd] of counts) {
        if (
          qtd > bestQtd ||
          (qtd === bestQtd && bestDow != null && dow < bestDow)
        ) {
          bestDow = dow;
          bestQtd = qtd;
        } else if (bestDow == null && qtd > 0) {
          bestDow = dow;
          bestQtd = qtd;
        }
      }
      if (bestDow == null || bestQtd === 0) return null;
      const meta = DIAS_UTEIS.find((d) => d.dow === bestDow);
      return {
        dia: meta?.label ?? "—",
        quantidade: bestQtd,
        totalBucket: totalNotasAlvo,
        pct: totalNotasAlvo > 0 ? (bestQtd / totalNotasAlvo) * 100 : 0,
      };
    }

    const buckets = new Map<
      number,
      { quebras: number; total: number }
    >();
    for (const nota of notasFiltradas) {
      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow == null || dow === 0) continue;
      let b = buckets.get(dow);
      if (!b) {
        b = { quebras: 0, total: 0 };
        buckets.set(dow, b);
      }
      b.total += 1;
      if (isQuebraCard(nota)) b.quebras += 1;
    }

    let bestDow: number | null = null;
    let bestQuebras = 0;
    let bestTotal = 0;
    let bestTaxa = -1;
    for (const [dow, b] of buckets) {
      if (b.total === 0) continue;
      const taxa = (b.quebras / b.total) * 100;
      if (
        taxa > bestTaxa ||
        (taxa === bestTaxa && b.quebras > bestQuebras) ||
        (taxa === bestTaxa &&
          b.quebras === bestQuebras &&
          bestDow != null &&
          dow < bestDow)
      ) {
        bestDow = dow;
        bestQuebras = b.quebras;
        bestTotal = b.total;
        bestTaxa = taxa;
      }
    }
    if (bestDow == null || bestTaxa < 0) return null;
    const meta = DIAS_UTEIS.find((d) => d.dow === bestDow);
    return {
      dia: meta?.label ?? "—",
      quantidade: bestQuebras,
      totalBucket: bestTotal,
      pct: bestTaxa,
    };
  }, [
    statusFiltro,
    notasAlvo,
    totalNotasAlvo,
    notasFiltradas,
    codigoFiltro,
  ]);

  const rankingUsoCodigo = useMemo((): RankingUsoCodigo[] => {
    if (!codigoAlvo) return [];

    type DiaAcc = {
      usosCodigo: number;
      totalQuebras: number;
      notasCodigo: ToaImportacaoRow[];
    };
    type Acc = {
      login: string;
      nome: string;
      usosCodigo: number;
      totalQuebras: number;
      porDia: Map<number, DiaAcc>;
    };
    const byTech = new Map<string, Acc>();

    const ensure = (row: ToaImportacaoRow): Acc => {
      const login = normalizeToaLogin(row.login_tecnico) || nomeTecnicoRow(row);
      const nome = nomeTecnicoRow(row);
      let acc = byTech.get(login);
      if (!acc) {
        acc = {
          login,
          nome,
          usosCodigo: 0,
          totalQuebras: 0,
          porDia: new Map(),
        };
        byTech.set(login, acc);
      } else if (nome !== "—" && (acc.nome === "—" || acc.nome === login)) {
        acc.nome = nome;
      }
      return acc;
    };

    const ensureDia = (acc: Acc, dow: number): DiaAcc => {
      let dia = acc.porDia.get(dow);
      if (!dia) {
        dia = { usosCodigo: 0, totalQuebras: 0, notasCodigo: [] };
        acc.porDia.set(dow, dia);
      }
      return dia;
    };

    for (const row of rowsFiltradas) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      if (statusContratoDoCodigo(codigo, dicionario) !== statusFiltro) continue;

      const acc = ensure(row);
      acc.totalQuebras += 1;
      const dow = diaDaSemanaFromIso(row.data_toa);
      if (dow != null && dow !== 0) {
        ensureDia(acc, dow).totalQuebras += 1;
      }

      if (codigo !== codigoAlvo) continue;
      acc.usosCodigo += 1;
      if (dow != null && dow !== 0) {
        const dia = ensureDia(acc, dow);
        dia.usosCodigo += 1;
        dia.notasCodigo.push(row);
      }
    }

    return [...byTech.values()]
      .filter((a) => a.usosCodigo > 0)
      .map((a) => {
        const porDia: Record<number, RankingUsoCodigoDia> = {};
        for (const d of DIAS_UTEIS) {
          const dia = a.porDia.get(d.dow);
          if (!dia || dia.usosCodigo === 0) {
            porDia[d.dow] = { pct: null, janela: null };
            continue;
          }
          porDia[d.dow] = {
            pct:
              dia.totalQuebras > 0
                ? (dia.usosCodigo / dia.totalQuebras) * 100
                : 0,
            janela: piorJanelaDasNotas(dia.notasCodigo),
          };
        }
        return {
          login: a.login,
          nome: a.nome,
          usosCodigo: a.usosCodigo,
          totalQuebras: a.totalQuebras,
          representaPct:
            a.totalQuebras > 0
              ? (a.usosCodigo / a.totalQuebras) * 100
              : 0,
          porDia,
        };
      })
      .sort(
        (a, b) =>
          b.usosCodigo - a.usosCodigo ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [rowsFiltradas, dicionario, codigoAlvo, statusFiltro]);

  const raioXTecnico = useMemo((): RaioXQuebra[] => {
    if (tecnicoFiltro === TECNICO_TODOS) return [];

    const statusNotaAlvo =
      statusFiltro === "IMPRODUTIVO" ? "Improdutiva" : "Produtiva";

    const notasStatus = dedupeNotasPorWo(rowsFiltradas).filter(
      (n) => n.status_nota === statusNotaAlvo,
    );

    const linhas: RaioXQuebra[] = [];
    for (const nota of notasStatus) {
      const osDoStatus = rowsFiltradas.filter(
        (r) =>
          String(r.numero_wo ?? "").trim() ===
            String(nota.numero_wo ?? "").trim() &&
          r.status_nota === statusNotaAlvo &&
          (statusFiltro === "IMPRODUTIVO" ? isLinhaOsImprodutiva(r) : true),
      );
      const principal = osDoStatus[0] ?? nota;
      const codigo = normalizeCodigoBaixa(principal.cod_baixa);
      if (
        codigo &&
        statusContratoDoCodigo(codigo, dicionario) !== statusFiltro
      ) {
        continue;
      }
      const dataIso = String(nota.data_toa ?? "").slice(0, 10);
      const dow = diaDaSemanaFromIso(dataIso);
      const diaLabel =
        dow == null
          ? "—"
          : DIAS_UTEIS.find((d) => d.dow === dow)?.label ??
            (dow === 0 ? "Domingo" : "—");

      linhas.push({
        key: `${nota.numero_wo}|${nota.data_toa}|${codigo}`,
        data: dataIso,
        dia: diaLabel,
        hora: formatHoraDeInicioFim(nota.inicio_fim || principal.inicio_fim),
        codBaixa: codigo || "—",
        descricao: codigo
          ? descricaoDoCodigoBaixa(codigo, dicionario)
          : DESCRICAO_DESCONHECIDA,
        bairro: (nota.bairro || principal.bairro || "").trim() || "—",
        contrato:
          String(nota.contrato || principal.contrato || "").trim() || "—",
        numeroWo: String(nota.numero_wo ?? "").trim() || "—",
      });
    }

    return linhas
      .sort((a, b) => {
        const byDate = b.data.localeCompare(a.data);
        if (byDate !== 0) return byDate;
        return b.hora.localeCompare(a.hora);
      })
      .slice(0, 50);
  }, [tecnicoFiltro, rowsFiltradas, dicionario, statusFiltro]);

  /** Aba Janela: filtros locais (Dia recalcula a agregação macro; Janela/Código filtram linhas). */
  const rankingPorJanelaFiltradoBase = useMemo((): JanelaImprodutivaAgg[] => {
    if (filtroDia === "Todos") return rankingPorJanelaBase;
    const notasAlvoDia = notasAlvo.filter((row) =>
      notaNoDiaLabel(row, filtroDia),
    );
    const notasFiltradasDia = notasFiltradas.filter((row) =>
      notaNoDiaLabel(row, filtroDia),
    );
    return agregarRankingJanelasMacro({
      statusFiltro,
      notasAlvo: notasAlvoDia,
      notasFiltradas: notasFiltradasDia,
      dicionario,
      isQuebra: isQuebraCard,
    });
  }, [
    rankingPorJanelaBase,
    filtroDia,
    notasAlvo,
    notasFiltradas,
    statusFiltro,
    dicionario,
    codigoFiltro,
  ]);

  const opcoesFiltroJanelaAba = useMemo(() => {
    const set = new Set(rankingPorJanelaFiltradoBase.map((r) => r.janela));
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rankingPorJanelaFiltradoBase]);

  const opcoesFiltroCodBaixaAba = useMemo(() => {
    const set = new Set(
      rankingPorJanelaFiltradoBase
        .map((r) => r.codigoVencedor)
        .filter((c) => c && c !== "—"),
    );
    return [...set].sort(
      (a, b) => Number(a) - Number(b) || a.localeCompare(b, "pt-BR"),
    );
  }, [rankingPorJanelaFiltradoBase]);

  const rankingPorJanela = useMemo(() => {
    return rankingPorJanelaFiltradoBase.filter((row) => {
      if (filtroJanela !== "Todos" && row.janela !== filtroJanela) return false;
      if (filtroCodBaixa !== "Todos" && row.codigoVencedor !== filtroCodBaixa) {
        return false;
      }
      return true;
    });
  }, [rankingPorJanelaFiltradoBase, filtroJanela, filtroCodBaixa]);

  useEffect(() => {
    setFiltroJanela("Todos");
    setFiltroDia("Todos");
    setFiltroCodBaixa("Todos");
  }, [statusFiltro]);

  useEffect(() => {
    if (
      filtroJanela !== "Todos" &&
      !opcoesFiltroJanelaAba.includes(filtroJanela)
    ) {
      setFiltroJanela("Todos");
    }
  }, [filtroJanela, opcoesFiltroJanelaAba]);

  useEffect(() => {
    if (
      filtroCodBaixa !== "Todos" &&
      !opcoesFiltroCodBaixaAba.includes(filtroCodBaixa)
    ) {
      setFiltroCodBaixa("Todos");
    }
  }, [filtroCodBaixa, opcoesFiltroCodBaixaAba]);

  /** Aba Todos os códigos: volumetria improdutiva (espelha /codigos-baixa). */
  const todosCodigosBaixa = useMemo(
    () => agregarMotivosQuebra(notasAlvo, dicionario, statusFiltro),
    [notasAlvo, dicionario, statusFiltro],
  );

  const todosCodigosBaixaFiltrados = useMemo(() => {
    const q = buscaCodBaixa.trim().toLowerCase();
    if (!q) return todosCodigosBaixa;
    return todosCodigosBaixa.filter(
      (row) =>
        row.codigo.toLowerCase().includes(q) ||
        row.descricao.toLowerCase().includes(q) ||
        row.motivoQuebra.toLowerCase().includes(q),
    );
  }, [todosCodigosBaixa, buscaCodBaixa]);

  const abrirModalDia = (diaCurto: string) => {
    setDiaFiltroModal(diaCurto);
    setBuscaTecnicoModal("");
    setModalAno(ano);
    setModalMes(mes);
    setModalDiaAberto(true);
  };

  const fecharModalDia = () => {
    setModalDiaAberto(false);
  };

  const limparFiltrosModalDia = () => {
    setDiaFiltroModal(null);
    setBuscaTecnicoModal("");
    setModalAno(ano);
    setModalMes(mes);
  };

  useEffect(() => {
    if (!modalDiaAberto) return;
    setModalAno(ano);
    setModalMes(mes);
  }, [modalDiaAberto, ano, mes]);

  useEffect(() => {
    if (!modalDiaAberto) return;
    let cancelled = false;
    void (async () => {
      setLoadingModal(true);
      try {
        const flat = await fetchToaImportacoes({
          ano: modalAno,
          mes: modalMes,
          dia: null,
        });
        if (cancelled) return;
        setRowsModal(filtrarToaOsContabilizaveis(flat));
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar TOA do modal de dia:", err);
        setRowsModal([]);
      } finally {
        if (!cancelled) setLoadingModal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [modalDiaAberto, modalAno, modalMes]);

  useEffect(() => {
    if (!modalDiaAberto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharModalDia();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalDiaAberto]);

  const notasBaseModal = useMemo(
    () => dedupeNotasPorWo(rowsModal),
    [rowsModal],
  );

  const diaDowModal = useMemo(() => {
    if (!diaFiltroModal) return null;
    return DIAS_UTEIS.find((d) => d.curto === diaFiltroModal)?.dow ?? null;
  }, [diaFiltroModal]);

  const modoDiaEspecifico = diaDowModal != null;

  const detalheTecnicosDia = useMemo((): TecnicoDiaDetalheAgg[] => {
    if (!modalDiaAberto || !modoDiaEspecifico || diaDowModal == null) return [];

    const porTecnico = new Map<
      string,
      { prod: ToaImportacaoRow[]; improd: ToaImportacaoRow[] }
    >();

    for (const nota of notasBaseModal) {
      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow !== diaDowModal) continue;
      const nome = nomeTecnicoRow(nota);
      if (!nome || nome === "—") continue;
      let acc = porTecnico.get(nome);
      if (!acc) {
        acc = { prod: [], improd: [] };
        porTecnico.set(nome, acc);
      }
      if (nota.status_nota === "Produtiva") acc.prod.push(nota);
      else acc.improd.push(nota);
    }

    const busca = buscaTecnicoModal.trim().toLowerCase();
    return [...porTecnico.entries()]
      .filter(([nome]) => !busca || nome.toLowerCase().includes(busca))
      .map(([nome, acc]) => {
        const produtivas = acc.prod.length;
        const improdutivas = acc.improd.length;
        const total = produtivas + improdutivas;
        return {
          nome,
          produtivas,
          improdutivas,
          aproveitamento: total > 0 ? (produtivas / total) * 100 : 0,
          top3Prod: top3TipoOsLabels(acc.prod),
          top3Improd: top3TipoOsLabels(acc.improd),
        };
      });
  }, [
    modalDiaAberto,
    modoDiaEspecifico,
    diaDowModal,
    notasBaseModal,
    buscaTecnicoModal,
  ]);

  const detalheTecnicosDiaOrdenado = useMemo(() => {
    const fator = ordemDia.direcao === "asc" ? 1 : -1;
    return [...detalheTecnicosDia].sort((a, b) => {
      const va = a[ordemDia.coluna];
      const vb = b[ordemDia.coluna];
      if (va !== vb) return (va - vb) * fator;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [detalheTecnicosDia, ordemDia]);

  const matrizTecnicosSemana = useMemo((): TecnicoSemanaMatrizAgg[] => {
    if (!modalDiaAberto || modoDiaEspecifico) return [];

    type Acc = {
      prod: number;
      improd: number;
      porDia: Map<
        number,
        { prod: number; improd: number; notasDia: ToaImportacaoRow[] }
      >;
    };
    const porTecnico = new Map<string, Acc>();

    for (const nota of notasBaseModal) {
      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow == null || dow === 0) continue;
      const nome = nomeTecnicoRow(nota);
      if (!nome || nome === "—") continue;
      let acc = porTecnico.get(nome);
      if (!acc) {
        acc = { prod: 0, improd: 0, porDia: new Map() };
        porTecnico.set(nome, acc);
      }
      let diaAcc = acc.porDia.get(dow);
      if (!diaAcc) {
        diaAcc = { prod: 0, improd: 0, notasDia: [] };
        acc.porDia.set(dow, diaAcc);
      }
      diaAcc.notasDia.push(nota);
      if (nota.status_nota === "Produtiva") {
        acc.prod += 1;
        diaAcc.prod += 1;
      } else {
        acc.improd += 1;
        diaAcc.improd += 1;
      }
    }

    const busca = buscaTecnicoModal.trim().toLowerCase();
    return [...porTecnico.entries()]
      .filter(([nome]) => !busca || nome.toLowerCase().includes(busca))
      .map(([nome, acc]) => {
        const total = acc.prod + acc.improd;
        const porDia: Record<number, DiaCelulaSemana> = {};
        for (const d of DIAS_UTEIS) {
          const diaAcc = acc.porDia.get(d.dow);
          if (!diaAcc || diaAcc.prod + diaAcc.improd === 0) {
            porDia[d.dow] = { aproveitamento: null, piorJanela: null };
            continue;
          }
          const totalDia = diaAcc.prod + diaAcc.improd;
          porDia[d.dow] = {
            aproveitamento: (diaAcc.prod / totalDia) * 100,
            piorJanela: piorJanelaImprodutiva(diaAcc.notasDia, dicionario),
          };
        }
        return {
          nome,
          produtivasTotal: acc.prod,
          aproveitamentoGeral: total > 0 ? (acc.prod / total) * 100 : 0,
          porDia,
        };
      });
  }, [
    modalDiaAberto,
    modoDiaEspecifico,
    notasBaseModal,
    buscaTecnicoModal,
    dicionario,
  ]);

  const matrizTecnicosSemanaOrdenada = useMemo(() => {
    const fator = ordemMatriz.direcao === "asc" ? 1 : -1;
    return [...matrizTecnicosSemana].sort((a, b) => {
      let va: number;
      let vb: number;
      if (ordemMatriz.coluna === "produtivasTotal") {
        va = a.produtivasTotal;
        vb = b.produtivasTotal;
      } else if (ordemMatriz.coluna === "aprovGeral") {
        va = a.aproveitamentoGeral;
        vb = b.aproveitamentoGeral;
      } else {
        const dow = ordemMatriz.coluna;
        va = valorOrdenacaoComNulos(
          a.porDia[dow]?.aproveitamento,
          ordemMatriz.direcao,
        );
        vb = valorOrdenacaoComNulos(
          b.porDia[dow]?.aproveitamento,
          ordemMatriz.direcao,
        );
      }
      if (va !== vb) return (va - vb) * fator;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [matrizTecnicosSemana, ordemMatriz]);

  /** Rank Geral: volumetria cruzada + dias reativos ao Status. */
  const rankGeralMatriz = useMemo((): RankGeralTecnicoAgg[] => {
    type Acc = {
      prod: number;
      improd: number;
      porDia: Map<
        number,
        { prod: number; improd: number; notasDia: ToaImportacaoRow[] }
      >;
    };
    const porTecnico = new Map<string, Acc>();

    for (const nota of notasFiltradas) {
      const nome = nomeTecnicoRow(nota);
      if (!nome || nome === "—") continue;
      let acc = porTecnico.get(nome);
      if (!acc) {
        acc = { prod: 0, improd: 0, porDia: new Map() };
        porTecnico.set(nome, acc);
      }

      if (nota.status_nota === "Produtiva") acc.prod += 1;
      else acc.improd += 1;

      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow == null || dow === 0) continue;

      let diaAcc = acc.porDia.get(dow);
      if (!diaAcc) {
        diaAcc = { prod: 0, improd: 0, notasDia: [] };
        acc.porDia.set(dow, diaAcc);
      }
      diaAcc.notasDia.push(nota);
      if (nota.status_nota === "Produtiva") diaAcc.prod += 1;
      else diaAcc.improd += 1;
    }

    const isImprod = statusFiltro === "IMPRODUTIVO";

    return [...porTecnico.entries()].map(([nome, acc]) => {
      const total = acc.prod + acc.improd;
      const porDia: Record<number, DiaCelulaRankGeral> = {};
      for (const d of DIAS_UTEIS) {
        const diaAcc = acc.porDia.get(d.dow);
        if (!diaAcc || diaAcc.prod + diaAcc.improd === 0) {
          porDia[d.dow] = { pct: null, janela: null };
          continue;
        }
        const totalDia = diaAcc.prod + diaAcc.improd;
        porDia[d.dow] = {
          pct: isImprod
            ? (diaAcc.improd / totalDia) * 100
            : (diaAcc.prod / totalDia) * 100,
          janela: janelaDominantePorStatus(
            diaAcc.notasDia,
            dicionario,
            statusFiltro,
          ),
        };
      }
      return {
        nome,
        produtivasGeral: acc.prod,
        quebrasGeral: acc.improd,
        aproveitamento: total > 0 ? (acc.prod / total) * 100 : 0,
        reprovacao: total > 0 ? (acc.improd / total) * 100 : 0,
        porDia,
      };
    });
  }, [notasFiltradas, dicionario, statusFiltro]);

  const rankGeralMatrizOrdenada = useMemo(() => {
    const fator = ordemRankGeral.direcao === "asc" ? 1 : -1;
    return [...rankGeralMatriz].sort((a, b) => {
      let va: number;
      let vb: number;
      if (ordemRankGeral.coluna === "produtivasGeral") {
        va = a.produtivasGeral;
        vb = b.produtivasGeral;
      } else if (ordemRankGeral.coluna === "quebrasGeral") {
        va = a.quebrasGeral;
        vb = b.quebrasGeral;
      } else if (ordemRankGeral.coluna === "aproveitamento") {
        va = a.aproveitamento;
        vb = b.aproveitamento;
      } else if (ordemRankGeral.coluna === "reprovacao") {
        va = a.reprovacao;
        vb = b.reprovacao;
      } else {
        const dow = ordemRankGeral.coluna;
        va = valorOrdenacaoComNulos(
          a.porDia[dow]?.pct,
          ordemRankGeral.direcao,
        );
        vb = valorOrdenacaoComNulos(
          b.porDia[dow]?.pct,
          ordemRankGeral.direcao,
        );
      }
      if (va !== vb) return (va - vb) * fator;
      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [rankGeralMatriz, ordemRankGeral]);

  const rankGeralMatrizFiltrada = useMemo(() => {
    const q = buscaTecnicoRank.trim().toLowerCase();
    if (!q) return rankGeralMatrizOrdenada;
    return rankGeralMatrizOrdenada.filter((tec) =>
      tec.nome.toLowerCase().includes(q),
    );
  }, [rankGeralMatrizOrdenada, buscaTecnicoRank]);

  const alternarOrdemDia = (
    coluna: OrdemDiaState["coluna"],
  ) => {
    setOrdemDia((prev) =>
      prev.coluna === coluna
        ? { coluna, direcao: prev.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "desc" },
    );
  };

  const alternarOrdemMatriz = (
    coluna: OrdemMatrizState["coluna"],
  ) => {
    setOrdemMatriz((prev) =>
      prev.coluna === coluna
        ? { coluna, direcao: prev.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "desc" },
    );
  };

  const alternarOrdemRankGeral = (coluna: OrdemRankGeralState["coluna"]) => {
    setOrdemRankGeral((prev) =>
      prev.coluna === coluna
        ? { coluna, direcao: prev.direcao === "asc" ? "desc" : "asc" }
        : { coluna, direcao: "desc" },
    );
  };

  const tituloModalDia = useMemo(() => {
    if (modoDiaEspecifico && diaFiltroModal) {
      const dia = DIAS_UTEIS.find((d) => d.curto === diaFiltroModal);
      return `Detalhamento - Improdutiva · ${dia?.label ?? diaFiltroModal}`;
    }
    return "Detalhamento - Improdutiva · Matriz da semana";
  }, [modoDiaEspecifico, diaFiltroModal]);

  const filtrosLimpos = ano === null && mes === null;
  const visaoEquipe = tecnicoFiltro === TECNICO_TODOS;

  const periodoDescricao = useMemo(() => {
    const base =
      filtrosLimpos
        ? "Histórico completo TOA"
        : ano !== null && mes !== null
          ? `${mesLabel(mes)} de ${ano}`
          : ano !== null
            ? `Ano ${ano} · todos os meses`
            : "Período filtrado";
    return visaoEquipe
      ? `${base} · Equipe inteira`
      : `${base} · ${tecnicoFiltro}`;
  }, [filtrosLimpos, ano, mes, visaoEquipe, tecnicoFiltro]);

  const limparFiltros = () => {
    setAno(null);
    setMes(null);
    setTecnicoFiltro(TECNICO_TODOS);
    setCodigoFiltro(null);
    setStatusFiltro("IMPRODUTIVO");
    setAbaAtiva("rank-geral");
    setBuscaCodBaixa("");
    setBuscaTecnicoRank("");
  };

  const isModoImprodutivo = statusFiltro === "IMPRODUTIVO";
  const corDestaque = isModoImprodutivo ? "text-red-600" : "text-green-600";
  const tituloTop10 = isModoImprodutivo
    ? "Top 10 Cód. Quebras"
    : "Top 10 Cód. Produtivos";
  const tituloAbaTodosCodigos = isModoImprodutivo
    ? "Todos os códigos de baixa (quebras)"
    : "Todos os códigos de baixa (produtivos)";
  const tituloAbaJanela = isModoImprodutivo
    ? "Janela Improdutiva"
    : "Janela Produtiva";
  const tituloCardCodigo = codigoFiltro
    ? "Código Analisado"
    : isModoImprodutivo
      ? "Cód. Ofensor"
      : "Cód. mais Produtivo";
  const labelVolumeCurto = isModoImprodutivo ? "quebras" : "produção";
  const labelVolumeTurno = isModoImprodutivo ? "quebras" : "notas";
  const labelDiaPct = isModoImprodutivo ? "reprovação" : "aprovação";
  const labelColunaTipo = isModoImprodutivo
    ? "Tipo de quebra"
    : "Tipo de nota";
  const abasPainelInferior = ABAS_PAINEL_INFERIOR.map((aba) => {
    if (aba.id === "todos-codigos") {
      return { ...aba, label: tituloAbaTodosCodigos };
    }
    if (aba.id === "janela") {
      return { ...aba, label: tituloAbaJanela };
    }
    return aba;
  });

  const fracaoSobre = (qtd: number, total: number) => {
    const pct = total > 0 ? (qtd / total) * 100 : 0;
    return `${formatQuantidade(qtd)} de ${formatQuantidade(total)} (${formatPct(pct)})`;
  };

  const fracaoSobreAlvo = (qtd: number) => fracaoSobre(qtd, totalNotasAlvo);
  const fracaoSobreGlobais = (qtd: number) =>
    fracaoSobre(qtd, totalNotasGlobais);

  useEffect(() => {
    if (!modalTop10Aberto) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setModalTop10Aberto(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modalTop10Aberto]);

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex flex-row flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <Brain className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Filtros de comportamento
            </span>
            {filtrosLimpos && (
              <Badge variant="secondary" className="text-xs">
                Histórico geral
              </Badge>
            )}
            {!visaoEquipe && (
              <Badge variant="outline" className="text-xs">
                Drill-down
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="analise-comp-status"
              className="shrink-0 text-sm font-medium"
            >
              Status:
            </Label>
            <Select
              value={statusFiltro}
              onValueChange={(v) =>
                setStatusFiltro(v as StatusContratoFiltro)
              }
            >
              <SelectTrigger id="analise-comp-status" className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="IMPRODUTIVO">Improdutiva</SelectItem>
                <SelectItem value="PRODUTIVO">Produtiva</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="analise-comp-ano"
              className="shrink-0 text-sm font-medium"
            >
              Ano:
            </Label>
            <Select
              value={ano !== null ? String(ano) : "todos"}
              disabled={anosDisponiveis.length === 0}
              onValueChange={(v) => {
                if (v === "todos") {
                  setAno(null);
                  setMes(null);
                  return;
                }
                const novoAno = Number(v);
                const mesesDoAno = competencias
                  .filter((ym) => Math.floor(ym / 100) === novoAno)
                  .map((ym) => ym % 100)
                  .sort((a, b) => a - b);
                setAno(novoAno);
                setMes(mesesDoAno[mesesDoAno.length - 1] ?? null);
              }}
            >
              <SelectTrigger id="analise-comp-ano" className="w-[140px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {anosDisponiveis.map((a) => (
                  <SelectItem key={a} value={String(a)}>
                    {a}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="analise-comp-mes"
              className="shrink-0 text-sm font-medium"
            >
              Mês:
            </Label>
            <Select
              value={mes !== null ? String(mes) : "todos"}
              disabled={ano === null || mesesDisponiveis.length === 0}
              onValueChange={(v) => {
                if (v === "todos") {
                  setMes(null);
                  return;
                }
                setMes(Number(v));
              }}
            >
              <SelectTrigger id="analise-comp-mes" className="w-[160px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                {mesesDisponiveis.map((m) => (
                  <SelectItem key={m} value={String(m)}>
                    {mesLabel(m)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="analise-comp-tecnico"
              className="shrink-0 text-sm font-medium"
            >
              Técnico:
            </Label>
            <Select
              value={tecnicoFiltro}
              onValueChange={setTecnicoFiltro}
            >
              <SelectTrigger id="analise-comp-tecnico" className="w-[220px]">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={TECNICO_TODOS}>Todos</SelectItem>
                {tecnicosDisponiveis.map((nome) => (
                  <SelectItem key={nome} value={nome}>
                    {nome}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex min-w-[16rem] flex-1 items-center gap-2 sm:max-w-sm">
            <Label
              htmlFor="analise-comp-codigo"
              className="shrink-0 text-sm font-medium"
            >
              Código:
            </Label>
            <FiltroCombobox
              id="analise-comp-codigo"
              value={codigoFiltro ? codigoFiltroLabel : ""}
              onChange={(v) => setCodigoFiltro(parseCodigoFromOpcao(v))}
              options={opcoesCodigoBaixa}
              placeholder="Digite o código de baixa"
              todosValue="Todos"
              className="min-w-0 flex-1"
            />
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto gap-1.5"
            onClick={limparFiltros}
          >
            <FilterX className="h-4 w-4" />
            Limpar Filtros
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">{periodoDescricao}</p>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando métricas...</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 items-stretch gap-4 md:grid-cols-3 xl:grid-cols-6">
            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {isModoImprodutivo
                    ? "Janela Improdutiva (Macro)"
                    : "Janela Produtiva (Macro)"}
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {janelaImprodutivaMacro
                  ? formatarJanelaHorario(janelaImprodutivaMacro.janela)
                  : "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {janelaImprodutivaMacro
                    ? isModoImprodutivo
                      ? `maior índice de quebras - ${formatQuantidade(janelaImprodutivaMacro.quantidade)} de ${formatQuantidade(janelaImprodutivaMacro.totalBucket)} (${formatPct(janelaImprodutivaMacro.taxa)})`
                      : `maior volume de ${labelVolumeCurto} - ${fracaoSobreAlvo(janelaImprodutivaMacro.quantidade)}`
                    : isModoImprodutivo
                      ? "maior índice de quebras"
                      : `maior volume de ${labelVolumeCurto}`}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {isModoImprodutivo
                    ? "Janela Improdutiva (Micro)"
                    : "Janela Produtiva (Micro)"}
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {janelaImprodutivaMicro
                  ? formatarJanelaHorario(janelaImprodutivaMicro.janela)
                  : "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {janelaImprodutivaMicro
                    ? isModoImprodutivo
                      ? `maior índice de quebras - ${formatQuantidade(janelaImprodutivaMicro.quantidade)} de ${formatQuantidade(janelaImprodutivaMicro.totalBucket)} (${formatPct(janelaImprodutivaMicro.taxa)})`
                      : `maior volume de ${labelVolumeCurto} - ${fracaoSobreAlvo(janelaImprodutivaMicro.quantidade)}`
                    : isModoImprodutivo
                      ? "maior índice de quebras"
                      : `maior volume de ${labelVolumeCurto}`}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  Dia
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {diaMaisCritico?.dia ?? "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {diaMaisCritico
                    ? isModoImprodutivo
                      ? `${formatPct(diaMaisCritico.pct)} de reprovação - ${formatQuantidade(diaMaisCritico.quantidade)} de ${formatQuantidade(diaMaisCritico.totalBucket)}`
                      : `${formatPct(diaMaisCritico.pct)} de ${labelDiaPct} - ${formatQuantidade(diaMaisCritico.quantidade)} de ${formatQuantidade(totalNotasAlvo)}`
                    : "Sem dados no período"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                {turnoMaiorFadiga?.turno === "Manhã" ? (
                  <Sunrise className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                ) : (
                  <Sunset className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  Turno
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {turnoMaiorFadiga?.turno ?? "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {turnoMaiorFadiga
                    ? isModoImprodutivo
                      ? `${formatPct(turnoMaiorFadiga.taxa)} de reprovação - ${formatQuantidade(turnoMaiorFadiga.quebras)} de ${formatQuantidade(turnoMaiorFadiga.totalBucket)}`
                      : `${formatQuantidade(turnoMaiorFadiga.quebras)} ${labelVolumeTurno} - ${formatQuantidade(turnoMaiorFadiga.quebras)} de ${formatQuantidade(totalNotasAlvo)}`
                    : "Sem horário de início-fim"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {tituloCardCodigo}
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {cardCodigoExibido
                  ? `Cód. ${cardCodigoExibido.codigo} - ${formatPct(cardCodigoExibido.pct)}`
                  : "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {cardCodigoExibido
                    ? `recorrência - ${fracaoSobreGlobais(cardCodigoExibido.quantidade)}`
                    : "recorrência"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Target className={`h-5 w-5 shrink-0 ${corDestaque}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  Tipo
                </span>
              </div>
              <div
                className={`mt-3 text-base font-bold leading-snug sm:text-lg ${corDestaque}`}
              >
                {tipoOfensorMacro?.motivo ?? "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {tipoOfensorMacro
                    ? `categoria com maior índice - ${fracaoSobreAlvo(tipoOfensorMacro.quantidade)}`
                    : "categoria com maior índice"}
                </p>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <CalendarDays className="h-4 w-4 text-primary" />
                Aproveitamento por Dia da Semana
              </h2>
              {porDiaSemana.every(
                (d) => d.produtivas === 0 && d.improdutivas === 0,
              ) ? (
                <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota no período para o filtro selecionado.
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={porDiaSemana}
                      margin={{ top: 8, right: 8, left: 0, bottom: 4 }}
                    >
                      <CartesianGrid vertical={false} strokeDasharray="3 3" />
                      <XAxis dataKey="diaCurto" tick={{ fontSize: 11 }} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                      <Tooltip
                        content={({ active, payload }) => {
                          if (!active || !payload?.[0]) return null;
                          const item = payload[0].payload as DiaSemanaAgg;
                          const totalDia =
                            item.produtivas + item.improdutivas;
                          const taxaAproveitamento =
                            totalDia > 0
                              ? (item.produtivas / totalDia) * 100
                              : 0;
                          return (
                            <div className="rounded-md border border-gray-200 bg-white px-3 py-2 text-sm shadow-md">
                              <p className="font-bold">{item.dia}</p>
                              <p className="text-green-600">
                                Produtivas: {formatQuantidade(item.produtivas)}
                              </p>
                              <p className="text-red-600">
                                Improdutivas:{" "}
                                {formatQuantidade(item.improdutivas)}
                              </p>
                              {isModoImprodutivo ? (
                                <p className="text-red-600">
                                  Reprovação:{" "}
                                  {formatPct(item.taxaReprovacao)}
                                </p>
                              ) : (
                                <p className="text-green-600">
                                  Aproveitamento:{" "}
                                  {formatPct(taxaAproveitamento)}
                                </p>
                              )}
                            </div>
                          );
                        }}
                      />
                      <Legend />
                      <Bar
                        dataKey="produtivas"
                        name="Produtiva"
                        fill="#16a34a"
                        radius={[3, 3, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const payload = (data?.payload ?? data) as
                            | DiaSemanaAgg
                            | undefined;
                          if (payload?.diaCurto) abrirModalDia(payload.diaCurto);
                        }}
                      />
                      <Bar
                        dataKey="improdutivas"
                        name="Improdutiva"
                        fill="#dc2626"
                        radius={[3, 3, 0, 0]}
                        className="cursor-pointer"
                        onClick={(data) => {
                          const payload = (data?.payload ?? data) as
                            | DiaSemanaAgg
                            | undefined;
                          if (payload?.diaCurto) abrirModalDia(payload.diaCurto);
                        }}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <Clock className="h-4 w-4 text-primary" />
                {isModoImprodutivo
                  ? "Distribuição de Quebras por Turno"
                  : "Distribuição de Produção por Turno"}
              </h2>
              {porTurno.chart.length === 0 ? (
                <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  {isModoImprodutivo
                    ? "Sem quebras no período filtrado."
                    : "Sem notas produtivas no período filtrado."}
                </p>
              ) : (
                <div className="h-72 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={porTurno.chart}
                        dataKey="value"
                        nameKey="name"
                        cx="50%"
                        cy="50%"
                        outerRadius={96}
                        label={({ name, percent }) =>
                          `${name} ${((percent ?? 0) * 100).toFixed(0)}%`
                        }
                      >
                        {porTurno.chart.map((entry) => (
                          <Cell key={entry.name} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(value) => [
                          formatQuantidade(Number(value) || 0),
                          isModoImprodutivo ? "Quebras" : "Notas",
                        ]}
                      />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex w-full flex-wrap items-end justify-between gap-3">
              <div
                className="flex flex-wrap items-center gap-4 border-b border-border"
                role="tablist"
                aria-label="Visões do painel inferior"
              >
                {abasPainelInferior.map((aba) => {
                  const ativa = abaAtiva === aba.id;
                  return (
                    <button
                      key={aba.id}
                      type="button"
                      role="tab"
                      aria-selected={ativa}
                      onClick={() => setAbaAtiva(aba.id)}
                      className={
                        ativa
                          ? "-mb-px border-b-2 border-primary pb-2 text-sm font-semibold text-foreground"
                          : "-mb-px border-b-2 border-transparent pb-2 text-sm font-medium text-muted-foreground hover:text-foreground"
                      }
                    >
                      {aba.label}
                      {aba.id === "ranking" &&
                      visaoEquipe &&
                      codigoAlvo
                        ? `: ${codigoAlvo}`
                        : null}
                    </button>
                  );
                })}
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-4">
                {!visaoEquipe ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    onClick={() => setTecnicoFiltro(TECNICO_TODOS)}
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Voltar
                  </Button>
                ) : null}
                {abaAtiva === "ranking" ? (
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex min-w-[12rem] items-center gap-2">
                      <Label
                        htmlFor="analise-comp-codigo-painel"
                        className="shrink-0 text-sm font-medium"
                      >
                        Código:
                      </Label>
                      <FiltroCombobox
                        id="analise-comp-codigo-painel"
                        value={codigoFiltro ? codigoFiltroLabel : ""}
                        onChange={(v) =>
                          setCodigoFiltro(parseCodigoFromOpcao(v))
                        }
                        options={opcoesCodigoBaixa}
                        placeholder="Digite o código"
                        todosValue="Todos"
                        className="w-[200px]"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="gap-1.5 text-muted-foreground"
                      disabled={!codigoFiltro}
                      onClick={() => setCodigoFiltro(null)}
                    >
                      <X className="h-4 w-4" />
                      Limpar filtro
                    </Button>
                  </div>
                ) : null}
                <div className="flex items-center gap-2">
                  <Label
                    htmlFor="analise-comp-status-painel"
                    className="shrink-0 text-sm font-medium"
                  >
                    Status:
                  </Label>
                  <Select
                    value={statusFiltro}
                    onValueChange={(v) =>
                      setStatusFiltro(v as StatusContratoFiltro)
                    }
                  >
                    <SelectTrigger
                      id="analise-comp-status-painel"
                      className="w-[150px]"
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="IMPRODUTIVO">Improdutiva</SelectItem>
                      <SelectItem value="PRODUTIVO">Produtiva</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {visaoEquipe ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => setModalTop10Aberto(true)}
                  >
                    <BarChart3 className="h-4 w-4" />
                    {tituloTop10}
                  </Button>
                ) : null}
              </div>
            </div>

            {abaAtiva === "rank-geral" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[16rem] flex-1 sm:max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={buscaTecnicoRank}
                      onChange={(e) => setBuscaTecnicoRank(e.target.value)}
                      placeholder="Buscar técnico..."
                      className="h-8 pl-8 text-sm"
                      aria-label="Buscar técnico no Rank Geral"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    disabled={!buscaTecnicoRank.trim()}
                    onClick={() => setBuscaTecnicoRank("")}
                  >
                    <X className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                {rankGeralMatrizFiltrada.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {buscaTecnicoRank.trim()
                      ? "Nenhum técnico encontrado para a busca."
                      : "Nenhum técnico com notas no período."}
                  </p>
                ) : (
                  <div className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[80rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-muted-foreground">
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 text-left font-semibold shadow-sm">
                            Técnico
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() =>
                              alternarOrdemRankGeral("produtivasGeral")
                            }
                          >
                            Produtivas (Geral)
                            {setaOrdenacao(
                              ordemRankGeral.coluna === "produtivasGeral",
                              ordemRankGeral.direcao,
                            )}
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() =>
                              alternarOrdemRankGeral("quebrasGeral")
                            }
                          >
                            Quebras (Geral)
                            {setaOrdenacao(
                              ordemRankGeral.coluna === "quebrasGeral",
                              ordemRankGeral.direcao,
                            )}
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() =>
                              alternarOrdemRankGeral("aproveitamento")
                            }
                          >
                            Aproveit.
                            {setaOrdenacao(
                              ordemRankGeral.coluna === "aproveitamento",
                              ordemRankGeral.direcao,
                            )}
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() =>
                              alternarOrdemRankGeral("reprovacao")
                            }
                          >
                            Reprovação
                            {setaOrdenacao(
                              ordemRankGeral.coluna === "reprovacao",
                              ordemRankGeral.direcao,
                            )}
                          </th>
                          {DIAS_UTEIS.map((d) => (
                            <th
                              key={d.dow}
                              className="sticky top-0 z-10 min-w-[110px] cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                              onClick={() => alternarOrdemRankGeral(d.dow)}
                            >
                              {d.curto}.
                              {setaOrdenacao(
                                ordemRankGeral.coluna === d.dow,
                                ordemRankGeral.direcao,
                              )}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {rankGeralMatrizFiltrada.map((tec) => (
                        <tr
                          key={tec.nome}
                          className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/50"
                          onClick={() => {
                            setTecnicoFiltro(tec.nome);
                            setAbaAtiva("ranking");
                          }}
                          title="Abrir raio-X deste técnico"
                        >
                          <td className="px-3 py-2 text-left font-medium text-primary">
                            {tec.nome}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-green-600">
                            {formatQuantidade(tec.produtivasGeral)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-gray-900">
                            {formatQuantidade(tec.quebrasGeral)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-gray-900">
                            {formatPct(tec.aproveitamento)}
                          </td>
                          <td className="px-3 py-2 text-center tabular-nums text-gray-900">
                            {formatPct(tec.reprovacao)}
                          </td>
                          {DIAS_UTEIS.map((d) => {
                            const cel = tec.porDia[d.dow];
                            if (!cel || cel.pct == null) {
                              return (
                                <td
                                  key={d.dow}
                                  className="min-w-[110px] p-2 text-center align-middle text-muted-foreground"
                                >
                                  -
                                </td>
                              );
                            }
                            return (
                              <td
                                key={d.dow}
                                className="min-w-[110px] p-2 text-center align-middle tabular-nums"
                              >
                                <div className="flex flex-col items-center justify-center">
                                  <span
                                    className={`text-sm font-medium ${
                                      isModoImprodutivo
                                        ? "text-red-600"
                                        : "text-green-600"
                                    }`}
                                  >
                                    {Math.round(cel.pct)}%
                                  </span>
                                  {cel.janela ? (
                                    <span className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                                      ({formatarJanelaHorario(cel.janela)})
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}
              </div>
            )}

            {abaAtiva === "ranking" && (
              <>
                {visaoEquipe ? (
                  !codigoAlvo ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhuma quebra improdutiva no período para montar o ranking.
                    </p>
                  ) : rankingUsoCodigo.length === 0 ? (
                    <p className="py-8 text-center text-sm text-muted-foreground">
                      Nenhum técnico usou o código {codigoAlvo} no período.
                    </p>
                  ) : (
                    <div className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-gray-100">
                      <table className="w-full min-w-[64rem] text-sm">
                        <thead>
                          <tr className="border-b border-border text-left text-muted-foreground">
                            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-center font-semibold shadow-sm">
                              #
                            </th>
                            <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                              Técnico
                            </th>
                            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-center font-semibold shadow-sm">
                              Cód. {codigoAlvo}
                            </th>
                            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-center font-semibold shadow-sm">
                              Quebras (Total)
                            </th>
                            <th className="sticky top-0 z-10 bg-white px-3 py-2 text-center font-semibold shadow-sm">
                              Representa
                            </th>
                            {DIAS_UTEIS.map((d) => (
                              <th
                                key={d.dow}
                                className="sticky top-0 z-10 min-w-[110px] bg-white px-3 py-2 text-center font-semibold shadow-sm"
                              >
                                {d.curto}.
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {rankingUsoCodigo.map((row, idx) => (
                            <tr
                              key={row.login}
                              className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/50"
                              onClick={() => setTecnicoFiltro(row.nome)}
                              title="Abrir raio-X deste técnico"
                            >
                              <td className="px-3 py-2 text-center tabular-nums text-muted-foreground">
                                {idx + 1}
                              </td>
                              <td className="px-3 py-2 font-medium text-primary">
                                {row.nome}
                              </td>
                              <td className={`px-3 py-2 text-center font-semibold tabular-nums ${corDestaque}`}>
                                {formatQuantidade(row.usosCodigo)}
                              </td>
                              <td className="px-3 py-2 text-center tabular-nums text-gray-900">
                                {formatQuantidade(row.totalQuebras)}
                              </td>
                              <td className="px-3 py-2 text-center text-sm font-medium tabular-nums text-gray-700">
                                {formatPct(row.representaPct)}
                              </td>
                              {DIAS_UTEIS.map((d) => {
                                const cel = row.porDia[d.dow];
                                const usoNoDia = cel?.pct != null;
                                return (
                                  <td
                                    key={d.dow}
                                    className="min-w-[110px] p-2 text-center align-middle tabular-nums"
                                  >
                                    {usoNoDia ? (
                                      <div className="flex flex-col items-center justify-center">
                                        <span
                                          className={`text-sm font-medium ${
                                            isModoImprodutivo
                                              ? "text-red-600"
                                              : "text-green-600"
                                          }`}
                                        >
                                          {Math.round(cel!.pct!)}%
                                        </span>
                                        <span className="mt-1 whitespace-nowrap text-xs text-muted-foreground">
                                          (
                                          {cel!.janela
                                            ? formatarJanelaHorario(cel!.janela)
                                            : "—"}
                                          )
                                        </span>
                                      </div>
                                    ) : (
                                      <div className="text-center text-gray-400">
                                        -
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                ) : raioXTecnico.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhuma nota improdutiva para {tecnicoFiltro} no período.
                  </p>
                ) : (
                  <div className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            Data
                          </th>
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            Dia
                          </th>
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            Hora
                          </th>
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            Cód. Baixa
                          </th>
                          <th className="sticky top-0 z-10 min-w-[10rem] bg-white px-3 py-2 font-semibold shadow-sm">
                            Motivo
                          </th>
                          <th className="sticky top-0 z-10 min-w-[8rem] bg-white px-3 py-2 font-semibold shadow-sm">
                            Bairro
                          </th>
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            Contrato
                          </th>
                          <th className="sticky top-0 z-10 whitespace-nowrap bg-white px-3 py-2 font-semibold shadow-sm">
                            WO
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {raioXTecnico.map((row) => (
                          <tr
                            key={row.key}
                            className="border-b border-border/60 last:border-b-0"
                          >
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-900">
                              {formatDataBr(row.data)}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 text-gray-700">
                              {row.dia}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">
                              {row.hora}
                            </td>
                            <td
                              className={`whitespace-nowrap px-3 py-2 font-semibold tabular-nums ${corDestaque}`}
                            >
                              {row.codBaixa}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.descricao}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.bairro}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-gray-700">
                              {row.contrato}
                            </td>
                            <td className="whitespace-nowrap px-3 py-2 tabular-nums text-muted-foreground">
                              {row.numeroWo}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}

            {abaAtiva === "janela" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="aba-janela-filtro-janela"
                        className="shrink-0 text-xs font-medium text-muted-foreground"
                      >
                        Janela:
                      </Label>
                      <Select
                        value={filtroJanela}
                        onValueChange={setFiltroJanela}
                      >
                        <SelectTrigger
                          id="aba-janela-filtro-janela"
                          className="h-8 w-[140px] text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Todos">Todos</SelectItem>
                          {opcoesFiltroJanelaAba.map((j) => (
                            <SelectItem key={j} value={j}>
                              {formatarJanelaHorario(j)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="aba-janela-filtro-dia"
                        className="shrink-0 text-xs font-medium text-muted-foreground"
                      >
                        Dia:
                      </Label>
                      <Select value={filtroDia} onValueChange={setFiltroDia}>
                        <SelectTrigger
                          id="aba-janela-filtro-dia"
                          className="h-8 w-[130px] text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Todos">Todos</SelectItem>
                          {DIAS_UTEIS.map((d) => (
                            <SelectItem key={d.dow} value={d.label}>
                              {d.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Label
                        htmlFor="aba-janela-filtro-codigo"
                        className="shrink-0 text-xs font-medium text-muted-foreground"
                      >
                        Cód Baixa:
                      </Label>
                      <Select
                        value={filtroCodBaixa}
                        onValueChange={setFiltroCodBaixa}
                      >
                        <SelectTrigger
                          id="aba-janela-filtro-codigo"
                          className="h-8 w-[110px] text-xs"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Todos">Todos</SelectItem>
                          {opcoesFiltroCodBaixaAba.map((c) => (
                            <SelectItem key={c} value={c}>
                              {c}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    disabled={
                      filtroJanela === "Todos" &&
                      filtroDia === "Todos" &&
                      filtroCodBaixa === "Todos"
                    }
                    onClick={() => {
                      setFiltroJanela("Todos");
                      setFiltroDia("Todos");
                      setFiltroCodBaixa("Todos");
                    }}
                  >
                    <FilterX className="h-4 w-4" />
                    Limpar filtros
                  </Button>
                </div>

                {rankingPorJanela.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {isModoImprodutivo
                      ? "Nenhuma janela improdutiva no período filtrado."
                      : "Nenhuma janela produtiva no período filtrado."}
                  </p>
                ) : (
                  <div className="relative max-h-96 overflow-x-auto overflow-y-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[48rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Horário (macro)
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Cód. Baixa
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Motivo / Descrição
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            {labelColunaTipo}
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                            Quantidade
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                            {isModoImprodutivo
                              ? "% de Reprovação"
                              : "Representa"}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {rankingPorJanela.map((row) => (
                          <tr
                            key={row.janela}
                            className="border-b border-border/60 last:border-b-0"
                          >
                            <td className="px-3 py-2 font-medium tabular-nums text-gray-900">
                              {formatarJanelaHorario(row.janela)}
                            </td>
                            <td
                              className={`px-3 py-2 font-medium tabular-nums ${corDestaque}`}
                            >
                              {row.codigoVencedor}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.descricaoVencedor}
                            </td>
                            <td className="px-3 py-2 text-gray-700">
                              {row.tipoVencedor}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                              {isModoImprodutivo
                                ? `${formatQuantidade(row.quantidadeJanela)} / ${formatQuantidade(row.totalBucket)}`
                                : formatQuantidade(row.quantidadeJanela)}
                            </td>
                            <td
                              className={`px-3 py-2 text-right text-sm tabular-nums font-medium ${
                                isModoImprodutivo
                                  ? "text-red-600"
                                  : "text-green-600"
                              }`}
                            >
                              {formatPct(row.representaPct)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}

            {abaAtiva === "todos-codigos" && (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center gap-3">
                  <div className="relative min-w-[16rem] flex-1 sm:max-w-md">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      value={buscaCodBaixa}
                      onChange={(e) => setBuscaCodBaixa(e.target.value)}
                      placeholder="Buscar código ou motivo..."
                      className="h-8 pl-8 text-sm"
                      aria-label="Buscar código ou motivo de baixa"
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="gap-1.5 text-muted-foreground"
                    disabled={!buscaCodBaixa.trim()}
                    onClick={() => setBuscaCodBaixa("")}
                  >
                    <X className="h-4 w-4" />
                    Limpar
                  </Button>
                </div>
                {todosCodigosBaixa.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    {isModoImprodutivo
                      ? "Nenhum código de baixa improdutivo no período selecionado."
                      : "Nenhum código de baixa produtivo no período selecionado."}
                  </p>
                ) : todosCodigosBaixaFiltrados.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    Nenhum código encontrado para a busca.
                  </p>
                ) : (
                  <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[40rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="sticky top-0 z-10 bg-white px-2 py-2 font-semibold shadow-sm">
                            Cód. Baixa
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-2 py-2 font-semibold shadow-sm">
                            Motivo / Descrição
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-2 py-2 font-semibold shadow-sm">
                            {labelColunaTipo}
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-2 py-2 text-right font-semibold shadow-sm">
                            Quantidade
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {todosCodigosBaixaFiltrados.map((row) => (
                          <tr
                            key={row.codigo}
                            className="border-b border-border/60 last:border-b-0 hover:bg-gray-50"
                          >
                            <td className="px-2 py-2 font-medium tabular-nums text-gray-900">
                              {row.codigo}
                            </td>
                            <td className="px-2 py-2 text-gray-700">
                              {row.descricao}
                            </td>
                            <td className="px-2 py-2 text-gray-700">
                              {row.motivoQuebra}
                            </td>
                            <td
                              className={`px-2 py-2 text-right tabular-nums ${corDestaque}`}
                            >
                              {formatQuantidade(row.quantidade)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}

      {modalDiaAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-dia-semana-titulo"
          onClick={fecharModalDia}
        >
          <div
            className="flex max-h-[90vh] w-[95vw] max-w-7xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2
                  id="modal-dia-semana-titulo"
                  className="text-lg font-bold text-foreground"
                >
                  {tituloModalDia}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Clique em um dia no gráfico · Esc ou fora para fechar
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4">
                  <div className="relative w-full max-w-xs">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      type="search"
                      value={buscaTecnicoModal}
                      onChange={(e) => setBuscaTecnicoModal(e.target.value)}
                      placeholder="Buscar técnico..."
                      aria-label="Buscar técnico"
                      className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="modal-dia-ano"
                      className="shrink-0 text-sm font-medium"
                    >
                      Ano:
                    </Label>
                    <Select
                      value={modalAno !== null ? String(modalAno) : "todos"}
                      disabled={anosDisponiveis.length === 0}
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setModalAno(null);
                          setModalMes(null);
                          return;
                        }
                        const novoAno = Number(v);
                        const mesesDoAno = competencias
                          .filter((ym) => Math.floor(ym / 100) === novoAno)
                          .map((ym) => ym % 100)
                          .sort((a, b) => a - b);
                        setModalAno(novoAno);
                        setModalMes(mesesDoAno[mesesDoAno.length - 1] ?? null);
                      }}
                    >
                      <SelectTrigger id="modal-dia-ano" className="w-[120px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {anosDisponiveis.map((a) => (
                          <SelectItem key={a} value={String(a)}>
                            {a}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="modal-dia-mes"
                      className="shrink-0 text-sm font-medium"
                    >
                      Mês:
                    </Label>
                    <Select
                      value={modalMes !== null ? String(modalMes) : "todos"}
                      disabled={
                        modalAno === null || mesesDisponiveisModal.length === 0
                      }
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setModalMes(null);
                          return;
                        }
                        setModalMes(Number(v));
                      }}
                    >
                      <SelectTrigger id="modal-dia-mes" className="w-[140px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {mesesDisponiveisModal.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {mesLabel(m)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="modal-dia-semana"
                      className="shrink-0 text-sm font-medium"
                    >
                      Dia:
                    </Label>
                    <Select
                      value={diaFiltroModal ?? "todos"}
                      onValueChange={(v) =>
                        setDiaFiltroModal(v === "todos" ? null : v)
                      }
                    >
                      <SelectTrigger id="modal-dia-semana" className="w-[120px]">
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {DIAS_UTEIS.map((d) => (
                          <SelectItem key={d.dow} value={d.curto}>
                            {d.curto}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={limparFiltrosModalDia}
                  >
                    <FilterX className="h-4 w-4" />
                    Limpar Filtros
                  </Button>
                </div>
              </div>
              <button
                type="button"
                onClick={fecharModalDia}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-gray-100 hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              {loadingModal ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Carregando detalhamento...
                </p>
              ) : modoDiaEspecifico ? (
                detalheTecnicosDia.length === 0 ? (
                  <p className="py-10 text-center text-sm text-muted-foreground">
                    Nenhum técnico com notas neste dia no período.
                  </p>
                ) : (
                  <div className="relative overflow-x-auto rounded-lg border border-gray-100">
                    <table className="w-full min-w-[56rem] text-sm">
                      <thead>
                        <tr className="border-b border-border text-left text-muted-foreground">
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Nome (Técnico)
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-right font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() => alternarOrdemDia("produtivas")}
                          >
                            Produtivas
                            {setaOrdenacao(
                              ordemDia.coluna === "produtivas",
                              ordemDia.direcao,
                            )}
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-right font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() => alternarOrdemDia("improdutivas")}
                          >
                            Improdutivas
                            {setaOrdenacao(
                              ordemDia.coluna === "improdutivas",
                              ordemDia.direcao,
                            )}
                          </th>
                          <th
                            className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-right font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() => alternarOrdemDia("aproveitamento")}
                          >
                            Aproveitamento
                            {setaOrdenacao(
                              ordemDia.coluna === "aproveitamento",
                              ordemDia.direcao,
                            )}
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Top 3 Tipo O.S Prod.
                          </th>
                          <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                            Top 3 Tipo O.S Improd.
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {detalheTecnicosDiaOrdenado.map((tec) => (
                          <tr
                            key={tec.nome}
                            className="border-b border-border/60 last:border-b-0"
                          >
                            <td className="px-3 py-2 font-medium text-gray-900">
                              {tec.nome}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-green-600">
                              {formatQuantidade(tec.produtivas)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-red-600">
                              {formatQuantidade(tec.improdutivas)}
                            </td>
                            <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                              {formatPct(tec.aproveitamento)}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700">
                              {tec.top3Prod.length > 0 ? (
                                tec.top3Prod.map((os, idx) => (
                                  <div key={`${tec.nome}-prod-${idx}`} className="mb-1 last:mb-0">
                                    {os.nome} ({os.percentual.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 1,
                                    })}
                                    %)
                                  </div>
                                ))
                              ) : (
                                "—"
                              )}
                            </td>
                            <td className="px-3 py-2 text-xs text-gray-700">
                              {tec.top3Improd.length > 0 ? (
                                tec.top3Improd.map((os, idx) => (
                                  <div key={`${tec.nome}-improd-${idx}`} className="mb-1 last:mb-0">
                                    {os.nome} ({os.percentual.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 0,
                                      maximumFractionDigits: 1,
                                    })}
                                    %)
                                  </div>
                                ))
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )
              ) : matrizTecnicosSemanaOrdenada.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum técnico com notas no período.
                </p>
              ) : (
                <div className="relative overflow-x-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[72rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                          Técnico
                        </th>
                        <th
                          className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-right font-semibold shadow-sm hover:bg-gray-100"
                          onClick={() => alternarOrdemMatriz("produtivasTotal")}
                        >
                          Produtivas (Total)
                          {setaOrdenacao(
                            ordemMatriz.coluna === "produtivasTotal",
                            ordemMatriz.direcao,
                          )}
                        </th>
                        <th
                          className="sticky top-0 z-10 cursor-pointer select-none bg-white px-3 py-2 text-right font-semibold shadow-sm hover:bg-gray-100"
                          onClick={() => alternarOrdemMatriz("aprovGeral")}
                        >
                          Aprov. Geral
                          {setaOrdenacao(
                            ordemMatriz.coluna === "aprovGeral",
                            ordemMatriz.direcao,
                          )}
                        </th>
                        {DIAS_UTEIS.map((d) => (
                          <th
                            key={d.dow}
                            className="sticky top-0 z-10 min-w-[110px] cursor-pointer select-none bg-white px-3 py-2 text-center font-semibold shadow-sm hover:bg-gray-100"
                            onClick={() => alternarOrdemMatriz(d.dow)}
                          >
                            {d.curto}.
                            {setaOrdenacao(
                              ordemMatriz.coluna === d.dow,
                              ordemMatriz.direcao,
                            )}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {matrizTecnicosSemanaOrdenada.map((tec) => (
                        <tr
                          key={tec.nome}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {tec.nome}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-green-600">
                            {formatQuantidade(tec.produtivasTotal)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-900">
                            {formatPct(tec.aproveitamentoGeral)}
                          </td>
                          {DIAS_UTEIS.map((d) => {
                            const cel = tec.porDia[d.dow];
                            if (
                              !cel ||
                              cel.aproveitamento == null
                            ) {
                              return (
                                <td
                                  key={d.dow}
                                  className="min-w-[110px] px-3 py-2 text-center align-middle text-muted-foreground"
                                >
                                  -
                                </td>
                              );
                            }
                            return (
                              <td
                                key={d.dow}
                                className="min-w-[110px] px-3 py-2 text-center align-middle tabular-nums"
                              >
                                <div className="flex flex-col items-center justify-center">
                                  <span className="text-sm font-medium text-gray-800">
                                    {Math.round(cel.aproveitamento)}%
                                  </span>
                                  {cel.piorJanela ? (
                                    <span className="mt-1 whitespace-nowrap text-xs text-red-500">
                                      ({formatarJanelaHorario(cel.piorJanela)})
                                    </span>
                                  ) : null}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {modalTop10Aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-top10-titulo"
          onClick={() => setModalTop10Aberto(false)}
        >
          <div
            className="flex max-h-[90vh] w-[95vw] max-w-4xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div>
                <h2
                  id="modal-top10-titulo"
                  className="text-lg font-bold text-foreground"
                >
                  {tituloTop10}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Contexto atual dos filtros · Esc ou fora para fechar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalTop10Aberto(false)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-gray-100 hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
              <Top10CodigosBaixaChart
                rows={rowsParaTop10}
                dicionario={dicionario}
                statusNota={statusFiltro}
                titulo={
                  isModoImprodutivo
                    ? "Top 10 Motivos de Quebra"
                    : "Top 10 Códigos Produtivos"
                }
                emptyMessage={
                  isModoImprodutivo
                    ? "Nenhuma O.S. improdutiva no contexto filtrado."
                    : "Nenhuma O.S. produtiva no contexto filtrado."
                }
                chartHeightClassName="h-96"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
