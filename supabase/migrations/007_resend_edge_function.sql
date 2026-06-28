-- Substitui integração n8n por Database Webhook → Edge Function (Resend)

drop trigger if exists on_evidencia_insert_notify_n8n on public.evidencias;
drop function if exists public.notify_n8n_on_evidencia_insert();

delete from public.app_config where key = 'n8n_controle_metragem_webhook';

insert into public.app_config (key, value)
values (
  'resend_edge_function',
  'notify-sap-evidencia'
)
on conflict (key) do update
  set value = excluded.value, updated_at = now();
