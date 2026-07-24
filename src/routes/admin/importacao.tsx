import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useId, useState, type ChangeEvent } from "react";
import { FileSpreadsheet, FileUp, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { replaceWoCabecalho, upsertDimMateriais, upsertEstoqueFisico, upsertWoConsumo } from "@/lib/logistica-service";
import {
  parseDimMateriaisFile,
  parseEstoqueFisicoFile,
  parseWoCabecalhoFile,
  parseWoConsumoFile,
} from "@/lib/spreadsheet-import";
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

export const Route = createFileRoute("/admin/importacao")({
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

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onFileChange(e.target.files?.[0] ?? null);
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
          className={cn(
            "flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-background px-4 py-5 text-center transition hover:border-primary/50",
            busy && "pointer-events-none opacity-60",
          )}
        >
          <span className="text-sm font-medium text-foreground">Selecionar Arquivo</span>
          <span className="text-xs text-muted-foreground">.xlsx, .xls ou .csv</span>
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
          disabled={!file || busy}
          onClick={() => {
            if (file && onImport) void onImport(file);
          }}
        >
          {busy ? "Importando…" : "Importar"}
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
  const [activeTab, setActiveTab] = useState<"miscelaneas" | "serializados">("miscelaneas");
  const [busyCabecalho, setBusyCabecalho] = useState(false);
  const [busyConsumo, setBusyConsumo] = useState(false);
  const [busyEstoque, setBusyEstoque] = useState(false);
  const [busyEstoqueFisico, setBusyEstoqueFisico] = useState(false);
  const [fileAtlas, setFileAtlas] = useState<File | null>(null);
  const [fileCampo, setFileCampo] = useState<File | null>(null);
  const [fileFisico, setFileFisico] = useState<File | null>(null);
  const [fileConsolidado, setFileConsolidado] = useState<File | null>(null);

  useEffect(() => {
    console.info(
      "[importacao] Para reimportar consumo com dados corrigidos, execute no SQL Editor do Supabase:\n\n" +
        "TRUNCATE TABLE public.wos_consumo;\n\n" +
        "Script completo: supabase/scripts/limpar_wos_consumo.sql",
    );
  }, []);

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

  const handleEstoque = async (file: File) => {
    setBusyEstoque(true);
    try {
      const rows = await parseDimMateriaisFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada na consulta de estoque.");
        return;
      }
      const result = await upsertDimMateriais(rows);
      toast.success(
        `Estoque importado: ${result.inserted} inseridos, ${result.updated} atualizados (${rows.length} materiais).`,
      );
    } catch (err) {
      toast.error(formatImportError("estoque", err));
    } finally {
      setBusyEstoque(false);
    }
  };

  const handleEstoqueFisico = async (file: File) => {
    setBusyEstoqueFisico(true);
    try {
      const rows = await parseEstoqueFisicoFile(file);
      if (rows.length === 0) {
        toast.error("Nenhuma linha válida encontrada no estoque físico.");
        return;
      }
      const result = await upsertEstoqueFisico(rows);
      toast.success(
        `Estoque físico importado: ${result.inserted} inseridos, ${result.updated} atualizados (${rows.length} materiais).`,
      );
    } catch (err) {
      toast.error(formatImportError("estoque-fisico", err));
    } finally {
      setBusyEstoqueFisico(false);
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
              Leitura no navegador (CSV/XLSX) antes de enviar ao Supabase.
            </p>
          </div>
          <Link to="/admin" className="text-sm font-semibold text-primary hover:underline">
            ← Voltar ao painel
          </Link>
        </div>

        <div className="mb-6 flex gap-1 border-b border-border">
          <button
            type="button"
            onClick={() => setActiveTab("miscelaneas")}
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
            onClick={() => setActiveTab("serializados")}
            className={`px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === "serializados"
                ? "border-b-2 border-primary text-foreground"
                : "border-b-2 border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            Serializados
          </button>
        </div>

        {activeTab === "miscelaneas" ? (
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
              title="Consulta de Estoque"
              description="Colunas: Material, Descr. Material. Alimenta o autocomplete de itens críticos nos KPIs."
              busy={busyEstoque}
              onImport={handleEstoque}
            />
            <MiscelaneaImportCard
              title="Estoque Físico"
              description="Colunas: Material, Descr. Material, Qtd Física, Qtd Campo. Alimenta o módulo Estoque Físico X BTP."
              busy={busyEstoqueFisico}
              onImport={handleEstoqueFisico}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <ImportFileCard
              title="Estoque Atlas"
              description="Planilha de estoque Atlas (BTP / sistema)."
              file={fileAtlas}
              onFileChange={setFileAtlas}
            />
            <ImportFileCard
              title="Estoque Campo"
              description="Quantidades em poder das equipes de campo."
              file={fileCampo}
              onFileChange={setFileCampo}
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
        )}
      </main>
    </div>
  );
}
