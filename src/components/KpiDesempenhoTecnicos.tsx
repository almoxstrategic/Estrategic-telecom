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
  filtrarChamadosToa,
  flattenChamadosToa,
  isOsImprodutiva,
  isOsProdutiva,
  normalizeTipoOs,
  normalizeToaLogin,
  valorPrecoOs,
  type ToaChamadoProcessado,
  type ToaResumoTecnico,
} from "@/lib/toa-store";

type KpiFiltroPeriodo = {
  ano: number | null;
  mes: number | null;
  dia: number | null;
};

type TecnicoSelecionado = {
  login: string;
  nome: string;
};

type TipoDetalheNotas = "produtivas" | "perdas";

type NotaDetalheCard = {
  data: string;
  login: string;
  colaborador: string;
  contrato: string;
  numeroWo: string;
  tipoOs: string;
  receita: number;
  isProdutiva: boolean;
  status: string;
};

type KpiDesempenhoTecnicosProps = {
  tecnicos: KpiTopTecnico[];
  tecnicosEquipe: TecnicoProfile[];
  resumoToa: Record<string, ToaResumoTecnico>;
  chamadosProcessados: ToaChamadoProcessado[];
  filtroPeriodo: KpiFiltroPeriodo;
  demitidosKeys: Set<string>;
  precosOs: PrecosOsMap;
  onSalvarPrecos: (precos: PrecoOs[]) => Promise<void>;
};

type FiltroTop = "Geral" | "Top 10" | "Top 5" | "Top 3";

type SortKey =
  | "aproveitamento"
  | "receitaPerda"
  | "receita";

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
  lucro: number;
  mediaMaterialPorNota: number;
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

function formatStatusOsExibicao(os: {
  status: string;
  isExecutada: boolean;
  isProdutiva: boolean;
}): string {
  if (!os.isExecutada) return os.status?.trim() || "Não executada";
  return os.isProdutiva ? "Executada - Produtivo" : "Executada - Improdutivo";
}

function formatReceita(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

/** Colunas da tabela Detalhamento por Técnico: nome flexível + 12 métricas. */
const GRID_TECNICOS =
  "grid grid-cols-[minmax(96px,1.5fr)_repeat(12,minmax(0,1fr))] gap-2";

function formatMediaMaterial(valor: number): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
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
  return `${mesLabel} de ${filtro.ano}`;
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

function valorOrdenacao(tecnico: TecnicoDesempenho, key: SortKey): number {
  switch (key) {
    case "aproveitamento":
      return tecnico.aproveitamento;
    case "receitaPerda":
      return tecnico.receitaPerda;
    case "receita":
      return tecnico.receita;
  }
}

export function KpiDesempenhoTecnicos({
  tecnicos,
  tecnicosEquipe,
  resumoToa,
  chamadosProcessados,
  filtroPeriodo,
  demitidosKeys,
  precosOs,
  onSalvarPrecos,
}: KpiDesempenhoTecnicosProps) {
  const [filtroTop, setFiltroTop] = useState<FiltroTop>("Geral");
  const [buscaTecnico, setBuscaTecnico] = useState("");
  const percentualAumento = usePercentualAumento();
  const [percentualAumentoTexto, setPercentualAumentoTexto] = useState(() =>
    String(getPercentualAumento()),
  );
  const [tecnicoSelecionado, setTecnicoSelecionado] =
    useState<TecnicoSelecionado | null>(null);
  const [detalheNotasTipo, setDetalheNotasTipo] =
    useState<TipoDetalheNotas | null>(null);
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

  const enriquecidos = useMemo<TecnicoDesempenho[]>(() => {
    const kpisPorLogin = new Map(
      tecnicos.map((tecnico) => [normalizeToaLogin(tecnico.id_tecnico), tecnico]),
    );
    const nomesPorLogin = new Map<string, string>();

    for (const tecnico of tecnicosEquipe) {
      for (const identificador of [
        tecnico.identificacao,
        tecnico.login,
        tecnico.id,
      ]) {
        if (identificador?.trim()) {
          nomesPorLogin.set(normalizeToaLogin(identificador), tecnico.nome);
        }
      }
    }

    const base = Object.entries(resumoToa).map(([login, resumo]) => {
      const loginNormalizado = normalizeToaLogin(login);
      const tecnicoKpi = kpisPorLogin.get(loginNormalizado);
      const nome =
        tecnicoKpi?.nome_tecnico?.trim() ||
        nomesPorLogin.get(loginNormalizado) ||
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
  }, [resumoToa, tecnicos, tecnicosEquipe]);

  const tecnicosFiltrados = useMemo(() => {
    const termo = buscaTecnico.trim().toLowerCase();
    if (!termo) return enriquecidos;
    return enriquecidos.filter((tecnico) => {
      const nome = (tecnico.nome || "").toLowerCase();
      const matricula = (tecnico.id_tecnico || "").toLowerCase();
      return nome.includes(termo) || matricula.includes(termo);
    });
  }, [enriquecidos, buscaTecnico]);

  const fatorProjecao = 1 + percentualAumento / 100;

  const tecnicosComProjecao = useMemo(
    () =>
      tecnicosFiltrados.map((tecnico) => ({
        ...tecnico,
        receita: tecnico.receita * fatorProjecao,
        receitaPerda: tecnico.receitaPerda * fatorProjecao,
      })),
    [tecnicosFiltrados, fatorProjecao],
  );

  const tecnicosOrdenados = useMemo(() => {
    if (!sortConfig.key) return tecnicosComProjecao;
    const key = sortConfig.key;
    const fator = sortConfig.direction === "asc" ? 1 : -1;
    return [...tecnicosComProjecao].sort((a, b) => {
      const valorA = valorOrdenacao(a, key);
      const valorB = valorOrdenacao(b, key);
      if (valorA < valorB) return -1 * fator;
      if (valorA > valorB) return 1 * fator;
      return 0;
    });
  }, [tecnicosComProjecao, sortConfig]);

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

  const { totalNotasProdutivas, totalPerdaNotas, receitaTotal } = useMemo(
    () => ({
      totalNotasProdutivas: enriquecidos.reduce(
        (total, tecnico) => total + tecnico.notasProdutivas,
        0,
      ),
      totalPerdaNotas: enriquecidos.reduce(
        (total, tecnico) => total + tecnico.notasImprodutivas,
        0,
      ),
      receitaTotal: enriquecidos.reduce(
        (total, tecnico) => total + tecnico.receita * fatorProjecao,
        0,
      ),
    }),
    [enriquecidos, fatorProjecao],
  );

  const tiposOsImportados = useMemo(() => {
    const map = new Map<
      string,
      { chave: string; tipo: string; tipoAtividade: string; valor: number }
    >();

    for (const entrada of ATIVIDADES_TOA_CATALOGO) {
      const chave = normalizeTipoOs(entrada.tipoAtividade);
      const preco = precosOs[chave];
      map.set(chave, {
        chave,
        tipo: preco?.tipo ?? entrada.tipo,
        tipoAtividade: entrada.tipoAtividade,
        valor: preco?.valor ?? 0,
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
          valor: preco?.valor ?? 0,
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

    setValoresEditados((atuais) => {
      const proximos = { ...atuais };
      let alterou = false;

      for (const { chave, valor } of tiposOsImportados) {
        if (proximos[chave] === undefined) {
          proximos[chave] = valor.toFixed(2);
          alterou = true;
        }
      }

      return alterou ? proximos : atuais;
    });

    setTiposResumoEditados((atuais) => {
      const proximos = { ...atuais };
      let alterou = false;

      for (const { chave, tipo } of tiposOsImportados) {
        if (proximos[chave] === undefined) {
          proximos[chave] = tipo;
          alterou = true;
        }
      }

      return alterou ? proximos : atuais;
    });
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
          ? [{ tipo: novoTipo, tipoAtividade, valor: novoValor }]
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
      return {
        ...tecnico,
        receitaGanha,
        receitaPerda,
        lucro: receitaGanha,
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
        lucro: t.lucro,
        mediaMaterialPorNota: t.mediaMaterialPorNota,
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

  const receitaPeriodoModal = useMemo(() => {
    return osDoTecnico.reduce((total, os) => {
      if (!isOsProdutiva(os)) return total;
      return total + valorPrecoOs(precosOs, os.tipoOs);
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
      unicos.add(formatStatusOsExibicao(os));
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

      if (statusFiltro && formatStatusOsExibicao(os) !== statusFiltro) {
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

  const notasDetalheCard = useMemo<NotaDetalheCard[]>(() => {
    if (!detalheNotasTipo) return [];

    const desejaProdutiva = detalheNotasTipo === "produtivas";
    const osFlat = flattenChamadosToa(
      filtrarChamadosToa(chamadosProcessados, filtroPeriodo),
    ).filter((os) =>
      desejaProdutiva ? isOsProdutiva(os) : isOsImprodutiva(os),
    );

    return osFlat
      .map((os) => {
        const login = normalizeToaLogin(os.login);
        const valorBase = valorPrecoOs(precosOs, os.tipoOs);
        const receita = valorBase * fatorProjecao;

        return {
          data: os.data,
          login,
          colaborador: nomesColaboradorPorLogin.get(login) || login,
          contrato: os.contrato,
          numeroWo: os.numeroWo,
          tipoOs: os.tipoOs,
          receita,
          isProdutiva: os.isProdutiva,
          status: os.status,
        };
      })
      .sort((a, b) => {
        const byDate = a.data.localeCompare(b.data);
        if (byDate !== 0) return byDate;
        const byNome = a.colaborador.localeCompare(b.colaborador, "pt-BR");
        if (byNome !== 0) return byNome;
        return a.numeroWo.localeCompare(b.numeroWo, "pt-BR");
      });
  }, [
    detalheNotasTipo,
    chamadosProcessados,
    filtroPeriodo,
    precosOs,
    fatorProjecao,
    nomesColaboradorPorLogin,
  ]);

  const notasDetalheCardFiltradas = useMemo(() => {
    const termo = buscaDetalheNotas.trim().toLowerCase();
    if (!termo) return notasDetalheCard;

    return notasDetalheCard.filter((nota) => {
      const contrato = (nota.contrato || "").toLowerCase();
      const wo = (nota.numeroWo || "").toLowerCase();
      const nome = (nota.colaborador || "").toLowerCase();
      return (
        contrato.includes(termo) || wo.includes(termo) || nome.includes(termo)
      );
    });
  }, [notasDetalheCard, buscaDetalheNotas]);

  const exportarDetalheNotasExcel = () => {
    if (!detalheNotasTipo) return;

    if (notasDetalheCardFiltradas.length === 0) {
      toast.error("Nenhuma nota visível para exportar.");
      return;
    }

    const dadosExcel = notasDetalheCardFiltradas.map((nota) => {
      const receitaExibida = nota.isProdutiva
        ? nota.receita
        : nota.receita > 0
          ? -Math.abs(nota.receita)
          : 0;

      return {
        Data: formatDataBr(nota.data),
        Colaborador: nota.colaborador,
        Contrato: nota.contrato || "—",
        WO: nota.numeroWo || "—",
        "Tipo OS": nota.tipoOs || "—",
        Receita: Number(receitaExibida.toFixed(2)),
        Status: nota.isProdutiva ? "Produtivo" : "Quebra/Improdutivo",
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
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
      `Excel exportado: ${formatQuantidade(notasDetalheCardFiltradas.length)} notas.`,
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
      <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-3">
        <button
          type="button"
          onClick={() => abrirDetalheNotas("produtivas")}
          className="cursor-pointer rounded-xl border border-gray-200 bg-white p-5 text-left transition hover:border-green-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-green-500"
          aria-label="Abrir detalhamento de notas produtivas"
        >
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 shrink-0 text-green-600" />
            <span className="text-sm font-medium text-muted-foreground">
              Total de notas produtivas (TOA)
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
              Total de perda de notas (TOA)
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
              Receita Total
            </span>
          </div>
          <div className="mt-3 text-3xl font-bold text-green-600">
            {formatReceita(receitaTotal)}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <div className="flex justify-between items-center gap-3">
          <h2 className="flex items-center gap-2 font-bold text-foreground">
            <BarChart3 className="h-4 w-4 text-primary" />
            Visão Geral de Desempenho
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
                    return (
                      <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                        <p className="font-semibold">{item.nomeCompleto}</p>
                        <p className="text-green-600">
                          Notas Produtivas: {formatQuantidade(item.notasProdutivas)} -{" "}
                          {formatReceita(item.receitaGanha)}
                        </p>
                        <p className="text-red-600">
                          Notas Improdutivas: {formatQuantidade(item.notasImprodutivas)} -{" "}
                          {formatReceita(item.receitaPerda)}
                        </p>
                        <p
                          className={
                            item.lucro > 0
                              ? "text-green-600"
                              : item.lucro < 0
                                ? "text-red-600"
                                : "text-gray-500"
                          }
                        >
                          Lucro: {formatReceita(item.lucro)}
                        </p>
                        <p className="text-gray-700">
                          Média Misc/Nota:{" "}
                          {formatMediaMaterial(item.mediaMaterialPorNota)}
                        </p>
                        <p className="text-amber-500">
                          Pareto:{" "}
                          {item.pareto.toLocaleString("pt-BR", {
                            minimumFractionDigits: 1,
                            maximumFractionDigits: 1,
                          })}
                          %
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Clique na barra para ver o detalhamento
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
        <div className="mb-4 flex items-center gap-2">
          <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-800">
            <Users className="h-4 w-4 text-primary" />
            Detalhamento por Técnico
          </h2>
          <button
            type="button"
            onClick={abrirTabelaPrecos}
            className="flex h-5 w-5 items-center justify-center rounded-full bg-gray-200 text-xs font-bold text-gray-600 transition-colors hover:bg-gray-300"
            title="Ver Tabela de Preços"
            aria-label="Ver tabela de preços"
          >
            ?
          </button>
        </div>

        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <input
            type="search"
            value={buscaTecnico}
            onChange={(e) => setBuscaTecnico(e.target.value)}
            placeholder="Buscar por nome ou matrícula (Z)..."
            aria-label="Buscar técnico por nome ou matrícula"
            className="w-full rounded-md border border-gray-300 bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500 md:w-72"
          />

          <label className="flex w-full items-center gap-2 sm:w-auto">
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
        {enriquecidos.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum técnico com baixa no período selecionado.
          </p>
        ) : tecnicosFiltrados.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-muted-foreground">
            Nenhum técnico encontrado para “{buscaTecnico.trim()}”.
          </p>
        ) : (
          <div className="w-full">
            <div
              className={`${GRID_TECNICOS} items-end border-b border-border px-2 py-2 text-xs font-semibold leading-tight text-muted-foreground`}
            >
              <span className="text-left">Nome</span>
              <span className="text-center">Total de Notas feitas</span>
              <span className="text-center">Total de Notas produtivas</span>
              <span className="text-center">Total de Notas improdutivas</span>
              <span className="text-center">O.S produtivas</span>
              <span className="text-center">O.S Improdutivas</span>
              <span className="text-center">Baixa misc</span>
              <span className="text-center">Média de material por nota</span>
              <span className="text-center">% Freq. Relativa</span>
              <span className="text-center">% Freq. Absoluta</span>
              <span className="text-center">
                {cabecalhoOrdenavel("Aproveitamento", "aproveitamento")}
              </span>
              <span className="text-center">
                {cabecalhoOrdenavel("Receita Perda", "receitaPerda")}
              </span>
              <span className="text-center">
                {cabecalhoOrdenavel("Receita faturada", "receita")}
              </span>
            </div>

            <ul>
              {tecnicosOrdenados.map((tecnico) => {
                const isDemitido = isTecnicoDemitido(
                  demitidosKeys,
                  tecnico.id_tecnico,
                  tecnico.nome,
                );
                return (
                  <li
                    key={tecnico.id_tecnico}
                    className={`${GRID_TECNICOS} items-center border-b border-border px-2 py-3 text-xs last:border-b-0`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        abrirDetalheTecnico(tecnico.id_tecnico, tecnico.nome)
                      }
                      className={
                        isDemitido
                          ? "max-w-[150px] truncate text-left font-medium text-gray-500 hover:underline"
                          : "max-w-[150px] truncate text-left font-medium text-primary hover:underline"
                      }
                      title={tecnico.nome}
                    >
                      {tecnico.nome}
                    </button>
                    <span className="text-center font-bold tabular-nums text-gray-900">
                      {formatQuantidade(tecnico.totalNotasFeitas)}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-500">
                      {formatQuantidade(tecnico.notasProdutivas)}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-500">
                      {formatQuantidade(tecnico.notasImprodutivas)}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-500">
                      {tecnico.osProdutivas}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-500">
                      {tecnico.osImprodutivas}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-700">
                      {formatQuantidade(tecnico.baixaMisc)}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-700">
                      {formatMediaMaterial(tecnico.mediaMaterialPorNota)}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-600">
                      {tecnico.freqRelativa}
                    </span>
                    <span className="text-center font-normal tabular-nums text-gray-600">
                      {tecnico.freqAbsoluta}
                    </span>
                    <span className="text-center font-semibold tabular-nums text-gray-800">
                      {tecnico.mediaAproveitamento}
                    </span>
                    <span className="text-center font-medium tabular-nums text-red-600">
                      {formatReceita(tecnico.receitaPerda)}
                    </span>
                    <span
                      className={`text-center font-bold tabular-nums ${
                        tecnico.receita > 0
                          ? "text-green-600"
                          : tecnico.receita < 0
                            ? "text-red-600"
                            : "text-gray-500"
                      }`}
                    >
                      {formatReceita(tecnico.receita)}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
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
            className="max-h-[90vh] w-11/12 max-w-6xl overflow-y-auto rounded-lg bg-white p-6 shadow-xl"
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
                  {formatQuantidade(notasDetalheCardFiltradas.length)}
                  {buscaDetalheNotas.trim()
                    ? ` de ${formatQuantidade(notasDetalheCard.length)}`
                    : ""}{" "}
                  notas no período selecionado
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
                placeholder="Pesquisar por Contrato, WO ou Nome do Colaborador..."
                aria-label="Pesquisar por Contrato, WO ou Nome do Colaborador"
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

            <div className="overflow-x-auto rounded-lg border border-gray-200">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Data</th>
                    <th className="px-3 py-2 font-semibold">Colaborador</th>
                    <th className="px-3 py-2 font-semibold">Contrato</th>
                    <th className="px-3 py-2 font-semibold">WO</th>
                    <th className="px-3 py-2 font-semibold">Tipo OS</th>
                    <th className="px-3 py-2 font-semibold">Receita</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {notasDetalheCardFiltradas.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        Nenhuma nota para exibir.
                      </td>
                    </tr>
                  ) : (
                    notasDetalheCardFiltradas.map((nota, index) => {
                      const ganhoReal = nota.isProdutiva && nota.receita > 0;
                      const perdaReal = !nota.isProdutiva && nota.receita > 0;
                      const receitaExibida = perdaReal
                        ? -Math.abs(nota.receita)
                        : nota.receita;

                      return (
                        <tr
                          key={`${nota.data}-${nota.login}-${nota.numeroWo}-${index}`}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2 tabular-nums text-gray-800">
                            {formatDataBr(nota.data)}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {nota.colaborador}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {nota.contrato || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {nota.numeroWo || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {nota.tipoOs || "—"}
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
                            {formatReceita(receitaExibida)}
                          </td>
                          <td className="px-3 py-2">
                            {nota.isProdutiva ? (
                              <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                Produtivo
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                                Quebra/Improdutivo
                              </span>
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
                    <th className="px-3 py-2 font-semibold">Número da WO</th>
                    <th className="px-3 py-2 font-semibold">Contrato</th>
                    <th className="px-3 py-2 font-semibold">Tipo da OS</th>
                    <th className="px-3 py-2 font-semibold">Cód de Baixa</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Valor</th>
                  </tr>
                </thead>
                <tbody>
                  {osDoTecnicoTabela.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-8 text-center text-muted-foreground"
                      >
                        Nenhuma O.S. para exibir.
                      </td>
                    </tr>
                  ) : (
                    osDoTecnicoTabela.map((os, index) => {
                      const valorNota = valorPrecoOs(precosOs, os.tipoOs);
                      const ganhoReal = isOsProdutiva(os) && valorNota > 0;
                      const perdaReal = isOsImprodutiva(os) && valorNota > 0;

                      return (
                        <tr
                          key={`${os.data}-${os.numeroWo}-${os.numeroOs}-${os.codBaixa}-${index}`}
                          className="border-t border-gray-100"
                        >
                          <td className="px-3 py-2 tabular-nums text-gray-800">
                            {formatDataBr(os.data)}
                          </td>
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {os.numeroWo || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.contrato || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.tipoOs || "—"}
                          </td>
                          <td className="px-3 py-2 text-gray-700">
                            {os.codBaixaBruto || String(os.codBaixa)}
                          </td>
                          <td className="px-3 py-2">
                            {!os.isExecutada ? (
                              <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-semibold text-gray-600">
                                {formatStatusOsExibicao(os)}
                              </span>
                            ) : os.isProdutiva ? (
                              <span className="inline-flex rounded-full bg-green-50 px-2.5 py-0.5 text-xs font-semibold text-green-700">
                                {formatStatusOsExibicao(os)}
                              </span>
                            ) : (
                              <span className="inline-flex rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-semibold text-red-700">
                                {formatStatusOsExibicao(os)}
                              </span>
                            )}
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
                              perdaReal ? -Math.abs(valorNota) : valorNota,
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
                  </tr>
                </thead>
                <tbody>
                  {tiposOsImportados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Nenhum Tipo de O.S. encontrado na importação TOA.
                      </td>
                    </tr>
                  ) : tiposOsFiltrados.length === 0 ? (
                    <tr>
                      <td
                        colSpan={3}
                        className="px-4 py-6 text-center text-muted-foreground"
                      >
                        Nenhum Tipo de O.S. encontrado para “{buscaTipoOs.trim()}”.
                      </td>
                    </tr>
                  ) : (
                    tiposOsFiltrados.map(({ chave, tipo, tipoAtividade, valor }) => (
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
                              Number(valoresEditados[chave] ?? valor) > 0
                                ? "border-gray-300 font-semibold text-green-600"
                                : "border-orange-300 font-medium text-orange-500"
                            }`}
                          />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-4 text-center text-xs text-gray-400">
              * Valores de referência baseados no analítico. Tipos em laranja
              ainda não possuem preço mapeado.
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
