import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
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
  aggregateEstoqueAtlasContagem,
  formatAtualizacaoAtlas,
  loadEstoqueAtlasSnapshot,
  type EstoqueAtlasItem,
} from "@/lib/serializados-atlas-store";

export const Route = createFileRoute("/relacao-campo")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Relação de campo — Estrategic Field" },
      {
        name: "description",
        content: "Visão detalhada e agregada do Estoque Atlas importado.",
      },
    ],
  }),
  component: RelacaoCampoPage,
});

type InnerTab = "estoque-atlas" | "contagem";

const STICKY_HEAD_CLASS =
  "sticky top-0 z-10 bg-card text-muted-foreground shadow-sm";

function RelacaoCampoPage() {
  const [items, setItems] = useState<EstoqueAtlasItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<InnerTab>("estoque-atlas");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroModelo, setFiltroModelo] = useState("");
  const [filtroSerie, setFiltroSerie] = useState("");

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

  const filteredItems = useMemo(() => {
    const tipoQ = filtroTipo.trim().toLowerCase();
    const modeloQ = filtroModelo.trim().toLowerCase();
    const serieQ = filtroSerie.trim().toLowerCase();
    return items.filter((item) => {
      if (tipoQ && !item.tipo.toLowerCase().includes(tipoQ)) return false;
      if (modeloQ && !item.modelo.toLowerCase().includes(modeloQ)) return false;
      if (serieQ && !item.numeroSerie.toLowerCase().includes(serieQ)) return false;
      return true;
    });
  }, [items, filtroTipo, filtroModelo, filtroSerie]);

  /** Contagem ignora Nº Serie — só Tipo e Modelo. */
  const filteredForContagem = useMemo(() => {
    const tipoQ = filtroTipo.trim().toLowerCase();
    const modeloQ = filtroModelo.trim().toLowerCase();
    return items.filter((item) => {
      if (tipoQ && !item.tipo.toLowerCase().includes(tipoQ)) return false;
      if (modeloQ && !item.modelo.toLowerCase().includes(modeloQ)) return false;
      return true;
    });
  }, [items, filtroTipo, filtroModelo]);

  const contagem = useMemo(
    () => aggregateEstoqueAtlasContagem(filteredForContagem),
    [filteredForContagem],
  );

  const qntItens = activeTab === "estoque-atlas" ? filteredItems.length : contagem.length;
  const ultimaAtualizacaoLabel = formatAtualizacaoAtlas(updatedAt);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <MapIcon className="h-6 w-6 text-primary" />
              Relação de campo
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
          <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted-foreground">
            Filtros
          </h2>
          <div
            className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${
              activeTab === "estoque-atlas" ? "lg:grid-cols-3" : ""
            }`}
          >
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
            {activeTab === "estoque-atlas" ? (
              <div className="space-y-1.5">
                <Label htmlFor="filtro-serie">Nº Serie</Label>
                <Input
                  id="filtro-serie"
                  placeholder="Buscar por Nº Serie…"
                  value={filtroSerie}
                  onChange={(e) => setFiltroSerie(e.target.value)}
                />
              </div>
            ) : null}
          </div>
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
            <span className="shrink-0 pb-2 text-xs font-medium text-muted-foreground">
              última atualização: {ultimaAtualizacaoLabel} ; Qnt de itens: {qntItens}
            </span>
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
                      <TableHead className={STICKY_HEAD_CLASS}>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredItems.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde aos filtros.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredItems.map((row, idx) => (
                        <TableRow key={`${row.numeroSerie}-${idx}`}>
                          <TableCell className="text-sm">{row.tipo}</TableCell>
                          <TableCell className="text-sm">{row.modelo}</TableCell>
                          <TableCell className="text-sm">{row.numeroSerie}</TableCell>
                          <TableCell className="text-sm">{row.estado}</TableCell>
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
                          <TableCell className="text-sm">{row.tipo}</TableCell>
                          <TableCell className="text-sm">{row.modelo}</TableCell>
                          <TableCell className="text-sm">{row.quantidade}</TableCell>
                          <TableCell className="text-sm">{row.status}</TableCell>
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
