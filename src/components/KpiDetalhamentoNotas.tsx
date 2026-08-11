import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronUp,
  FilterX,
  MapPin,
  Search,
  ThumbsDown,
  ThumbsUp,
  X,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ComposedChart,
  Line,
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
import {
  fetchCompetenciasToa,
  fetchToaImportacoes,
  filtrarToaOsContabilizaveis,
  type ToaImportacaoRow,
} from "@/lib/faturamento-service";
import {
  descricaoDoCodigoBaixa,
  fetchDicionarioCodigosBaixa,
  normalizeCodigoBaixa,
  type DicionarioCodigosBaixaMap,
} from "@/lib/dicionario-codigos-baixa";
import { normalizeNumeroWo } from "@/lib/toa-store";

const TIPO_OS_NAO_INFORMADO = "Tipo não informado";

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

const BAIRRO_NAO_INFORMADO = "Não Informado";
const CIDADE_TODAS = "Todas";
const TECNICO_TODOS = "Todos";

type ModalSortKey = "produtivas" | "improdutivas" | "aproveitamento";
type ModalSortConfig = { key: ModalSortKey; direction: "asc" | "desc" };

export type Top3TipoItem = {
  label: string;
  pct: number;
};

export type TipoOsDetalheTecnico = {
  tipoOs: string;
  produtivas: number;
  improdutivas: number;
  aproveitamento: number;
};

export type TecnicoRankingItem = {
  nome: string;
  valor: number;
};

export type BairroVolumeAgg = {
  bairro: string;
  cidade: string;
  produtivas: number;
  improdutivas: number;
  /** Alias legado — mesmo valor de totalNotasBairro. */
  total: number;
  /** Soma local: produtivas + improdutivas do bairro. */
  totalNotasBairro: number;
  top5TecnicosProdutivos: TecnicoRankingItem[];
  top5TecnicosImprodutivos: TecnicoRankingItem[];
};

type ChartBairroPoint = {
  bairro: string;
  volume: number;
  totalNotasBairro: number;
  tipo: "produtivas" | "quebras";
  top5TecnicosProdutivos: TecnicoRankingItem[];
  top5TecnicosImprodutivos: TecnicoRankingItem[];
};

type ParetoView = "Produtivas" | "Improdutivas";

type ParetoPoint = {
  bairro: string;
  cidade: string;
  volume: number;
  totalNotasBairro: number;
  acumulado: number;
  pctAcumulada: number;
};

type BairroChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    dataKey?: string | number;
    payload?: ChartBairroPoint;
  }>;
};

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function formatPct(valor: number, total: number): string {
  if (total <= 0) return "0.0%";
  return `${((valor / total) * 100).toFixed(1)}%`;
}

function formatAproveitamento(pct: number): string {
  return `${pct.toFixed(1)}%`;
}

function formatCardShare(valor: number, total: number): string {
  return `${formatQuantidade(valor)} de ${formatQuantidade(total)} = ${formatPct(valor, total)}`;
}

function normalizarCidade(value: string | null | undefined): string {
  return String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarBairro(value: string | null | undefined): string {
  const t = String(value ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return t || BAIRRO_NAO_INFORMADO;
}

function nomeTecnicoDaLinha(row: ToaImportacaoRow): string {
  const nome = String(row.nome_tecnico ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (nome) return nome;
  const login = String(row.login_tecnico ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return login || "Sem nome";
}

function top5FromRecord(rec: Record<string, number>): TecnicoRankingItem[] {
  return Object.entries(rec)
    .map(([nome, valor]) => ({ nome, valor }))
    .sort(
      (a, b) =>
        b.valor - a.valor || a.nome.localeCompare(b.nome, "pt-BR"),
    )
    .slice(0, 5);
}

function labelTipoOs(row: ToaImportacaoRow): string {
  const tipo = String(row.tipo_os ?? "")
    .replace(/\u00a0/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return tipo || TIPO_OS_NAO_INFORMADO;
}

function topNLabelsFromRecord(
  rec: Record<string, number>,
  n: number,
  totalBase: number,
): Top3TipoItem[] {
  return Object.entries(rec)
    .map(([label, qtd]) => ({ label, qtd }))
    .sort(
      (a, b) =>
        b.qtd - a.qtd || a.label.localeCompare(b.label, "pt-BR"),
    )
    .slice(0, n)
    .map((item) => ({
      label: item.label,
      pct: totalBase > 0 ? (item.qtd / totalBase) * 100 : 0,
    }));
}

function Top3TipoLista({ items }: { items: Top3TipoItem[] }) {
  if (items.length === 0) {
    return <span className="text-muted-foreground">—</span>;
  }
  return (
    <ul className="space-y-0.5">
      {items.map((item) => (
        <li key={item.label} title={`${item.label} (${item.pct.toFixed(1)}%)`}>
          <div className="flex items-baseline justify-between gap-2">
            <span className="min-w-0 truncate">{item.label}</span>
            <span className="shrink-0 whitespace-nowrap font-medium tabular-nums text-gray-500">
              ({item.pct.toFixed(1)}%)
            </span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export type TecnicoDetalheBairro = {
  nome: string;
  produtivas: number;
  improdutivas: number;
  /** Percentual 0–100: produtivas / (produtivas + improdutivas). */
  aproveitamento: number;
  top3TipoOsProd: Top3TipoItem[];
  top3TipoOsImprod: Top3TipoItem[];
};

/**
 * Detalhe do bairro agrupado por técnico (WO única para volume;
 * Top 3 Tipo O.S. a partir das linhas de O.S.).
 */
export function agregarDetalheTecnicosPorBairro(
  rows: ToaImportacaoRow[],
  bairroAlvo: string,
  dicionario: DicionarioCodigosBaixaMap | Record<string, string> = {},
): TecnicoDetalheBairro[] {
  const bairroNorm = normalizarBairro(bairroAlvo);
  const rowsBairro = rows.filter(
    (row) => normalizarBairro(row.bairro) === bairroNorm,
  );

  const byWo = new Map<
    string,
    {
      statusNota: "Produtiva" | "Improdutiva";
      nomeTecnico: string;
    }
  >();

  for (const row of rowsBairro) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;

    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";
    const nomeTecnico = nomeTecnicoDaLinha(row);

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, { statusNota, nomeTecnico });
      continue;
    }
    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (
      (prev.nomeTecnico === "Sem nome" || !prev.nomeTecnico) &&
      nomeTecnico !== "Sem nome"
    ) {
      prev.nomeTecnico = nomeTecnico;
    }
  }

  type Bucket = {
    produtivas: number;
    improdutivas: number;
    tiposProd: Record<string, number>;
    tiposImprod: Record<string, number>;
  };

  const byTecnico = new Map<string, Bucket>();

  const ensureBucket = (nome: string): Bucket => {
    const existing = byTecnico.get(nome);
    if (existing) return existing;
    const created: Bucket = {
      produtivas: 0,
      improdutivas: 0,
      tiposProd: {},
      tiposImprod: {},
    };
    byTecnico.set(nome, created);
    return created;
  };

  for (const { statusNota, nomeTecnico } of byWo.values()) {
    const bucket = ensureBucket(nomeTecnico);
    if (statusNota === "Produtiva") bucket.produtivas += 1;
    else bucket.improdutivas += 1;
  }

  for (const row of rowsBairro) {
    const nomeTecnico = nomeTecnicoDaLinha(row);
    const bucket = ensureBucket(nomeTecnico);

    if (row.status_nota === "Produtiva") {
      const tipo = labelTipoOs(row);
      bucket.tiposProd[tipo] = (bucket.tiposProd[tipo] ?? 0) + 1;
      continue;
    }

    const codigo = normalizeCodigoBaixa(row.cod_baixa);
    if (!codigo) continue;
    const label = `${codigo} - ${descricaoDoCodigoBaixa(codigo, dicionario)}`;
    bucket.tiposImprod[label] = (bucket.tiposImprod[label] ?? 0) + 1;
  }

  return Array.from(byTecnico.entries())
    .map(([nome, bucket]) => {
      const total = bucket.produtivas + bucket.improdutivas;
      const totalTiposProd = Object.values(bucket.tiposProd).reduce(
        (acc, qtd) => acc + qtd,
        0,
      );
      const totalTiposImprod = Object.values(bucket.tiposImprod).reduce(
        (acc, qtd) => acc + qtd,
        0,
      );
      return {
        nome,
        produtivas: bucket.produtivas,
        improdutivas: bucket.improdutivas,
        aproveitamento: total > 0 ? (bucket.produtivas / total) * 100 : 0,
        // Percentual = qtd do tipo / total de O.S. produtivas (ou improdutivas) do técnico
        top3TipoOsProd: topNLabelsFromRecord(
          bucket.tiposProd,
          3,
          totalTiposProd,
        ),
        top3TipoOsImprod: topNLabelsFromRecord(
          bucket.tiposImprod,
          3,
          totalTiposImprod,
        ),
      };
    })
    .filter((t) => t.produtivas > 0 || t.improdutivas > 0)
    .sort(
      (a, b) =>
        b.produtivas + b.improdutivas - (a.produtivas + a.improdutivas) ||
        b.produtivas - a.produtivas ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
}

/**
 * Agrupa linhas de um técnico por tipo_os (contagem de O.S. produtivas/improdutivas).
 */
export function agregarTiposOsPorTecnico(
  rows: ToaImportacaoRow[],
): TipoOsDetalheTecnico[] {
  const byTipo = new Map<
    string,
    { produtivas: number; improdutivas: number }
  >();

  for (const row of rows) {
    const tipoOs = labelTipoOs(row);
    const bucket = byTipo.get(tipoOs) ?? { produtivas: 0, improdutivas: 0 };
    if (row.status_nota === "Produtiva") bucket.produtivas += 1;
    else bucket.improdutivas += 1;
    byTipo.set(tipoOs, bucket);
  }

  return Array.from(byTipo.entries())
    .map(([tipoOs, counts]) => {
      const total = counts.produtivas + counts.improdutivas;
      return {
        tipoOs,
        produtivas: counts.produtivas,
        improdutivas: counts.improdutivas,
        aproveitamento: total > 0 ? (counts.produtivas / total) * 100 : 0,
      };
    })
    .sort(
      (a, b) =>
        b.produtivas + b.improdutivas - (a.produtivas + a.improdutivas) ||
        b.produtivas - a.produtivas ||
        a.tipoOs.localeCompare(b.tipoOs, "pt-BR"),
    );
}

function BairroChartTooltip({
  active,
  payload,
  label,
}: BairroChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const data = entry.payload;
  if (!data) return null;

  const valor = Number(entry.value) || 0;
  const isProdutivas = data.tipo === "produtivas";
  const totalLabel = isProdutivas ? "Produtivas" : "Quebras";
  const totalLocal = data.totalNotasBairro;
  const pct = formatPct(valor, totalLocal);
  const top5 = isProdutivas
    ? data.top5TecnicosProdutivos
    : data.top5TecnicosImprodutivos;

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">{String(label ?? data.bairro)}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {totalLabel}:{" "}
        <span
          className={`font-semibold tabular-nums ${
            isProdutivas ? "text-green-700" : "text-red-600"
          }`}
        >
          {formatQuantidade(valor)} ({pct})
        </span>
      </p>
      {top5.length > 0 ? (
        <>
          <p className="mt-2 text-xs font-semibold text-gray-700">
            Top 5 Técnicos
          </p>
          <ul className="mt-1 space-y-0.5 text-xs text-gray-700">
            {top5.map((t) => (
              <li key={t.nome} className="flex justify-between gap-3">
                <span className="truncate">{t.nome}</span>
                <span className="shrink-0 tabular-nums font-medium">
                  {formatQuantidade(t.valor)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="mt-2 text-xs text-muted-foreground">
          Sem técnicos neste bairro.
        </p>
      )}
    </div>
  );
}

type ParetoTooltipProps = {
  active?: boolean;
  label?: string | number;
  payload?: Array<{
    value?: number | string;
    dataKey?: string | number;
    name?: string;
    payload?: ParetoPoint;
  }>;
  paretoView: ParetoView;
};

function ParetoTooltip({
  active,
  payload,
  label,
  paretoView,
}: ParetoTooltipProps) {
  if (!active || !payload?.length) return null;
  const volumeEntry = payload.find((p) => p.dataKey === "volume");
  const pctEntry = payload.find((p) => p.dataKey === "pctAcumulada");
  const volume = Number(volumeEntry?.value) || 0;
  const pctAcum = Number(pctEntry?.value) || 0;
  const point = volumeEntry?.payload ?? payload[0]?.payload;
  const totalLocal = point?.totalNotasBairro ?? 0;
  const taxaLocal = formatPct(volume, totalLocal);
  const bairro = point?.bairro ?? String(label ?? "");
  const cidade = point?.cidade?.trim() || "";
  const titulo =
    bairro && cidade ? `${bairro} - ${cidade}` : bairro || cidade || "—";

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">{titulo}</p>
      <p className="mt-1 text-sm text-muted-foreground">
        {paretoView}:{" "}
        <span
          className={`font-semibold tabular-nums ${
            paretoView === "Produtivas" ? "text-green-700" : "text-red-600"
          }`}
        >
          {formatQuantidade(volume)} ({taxaLocal})
        </span>
      </p>
      <p className="mt-0.5 text-sm text-amber-700">
        Acumulado:{" "}
        <span className="font-semibold tabular-nums">
          {pctAcum.toFixed(1)}%
        </span>
      </p>
    </div>
  );
}

/**
 * Agrupa toa_importacoes por bairro contando WOs únicas.
 * Nota produtiva no bairro se ≥1 O.S. da WO for Produtiva.
 * Inclui Top 5 técnicos produtivos/improdutivos por bairro.
 */
export function agregarVolumeNotasPorBairro(
  rows: ToaImportacaoRow[],
): BairroVolumeAgg[] {
  const byWo = new Map<
    string,
    {
      bairro: string;
      cidade: string;
      statusNota: "Produtiva" | "Improdutiva";
      nomeTecnico: string;
    }
  >();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;

    const bairro = normalizarBairro(row.bairro);
    const cidade = normalizarCidade(row.cidade);
    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";
    const nomeTecnico = nomeTecnicoDaLinha(row);

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, { bairro, cidade, statusNota, nomeTecnico });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (
      prev.bairro === BAIRRO_NAO_INFORMADO &&
      bairro !== BAIRRO_NAO_INFORMADO
    ) {
      prev.bairro = bairro;
    }
    if (!prev.cidade && cidade) prev.cidade = cidade;
    if (
      (prev.nomeTecnico === "Sem nome" || !prev.nomeTecnico) &&
      nomeTecnico !== "Sem nome"
    ) {
      prev.nomeTecnico = nomeTecnico;
    }
  }

  const byBairro = new Map<
    string,
    {
      produtivas: number;
      improdutivas: number;
      tecnicosProdutivos: Record<string, number>;
      tecnicosImprodutivos: Record<string, number>;
      cidades: Record<string, number>;
    }
  >();

  for (const { bairro, cidade, statusNota, nomeTecnico } of byWo.values()) {
    const bucket = byBairro.get(bairro) ?? {
      produtivas: 0,
      improdutivas: 0,
      tecnicosProdutivos: {},
      tecnicosImprodutivos: {},
      cidades: {},
    };
    if (statusNota === "Produtiva") {
      bucket.produtivas += 1;
      bucket.tecnicosProdutivos[nomeTecnico] =
        (bucket.tecnicosProdutivos[nomeTecnico] ?? 0) + 1;
    } else {
      bucket.improdutivas += 1;
      bucket.tecnicosImprodutivos[nomeTecnico] =
        (bucket.tecnicosImprodutivos[nomeTecnico] ?? 0) + 1;
    }
    if (cidade) {
      bucket.cidades[cidade] = (bucket.cidades[cidade] ?? 0) + 1;
    }
    byBairro.set(bairro, bucket);
  }

  return Array.from(byBairro.entries())
    .map(([bairro, counts]) => {
      const totalNotasBairro = counts.produtivas + counts.improdutivas;
      const cidadePredominante =
        Object.entries(counts.cidades).sort(
          (a, b) =>
            b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
        )[0]?.[0] ?? "";
      return {
        bairro,
        cidade: cidadePredominante,
        produtivas: counts.produtivas,
        improdutivas: counts.improdutivas,
        total: totalNotasBairro,
        totalNotasBairro,
        top5TecnicosProdutivos: top5FromRecord(counts.tecnicosProdutivos),
        top5TecnicosImprodutivos: top5FromRecord(counts.tecnicosImprodutivos),
      };
    })
    .sort(
      (a, b) =>
        b.totalNotasBairro - a.totalNotasBairro ||
        a.bairro.localeCompare(b.bairro, "pt-BR"),
    );
}

export function KpiDetalhamentoNotas() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [paretoView, setParetoView] = useState<ParetoView>("Produtivas");
  const [buscaBairro, setBuscaBairro] = useState("");
  const [cidadeSelecionada, setCidadeSelecionada] = useState(CIDADE_TODAS);
  const [tecnicoSelecionado, setTecnicoSelecionado] = useState(TECNICO_TODOS);
  const [dropdownTecnicoAberto, setDropdownTecnicoAberto] = useState(false);
  const [buscaTecnicoFiltro, setBuscaTecnicoFiltro] = useState("");
  const dropdownTecnicoRef = useRef<HTMLDivElement | null>(null);
  const [bairroDetalhe, setBairroDetalhe] = useState<string | null>(null);
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState("");
  const [anoModal, setAnoModal] = useState<number | null>(null);
  const [mesModal, setMesModal] = useState<number | null>(null);
  const [rowsModal, setRowsModal] = useState<ToaImportacaoRow[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<ModalSortConfig | null>(null);
  const [tecnicoDetalheModal, setTecnicoDetalheModal] = useState<string | null>(
    null,
  );
  const [anoTecnicoModal, setAnoTecnicoModal] = useState<number | null>(null);
  const [mesTecnicoModal, setMesTecnicoModal] = useState<number | null>(null);
  const [rowsTecnicoModal, setRowsTecnicoModal] = useState<ToaImportacaoRow[]>(
    [],
  );
  const [loadingTecnicoModal, setLoadingTecnicoModal] = useState(false);
  const [sortConfigTecnico, setSortConfigTecnico] =
    useState<ModalSortConfig | null>(null);
  const [dicionarioBaixa, setDicionarioBaixa] = useState<DicionarioCodigosBaixaMap>(
    {},
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const comps = await fetchCompetenciasToa();
        if (cancelled) return;
        setCompetencias(comps);
      } catch {
        if (!cancelled) setCompetencias([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const map = await fetchDicionarioCodigosBaixa();
        if (!cancelled) setDicionarioBaixa(map);
      } catch (err) {
        console.error("Erro ao carregar dicionário de códigos de baixa:", err);
        if (!cancelled) setDicionarioBaixa({});
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
        console.error("Erro ao carregar detalhamento de notas:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar o detalhamento de notas TOA.",
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

  const cidadesDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      const cidade = normalizarCidade(row.cidade);
      if (cidade) set.add(cidade);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

  useEffect(() => {
    if (cidadeSelecionada === CIDADE_TODAS) return;
    if (!cidadesDisponiveis.includes(cidadeSelecionada)) {
      setCidadeSelecionada(CIDADE_TODAS);
    }
  }, [cidadesDisponiveis, cidadeSelecionada]);

  const listaTecnicos = useMemo(() => {
    const set = new Set<string>();
    for (const row of rows) {
      if (
        cidadeSelecionada !== CIDADE_TODAS &&
        normalizarCidade(row.cidade) !== cidadeSelecionada
      ) {
        continue;
      }
      const nome = nomeTecnicoDaLinha(row);
      if (nome) set.add(nome);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows, cidadeSelecionada]);

  const tecnicosFiltrados = useMemo(() => {
    const termo = buscaTecnicoFiltro.trim().toLowerCase();
    if (!termo) return listaTecnicos;
    return listaTecnicos.filter((t) => t.toLowerCase().includes(termo));
  }, [listaTecnicos, buscaTecnicoFiltro]);

  useEffect(() => {
    if (!dropdownTecnicoAberto) return;
    const onMouseDown = (e: MouseEvent) => {
      const el = dropdownTecnicoRef.current;
      if (el && !el.contains(e.target as Node)) {
        setDropdownTecnicoAberto(false);
        setBuscaTecnicoFiltro("");
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [dropdownTecnicoAberto]);

  useEffect(() => {
    if (tecnicoSelecionado === TECNICO_TODOS) return;
    if (!listaTecnicos.includes(tecnicoSelecionado)) {
      setTecnicoSelecionado(TECNICO_TODOS);
    }
  }, [listaTecnicos, tecnicoSelecionado]);

  const rowsFiltrados = useMemo(() => {
    return rows.filter((row) => {
      const filtroCidade =
        cidadeSelecionada === CIDADE_TODAS ||
        normalizarCidade(row.cidade) === cidadeSelecionada;
      const filtroTecnico =
        tecnicoSelecionado === TECNICO_TODOS ||
        nomeTecnicoDaLinha(row) === tecnicoSelecionado;
      return filtroCidade && filtroTecnico;
    });
  }, [rows, cidadeSelecionada, tecnicoSelecionado]);

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
      if (anoModal !== null && a !== anoModal) continue;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [competencias, anoModal]);

  const mesesDisponiveisTecnicoModal = useMemo(() => {
    const set = new Set<number>();
    for (const ym of competencias) {
      const a = Math.floor(ym / 100);
      const m = ym % 100;
      if (anoTecnicoModal !== null && a !== anoTecnicoModal) continue;
      if (m >= 1 && m <= 12) set.add(m);
    }
    return [...set].sort((a, b) => a - b);
  }, [competencias, anoTecnicoModal]);

  useEffect(() => {
    if (bairroDetalhe == null) return;
    setAnoModal(ano);
    setMesModal(mes);
    setBuscaTecnicoModal("");
    setSortConfig(null);
    setTecnicoDetalheModal(null);
    // Sincroniza apenas na abertura/troca do bairro (não quando o filtro global muda com o modal aberto).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- herdar ano/mes no momento da abertura
  }, [bairroDetalhe]);

  useEffect(() => {
    if (tecnicoDetalheModal == null) return;
    setAnoTecnicoModal(anoModal);
    setMesTecnicoModal(mesModal);
    setSortConfigTecnico(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- herdar período do modal de bairro na abertura
  }, [tecnicoDetalheModal]);

  useEffect(() => {
    if (bairroDetalhe == null) {
      setRowsModal([]);
      setLoadingModal(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingModal(true);
      try {
        const flat = await fetchToaImportacoes({
          ano: anoModal,
          mes: mesModal,
          dia: null,
        });
        if (cancelled) return;
        setRowsModal(filtrarToaOsContabilizaveis(flat));
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar detalhe do bairro:", err);
        setRowsModal([]);
      } finally {
        if (!cancelled) setLoadingModal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [bairroDetalhe, anoModal, mesModal]);

  useEffect(() => {
    if (tecnicoDetalheModal == null || bairroDetalhe == null) {
      setRowsTecnicoModal([]);
      setLoadingTecnicoModal(false);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoadingTecnicoModal(true);
      try {
        const flat = await fetchToaImportacoes({
          ano: anoTecnicoModal,
          mes: mesTecnicoModal,
          dia: null,
        });
        if (cancelled) return;
        setRowsTecnicoModal(filtrarToaOsContabilizaveis(flat));
      } catch (err) {
        if (cancelled) return;
        console.error("Erro ao carregar detalhe do técnico:", err);
        setRowsTecnicoModal([]);
      } finally {
        if (!cancelled) setLoadingTecnicoModal(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tecnicoDetalheModal, bairroDetalhe, anoTecnicoModal, mesTecnicoModal]);

  const rankingBairros = useMemo(
    () => agregarVolumeNotasPorBairro(rowsFiltrados),
    [rowsFiltrados],
  );

  const { totalProdutivasGeral, totalImprodutivasGeral } = useMemo(() => {
    let produtivas = 0;
    let improdutivas = 0;
    for (const b of rankingBairros) {
      produtivas += b.produtivas;
      improdutivas += b.improdutivas;
    }
    return {
      totalProdutivasGeral: produtivas,
      totalImprodutivasGeral: improdutivas,
    };
  }, [rankingBairros]);

  const porBairro = rankingBairros;

  const topProdutivo = useMemo(() => {
    if (porBairro.length === 0) return null;
    return [...porBairro].sort(
      (a, b) =>
        b.produtivas - a.produtivas ||
        b.total - a.total ||
        a.bairro.localeCompare(b.bairro, "pt-BR"),
    )[0]!;
  }, [porBairro]);

  const topImprodutivo = useMemo(() => {
    if (porBairro.length === 0) return null;
    return [...porBairro].sort(
      (a, b) =>
        b.improdutivas - a.improdutivas ||
        b.total - a.total ||
        a.bairro.localeCompare(b.bairro, "pt-BR"),
    )[0]!;
  }, [porBairro]);

  const chartProdutivas = useMemo(
    (): ChartBairroPoint[] =>
      [...porBairro]
        .filter((b) => b.produtivas > 0)
        .sort((a, b) => b.produtivas - a.produtivas)
        .slice(0, 10)
        .map((b) => ({
          bairro: b.bairro,
          volume: b.produtivas,
          totalNotasBairro: b.totalNotasBairro,
          tipo: "produtivas" as const,
          top5TecnicosProdutivos: b.top5TecnicosProdutivos,
          top5TecnicosImprodutivos: b.top5TecnicosImprodutivos,
        })),
    [porBairro],
  );

  const chartImprodutivas = useMemo(
    (): ChartBairroPoint[] =>
      [...porBairro]
        .filter((b) => b.improdutivas > 0)
        .sort((a, b) => b.improdutivas - a.improdutivas)
        .slice(0, 10)
        .map((b) => ({
          bairro: b.bairro,
          volume: b.improdutivas,
          totalNotasBairro: b.totalNotasBairro,
          tipo: "quebras" as const,
          top5TecnicosProdutivos: b.top5TecnicosProdutivos,
          top5TecnicosImprodutivos: b.top5TecnicosImprodutivos,
        })),
    [porBairro],
  );

  const paretoData = useMemo((): ParetoPoint[] => {
    const totalBase =
      paretoView === "Produtivas"
        ? totalProdutivasGeral
        : totalImprodutivasGeral;
    const ordenado = [...rankingBairros]
      .map((b) => ({
        bairro: b.bairro,
        cidade: b.cidade,
        volume:
          paretoView === "Produtivas" ? b.produtivas : b.improdutivas,
        totalNotasBairro: b.totalNotasBairro,
      }))
      .filter((b) => b.volume > 0)
      .sort(
        (a, b) =>
          b.volume - a.volume || a.bairro.localeCompare(b.bairro, "pt-BR"),
      );

    let acumulado = 0;
    return ordenado.map((item) => {
      acumulado += item.volume;
      return {
        bairro: item.bairro,
        cidade: item.cidade,
        volume: item.volume,
        totalNotasBairro: item.totalNotasBairro,
        acumulado,
        pctAcumulada:
          totalBase > 0
            ? Math.round((acumulado / totalBase) * 1000) / 10
            : 0,
      };
    });
  }, [
    rankingBairros,
    paretoView,
    totalProdutivasGeral,
    totalImprodutivasGeral,
  ]);

  const bairrosFiltrados = useMemo(() => {
    const termo = buscaBairro.trim().toLowerCase();
    if (!termo) return rankingBairros;
    return rankingBairros.filter((b) =>
      b.bairro.toLowerCase().includes(termo),
    );
  }, [rankingBairros, buscaBairro]);

  const filtrosLimpos = ano === null && mes === null;

  const periodoDescricao = useMemo(() => {
    const base =
      filtrosLimpos
        ? "Histórico completo TOA"
        : ano !== null && mes !== null
          ? `${mesLabel(mes)} de ${ano}`
          : ano !== null
            ? `Ano ${ano} · todos os meses`
            : "Período filtrado";
    const cidadePart =
      cidadeSelecionada === CIDADE_TODAS
        ? "Todas as cidades"
        : cidadeSelecionada;
    const tecnicoPart =
      tecnicoSelecionado === TECNICO_TODOS
        ? "Todos os técnicos"
        : tecnicoSelecionado;
    return `${base} · ${cidadePart} · ${tecnicoPart}`;
  }, [filtrosLimpos, ano, mes, cidadeSelecionada, tecnicoSelecionado]);

  const limparFiltros = () => {
    setAno(null);
    setMes(null);
    setCidadeSelecionada(CIDADE_TODAS);
    setTecnicoSelecionado(TECNICO_TODOS);
    setBuscaTecnicoFiltro("");
    setDropdownTecnicoAberto(false);
  };

  const dadosModalBairro = useMemo(() => {
    if (!bairroDetalhe) return [];
    let base = rowsModal;
    if (cidadeSelecionada !== CIDADE_TODAS) {
      base = base.filter(
        (row) => normalizarCidade(row.cidade) === cidadeSelecionada,
      );
    }
    if (tecnicoSelecionado !== TECNICO_TODOS) {
      base = base.filter(
        (row) => nomeTecnicoDaLinha(row) === tecnicoSelecionado,
      );
    }
    return agregarDetalheTecnicosPorBairro(
      base,
      bairroDetalhe,
      dicionarioBaixa,
    );
  }, [
    bairroDetalhe,
    rowsModal,
    cidadeSelecionada,
    tecnicoSelecionado,
    dicionarioBaixa,
  ]);

  const dadosModalBairroFiltrados = useMemo(() => {
    const termo = buscaTecnicoModal.trim().toLowerCase();
    if (!termo) return dadosModalBairro;
    return dadosModalBairro.filter((t) =>
      t.nome.toLowerCase().includes(termo),
    );
  }, [dadosModalBairro, buscaTecnicoModal]);

  const dadosOrdenados = useMemo(() => {
    if (!sortConfig) return dadosModalBairroFiltrados;
    const { key, direction } = sortConfig;
    return [...dadosModalBairroFiltrados].sort((a, b) => {
      const diff = a[key] - b[key];
      if (diff !== 0) return direction === "asc" ? diff : -diff;

      // Desempate em Aproveitamento: maior volume de produtivas no topo (em desc)
      if (key === "aproveitamento") {
        const empateProd =
          direction === "asc"
            ? a.produtivas - b.produtivas
            : b.produtivas - a.produtivas;
        if (empateProd !== 0) return empateProd;
      }

      return a.nome.localeCompare(b.nome, "pt-BR");
    });
  }, [dadosModalBairroFiltrados, sortConfig]);

  const handleSort = (key: ModalSortKey) => {
    setSortConfig((prev) => {
      if (prev?.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "desc" };
    });
  };

  const cidadeModalBairro = useMemo(() => {
    if (!bairroDetalhe) return "";
    if (cidadeSelecionada !== CIDADE_TODAS) return cidadeSelecionada;

    const counts = new Map<string, number>();
    for (const row of rowsModal) {
      if (normalizarBairro(row.bairro) !== bairroDetalhe) continue;
      const cidade = normalizarCidade(row.cidade);
      if (!cidade) continue;
      counts.set(cidade, (counts.get(cidade) ?? 0) + 1);
    }
    const ordenado = [...counts.entries()].sort(
      (a, b) =>
        b[1] - a[1] || a[0].localeCompare(b[0], "pt-BR"),
    );
    return ordenado[0]?.[0] ?? "";
  }, [bairroDetalhe, cidadeSelecionada, rowsModal]);

  const dadosOSPorTecnico = useMemo(() => {
    if (!tecnicoDetalheModal || !bairroDetalhe) return [];
    const bairroNorm = normalizarBairro(bairroDetalhe);
    const filtradas = rowsTecnicoModal.filter((row) => {
      if (normalizarBairro(row.bairro) !== bairroNorm) return false;
      if (nomeTecnicoDaLinha(row) !== tecnicoDetalheModal) return false;
      if (
        cidadeModalBairro &&
        normalizarCidade(row.cidade) !== cidadeModalBairro
      ) {
        return false;
      }
      return true;
    });
    return agregarTiposOsPorTecnico(filtradas);
  }, [
    tecnicoDetalheModal,
    bairroDetalhe,
    rowsTecnicoModal,
    cidadeModalBairro,
  ]);

  const dadosOSPorTecnicoOrdenados = useMemo(() => {
    if (!sortConfigTecnico) return dadosOSPorTecnico;
    const { key, direction } = sortConfigTecnico;
    return [...dadosOSPorTecnico].sort((a, b) => {
      const diff = a[key] - b[key];
      if (diff !== 0) return direction === "asc" ? diff : -diff;
      if (key === "aproveitamento") {
        const empateProd =
          direction === "asc"
            ? a.produtivas - b.produtivas
            : b.produtivas - a.produtivas;
        if (empateProd !== 0) return empateProd;
      }
      return a.tipoOs.localeCompare(b.tipoOs, "pt-BR");
    });
  }, [dadosOSPorTecnico, sortConfigTecnico]);

  const handleSortTecnico = (key: ModalSortKey) => {
    setSortConfigTecnico((prev) => {
      if (prev?.key === key) {
        return {
          key,
          direction: prev.direction === "asc" ? "desc" : "asc",
        };
      }
      return { key, direction: "desc" };
    });
  };

  const tituloModalBairro = useMemo(() => {
    if (!bairroDetalhe) return "";
    return cidadeModalBairro
      ? `${cidadeModalBairro} - ${bairroDetalhe}`
      : bairroDetalhe;
  }, [bairroDetalhe, cidadeModalBairro]);

  const tituloModalTecnico = useMemo(() => {
    if (!tecnicoDetalheModal || !bairroDetalhe) return "";
    const cidade = cidadeModalBairro || "—";
    return `Detalhamento - ${tecnicoDetalheModal} - ${cidade} - ${bairroDetalhe}`;
  }, [tecnicoDetalheModal, bairroDetalhe, cidadeModalBairro]);

  useEffect(() => {
    if (!bairroDetalhe) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (tecnicoDetalheModal) {
        setTecnicoDetalheModal(null);
        return;
      }
      setBairroDetalhe(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bairroDetalhe, tecnicoDetalheModal]);

  const fecharModalBairro = () => {
    setTecnicoDetalheModal(null);
    setBairroDetalhe(null);
  };

  const abrirDetalheBairro = (payload: unknown) => {
    const data = payload as {
      bairro?: string;
      payload?: { bairro?: string };
      activePayload?: Array<{ payload?: { bairro?: string } }>;
    };
    const bairro =
      data?.payload?.bairro ??
      data?.bairro ??
      data?.activePayload?.[0]?.payload?.bairro;
    if (typeof bairro === "string" && bairro.trim()) {
      setAnoModal(ano);
      setMesModal(mes);
      setBuscaTecnicoModal("");
      setTecnicoDetalheModal(null);
      setBairroDetalhe(bairro);
    }
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex flex-row flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Filtro de período
            </span>
            {filtrosLimpos && (
              <Badge variant="secondary" className="text-xs">
                Histórico geral
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="detalhe-notas-ano"
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
              <SelectTrigger id="detalhe-notas-ano" className="w-[140px]">
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
              htmlFor="detalhe-notas-mes"
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
              <SelectTrigger id="detalhe-notas-mes" className="w-[160px]">
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
              htmlFor="detalhe-notas-cidade"
              className="shrink-0 text-sm font-medium"
            >
              Cidade:
            </Label>
            <Select
              value={cidadeSelecionada}
              onValueChange={setCidadeSelecionada}
            >
              <SelectTrigger id="detalhe-notas-cidade" className="w-[200px]">
                <SelectValue placeholder={CIDADE_TODAS} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={CIDADE_TODAS}>{CIDADE_TODAS}</SelectItem>
                {cidadesDisponiveis.map((cidade) => (
                  <SelectItem key={cidade} value={cidade}>
                    {cidade}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="relative flex items-center gap-2" ref={dropdownTecnicoRef}>
            <Label
              htmlFor="detalhe-notas-tecnico"
              className="shrink-0 text-sm font-medium"
            >
              Técnico:
            </Label>
            <div className="relative w-[220px]">
              <button
                id="detalhe-notas-tecnico"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={dropdownTecnicoAberto}
                onClick={() =>
                  setDropdownTecnicoAberto((aberto) => !aberto)
                }
                className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none hover:bg-accent/40 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50"
              >
                <span className="truncate text-left">
                  {tecnicoSelecionado}
                </span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${
                    dropdownTecnicoAberto ? "rotate-180" : ""
                  }`}
                />
              </button>

              {dropdownTecnicoAberto ? (
                <div className="absolute left-0 top-full z-20 mt-1 w-full min-w-[16rem] overflow-hidden rounded-md border border-gray-200 bg-white shadow-lg">
                  <div className="sticky top-0 z-10 border-b border-gray-100 bg-white p-2">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
                      <input
                        type="text"
                        value={buscaTecnicoFiltro}
                        onChange={(e) => setBuscaTecnicoFiltro(e.target.value)}
                        placeholder="Buscar técnico..."
                        aria-label="Buscar técnico no filtro"
                        autoFocus
                        className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-2 text-sm outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                      />
                    </div>
                  </div>
                  <ul
                    role="listbox"
                    className="max-h-64 overflow-y-auto py-1"
                  >
                    <li>
                      <button
                        type="button"
                        role="option"
                        aria-selected={tecnicoSelecionado === TECNICO_TODOS}
                        onClick={() => {
                          setTecnicoSelecionado(TECNICO_TODOS);
                          setBuscaTecnicoFiltro("");
                          setDropdownTecnicoAberto(false);
                        }}
                        className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                          tecnicoSelecionado === TECNICO_TODOS
                            ? "bg-gray-100 font-semibold text-foreground"
                            : "text-foreground"
                        }`}
                      >
                        {TECNICO_TODOS}
                      </button>
                    </li>
                    {tecnicosFiltrados.length === 0 ? (
                      <li className="px-3 py-2 text-sm text-muted-foreground">
                        Nenhum técnico encontrado.
                      </li>
                    ) : (
                      tecnicosFiltrados.map((nome) => (
                        <li key={nome}>
                          <button
                            type="button"
                            role="option"
                            aria-selected={tecnicoSelecionado === nome}
                            title={nome}
                            onClick={() => {
                              setTecnicoSelecionado(nome);
                              setBuscaTecnicoFiltro("");
                              setDropdownTecnicoAberto(false);
                            }}
                            className={`flex w-full px-3 py-1.5 text-left text-sm hover:bg-gray-50 ${
                              tecnicoSelecionado === nome
                                ? "bg-gray-100 font-semibold text-foreground"
                                : "text-foreground"
                            }`}
                          >
                            <span className="truncate">{nome}</span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </div>
              ) : null}
            </div>
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ThumbsUp className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Bairro + Produtivo
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {topProdutivo && topProdutivo.produtivas > 0
                  ? topProdutivo.bairro
                  : "—"}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-green-700 sm:text-3xl">
                {topProdutivo && topProdutivo.produtivas > 0
                  ? formatCardShare(
                      topProdutivo.produtivas,
                      topProdutivo.totalNotasBairro,
                    )
                  : formatCardShare(0, 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas produtivas · taxa de sucesso local
              </p>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <ThumbsDown className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Bairro + Improdutivo
                </span>
              </div>
              <div className="mt-3 text-lg font-bold text-gray-900">
                {topImprodutivo && topImprodutivo.improdutivas > 0
                  ? topImprodutivo.bairro
                  : "—"}
              </div>
              <div className="mt-1 text-2xl font-bold tabular-nums text-red-600 sm:text-3xl">
                {topImprodutivo && topImprodutivo.improdutivas > 0
                  ? formatCardShare(
                      topImprodutivo.improdutivas,
                      topImprodutivo.totalNotasBairro,
                    )
                  : formatCardShare(0, 0)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                notas improdutivas · taxa de quebra local
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <ThumbsUp className="h-4 w-4 text-green-600" />
                Top 10 Bairros Produtivos
              </h2>
              {chartProdutivas.length === 0 ? (
                <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota produtiva no período.
                </p>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartProdutivas}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="bairro"
                        width={110}
                        tick={{ fontSize: 11 }}
                        reversed={false}
                      />
                      <Tooltip
                        content={<BairroChartTooltip />}
                        cursor={{ fill: "#f3f4f6" }}
                      />
                      <Bar
                        dataKey="volume"
                        fill="#16a34a"
                        radius={[0, 3, 3, 0]}
                        maxBarSize={22}
                        cursor="pointer"
                        onClick={abrirDetalheBairro}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
                <ThumbsDown className="h-4 w-4 text-red-600" />
                Top 10 Bairros Quebras
              </h2>
              {chartImprodutivas.length === 0 ? (
                <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                  Nenhuma nota improdutiva no período.
                </p>
              ) : (
                <div className="h-80 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartImprodutivas}
                      layout="vertical"
                      margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                      <XAxis
                        type="number"
                        allowDecimals={false}
                        tick={{ fontSize: 11 }}
                      />
                      <YAxis
                        type="category"
                        dataKey="bairro"
                        width={110}
                        tick={{ fontSize: 11 }}
                        reversed={false}
                      />
                      <Tooltip
                        content={<BairroChartTooltip />}
                        cursor={{ fill: "#f3f4f6" }}
                      />
                      <Bar
                        dataKey="volume"
                        fill="#ef4444"
                        radius={[0, 3, 3, 0]}
                        maxBarSize={22}
                        cursor="pointer"
                        onClick={abrirDetalheBairro}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>
          </div>

          <div className="w-full rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-foreground">
                <MapPin className="h-4 w-4 text-amber-600" />
                Análise de Pareto — Bairros
              </h2>
              <div className="flex items-center gap-2">
                <Label
                  htmlFor="pareto-view"
                  className="shrink-0 text-sm font-medium text-muted-foreground"
                >
                  Visão:
                </Label>
                <Select
                  value={paretoView}
                  onValueChange={(v) =>
                    setParetoView(v as ParetoView)
                  }
                >
                  <SelectTrigger id="pareto-view" className="w-[160px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Produtivas">Produtivas</SelectItem>
                    <SelectItem value="Improdutivas">Improdutivas</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            {paretoData.length === 0 ? (
              <p className="flex h-72 items-center justify-center text-sm text-muted-foreground">
                Sem dados para montar o Pareto neste período.
              </p>
            ) : (
              <div className="h-[28rem] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart
                    data={paretoData}
                    margin={{ top: 8, right: 24, left: 8, bottom: 64 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis
                      dataKey="bairro"
                      interval={0}
                      angle={-35}
                      textAnchor="end"
                      height={70}
                      tick={{ fontSize: 10 }}
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
                      tickFormatter={(v) => `${v}%`}
                      tick={{ fontSize: 11 }}
                    />
                    <Tooltip
                      content={<ParetoTooltip paretoView={paretoView} />}
                    />
                    <Bar
                      yAxisId="left"
                      dataKey="volume"
                      name={paretoView}
                      fill={
                        paretoView === "Produtivas" ? "#16a34a" : "#ef4444"
                      }
                      radius={[3, 3, 0, 0]}
                      maxBarSize={36}
                    />
                    <Line
                      yAxisId="right"
                      type="monotone"
                      dataKey="pctAcumulada"
                      name="% acumulada"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: "#f59e0b" }}
                      activeDot={{ r: 5 }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-muted-foreground">
              Barras = volume absoluto · Linha âmbar = % acumulada (0–100%).
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 font-bold text-foreground">
                <MapPin className="h-4 w-4 text-green-600" />
                Todos os bairros
              </h2>
              <div className="relative w-full max-w-xs sm:ml-auto">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  type="search"
                  value={buscaBairro}
                  onChange={(e) => setBuscaBairro(e.target.value)}
                  placeholder="Buscar bairro..."
                  aria-label="Buscar bairro"
                  className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                />
              </div>
            </div>
            {porBairro.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum bairro no período selecionado.
              </p>
            ) : bairrosFiltrados.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum bairro encontrado para “{buscaBairro.trim()}”.
              </p>
            ) : (
              <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full min-w-[36rem] text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="bg-white px-2 py-2 font-semibold">Bairro</th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Produtivas
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        % Produt.
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Improdutivas
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        % Improd.
                      </th>
                      <th className="bg-white px-2 py-2 text-right font-semibold">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {bairrosFiltrados.map((row) => (
                      <tr
                        key={row.bairro}
                        className="border-b border-border/60 last:border-b-0"
                      >
                        <td className="px-2 py-2 font-medium text-gray-900">
                          {row.bairro}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-green-700">
                          {formatQuantidade(row.produtivas)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-green-700">
                          {formatPct(row.produtivas, row.totalNotasBairro)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-red-600">
                          {formatQuantidade(row.improdutivas)}
                        </td>
                        <td className="px-2 py-2 text-right tabular-nums text-red-600">
                          {formatPct(row.improdutivas, row.totalNotasBairro)}
                        </td>
                        <td className="px-2 py-2 text-right font-semibold tabular-nums text-gray-900">
                          {formatQuantidade(row.totalNotasBairro)}
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

      {bairroDetalhe ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-bairro-titulo"
          onClick={fecharModalBairro}
        >
          <div
            className="flex max-h-[90vh] w-[90vw] max-w-6xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2
                  id="modal-bairro-titulo"
                  className="text-lg font-bold text-foreground"
                >
                  {tituloModalBairro}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Detalhamento por técnico · clique fora ou Esc para fechar
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
                      className="w-full rounded-md border border-gray-300 py-1.5 pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground outline-none focus:border-green-500 focus:ring-2 focus:ring-green-500/30"
                    />
                  </div>

                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="modal-bairro-ano"
                      className="shrink-0 text-sm font-medium"
                    >
                      Ano:
                    </Label>
                    <Select
                      value={anoModal !== null ? String(anoModal) : "todos"}
                      disabled={anosDisponiveis.length === 0}
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setAnoModal(null);
                          setMesModal(null);
                          return;
                        }
                        const novoAno = Number(v);
                        const mesesDoAno = competencias
                          .filter((ym) => Math.floor(ym / 100) === novoAno)
                          .map((ym) => ym % 100)
                          .sort((a, b) => a - b);
                        setAnoModal(novoAno);
                        setMesModal(mesesDoAno[mesesDoAno.length - 1] ?? null);
                      }}
                    >
                      <SelectTrigger id="modal-bairro-ano" className="w-[120px]">
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
                      htmlFor="modal-bairro-mes"
                      className="shrink-0 text-sm font-medium"
                    >
                      Mês:
                    </Label>
                    <Select
                      value={mesModal !== null ? String(mesModal) : "todos"}
                      disabled={
                        anoModal === null || mesesDisponiveisModal.length === 0
                      }
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setMesModal(null);
                          return;
                        }
                        setMesModal(Number(v));
                      }}
                    >
                      <SelectTrigger id="modal-bairro-mes" className="w-[140px]">
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

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    onClick={() => {
                      setBuscaTecnicoModal("");
                      setAnoModal(null);
                      setMesModal(null);
                    }}
                  >
                    <FilterX className="h-4 w-4" />
                    Limpar Filtros
                  </Button>
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Fechar"
                onClick={fecharModalBairro}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
              {loadingModal ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Carregando técnicos do bairro...
                </p>
              ) : dadosModalBairro.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum técnico encontrado para este bairro no filtro atual.
                </p>
              ) : dadosModalBairroFiltrados.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum técnico encontrado para “{buscaTecnicoModal.trim()}”.
                </p>
              ) : (
                <div className="relative max-h-[min(70vh,32rem)] overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[64rem] text-sm">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="bg-white px-2 py-2 font-semibold">
                          Nome (Técnico)
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSort("produtivas")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Produtivas
                            {sortConfig?.key === "produtivas" ? (
                              sortConfig.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSort("improdutivas")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Improdutivas
                            {sortConfig?.key === "improdutivas" ? (
                              sortConfig.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSort("aproveitamento")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Aproveitamento
                            {sortConfig?.key === "aproveitamento" ? (
                              sortConfig.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                        <th className="bg-white px-2 py-2 font-semibold">
                          Top 3 Tipo O.S Prod.
                        </th>
                        <th className="bg-white px-2 py-2 font-semibold">
                          Top 3 Tipo O.S Improd.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosOrdenados.map((tec) => (
                        <tr
                          key={tec.nome}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-2 py-2 font-medium text-gray-900">
                            <button
                              type="button"
                              onClick={() => setTecnicoDetalheModal(tec.nome)}
                              className="cursor-pointer text-left hover:text-blue-600 hover:underline"
                            >
                              {tec.nome}
                            </button>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-green-700">
                            {formatQuantidade(tec.produtivas)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-red-600">
                            {formatQuantidade(tec.improdutivas)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold ${
                              tec.aproveitamento >= 70
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatAproveitamento(tec.aproveitamento)}
                          </td>
                          <td className="min-w-[14rem] max-w-[20rem] px-2 py-2 text-xs text-gray-700">
                            <Top3TipoLista items={tec.top3TipoOsProd} />
                          </td>
                          <td className="min-w-[14rem] max-w-[20rem] px-2 py-2 text-xs text-gray-700">
                            <Top3TipoLista items={tec.top3TipoOsImprod} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {tecnicoDetalheModal && bairroDetalhe ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-tecnico-titulo"
          onClick={() => setTecnicoDetalheModal(null)}
        >
          <div
            className="flex max-h-[90vh] w-[90vw] max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
              <div className="min-w-0 flex-1">
                <h2
                  id="modal-tecnico-titulo"
                  className="text-lg font-bold text-foreground"
                >
                  {tituloModalTecnico}
                </h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Tipos de O.S. do técnico · Esc ou Voltar retorna ao bairro
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-2 sm:gap-4">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor="modal-tecnico-ano"
                      className="shrink-0 text-sm font-medium"
                    >
                      Ano:
                    </Label>
                    <Select
                      value={
                        anoTecnicoModal !== null
                          ? String(anoTecnicoModal)
                          : "todos"
                      }
                      disabled={anosDisponiveis.length === 0}
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setAnoTecnicoModal(null);
                          setMesTecnicoModal(null);
                          return;
                        }
                        const novoAno = Number(v);
                        const mesesDoAno = competencias
                          .filter((ym) => Math.floor(ym / 100) === novoAno)
                          .map((ym) => ym % 100)
                          .sort((a, b) => a - b);
                        setAnoTecnicoModal(novoAno);
                        setMesTecnicoModal(
                          mesesDoAno[mesesDoAno.length - 1] ?? null,
                        );
                      }}
                    >
                      <SelectTrigger
                        id="modal-tecnico-ano"
                        className="w-[120px]"
                      >
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
                      htmlFor="modal-tecnico-mes"
                      className="shrink-0 text-sm font-medium"
                    >
                      Mês:
                    </Label>
                    <Select
                      value={
                        mesTecnicoModal !== null
                          ? String(mesTecnicoModal)
                          : "todos"
                      }
                      disabled={
                        anoTecnicoModal === null ||
                        mesesDisponiveisTecnicoModal.length === 0
                      }
                      onValueChange={(v) => {
                        if (v === "todos") {
                          setMesTecnicoModal(null);
                          return;
                        }
                        setMesTecnicoModal(Number(v));
                      }}
                    >
                      <SelectTrigger
                        id="modal-tecnico-mes"
                        className="w-[140px]"
                      >
                        <SelectValue placeholder="Todos" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="todos">Todos</SelectItem>
                        {mesesDisponiveisTecnicoModal.map((m) => (
                          <SelectItem key={m} value={String(m)}>
                            {mesLabel(m)}
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
                    onClick={() => {
                      setAnoTecnicoModal(null);
                      setMesTecnicoModal(null);
                    }}
                  >
                    <FilterX className="h-4 w-4" />
                    Limpar Filtros
                  </Button>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setTecnicoDetalheModal(null)}
                >
                  Voltar
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Fechar detalhe do técnico"
                  onClick={() => setTecnicoDetalheModal(null)}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 overflow-hidden px-5 py-4">
              {loadingTecnicoModal ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Carregando tipos de O.S....
                </p>
              ) : dadosOSPorTecnico.length === 0 ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Nenhum tipo de O.S. encontrado para este técnico no filtro
                  atual.
                </p>
              ) : (
                <div className="relative max-h-[min(70vh,32rem)] overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead className="sticky top-0 z-10 bg-white shadow-sm">
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="bg-white px-2 py-2 font-semibold">
                          Tipo de OS
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSortTecnico("produtivas")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Qnt. Produtivas
                            {sortConfigTecnico?.key === "produtivas" ? (
                              sortConfigTecnico.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSortTecnico("improdutivas")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Qnt. Improdutivas
                            {sortConfigTecnico?.key === "improdutivas" ? (
                              sortConfigTecnico.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                        <th className="bg-white px-2 py-2 text-right font-semibold">
                          <button
                            type="button"
                            onClick={() => handleSortTecnico("aproveitamento")}
                            className="inline-flex w-full items-center justify-end gap-1 rounded px-1 py-0.5 hover:bg-gray-50"
                          >
                            Aproveitamento
                            {sortConfigTecnico?.key === "aproveitamento" ? (
                              sortConfigTecnico.direction === "asc" ? (
                                <ChevronUp className="h-3.5 w-3.5 shrink-0" />
                              ) : (
                                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                              )
                            ) : null}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {dadosOSPorTecnicoOrdenados.map((row) => (
                        <tr
                          key={row.tipoOs}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td
                            className="max-w-[28rem] px-2 py-2 font-medium text-gray-900"
                            title={row.tipoOs}
                          >
                            <span className="block truncate">{row.tipoOs}</span>
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-green-700">
                            {formatQuantidade(row.produtivas)}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums text-red-600">
                            {formatQuantidade(row.improdutivas)}
                          </td>
                          <td
                            className={`px-2 py-2 text-right tabular-nums font-semibold ${
                              row.aproveitamento >= 70
                                ? "text-green-600"
                                : "text-red-600"
                            }`}
                          >
                            {formatAproveitamento(row.aproveitamento)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
