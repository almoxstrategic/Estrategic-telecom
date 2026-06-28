-- Estrategic: schema inicial (evidências, perfis, storage, TTL 30 dias)

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  nome text not null,
  role text not null check (role in ('admin', 'tecnico')),
  created_at timestamptz not null default now()
);

create table if not exists public.evidencias (
  id uuid primary key default gen_random_uuid(),
  contrato text not null,
  wo text not null,
  metragem_inicial numeric not null,
  metragem_final numeric not null,
  total_utilizado numeric not null,
  foto_inicio_url text not null,
  foto_fim_url text not null,
  foto_inicio_path text not null,
  foto_fim_path text not null,
  data_registro timestamptz not null default now(),
  tecnico_id uuid not null references auth.users (id) on delete cascade
);

create index if not exists evidencias_tecnico_id_idx on public.evidencias (tecnico_id);
create index if not exists evidencias_data_registro_idx on public.evidencias (data_registro);

alter table public.profiles enable row level security;
alter table public.evidencias enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data ->> 'role', 'tecnico')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Profiles RLS
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_admin());

drop policy if exists "profiles_update_admin" on public.profiles;
create policy "profiles_update_admin"
  on public.profiles for update
  using (public.is_admin());

-- Evidencias RLS
drop policy if exists "evidencias_select_own_or_admin" on public.evidencias;
create policy "evidencias_select_own_or_admin"
  on public.evidencias for select
  using (tecnico_id = auth.uid() or public.is_admin());

drop policy if exists "evidencias_insert_own" on public.evidencias;
create policy "evidencias_insert_own"
  on public.evidencias for insert
  with check (tecnico_id = auth.uid());

drop policy if exists "evidencias_delete_admin" on public.evidencias;
create policy "evidencias_delete_admin"
  on public.evidencias for delete
  using (public.is_admin());

-- Storage bucket
insert into storage.buckets (id, name, public)
values ('evidencias-fotos', 'evidencias-fotos', true)
on conflict (id) do update set public = true;

drop policy if exists "evidencias_fotos_select" on storage.objects;
create policy "evidencias_fotos_select"
  on storage.objects for select
  using (bucket_id = 'evidencias-fotos');

drop policy if exists "evidencias_fotos_insert_own" on storage.objects;
create policy "evidencias_fotos_insert_own"
  on storage.objects for insert
  with check (
    bucket_id = 'evidencias-fotos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "evidencias_fotos_delete_admin" on storage.objects;
create policy "evidencias_fotos_delete_admin"
  on storage.objects for delete
  using (bucket_id = 'evidencias-fotos' and public.is_admin());

-- TTL: remove apenas registros (fotos limpas via Storage API no app ou job externo)
create or replace function public.purge_evidencias_antigas()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.evidencias
  where data_registro < now() - interval '30 days';
end;
$$;

select cron.unschedule(jobid)
from cron.job
where jobname = 'purge-evidencias-30d';

select cron.schedule(
  'purge-evidencias-30d',
  '0 3 * * *',
  $$select public.purge_evidencias_antigas();$$
);
