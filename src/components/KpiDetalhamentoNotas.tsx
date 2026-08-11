import { useEffect, useMemo, useState } from "react";
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
import { getSupabaseClient } from "@/lib/supabase";
import { normalizeNumeroWo } from "@/lib/toa-store";

const DESCRICAO_BAIXA_DESCONHECIDA = "Motivo Desconhecido";
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

type ModalSortKey = "produtivas" | "improdutivas" | "aproveitamento";
type ModalSortConfig = { key: ModalSortKey; direction: "asc" | "desc" };

export type TecnicoRankingItem = {
  nome: string;
  valor: number;
};

export type BairroVolumeAgg = {
  bairro: string;
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

function normalizeCodigoBaixa(
  value: string | number | null | undefined,
): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw);
  if (Number.isFinite(n) && n > 0) return String(n);
  return raw;
}

function descricaoDoCodigoBaixa(
  codigo: string,
  dicionario: Record<string, string>,
): string {
  return (
    dicionario[codigo] ||
    dicionario[codigo.padStart(3, "0")] ||
    DESCRICAO_BAIXA_DESCONHECIDA
  );
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
): string[] {
  return Object.entries(rec)
    .map(([label, qtd]) => ({ label, qtd }))
    .sort(
      (a, b) =>
        b.qtd - a.qtd || a.label.localeCompare(b.label, "pt-BR"),
    )
    .slice(0, n)
    .map((item) => {
      const pct =
        totalBase > 0 ? (item.qtd / totalBase) * 100 : 0;
      return `${item.label} (${pct.toFixed(1)}%)`;
    });
}

async function fetchDicionarioCodigosBaixa(): Promise<Record<string, string>> {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase
    .from("dicionario_codigos_baixa")
    .select("codigo, descricao");
  if (error) throw error;

  const map: Record<string, string> = {};
  for (const row of data ?? []) {
    const codigo = normalizeCodigoBaixa(row.codigo);
    const descricao = String(row.descricao ?? "").trim();
    if (!codigo || !descricao) continue;
    map[codigo] = descricao;
  }
  return map;
}

export type TecnicoDetalheBairro = {
  nome: string;
  produtivas: number;
  improdutivas: number;
  /** Percentual 0–100: produtivas / (produtivas + improdutivas). */
  aproveitamento: number;
  top3TipoOsProd: string[];
  top3TipoOsImprod: string[];
};

/**
 * Detalhe do bairro agrupado por técnico (WO única para volume;
 * Top 3 Tipo O.S. a partir das linhas de O.S.).
 */
export function agregarDetalheTecnicosPorBairro(
  rows: ToaImportacaoRow[],
  bairroAlvo: string,
  dicionario: Record<string, string> = {},
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

  return (
    <div className="rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">{String(label ?? "")}</p>
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
      statusNota: "Produtiva" | "Improdutiva";
      nomeTecnico: string;
    }
  >();

  for (const row of rows) {
    const numeroWo = normalizeNumeroWo(row.numero_wo);
    if (!numeroWo) continue;

    const bairro = normalizarBairro(row.bairro);
    const statusNota: "Produtiva" | "Improdutiva" =
      row.status_nota === "Produtiva" ? "Produtiva" : "Improdutiva";
    const nomeTecnico = nomeTecnicoDaLinha(row);

    const prev = byWo.get(numeroWo);
    if (!prev) {
      byWo.set(numeroWo, { bairro, statusNota, nomeTecnico });
      continue;
    }

    if (statusNota === "Produtiva") prev.statusNota = "Produtiva";
    if (
      prev.bairro === BAIRRO_NAO_INFORMADO &&
      bairro !== BAIRRO_NAO_INFORMADO
    ) {
      prev.bairro = bairro;
    }
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
    }
  >();

  for (const { bairro, statusNota, nomeTecnico } of byWo.values()) {
    const bucket = byBairro.get(bairro) ?? {
      produtivas: 0,
      improdutivas: 0,
      tecnicosProdutivos: {},
      tecnicosImprodutivos: {},
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
    byBairro.set(bairro, bucket);
  }

  return Array.from(byBairro.entries())
    .map(([bairro, counts]) => {
      const totalNotasBairro = counts.produtivas + counts.improdutivas;
      return {
        bairro,
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
  const [bairroDetalhe, setBairroDetalhe] = useState<string | null>(null);
  const [buscaTecnicoModal, setBuscaTecnicoModal] = useState("");
  const [anoModal, setAnoModal] = useState<number | null>(null);
  const [mesModal, setMesModal] = useState<number | null>(null);
  const [rowsModal, setRowsModal] = useState<ToaImportacaoRow[]>([]);
  const [loadingModal, setLoadingModal] = useState(false);
  const [sortConfig, setSortConfig] = useState<ModalSortConfig | null>(null);
  const [dicionarioBaixa, setDicionarioBaixa] = useState<
    Record<string, string>
  >({});

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

  const rowsFiltrados = useMemo(() => {
    if (cidadeSelecionada === CIDADE_TODAS) return rows;
    return rows.filter(
      (row) => normalizarCidade(row.cidade) === cidadeSelecionada,
    );
  }, [rows, cidadeSelecionada]);

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

  useEffect(() => {
    if (bairroDetalhe == null) return;
    setAnoModal(ano);
    setMesModal(mes);
    setBuscaTecnicoModal("");
    setSortConfig(null);
    // Sincroniza apenas na abertura/troca do bairro (não quando o filtro global muda com o modal aberto).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- herdar ano/mes no momento da abertura
  }, [bairroDetalhe]);

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
    return cidadeSelecionada === CIDADE_TODAS
      ? `${base} · Todas as cidades`
      : `${base} · ${cidadeSelecionada}`;
  }, [filtrosLimpos, ano, mes, cidadeSelecionada]);

  const limparFiltros = () => {
    setAno(null);
    setMes(null);
    setCidadeSelecionada(CIDADE_TODAS);
  };

  const dadosModalBairro = useMemo(() => {
    if (!bairroDetalhe) return [];
    let base = rowsModal;
    if (cidadeSelecionada !== CIDADE_TODAS) {
      base = base.filter(
        (row) => normalizarCidade(row.cidade) === cidadeSelecionada,
      );
    }
    return agregarDetalheTecnicosPorBairro(
      base,
      bairroDetalhe,
      dicionarioBaixa,
    );
  }, [bairroDetalhe, rowsModal, cidadeSelecionada, dicionarioBaixa]);

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

  const tituloModalBairro = useMemo(() => {
    if (!bairroDetalhe) return "";
    return cidadeModalBairro
      ? `${cidadeModalBairro} - ${bairroDetalhe}`
      : bairroDetalhe;
  }, [bairroDetalhe, cidadeModalBairro]);

  useEffect(() => {
    if (!bairroDetalhe) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBairroDetalhe(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [bairroDetalhe]);

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
          onClick={() => setBairroDetalhe(null)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-xl"
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
                <div className="mt-3 flex flex-wrap items-center gap-3">
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
                </div>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                aria-label="Fechar"
                onClick={() => setBairroDetalhe(null)}
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
                  <table className="w-full min-w-[58rem] text-sm">
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
                            {tec.nome}
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
                          <td className="max-w-[14rem] px-2 py-2 text-xs text-gray-700">
                            {tec.top3TipoOsProd.length > 0 ? (
                              <ul className="space-y-0.5">
                                {tec.top3TipoOsProd.map((item) => (
                                  <li
                                    key={item}
                                    className="truncate"
                                    title={item}
                                  >
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </td>
                          <td className="max-w-[16rem] px-2 py-2 text-xs text-gray-700">
                            {tec.top3TipoOsImprod.length > 0 ? (
                              <ul className="space-y-0.5">
                                {tec.top3TipoOsImprod.map((item) => (
                                  <li
                                    key={item}
                                    className="truncate"
                                    title={item}
                                  >
                                    {item}
                                  </li>
                                ))}
                              </ul>
                            ) : (
                              <span className="text-muted-foreground">—</span>
                            )}
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
