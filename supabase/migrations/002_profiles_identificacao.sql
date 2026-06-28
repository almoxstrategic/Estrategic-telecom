-- Identificação de login (substitui e-mail visível para técnicos)

alter table public.profiles
  add column if not exists identificacao text;

create unique index if not exists profiles_identificacao_unique_idx
  on public.profiles (identificacao)
  where identificacao is not null;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, nome, role, identificacao)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome', split_part(new.email, '@', 1)),
    coalesce(new.raw_app_meta_data ->> 'role', 'tecnico'),
    coalesce(
      new.raw_user_meta_data ->> 'identificacao',
      nullif(split_part(new.email, '@', 1), '')
    )
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
