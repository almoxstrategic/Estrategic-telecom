import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Send, CheckCircle2, AlertCircle, Trash2 } from "lucide-react";
import { AppHeader } from "@/components/AppHeader";
import { EvidencePhotoPasteProvider } from "@/components/EvidencePhotoPasteContext";
import { PhotoUpload } from "@/components/PhotoUpload";
import { TecnicoCombobox } from "@/components/TecnicoCombobox";
import { Button } from "@/components/ui/button";
import { useApp } from "@/lib/app-store";
import {
  notifyEvidenciaEmailBatch,
  removeEvidencePhotos,
  saveEvidenciaBatchRecords,
  uploadEvidencePhoto,
} from "@/lib/evidencias-service";
import { isStoragePublicUrl } from "@/lib/evidencias-grouping";
import type { EvidencePhotoRef } from "@/lib/types";
import type { TecnicoProfile } from "@/lib/team-service";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";

const TIPOS_MATERIAL = [
  "Cabo coaxial Branco",
  "Cabo Coaxial Preto",
  "Cabo Drop Low",
] as const;

type MaterialEvidencia = {
  id: string;
  tipo: string;
  fotoInicio: EvidencePhotoRef | null;
  fotoFim: EvidencePhotoRef | null;
  metragem: string;
};

function fileToBase64(file: File | Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("Falha ao converter a imagem para Base64."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler a imagem."));
  });
}

function stripBase64Prefix(dataUrl: string): string {
  const commaIndex = dataUrl.indexOf(",");
  return commaIndex >= 0 ? dataUrl.slice(commaIndex + 1) : dataUrl;
}

function sanitizeAnexoFilename(tipo: string, sufixo: "Inicio" | "Fim"): string {
  const base = tipo
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9_-]/g, "");
  return `${base || "Material"}_${sufixo}.jpg`;
}

export const Route = createFileRoute("/admin/enviar-evidencia")({
  head: () => ({
    meta: [
      { title: "Enviar Evidência — Estrategic Field" },
      { name: "description", content: "Envio de evidência em nome de um técnico." },
    ],
  }),
  component: EnviarEvidenciaPage,
});

function EnviarEvidenciaPage() {
  const { user, getAccessToken } = useApp();
  const [tecnico, setTecnico] = useState<TecnicoProfile | null>(null);
  const [contrato, setContrato] = useState("");
  const [wo, setWo] = useState("");
  const [materiais, setMateriais] = useState<MaterialEvidencia[]>([]);
  const [observacao, setObservacao] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [showIncompleteAlert, setShowIncompleteAlert] = useState(false);

  const adicionarMaterial = (tipo: string) => {
    setMateriais((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        tipo,
        fotoInicio: null,
        fotoFim: null,
        metragem: "",
      },
    ]);
  };

  const atualizarMaterial = (id: string, patch: Partial<MaterialEvidencia>) => {
    setMateriais((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const removerMaterial = (id: string) => {
    setMateriais((prev) => prev.filter((item) => item.id !== id));
  };

  const materialCompleto = (material: MaterialEvidencia) => {
    const total = parseFloat(material.metragem.replace(",", "."));
    return (
      material.metragem.trim() !== "" &&
      Number.isFinite(total) &&
      total > 0 &&
      material.fotoInicio !== null &&
      material.fotoFim !== null
    );
  };

  const canSubmit =
    !!tecnico &&
    contrato.trim() &&
    wo.trim() &&
    materiais.length > 0 &&
    materiais.every(materialCompleto) &&
    !submitting;

  const reset = () => {
    setTecnico(null);
    setContrato("");
    setWo("");
    setMateriais([]);
    setObservacao("");
  };

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || !tecnico || !user) return;

    setSubmitting(true);
    const uploadedPaths: string[] = [];

    try {
      const accessToken = getAccessToken();
      if (!accessToken) throw new Error("Sessão expirada. Faça login novamente.");

      const observacaoTexto = observacao.trim();
      const envioGrupoId = crypto.randomUUID();

      // Storage RLS só permite upload na pasta do usuário autenticado (admin).
      // O registro da evidência fica vinculado ao técnico selecionado via tecnicoId.
      const uploadOwnerId = user.id;

      const materiaisProcessados = await Promise.all(
        materiais.map(async (material) => {
          if (!material.fotoInicio || !material.fotoFim) {
            throw new Error("Material incompleto. Verifique fotos e metragem.");
          }

          const [fotoInicio, fotoFim, base64Inicio, base64Fim] = await Promise.all([
            uploadEvidencePhoto(uploadOwnerId, material.fotoInicio.file, "inicio"),
            uploadEvidencePhoto(uploadOwnerId, material.fotoFim.file, "fim"),
            fileToBase64(material.fotoInicio.file),
            fileToBase64(material.fotoFim.file),
          ]);

          if (
            !isStoragePublicUrl(fotoInicio.publicUrl) ||
            !isStoragePublicUrl(fotoFim.publicUrl)
          ) {
            throw new Error("Falha ao gerar URL pública das fotos. Tente novamente.");
          }

          uploadedPaths.push(fotoInicio.path, fotoFim.path);

          return {
            tipo: material.tipo,
            metragem: material.metragem.trim(),
            foto_inicio_url: fotoInicio.publicUrl,
            foto_fim_url: fotoFim.publicUrl,
            foto_inicio_path: fotoInicio.path,
            foto_fim_path: fotoFim.path,
            foto_inicio_base64: stripBase64Prefix(base64Inicio),
            foto_fim_base64: stripBase64Prefix(base64Fim),
            anexo_inicio_filename: sanitizeAnexoFilename(material.tipo, "Inicio"),
            anexo_fim_filename: sanitizeAnexoFilename(material.tipo, "Fim"),
          };
        }),
      );

      const batchInput = {
        accessToken,
        tecnicoId: tecnico.id,
        contrato: contrato.trim(),
        wo: wo.trim(),
        envioGrupoId,
        observacao: observacaoTexto || undefined,
        materiais: materiaisProcessados,
      };

      await notifyEvidenciaEmailBatch(batchInput);
      await saveEvidenciaBatchRecords(batchInput);

      toast.success(
        `Evidências da WO ${wo.trim()} enviadas para ${tecnico.nome} (${materiais.length} material${materiais.length > 1 ? "is" : ""})`,
        {
          icon: <CheckCircle2 className="h-5 w-5" />,
          className: "!bg-success !text-success-foreground !border-success",
        },
      );

      reset();
    } catch (err) {
      if (uploadedPaths.length > 0) {
        await removeEvidencePhotos(uploadedPaths).catch(() => undefined);
      }

      const message = (err as Error).message || "";
      const isEmailFailure =
        message.includes("e-mail") ||
        message.includes("Webhook") ||
        message.includes("webhook");

      toast.error(
        isEmailFailure
          ? "Erro: Ocorreu uma falha no envio do e-mail. A evidência não foi salva. Pode ser uma falha de credenciais de produção (NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET). Por favor, tente enviar novamente."
          : `Erro de envio: ${message || "tente novamente"}`,
        {
          icon: <AlertCircle className="h-5 w-5" />,
          className: "!bg-destructive !text-destructive-foreground !border-destructive",
        },
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitClick = () => {
    if (!canSubmit) setShowIncompleteAlert(true);
  };

  return (
    <div className="min-h-screen bg-surface">
      <AppHeader />
      <main className="mx-auto max-w-2xl px-5 pb-40 pt-4">
        <Link
          to="/admin"
          className="mb-4 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Voltar ao painel
        </Link>

        <header className="mb-6">
          <h1 className="text-2xl font-black tracking-tight">Envio pelo Técnico</h1>
          <p className="text-sm text-muted-foreground">
            Registre uma evidência em nome de um técnico que não conseguiu enviar em campo.
          </p>
        </header>

        <form id="admin-evidencia-form" onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Selecione o Técnico</label>
              <TecnicoCombobox
                value={tecnico?.id ?? null}
                onSelect={setTecnico}
                disabled={submitting}
              />
            </div>
          </div>

          <div className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Número do Contrato</label>
              <input
                inputMode="numeric"
                pattern="[0-9]*"
                value={contrato}
                onChange={(e) => setContrato(e.target.value.replace(/\D/g, ""))}
                placeholder="Ex: 458921"
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-semibold">Número da WO</label>
              <input
                type="text"
                value={wo}
                onChange={(e) => setWo(e.target.value)}
                placeholder="Ex: 12345|123456789"
                className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                required
              />
            </div>
          </div>

          <EvidencePhotoPasteProvider>
            {materiais.map((material) => (
              <div
                key={material.id}
                className="space-y-4 rounded-2xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-base font-bold">Evidência: {material.tipo}</h2>
                  <button
                    type="button"
                    onClick={() => removerMaterial(material.id)}
                    className="rounded-lg p-2 text-muted-foreground transition hover:bg-destructive/10 hover:text-destructive"
                    aria-label={`Remover ${material.tipo}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div>
                  <label className="mb-1.5 block text-sm font-semibold">Metragem (metros)</label>
                  <input
                    inputMode="decimal"
                    value={material.metragem}
                    onChange={(e) =>
                      atualizarMaterial(material.id, {
                        metragem: e.target.value.replace(",", ".").replace(/[^0-9.]/g, ""),
                      })
                    }
                    placeholder="Ex: 25"
                    className="w-full rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                    required
                  />
                </div>

                <PhotoUpload
                  label="📸 Foto de Início"
                  suffix="inicio"
                  value={material.fotoInicio}
                  onChange={(foto) => atualizarMaterial(material.id, { fotoInicio: foto })}
                />
                {material.fotoInicio ? (
                  <PhotoUpload
                    label="📸 Foto de Fim"
                    suffix="fim"
                    value={material.fotoFim}
                    onChange={(foto) => atualizarMaterial(material.id, { fotoFim: foto })}
                  />
                ) : (
                  <p className="rounded-lg border border-dashed border-border bg-surface px-4 py-3 text-xs text-muted-foreground">
                    Tire a foto de início primeiro. Isso reduz o uso de memória no celular.
                  </p>
                )}
              </div>
            ))}
          </EvidencePhotoPasteProvider>

          <div className="mt-6 border-t border-border pt-4">
            <label className="mb-2 block text-sm font-medium text-foreground">
              {materiais.length === 0
                ? "Selecione o item para evidenciar:"
                : "Adicionar novo item de evidencia:"}
            </label>
            <div className="flex flex-wrap gap-2">
              {TIPOS_MATERIAL.map((tipo) => (
                <Button
                  key={tipo}
                  type="button"
                  variant="outline"
                  size="sm"
                  className="rounded-full"
                  onClick={() => adicionarMaterial(tipo)}
                >
                  {tipo}
                </Button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <label htmlFor="observacao" className="mb-1.5 block text-sm font-semibold">
              Adicione uma observação (Opcional)
            </label>
            <textarea
              id="observacao"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex: Comecei utilizando uma caixa de cabo coaxial branca e tive que abrir outra."
              rows={4}
              className="w-full resize-y rounded-lg border border-input bg-background px-4 py-3 text-base outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>

          <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm leading-relaxed text-slate-800 shadow-sm">
            <p className="font-semibold">Lembrete; Evidencie:</p>
            <ul className="mt-2 list-disc space-y-1 pl-5">
              <li>Cabo Coaxial Branco: acima de 18 Metros</li>
              <li>Cabo Coaxial Preto: acima de 35 Metros</li>
              <li>Cabo Drop Low: acima de 78 Metros</li>
            </ul>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-relaxed text-amber-950 shadow-sm">
            <p>
              ⚠️ Se o botão &quot;Tirar Foto&quot; falhar, use o app de Câmera nativo do seu celular
              e depois escolha a opção &quot;Fazer Upload&quot;.
            </p>
          </div>
        </form>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-card/95 px-5 pt-3 pb-[max(env(safe-area-inset-bottom),1rem)] shadow-[0_-4px_16px_rgba(0,0,0,0.06)] backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <button
            type={canSubmit ? "submit" : "button"}
            form={canSubmit ? "admin-evidencia-form" : undefined}
            onClick={handleSubmitClick}
            disabled={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-4 text-base font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-hover active:scale-[0.99] disabled:cursor-not-allowed disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none"
          >
            <Send className="h-5 w-5" />
            {submitting ? "Enviando..." : "Enviar Evidência"}
          </button>
        </div>
      </div>

      <AlertDialog open={showIncompleteAlert} onOpenChange={setShowIncompleteAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-warning" />
              Formulário incompleto
            </AlertDialogTitle>
            <AlertDialogDescription>
              Selecione o técnico, preencha contrato, WO, adicione ao menos um material e complete
              metragem e fotos de início e fim para cada item antes de enviar.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
