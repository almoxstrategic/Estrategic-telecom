import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertTriangle, ClipboardList, Eye, Play, Wrench } from "lucide-react";
import { toast } from "sonner";
import { RelatorioTransmissaoLeitura } from "@/components/RelatorioTransmissaoLeitura";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
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
        Em análise
      </Badge>
    );
  }
  if (status === "pendente") {
    return (
      <Badge className="border-destructive bg-destructive text-destructive-foreground hover:bg-destructive">
        Pendência
      </Badge>
    );
  }
  return <Badge variant="secondary">Aprovado</Badge>;
}

function RelatorioListCard({
  row,
  modo,
  onVerPendencia,
  onVerAprovado,
}: {
  row: RelatorioTransmissao;
  modo: "continuar" | "visualizar" | "pendencia" | "aprovado";
  onVerPendencia?: (row: RelatorioTransmissao) => void;
  onVerAprovado?: (row: RelatorioTransmissao) => void;
}) {
  const isPendencia = modo === "pendencia";
  return (
    <article
      className={`rounded-2xl border bg-card p-4 shadow-sm ${
        isPendencia ? "border-destructive/60 bg-destructive/5" : "border-border"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-bold">{row.os_wf}</h3>
          <p className="text-xs text-muted-foreground">
            {row.cliente || "Cliente ainda não informado"}
          </p>
        </div>
        {statusBadge(row.status)}
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        Início da execução: {formatDate(row.data_inicio_execucao)}
      </p>
      {isPendencia ? (
        <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Button
            type="button"
            variant="outline"
            className="border-destructive/40 text-destructive hover:bg-destructive/10"
            onClick={() => onVerPendencia?.(row)}
          >
            <AlertTriangle className="h-4 w-4" />
            Ver pendência
          </Button>
          <Button asChild>
            <Link to="/relatorio" search={{ id: row.id }}>
              <Wrench className="h-4 w-4" />
              Corrigir Relatório
            </Link>
          </Button>
        </div>
      ) : modo === "aprovado" ? (
        <Button
          type="button"
          className="mt-3 w-full"
          onClick={() => onVerAprovado?.(row)}
        >
          <Eye className="h-4 w-4" />
          Visualizar
        </Button>
      ) : (
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
      )}
    </article>
  );
}

function Lista({
  loading,
  rows,
  empty,
  modo,
  onVerPendencia,
  onVerAprovado,
}: {
  loading: boolean;
  rows: RelatorioTransmissao[];
  empty: string;
  modo: "continuar" | "visualizar" | "pendencia" | "aprovado";
  onVerPendencia?: (row: RelatorioTransmissao) => void;
  onVerAprovado?: (row: RelatorioTransmissao) => void;
}) {
  if (loading) return <p className="text-sm text-muted-foreground">Carregando...</p>;
  if (rows.length === 0) {
    return (
      <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
        {empty}
      </p>
    );
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <RelatorioListCard
          key={row.id}
          row={row}
          modo={modo}
          onVerPendencia={onVerPendencia}
          onVerAprovado={onVerAprovado}
        />
      ))}
    </div>
  );
}

export function MeusRelatoriosTransmissao({ tecnicoId }: { tecnicoId: string }) {
  const [rows, setRows] = useState<RelatorioTransmissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendenciaAberta, setPendenciaAberta] = useState<RelatorioTransmissao | null>(null);
  const [aprovadoAberto, setAprovadoAberto] = useState<RelatorioTransmissao | null>(null);

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
  const analise = useMemo(
    () => rows.filter((row) => row.status === "avisado"),
    [rows],
  );
  const pendencias = useMemo(
    () => rows.filter((row) => row.status === "pendente"),
    [rows],
  );
  const aprovados = useMemo(
    () => rows.filter((row) => row.status === "fechado"),
    [rows],
  );

  return (
    <section className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <ClipboardList className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-bold">Meus Relatórios</h2>
      </div>

      <Tabs defaultValue="andamento">
        <TabsList className="flex h-auto w-full flex-wrap gap-1">
          <TabsTrigger value="andamento" className="flex-1">
            Em andamento ({emAndamento.length})
          </TabsTrigger>
          <TabsTrigger value="analise" className="flex-1">
            Análise ({analise.length})
          </TabsTrigger>
          <TabsTrigger value="pendencia" className="flex-1">
            Pendência ({pendencias.length})
          </TabsTrigger>
          <TabsTrigger value="aprovado" className="flex-1">
            Aprovado ({aprovados.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="andamento" className="mt-4">
          <Lista
            loading={loading}
            rows={emAndamento}
            empty="Nenhum relatório em andamento."
            modo="continuar"
          />
        </TabsContent>
        <TabsContent value="analise" className="mt-4">
          <Lista
            loading={loading}
            rows={analise}
            empty="Nenhum relatório em análise."
            modo="visualizar"
          />
        </TabsContent>
        <TabsContent value="pendencia" className="mt-4">
          <Lista
            loading={loading}
            rows={pendencias}
            empty="Nenhuma pendência no momento."
            modo="pendencia"
            onVerPendencia={setPendenciaAberta}
          />
        </TabsContent>
        <TabsContent value="aprovado" className="mt-4">
          <Lista
            loading={loading}
            rows={aprovados}
            empty="Nenhum relatório aprovado."
            modo="aprovado"
            onVerAprovado={setAprovadoAberto}
          />
        </TabsContent>
      </Tabs>

      <Dialog open={Boolean(pendenciaAberta)} onOpenChange={(open) => !open && setPendenciaAberta(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Pendência — {pendenciaAberta?.os_wf}</DialogTitle>
            <DialogDescription>
              {pendenciaAberta?.motivo_pendencia?.trim() ||
                "A supervisão sinalizou uma pendência sem detalhar o motivo."}
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>

      <Drawer
        open={Boolean(aprovadoAberto)}
        onOpenChange={(open) => {
          if (!open) setAprovadoAberto(null);
        }}
      >
        <DrawerContent className="max-h-[92vh]">
          <DrawerHeader className="text-left">
            <DrawerTitle>OS/WF {aprovadoAberto?.os_wf}</DrawerTitle>
            <DrawerDescription>Relatório aprovado — somente visualização</DrawerDescription>
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">
            {aprovadoAberto ? <RelatorioTransmissaoLeitura row={aprovadoAberto} /> : null}
          </div>
          <DrawerFooter>
            <DrawerClose asChild>
              <Button type="button" variant="outline" className="w-full">
                Fechar
              </Button>
            </DrawerClose>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    </section>
  );
}
