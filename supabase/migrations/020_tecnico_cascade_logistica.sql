-- Cascade lógico: ao excluir técnico, remove WOs de logística vinculadas por matrícula/login
-- e reforça ON DELETE CASCADE em evidências → auth.users

alter table public.evidencias
  drop constraint if exists evidencias_tecnico_id_fkey;

alter table public.evidencias
  add constraint evidencias_tecnico_id_fkey
  foreign key (tecnico_id) references auth.users (id) on delete cascade;

create or replace function public.delete_tecnico(target_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  evidencias_count integer;
  wos_cabecalho_count integer;
  wos_consumo_count integer;
  tecnico_nome text;
  tecnico_identificacao text;
  tecnico_login text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  select nome, identificacao, login
  into tecnico_nome, tecnico_identificacao, tecnico_login
  from public.profiles
  where id = target_id and role = 'tecnico';

  if tecnico_nome is null then
    raise exception 'Técnico não encontrado ou não pode ser excluído.';
  end if;

  select count(*)::integer into evidencias_count
  from public.evidencias
  where tecnico_id = target_id;

  delete from public.wos_consumo c
  where upper(trim(c.id_tecnico)) in (
    select upper(trim(v))
    from unnest(
      array_remove(
        array[tecnico_identificacao, tecnico_login],
        null
      )
    ) as t(v)
    where trim(v) <> ''
  );

  get diagnostics wos_consumo_count = row_count;

  delete from public.wos_cabecalho w
  where upper(trim(w.id_tecnico)) in (
    select upper(trim(v))
    from unnest(
      array_remove(
        array[tecnico_identificacao, tecnico_login],
        null
      )
    ) as t(v)
    where trim(v) <> ''
  );

  get diagnostics wos_cabecalho_count = row_count;

  delete from auth.users where id = target_id;

  return jsonb_build_object(
    'ok', true,
    'tecnico_id', target_id,
    'tecnico_nome', tecnico_nome,
    'evidencias_removidas', evidencias_count,
    'wos_cabecalho_removidas', wos_cabecalho_count,
    'wos_consumo_removidas', wos_consumo_count
  );
end;
$$;

revoke all on function public.delete_tecnico(uuid) from public;
grant execute on function public.delete_tecnico(uuid) to authenticated;
