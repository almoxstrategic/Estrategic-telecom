import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FilterX,
  PieChart,
  X,
  XCircle,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
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
  statusContratoDoCodigo,
  type DicionarioCodigosBaixaMap,
} from "@/lib/dicionario-codigos-baixa";

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

const DESCRICAO_DESCONHECIDA = "Motivo Desconhecido";
const MOTIVO_MACRO_NAO_CLASSIFICADO = "Não classificado";

export type StatusContratoFiltro = "IMPRODUTIVO" | "PRODUTIVO";

export type MotivoQuebraAgg = {
  codigo: string;
  descricao: string;
  motivoQuebra: string;
  quantidade: number;
  labelCompleta: string;
};

export type MotivoQuebraMacroAgg = {
  motivo: string;
  quantidade: number;
};

type TecnicoQuebraAgg = {
  nome: string;
  quantidade: number;
};

type ChartMotivoPoint = {
  codigo: string;
  descricao: string;
  motivoQuebra: string;
  labelCompleta: string;
  quantidade: number;
};

type MotivoChartTooltipProps = {
  active?: boolean;
  label?: string | number;
  corQuantidade?: string;
  payload?: Array<{
    value?: number | string;
    payload?: ChartMotivoPoint;
  }>;
};

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatQuantidade(n: number): string {
  return n.toLocaleString("pt-BR");
}

function motivoMacroDoCodigo(
  codigo: string,
  dicionario: DicionarioCodigosBaixaMap | Record<string, string>,
): string {
  if (!codigo) return MOTIVO_MACRO_NAO_CLASSIFICADO;
  const entry = dicionario[codigo] ?? dicionario[codigo.padStart(3, "0")];
  if (!entry || typeof entry === "string") return MOTIVO_MACRO_NAO_CLASSIFICADO;
  return entry.motivo_quebra?.trim() || MOTIVO_MACRO_NAO_CLASSIFICADO;
}

function matchStatusContrato(
  codigo: string,
  dicionario: DicionarioCodigosBaixaMap,
  statusNota: StatusContratoFiltro,
): boolean {
  const status = statusContratoDoCodigo(codigo, dicionario);
  return status === statusNota;
}

/**
 * Volumetria de códigos de baixa filtrados por status_contrato do dicionário
 * (PRODUTIVO / IMPRODUTIVO).
 */
export function agregarMotivosQuebra(
  rows: ToaImportacaoRow[],
  dicionario: DicionarioCodigosBaixaMap = {},
  statusNota: StatusContratoFiltro = "IMPRODUTIVO",
): MotivoQuebraAgg[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const codigo = normalizeCodigoBaixa(row.cod_baixa);
    if (!codigo) continue;
    if (!matchStatusContrato(codigo, dicionario, statusNota)) continue;
    counts.set(codigo, (counts.get(codigo) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([codigo, quantidade]) => {
      const descricao = descricaoDoCodigoBaixa(codigo, dicionario);
      const motivoQuebra = motivoMacroDoCodigo(codigo, dicionario);
      return {
        codigo,
        descricao,
        motivoQuebra,
        quantidade,
        labelCompleta: `${codigo} - ${descricao}`,
      };
    })
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        Number(a.codigo) - Number(b.codigo) ||
        a.codigo.localeCompare(b.codigo, "pt-BR"),
    );
}

/** Agrupa O.S. pela categoria macro (COMERCIAL / TÉCNICO / PRODUTIVO). */
export function agregarMotivosQuebraMacro(
  rows: ToaImportacaoRow[],
  dicionario: DicionarioCodigosBaixaMap = {},
  statusNota: StatusContratoFiltro = "IMPRODUTIVO",
): MotivoQuebraMacroAgg[] {
  const counts = new Map<string, number>();

  for (const row of rows) {
    const codigo = normalizeCodigoBaixa(row.cod_baixa);
    if (!codigo) continue;
    if (!matchStatusContrato(codigo, dicionario, statusNota)) continue;
    const motivo = motivoMacroDoCodigo(codigo, dicionario);
    counts.set(motivo, (counts.get(motivo) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([motivo, quantidade]) => ({ motivo, quantidade }))
    .sort(
      (a, b) =>
        b.quantidade - a.quantidade ||
        a.motivo.localeCompare(b.motivo, "pt-BR"),
    );
}

function MotivoChartTooltip({
  active,
  payload,
  label,
  corQuantidade = "text-red-600",
}: MotivoChartTooltipProps) {
  if (!active || !payload?.length) return null;
  const entry = payload[0]!;
  const data = entry.payload;
  const valor = Number(entry.value) || 0;
  const codigo = String(label ?? data?.codigo ?? "—");
  const descricao = data?.descricao || DESCRICAO_DESCONHECIDA;
  const tipo = data?.motivoQuebra || MOTIVO_MACRO_NAO_CLASSIFICADO;

  return (
    <div className="max-w-sm rounded-md border border-gray-200 bg-white p-3 shadow-md">
      <p className="text-sm font-bold text-gray-900">
        Cód. Baixa {codigo} - {descricao} - TIPO: {tipo}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        Quantidade:{" "}
        <span className={`font-semibold tabular-nums ${corQuantidade}`}>
          {formatQuantidade(valor)}
        </span>
      </p>
    </div>
  );
}

export function MotivosQuebra() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [dicionario, setDicionario] = useState<DicionarioCodigosBaixaMap>({});
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [statusNota, setStatusNota] =
    useState<StatusContratoFiltro>("IMPRODUTIVO");
  const [codigoDetalhe, setCodigoDetalhe] = useState<string | null>(null);

  const isImprodutivo = statusNota === "IMPRODUTIVO";
  const corTexto = isImprodutivo ? "text-red-600" : "text-green-600";
  const corBarra = isImprodutivo ? "#ef4444" : "#16a34a";
  const IconeStatus = isImprodutivo ? XCircle : CheckCircle2;
  const tituloCardTotal = isImprodutivo
    ? "Total de Quebras (O.S)"
    : "Total de Notas (O.S)";
  const subtituloCardTotal = isImprodutivo
    ? "O.S. improdutivas no período"
    : "O.S. produtivas no período";
  const tituloCardOfensor = isImprodutivo
    ? "Principal Ofensor"
    : "Principal Código";
  const tituloCardMacro = isImprodutivo
    ? "Motivo de quebra"
    : "Categoria da baixa";
  const subtituloCardMacro = isImprodutivo
    ? "categoria com maior índice de quebra"
    : "categoria com maior volume de baixas";
  const tituloTop10 = isImprodutivo
    ? "Top 10 Motivos de Quebra"
    : "Top 10 Códigos Produtivos";
  const emptyChartMsg = isImprodutivo
    ? "Nenhuma O.S. improdutiva no período."
    : "Nenhuma O.S. produtiva no período.";
  const emptyTableMsg = isImprodutivo
    ? "Nenhum código de baixa improdutivo no período selecionado."
    : "Nenhum código de baixa produtivo no período selecionado.";
  const tituloColunaTipo = isImprodutivo
    ? "Tipo de quebra"
    : "Categoria da baixa";
  const tituloColunaQtdTecnicos = isImprodutivo
    ? "Quantidade de Quebras"
    : "Quantidade de Baixas/Notas";

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [comps, dic] = await Promise.all([
          fetchCompetenciasToa(),
          fetchDicionarioCodigosBaixa().catch((err) => {
            console.error("Erro ao carregar dicionário de códigos de baixa:", err);
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
        console.error("Erro ao carregar motivos de quebra:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar os motivos de quebra TOA.",
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

  useEffect(() => {
    setCodigoDetalhe(null);
  }, [ano, mes, statusNota]);

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

  const porMotivo = useMemo(
    () => agregarMotivosQuebra(rows, dicionario, statusNota),
    [rows, dicionario, statusNota],
  );

  const totalQuebras = useMemo(
    () => porMotivo.reduce((acc, row) => acc + row.quantidade, 0),
    [porMotivo],
  );

  const principalOfensor = useMemo(() => {
    if (porMotivo.length === 0) return null;
    return porMotivo[0]!;
  }, [porMotivo]);

  const motivoMacroVencedor = useMemo(() => {
    const macros = agregarMotivosQuebraMacro(rows, dicionario, statusNota);
    if (macros.length === 0) return null;
    return macros[0]!;
  }, [rows, dicionario, statusNota]);

  const chartTop10 = useMemo(
    (): ChartMotivoPoint[] =>
      [...porMotivo]
        .sort((a, b) => b.quantidade - a.quantidade)
        .slice(0, 10)
        .map((m) => ({
          codigo: m.codigo,
          descricao: m.descricao,
          motivoQuebra: m.motivoQuebra,
          labelCompleta: m.labelCompleta,
          quantidade: m.quantidade,
        })),
    [porMotivo],
  );

  const motivoDetalhe = useMemo(() => {
    if (!codigoDetalhe) return null;
    return porMotivo.find((m) => m.codigo === codigoDetalhe) ?? null;
  }, [codigoDetalhe, porMotivo]);

  const tecnicosPorCodigo = useMemo((): TecnicoQuebraAgg[] => {
    if (!codigoDetalhe) return [];
    const counts = new Map<string, number>();

    for (const row of rows) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (codigo !== codigoDetalhe) continue;
      if (!matchStatusContrato(codigo, dicionario, statusNota)) continue;

      const nome =
        row.nome_tecnico?.trim() ||
        row.login_tecnico?.trim() ||
        "—";
      counts.set(nome, (counts.get(nome) ?? 0) + 1);
    }

    return [...counts.entries()]
      .map(([nome, quantidade]) => ({ nome, quantidade }))
      .sort(
        (a, b) =>
          b.quantidade - a.quantidade ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      );
  }, [codigoDetalhe, rows, dicionario, statusNota]);

  const filtrosLimpos = ano === null && mes === null;

  const periodoDescricao = useMemo(() => {
    if (filtrosLimpos) return "Histórico completo TOA";
    if (ano !== null && mes !== null) {
      return `${mesLabel(mes)} de ${ano}`;
    }
    if (ano !== null) return `Ano ${ano} · todos os meses`;
    return "Período filtrado";
  }, [filtrosLimpos, ano, mes]);

  const periodoModalLabel = useMemo(() => {
    if (ano !== null && mes !== null) {
      return `${mesLabel(mes)} ${ano}`;
    }
    if (ano !== null) {
      return `Todos os meses - ${ano}`;
    }
    if (mes !== null) {
      return `${mesLabel(mes)} · todos os anos`;
    }
    return "Histórico completo";
  }, [ano, mes]);

  const totalOcorrenciasCodigo = motivoDetalhe?.quantidade ?? 0;

  const limparFiltros = () => {
    setAno(null);
    setMes(null);
    setStatusNota("IMPRODUTIVO");
  };

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-background px-4 py-3 shadow-sm">
        <div className="flex flex-row flex-wrap items-center gap-4 sm:gap-6">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-primary" />
            <span className="text-sm font-bold text-foreground">
              Filtros
            </span>
            {filtrosLimpos && (
              <Badge variant="secondary" className="text-xs">
                Histórico geral
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Label
              htmlFor="motivos-quebra-status"
              className="shrink-0 text-sm font-medium"
            >
              Status da nota:
            </Label>
            <Select
              value={statusNota}
              onValueChange={(v) =>
                setStatusNota(v as StatusContratoFiltro)
              }
            >
              <SelectTrigger id="motivos-quebra-status" className="w-[160px]">
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
              htmlFor="motivos-quebra-ano"
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
              <SelectTrigger id="motivos-quebra-ano" className="w-[140px]">
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
              htmlFor="motivos-quebra-mes"
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
              <SelectTrigger id="motivos-quebra-mes" className="w-[160px]">
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
          <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <IconeStatus className={`h-5 w-5 shrink-0 ${corTexto}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {tituloCardTotal}
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-gray-900 sm:text-lg">
                Quantidade de O.S
              </div>
              <div className="mt-auto">
                <div className={`mt-1 text-3xl font-bold ${corTexto}`}>
                  {formatQuantidade(totalQuebras)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subtituloCardTotal}
                </p>
              </div>
            </div>
            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <AlertTriangle className={`h-5 w-5 shrink-0 ${corTexto}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {tituloCardOfensor}
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-gray-900 sm:text-lg">
                {principalOfensor && principalOfensor.quantidade > 0
                  ? `Cód. ${principalOfensor.labelCompleta}`
                  : "—"}
              </div>
              <div className="mt-auto">
                <div className={`mt-1 text-3xl font-bold ${corTexto}`}>
                  {formatQuantidade(principalOfensor?.quantidade ?? 0)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  ocorrências do código de baixa
                </p>
              </div>
            </div>
            <div className="flex h-full flex-col rounded-xl border border-gray-200 bg-white p-5">
              <div className="flex items-center gap-2">
                <PieChart className={`h-5 w-5 shrink-0 ${corTexto}`} />
                <span className="text-sm font-medium text-muted-foreground">
                  {tituloCardMacro}
                </span>
              </div>
              <div className="mt-3 text-base font-bold leading-snug text-gray-900 sm:text-lg">
                {motivoMacroVencedor && motivoMacroVencedor.quantidade > 0
                  ? motivoMacroVencedor.motivo
                  : "—"}
              </div>
              <div className="mt-auto">
                <div className={`mt-1 text-3xl font-bold ${corTexto}`}>
                  {formatQuantidade(motivoMacroVencedor?.quantidade ?? 0)}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {subtituloCardMacro}
                </p>
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <AlertTriangle className={`h-4 w-4 ${corTexto}`} />
              {tituloTop10}
            </h2>
            {chartTop10.length === 0 ? (
              <p className="flex h-64 items-center justify-center text-sm text-muted-foreground">
                {emptyChartMsg}
              </p>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartTop10}
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
                      dataKey="codigo"
                      width={72}
                      tick={{ fontSize: 11 }}
                      reversed={false}
                    />
                    <Tooltip
                      content={
                        <MotivoChartTooltip corQuantidade={corTexto} />
                      }
                      cursor={{ fill: "#f3f4f6" }}
                    />
                    <Bar
                      dataKey="quantidade"
                      fill={corBarra}
                      radius={[0, 3, 3, 0]}
                      maxBarSize={22}
                      className="cursor-pointer"
                      onClick={(data) => {
                        const payload = (data?.payload ?? data) as
                          | ChartMotivoPoint
                          | undefined;
                        const codigo = payload?.codigo;
                        if (codigo) setCodigoDetalhe(codigo);
                      }}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <IconeStatus className="h-4 w-4 text-primary" />
              Todos os códigos de baixa
            </h2>
            {porMotivo.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                {emptyTableMsg}
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
                        {tituloColunaTipo}
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-2 py-2 text-right font-semibold shadow-sm">
                        Quantidade
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {porMotivo.map((row) => (
                      <tr
                        key={row.codigo}
                        role="button"
                        tabIndex={0}
                        onClick={() => setCodigoDetalhe(row.codigo)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            setCodigoDetalhe(row.codigo);
                          }
                        }}
                        className="cursor-pointer border-b border-border/60 transition-colors last:border-b-0 hover:bg-gray-50"
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
                          className={`px-2 py-2 text-right tabular-nums ${corTexto}`}
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
        </>
      )}

      {codigoDetalhe !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-codigo-quebra-titulo"
          onClick={() => setCodigoDetalhe(null)}
        >
          <div
            className="w-full max-w-lg rounded-lg bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <h3
                  id="modal-codigo-quebra-titulo"
                  className="text-lg font-bold text-gray-900"
                >
                  Cód. Baixa {codigoDetalhe}
                  {motivoDetalhe ? ` - ${motivoDetalhe.descricao}` : ""}
                </h3>
                <p className="mt-1 text-sm uppercase text-gray-500">
                  {motivoDetalhe
                    ? `TIPO: ${motivoDetalhe.motivoQuebra} · ${formatQuantidade(motivoDetalhe.quantidade)} ocorrência(s) - ${periodoModalLabel}`
                    : `${isImprodutivo ? "Quebras" : "Baixas/Notas"} por técnico · ${periodoModalLabel}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCodigoDetalhe(null)}
                className="rounded-md p-1 text-muted-foreground transition hover:bg-gray-100 hover:text-foreground"
                aria-label="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {tecnicosPorCodigo.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Nenhum técnico encontrado para este código no período.
              </p>
            ) : (
              <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted-foreground">
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                        Nome do Técnico
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                        {tituloColunaQtdTecnicos}
                      </th>
                      <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                        Representa
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tecnicosPorCodigo.map((tec) => {
                      const pct =
                        totalOcorrenciasCodigo > 0
                          ? (tec.quantidade / totalOcorrenciasCodigo) * 100
                          : 0;
                      return (
                        <tr
                          key={tec.nome}
                          className="border-b border-border/60 last:border-b-0"
                        >
                          <td className="px-3 py-2 font-medium text-gray-900">
                            {tec.nome}
                          </td>
                          <td
                            className={`px-3 py-2 text-right tabular-nums ${corTexto}`}
                          >
                            {formatQuantidade(tec.quantidade)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-500">
                            {pct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
