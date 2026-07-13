import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  assertWebhookSecret,
  buildEvidenciaEmail,
  extractEvidenciaData,
  finalizeEmailData,
  parseAnexos,
  parseRecipients,
  resolveTecnicoInfo,
  sendResendEmail,
} from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evidencia-webhook-secret",
};

/** Remetente de teste Resend (sandbox) — domínio verificado da plataforma. */
const RESEND_FROM = "Sistema BTP <onboarding@resend.dev>";

function resolveRecipients(): string[] {
  const raw = Deno.env.get("RESEND_TO_EMAIL")?.trim() ?? "";
  const recipients = parseRecipients(raw);
  if (recipients.length === 0) {
    throw new Error(
      "RESEND_TO_EMAIL não configurado. Defina o secret na Edge Function (ex: almoxstrategic@gmail.com).",
    );
  }
  return recipients;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Método não permitido." }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    assertWebhookSecret(req);

    const recipients = resolveRecipients();
    const payload = await req.json();

    // Rota de isolamento: texto puro, sem HTML e sem anexos.
    if (payload?.type === "CONNECTION_TEST") {
      const result = await sendResendEmail({
        from: RESEND_FROM,
        to: recipients,
        subject: "Teste de conexao de email",
        text: "Hello World",
      });

      return new Response(
        JSON.stringify({
          ok: true,
          mode: "CONNECTION_TEST",
          email_id: result.id ?? null,
          from: RESEND_FROM,
          to: recipients,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { data: partial, tecnicoId } = extractEvidenciaData(payload);
    const tecnico = await resolveTecnicoInfo(tecnicoId, partial.nome_tecnico);
    const emailData = finalizeEmailData(partial, tecnico);
    const anexos = parseAnexos(payload?.anexos);
    const { subject, html, attachments } = await buildEvidenciaEmail(emailData, anexos);

    const result = await sendResendEmail({
      from: RESEND_FROM,
      to: recipients,
      subject,
      html,
      attachments,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        email_id: result.id ?? null,
        contrato: emailData.contrato,
        wo: emailData.wo,
        anexos: attachments.length,
        from: RESEND_FROM,
        to: recipients,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("[notify-sap-evidencia]", error);

    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Erro interno.",
      }),
      {
        status: error instanceof Error && error.message === "Webhook não autorizado." ? 401 : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
