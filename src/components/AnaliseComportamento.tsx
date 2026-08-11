import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  CalendarDays,
  Clock,
  FilterX,
  Sunrise,
  Sunset,
  UserRound,
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

const CODIGOS_FUGA = new Set(["101", "106"]);
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

type RankingComportamento = {
  login: string;
  nome: string;
  totalQuebras: number;
  fugaQuebras: number;
  fugaPct: number;
  quebrasSegunda: number;
  quebrasSexta: number;
  taxaQuebraSegunda: number;
  taxaQuebraSexta: number;
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

function formatHoraDeInicioFim(inicioFim: string | null | undefined): string {
  const s = String(inicioFim ?? "").trim();
  if (!s) return "—";
  const match = s.match(/(\d{1,2})[:hH](\d{2})/);
  if (!match) return s.slice(0, 16) || "—";
  return `${String(match[1]).padStart(2, "0")}:${match[2]}`;
}

function nomeTecnicoRow(row: ToaImportacaoRow): string {
  const nome = row.nome_tecnico?.trim();
  if (nome) return nome;
  const login = normalizeToaLogin(row.login_tecnico);
  return login || "—";
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
  const [periodoSeeded, setPeriodoSeeded] = useState(false);

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

  const tecnicosDisponiveis = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of rows) {
      const nome = nomeTecnicoRow(row);
      if (!nome || nome === "—") continue;
      if (!map.has(nome)) map.set(nome, nome);
    }
    return [...map.keys()].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [rows]);

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

  const porTurno = useMemo(() => {
    let manha = 0;
    let tarde = 0;
    for (const row of quebrasOs) {
      const hora = extrairHoraInicio(row.inicio_fim);
      if (hora == null) continue;
      if (classificarTurno(hora) === "Manhã") manha += 1;
      else tarde += 1;
    }
    return {
      manha,
      tarde,
      chart: [
        { name: "Manhã", value: manha, fill: PIE_COLORS.manha },
        { name: "Tarde", value: tarde, fill: PIE_COLORS.tarde },
      ].filter((p) => p.value > 0),
    };
  }, [quebrasOs]);

  const fugaComplexidade = useMemo(() => {
    let totalQuebras = 0;
    let fuga = 0;
    for (const row of quebrasOs) {
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      totalQuebras += 1;
      if (CODIGOS_FUGA.has(codigo)) fuga += 1;
    }
    const pct = totalQuebras > 0 ? (fuga / totalQuebras) * 100 : 0;
    return { totalQuebras, fuga, pct };
  }, [quebrasOs]);

  const diaMaisCritico = useMemo(() => {
    let best: DiaSemanaAgg | null = null;
    for (const d of porDiaSemana) {
      const volume = d.produtivas + d.improdutivas;
      if (volume === 0) continue;
      if (
        !best ||
        d.taxaReprovacao > best.taxaReprovacao ||
        (d.taxaReprovacao === best.taxaReprovacao &&
          d.improdutivas > best.improdutivas)
      ) {
        best = d;
      }
    }
    return best;
  }, [porDiaSemana]);

  const turnoMaiorFadiga = useMemo(() => {
    if (porTurno.manha === 0 && porTurno.tarde === 0) return null;
    if (porTurno.tarde > porTurno.manha) {
      return { turno: "Tarde" as const, quebras: porTurno.tarde };
    }
    if (porTurno.manha > porTurno.tarde) {
      return { turno: "Manhã" as const, quebras: porTurno.manha };
    }
    return { turno: "Empate" as const, quebras: porTurno.manha };
  }, [porTurno]);

  const rankingSuspeito = useMemo((): RankingComportamento[] => {
    type Acc = {
      login: string;
      nome: string;
      totalQuebras: number;
      fugaQuebras: number;
      notasSegunda: number;
      improdSegunda: number;
      notasSexta: number;
      improdSexta: number;
      quebrasSegunda: number;
      quebrasSexta: number;
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
          totalQuebras: 0,
          fugaQuebras: 0,
          notasSegunda: 0,
          improdSegunda: 0,
          notasSexta: 0,
          improdSexta: 0,
          quebrasSegunda: 0,
          quebrasSexta: 0,
        };
        byTech.set(login, acc);
      } else if (nome !== "—" && (acc.nome === "—" || acc.nome === login)) {
        acc.nome = nome;
      }
      return acc;
    };

    for (const row of rowsFiltradas) {
      if (row.status_nota !== "Improdutiva" || !isLinhaOsImprodutiva(row)) {
        continue;
      }
      const codigo = normalizeCodigoBaixa(row.cod_baixa);
      if (!codigo) continue;
      const acc = ensure(row);
      acc.totalQuebras += 1;
      if (CODIGOS_FUGA.has(codigo)) acc.fugaQuebras += 1;
      const dow = diaDaSemanaFromIso(row.data_toa);
      if (dow === 1) acc.quebrasSegunda += 1;
      if (dow === 5) acc.quebrasSexta += 1;
    }

    for (const nota of dedupeNotasPorWo(rowsFiltradas)) {
      const dow = diaDaSemanaFromIso(nota.data_toa);
      if (dow !== 1 && dow !== 5) continue;
      const acc = ensure(nota);
      if (dow === 1) {
        acc.notasSegunda += 1;
        if (nota.status_nota === "Improdutiva") acc.improdSegunda += 1;
      } else {
        acc.notasSexta += 1;
        if (nota.status_nota === "Improdutiva") acc.improdSexta += 1;
      }
    }

    return [...byTech.values()]
      .filter((a) => a.totalQuebras > 0)
      .map((a) => ({
        login: a.login,
        nome: a.nome,
        totalQuebras: a.totalQuebras,
        fugaQuebras: a.fugaQuebras,
        fugaPct:
          a.totalQuebras > 0 ? (a.fugaQuebras / a.totalQuebras) * 100 : 0,
        quebrasSegunda: a.quebrasSegunda,
        quebrasSexta: a.quebrasSexta,
        taxaQuebraSegunda:
          a.notasSegunda > 0 ? (a.improdSegunda / a.notasSegunda) * 100 : 0,
        taxaQuebraSexta:
          a.notasSexta > 0 ? (a.improdSexta / a.notasSexta) * 100 : 0,
      }))
      .sort(
        (a, b) =>
          b.fugaPct - a.fugaPct ||
          b.fugaQuebras - a.fugaQuebras ||
          a.nome.localeCompare(b.nome, "pt-BR"),
      )
      .slice(0, 10);
  }, [rowsFiltradas]);

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

  const filtrosLimpos = ano === null && mes === null;
  const visaoEquipe = tecnicoFiltro === TECNICO_TODOS;
  const alertaFuga = fugaComplexidade.pct > 40;

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
  };

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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 shrink-0 text-red-600" />
                <span className="text-sm font-medium text-muted-foreground">
                  Dia mais crítico
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-gray-900">
                {diaMaisCritico?.dia ?? "—"}
              </div>
              <p className="mt-1 text-sm tabular-nums text-red-600">
                {diaMaisCritico
                  ? `${formatPct(diaMaisCritico.taxaReprovacao)} de reprovação`
                  : "Sem dados no período"}
              </p>
            </div>

            <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
              <div className="flex items-center gap-2">
                {turnoMaiorFadiga?.turno === "Manhã" ? (
                  <Sunrise className="h-5 w-5 shrink-0 text-amber-600" />
                ) : (
                  <Sunset className="h-5 w-5 shrink-0 text-orange-600" />
                )}
                <span className="text-sm font-medium text-muted-foreground">
                  Turno de maior fadiga
                </span>
              </div>
              <div className="mt-3 text-2xl font-bold text-gray-900">
                {turnoMaiorFadiga?.turno ?? "—"}
              </div>
              <p className="mt-1 text-sm tabular-nums text-muted-foreground">
                {turnoMaiorFadiga
                  ? `${formatQuantidade(turnoMaiorFadiga.quebras)} quebras`
                  : "Sem horário de início-fim"}
              </p>
            </div>

            <div
              className={`rounded-xl border p-5 shadow-sm ${
                alertaFuga
                  ? "border-orange-300 bg-orange-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div className="flex items-center gap-2">
                <AlertTriangle
                  className={`h-5 w-5 shrink-0 ${
                    alertaFuga ? "text-orange-700" : "text-red-600"
                  }`}
                />
                <span
                  className={`text-sm font-medium ${
                    alertaFuga ? "text-orange-800" : "text-muted-foreground"
                  }`}
                >
                  Alerta de Fuga (Cód. 106 e 101)
                </span>
              </div>
              <div
                className={`mt-3 text-3xl font-bold tabular-nums ${
                  alertaFuga ? "text-orange-700" : "text-gray-900"
                }`}
              >
                {formatPct(fugaComplexidade.pct)}
              </div>
              <p
                className={`mt-1 text-xs ${
                  alertaFuga ? "text-orange-800/80" : "text-muted-foreground"
                }`}
              >
                {formatQuantidade(fugaComplexidade.fuga)} de{" "}
                {formatQuantidade(fugaComplexidade.totalQuebras)} quebras ·
                Cliente Ausente / Endereço não localizado
                {alertaFuga ? " · acima de 40%" : ""}
              </p>
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
                      />
                      <Bar
                        dataKey="improdutivas"
                        name="Improdutiva"
                        fill="#dc2626"
                        radius={[3, 3, 0, 0]}
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
            <h2 className="mb-4 flex items-center gap-2 font-bold text-foreground">
              {visaoEquipe ? (
                <>
                  <AlertTriangle className="h-4 w-4 text-orange-600" />
                  Ranking de Comportamento Suspeito
                </>
              ) : (
                <>
                  <UserRound className="h-4 w-4 text-primary" />
                  Raio-X de Quebras do Técnico
                </>
              )}
            </h2>

            {visaoEquipe ? (
              rankingSuspeito.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Nenhum técnico com quebras (cód. 101/106) no período.
                </p>
              ) : (
                <div className="relative max-h-96 overflow-y-auto rounded-lg border border-gray-100">
                  <table className="w-full min-w-[40rem] text-sm">
                    <thead>
                      <tr className="border-b border-border text-left text-muted-foreground">
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                          #
                        </th>
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 font-semibold shadow-sm">
                          Técnico
                        </th>
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                          Fuga (101/106)
                        </th>
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                          Quebras
                        </th>
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                          Taxa Seg.
                        </th>
                        <th className="sticky top-0 z-10 bg-white px-3 py-2 text-right font-semibold shadow-sm">
                          Taxa Sex.
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {rankingSuspeito.map((row, idx) => (
                        <tr
                          key={row.login}
                          className="cursor-pointer border-b border-border/60 last:border-b-0 hover:bg-muted/50"
                          onClick={() => setTecnicoFiltro(row.nome)}
                          title="Abrir raio-X deste técnico"
                        >
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {idx + 1}
                          </td>
                          <td className="px-3 py-2 font-medium text-primary">
                            {row.nome}
                          </td>
                          <td
                            className={`px-3 py-2 text-right font-semibold tabular-nums ${
                              row.fugaPct > 40
                                ? "text-orange-700"
                                : "text-gray-900"
                            }`}
                          >
                            {formatPct(row.fugaPct)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-red-600">
                            {formatQuantidade(row.totalQuebras)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {formatPct(row.taxaQuebraSegunda)}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums text-gray-700">
                            {formatPct(row.taxaQuebraSexta)}
                          </td>
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
    </div>
  );
}
