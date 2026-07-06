-- Flag de origem do envio: técnico (false) vs admin em nome do técnico (true).

alter table public.evidencias
  add column if not exists enviado_por_admin boolean not null default false;

comment on column public.evidencias.enviado_por_admin is
  'true quando o admin enviou a evidência pelo módulo Envio pelo Técnico.';
