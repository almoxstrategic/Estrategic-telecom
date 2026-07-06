import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseAnonKey,
  getSupabaseServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/server-env";

const EVIDENCIAS_BUCKET = "evidencias-fotos";
const MAX_PHOTO_BYTES = 512 * 1024;

function storagePublicUrl(path: string): string {
  return `${getSupabaseUrl()}/storage/v1/object/public/${EVIDENCIAS_BUCKET}/${path}`;
}

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

function requiredField(formData: FormData, name: string): string {
  const value = formData.get(name);
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Campo obrigatório ausente: ${name}`);
  }
  return value.trim();
}

function requiredFile(formData: FormData, name: string): File {
  const value = formData.get(name);
  if (!(value instanceof File) || value.size === 0) {
    throw new Error(`Foto obrigatória ausente: ${name}`);
  }
  return value;
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

async function uploadPhoto(
  tecnicoId: string,
  suffix: "inicio" | "fim",
  file: File,
): Promise<{ path: string; publicUrl: string }> {
  if (!file.type.startsWith("image/")) {
    throw new Error(`A foto de ${suffix} deve ser uma imagem.`);
  }
  if (file.size > MAX_PHOTO_BYTES) {
    throw new Error(
      `A foto de ${suffix} excede ${Math.round(MAX_PHOTO_BYTES / 1024)}KB após compressão.`,
    );
  }

  const supabase = createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const path = `${tecnicoId}/${crypto.randomUUID()}-${suffix}.jpg`;
  const body = typeof file.stream === "function" ? file.stream() : file;

  const { error } = await supabase.storage.from(EVIDENCIAS_BUCKET).upload(path, body, {
    cacheControl: "3600",
    upsert: false,
    contentType: "image/jpeg",
    duplex: "half",
  });

  if (error) throw new Error(error.message);

  return { path, publicUrl: storagePublicUrl(path) };
}

export const Route = createFileRoute("/api/evidencias/submit")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const formData = await request.formData();
          const accessToken = requiredField(formData, "access_token");
          const tecnicoId = requiredField(formData, "tecnico_id");
          const contrato = requiredField(formData, "contrato");
          const wo = requiredField(formData, "wo");
          const metragemInicial = Number(requiredField(formData, "metragem_inicial"));
          const metragemFinal = Number(requiredField(formData, "metragem_final"));
          const totalUtilizado = Number(requiredField(formData, "total_utilizado"));

          if (!Number.isFinite(metragemInicial) || !Number.isFinite(metragemFinal)) {
            return jsonError("Metragem inválida.", 400);
          }
          if (!Number.isFinite(totalUtilizado) || totalUtilizado < 0) {
            return jsonError("Total utilizado inválido.", 400);
          }

          const fotoInicio = requiredFile(formData, "foto_inicio");
          const fotoFim = requiredFile(formData, "foto_fim");

          const authedClient = await assertTecnico(accessToken, tecnicoId);

          const inicio = await uploadPhoto(tecnicoId, "inicio", fotoInicio);
          const fim = await uploadPhoto(tecnicoId, "fim", fotoFim);

          const { data, error } = await authedClient
            .from("evidencias")
            .insert({
              contrato,
              wo,
              metragem_inicial: metragemInicial,
              metragem_final: metragemFinal,
              total_utilizado: totalUtilizado,
              foto_inicio_url: inicio.publicUrl,
              foto_fim_url: fim.publicUrl,
              foto_inicio_path: inicio.path,
              foto_fim_path: fim.path,
              tecnico_id: tecnicoId,
              enviado_por_admin: false,
            })
            .select("*")
            .single();

          if (error) {
            await createClient(getSupabaseUrl(), getSupabaseServiceRoleKey(), {
              auth: { autoRefreshToken: false, persistSession: false },
            })
              .storage.from(EVIDENCIAS_BUCKET)
              .remove([inicio.path, fim.path]);
            return jsonError(error.message, 500);
          }

          return Response.json(data);
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro ao enviar evidência.";
          const status = message.includes("Sessão inválida") ? 401 : 400;
          return jsonError(message, status);
        }
      },
    },
  },
});
