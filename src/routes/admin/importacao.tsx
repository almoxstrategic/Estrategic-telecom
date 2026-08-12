import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useId, useState, type ChangeEvent, type DragEvent } from "react";
import { FileSpreadsheet, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-store";
import { replaceWoCabecalho, upsertDimMateriais, upsertWoConsumo } from "@/lib/logistica-service";
import {
  parseAnaliticoFaturamentoFile,
  parseEstoqueAtlasFile,
  parseEstoqueBaseFile,
  parseEstoqueBtpFile,
  parseEstoqueCampoFile,
  parseToaFile,
  parseWoCabecalhoFile,
  parseWoConsumoFile,
} from "@/lib/spreadsheet-import";
import { saveEstoqueBtp } from "@/lib/estoque-btp-store";
import { saveEstoqueBase } from "@/lib/estoque-base-store";
import { saveEstoqueAtlas } from "@/lib/serializados-atlas-store";
import { saveEstoqueCampo } from "@/lib/serializados-campo-store";
import { markKpiUltimaImportacao } from "@/lib/kpi-importacao-meta-store";
import {
  replaceAnaliticoHistoricoLote,
  replaceToaImportacoes,
} from "@/lib/faturamento-service";
import {
  canAccessImportacaoAbasCompletas,
  canImportPainelDados,
  canImportToa,
} from "@/lib/roles";
import {
  agregarChamadosToa,
  clearToaLocalStorage,
  isStatusAtividadeContabilizavel,
  processarChamadosTOA,
} from "@/lib/toa-store";
import { cn } from "@/lib/utils";

function formatImportError(scope: string, err: unknown): string {
  console.error(`[importacao/${scope}]`, err);

  if (err && typeof err === "object") {
    const supabaseErr = err as {
      message?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    const parts = [
      supabaseErr.message,
      supabaseErr.details,
      supabaseErr.hint,
      supabaseErr.code ? `código ${supabaseErr.code}` : undefined,
    ].filter(Boolean);
    if (parts.length > 0) return parts.join(" — ");
  }

  if (err instanceof Error) return err.message;
  return String(err);
}

type ImportacaoTab = "miscelaneas" | "serializados" | "toa";

type ImportacaoSearch = {
  tab: ImportacaoTab;
};

function normalizeImportacaoTab(value: unknown): ImportacaoTab {
  if (value === "serializados" || value === "toa") return value;
  return "miscelaneas";
}

export const Route = createFileRoute("/admin/importacao")({
  validateSearch: (search: Record<string, unknown>): ImportacaoSearch => ({
    tab: normalizeImportacaoTab(search.tab),
  }),
  head: () => ({
    meta: [
      { title: "Importação — Estrategic Field" },
      { name: "description", content: "Importar dados do sistema legado." },
    ],
  }),
  component: ImportacaoPage,
});

type ImportFileCardProps = {
  title: string;
  description: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  busy?: boolean;
  onImport?: (file: File) => Promise<void>;
};

function ImportFileCard({
  title,
  description,
  file,
  onFileChange,
  busy,
  onImport,
}: ImportFileCardProps) {
  const inputId = useId();
  const [isDragging, setIsDragging] = useState(false);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
  };

  const handleDragOver = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (busy) return;
    const dropped = e.dataTransfer.files?.[0] ?? null;
    onFileChange(dropped);
  };

  return (
    <div className="flex h-full flex-col justify-between rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="mb-4">
        <div className="mb-3 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
          {busy ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-6 w-6" />
          )}
        </div>
        <h2 className="font-bold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </div>

      <div className="space-y-3">
        <label
          htmlFor={inputId}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition",
            isDragging
              ? "border-green-500 bg-green-50"
              : "border-border bg-background hover:border-primary/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="text-sm font-medium text-foreground">
            {isDragging ? "Solte o arquivo aqui" : "Selecionar Arquivo"}
          </span>
          <span className="text-xs text-muted-foreground">
            Arraste e solte ou clique · .xlsx, .xls ou .csv
          </span>
          <input
            id={inputId}
            type="file"
            accept=".xlsx,.xls,.csv"
            className="sr-only"
            disabled={busy}
            onChange={handleChange}
          />
        </label>

        <p className="truncate text-xs text-muted-foreground" title={file?.name}>
          {file ? file.name : "Nenhum arquivo selecionado."}
        </p>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          disabled={!file || busy || !onImport}
          onClick={() => {
            if (file && onImport) void onImport(file);
          }}
        >
          {busy ? "Importando…" : onImport ? "Importar" : "Em breve"}
        </Button>
      </div>
    </div>
  );
}

/** Card de Miscelâneas: mesma casca visual; seleção local só para a UI, upload via handler existente. */
function MiscelaneaImportCard({
  title,
  description,
  busy,
  onImport,
}: {
  title: string;
  description: string;
  busy?: boolean;
  onImport: (file: File) => Promise<void>;
}) {
  const [file, setFile] = useState<File | null>(null);

  return (
    <ImportFileCard
      title={title}
      description={description}
      file={file}
      onFileChange={setFile}
      busy={busy}
      onImport={onImport}
    />
  );
}

function ImportacaoPage() {
  const { tab } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { user } = useApp();
  const abasCompletas = canAccessImportacaoAbasCompletas(user?.role);
  const activeTab: ImportacaoTab = abasCompletas ? tab : "toa";

  useEffect(() => {
    if (abasCompletas) return;
    if (tab === "toa") return;
    toast.error("Acesso negado a esta aba de importação.");
    void navigate({ search: { tab: "toa" }, replace: true });
  }, [abasCompletas, tab, navigate]);

  const selecionarAba = (next: ImportacaoTab) => {
    if (!abasCompletas && next !== "toa") {
      toast.error("Acesso negado a esta aba de importação.");
      void navigate({ search: { tab: "toa" }, replace: true });
      return;
    }
    void navigate({ search: { tab: next }, replace: true });
  };

  const [busyCabecalho, setBusyCabecalho] = useState(false);
  const [busyConsumo, setBusyConsumo] = useState(false);
  const [busyEstoqueBtp, setBusyEstoqueBtp] = useState(false);
  const [busyEstoqueBase, setBusyEstoqueBase] = useState(false);
  const [busyToa, setBusyToa] = useState(false);
  const [busyAnalitico, setBusyAnalitico] = useState(false);
  const [fileAtlas, setFileAtlas] = useState<File | null>(null);
  const [fileCampo, setFileCampo] = useState<File | null>(null);
  const [fileFisico, setFileFisico] = useState<File | null>(null);
  const [fileConsolidado, setFileConsolidado] = useState<File | null>(null);
  const [arquivoEstoqueTecnico, setArquivoEstoqueTecnico] = useState<File | null>(null);
  const [arquivoToa, setArquivoToa] = useState<File | null>(null);
  const [arquivoAnalitico, setArquivoAnalitico] = useState<File | null>(null);
  const [busyAtlas, setBusyAtlas] = useState(false);
  const [busyCampo, setBusyCampo] = useState(false);

  useEffect(() => {
    console.info(
      "[importacao] Para reimportar consumo com dados corrigidos, execute no SQL Editor do Supabase:\n\n" +
        "TRUNCATE TABLE public.wos_consumo;\n\n" +
        "Script completo: supabase/scripts/limpar_wos_consumo.sql",
    );
  }, []);

  const handleEstoqueAtlas = async (file: File) => {
    setBusyAtlas(true);
    try {
      const rows = await parseEstoqueAtlasFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no Estoque Atlas.");
        return;
      }
      saveEstoqueAtlas(rows);
      toast.success(`Estoque Atlas importado: ${rows.length} registros carregados.`);
    } catch (err) {
      toast.error(formatImportError("estoque-atlas", err));
    } finally {
      setBusyAtlas(false);
    }
  };

  const handleEstoqueCampo = async (file: File) => {
    setBusyCampo(true);
    try {
      const rows = await parseEstoqueCampoFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no Estoque Campo.");
        return;
      }
      saveEstoqueCampo(rows);
      toast.success(`Estoque Campo importado: ${rows.length} registros carregados.`);
    } catch (err) {
      toast.error(formatImportError("estoque-campo", err));
    } finally {
      setBusyCampo(false);
    }
  };

  const handleCabecalho = async (file: File) => {
    setBusyCabecalho(true);
    try {
      const rows = await parseWoCabecalhoFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no arquivo de cabeçalho.");
        return;
      }
      const result = await replaceWoCabecalho(rows);
      toast.success(
        `Cabeçalho importado (full load): ${result.inserted} WOs carregadas. Registros antigos foram substituídos.`,
      );
    } catch (err) {
      toast.error(formatImportError("cabecalho", err));
    } finally {
      setBusyCabecalho(false);
    }
  };

  const handleConsumo = async (file: File) => {
    setBusyConsumo(true);
    try {
      const rows = await parseWoConsumoFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no consolidado de consumo.");
        return;
      }
      const result = await upsertWoConsumo(rows);
      markKpiUltimaImportacao();
      const mergedNote =
        result.mergedDuplicates > 0
          ? ` (${result.mergedDuplicates} duplicatas na planilha foram somadas)`
          : "";
      toast.success(
        `Consumo importado: ${result.inserted} inseridas, ${result.updated} atualizadas (${rows.length} linhas lidas)${mergedNote}.`,
      );
    } catch (err) {
      const detail = formatImportError("consumo", err);
      toast.error(`Falha ao importar consumo: ${detail}`);
    } finally {
      setBusyConsumo(false);
    }
  };

  const handleEstoqueBtp = async (file: File) => {
    setBusyEstoqueBtp(true);
    try {
      const rows = await parseEstoqueBtpFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no Estoque BTP.");
        return;
      }
      saveEstoqueBtp(
        rows.map((row) => ({
          codigo: row.codigo,
          descricao: row.descricao,
        })),
      );
      const result = await upsertDimMateriais(
        rows.map((row) => ({
          material: row.codigo,
          descr_material: row.descricao,
        })),
      );
      toast.success(
        `Estoque BTP importado: ${result.inserted} inseridos, ${result.updated} atualizados (${rows.length} materiais).`,
      );
    } catch (err) {
      toast.error(formatImportError("estoque-btp", err));
    } finally {
      setBusyEstoqueBtp(false);
    }
  };

  const handleEstoqueBase = async (file: File) => {
    setBusyEstoqueBase(true);
    try {
      const rows = await parseEstoqueBaseFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no Estoque Base.");
        return;
      }
      saveEstoqueBase(rows);
      toast.success(`Estoque Base importado: ${rows.length} registros carregados.`);
    } catch (err) {
      toast.error(formatImportError("estoque-base", err));
    } finally {
      setBusyEstoqueBase(false);
    }
  };

  const handleToa = async (file: File) => {
    if (!canImportToa(user?.role) && !canImportPainelDados(user?.role)) {
      toast.error("Sem permissão para importar TOA.");
      return;
    }
    setBusyToa(true);
    try {
      const linhas = await parseToaFile(file);
      const chamados = processarChamadosTOA(linhas);
      const resultado = agregarChamadosToa(chamados);
      const canceladosSuspensos = chamados.filter(
        (c) =>
          !isStatusAtividadeContabilizavel(c.statusAtividade ?? ""),
      ).length;

      if (chamados.length === 0) {
        toast.error(
          "Nenhum chamado com Data + Login + Número da WO encontrado na aba Page 1.",
        );
        return;
      }

      const persistido = await replaceToaImportacoes(chamados);
      clearToaLocalStorage();
      markKpiUltimaImportacao();
      toast.success(
        `TOA salvo (achatado): ${persistido.totalOs} O.S. / ${persistido.totalNotas} notas-WO ` +
          `(competências ${persistido.competencias.join(", ") || "—"}). ` +
          `${resultado.totalNotasProdutivas} produtivas / ${resultado.totalNotasImprodutivas} improdutivas` +
          (canceladosSuspensos > 0
            ? ` · ${canceladosSuspensos} cancelado/suspenso gravados (fora do KPI).`
            : "."),
      );
    } catch (err) {
      toast.error(formatImportError("toa", err));
    } finally {
      setBusyToa(false);
    }
  };

  const handleAnalitico = async (file: File) => {
    if (!canImportPainelDados(user?.role)) {
      toast.error("Sem permissão para importar Analítico.");
      return;
    }
    setBusyAnalitico(true);
    try {
      const rows = await parseAnaliticoFaturamentoFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no Analítico.");
        return;
      }
      const persistido = await replaceAnaliticoHistoricoLote(rows);
      markKpiUltimaImportacao();
      const receita = rows.reduce((s, r) => s + r.valor_servico, 0);
      toast.success(
        `Analítico salvo: ${persistido.total} notas em ${persistido.meses.length} mês(es) ` +
          `(${persistido.meses.join(", ")}). Receita: R$ ${receita.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}.`,
      );
    } catch (err) {
      toast.error(formatImportError("analitico", err));
    } finally {
      setBusyAnalitico(false);
    }
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-5 pb-10 pt-6">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-black tracking-tight">
              <FileUp className="h-6 w-6 text-primary" />
              Importação de Dados
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              TOA e Analítico são gravados no Supabase (overwrite por mês). Demais
              importações seguem o fluxo atual. Admin, Gerente e COP têm o mesmo
              mapeamento de colunas e as mesmas permissões neste módulo.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        <div className="mb-6 flex gap-1 border-b border-border">
          {abasCompletas ? (
            <>
              <button
                type="button"
                onClick={() => selecionarAba("miscelaneas")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "miscelaneas"
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Miscelâneas
              </button>
              <button
                type="button"
                onClick={() => selecionarAba("serializados")}
                className={`px-4 py-2 text-sm font-medium transition-colors ${
                  activeTab === "serializados"
                    ? "border-b-2 border-primary text-foreground"
                    : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Serializados
              </button>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => selecionarAba("toa")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "toa"
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            TOA
          </button>
        </div>

        {activeTab === "miscelaneas" && abasCompletas ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <MiscelaneaImportCard
              title="Cabeçalho da WO"
              description="Colunas: workOrderID, idTecnico, status, sla, dataAtendimento. Alimenta a tela de Pendências."
              busy={busyCabecalho}
              onImport={handleCabecalho}
            />
            <MiscelaneaImportCard
              title="Consolidado de Consumo"
              description="Colunas legado: WO, Técnico, Material, Descr. Material, Qtd Baixada. Alimenta os KPIs."
              busy={busyConsumo}
              onImport={handleConsumo}
            />
            <MiscelaneaImportCard
              title="Estoque BTP"
              description="Colunas: Material, Descr. Material. Alimenta o autocomplete de KPIs e o cruzamento do Estoque Base."
              busy={busyEstoqueBtp}
              onImport={handleEstoqueBtp}
            />
            <MiscelaneaImportCard
              title="Estoque Base"
              description="Colunas: Código Alternativo, Estoque Atual, Estoque Reservado, Estoque Disponível. Alimenta o módulo Estoque Base."
              busy={busyEstoqueBase}
              onImport={handleEstoqueBase}
            />
            <ImportFileCard
              title="Estoque técnico"
              description="(Em breve) Importação do estoque em posse do técnico."
              file={arquivoEstoqueTecnico}
              onFileChange={setArquivoEstoqueTecnico}
            />
          </div>
        ) : activeTab === "serializados" && abasCompletas ? (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ImportFileCard
              title="Estoque Atlas"
              description="Colunas: Tipo, Modelo, Número Série, Estado, Data Última Alteração, Responsavél."
              file={fileAtlas}
              onFileChange={setFileAtlas}
              busy={busyAtlas}
              onImport={handleEstoqueAtlas}
            />
            <ImportFileCard
              title="Estoque Campo"
              description="Colunas: Nome, DESCRIÇÃO, N° DE SERIE, STATUS, DATA DE RETIRADA."
              file={fileCampo}
              onFileChange={setFileCampo}
              busy={busyCampo}
              onImport={handleEstoqueCampo}
            />
            <ImportFileCard
              title="Estoque Físico"
              description="Inventário físico do almoxarifado."
              file={fileFisico}
              onFileChange={setFileFisico}
            />
            <ImportFileCard
              title="Consolidado de consumo"
              description="Consolidado revisado de consumo por WO e material."
              file={fileConsolidado}
              onFileChange={setFileConsolidado}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ImportFileCard
              title="Importação TOA"
              description='Lê a aba "Page 1", faz unpivot (1 O.S. = 1 linha) e grava no Supabase. Overwrite por mês/competência. Notas no KPI = WOs distintas.'
              file={arquivoToa}
              onFileChange={setArquivoToa}
              busy={busyToa}
              onImport={handleToa}
            />
            {abasCompletas ? (
              <ImportFileCard
                title="Analítico Claro (histórico)"
                description='Lê a aba "Consolidado" do arquivo mestre IAT (62 colunas) e grava em analitico_historico. Overwrite automático por DATA_BASE. Fallback: abas mensais / ANALITICO / primeira aba.'
                file={arquivoAnalitico}
                onFileChange={setArquivoAnalitico}
                busy={busyAnalitico}
                onImport={handleAnalitico}
              />
            ) : null}
          </div>
        )}
      </main>
    </div>
  );
}
