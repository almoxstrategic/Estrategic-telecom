-- Permite excluir qualquer colaborador da Gestão de Equipe (exceto admin).
-- Antes: delete_tecnico só aceitava role = 'tecnico' (falhava em transmissão, gerente, COP, etc.).

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
  tecnico_role text;
begin
  if auth.uid() is null then
    raise exception 'Não autenticado.';
  end if;

  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.';
  end if;

  select nome, identificacao, login, role
  into tecnico_nome, tecnico_identificacao, tecnico_login, tecnico_role
  from public.profiles
  where id = target_id
    and role <> 'admin';

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
    'tecnico_role', tecnico_role,
    'evidencias_removidas', evidencias_count,
    'wos_cabecalho_removidas', wos_cabecalho_count,
    'wos_consumo_removidas', wos_consumo_count
  );
end;
$$;

revoke all on function public.delete_tecnico(uuid) from public;
grant execute on function public.delete_tecnico(uuid) to authenticated;

comment on function public.delete_tecnico(uuid) is
  'Exclui colaborador da equipe (qualquer role exceto admin): auth.users + cascata profiles/evidências/relatórios.';
