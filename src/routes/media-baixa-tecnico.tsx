import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ArrowDown, ArrowLeft, ArrowUp, Check, ChevronsUpDown, Filter, TrendingUp, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MediaBaixaTecnicoItem } from "@/lib/logistica-types";
import { formatQuantidade } from "@/lib/parse-locale-number";
import { fetchTecnicos, type TecnicoProfile } from "@/lib/team-service";
import { formatTecnicoLabel } from "@/lib/tecnico-label";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/media-baixa-tecnico")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Média de Baixa por Técnico — Estrategic Field" },
      {
        name: "description",
        content: "Protótipo de consumo, estoque e reabastecimento por técnico.",
      },
    ],
  }),
  component: MediaBaixaTecnicoPage,
});

const MESES = [
  { value: "1", label: "Janeiro" },
  { value: "2", label: "Fevereiro" },
  { value: "3", label: "Março" },
  { value: "4", label: "Abril" },
  { value: "5", label: "Maio" },
  { value: "6", label: "Junho" },
  { value: "7", label: "Julho" },
  { value: "8", label: "Agosto" },
  { value: "9", label: "Setembro" },
  { value: "10", label: "Outubro" },
  { value: "11", label: "Novembro" },
  { value: "12", label: "Dezembro" },
] as const;

const LIMITE_AUTONOMIA_DIAS = 7;
const MATERIAIS_POR_TECNICO = 10;

const ITENS_CRITICOS_INICIAIS = [
  "22026219",
  "22026223",
  "22026189",
  "22061736",
  "22065513",
] as const;

type ModalView = "selecao" | "definicao";

type FiltroStatus = "Todos" | "Válido" | "Inválido";

const FILTRO_STATUS_OPCOES: FiltroStatus[] = ["Todos", "Válido", "Inválido"];

type SortColumn =
  | "idTecnico"
  | "tecnico"
  | "material"
  | "descricao"
  | "estoque"
  | "media"
  | "autonomia"
  | "reabastecimento";

type SortDirection = "asc" | "desc";

type FiltroPeriodo = { mes: number; ano: number };

function mesAtual(): FiltroPeriodo {
  const agora = new Date();
  return { mes: agora.getMonth() + 1, ano: agora.getFullYear() };
}

/** Últimos 12 meses a partir do mês atual (mais recente primeiro). */
function gerarPeriodosMock(): FiltroPeriodo[] {
  const lista: FiltroPeriodo[] = [];
  const base = new Date();
  for (let i = 0; i < 12; i++) {
    const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
    lista.push({ mes: d.getMonth() + 1, ano: d.getFullYear() });
  }
  return lista;
}

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function gerarLinhasMock(
  tecnicos: TecnicoProfile[],
  materiais: { material: string; descr_material: string }[],
): MediaBaixaTecnicoItem[] {
  if (tecnicos.length === 0 || materiais.length === 0) return [];

  const linhas: MediaBaixaTecnicoItem[] = [];
  const pool = materiais.slice(0, Math.max(MATERIAIS_POR_TECNICO * 3, 30));

  for (const tecnico of tecnicos) {
    // idTOA real do colaborador (profiles.identificacao)
    const idToa = (tecnico.identificacao ?? "").trim();
    if (!idToa) continue;

    const offset = randInt(0, Math.max(pool.length - 1, 0));
    for (let i = 0; i < MATERIAIS_POR_TECNICO; i++) {
      const mat = pool[(offset + i) % pool.length]!;
      const estoque_tecnico = randInt(0, 50);
      const media_consumo = randInt(0, 10);
      const autonomia_dias =
        media_consumo > 0 ? Math.floor(estoque_tecnico / media_consumo) : 999;

      linhas.push({
        id_tecnico: idToa,
        nome_tecnico: tecnico.nome?.trim() || idToa,
        material: mat.material,
        descr_material: mat.descr_material,
        estoque_tecnico,
        media_consumo,
        autonomia_dias,
      });
    }
  }

  return linhas.sort((a, b) =>
    tecnicoSortKey(a).localeCompare(tecnicoSortKey(b), "pt-BR"),
  );
}

function tecnicoSortKey(row: MediaBaixaTecnicoItem): string {
  const nome = row.nome_tecnico.trim();
  return nome && nome !== "—" ? nome : row.id_tecnico;
}

function autonomiaValor(row: MediaBaixaTecnicoItem): number {
  if (row.autonomia_dias !== null && Number.isFinite(row.autonomia_dias)) {
    return row.autonomia_dias;
  }
  if (row.media_consumo > 0) {
    return Math.floor(row.estoque_tecnico / row.media_consumo);
  }
  return 999;
}

function isReabastecimentoValido(row: MediaBaixaTecnicoItem): boolean {
  const mediaAtiva = row.media_consumo > 0;
  const autonomia = autonomiaValor(row);
  if (mediaAtiva && row.estoque_tecnico <= 0) return true;
  if (mediaAtiva && autonomia <= LIMITE_AUTONOMIA_DIAS) return true;
  return false;
}

function ReabastecimentoBadge({ row }: { row: MediaBaixaTecnicoItem }) {
  if (isReabastecimentoValido(row)) {
    return (
      <span className="rounded-full bg-green-100 px-2 py-1 text-xs font-semibold text-green-800">
        Válido
      </span>
    );
  }
  return (
    <span className="rounded-full bg-red-100 px-2 py-1 text-xs font-semibold text-red-800">
      Inválido
    </span>
  );
}

function SortableHead({
  label,
  column,
  activeColumn,
  direction,
  onSort,
}: {
  label: ReactNode;
  column: SortColumn;
  activeColumn: SortColumn;
  direction: SortDirection;
  onSort: (column: SortColumn) => void;
}) {
  const active = activeColumn === column;
  return (
    <TableHead className="text-center">
      <button
        type="button"
        className={cn(
          "inline-flex w-full items-center justify-center gap-1 font-medium hover:text-foreground",
          active ? "text-foreground" : "text-muted-foreground",
        )}
        onClick={() => onSort(column)}
      >
        <span className="text-center leading-tight">{label}</span>
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

function MediaBaixaTecnicoPage() {
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [materiaisBase, setMateriaisBase] = useState<
    { material: string; descr_material: string }[]
  >([]);
  const [linhas, setLinhas] = useState<MediaBaixaTecnicoItem[]>([]);
  const [baseReady, setBaseReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [tecnicoFiltro, setTecnicoFiltro] = useState<string>("todos");
  const [tecnicoPopoverOpen, setTecnicoPopoverOpen] = useState(false);
  const [buscaTecnico, setBuscaTecnico] = useState("");
  const [filtro, setFiltro] = useState<FiltroPeriodo>(mesAtual);
  const [sortColumn, setSortColumn] = useState<SortColumn>("tecnico");
  const [sortDirection, setSortDirection] = useState<SortDirection>("asc");

  const [itensSelecionados, setItensSelecionados] = useState<string[]>([]);
  const [itensCriticos, setItensCriticos] = useState<string[]>([...ITENS_CRITICOS_INICIAIS]);
  const [isModalAberto, setIsModalAberto] = useState(false);
  const [viewAtual, setViewAtual] = useState<ModalView>("selecao");
  const [buscaPopover, setBuscaPopover] = useState("");
  const [buscaCriticos, setBuscaCriticos] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<FiltroStatus>("Todos");

  const periodos = useMemo(() => gerarPeriodosMock(), []);

  useEffect(() => {
    let cancelled = false;

    async function carregarBase() {
      setLoading(true);
      setErro(null);
      try {
        const [listaTecnicos, materiais] = await Promise.all([
          fetchTecnicos(),
          fetchDimMateriais(),
        ]);
        if (cancelled) return;
        setTecnicos(listaTecnicos);
        setMateriaisBase(
          materiais.map((m) => ({
            material: m.material,
            descr_material: m.descr_material,
          })),
        );
        setBaseReady(true);
      } catch (e) {
        if (!cancelled) {
          setErro(e instanceof Error ? e.message : "Falha ao carregar dados base do protótipo.");
          setTecnicos([]);
          setMateriaisBase([]);
          setLinhas([]);
          setBaseReady(false);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void carregarBase();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!baseReady) return;
    setLinhas(gerarLinhasMock(tecnicos, materiaisBase));
  }, [baseReady, tecnicos, materiaisBase, filtro.mes, filtro.ano]);

  const catalogoMateriais = useMemo(
    () =>
      materiaisBase.map((m) => ({
        codigo: m.material,
        descricao: m.descr_material,
      })),
    [materiaisBase],
  );

  const labelsPorCodigo = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of catalogoMateriais) map.set(row.codigo, row.descricao);
    return map;
  }, [catalogoMateriais]);

  const opcoesSelecao = useMemo(() => {
    const termo = buscaPopover.trim().toLowerCase();
    const selecionados = new Set(itensSelecionados);
    return catalogoMateriais
      .filter((row) => !selecionados.has(row.codigo))
      .filter((row) => {
        if (!termo) return true;
        return (
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo)
        );
      })
      .slice(0, 40);
  }, [catalogoMateriais, buscaPopover, itensSelecionados]);

  const opcoesCriticos = useMemo(() => {
    const termo = buscaCriticos.trim().toLowerCase();
    const criticos = new Set(itensCriticos);
    return catalogoMateriais
      .filter((row) => !criticos.has(row.codigo))
      .filter((row) => {
        if (!termo) return true;
        return (
          row.codigo.toLowerCase().includes(termo) ||
          row.descricao.toLowerCase().includes(termo)
        );
      })
      .slice(0, 40);
  }, [catalogoMateriais, buscaCriticos, itensCriticos]);

  const anosComDados = useMemo(
    () => [...new Set(periodos.map((p) => p.ano))].sort((a, b) => b - a),
    [periodos],
  );

  const mesesDoAnoSelecionado = useMemo(() => {
    return periodos
      .filter((p) => p.ano === filtro.ano)
      .map((p) => p.mes)
      .sort((a, b) => a - b);
  }, [periodos, filtro.ano]);

  const tecnicoSelecionadoLabel = useMemo(() => {
    if (tecnicoFiltro === "todos") return "Todos os técnicos";
    const t = tecnicos.find(
      (tec) => (tec.identificacao ?? "").trim().toUpperCase() === tecnicoFiltro.trim().toUpperCase(),
    );
    if (!t) return tecnicoFiltro;
    return formatTecnicoLabel(t.nome, (t.identificacao ?? "").trim() || tecnicoFiltro);
  }, [tecnicoFiltro, tecnicos]);

  const tecnicosFiltrados = useMemo(() => {
    const termo = buscaTecnico.trim().toLowerCase();
    return tecnicos.filter((t) => {
      const id = (t.identificacao ?? "").trim();
      if (!id) return false;
      if (!termo) return true;
      const nome = (t.nome ?? "").toLowerCase();
      return nome.includes(termo) || id.toLowerCase().includes(termo);
    });
  }, [tecnicos, buscaTecnico]);

  const linhasFiltradas = useMemo(() => {
    const filtradas = linhas.filter((row) => {
      if (tecnicoFiltro !== "todos") {
        if (row.id_tecnico.trim().toUpperCase() !== tecnicoFiltro.trim().toUpperCase()) {
          return false;
        }
      }
      if (itensSelecionados.length > 0 && !itensSelecionados.includes(row.material)) {
        return false;
      }
      if (filtroStatus === "Válido" && !isReabastecimentoValido(row)) return false;
      if (filtroStatus === "Inválido" && isReabastecimentoValido(row)) return false;
      return true;
    });

    const dir = sortDirection === "asc" ? 1 : -1;
    return [...filtradas].sort((a, b) => {
      switch (sortColumn) {
        case "idTecnico":
          return a.id_tecnico.localeCompare(b.id_tecnico, "pt-BR", { numeric: true }) * dir;
        case "tecnico":
          return tecnicoSortKey(a).localeCompare(tecnicoSortKey(b), "pt-BR") * dir;
        case "material":
          return a.material.localeCompare(b.material, "pt-BR") * dir;
        case "descricao":
          return a.descr_material.localeCompare(b.descr_material, "pt-BR") * dir;
        case "estoque":
          return (Number(a.estoque_tecnico) - Number(b.estoque_tecnico)) * dir;
        case "media":
          return (Number(a.media_consumo) - Number(b.media_consumo)) * dir;
        case "autonomia":
          return (autonomiaValor(a) - autonomiaValor(b)) * dir;
        case "reabastecimento": {
          const va = isReabastecimentoValido(a) ? 0 : 1;
          const vb = isReabastecimentoValido(b) ? 0 : 1;
          return (va - vb) * dir;
        }
        default:
          return 0;
      }
    });
  }, [linhas, itensSelecionados, tecnicoFiltro, filtroStatus, sortColumn, sortDirection]);

  const temFiltroAtivo =
    tecnicoFiltro !== "todos" ||
    itensSelecionados.length > 0 ||
    filtroStatus !== "Todos";

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  const limparFiltros = () => {
    setItensSelecionados([]);
    setTecnicoFiltro("todos");
    setBuscaTecnico("");
    setTecnicoPopoverOpen(false);
    setFiltroStatus("Todos");
    setFiltro(mesAtual());
    setSortColumn("tecnico");
    setSortDirection("asc");
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

        <header className="mb-6">
          <h1 className="flex items-center justify-center gap-2 text-2xl font-black tracking-tight sm:justify-start">
            <TrendingUp className="h-6 w-6 text-primary" />
            Média de Baixa por Técnico
          </h1>
          <p className="mt-1 text-center text-sm text-gray-500 sm:text-left">
            (Esse modulo é um protótipo)
          </p>
        </header>

        <div className="mb-6 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-tecnico">Filtrar por Técnico</Label>
            <Popover
              open={tecnicoPopoverOpen}
              onOpenChange={(open) => {
                setTecnicoPopoverOpen(open);
                if (!open) setBuscaTecnico("");
              }}
            >
              <PopoverTrigger asChild>
                <Button
                  id="filtro-tecnico"
                  type="button"
                  variant="outline"
                  role="combobox"
                  aria-expanded={tecnicoPopoverOpen}
                  className="h-9 w-[240px] justify-between font-normal"
                >
                  <span className="truncate">{tecnicoSelecionadoLabel}</span>
                  <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-[240px] p-0" align="start">
                <div className="border-b p-2">
                  <Input
                    type="search"
                    placeholder="Buscar nome ou ID..."
                    value={buscaTecnico}
                    onChange={(e) => setBuscaTecnico(e.target.value)}
                    className="h-8"
                    autoFocus
                  />
                </div>
                <ul className="max-h-[300px] overflow-y-auto py-1">
                  <li>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                        tecnicoFiltro === "todos" && "bg-accent",
                      )}
                      onClick={() => {
                        setTecnicoFiltro("todos");
                        setTecnicoPopoverOpen(false);
                        setBuscaTecnico("");
                      }}
                    >
                      <Check
                        className={cn(
                          "h-4 w-4 shrink-0",
                          tecnicoFiltro === "todos" ? "opacity-100" : "opacity-0",
                        )}
                      />
                      Todos os técnicos
                    </button>
                  </li>
                  {tecnicosFiltrados.length === 0 ? (
                    <li className="px-3 py-4 text-center text-xs text-muted-foreground">
                      Nenhum técnico encontrado.
                    </li>
                  ) : (
                    tecnicosFiltrados.map((t) => {
                      const id = (t.identificacao ?? "").trim();
                      const selecionado =
                        tecnicoFiltro.trim().toUpperCase() === id.toUpperCase();
                      return (
                        <li key={t.id}>
                          <button
                            type="button"
                            className={cn(
                              "flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent",
                              selecionado && "bg-accent",
                            )}
                            onClick={() => {
                              setTecnicoFiltro(id);
                              setTecnicoPopoverOpen(false);
                              setBuscaTecnico("");
                            }}
                          >
                            <Check
                              className={cn(
                                "h-4 w-4 shrink-0",
                                selecionado ? "opacity-100" : "opacity-0",
                              )}
                            />
                            <span className="min-w-0 flex-1 truncate">
                              {formatTecnicoLabel(t.nome, id)}
                            </span>
                          </button>
                        </li>
                      );
                    })
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-mes">Mês</Label>
            <Select
              value={String(filtro.mes)}
              onValueChange={(v) => setFiltro((prev) => ({ ...prev, mes: Number(v) }))}
            >
              <SelectTrigger id="filtro-mes" className="h-9 w-[160px]">
                <SelectValue placeholder="Mês" />
              </SelectTrigger>
              <SelectContent>
                {mesesDoAnoSelecionado.map((mes) => {
                  const label = MESES.find((m) => m.value === String(mes))?.label ?? String(mes);
                  return (
                    <SelectItem key={mes} value={String(mes)}>
                      {label}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="filtro-ano">Ano</Label>
            <Select
              value={String(filtro.ano)}
              onValueChange={(v) => {
                const ano = Number(v);
                const meses = periodos
                  .filter((p) => p.ano === ano)
                  .map((p) => p.mes)
                  .sort((a, b) => a - b);
                setFiltro({
                  ano,
                  mes: meses.includes(filtro.mes)
                    ? filtro.mes
                    : (meses[meses.length - 1] ?? filtro.mes),
                });
              }}
            >
              <SelectTrigger id="filtro-ano" className="h-9 w-[120px]">
                <SelectValue placeholder="Ano" />
              </SelectTrigger>
              <SelectContent>
                {anosComDados.map((y) => (
                  <SelectItem key={y} value={String(y)}>
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            className="h-9 shrink-0"
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

          {temFiltroAtivo ? (
            <Button type="button" variant="outline" size="sm" className="h-9" onClick={limparFiltros}>
              Limpar filtros
            </Button>
          ) : null}

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
        </div>

        {loading ? (
          <p className="text-center text-sm text-muted-foreground">Carregando protótipo…</p>
        ) : erro ? (
          <p className="text-center text-sm text-destructive">{erro}</p>
        ) : linhas.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            Nenhum dado mock disponível. Cadastre técnicos e importe o Upload C — Consulta de
            Estoque.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableHead
                    label="ID técnico"
                    column="idTecnico"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Nome técnico"
                    column="tecnico"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Cod material"
                    column="material"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Descrição"
                    column="descricao"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Estoque técnico"
                    column="estoque"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Média de consumo"
                    column="media"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label={
                      <>
                        Autonomia de consumo
                        <br />
                        <span className="text-sm font-normal">(Dias)</span>
                      </>
                    }
                    column="autonomia"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                  <SortableHead
                    label="Reabastecimento"
                    column="reabastecimento"
                    activeColumn={sortColumn}
                    direction={sortDirection}
                    onSort={handleSort}
                  />
                </TableRow>
              </TableHeader>
              <TableBody>
                {linhasFiltradas.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                      Nenhum registro corresponde aos filtros.
                    </TableCell>
                  </TableRow>
                ) : (
                  linhasFiltradas.map((row) => {
                    const autonomia = autonomiaValor(row);
                    return (
                      <TableRow key={`${row.id_tecnico}-${row.material}`}>
                        <TableCell className="text-center font-mono text-sm tabular-nums">
                          {row.id_tecnico}
                        </TableCell>
                        <TableCell className="text-center">
                          {formatTecnicoLabel(row.nome_tecnico, row.id_tecnico)}
                        </TableCell>
                        <TableCell className="text-center font-mono text-sm">
                          {row.material}
                        </TableCell>
                        <TableCell className="text-center">{row.descr_material}</TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatQuantidade(row.estoque_tecnico)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {formatQuantidade(row.media_consumo)}
                        </TableCell>
                        <TableCell className="text-center tabular-nums">
                          {row.media_consumo > 0 ? `${autonomia} dias` : "—"}
                        </TableCell>
                        <TableCell className="text-center">
                          <ReabastecimentoBadge row={row} />
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
