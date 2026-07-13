import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Filter, Package, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
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

export const Route = createFileRoute("/estoque-fisico-btp")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Estoque Físico X BTP — Estrategic Field" },
      {
        name: "description",
        content: "Protótipo de divergência entre estoque físico, campo e BTP.",
      },
    ],
  }),
  component: EstoqueFisicoBtpPage,
});

const ITENS_CRITICOS_INICIAIS = [
  "22026219",
  "22026223",
  "22026189",
  "22061736",
  "22065513",
] as const;

type LinhaMockEstoque = {
  codigo: string;
  descricao: string;
  estoqueBTP: number;
  estoqueFisico: number;
  estoqueCampo: number;
  estoqueFisicoCampo: number;
  diferenca: number;
  custoUnitario: number;
  financeiro: number;
};

type SortColumn =
  | "descricao"
  | "custoUnitario"
  | "estoqueBTP"
  | "estoqueFisicoCampo"
  | "estoqueFisico"
  | "estoqueCampo"
  | "diferenca"
  | "financeiro"
  | "status";

type SortDirection = "asc" | "desc";

type ModalView = "selecao" | "definicao";

type FiltroStatus = "Todos" | "Falta Físico" | "Sobra Físico" | "Neutro";

const FILTRO_STATUS_OPCOES: FiltroStatus[] = ["Todos", "Falta Físico", "Sobra Físico", "Neutro"];

function statusLabel(diferenca: number): string {
  if (diferenca === 0) return "Neutro";
  if (diferenca < 0) return "Falta Físico";
  return "Sobra Físico";
}

function StatusBadge({ diferenca }: { diferenca: number }) {
  if (diferenca === 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-yellow-100 px-2 py-1 text-xs font-semibold text-yellow-800">
        Neutro
      </span>
    );
  }
  if (diferenca < 0) {
    return (
      <span className="whitespace-nowrap rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
        Falta Físico
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
      Sobra Físico
    </span>
  );
}

/** ~70% das linhas com (Físico + Campo) < BTP para favorecer status Falta (diferença negativa). */
function gerarQuantidadesMock(): Omit<LinhaMockEstoque, "codigo" | "descricao"> {
  const estoqueBTP = Math.floor(Math.random() * 40) + 10; // 10–49

  let estoqueFisico: number;
  let estoqueCampo: number;

  if (Math.random() < 0.7) {
    const somaMax = Math.max(0, estoqueBTP - 1);
    const soma = Math.floor(Math.random() * (somaMax + 1));
    estoqueFisico = Math.floor(Math.random() * (soma + 1));
    estoqueCampo = soma - estoqueFisico;
  } else {
    estoqueFisico = Math.floor(Math.random() * 50);
    estoqueCampo = Math.floor(Math.random() * 50);
  }

  const estoqueFisicoCampo = estoqueFisico + estoqueCampo;
  const diferenca = estoqueFisicoCampo - estoqueBTP;
  // Custo unitário fictício entre R$ 10 e R$ 99
  const custoUnitario = Math.floor(Math.random() * 90) + 10;
  // Impacto: Falta (diff < 0) negativo; Sobra (diff > 0) positivo
  const financeiro = diferenca * custoUnitario;

  return {
    estoqueBTP,
    estoqueFisico,
    estoqueCampo,
    estoqueFisicoCampo,
    diferenca,
    custoUnitario,
    financeiro,
  };
}

function formatMoedaBr(valor: number): string {
  return Math.abs(valor).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function custoSeguro(custoUnitario: number): number {
  return Number.isFinite(custoUnitario) && custoUnitario > 0 ? custoUnitario : 10;
}

/** Impacto financeiro assinado: Falta subtrai, Sobra soma. */
function impactoFinanceiro(diferenca: number, custoUnitario: number): number {
  return diferenca * custoSeguro(custoUnitario);
}

function FinanceiroCell({
  diferenca,
  custoUnitario,
}: {
  diferenca: number;
  custoUnitario: number;
}) {
  const valorFinanceiro = Math.abs(diferenca * custoSeguro(custoUnitario));

  // Falta (diferença < 0) → prejuízo
  if (diferenca < 0) {
    return (
      <span className="whitespace-nowrap font-bold tabular-nums text-red-600">
        -R$ {formatMoedaBr(valorFinanceiro)}
      </span>
    );
  }
  // Sobra (diferença > 0) → crédito
  if (diferenca > 0) {
    return (
      <span className="whitespace-nowrap font-bold tabular-nums text-green-600">
        R$ {formatMoedaBr(valorFinanceiro)}
      </span>
    );
  }
  return (
    <span className="whitespace-nowrap font-bold tabular-nums text-green-600">R$ 0,00</span>
  );
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
    <TableHead className={cn(align === "left" ? "text-left" : "text-center", className)}>
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-center gap-1 font-medium hover:text-foreground",
          align === "left" ? "justify-start" : "justify-center",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(column)}
      >
        <span className={align === "center" ? "text-center leading-tight" : undefined}>
          {label}
        </span>
        {active ? (
          direction === "asc" ? (
            <ArrowUp className="h-3.5 w-3.5 shrink-0" />
          ) : (
            <ArrowDown className="h-3.5 w-3.5 shrink-0" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

function Chip({
  codigo,
  descricao,
  onRemove,
}: {
  codigo: string;
  descricao?: string;
  onRemove: () => void;
}) {
  return (
    <span className="inline-flex max-w-full items-center gap-1 rounded-full border border-border bg-muted/60 px-2 py-0.5 text-xs">
      <span className="truncate font-mono">{codigo}</span>
      {descricao ? (
        <span className="hidden max-w-[8rem] truncate text-muted-foreground sm:inline">
          {descricao}
        </span>
      ) : null}
      <button
        type="button"
        aria-label={`Remover ${codigo}`}
        className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }}
      >
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function EstoqueFisicoBtpPage() {
  const [linhas, setLinhas] = useState<LinhaMockEstoque[]>([]);
  const [busca, setBusca] = useState("");
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const [itensSelecionados, setItensSelecionados] = useState<string[]>([]);
  const [itensCriticos, setItensCriticos] = useState<string[]>([...ITENS_CRITICOS_INICIAIS]);
  const [isModalAberto, setIsModalAberto] = useState(false);
  const [viewAtual, setViewAtual] = useState<ModalView>("selecao");
  const [buscaPopover, setBuscaPopover] = useState("");
  const [buscaCriticos, setBuscaCriticos] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("Todos");

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

        const mock: LinhaMockEstoque[] = materiais.map((m) => {
          const qtds = gerarQuantidadesMock();
          return {
            codigo: m.material,
            descricao: m.descr_material,
            ...qtds,
          };
        });

        setLinhas(mock);
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

  const labelsPorCodigo = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of linhas) map.set(row.codigo, row.descricao);
    return map;
  }, [linhas]);

  const opcoesSelecao = useMemo(() => {
    const termo = buscaPopover.trim().toLowerCase();
    const selecionados = new Set(itensSelecionados);
    return linhas
      .filter((row) => !selecionados.has(row.codigo))
      .filter((row) => {
        if (!termo) return true;
        return (
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo)
        );
      })
      .slice(0, 40);
  }, [linhas, buscaPopover, itensSelecionados]);

  const opcoesCriticos = useMemo(() => {
    const termo = buscaCriticos.trim().toLowerCase();
    const criticos = new Set(itensCriticos);
    return linhas
      .filter((row) => !criticos.has(row.codigo))
      .filter((row) => {
        if (!termo) return true;
        return (
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo)
        );
      })
      .slice(0, 40);
  }, [linhas, buscaCriticos, itensCriticos]);

  const linhasFiltradas = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    const filtradas = linhas.filter((row) => {
      if (termo) {
        const matchTexto =
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo);
        if (!matchTexto) return false;
      }
      if (itensSelecionados.length > 0 && !itensSelecionados.includes(row.codigo)) {
        return false;
      }
      if (filtroStatus === "Falta Físico" && !(row.diferenca < 0)) return false;
      if (filtroStatus === "Sobra Físico" && !(row.diferenca > 0)) return false;
      if (filtroStatus === "Neutro" && row.diferenca !== 0) return false;
      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      switch (sortColumn) {
        case "descricao":
          return a.descricao.localeCompare(b.descricao, "pt-BR") * dir;
        case "custoUnitario":
          return (custoSeguro(a.custoUnitario) - custoSeguro(b.custoUnitario)) * dir;
        case "status":
          return statusLabel(a.diferenca).localeCompare(statusLabel(b.diferenca), "pt-BR") * dir;
        case "estoqueBTP":
          return (a.estoqueBTP - b.estoqueBTP) * dir;
        case "estoqueFisicoCampo":
          return (a.estoqueFisicoCampo - b.estoqueFisicoCampo) * dir;
        case "estoqueFisico":
          return (a.estoqueFisico - b.estoqueFisico) * dir;
        case "estoqueCampo":
          return (a.estoqueCampo - b.estoqueCampo) * dir;
        case "diferenca":
          return (a.diferenca - b.diferenca) * dir;
        case "financeiro":
          return (
            (impactoFinanceiro(a.diferenca, a.custoUnitario) -
              impactoFinanceiro(b.diferenca, b.custoUnitario)) *
            dir
          );
        default:
          return 0;
      }
    });
  }, [linhas, busca, itensSelecionados, filtroStatus, sortColumn, sortDirection]);

  const valorEsperadoBtp = useMemo(() => {
    return linhasFiltradas.reduce(
      (acc, row) => acc + row.estoqueBTP * custoSeguro(row.custoUnitario),
      0,
    );
  }, [linhasFiltradas]);

  const valorFisicoReal = useMemo(() => {
    return linhasFiltradas.reduce(
      (acc, row) =>
        acc + (row.estoqueFisico + row.estoqueCampo) * custoSeguro(row.custoUnitario),
      0,
    );
  }, [linhasFiltradas]);

  const saldoDivergencia = useMemo(() => {
    return linhasFiltradas.reduce(
      (acc, row) => acc + impactoFinanceiro(row.diferenca, row.custoUnitario),
      0,
    );
  }, [linhasFiltradas]);

  const temFiltroAtivo =
    busca.trim().length > 0 || itensSelecionados.length > 0 || filtroStatus !== "Todos";

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
    setItensSelecionados([]);
    setFiltroStatus("Todos");
  };

  const adicionarItemSelecionado = (codigo: string) => {
    setItensSelecionados((prev) => (prev.includes(codigo) ? prev : [...prev, codigo]));
    setBuscaPopover("");
  };

  const removerItemSelecionado = (codigo: string) => {
    setItensSelecionados((prev) => prev.filter((c) => c !== codigo));
  };

  const adicionarItemCritico = (codigo: string) => {
    setItensCriticos((prev) => (prev.includes(codigo) ? prev : [...prev, codigo]));
    setBuscaCriticos("");
  };

  const removerItemCritico = (codigo: string) => {
    setItensCriticos((prev) => prev.filter((c) => c !== codigo));
  };

  const handleModalOpenChange = (open: boolean) => {
    setIsModalAberto(open);
    if (!open) {
      setViewAtual("selecao");
      setBuscaPopover("");
      setBuscaCriticos("");
    }
  };

  const fecharModal = () => handleModalOpenChange(false);

  let modalBody: ReactNode;

  if (viewAtual === "definicao") {
    modalBody = (
      <>
        <div className="shrink-0 border-b bg-white px-4 py-3">
          <div className="pr-6">
            <DialogTitle className="text-sm font-semibold text-foreground">
              Definir itens críticos
            </DialogTitle>
            <DialogDescription className="text-[11px] text-muted-foreground">
              Gerencie a lista salva usada pelo atalho de seleção.
            </DialogDescription>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="flex flex-col gap-4">
            {itensCriticos.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {itensCriticos.map((codigo) => (
                  <Chip
                    key={codigo}
                    codigo={codigo}
                    descricao={labelsPorCodigo.get(codigo)}
                    onRemove={() => removerItemCritico(codigo)}
                  />
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">Nenhum item crítico na lista.</p>
            )}

            <Input
              type="search"
              placeholder="Procure por nome ou código os itens..."
              value={buscaCriticos}
              onChange={(e) => setBuscaCriticos(e.target.value)}
              className="h-9 bg-white"
            />

            <div className="rounded-md border border-border">
              {opcoesCriticos.length === 0 ? (
                <p className="px-3 py-4 text-center text-xs text-muted-foreground">
                  Nenhum material encontrado.
                </p>
              ) : (
                <ul className="divide-y divide-border">
                  {opcoesCriticos.map((row) => (
                    <li key={row.codigo}>
                      <button
                        type="button"
                        className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                        onClick={() => adicionarItemCritico(row.codigo)}
                      >
                        <span className="font-mono text-xs text-muted-foreground">{row.codigo}</span>
                        <span className="line-clamp-1">{row.descricao}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 space-y-2 border-t bg-white p-4">
          <Button
            type="button"
            variant="destructive"
            size="sm"
            className="w-full"
            onClick={() => setItensCriticos([])}
          >
            Limpar todos os itens
          </Button>
          <Button
            type="button"
            variant="default"
            size="sm"
            className="w-full"
            onClick={() => {
              setViewAtual("selecao");
              setBuscaCriticos("");
            }}
          >
            Salvar/Voltar
          </Button>
        </div>
      </>
    );
  } else {
    modalBody = (
      <>
        <div className="shrink-0 space-y-3 border-b bg-white px-4 py-3">
          <DialogTitle className="pr-6 text-sm font-semibold text-foreground">
            Selecionar itens
          </DialogTitle>
          <DialogDescription className="sr-only">
            Filtre a tabela por materiais específicos ou itens críticos.
          </DialogDescription>
          <Input
            type="search"
            placeholder="Procure por nome ou código os itens..."
            value={buscaPopover}
            onChange={(e) => setBuscaPopover(e.target.value)}
            className="h-9 bg-white"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {itensSelecionados.length > 0 ? (
            <div className="flex flex-wrap gap-1.5 border-b border-border px-4 py-3">
              {itensSelecionados.map((codigo) => (
                <Chip
                  key={codigo}
                  codigo={codigo}
                  onRemove={() => removerItemSelecionado(codigo)}
                />
              ))}
            </div>
          ) : null}

          {opcoesSelecao.length === 0 ? (
            <p className="px-3 py-4 text-center text-xs text-muted-foreground">
              Nenhum material encontrado.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {opcoesSelecao.map((row) => (
                <li key={row.codigo}>
                  <button
                    type="button"
                    className="flex w-full flex-col gap-0.5 px-3 py-2 text-left text-sm hover:bg-accent"
                    onClick={() => adicionarItemSelecionado(row.codigo)}
                  >
                    <span className="font-mono text-xs text-muted-foreground">{row.codigo}</span>
                    <span className="line-clamp-1">{row.descricao}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t bg-white p-4">
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={itensCriticos.length === 0}
              onClick={() => {
                setItensSelecionados([...itensCriticos]);
                fecharModal();
              }}
            >
              Selecionar itens críticos
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setViewAtual("definicao");
                setBuscaCriticos("");
              }}
            >
              Definir itens críticos
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            {itensCriticos.length > 0
              ? `${itensCriticos.length} item(ns) crítico(s) configurado(s).`
              : "Nenhum item crítico definido."}
          </p>
        </div>
      </>
    );
  }

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto min-h-[80vh] max-w-7xl px-5 pb-10 pt-6">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>

        <div className="mb-6 flex items-center justify-between gap-4">
          <header>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Package className="h-6 w-6 text-primary" />
              Estoque Físico X BTP
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">(Esse modulo é um protótipo)</p>
          </header>

          <div className="flex flex-wrap items-center gap-4">
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Valor Esperado (BTP)
              </span>
              <span className="text-xl font-bold text-gray-800">
                R$ {formatMoedaBr(valorEsperadoBtp)}
              </span>
            </div>
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Valor Físico Real
              </span>
              <span className="text-xl font-bold text-gray-800">
                R$ {formatMoedaBr(valorFisicoReal)}
              </span>
            </div>
            <div className="flex min-w-[200px] flex-col items-center justify-center rounded-lg border border-gray-100 bg-white p-4 shadow">
              <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
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
              className="rounded-md border border-input bg-background px-3 py-2 pr-9"
            />
            {temFiltroAtivo ? (
              <button
                type="button"
                aria-label="Limpar filtro"
                title="Limpar filtro"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
                onClick={limparFiltros}
              >
                <X className="h-4 w-4" />
              </button>
            ) : null}
          </div>

          <select
            aria-label="Status: Todos"
            value={filtroStatus}
            onChange={(e) => setFiltroStatus(e.target.value as FiltroStatus)}
            className="h-9 shrink-0 rounded-md border border-input bg-background px-3 text-sm shadow-sm outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {FILTRO_STATUS_OPCOES.map((opcao) => (
              <option key={opcao} value={opcao}>
                {opcao === "Todos" ? "Status: Todos" : opcao}
              </option>
            ))}
          </select>

          <Button
            type="button"
            variant="outline"
            className="shrink-0"
            onClick={() => setIsModalAberto(true)}
          >
            <Filter className="h-4 w-4" />
            Selecionar itens
            {itensSelecionados.length > 0 ? (
              <span className="ml-1 rounded-full bg-primary/10 px-1.5 py-0.5 text-xs font-semibold text-primary">
                {itensSelecionados.length}
              </span>
            ) : null}
          </Button>

          <Dialog open={isModalAberto} onOpenChange={handleModalOpenChange}>
            <DialogContent
              className={cn(
                "flex max-h-[min(85vh,720px)] w-[min(100vw-2rem,28rem)] flex-col gap-0 overflow-hidden p-0 sm:rounded-lg",
                "[&>button]:right-3 [&>button]:top-3",
              )}
            >
              {modalBody}
            </DialogContent>
          </Dialog>

          {temFiltroAtivo ? (
            <Button type="button" variant="ghost" size="sm" onClick={limparFiltros}>
              Limpar filtro
            </Button>
          ) : null}
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
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-left">Código</TableHead>
                  <SortableHead
                    label="Descrição"
                    column="descricao"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                    align="left"
                  />
                  <SortableHead
                    label="Valor unit."
                    column="custoUnitario"
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
                    label={
                      <>
                        Estoque
                        <br />
                        <span className="text-sm font-normal">(Físico + Campo)</span>
                      </>
                    }
                    column="estoqueFisicoCampo"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                    align="center"
                    className="text-center"
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
                    label="Diferença"
                    column="diferenca"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Status"
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
                    <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                      Nenhum material corresponde aos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhasFiltradas.map((row) => (
                    <TableRow key={row.codigo}>
                      <TableCell className="text-left font-mono text-sm">{row.codigo}</TableCell>
                      <TableCell className="text-left">{row.descricao}</TableCell>
                      <TableCell className="whitespace-nowrap text-center tabular-nums">
                        R$ {formatMoedaBr(custoSeguro(row.custoUnitario))}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.estoqueBTP}</TableCell>
                      <TableCell className="text-center tabular-nums">
                        {row.estoqueFisico + row.estoqueCampo}
                      </TableCell>
                      <TableCell className="text-center tabular-nums">{row.estoqueFisico}</TableCell>
                      <TableCell className="text-center tabular-nums">{row.estoqueCampo}</TableCell>
                      <TableCell className="text-center font-medium tabular-nums">
                        {row.diferenca}
                      </TableCell>
                      <TableCell className="text-center">
                        <StatusBadge diferenca={row.diferenca} />
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-center">
                        <FinanceiroCell
                          diferenca={row.diferenca}
                          custoUnitario={row.custoUnitario}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
