# Supabase → n8n via pg_net (Database Webhook)
# O front-end NÃO chama o n8n. Este trigger dispara após INSERT em evidencias.

create extension if not exists pg_net with schema extensions;

create table if not exists public.app_config (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table public.app_config enable row level security;

drop policy if exists "app_config_admin_read" on public.app_config;
create policy "app_config_admin_read"
  on public.app_config for select
  using (public.is_admin());

insert into public.app_config (key, value)
values (
  'n8n_controle_metragem_webhook',
  'https://almoxestrategic.app.n8n.cloud/webhook/d408b389-4567-4b3f-83eb-afa9ffe0d919'
)
on conflict (key) do update
  set value = excluded.value, updated_at = now();

create or replace function public.notify_n8n_on_evidencia_insert()
returns trigger
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  webhook_url text;
  tecnico_nome text;
  tecnico_login text;
  tecnico_matricula text;
  payload jsonb;
begin
  select value into webhook_url
  from public.app_config
  where key = 'n8n_controle_metragem_webhook';

  if webhook_url is null or btrim(webhook_url) = '' then
    return new;
  end if;

  select nome, login, identificacao
  into tecnico_nome, tecnico_login, tecnico_matricula
  from public.profiles
  where id = new.tecnico_id;

  payload := jsonb_build_object(
    'nome_tecnico', coalesce(tecnico_nome, ''),
    'tecnico_id', new.tecnico_id,
    'tecnico_login', coalesce(tecnico_login, ''),
    'tecnico_matricula', coalesce(tecnico_matricula, ''),
    'contrato', new.contrato,
    'wo', new.wo,
    'metragem_inicial', new.metragem_inicial,
    'metragem_final', new.metragem_final,
    'total_utilizado', new.total_utilizado,
    'urls_das_fotos', jsonb_build_object(
      'inicio', new.foto_inicio_url,
      'fim', new.foto_fim_url
    ),
    'data_registro', new.data_registro,
    'record', jsonb_build_object(
      'id', new.id,
      'contrato', new.contrato,
      'wo', new.wo,
      'metragem_inicial', new.metragem_inicial,
      'metragem_final', new.metragem_final,
      'total_utilizado', new.total_utilizado,
      'foto_inicio_url', new.foto_inicio_url,
      'foto_fim_url', new.foto_fim_url,
      'foto_inicio_path', new.foto_inicio_path,
      'foto_fim_path', new.foto_fim_path,
      'data_registro', new.data_registro,
      'tecnico_id', new.tecnico_id
    )
  );

  perform net.http_post(
    url := webhook_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body := payload
  );

  return new;
end;
$$;

drop trigger if exists on_evidencia_insert_notify_n8n on public.evidencias;
create trigger on_evidencia_insert_notify_n8n
  after insert on public.evidencias
  for each row execute function public.notify_n8n_on_evidencia_insert();
