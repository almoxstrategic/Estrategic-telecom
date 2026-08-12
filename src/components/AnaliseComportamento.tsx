import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  BarChart3,
  Brain,
  CalendarDays,
  Clock,
  FilterX,
  Search,
  Sunrise,
  Sunset,
  Target,
  UserRound,
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
const PIE_COLORS = { manha: "#f59e0b", tarde: "#dc2626" };

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

type RaioXQuebra = {
  key: string;
  data: string;
  hora: string;
  codBaixa: string;
  descricao: string;
  bairro: string;
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

type DiaCelulaSemana = {
  aproveitamento: number | null;
  piorJanela: string | null;
};

type TecnicoSemanaMatrizAgg = {
  nome: string;
  produtivasTotal: number;
  aproveitamentoGeral: number;
  porDia: Record<number, DiaCelulaSemana>;
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
 * Extrai hora de início de "Inicio-Fim" (ex.: "08:30 - 12:10", "14:00").
 * Retorna hora 0–23 ou null.
 */
function extrairHoraInicio(inicioFim: string | null | undefined): number | null {
  const s = String(inicioFim ?? "").trim();
  if (!s) return null;
  const match = s.match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return null;
  const hora = Number(match[1]);
  if (!Number.isFinite(hora) || hora < 0 || hora > 23) return null;
  return hora;
}

function classificarTurno(hora: number): Turno {
  return hora <= 12 ? "Manhã" : "Tarde";
}

/** Turno da O.S. a partir do horário de início em inicio_fim. */
function turnoDaRow(row: ToaImportacaoRow): Turno | null {
  const hora = extrairHoraInicio(row.inicio_fim);
  if (hora == null) return null;
  return classificarTurno(hora);
}

function formatHoraDeInicioFim(inicioFim: string | null | undefined): string {
  const s = String(inicioFim ?? "").trim();
  if (!s) return "—";
  const match = s.match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return s.slice(0, 16) || "—";
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
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

function piorJanelaImprodutiva(
  notas: ToaImportacaoRow[],
  dicionario: DicionarioCodigosBaixaMap,
): string | null {
  const counts = new Map<string, number>();
  for (const row of notas) {
    const codigo = normalizeCodigoBaixa(row.cod_baixa);
    if (!codigo) continue;
    if (statusContratoDoCodigo(codigo, dicionario) !== "IMPRODUTIVO") continue;
    const janela = String(row.janela_servico_1 ?? "").trim();
    if (!janela) continue;
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

function piorJanelaDasNotas(notas: ToaImportacaoRow[]): string | null {
  const counts = new Map<string, number>();
  for (const row of notas) {
    const janela =
      String(row.janela_servico_1 ?? "").trim() ||
      String(row.janela_servico_2 ?? "").trim();
    if (!janela) continue;
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
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [modalDiaAberto, setModalDiaAberto] = useState(false);
  const [diaFiltroModal, setDiaFiltroModal] = useState<string | null>(null);
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState("");
  const [modalAno, setModalAno] = useState<number | null>(null);
  const [modalMes, setModalMes] = useState<number | null>(null);
  const [rowsModal, setRowsModal] = useState<ToaImportacaoRow[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [modalTop10Aberto, setModalTop10Aberto] = useState(false);
  const [ordemDia, setOrdemDia] = useState<OrdemDiaState>({
    coluna: "produtivas",
    direcao: "desc",
  });
  const [ordemMatriz, setOrdemMatriz] = useState<OrdemMatrizState>({
    coluna: "produtivasTotal",
    direcao: "desc",
  });

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
  }, [rows, dicionario]);

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

  /** Quebras do período (Ano/Mês/Técnico) — referencial do total geral. */
  const notasImprodutivasGlobais = useMemo(() => {
    return rowsFiltradas.filter((row) => {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) return false;
      return statusContratoDoCodigo(codigo, dicionario) === "IMPRODUTIVO";
    });
  }, [rowsFiltradas, dicionario]);

  /** Base dos cards 1–4 e 6: com filtro de código, restringe; senão = globais. */
  const notasAlvo = useMemo(() => {
    if (!codigoFiltro) return notasImprodutivasGlobais;
    return notasImprodutivasGlobais.filter(
      (row) => normalizeCodigoBaixa(row.cod_baixa) === codigoFiltro,
    );
  }, [notasImprodutivasGlobais, codigoFiltro]);

  const totalNotasGlobais = notasImprodutivasGlobais.length;
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
      const turno = turnoDaRow(row);
      if (turno === "Manhã") manha += 1;
      else if (turno === "Tarde") tarde += 1;
    }
    return {
      manha,
      tarde,
      chart: [
        { name: "Manhã", value: manha, fill: PIE_COLORS.manha },
        { name: "Tarde", value: tarde, fill: PIE_COLORS.tarde },
      ].filter((p) => p.value > 0),
    };
  }, [notasAlvo]);

  const turnoMaiorFadiga = useMemo(() => {
    if (!notasAlvo.length) return null;
    if (porTurno.manha === 0 && porTurno.tarde === 0) return null;
    if (porTurno.tarde > porTurno.manha) {
      return { turno: "Tarde" as const, quebras: porTurno.tarde };
    }
    if (porTurno.manha > porTurno.tarde) {
      return { turno: "Manhã" as const, quebras: porTurno.manha };
    }
    return { turno: "Empate" as const, quebras: porTurno.manha };
  }, [notasAlvo.length, porTurno]);

  const janelasImprodutivas = useMemo(() => {
    if (!notasAlvo.length) {
      return { macro: null, micro: null };
    }

    const vencedora = (counts: Map<string, number>) => {
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
      return melhor ? { janela: melhor, quantidade } : null;
    };

    const countsMacro = new Map<string, number>();
    for (const row of notasAlvo) {
      const macro = String(row.janela_servico_1 ?? "").trim();
      if (!macro) continue;
      countsMacro.set(macro, (countsMacro.get(macro) ?? 0) + 1);
    }
    const macro = vencedora(countsMacro);
    if (!macro) {
      return { macro: null, micro: null };
    }

    const countsMicro = new Map<string, number>();
    for (const row of notasAlvo) {
      const janelaMacro = String(row.janela_servico_1 ?? "").trim();
      if (janelaMacro !== macro.janela) continue;
      const micro = String(row.janela_servico_2 ?? "").trim();
      if (!micro) continue;
      countsMicro.set(micro, (countsMicro.get(micro) ?? 0) + 1);
    }

    return {
      macro,
      micro: vencedora(countsMicro),
    };
  }, [notasAlvo]);

  const janelaImprodutivaMacro = janelasImprodutivas.macro;
  const janelaImprodutivaMicro = janelasImprodutivas.micro;

  const codOfensor = useMemo(() => {
    const counts = new Map<string, number>();
    const totalImprodutivas = notasImprodutivasGlobais.length;

    for (const row of notasImprodutivasGlobais) {
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
  }, [notasImprodutivasGlobais]);

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

  /** Card 3: dia com mais ocorrências em notasAlvo. */
  const diaMaisCritico = useMemo(() => {
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
      if (qtd > bestQtd || (qtd === bestQtd && bestDow != null && dow < bestDow)) {
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
      pct: (bestQtd / totalNotasAlvo) * 100,
    };
  }, [notasAlvo, totalNotasAlvo]);

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
      if (statusContratoDoCodigo(codigo, dicionario) !== "IMPRODUTIVO") continue;

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
  }, [rowsFiltradas, dicionario, codigoAlvo]);

  const raioXTecnico = useMemo((): RaioXQuebra[] => {
    if (tecnicoFiltro === TECNICO_TODOS) return [];

    const notasImprod = dedupeNotasPorWo(rowsFiltradas).filter(
      (n) => n.status_nota === "Improdutiva",
    );

    const linhas: RaioXQuebra[] = [];
    for (const nota of notasImprod) {
      const osImprod = rowsFiltradas.filter(
        (r) =>
          String(r.numero_wo ?? "").trim() ===
            String(nota.numero_wo ?? "").trim() &&
          r.status_nota === "Improdutiva" &&
          isLinhaOsImprodutiva(r),
      );
      const principal = osImprod[0] ?? nota;
      const codigo = normalizeCodigoBaixa(principal.cod_baixa);
      linhas.push({
        key: `${nota.numero_wo}|${nota.data_toa}|${codigo}`,
        data: String(nota.data_toa ?? "").slice(0, 10),
        hora: formatHoraDeInicioFim(nota.inicio_fim || principal.inicio_fim),
        codBaixa: codigo || "—",
        descricao: codigo
          ? descricaoDoCodigoBaixa(codigo, dicionario)
          : DESCRICAO_DESCONHECIDA,
        bairro: (nota.bairro || principal.bairro || "").trim() || "—",
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
  }, [tecnicoFiltro, rowsFiltradas, dicionario]);

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
  };

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
                <Clock className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Janela Improdutiva (Macro)
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
                {janelaImprodutivaMacro
                  ? formatarJanelaHorario(janelaImprodutivaMacro.janela)
                  : "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {janelaImprodutivaMacro
                    ? `maior volume de quebras - ${fracaoSobreAlvo(janelaImprodutivaMacro.quantidade)}`
                    : "maior volume de quebras"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <Clock className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Janela Improdutiva (Micro)
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
                {janelaImprodutivaMicro
                  ? formatarJanelaHorario(janelaImprodutivaMicro.janela)
                  : "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs text-muted-foreground">
                  {janelaImprodutivaMicro
                    ? `maior volume de quebras - ${fracaoSobreAlvo(janelaImprodutivaMicro.quantidade)}`
                    : "maior volume de quebras"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Dia
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
                {diaMaisCritico?.dia ?? "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {diaMaisCritico
                    ? `${formatPct(diaMaisCritico.pct)} de reprovação - ${formatQuantidade(diaMaisCritico.quantidade)} de ${formatQuantidade(totalNotasAlvo)}`
                    : "Sem dados no período"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                {turnoMaiorFadiga?.turno === "Manhã" ? (
                  <Sunrise className="h-5 w-5 shrink-0 text-red-600" />
                ) : (
                  <Sunset className="h-5 w-5 shrink-0 text-red-600" />
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  Turno
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
                {turnoMaiorFadiga?.turno ?? "—"}
              </div>
              <div className="mt-auto">
                <p className="mt-1 text-xs tabular-nums text-muted-foreground">
                  {turnoMaiorFadiga
                    ? `${formatQuantidade(turnoMaiorFadiga.quebras)} quebras - ${formatQuantidade(turnoMaiorFadiga.quebras)} de ${formatQuantidade(totalNotasAlvo)}`
                    : "Sem horário de início-fim"}
                </p>
              </div>
            </div>

            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  {codigoFiltro ? "Código Analisado" : "Cód. Ofensor"}
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
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
                <Target className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Tipo
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-red-600 sm:text-lg">
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
                              <p className="text-gray-700">
                                Reprovação: {formatPct(item.taxaReprovacao)}
                              </p>
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
                Distribuição de Quebras por Turno
              </h2>
              {porTurno.chart.length === 0 ? (
                <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                  Sem quebras com horário Início-Fim no período.
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
                          "Quebras",
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
            <div className="mb-4 flex w-full items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-foreground">
                {visaoEquipe ? (
                  <>
                    <AlertTriangle className="h-4 w-4 text-orange-600" />
                    {codigoAlvo
                      ? `Ranking de Uso: ${codigoAlvo}`
                      : "Ranking de Uso"}
                  </>
                ) : (
                  <>
                    <UserRound className="h-4 w-4 text-primary" />
                    Raio-X de Quebras do Técnico
                  </>
                )}
              </h2>
              {visaoEquipe ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="shrink-0 gap-1.5"
                  onClick={() => setModalTop10Aberto(true)}
                >
                  <BarChart3 className="h-4 w-4" />
                  Top 10 Cód. Quebras
                </Button>
              ) : null}
            </div>

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
                          <td className="px-3 py-2 text-center font-semibold tabular-nums text-red-600">
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
                                    <span className="text-sm font-medium text-gray-800">
                                      {Math.round(cel!.pct!)}%
                                    </span>
                                    <span className="mt-1 whitespace-nowrap text-xs text-red-500">
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
              <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Data
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Hora
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Cód. Baixa
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Motivo
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Bairro
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
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
                        <td className="px-3 py-2 tabular-nums text-gray-900">
                          {formatDataBr(row.data)}
                        </td>
                        <td className="px-3 py-2 tabular-nums text-gray-700">
                          {row.hora}
                        </td>
                        <td className="px-3 py-2 font-semibold tabular-nums text-red-600">
                          {row.codBaixa}
                        </td>
                        <td className="px-3 py-2 text-gray-700">
                          {row.descricao}
                        </td>
                        <td className="px-3 py-2 text-gray-700">{row.bairro}</td>
                        <td className="px-3 py-2 tabular-nums text-muted-foreground">
                          {row.numeroWo}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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
                  Top 10 Cód. Quebras
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
                statusNota="IMPRODUTIVO"
                titulo="Top 10 Motivos de Quebra"
                emptyMessage="Nenhuma O.S. improdutiva no contexto filtrado."
                chartHeightClassName="h-96"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
