-- Webhook evidencias-insert-resend: dispara apenas quando notificar_email = true
-- Equivalente ao filtro do Dashboard: notificar_email=eq.true
--
-- Nota: ao recriar em outro ambiente, preserve o header x-evidencia-webhook-secret
-- igual ao secret EVIDENCIA_WEBHOOK_SECRET da Edge Function notify-sap-evidencia.

drop trigger if exists "evidencias-insert-resend" on public.evidencias;

-- Recrie o trigger via Dashboard (Database > Webhooks) ou copie os headers do ambiente de produção.
