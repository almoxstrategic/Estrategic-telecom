import { useEffect, useMemo, useState } from "react";
import { CalendarDays, DollarSign, Target, TrendingUp, Users } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  FiltroTipoAtividade,
  filtrarPorTiposAtividade,
} from "@/components/FiltroTipoAtividade";
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
import { extrairTiposAtividadeUnicos } from "@/lib/filtro-tipo-atividade";
import { formatQuantidade } from "@/lib/parse-locale-number";
import {
  fetchPrecosOs,
  type PrecosOsMap,
} from "@/lib/precos-os-service";
import {
  agregarChamadosToa,
  agregarKpisToaFlat,
  normalizeNumeroWo,
  normalizeToaLogin,
  regroupFlatRowsToChamados,
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

type TecnicoEstimativa = {
  login: string;
  nome: string;
  primeiroNome: string;
  produtivasAtual: number;
  mediaDiariaProdutiva: number;
  estimativaProdutivas: number;
  improdutivasAtual: number;
  mediaDiariaImprodutiva: number;
  estimativaImprodutivas: number;
  diasTrabalhados: number;
};

/** Dias úteis = seg–sáb (exclui domingo). `mes` é 1–12. */
export function contarDiasUteisMes(ano: number, mes: number): number {
  if (!ano || mes < 1 || mes > 12) return 0;
  const diasNoMes = new Date(ano, mes, 0).getDate();
  let total = 0;
  for (let dia = 1; dia <= diasNoMes; dia += 1) {
    const dow = new Date(ano, mes - 1, dia).getDay();
    if (dow !== 0) total += 1;
  }
  return total;
}

function mesLabel(mes: number): string {
  return MESES.find((m) => m.value === mes)?.label ?? String(mes);
}

function formatMedia(n: number): string {
  return n.toLocaleString("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function formatReceita(valor: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(valor);
}

function primeiroNomeDe(nome: string): string {
  const parte = nome.trim().split(/\s+/)[0];
  return parte || nome || "—";
}

function nomeTecnicoRow(row: ToaImportacaoRow): string {
  const nome = row.nome_tecnico?.trim();
  if (nome) return nome;
  const login = normalizeToaLogin(row.login_tecnico);
  return login || "—";
}

function datasUnicas(rows: ToaImportacaoRow[]): Set<string> {
  const set = new Set<string>();
  for (const row of rows) {
    const data = String(row.data_toa ?? "").slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(data)) set.add(data);
  }
  return set;
}

function projetarVolume(atual: number, diasTrabalhados: number, diasUteis: number) {
  const diasOp = Math.max(0, diasTrabalhados);
  const uteis = Math.max(0, diasUteis);
  const diasRestantes = Math.max(0, uteis - diasOp);
  const mediaDiaria = diasOp > 0 ? atual / diasOp : 0;
  const projecao = atual + mediaDiaria * diasRestantes;
  return {
    mediaDiaria,
    diasRestantes,
    projecao: Math.max(0, projecao),
  };
}

export function EstimativaVolume() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<ToaImportacaoRow[]>([]);
  const [precosOs, setPrecosOs] = useState<PrecosOsMap>({});
  const [competencias, setCompetencias] = useState<number[]>([]);
  const [ano, setAno] = useState<number | null>(null);
  const [mes, setMes] = useState<number | null>(null);
  const [aumento, setAumento] = useState<number>(0);
  const [periodoSeeded, setPeriodoSeeded] = useState(false);
  const [tiposAtividadeFiltro, setTiposAtividadeFiltro] = useState<string[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [comps, precos] = await Promise.all([
          fetchCompetenciasToa(),
          fetchPrecosOs().catch((err) => {
            console.error("Erro ao carregar catálogo de preços:", err);
            return {} as PrecosOsMap;
          }),
        ]);
        if (cancelled) return;
        setCompetencias(comps);
        setPrecosOs(precos);
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
        console.error("Erro ao carregar estimativa de volume:", err);
        setError(
          err instanceof Error
            ? err.message
            : "Não foi possível carregar a estimativa de volume TOA.",
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

  const tiposAtividadeOpcoes = useMemo(
    () => extrairTiposAtividadeUnicos(rows.map((row) => row.tipo_atividade)),
    [rows],
  );

  const rowsFiltradas = useMemo(
    () =>
      filtrarPorTiposAtividade(
        rows,
        tiposAtividadeOpcoes,
        tiposAtividadeFiltro,
        (row) => row.tipo_atividade,
      ),
    [rows, tiposAtividadeOpcoes, tiposAtividadeFiltro],
  );

  const estimativa = useMemo(() => {
    const kpis = agregarKpisToaFlat(rowsFiltradas);
    const diasTrabalhados = datasUnicas(rowsFiltradas).size;
    const diasUteis =
      ano != null && mes != null ? contarDiasUteisMes(ano, mes) : 0;

    const prod = projetarVolume(
      kpis.notasProdutivas,
      diasTrabalhados,
      diasUteis,
    );
    const improv = projetarVolume(
      kpis.notasImprodutivas,
      diasTrabalhados,
      diasUteis,
    );

    const progressoPct =
      diasUteis > 0
        ? Math.min(100, Math.round((diasTrabalhados / diasUteis) * 1000) / 10)
        : 0;

    const projecaoProdutiva = Math.round(prod.projecao);
    const receitaAtual = agregarChamadosToa(
      regroupFlatRowsToChamados(rowsFiltradas),
      precosOs,
    ).receitaFaturadaTotal;
    const ticketMedio =
      kpis.notasProdutivas > 0 ? receitaAtual / kpis.notasProdutivas : 0;
    const fatorAumento = 1 + (Number.isFinite(aumento) ? aumento : 0) / 100;
    const valorEstimado = ticketMedio * projecaoProdutiva * fatorAumento;

    return {
      produtivasAtual: kpis.notasProdutivas,
      improdutivasAtual: kpis.notasImprodutivas,
      diasTrabalhados,
      diasUteis,
      diasRestantes: prod.diasRestantes,
      mediaDiariaProdutiva: prod.mediaDiaria,
      mediaDiariaImprodutiva: improv.mediaDiaria,
      projecaoProdutiva,
      projecaoImprodutiva: Math.round(improv.projecao),
      progressoPct,
      receitaAtual,
      ticketMedio,
      valorEstimado,
    };
  }, [rowsFiltradas, ano, mes, precosOs, aumento]);

  const porTecnico = useMemo<TecnicoEstimativa[]>(() => {
    const diasUteis = estimativa.diasUteis;
    const porLogin = new Map<
      string,
      {
        nome: string;
        datas: Set<string>;
        woStatus: Map<string, Set<"Produtiva" | "Improdutiva">>;
      }
    >();

    for (const row of rowsFiltradas) {
      const login = normalizeToaLogin(row.login_tecnico);
      if (!login) continue;
      const bucket = porLogin.get(login) ?? {
        nome: nomeTecnicoRow(row),
        datas: new Set<string>(),
        woStatus: new Map(),
      };
      if (bucket.nome === "—" || !bucket.nome) {
        bucket.nome = nomeTecnicoRow(row);
      }
      const data = String(row.data_toa ?? "").slice(0, 10);
      if (/^\d{4}-\d{2}-\d{2}$/.test(data)) bucket.datas.add(data);

      const wo = normalizeNumeroWo(row.numero_wo);
      if (wo) {
        const statuses =
          bucket.woStatus.get(wo) ??
          new Set<"Produtiva" | "Improdutiva">();
        statuses.add(
          String(row.status_nota ?? "").trim() === "Produtiva"
            ? "Produtiva"
            : "Improdutiva",
        );
        bucket.woStatus.set(wo, statuses);
      }
      porLogin.set(login, bucket);
    }

    const lista: TecnicoEstimativa[] = [];
    for (const [login, bucket] of porLogin) {
      let produtivasAtual = 0;
      let improdutivasAtual = 0;
      for (const statuses of bucket.woStatus.values()) {
        if (statuses.has("Produtiva")) produtivasAtual += 1;
        else improdutivasAtual += 1;
      }
      const diasTrabalhados = bucket.datas.size;
      const prod = projetarVolume(produtivasAtual, diasTrabalhados, diasUteis);
      const improv = projetarVolume(
        improdutivasAtual,
        diasTrabalhados,
        diasUteis,
      );
      const nome = bucket.nome || login;
      lista.push({
        login,
        nome,
        primeiroNome: primeiroNomeDe(nome),
        produtivasAtual,
        mediaDiariaProdutiva: prod.mediaDiaria,
        estimativaProdutivas: Math.round(prod.projecao),
        improdutivasAtual,
        mediaDiariaImprodutiva: improv.mediaDiaria,
        estimativaImprodutivas: Math.round(improv.projecao),
        diasTrabalhados,
      });
    }

    return lista.sort(
      (a, b) =>
        b.estimativaProdutivas - a.estimativaProdutivas ||
        a.nome.localeCompare(b.nome, "pt-BR"),
    );
  }, [rowsFiltradas, estimativa.diasUteis]);

  const chartData = useMemo(
    () => [
      {
        cenario: "Realizado até agora",
        produtivas: estimativa.produtivasAtual,
        improdutivas: estimativa.improdutivasAtual,
      },
      {
        cenario: "Projeção fim do mês",
        produtivas: estimativa.projecaoProdutiva,
        improdutivas: estimativa.projecaoImprodutiva,
      },
    ],
    [estimativa],
  );

  const chartPorTecnico = useMemo(
    () =>
      porTecnico.map((t) => ({
        nome: t.primeiroNome,
        nomeCompleto: t.nome,
        estimativaProdutivas: t.estimativaProdutivas,
        estimativaImprodutivas: t.estimativaImprodutivas,
      })),
    [porTecnico],
  );

  const periodoPronto = ano != null && mes != null;

  return (
    <div className="w-full space-y-6">
      <div className="flex flex-wrap items-end justify-end gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Ano</Label>
          <Select
            value={ano != null ? String(ano) : undefined}
            onValueChange={(v) => {
              setAno(Number(v));
              setMes(null);
            }}
          >
            <SelectTrigger className="w-[120px] bg-background">
              <SelectValue placeholder="Ano" />
            </SelectTrigger>
            <SelectContent>
              {anosDisponiveis.map((a) => (
                <SelectItem key={a} value={String(a)}>
                  {a}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs text-muted-foreground">Mês</Label>
          <Select
            value={mes != null ? String(mes) : undefined}
            onValueChange={(v) => setMes(Number(v))}
            disabled={ano == null}
          >
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="Mês" />
            </SelectTrigger>
            <SelectContent>
              {mesesDisponiveis.map((m) => (
                <SelectItem key={m} value={String(m)}>
                  {mesLabel(m)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <FiltroTipoAtividade
          id="estimativa-tipo-atividade"
          opcoesDisponiveis={tiposAtividadeOpcoes}
          valoresSelecionados={tiposAtividadeFiltro}
          onChange={setTiposAtividadeFiltro}
          className="flex flex-col items-start gap-1.5"
          labelClassName="text-xs text-muted-foreground"
        />
        <div className="space-y-1.5">
          <Label
            htmlFor="estimativa-aumento"
            className="inline-flex items-center gap-1 text-xs text-muted-foreground"
          >
            <TrendingUp className="h-3.5 w-3.5 text-primary" />
            Aumento (%)
          </Label>
          <input
            id="estimativa-aumento"
            type="number"
            step="0.1"
            value={Number.isFinite(aumento) ? aumento : 0}
            onChange={(e) => {
              const raw = e.target.value;
              if (raw.trim() === "") {
                setAumento(0);
                return;
              }
              const n = Number(raw);
              setAumento(Number.isFinite(n) ? n : 0);
            }}
            placeholder="0"
            aria-label="Aumento percentual"
            className="w-24 rounded-md border border-gray-300 bg-background px-3 py-2 text-sm tabular-nums text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando estimativa…</p>
      ) : error ? (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : !periodoPronto ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          Selecione <strong>ano</strong> e <strong>mês</strong> para calcular o
          run rate.
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          Nenhum dado TOA para {mesLabel(mes!)}/{ano}. Importe a planilha em
          Administração → Importação.
        </p>
      ) : rowsFiltradas.length === 0 ? (
        <p className="rounded-lg border border-border bg-muted/40 px-4 py-6 text-sm text-muted-foreground">
          Nenhum tipo de atividade selecionado. Ajuste o filtro Tipo de
          Atividade para visualizar a estimativa.
        </p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 shrink-0 text-primary" />
                <span className="text-sm font-medium text-muted-foreground">
                  Progresso do Mês
                </span>
              </div>
              <p className="mt-3 text-lg font-bold text-gray-900">
                Dias operados: {formatQuantidade(estimativa.diasTrabalhados)} de{" "}
                {formatQuantidade(estimativa.diasUteis)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Dias úteis restantes:{" "}
                {formatQuantidade(estimativa.diasRestantes)} (seg–sáb)
              </p>
              <div className="mt-4 h-2.5 w-full overflow-hidden rounded-full bg-gray-100">
                <div
                  className="h-full rounded-full bg-primary transition-all"
                  style={{ width: `${estimativa.progressoPct}%` }}
                />
              </div>
              <p className="mt-2 text-right text-xs font-semibold tabular-nums text-muted-foreground">
                {estimativa.progressoPct.toLocaleString("pt-BR", {
                  maximumFractionDigits: 1,
                })}
                %
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <span className="text-sm font-medium text-muted-foreground">
                Produtivas (Atual vs Preditiva)
              </span>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(estimativa.produtivasAtual)}
              </div>
              <p className="mt-2 text-sm font-semibold text-green-600">
                Estimativa de fechamento:{" "}
                {formatQuantidade(estimativa.projecaoProdutiva)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Média diária: {formatMedia(estimativa.mediaDiariaProdutiva)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <span className="text-sm font-medium text-muted-foreground">
                Improdutivas (Atual vs Preditiva)
              </span>
              <div className="mt-3 text-3xl font-bold text-gray-900">
                {formatQuantidade(estimativa.improdutivasAtual)}
              </div>
              <p className="mt-2 text-sm font-semibold text-red-500">
                Estimativa de fechamento:{" "}
                {formatQuantidade(estimativa.projecaoImprodutiva)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Média diária: {formatMedia(estimativa.mediaDiariaImprodutiva)}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 shrink-0 text-green-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Valor Estimado (Projeção)
                </span>
              </div>
              <div className="mt-3 text-3xl font-bold tabular-nums text-green-600">
                {formatReceita(estimativa.valorEstimado)}
              </div>
              <p className="mt-2 text-xs text-muted-foreground">
                Receita atual: {formatReceita(estimativa.receitaAtual)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Ticket médio: {formatReceita(estimativa.ticketMedio)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <Target className="h-4 w-4 text-primary" />
              Cenário Atual × Projeção de Fechamento
            </h2>
            <div className="h-80 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" />
                  <XAxis dataKey="cenario" tick={{ fontSize: 12 }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                  <Tooltip
                    formatter={(value, name) => [
                      formatQuantidade(Number(value) || 0),
                      String(name),
                    ]}
                    contentStyle={{
                      borderRadius: 8,
                      border: "1px solid hsl(var(--border))",
                      fontSize: 13,
                    }}
                  />
                  <Legend />
                  <Bar
                    dataKey="produtivas"
                    name="Produtivas"
                    fill="#16a34a"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="improdutivas"
                    name="Improdutivas"
                    fill="#dc2626"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              <Users className="h-4 w-4 text-primary" />
              Estimativa de Fechamento por Técnico
            </h2>
            {chartPorTecnico.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum técnico com notas no período.
              </p>
            ) : (
              <div className="h-80 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={chartPorTecnico}
                    margin={{ top: 8, right: 12, left: 0, bottom: 8 }}
                  >
                    <CartesianGrid vertical={false} strokeDasharray="3 3" />
                    <XAxis
                      dataKey="nome"
                      tick={{ fontSize: 11 }}
                      interval={0}
                      angle={chartPorTecnico.length > 8 ? -35 : 0}
                      textAnchor={
                        chartPorTecnico.length > 8 ? "end" : "middle"
                      }
                      height={chartPorTecnico.length > 8 ? 56 : 30}
                    />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload }) => {
                        if (!active || !payload?.[0]) return null;
                        const item = payload[0].payload as {
                          nomeCompleto: string;
                          estimativaProdutivas: number;
                          estimativaImprodutivas: number;
                        };
                        return (
                          <div className="rounded-lg border border-border bg-background px-3 py-2 text-sm shadow-md">
                            <p className="font-bold">{item.nomeCompleto}</p>
                            <p className="text-green-600">
                              Estimativa Produtivas:{" "}
                              {formatQuantidade(item.estimativaProdutivas)}
                            </p>
                            <p className="text-red-600">
                              Estimativa Improdutivas:{" "}
                              {formatQuantidade(item.estimativaImprodutivas)}
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend />
                    <Bar
                      dataKey="estimativaProdutivas"
                      name="Estimativa Produtivas"
                      fill="#16a34a"
                      radius={[4, 4, 0, 0]}
                    />
                    <Bar
                      dataKey="estimativaImprodutivas"
                      name="Estimativa Improdutivas"
                      fill="#dc2626"
                      radius={[4, 4, 0, 0]}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-gray-800">
              <Users className="h-4 w-4 text-primary" />
              Média e projeção por técnico
            </h2>
            {porTecnico.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Nenhum técnico com notas no período.
              </p>
            ) : (
              <div className="relative max-h-[520px] overflow-auto rounded-lg border border-gray-100">
                <table className="w-full border-collapse text-sm">
                  <thead className="sticky top-0 z-10 bg-white shadow-sm">
                    <tr className="border-b border-border">
                      <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Técnico
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Produtivas (Atual)
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Média Diária
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Estimativa Produtivas
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Improdutivas (Atual)
                      </th>
                      <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                        Estimativa Improdutivas
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {porTecnico.map((t) => (
                      <tr
                        key={t.login}
                        className="border-b border-border/60 hover:bg-muted/40"
                      >
                        <td className="px-3 py-2.5 font-medium text-foreground">
                          {t.nome}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {formatQuantidade(t.produtivasAtual)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-muted-foreground">
                          {formatMedia(t.mediaDiariaProdutiva)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-green-600">
                          {formatQuantidade(t.estimativaProdutivas)}
                        </td>
                        <td className="px-3 py-2.5 text-right tabular-nums text-foreground">
                          {formatQuantidade(t.improdutivasAtual)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-semibold tabular-nums text-red-500">
                          {formatQuantidade(t.estimativaImprodutivas)}
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
    </div>
  );
}
