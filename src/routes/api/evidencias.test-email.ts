import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { testSapEmailConnection } from "@/lib/notify-sap-evidencia.server";
import { getSupabaseAnonKey, getSupabaseUrl } from "@/lib/server-env";

function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status });
}

async function assertAdmin(accessToken: string) {
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

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) throw profileError;
  if (profile?.role !== "admin") {
    throw new Error("Apenas administradores podem testar o envio de e-mail.");
  }

  return user;
}

export const Route = createFileRoute("/api/evidencias/test-email")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as {
            access_token?: string;
          } | null;
          const accessToken =
            typeof body?.access_token === "string" ? body.access_token.trim() : "";
          if (!accessToken) {
            return jsonError("Campo obrigatório ausente: access_token", 400);
          }

          await assertAdmin(accessToken);
          const result = await testSapEmailConnection();

          return Response.json({
            ok: true,
            email_id: result.email_id,
            message:
              "E-mail de teste (texto puro) enviado. Verifique a caixa de entrada e a quarentena.",
          });
        } catch (error) {
          const message =
            error instanceof Error ? error.message : "Erro ao testar e-mail.";
          const status =
            message.includes("Sessão inválida") || message.includes("administradores")
              ? 401
              : 400;
          return jsonError(message, status);
        }
      },
    },
  },
});
