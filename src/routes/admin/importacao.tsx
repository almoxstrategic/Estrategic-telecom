import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { FileDropzone } from "@/components/FileDropzone";
import { replaceWoCabecalho, upsertDimMateriais, upsertEstoqueFisico, upsertWoConsumo } from "@/lib/logistica-service";
import {
  parseDimMateriaisFile,
  parseEstoqueFisicoFile,
  parseWoCabecalhoFile,
  parseWoConsumoFile,
} from "@/lib/spreadsheet-import";

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

function ImportacaoPage() {
  const [busyCabecalho, setBusyCabecalho] = useState(false);
  const [busyConsumo, setBusyConsumo] = useState(false);
  const [busyEstoque, setBusyEstoque] = useState(false);
  const [busyEstoqueFisico, setBusyEstoqueFisico] = useState(false);

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
      <main className="mx-auto max-w-3xl px-5 pb-10 pt-6">
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

        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Upload A — Cabeçalho da WO
            </h2>
            <FileDropzone
              title="Arquivo de Cabeçalho (Auditoria)"
              description="Colunas: workOrderID, idTecnico, status, sla, dataAtendimento. Alimenta a tela de Pendências."
              busy={busyCabecalho}
              onFile={handleCabecalho}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Upload B — Consolidado de Consumo
            </h2>
            <FileDropzone
              title="Consolidado Revisado (Consumo)"
              description="Colunas legado: WO, Técnico, Material, Descr. Material, Qtd Baixada. Alimenta os KPIs."
              busy={busyConsumo}
              onFile={handleConsumo}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Upload C — Consulta de Estoque
            </h2>
            <FileDropzone
              title="Catálogo Mestre de Materiais"
              description="Colunas: Material, Descr. Material. Alimenta o autocomplete de itens críticos nos KPIs."
              busy={busyEstoque}
              onFile={handleEstoque}
            />
          </section>

          <section>
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted-foreground">
              Upload D — Estoque Físico
            </h2>
            <FileDropzone
              title="Estoque Físico e Campo"
              description="Colunas: Material, Descr. Material, Qtd Física, Qtd Campo. Alimenta o módulo Estoque Físico X BTP."
              busy={busyEstoqueFisico}
              onFile={handleEstoqueFisico}
            />
          </section>
        </div>
      </main>
    </div>
  );
}
