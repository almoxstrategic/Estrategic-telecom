import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { resolveEvidenciaWebhookSecret } from "@/lib/evidencia-webhook-secret";
import { isStoragePublicUrl } from "@/lib/evidencias-grouping";
import { notifySapEvidenciaBatch } from "@/lib/notify-sap-evidencia.server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/server-env";

type NotifyMaterialPayload = {
  tipo: string;
  metragem: string;
  foto_inicio_url: string;
  foto_fim_url: string;
};

type NotifyAnexoPayload = {
  filename: string;
  content: string;
};

type NotifyEmailBody = {
  access_token: string;
  tecnico_id: string;
  contrato: string;
  wo: string;
  observacao?: string;
  materiais: NotifyMaterialPayload[];
  anexos: NotifyAnexoPayload[];
};

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function parseAnexos(value: unknown): NotifyAnexoPayload[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error("Campo anexos inválido.");
  }

  return value.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Anexo inválido na posição ${index}.`);
    }

    const filename =
      "filename" in item && typeof item.filename === "string" ? item.filename.trim() : "";
    const content =
      "content" in item && typeof item.content === "string" ? item.content.trim() : "";

    if (!filename) throw new Error(`Nome do anexo ausente na posição ${index}.`);
    if (!content) throw new Error(`Conteúdo do anexo ausente na posição ${index}.`);

    return { filename, content };
  });
}

function parseNotifyBody(body: unknown): NotifyEmailBody & { webhook_secret?: string } {
  if (!body || typeof body !== "object") {
    throw new Error("Corpo da requisição inválido.");
  }

  const input = body as Partial<NotifyEmailBody & { webhook_secret?: string }>;
  const accessToken = typeof input.access_token === "string" ? input.access_token.trim() : "";
  const tecnicoId = typeof input.tecnico_id === "string" ? input.tecnico_id.trim() : "";
  const contrato = typeof input.contrato === "string" ? input.contrato.trim() : "";
  const wo = typeof input.wo === "string" ? input.wo.trim() : "";

  if (!accessToken) throw new Error("Campo obrigatório ausente: access_token");
  if (!tecnicoId) throw new Error("Campo obrigatório ausente: tecnico_id");
  if (!contrato) throw new Error("Campo obrigatório ausente: contrato");
  if (!wo) throw new Error("Campo obrigatório ausente: wo");

  if (!Array.isArray(input.materiais) || input.materiais.length === 0) {
    throw new Error("Informe ao menos um material.");
  }

  const materiais = input.materiais.map((item, index) => {
    if (!item || typeof item !== "object") {
      throw new Error(`Material inválido na posição ${index}.`);
    }

    const tipo = "tipo" in item && typeof item.tipo === "string" ? item.tipo.trim() : "";
    const metragem =
      "metragem" in item && typeof item.metragem === "string" ? item.metragem.trim() : "";
    const fotoInicioUrl =
      "foto_inicio_url" in item && typeof item.foto_inicio_url === "string"
        ? item.foto_inicio_url.trim()
        : "";
    const fotoFimUrl =
      "foto_fim_url" in item && typeof item.foto_fim_url === "string"
        ? item.foto_fim_url.trim()
        : "";

    if (!tipo) throw new Error(`Tipo do material ausente na posição ${index}.`);
    if (!metragem) throw new Error(`Metragem ausente na posição ${index}.`);
    if (!isStoragePublicUrl(fotoInicioUrl) || !isStoragePublicUrl(fotoFimUrl)) {
      throw new Error(`URLs de foto inválidas na posição ${index}.`);
    }

    return { tipo, metragem, foto_inicio_url: fotoInicioUrl, foto_fim_url: fotoFimUrl };
  });

  const observacao =
    typeof input.observacao === "string" && input.observacao.trim()
      ? input.observacao.trim()
      : undefined;

  return {
    access_token: accessToken,
    tecnico_id: tecnicoId,
    contrato,
    wo,
    observacao,
    materiais,
    anexos: parseAnexos(input.anexos),
    webhook_secret:
      typeof input.webhook_secret === "string" && input.webhook_secret.trim()
        ? input.webhook_secret.trim()
        : undefined,
  };
}

async function assertTecnico(accessToken: string, tecnicoId: string) {
  const client = createClient(getSupabaseUrl(), getSupabaseAnonKey(), {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const {
    data: { user },
    error,
  } = await client.auth.getUser();

  if (error || !user) {
    throw new Error("Sessão inválida. Faça login novamente.");
  }
  if (user.id !== tecnicoId) {
    throw new Error("Técnico não autorizado para este envio.");
  }
}

export const Route = createFileRoute("/api/evidencias/notify-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = parseNotifyBody(await request.json());
          await assertTecnico(payload.access_token, payload.tecnico_id);

          const webhookSecret = resolveEvidenciaWebhookSecret(
            request.headers.get("x-evidencia-webhook-secret") ??
              payload.webhook_secret ??
              undefined,
          );

          if (!webhookSecret) {
            throw new Error(
              "Configure NEXT_PUBLIC_EVIDENCIA_WEBHOOK_SECRET (ou EVIDENCIA_WEBHOOK_SECRET) no ambiente de produção.",
            );
          }

          await notifySapEvidenciaBatch(
            {
              tecnicoId: payload.tecnico_id,
              contrato: payload.contrato,
              wo: payload.wo,
              observacao: payload.observacao,
              materiais: payload.materiais.map((material) => ({
                tipo_material: material.tipo,
                metragem: material.metragem,
                foto_inicio_url: material.foto_inicio_url,
                foto_fim_url: material.foto_fim_url,
              })),
              anexos: payload.anexos,
            },
            webhookSecret,
          );

          return Response.json({ ok: true });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Falha no envio do e-mail.";
          const status = message.includes("Sessão inválida") ? 401 : 400;
          return jsonError(message, status);
        }
      },
    },
  },
});
