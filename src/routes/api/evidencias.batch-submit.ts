import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { isStoragePublicUrl } from "@/lib/evidencias-grouping";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
} from "@/lib/server-env";

type BatchMaterialPayload = {
  tipo: string;
  metragem: string;
  foto_inicio_url: string;
  foto_fim_url: string;
  foto_inicio_path: string;
  foto_fim_path: string;
};

type BatchSubmitBody = {
  access_token: string;
  tecnico_id: string;
  contrato: string;
  wo: string;
  envio_grupo_id: string;
  observacao?: string;
  materiais: BatchMaterialPayload[];
};

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function parseBatchBody(body: unknown): BatchSubmitBody {
  if (!body || typeof body !== "object") {
    throw new Error("Corpo da requisição inválido.");
  }

  const input = body as Partial<BatchSubmitBody>;
  const accessToken = typeof input.access_token === "string" ? input.access_token.trim() : "";
  const tecnicoId = typeof input.tecnico_id === "string" ? input.tecnico_id.trim() : "";
  const contrato = typeof input.contrato === "string" ? input.contrato.trim() : "";
  const wo = typeof input.wo === "string" ? input.wo.trim() : "";
  const envioGrupoId =
    typeof input.envio_grupo_id === "string" ? input.envio_grupo_id.trim() : "";

  if (!accessToken) throw new Error("Campo obrigatório ausente: access_token");
  if (!tecnicoId) throw new Error("Campo obrigatório ausente: tecnico_id");
  if (!contrato) throw new Error("Campo obrigatório ausente: contrato");
  if (!wo) throw new Error("Campo obrigatório ausente: wo");
  if (!envioGrupoId) throw new Error("Campo obrigatório ausente: envio_grupo_id");

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
    const fotoInicioPath =
      "foto_inicio_path" in item && typeof item.foto_inicio_path === "string"
        ? item.foto_inicio_path.trim()
        : "";
    const fotoFimPath =
      "foto_fim_path" in item && typeof item.foto_fim_path === "string"
        ? item.foto_fim_path.trim()
        : "";

    if (!tipo) throw new Error(`Tipo do material ausente na posição ${index}.`);
    if (!metragem) throw new Error(`Metragem ausente na posição ${index}.`);
    if (!isStoragePublicUrl(fotoInicioUrl) || !isStoragePublicUrl(fotoFimUrl)) {
      throw new Error(`URLs de foto inválidas na posição ${index}.`);
    }
    if (!fotoInicioPath || !fotoFimPath) {
      throw new Error(`Paths de foto ausentes na posição ${index}.`);
    }

    const total = Number(metragem.replace(",", "."));
    if (!Number.isFinite(total) || total <= 0) {
      throw new Error(`Metragem inválida na posição ${index}.`);
    }

    return {
      tipo,
      metragem,
      foto_inicio_url: fotoInicioUrl,
      foto_fim_url: fotoFimUrl,
      foto_inicio_path: fotoInicioPath,
      foto_fim_path: fotoFimPath,
    };
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
    envio_grupo_id: envioGrupoId,
    observacao,
    materiais,
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

  return client;
}

export const Route = createFileRoute("/api/evidencias/batch-submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const payload = parseBatchBody(await request.json());
          const authedClient = await assertTecnico(payload.access_token, payload.tecnico_id);

          for (const material of payload.materiais) {
            const total = Number(material.metragem.replace(",", "."));
            const { error } = await authedClient.from("evidencias").insert({
              contrato: payload.contrato,
              wo: payload.wo,
              metragem_inicial: total,
              metragem_final: 0,
              total_utilizado: total,
              foto_inicio_url: material.foto_inicio_url,
              foto_fim_url: material.foto_fim_url,
              foto_inicio_path: material.foto_inicio_path,
              foto_fim_path: material.foto_fim_path,
              tecnico_id: payload.tecnico_id,
              enviado_por_admin: false,
              tipo_material: material.tipo,
              observacao: payload.observacao ?? null,
              envio_grupo_id: payload.envio_grupo_id,
              notificar_email: false,
            });

            if (error) throw new Error(error.message);
          }

          return Response.json({
            ok: true,
            count: payload.materiais.length,
            envio_grupo_id: payload.envio_grupo_id,
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao salvar evidências.";
          const status = message.includes("Sessão inválida") ? 401 : 400;
          return jsonError(message, status);
        }
      },
    },
  },
});
