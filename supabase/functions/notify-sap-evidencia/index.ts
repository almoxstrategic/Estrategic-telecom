import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {
  assertWebhookSecret,
  buildEvidenciaEmail,
  extractEvidenciaData,
  finalizeEmailData,
  parseRecipients,
  resolveNomeTecnico,
  sendResendEmail,
} from "./lib.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-evidencia-webhook-secret",
};

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

    const payload = await req.json();
    const { data: partial, tecnicoId } = extractEvidenciaData(payload);
    const nomeTecnico = await resolveNomeTecnico(tecnicoId, partial.nome_tecnico);
    const emailData = finalizeEmailData(partial, nomeTecnico);
    const { subject, html } = buildEvidenciaEmail(emailData);

    const from = Deno.env.get("RESEND_FROM_EMAIL");
    const toRaw = Deno.env.get("RESEND_TO_EMAIL");

    if (!from) throw new Error("RESEND_FROM_EMAIL não configurado.");
    if (!toRaw) throw new Error("RESEND_TO_EMAIL não configurado.");

    const recipients = parseRecipients(toRaw);
    if (recipients.length === 0) {
      throw new Error("RESEND_TO_EMAIL não contém destinatários válidos.");
    }

    const result = await sendResendEmail({
      from,
      to: recipients,
      subject,
      html,
    });

    return new Response(
      JSON.stringify({
        ok: true,
        email_id: result.id ?? null,
        contrato: emailData.contrato,
        wo: emailData.wo,
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
