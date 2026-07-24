import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, CalendarClock, Download } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth-guards";
import { fetchDimMateriais } from "@/lib/logistica-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/previsao-reserva")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Previsão de Reserva — Estrategic Field" },
      {
        name: "description",
        content: "Protótipo de autonomia de estoque e ponto de ressuprimento.",
      },
    ],
  }),
  component: PrevisaoReservaPage,
});

const LEAD_TIME_DIAS = 15;

type LinhaPrevisao = {
  codigo: string;
  descricao: string;
  custoUnitario: number;
  estoqueBTP: number;
  bloqueioBTP: number;
  transito: number;
  estoqueEmpreiteiraParceira: number;
  estoqueFisico: number;
  estoqueCampo: number;
  estoqueTotalReal: number;
  mediaConsumoMensal: number;
  mediaConsumoSemanal: number;
  autonomia: number;
  pontoRessuprimento: number;
  diasParaReserva: number;
};

type SortColumn =
  | "descricao"
  | "custoUnitario"
  | "estoqueLiquido"
  | "estoqueBTP"
  | "bloqueioBTP"
  | "transito"
  | "estoqueEmpreiteiraParceira"
  | "estoqueFisicoCampo"
  | "estoqueFisico"
  | "estoqueCampo"
  | "diferenca"
  | "statusDivergencia"
  | "mediaConsumoMensal"
  | "mediaConsumoSemanal"
  | "autonomia"
  | "pontoRessuprimento"
  | "diasParaReserva"
  | "status"
  | "financeiro";

type SortDirection = "asc" | "desc";

type FiltroDivergencia = "Todos" | "Neutro" | "Sobra Física" | "Falta Física";
type FiltroReserva = "Todos" | "Reservar" | "Urgente" | "Saudável";

const FILTRO_DIVERGENCIA_OPCOES: FiltroDivergencia[] = [
  "Todos",
  "Neutro",
  "Sobra Física",
  "Falta Física",
];
const FILTRO_RESERVA_OPCOES: FiltroReserva[] = ["Todos", "Reservar", "Urgente", "Saudável"];

function statusLabel(diasParaReserva: number): Exclude<FiltroReserva, "Todos"> {
  if (diasParaReserva < 0) return "Urgente";
  if (diasParaReserva <= 7) return "Reservar";
  return "Saudável";
}

function StatusReservaBadge({ diasParaReserva }: { diasParaReserva: number }) {
  const status = statusLabel(numOrZero(diasParaReserva));
  if (status === "Urgente") {
    return (
      <span className="whitespace-nowrap rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-800">
        Urgente
      </span>
    );
  }
  if (status === "Reservar") {
    return (
      <span className="whitespace-nowrap rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-800">
        Reservar
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-800">
      Saudável
    </span>
  );
}

function statusDivergenciaLabel(diferenca: number): string {
  const d = numOrZero(diferenca);
  if (d === 0) return "Neutro";
  if (d > 0) return "Falta Físico";
  return "Sobra Físico";
}

function matchesFiltroDivergencia(diferenca: number, filtro: FiltroDivergencia): boolean {
  if (filtro === "Todos") return true;
  const label = statusDivergenciaLabel(diferenca);
  if (filtro === "Neutro") return label === "Neutro";
  if (filtro === "Sobra Física") return label === "Sobra Físico";
  if (filtro === "Falta Física") return label === "Falta Físico";
  return true;
}

function StatusDivergenciaBadge({ diferenca }: { diferenca: number }) {
  const d = numOrZero(diferenca);
  if (d === 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-yellow-100 px-1.5 py-0.5 text-[9px] font-semibold text-yellow-800">
        Neutro
      </span>
    );
  }
  if (d > 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-red-100 px-1.5 py-0.5 text-[9px] font-semibold text-red-800">
        Falta Físico
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-green-100 px-1.5 py-0.5 text-[9px] font-semibold text-green-800">
      Sobra Físico
    </span>
  );
}

function formatMoedaBr(valor: number): string {
  const n = Number.isFinite(valor) ? valor : 0;
  return Math.abs(n).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function numOrZero(valor: number | null | undefined): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

function custoSeguro(custoUnitario: number | null | undefined): number {
  const n = numOrZero(custoUnitario);
  return n > 0 ? n : 10;
}

/** Inteiro aleatório inclusivo entre min e max. */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function estoqueFisicoCampoOf(row: Pick<LinhaPrevisao, "estoqueFisico" | "estoqueCampo">): number {
  return numOrZero(row.estoqueFisico) + numOrZero(row.estoqueCampo);
}

/** Cálculo A: Estoque líquido BTP */
function estoqueLiquidoBTPOf(
  row: Pick<
    LinhaPrevisao,
    "estoqueBTP" | "bloqueioBTP" | "transito" | "estoqueEmpreiteiraParceira"
  >,
): number {
  return (
    numOrZero(row.estoqueBTP) -
    numOrZero(row.bloqueioBTP) -
    numOrZero(row.transito) -
    numOrZero(row.estoqueEmpreiteiraParceira)
  );
}

/** Cálculo B: Diferença BTP x Físico */
function diferencaBtpXFisicoOf(row: LinhaPrevisao): number {
  return estoqueLiquidoBTPOf(row) - estoqueFisicoCampoOf(row);
}

/** Impacto financeiro: Cálculo B × valor unitário (Falta > 0 → prejuízo; Sobra < 0 → crédito). */
function impactoFinanceiro(diferenca: number, custoUnitario: number): number {
  return numOrZero(diferenca) * custoSeguro(custoUnitario);
}

function FinanceiroCell({
  diferenca,
  custoUnitario,
}: {
  diferenca: number;
  custoUnitario: number;
}) {
  const diff = numOrZero(diferenca);
  const valorFinanceiro = Math.abs(diff * custoSeguro(custoUnitario));

  // Falta físico (diferença > 0) → prejuízo
  if (diff > 0) {
    return (
      <span className="font-bold tabular-nums text-red-600">
        -R$ {formatMoedaBr(valorFinanceiro)}
      </span>
    );
  }
  // Sobra físico (diferença < 0) → crédito
  if (diff < 0) {
    return (
      <span className="font-bold tabular-nums text-green-600">
        R$ {formatMoedaBr(valorFinanceiro)}
      </span>
    );
  }
  return <span className="font-bold tabular-nums text-green-600">R$ 0,00</span>;
}

/** Mock saudável: BTP acima do ponto de ressuprimento na maioria dos casos. */
function gerarLinhaPrevisao(codigo: string, descricao: string): LinhaPrevisao {
  const leadTime = LEAD_TIME_DIAS;
  const mediaConsumoMensal = randInt(5, 50);
  const mediaConsumoSemanal = randInt(5, 50);
  const mediaDiaria = mediaConsumoMensal / 30;
  const pontoRessuprimento = Math.max(1, Math.round(mediaDiaria * leadTime));

  // ~90% com estoque acima do ponto; ~10% abaixo (exceção para demo)
  const estoqueBTP =
    Math.random() < 0.1
      ? Math.max(1, pontoRessuprimento - Math.floor(Math.random() * mediaConsumoMensal * 2))
      : pontoRessuprimento + Math.floor(Math.random() * 200);

  const bloqueioBTP = randInt(5, 50);
  const transito = randInt(5, 50);
  const estoqueEmpreiteiraParceira = randInt(5, 50);

  // Físico + Campo próximos ao BTP (±10%)
  const desvio = Math.floor(estoqueBTP * 0.1);
  const soma = estoqueBTP + Math.floor(Math.random() * (desvio * 2 + 1)) - desvio;
  const estoqueTotalReal = Math.max(0, soma);
  const estoqueFisico = Math.floor(Math.random() * (estoqueTotalReal + 1));
  const estoqueCampo = estoqueTotalReal - estoqueFisico;

  const autonomia = mediaDiaria === 0 ? 999 : Math.floor(estoqueBTP / mediaDiaria);
  const diasParaReserva = autonomia - leadTime;
  const custoUnitario = Math.floor(Math.random() * 90) + 10; // R$ 10–99

  return {
    codigo,
    descricao,
    custoUnitario,
    estoqueBTP,
    bloqueioBTP,
    transito,
    estoqueEmpreiteiraParceira,
    estoqueFisico,
    estoqueCampo,
    estoqueTotalReal,
    mediaConsumoMensal,
    mediaConsumoSemanal,
    autonomia,
    pontoRessuprimento,
    diasParaReserva,
  };
}

function SortableHead({
  label,
  column,
  activeColumn,
  direction,
  onSort,
  align = "center",
  className,
}: {
  label: ReactNode;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
  align?: "left" | "center";
  className?: string;
}) {
  const active = activeColumn === column;
  return (
    <TableHead
      className={cn(
        "break-words whitespace-normal leading-tight",
        align === "left" ? "text-left" : "text-center",
        className,
      )}
    >
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-start gap-0.5 font-medium hover:text-foreground",
          align === "left" ? "justify-start" : "justify-center text-center",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(column)}
      >
        <span className="break-words whitespace-normal leading-tight">{label}</span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          ) : (
            <ArrowDown className="mt-0.5 h-2.5 w-2.5 shrink-0" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

function PrevisaoReservaPage() {
  const [linhas, setLinhas] = useState<LinhaPrevisao[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtroDivergencia, setFiltroDivergencia] = useState<FiltroDivergencia>("Todos");
  const [filtroReserva, setFiltroReserva] = useState<FiltroReserva>("Todos");
  const [sortColumn, setSortColumn] = useState<SortColumn>("descricao");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  useEffect(() => {
    let cancelled = false;

    async function carregar() {
      setLoading(true);
      setErro(null);
      try {
        const materiais = await fetchDimMateriais();
        if (cancelled) return;

        setLinhas(materiais.map((m) => gerarLinhaPrevisao(m.material, m.descr_material)));
      } catch (e) {
        if (!cancelled) {
          setErro(e instanceof Error ? e.message : "Falha ao carregar materiais.");
          setLinhas([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void carregar();
    return () => {
      cancelled = true;
    };
  }, []);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = linhas.filter((row) => {
      if (termo) {
        const matchTexto =
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo);
        if (!matchTexto) return false;
      }
      if (!matchesFiltroDivergencia(diferencaBtpXFisicoOf(row), filtroDivergencia)) {
        return false;
      }
      if (filtroReserva !== "Todos") {
        if (statusLabel(row.diasParaReserva) !== filtroReserva) return false;
      }
      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      switch (sortColumn) {
        case "descricao":
          return a.descricao.localeCompare(b.descricao, "pt-BR") * dir;
        case "custoUnitario":
          return (custoSeguro(a.custoUnitario) - custoSeguro(b.custoUnitario)) * dir;
        case "estoqueLiquido":
          return (estoqueLiquidoBTPOf(a) - estoqueLiquidoBTPOf(b)) * dir;
        case "estoqueBTP":
          return (a.estoqueBTP - b.estoqueBTP) * dir;
        case "bloqueioBTP":
          return (a.bloqueioBTP - b.bloqueioBTP) * dir;
        case "transito":
          return (a.transito - b.transito) * dir;
        case "estoqueEmpreiteiraParceira":
          return (a.estoqueEmpreiteiraParceira - b.estoqueEmpreiteiraParceira) * dir;
        case "estoqueFisicoCampo":
          return (estoqueFisicoCampoOf(a) - estoqueFisicoCampoOf(b)) * dir;
        case "estoqueFisico":
          return (a.estoqueFisico - b.estoqueFisico) * dir;
        case "estoqueCampo":
          return (a.estoqueCampo - b.estoqueCampo) * dir;
        case "diferenca":
          return (diferencaBtpXFisicoOf(a) - diferencaBtpXFisicoOf(b)) * dir;
        case "statusDivergencia":
          return (
            statusDivergenciaLabel(diferencaBtpXFisicoOf(a)).localeCompare(
              statusDivergenciaLabel(diferencaBtpXFisicoOf(b)),
              "pt-BR",
            ) * dir
          );
        case "mediaConsumoMensal":
          return (a.mediaConsumoMensal - b.mediaConsumoMensal) * dir;
        case "mediaConsumoSemanal":
          return (a.mediaConsumoSemanal - b.mediaConsumoSemanal) * dir;
        case "autonomia":
          return (a.autonomia - b.autonomia) * dir;
        case "pontoRessuprimento":
          return (a.pontoRessuprimento - b.pontoRessuprimento) * dir;
        case "diasParaReserva":
          return (a.diasParaReserva - b.diasParaReserva) * dir;
        case "status":
          return (a.diasParaReserva - b.diasParaReserva) * dir;
        case "financeiro":
          return (
            (impactoFinanceiro(diferencaBtpXFisicoOf(a), a.custoUnitario) -
              impactoFinanceiro(diferencaBtpXFisicoOf(b), b.custoUnitario)) *
            dir
          );
        default:
          return 0;
      }
    });
  }, [linhas, busca, filtroDivergencia, filtroReserva, sortColumn, sortDirection]);

  const valorEsperadoBtp = useMemo(() => {
    return linhasFiltradas.reduce(
      (acc, row) => acc + numOrZero(row.estoqueBTP) * custoSeguro(row.custoUnitario),
      0,
    );
  }, [linhasFiltradas]);

  const valorFisicoReal = useMemo(() => {
    return linhasFiltradas.reduce(
      (acc, row) => acc + estoqueFisicoCampoOf(row) * custoSeguro(row.custoUnitario),
      0,
    );
  }, [linhasFiltradas]);

  const saldoDivergencia = useMemo(() => {
    return linhasFiltradas.reduce((acc, row) => {
      const diferenca = diferencaBtpXFisicoOf(row);
      return acc + -numOrZero(diferenca) * custoSeguro(row.custoUnitario);
    }, 0);
  }, [linhasFiltradas]);

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const limparFiltros = () => {
    setBusca("");
    setFiltroDivergencia("Todos");
    setFiltroReserva("Todos");
  };

  const handleExportExcel = () => {
    if (linhasFiltradas.length === 0) {
      toast.error("Não há dados para exportar com os filtros atuais.");
      return;
    }

    const dadosExcel = linhasFiltradas.map((item) => {
      const estoqueBTP = item.estoqueBTP || 0;
      const bloqueioBTP = item.bloqueioBTP || 0;
      const transito = item.transito || 0;
      const estoqueEmpreiteiraParceira = item.estoqueEmpreiteiraParceira || 0;
      const estoqueFisico = item.estoqueFisico || 0;
      const estoqueCampo = item.estoqueCampo || 0;
      const estoqueFisicoCampo = estoqueFisico + estoqueCampo;
      const estoqueLiquidoBTP =
        estoqueBTP - bloqueioBTP - transito - estoqueEmpreiteiraParceira;
      const diferenca = estoqueLiquidoBTP - estoqueFisicoCampo;
      const financeiro = diferenca * custoSeguro(item.custoUnitario);

      return {
        "Código": item.codigo,
        "Descrição": item.descricao,
        "Valor Unit. (R$)": Number(custoSeguro(item.custoUnitario).toFixed(2)),
        "Estoque Líquido BTP": estoqueLiquidoBTP,
        "Estoque BTP": estoqueBTP,
        "Bloqueio BTP": bloqueioBTP,
        Transito: transito,
        "Estoque Parc.": estoqueEmpreiteiraParceira,
        "Estoque (Físico+Campo)": estoqueFisicoCampo,
        "Estoque Físico": estoqueFisico,
        "Estoque Campo": estoqueCampo,
        "Diferença BTP x Físico": diferenca,
        "Status Divergência": statusDivergenciaLabel(diferenca),
        "Média Cons. Mensal": item.mediaConsumoMensal || 0,
        "Média Cons. Semanal": item.mediaConsumoSemanal || 0,
        "Autonomia (dias)": item.autonomia || 0,
        "Ponto Ressup.": item.pontoRessuprimento || 0,
        "Dias para Reserva": item.diasParaReserva || 0,
        "Status Reserva": statusLabel(item.diasParaReserva || 0),
        "Financeiro (R$)": Number(financeiro.toFixed(2)),
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Previsão Reserva");

    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Previsao_Reserva_Estoque_${hoje}.xlsx`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto min-h-[80vh] w-full max-w-[1800px] px-2 pb-10 pt-6">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <header>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <CalendarClock className="h-6 w-6 text-primary" />
              Previsão de Reserva
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">(Esse modulo é um protótipo)</p>
          </header>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Valor Esperado (BTP)
              </span>
              <span className="text-xl font-bold text-gray-800">
                R$ {formatMoedaBr(valorEsperadoBtp)}
              </span>
            </div>
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Valor Físico Real
              </span>
              <span className="text-xl font-bold text-gray-800">
                R$ {formatMoedaBr(valorFisicoReal)}
              </span>
            </div>
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">
                Saldo da Divergência
              </span>
              {saldoDivergencia < 0 ? (
                <span className="text-xl font-bold text-red-600">
                  -R$ {formatMoedaBr(saldoDivergencia)}
                </span>
              ) : (
                <span className="text-xl font-bold text-green-600">
                  R$ {formatMoedaBr(saldoDivergencia)}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="mb-4 flex flex-wrap items-center gap-2">
          <div className="relative max-w-md flex-1">
            <Input
              type="search"
              placeholder="Buscar por Código ou Descrição do Material..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2"
            />
          </div>

          <select
            aria-label="Status de Divergência"
            value={filtroDivergencia}
            onChange={(e) => setFiltroDivergencia(e.target.value as FiltroDivergencia)}
            className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {FILTRO_DIVERGENCIA_OPCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao === "Todos" ? "Status de Divergência" : opcao}
              </option>
            ))}
          </select>

          <select
            aria-label="Status de Reserva"
            value={filtroReserva}
            onChange={(e) => setFiltroReserva(e.target.value as FiltroReserva)}
            className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {FILTRO_RESERVA_OPCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao === "Todos" ? "Status de Reserva" : opcao}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={limparFiltros}
            className="shrink-0 text-sm text-muted-foreground underline underline-offset-2 hover:text-foreground"
          >
            Limpar todos os filtros
          </button>

          <Button
            type="button"
            variant="outline"
            className="ml-auto h-9 shrink-0 gap-2 border-gray-300 bg-white"
            onClick={handleExportExcel}
            disabled={linhasFiltradas.length === 0}
          >
            <Download className="h-4 w-4 text-green-600" />
            Exportar Excel
          </Button>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando materiais do Upload C…</p>
        ) : erro ? (
          <p className="text-sm text-destructive">{erro}</p>
        ) : linhas.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhum material encontrado. Importe o Upload C — Consulta de Estoque primeiro.
          </p>
        ) : (
          <div className="w-full overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Table className="w-full table-fixed text-[10px] [&_th]:h-auto [&_th]:break-words [&_th]:px-1 [&_th]:py-0.5 [&_th]:leading-tight [&_th]:whitespace-normal [&_td]:px-1 [&_td]:py-0.5">
              <TableHeader>
                <TableRow>
                  <TableHead className="break-words text-left leading-tight whitespace-normal">
                    Código
                  </TableHead>
                  <SortableHead
                    label="Descrição"
                    column="descricao"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                    align="left"
                    className="max-w-[150px]"
                  />
                  <SortableHead
                    label="Valor unit."
                    column="custoUnitario"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque (BTP - Bloqueio BTP - Transito - Estoq. Parceira)"
                    column="estoqueLiquido"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque BTP"
                    column="estoqueBTP"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Bloqueio BTP"
                    column="bloqueioBTP"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Transito"
                    column="transito"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque Empreteira parceira"
                    column="estoqueEmpreiteiraParceira"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque (Físico + Campo)"
                    column="estoqueFisicoCampo"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque Físico"
                    column="estoqueFisico"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque Campo"
                    column="estoqueCampo"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Diferença BTP x Físico"
                    column="diferenca"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Status Divergência"
                    column="statusDivergencia"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Média de consumo Mensal"
                    column="mediaConsumoMensal"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Média de consumo Semanal"
                    column="mediaConsumoSemanal"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Autonomia de consumo"
                    column="autonomia"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Ponto de Ressuprimento"
                    column="pontoRessuprimento"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Dias para reserva"
                    column="diasParaReserva"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Status Reserva"
                    column="status"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Financeiro"
                    column="financeiro"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={20} className="py-8 text-center text-muted-foreground">
                      Nenhum material corresponde aos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhasFiltradas.map((item) => {
                    const estoqueBTP = item.estoqueBTP || 0;
                    const bloqueioBTP = item.bloqueioBTP || 0;
                    const transito = item.transito || 0;
                    const estoqueEmpreiteiraParceira = item.estoqueEmpreiteiraParceira || 0;
                    const estoqueFisico = item.estoqueFisico || 0;
                    const estoqueCampo = item.estoqueCampo || 0;
                    const estoqueFisicoCampo = estoqueFisico + estoqueCampo;
                    const estoqueLiquidoBTP =
                      estoqueBTP - bloqueioBTP - transito - estoqueEmpreiteiraParceira;
                    const diferenca = estoqueLiquidoBTP - estoqueFisicoCampo;

                    return (
                      <TableRow key={item.codigo}>
                        <TableCell className="text-left font-mono">{item.codigo}</TableCell>
                        <TableCell className="max-w-[150px] truncate text-left">
                          {item.descricao}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          R$ {formatMoedaBr(custoSeguro(item.custoUnitario))}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {estoqueLiquidoBTP}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{estoqueBTP}</TableCell>
                        <TableCell className="text-center tabular-nums">{bloqueioBTP}</TableCell>
                        <TableCell className="text-center tabular-nums">{transito}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {estoqueEmpreiteiraParceira}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {estoqueFisicoCampo}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">{estoqueFisico}</TableCell>
                        <TableCell className="text-center tabular-nums">{estoqueCampo}</TableCell>
                        <TableCell className="text-center font-medium tabular-nums">
                          {diferenca}
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusDivergenciaBadge diferenca={diferenca} />
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {item.mediaConsumoMensal || 0}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {item.mediaConsumoSemanal || 0}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {item.autonomia || 0} dias
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {item.pontoRessuprimento || 0}
                        </TableCell>
                        <TableCell className="text-center font-medium tabular-nums">
                          {item.diasParaReserva || 0} dias
                        </TableCell>
                        <TableCell className="text-center">
                          <StatusReservaBadge diasParaReserva={item.diasParaReserva || 0} />
                        </TableCell>
                        <TableCell className="text-center">
                          <FinanceiroCell
                            diferenca={diferenca}
                            custoUnitario={item.custoUnitario}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
