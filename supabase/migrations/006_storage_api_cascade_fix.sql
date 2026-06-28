-- Remove exclusão direta em storage.objects (proibido pelo Supabase).
-- Storage é limpo pelo front-end via Storage API antes de apagar linhas/usuários.

drop trigger if exists on_evidencia_delete_purge_storage on public.evidencias;
drop function if exists public.purge_evidencia_storage_on_delete();

-- TTL: remove apenas registros; fotos antigas devem ser limpas fora do SQL direto em storage
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

-- Garante ON DELETE CASCADE na FK para auth.users
alter table public.evidencias
  drop constraint if exists evidencias_tecnico_id_fkey;

alter table public.evidencias
  add constraint evidencias_tecnico_id_fkey
  foreign key (tecnico_id) references auth.users (id) on delete cascade;

-- Remove evidências órfãs (usuário apagado sem cascade)
delete from public.evidencias e
where not exists (
  select 1 from auth.users u where u.id = e.tecnico_id
);

-- RPC: apenas deleta o usuário; front-end limpa Storage antes
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
