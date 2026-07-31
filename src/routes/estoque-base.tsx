import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search, Warehouse, X } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import {
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { requireAdmin } from "@/lib/auth-guards";
import {
  loadEstoqueBtpSnapshot,
  type EstoqueBtpItem,
} from "@/lib/estoque-btp-store";
import {
  cruzarDadosEstoque,
  formatAtualizacaoEstoqueBase,
  loadEstoqueBaseSnapshot,
  type EstoqueBaseItem,
} from "@/lib/estoque-base-store";

export const Route = createFileRoute("/estoque-base")({
  beforeLoad: () => requireAdmin(),
  head: () => ({
    meta: [
      { title: "Estoque Base — Estrategic Field" },
      {
        name: "description",
        content: "Visão consolidada do Estoque Base cruzada com o Estoque BTP.",
      },
    ],
  }),
  component: EstoqueBasePage,
});

const STICKY_HEAD_CLASS =
  "sticky top-0 z-10 bg-card text-center text-muted-foreground shadow-sm";

function formatQtd(value: number): string {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  });
}

function EstoqueBasePage() {
  const [query, setQuery] = useState("");
  const [dadosEstoqueBase, setDadosEstoqueBase] = useState<EstoqueBaseItem[]>([]);
  const [dadosEstoqueBtp, setDadosEstoqueBtp] = useState<EstoqueBtpItem[]>([]);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);

  useEffect(() => {
    const baseSnap = loadEstoqueBaseSnapshot();
    const btpSnap = loadEstoqueBtpSnapshot();
    setDadosEstoqueBase(baseSnap.items);
    setDadosEstoqueBtp(btpSnap.items);
    setUpdatedAt(baseSnap.updatedAt);
  }, []);

  const cruzados = useMemo(
    () => cruzarDadosEstoque(dadosEstoqueBase, dadosEstoqueBtp),
    [dadosEstoqueBase, dadosEstoqueBtp],
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return cruzados;
    return cruzados.filter((row) => {
      return (
        row.material.toLowerCase().includes(q) ||
        row.codigo.toLowerCase().includes(q) ||
        String(row.estoqueAtual).includes(q) ||
        String(row.estoqueReservado).includes(q) ||
        String(row.estoqueDisponivel).includes(q)
      );
    });
  }, [cruzados, query]);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <Warehouse className="h-6 w-6 text-primary" />
              Estoque Base
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Cruzamento do Estoque Base com o Estoque BTP (Código Alternativo = Cod material).
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        {dadosEstoqueBase.length > 0 && (
          <div className="mb-4 flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 shadow-sm focus-within:ring-1 focus-within:ring-primary">
            <Search className="h-5 w-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por material ou código…"
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
                <X className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}

        <section className="rounded-2xl border border-border bg-card shadow-sm">
          <div className="flex w-full flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <h2 className="text-sm font-semibold text-foreground">Estoque consolidado</h2>
            <span className="text-xs font-medium text-muted-foreground">
              última atualização: {formatAtualizacaoEstoqueBase(updatedAt)} ; Qnt de itens:{" "}
              {filtrados.length}
            </span>
          </div>

          <div className="p-4">
            {dadosEstoqueBase.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nenhum dado importado. Importe as planilhas{" "}
                <Link
                  to="/admin/importacao"
                  className="font-semibold text-primary hover:underline"
                >
                  Estoque BTP
                </Link>{" "}
                e{" "}
                <Link
                  to="/admin/importacao"
                  className="font-semibold text-primary hover:underline"
                >
                  Estoque Base
                </Link>{" "}
                em Importação → Miscelâneas.
              </p>
            ) : (
              <div className="relative max-h-[560px] overflow-y-auto rounded-md border border-border">
                <table className="w-full caption-bottom text-sm">
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className={STICKY_HEAD_CLASS}>Material</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Código</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Estoque Atual</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Estoque Reservado</TableHead>
                      <TableHead className={STICKY_HEAD_CLASS}>Estoque Disponível</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtrados.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                          Nenhum registro corresponde à busca.
                        </TableCell>
                      </TableRow>
                    ) : (
                      filtrados.map((row) => (
                        <TableRow key={row.codigo}>
                          <TableCell className="text-center text-sm">{row.material}</TableCell>
                          <TableCell className="text-center text-sm">{row.codigo}</TableCell>
                          <TableCell className="text-center text-sm">
                            {formatQtd(row.estoqueAtual)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {formatQtd(row.estoqueReservado)}
                          </TableCell>
                          <TableCell className="text-center text-sm">
                            {formatQtd(row.estoqueDisponivel)}
                          </TableCell>
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
