-- Evidências: controle de notificação por e-mail (envio agrupado em lote)

alter table public.evidencias
  add column if not exists notificar_email boolean not null default true;

comment on column public.evidencias.notificar_email is
  'Quando false, o Database Webhook não deve disparar e-mail (envio agrupado via API batch-submit).';

-- Filtro recomendado no Database Webhook do Supabase:
--   event: INSERT, table: evidencias, filter: notificar_email=eq.true
