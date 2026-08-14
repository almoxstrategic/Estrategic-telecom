import { useCallback, useEffect, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ClipboardList, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { ExpandableImage } from "@/components/ExpandableImage";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useApp } from "@/lib/app-store";
import { hasPainelFullAccess } from "@/lib/roles";
import {
  fecharRelatorioTransmissao,
  fetchRelatorioTransmissaoById,
  fetchRelatoriosTransmissaoAdmin,
  subscribeRelatoriosTransmissao,
  type RelatorioTransmissao,
  type StoredPhoto,
} from "@/lib/relatorios-transmissao";

export const Route = createFileRoute("/admin/lancamentos")({
  head: () => ({
    meta: [
      { title: "Relatórios de campo — Estrategic" },
      { name: "description", content: "Gestão de relatórios da equipe de lançamento." },
    ],
  }),
  component: AdminLancamentosPage,
});

function formatDate(value: string | null | undefined) {
  if (!value) return "—";
  const d = new Date(value.includes("T") ? value : `${value}T00:00:00`);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("pt-BR");
}

function Photos({ fotos }: { fotos: StoredPhoto[] }) {
  if (!fotos.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {fotos.map((foto) => (
        <div key={foto.path} className="overflow-hidden rounded-lg border">
          <ExpandableImage src={foto.url} alt="Evidência" className="h-28" />
        </div>
      ))}
    </div>
  );
}

function RelatorioCard({
  row,
  canClose,
  onClose,
  onSelect,
  selected,
}: {
  row: RelatorioTransmissao;
  canClose: boolean;
  onClose: (id: string) => void;
  onSelect: (row: RelatorioTransmissao) => void;
  selected: boolean;
}) {
  const avisado = row.status === "avisado";
  return (
    <article
      className={`rounded-2xl border p-4 shadow-sm transition ${
        avisado
          ? "border-emerald-400 bg-emerald-50/80"
          : "border-border bg-card"
      } ${selected ? "ring-2 ring-primary" : ""}`}
    >
      <button type="button" className="w-full text-left" onClick={() => onSelect(row)}>
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="text-lg font-bold">{row.os_wf}</h3>
            <p className="text-sm text-muted-foreground">{row.cliente || "Preenchendo..."}</p>
          </div>
          {avisado ? (
            <Badge className="border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-600">
              Avisado
            </Badge>
          ) : row.status === "fechado" ? (
            <Badge variant="secondary">Fechado</Badge>
          ) : (
            <Badge variant="outline">Em aberto</Badge>
          )}
        </div>
        <dl className="mt-3 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
          <div>
            <span className="text-muted-foreground">Cidade: </span>
            {row.cidade}
          </div>
          <div>
            <span className="text-muted-foreground">Técnico: </span>
            {row.tecnico_nome ?? "—"}
          </div>
          <div>
            <span className="text-muted-foreground">Equipe: </span>
            {row.equipe_empreiteira}
          </div>
          <div>
            <span className="text-muted-foreground">Início: </span>
            {formatDate(row.data_inicio_execucao)}
          </div>
        </dl>
      </button>
      {canClose && row.status !== "fechado" ? (
        <Button
          type="button"
          variant="outline"
          className="mt-3 w-full"
          onClick={() => onClose(row.id)}
        >
          Marcar como fechado
        </Button>
      ) : null}
    </article>
  );
}

function AdminLancamentosPage() {
  const { user } = useApp();
  const canClose = hasPainelFullAccess(user?.role);
  const [aba, setAba] = useState<"abertos" | "fechados">("abertos");
  const [rows, setRows] = useState<RelatorioTransmissao[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<RelatorioTransmissao | null>(null);
  const [refreshingDetail, setRefreshingDetail] = useState(false);

  const load = useCallback(async (group: "abertos" | "fechados", silent = false) => {
    if (!silent) setLoading(true);
    try {
      const lista = await fetchRelatoriosTransmissaoAdmin(group);
      setRows(lista);
    } catch (err) {
      toast.error((err as Error).message || "Erro ao carregar relatórios.");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  const abrirDetalhe = async (row: RelatorioTransmissao) => {
    setSelected(row);
    setRefreshingDetail(true);
    try {
      const fresh = await fetchRelatorioTransmissaoById(row.id);
      setSelected(fresh);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível atualizar o contrato.");
    } finally {
      setRefreshingDetail(false);
    }
  };

  useEffect(() => {
    void load(aba);
  }, [aba, load]);

  useEffect(() => {
    return subscribeRelatoriosTransmissao(() => {
      void load(aba, true);
      if (!selected?.id) return;
      void fetchRelatorioTransmissaoById(selected.id)
        .then(setSelected)
        .catch(() => undefined);
    });
  }, [aba, load, selected?.id]);

  const onClose = async (id: string) => {
    try {
      await fecharRelatorioTransmissao(id);
      toast.success("Contrato fechado.");
      setSelected(null);
      await load(aba);
    } catch (err) {
      toast.error((err as Error).message || "Não foi possível fechar.");
    }
  };

  const payload = selected?.payload;

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-16 pt-4">
        <Link
          to="/admin"
          search={{ tab: "lancamentos" }}
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao Painel
        </Link>

        <header className="mb-6 flex items-start gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-green-100 text-green-700">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Relatório de campo</h1>
            <p className="text-sm text-muted-foreground">
              Contratos da equipe de Lançamento (Transmissão)
            </p>
          </div>
        </header>

        <Tabs
          value={aba}
          onValueChange={(value) => setAba(value === "fechados" ? "fechados" : "abertos")}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="abertos">Contratos em aberto</TabsTrigger>
            <TabsTrigger value="fechados">Contratos fechados</TabsTrigger>
          </TabsList>
          <TabsContent value="abertos" className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum contrato em aberto.
              </p>
            ) : (
              rows.map((row) => (
                <RelatorioCard
                  key={row.id}
                  row={row}
                  canClose={canClose}
                  onClose={onClose}
                  onSelect={abrirDetalhe}
                  selected={selected?.id === row.id}
                />
              ))
            )}
          </TabsContent>
          <TabsContent value="fechados" className="space-y-3">
            {loading ? (
              <p className="text-sm text-muted-foreground">Carregando...</p>
            ) : rows.length === 0 ? (
              <p className="rounded-2xl border border-dashed p-8 text-center text-sm text-muted-foreground">
                Nenhum contrato fechado.
              </p>
            ) : (
              rows.map((row) => (
                <RelatorioCard
                  key={row.id}
                  row={row}
                  canClose={false}
                  onClose={onClose}
                  onSelect={abrirDetalhe}
                  selected={selected?.id === row.id}
                />
              ))
            )}
          </TabsContent>
        </Tabs>

        {selected ? (
          <section className="mt-8 space-y-4 rounded-2xl border border-border bg-card p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-lg font-bold">Detalhe — {selected.os_wf}</h2>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {refreshingDetail ? "Atualizando..." : "Ao vivo"}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => void abrirDetalhe(selected)}
                >
                  <RefreshCw className="mr-1 h-3.5 w-3.5" />
                  Atualizar
                </Button>
              </div>
            </div>
            <p className="text-sm">
              {selected.endereco || "—"} · {selected.cidade || "—"}
              <br />
              Cliente: {selected.cliente || "—"}
              <br />
              Responsável: {selected.responsavel || "—"}
              <br />
              Equipe: {selected.equipe_empreiteira || "—"}
              <br />
              Tipo:{" "}
              {selected.tipo_execucao === "implantacao"
                ? "Implantação"
                : selected.tipo_execucao === "empresarial"
                  ? "Empresarial"
                  : "Ainda não informado"}
            </p>
            {payload?.lancamentoRe === true ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">
                  RE — {payload.qntPostesRe || "—"} postes · metragem {payload.metragemRe.metragem || "—"}
                </p>
                <Photos
                  fotos={[payload.metragemRe.fotoInicio, payload.metragemRe.fotoFim].filter(
                    (f): f is StoredPhoto => Boolean(f),
                  )}
                />
              </div>
            ) : null}
            {(
              [
                ["Poste de conexão", payload?.posteConexao],
                ["Caixa de emenda", payload?.caixaEmenda],
                ["Sobra técnica", payload?.sobraTecnica],
                ["Terrometro", payload?.aterramentoTerrometro],
                ["Novo aterramento", payload?.novoAterramentoPoste],
                ["Posição DGO/DIO", payload?.posicaoConexaoEstacao],
                ["Etiqueta", payload?.etiquetaIdentificacao],
              ] as const
            ).map(([title, grupo]) =>
              grupo && grupo.fotos.length > 0 ? (
                <div key={title} className="space-y-2">
                  <p className="text-sm font-semibold">{title}</p>
                  {grupo.obs ? <p className="text-xs text-muted-foreground">{grupo.obs}</p> : null}
                  <Photos fotos={grupo.fotos} />
                </div>
              ) : null,
            )}
            {(payload?.outrasFotos ?? [])
              .filter((item) => item.foto)
              .map((item) => (
                <div key={item.id} className="space-y-2">
                  <p className="text-sm font-semibold">Outra — {item.ref || "sem REF"}</p>
                  <Photos fotos={item.foto ? [item.foto] : []} />
                </div>
              ))}
          </section>
        ) : null}
      </main>
    </div>
  );
}
