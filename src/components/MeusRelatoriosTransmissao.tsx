import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ClipboardList, Eye, Play } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  fetchMeusRelatoriosTransmissao,
  type RelatorioTransmissao,
} from "@/lib/relatorios-transmissao";

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function statusBadge(status: RelatorioTransmissao["status"]) {
  if (status === "em_aberto") {
    return <Badge variant="outline">Em andamento</Badge>;
  }
  if (status === "avisado") {
    return (
      <Badge className="border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600">
        Avisado
      </Badge>
    );
  }
  return <Badge variant="secondary">Fechado</Badge>;
}

function RelatorioListCard({
  row,
  modo,
}: {
  row: RelatorioTransmissao;
  modo: "continuar" | "visualizar";
}) {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{row.os_wf}</h3>
          <p className="text-xs text-muted-foreground">{row.cliente || "Cliente ainda não informado"}</p>
        </div>
        {statusBadge(row.status)}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Início da execução: {formatDate(row.data_inicio_execucao)}
      </p>
      <Link
        to="/relatorio"
        search={{ id: row.id }}
        className="mt-3 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary-hover"
      >
        {modo === "continuar" ? (
          <>
            <Play className="h-4 w-4" />
            Continuar preenchimento
          </>
        ) : (
          <>
            <Eye className="h-4 w-4" />
            Visualizar
          </>
        )}
      </Link>
    </article>
  );
}

export function MeusRelatoriosTransmissao({ tecnicoId }: { tecnicoId: string }) {
  const [rows, setRows] = useState<RelatorioTransmissao[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const data = await fetchMeusRelatoriosTransmissao(tecnicoId);
        if (!cancelled) setRows(data);
      } catch (err) {
        if (!cancelled) {
          toast.error((err as Error).message || "Não foi possível carregar seus relatórios.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tecnicoId]);

  const emAndamento = useMemo(
    () => rows.filter((row) => row.status === "em_aberto"),
    [rows],
  );
  const historico = useMemo(
    () => rows.filter((row) => row.status === "avisado" || row.status === "fechado"),
    [rows],
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Meus Relatórios</h2>
      </div>

      <Tabs defaultValue="andamento">
        <TabsList className="w-full">
          <TabsTrigger value="andamento" className="flex-1">
            Em andamento ({emAndamento.length})
          </TabsTrigger>
          <TabsTrigger value="historico" className="flex-1">
            Histórico ({historico.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="andamento" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : emAndamento.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum relatório em andamento.
            </p>
          ) : (
            emAndamento.map((row) => (
              <RelatorioListCard key={row.id} row={row} modo="continuar" />
            ))
          )}
        </TabsContent>

        <TabsContent value="historico" className="mt-4 space-y-3">
          {loading ? (
            <p className="text-sm text-muted-foreground">Carregando...</p>
          ) : historico.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
              Nenhum relatório no histórico.
            </p>
          ) : (
            historico.map((row) => (
              <RelatorioListCard key={row.id} row={row} modo="visualizar" />
            ))
          )}
        </TabsContent>
      </Tabs>
    </section>
  );
}
