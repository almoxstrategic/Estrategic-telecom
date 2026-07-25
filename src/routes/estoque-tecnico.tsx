import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Building2, Eraser, FileSpreadsheet } from "lucide-react";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth-guards";
import {
  aggregateEstoqueCampoContagem,
  formatAtualizacaoCampo,
  loadEstoqueCampoSnapshot,
  type EstoqueCampoContagem,
  type EstoqueCampoItem,
} from "@/lib/serializados-campo-store";

export const Route = createFileRoute("/estoque-tecnico")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Estoque serializado - Técnico — Estrategic Field" },
      {
        name: "description",
        content: "Visão detalhada e agregada do Estoque Campo importado.",
      },
    ],
  }),
  component: EstoqueTecnicoPage,
});

type InnerTab = "estoque-tecnico" | "contagem";

const STICKY_HEAD_CLASS =
  "sticky top-0 z-10 bg-card text-center text-muted-foreground shadow-sm";

const SELECT_CLASS =
  "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring";

function EstoqueTecnicoPage() {
  const [items, setItems] = useState<EstoqueCampoItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InnerTab>("estoque-tecnico");
  const [filtroNome, setFiltroNome] = useState("");
  const [filtroDescricao, setFiltroDescricao] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");
  const [filtroStatus, setFiltroStatus] = useState("Todos");

  useEffect(() => {
    const refresh = () => {
      const snapshot = loadEstoqueCampoSnapshot();
      setItems(snapshot.items);
      setUpdatedAt(snapshot.updatedAt);
    };
    refresh();
    window.addEventListener("estoque-campo-updated", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("estoque-campo-updated", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const opcoesStatus = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      const status = item.status.trim();
      if (status && status !== "—") set.add(status);
    }
    return [...set].sort((a, b) => a.localeCompare(b, "pt-BR"));
  }, [items]);

  const filteredItems = useMemo(() => {
    const nomeQ = filtroNome.trim().toLowerCase();
    const descQ = filtroDescricao.trim().toLowerCase();
    const serieQ = filtroSerie.trim().toLowerCase();
    return items.filter((item) => {
      if (nomeQ && !item.nome.toLowerCase().includes(nomeQ)) return false;
      if (descQ && !item.descricao.toLowerCase().includes(descQ)) return false;
      if (serieQ && !item.numeroSerie.toLowerCase().includes(serieQ)) return false;
      if (filtroStatus !== "Todos" && item.status.trim() !== filtroStatus) return false;
      return true;
    });
  }, [items, filtroNome, filtroDescricao, filtroSerie, filtroStatus]);

  const contagem = useMemo(() => {
    const nomeQ = filtroNome.trim().toLowerCase();
    const descQ = filtroDescricao.trim().toLowerCase();
    const base = items.filter((item) => {
      if (nomeQ && !item.nome.toLowerCase().includes(nomeQ)) return false;
      if (descQ && !item.descricao.toLowerCase().includes(descQ)) return false;
      return true;
    });
    const aggregated = aggregateEstoqueCampoContagem(base);
    if (filtroStatus === "Todos") return aggregated;
    return aggregated.filter((row) => row.status === filtroStatus);
  }, [items, filtroNome, filtroDescricao, filtroStatus]);

  const qntItens = activeTab === "estoque-tecnico" ? filteredItems.length : contagem.length;
  const ultimaAtualizacaoLabel = formatAtualizacaoCampo(updatedAt);

  const limparFiltros = () => {
    setFiltroNome("");
    setFiltroDescricao("");
    setFiltroSerie("");
    setFiltroStatus("Todos");
  };

  const handleExportExcel = () => {
    if (activeTab === "estoque-tecnico") {
      if (filteredItems.length === 0) {
        toast.error("Nenhum dado filtrado para exportar.");
        return;
      }
      const dadosExcel = filteredItems.map((row) => ({
        NOME: row.nome,
        DESCRIÇÃO: row.descricao,
        "N° DE SERIE": row.numeroSerie,
        STATUS: row.status,
        "DATA DE RETIRADA": row.dataRetirada,
      }));
      const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Estoque Técnico");
      const hoje = new Date().toISOString().slice(0, 10);
      XLSX.writeFile(workbook, `Estoque_Tecnico_Detalhe_${hoje}.xlsx`);
      toast.success(`Excel exportado: ${filteredItems.length} linhas.`);
      return;
    }

    if (contagem.length === 0) {
      toast.error("Nenhum dado filtrado para exportar.");
      return;
    }
    const dadosExcel = contagem.map((row: EstoqueCampoContagem) => ({
      NOME: row.nome,
      DESCRIÇÃO: row.descricao,
      MODELO: row.modelo,
      QUANTIDADE: row.quantidade,
      STATUS: row.status,
    }));
    const worksheet = XLSX.utils.json_to_sheet(dadosExcel);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Contagem");
    const hoje = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(workbook, `Estoque_Tecnico_Contagem_${hoje}.xlsx`);
    toast.success(`Excel exportado: ${contagem.length} linhas.`);
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Building2 className="h-6 w-6 text-primary" />
              Estoque serializado - Técnico
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Dados do Estoque Campo importado em Serializados.
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

          {activeTab === "estoque-tecnico" ? (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-nome">Nome</Label>
                <Input
                  id="filtro-nome"
                  placeholder="Buscar por Nome…"
                  value={filtroNome}
                  onChange={(e) => setFiltroNome(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-descricao">Descrição</Label>
                <Input
                  id="filtro-descricao"
                  placeholder="Buscar por Descrição…"
                  value={filtroDescricao}
                  onChange={(e) => setFiltroDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-serie">N° Serie</Label>
                <Input
                  id="filtro-serie"
                  placeholder="Buscar por N° Serie…"
                  value={filtroSerie}
                  onChange={(e) => setFiltroSerie(e.target.value)}
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
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <div className="space-y-1.5">
                <Label htmlFor="filtro-nome-contagem">Nome</Label>
                <Input
                  id="filtro-nome-contagem"
                  placeholder="Buscar por Nome…"
                  value={filtroNome}
                  onChange={(e) => setFiltroNome(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-descricao-contagem">Descrição</Label>
                <Input
                  id="filtro-descricao-contagem"
                  placeholder="Buscar por Descrição…"
                  value={filtroDescricao}
                  onChange={(e) => setFiltroDescricao(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="filtro-status-contagem">Status</Label>
                <select
                  id="filtro-status-contagem"
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
                onClick={() => setActiveTab("estoque-tecnico")}
                className={`px-4 py-2.5 text-sm font-medium transition-colors ${
                  activeTab === "estoque-tecnico"
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Estoque do técnico
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
                Contagem Estoque do técnico
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
                  Estoque Campo
                </Link>{" "}
                em Importação → Serializados.
              </p>
            ) : activeTab === "estoque-tecnico" ? (
              <div className="relative max-h-[500px] overflow-y-auto rounded-md border border-border">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={STICKY_HEAD_CLASS}>NOME</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>DESCRIÇÃO</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>N° DE SERIE</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>STATUS</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>DATA DE RETIRADA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde aos filtros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((row, idx) => (
                        <TableRow key={`${row.numeroSerie}-${idx}`}>
                          <TableCell className="text-center text-sm">{row.nome}</TableCell>
                          <TableCell className="text-center text-sm">{row.descricao}</TableCell>
                          <TableCell className="text-center text-sm">{row.numeroSerie}</TableCell>
                          <TableCell className="text-center text-sm">{row.status}</TableCell>
                          <TableCell className="text-center text-sm">{row.dataRetirada}</TableCell>
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
                      <TableHead className={STICKY_HEAD_CLASS}>NOME</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>DESCRIÇÃO</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>MODELO</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>QUANTIDADE</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>STATUS</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contagem.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde aos filtros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      contagem.map((row) => (
                        <TableRow
                          key={`${row.nome}-${row.descricao}-${row.modelo}-${row.status}`}
                        >
                          <TableCell className="text-center text-sm">{row.nome}</TableCell>
                          <TableCell className="text-center text-sm">{row.descricao}</TableCell>
                          <TableCell className="text-center text-sm">{row.modelo || "—"}</TableCell>
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
