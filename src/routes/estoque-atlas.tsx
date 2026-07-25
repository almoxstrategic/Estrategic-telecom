import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ChevronsUpDown, Eraser, FileSpreadsheet, Map as MapIcon } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { normalizeMatricula } from "@/lib/auth-identificacao";
import { requireAdmin } from "@/lib/auth-guards";
import {
  aggregateEstoqueAtlasContagem,
  formatAtualizacaoAtlas,
  loadEstoqueAtlasSnapshot,
  type EstoqueAtlasContagem,
  type EstoqueAtlasItem,
} from "@/lib/serializados-atlas-store";
import { fetchTecnicos, type TecnicoProfile } from "@/lib/team-service";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/estoque-atlas")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Estoque Atlas — Estrategic Field" },
      {
        name: "description",
        content: "Visão detalhada e agregada do Estoque Atlas importado.",
      },
    ],
  }),
  component: EstoqueAtlasPage,
});

type InnerTab = "estoque-atlas" | "contagem";

const STICKY_HEAD_CLASS =
  "sticky top-0 z-10 bg-card text-center text-muted-foreground shadow-sm";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

/**
 * Cruza ID da planilha (Responsavél) com Gestão de Equipe.
 * Encontrou → "NOME DO TÉCNICO - ID"; senão → ID original.
 */
function formatarResponsavel(
  idBruto: string,
  tecnicosByMatricula: Map<string, TecnicoProfile>,
): string {
  const id = idBruto.trim();
  if (!id || id === "—") return id || "—";
  const key = normalizeMatricula(id);
  const tecnico = tecnicosByMatricula.get(key);
  if (!tecnico?.nome?.trim()) return id;
  return `${tecnico.nome.trim().toUpperCase()} - ${id}`;
}

type MovimentacaoComboboxProps = {
  value: string;
  options: string[];
  tecnicosByMatricula: Map<string, TecnicoProfile>;
  onChange: (value: string) => void;
};

function MovimentacaoCombobox({
  value,
  options,
  tecnicosByMatricula,
  onChange,
}: MovimentacaoComboboxProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((id) => {
      const label = formatarResponsavel(id, tecnicosByMatricula).toLowerCase();
      return label.includes(q) || id.toLowerCase().includes(q);
    });
  }, [options, query, tecnicosByMatricula]);

  const selectedLabel =
    value === "Todos" ? "Todos" : formatarResponsavel(value, tecnicosByMatricula);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span className={cn("truncate", value === "Todos" && "text-muted-foreground")}>
            {value === "Todos" ? "Todos" : selectedLabel}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(100vw-2rem,28rem)] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput
            placeholder="Digite nome ou matrícula…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            <CommandEmpty>Nenhuma opção encontrada.</CommandEmpty>
            <CommandGroup>
              <CommandItem
                value="Todos"
                onSelect={() => {
                  onChange("Todos");
                  setOpen(false);
                  setQuery("");
                }}
              >
                Todos
              </CommandItem>
              {filtered.map((id) => {
                const label = formatarResponsavel(id, tecnicosByMatricula);
                return (
                  <CommandItem
                    key={id}
                    value={`${label} ${id}`}
                    onSelect={() => {
                      onChange(id);
                      setOpen(false);
                      setQuery("");
                    }}
                  >
                    <span className="truncate text-sm">{label}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function EstoqueAtlasPage() {
  const [items, setItems] = useState<EstoqueAtlasItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [tecnicos, setTecnicos] = useState<TecnicoProfile[]>([]);
  const [activeTab, setActiveTab] = useState<InnerTab>("estoque-atlas");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");
  const [filtroMovimentacao, setFiltroMovimentacao] = useState("Todos");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  useEffect(() => {
    const refresh = () => {
      const snapshot = loadEstoqueAtlasSnapshot();
      setItems(snapshot.items);
      setUpdatedAt(snapshot.updatedAt);
    };
    refresh();
    window.addEventListener("estoque-atlas-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("estoque-atlas-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const list = await fetchTecnicos();
        if (!cancelled) setTecnicos(list);
      } catch (err) {
        console.error("[estoque-atlas] falha ao carregar técnicos", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const tecnicosByMatricula = useMemo(() => {
    const map = new Map<string, TecnicoProfile>();
    for (const t of tecnicos) {
      const mat = normalizeMatricula(t.identificacao ?? "");
      if (mat) map.set(mat, t);
    }
    return map;
  }, [tecnicos]);

  const opcoesStatus = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const status = item.estado.trim();
      if (status && status !== "—") set.add(status);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const opcoesMovimentacao = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const id = item.responsavel.trim();
      if (id && id !== "—") set.add(id);
    }
    return [...set].sort((a, b) =>
      formatarResponsavel(a, tecnicosByMatricula).localeCompare(
        formatarResponsavel(b, tecnicosByMatricula),
        "pt-BR",
      ),
    );
  }, [items, tecnicosByMatricula]);

  const filteredItems = useMemo(() => {
    const tipoQ = filtroTipo.trim().toLowerCase();
    const modeloQ = filtroModelo.trim().toLowerCase();
    const serieQ = filtroSerie.trim().toLowerCase();
    return items.filter((item) => {
      if (tipoQ && !item.tipo.toLowerCase().includes(tipoQ)) return false;
      if (modeloQ && !item.modelo.toLowerCase().includes(modeloQ)) return false;
      if (filtroStatus !== "Todos" && item.estado.trim() !== filtroStatus) return false;
      if (serieQ && !item.numeroSerie.toLowerCase().includes(serieQ)) return false;
      if (filtroMovimentacao !== "Todos" && item.responsavel.trim() !== filtroMovimentacao) {
        return false;
      }
      return true;
    });
  }, [items, filtroTipo, filtroModelo, filtroSerie, filtroStatus, filtroMovimentacao]);

  const contagem = useMemo(() => {
    const tipoQ = filtroTipo.trim().toLowerCase();
    const modeloQ = filtroModelo.trim().toLowerCase();
    const base = items.filter((item) => {
      if (tipoQ && !item.tipo.toLowerCase().includes(tipoQ)) return false;
      if (modeloQ && !item.modelo.toLowerCase().includes(modeloQ)) return false;
      return true;
    });
    const aggregated = aggregateEstoqueAtlasContagem(base);
    if (filtroStatus === "Todos") return aggregated;
    return aggregated.filter((row) => row.status === filtroStatus);
  }, [items, filtroTipo, filtroModelo, filtroStatus]);

  const qntItens = activeTab === "estoque-atlas" ? filteredItems.length : contagem.length;
  const ultimaAtualizacaoLabel = formatAtualizacaoAtlas(updatedAt);

  const limparFiltros = () => {
    setFiltroTipo("");
    setFiltroModelo("");
    setFiltroSerie("");
    setFiltroStatus("Todos");
    setFiltroMovimentacao("Todos");
  };

  const handleExportExcel = () => {
    if (activeTab === "estoque-atlas") {
      if (filteredItems.length === 0) {
        toast.error("Nenhum dado filtrado para exportar.");
        return;
      }
      const dadosExcel = filteredItems.map((row) => ({
        Tipo: row.tipo,
        Modelo: row.modelo,
        "Nº Serie": row.numeroSerie,
        Status: row.estado,
        "Última Movimentação": formatarResponsavel(row.responsavel, tecnicosByMatricula),
        "Data Última Alteração": row.dataUltimaAlteracao,
      }));
      const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Estoque Atlas");
      const hoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Relacao_Campo_Estoque_Atlas_${hoje}.xlsx`);
      toast.success(`Excel exportado: ${filteredItems.length} linhas.`);
      return;
    }

    if (contagem.length === 0) {
      toast.error("Nenhum dado filtrado para exportar.");
      return;
    }
    const dadosExcel = contagem.map((row: EstoqueAtlasContagem) => ({
      Tipo: row.tipo,
      Modelo: row.modelo,
      Quantidade: row.quantidade,
      Status: row.status,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contagem");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Relacao_Campo_Contagem_${hoje}.xlsx`);
    toast.success(`Excel exportado: ${contagem.length} linhas.`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <MapIcon className="h-6 w-6 text-primary" />
              Estoque Atlas
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dados do Estoque Atlas importado em Serializados.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        <section className="mb-6 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Filtros
            </h2>
            <button
              type="button"
              onClick={limparFiltros}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline"
            >
              <Eraser className="h-3.5 w-3.5" />
              Limpar filtros
            </button>
          </div>
          {activeTab === "estoque-atlas" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3 lg:grid-cols-5">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-tipo">Tipo</Label>
                <Input
                  id="filtro-tipo"
                  placeholder="Buscar por Tipo…"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-modelo">Modelo</Label>
                <Input
                  id="filtro-modelo"
                  placeholder="Buscar por Modelo…"
                  value={filtroModelo}
                  onChange={(e) => setFiltroModelo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-status-atlas">Status</Label>
                <select
                  id="filtro-status-atlas"
                  className={SELECT_CLASS}
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="Todos">Todos</option>
                  {opcoesStatus.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-serie">Nº Serie</Label>
                <Input
                  id="filtro-serie"
                  placeholder="Buscar por Nº Serie…"
                  value={filtroSerie}
                  onChange={(e) => setFiltroSerie(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Última movimentação</Label>
                <MovimentacaoCombobox
                  value={filtroMovimentacao}
                  options={opcoesMovimentacao}
                  tecnicosByMatricula={tecnicosByMatricula}
                  onChange={setFiltroMovimentacao}
                />
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-tipo-contagem">Tipo</Label>
                <Input
                  id="filtro-tipo-contagem"
                  placeholder="Buscar por Tipo…"
                  value={filtroTipo}
                  onChange={(e) => setFiltroTipo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-modelo-contagem">Modelo</Label>
                <Input
                  id="filtro-modelo-contagem"
                  placeholder="Buscar por Modelo…"
                  value={filtroModelo}
                  onChange={(e) => setFiltroModelo(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-status">Status</Label>
                <select
                  id="filtro-status"
                  className={SELECT_CLASS}
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value)}
                >
                  <option value="Todos">Todos</option>
                  {opcoesStatus.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 pt-2 pb-0">
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setActiveTab("estoque-atlas")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === "estoque-atlas"
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Estoque Atlas
              </button>
              <button
                type="button"
                onClick={() => setActiveTab("contagem")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === "contagem"
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Contagem Estoque atlas
              </button>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3 pb-2">
              <span className="text-xs font-medium text-muted-foreground">
                última atualização: {ultimaAtualizacaoLabel} ; Qnt de itens: {qntItens}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                disabled={items.length === 0 || qntItens === 0}
                onClick={handleExportExcel}
              >
                <FileSpreadsheet className="h-4 w-4" />
                Exportar Excel
              </Button>
            </div>
          </div>

          <div className="p-4">
            {items.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum dado importado. Importe a planilha{" "}
                <Link to="/admin/importacao" className="font-semibold text-primary hover:underline">
                  Estoque Atlas
                </Link>{" "}
                em Importação → Serializados.
              </p>
            ) : activeTab === "estoque-atlas" ? (
              <div className="relative max-h-[500px] overflow-y-auto rounded-md border border-border">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={STICKY_HEAD_CLASS}>Tipo</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Modelo</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Nº Serie</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Status</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Última Movimentação</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Data Última Alteração</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde aos filtros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((row, idx) => (
                        <TableRow key={`${row.numeroSerie}-${idx}`}>
                          <TableCell className="text-center text-sm">{row.tipo}</TableCell>
                          <TableCell className="text-center text-sm">{row.modelo}</TableCell>
                          <TableCell className="text-center text-sm">{row.numeroSerie}</TableCell>
                          <TableCell className="text-center text-sm">{row.estado}</TableCell>
                          <TableCell className="text-center text-sm">
                            {formatarResponsavel(row.responsavel, tecnicosByMatricula)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {row.dataUltimaAlteracao}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </table>
              </div>
            ) : (
              <div className="relative max-h-[500px] overflow-y-auto rounded-md border border-border">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={STICKY_HEAD_CLASS}>Tipo</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Modelo</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Quantidade</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contagem.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde aos filtros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      contagem.map((row) => (
                        <TableRow key={`${row.tipo}-${row.modelo}-${row.status}`}>
                          <TableCell className="text-center text-sm">{row.tipo}</TableCell>
                          <TableCell className="text-center text-sm">{row.modelo}</TableCell>
                          <TableCell className="text-center text-sm">{row.quantidade}</TableCell>
                          <TableCell className="text-center text-sm">{row.status}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </table>
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
