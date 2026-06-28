-- Cascade delete + RPC para excluir técnico (Storage limpo no front-end via Storage API)

alter table public.evidencias
  drop constraint if exists evidencias_tecnico_id_fkey;

alter table public.evidencias
  add constraint evidencias_tecnico_id_fkey
  foreign key (tecnico_id) references auth.users (id) on delete cascade;

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

create or replace function public.delete_tecnico(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  evidencias_count integer;
  tecnico_nome text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  select nome into tecnico_nome
  from public.profiles
  where id = target_id and role = 'tecnico';

  if tecnico_nome is null then
    raise exception 'Técnico não encontrado ou não pode ser excluído.';
  end if;

  select count(*)::integer into evidencias_count
  from public.evidencias
  where tecnico_id = target_id;

  delete from auth.users where id = target_id;

  return jsonb_build_object(
    'ok', true,
    'tecnico_id', target_id,
    'tecnico_nome', tecnico_nome,
    'evidencias_removidas', evidencias_count
  );
end;
$$;

revoke all on function public.delete_tecnico(uuid) from public;
grant execute on function public.delete_tecnico(uuid) to authenticated;
