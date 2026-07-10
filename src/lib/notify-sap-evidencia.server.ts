import { resolveEvidenciaWebhookSecret } from "@/lib/evidencia-webhook-secret";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/server-env";

type NotifySapMaterial = {
  tipo_material: string;
  metragem: string;
  foto_inicio_url: string;
  foto_fim_url: string;
};

type NotifySapAnexo = {
  filename: string;
  content: string;
};

export async function notifySapEvidenciaBatch(
  input: {
    tecnicoId: string;
    contrato: string;
    wo: string;
    observacao?: string;
    materiais: NotifySapMaterial[];
    anexos?: NotifySapAnexo[];
  },
  webhookSecretOverride?: string,
): Promise<void> {
  const url = `${getSupabaseUrl()}/functions/v1/notify-sap-evidencia`;
  const webhookSecret = resolveEvidenciaWebhookSecret(webhookSecretOverride);
  if (!webhookSecret) {
    throw new Error(
      "Configure NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET (ou EVIDENCIA_WEBHOOK_SECRET) no ambiente de produção.",
    );
  }

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getSupabaseAnonKey()}`,
      "x-evidencia-webhook-secret": webhookSecret,
    },
    body: JSON.stringify({
      type: "BATCH",
      tecnico_id: input.tecnicoId,
      contrato: input.contrato,
      wo: input.wo,
      observacao: input.observacao,
      materiais: input.materiais.map((material) => ({
        tipo_material: material.tipo_material,
        metragem: material.metragem,
        foto_inicio_url: material.foto_inicio_url,
        foto_fim_url: material.foto_fim_url,
      })),
      anexos: input.anexos ?? [],
    }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    const detail = body?.error?.trim();
    if (response.status === 401 || detail === "Webhook não autorizado.") {
      throw new Error("Falha no envio do e-mail. Webhook não autorizado ou indisponível.");
    }
    throw new Error(detail || "Falha no envio do e-mail. Webhook não autorizado ou indisponível.");
  }
}
