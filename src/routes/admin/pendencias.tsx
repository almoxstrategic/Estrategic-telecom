import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AlertTriangle, MessageCircle } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { celularToWhatsAppUrl } from "@/lib/auth-identificacao";
import { fetchPendenciasEvidencias } from "@/lib/logistica-service";
import type { PendenciaEvidencia } from "@/lib/logistica-types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/admin/pendencias")({
  head: () => ({
    meta: [
      { title: "Pendências — Estrategic Field" },
      { name: "description", content: "WOs atrasadas para auditoria de evidência." },
    ],
  }),
  component: PendenciasPage,
});

function PendenciasPage() {
  const [rows, setRows] = useState<PendenciaEvidencia[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setRows(await fetchPendenciasEvidencias());
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-6xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <AlertTriangle className="h-6 w-6 text-destructive" />
              Pendências de Evidência
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              WOs com SLA negativo (status 3) para auditar se o gargalo é do técnico ou da
              operadora.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        {loading ? (
          <p className="text-sm text-muted-foreground">Carregando pendências...</p>
        ) : error ? (
          <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
            {error}
          </p>
        ) : rows.length === 0 ? (
          <p className="rounded-2xl border border-border bg-card px-5 py-8 text-center text-sm text-muted-foreground">
            Nenhuma WO em risco no momento. Importe o arquivo de cabeçalho para atualizar a lista.
          </p>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>WO</TableHead>
                  <TableHead>Técnico</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Contato</TableHead>
                  <TableHead>Status da Evidência</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const wa = celularToWhatsAppUrl(row.celular);
                  const loginBusca = row.login_tecnico || row.id_tecnico;

                  return (
                    <TableRow key={row.work_order_id}>
                      <TableCell className="font-mono font-semibold">
                        {row.tem_evidencia ? (
                          <Link
                            to="/todos"
                            search={{ wo: row.work_order_id }}
                            className="text-primary hover:underline"
                          >
                            {row.work_order_id}
                          </Link>
                        ) : (
                          row.work_order_id
                        )}
                      </TableCell>
                      <TableCell className="font-mono">{row.id_tecnico}</TableCell>
                      <TableCell>
                        <Link
                          to="/todos"
                          search={{ login: loginBusca }}
                          className="font-semibold text-foreground hover:text-muted-foreground hover:underline"
                        >
                          {row.nome_tecnico}
                        </Link>
                      </TableCell>
                      <TableCell className="font-bold text-destructive">
                        {row.sla} dias
                      </TableCell>
                      <TableCell>
                        {wa ? (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline"
                          >
                            <MessageCircle className="h-4 w-4" />
                            WhatsApp
                          </a>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </TableCell>
                      <TableCell>
                        {row.tem_evidencia ? (
                          <Badge className="border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/90">
                            Evidenciado
                          </Badge>
                        ) : (
                          <Badge variant="destructive">Pendente</Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
      </main>
    </div>
  );
}
