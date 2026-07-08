-- Cooldown diário de cobranças + reset da contagem + melhor vínculo de perfil

alter table public.wos_cabecalho
  add column if not exists ultima_data_cobranca date;

update public.wos_cabecalho
set numero_cobrancas = 0,
    ultima_data_cobranca = null;

drop function if exists public.get_pendencias_evidencias();

create or replace function public.get_pendencias_evidencias()
returns table (
  work_order_id text,
  id_tecnico text,
  nome_tecnico text,
  login_tecnico text,
  sla numeric,
  celular text,
  tem_evidencia boolean,
  evidencia_data_registro timestamptz,
  numero_cobrancas integer,
  ultima_data_cobranca date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.work_order_id,
    w.id_tecnico,
    coalesce(p.nome, '—') as nome_tecnico,
    coalesce(p.login, '') as login_tecnico,
    w.sla,
    coalesce(p.celular, '') as celular,
    (ev.id is not null) as tem_evidencia,
    ev.data_registro as evidencia_data_registro,
    coalesce(w.numero_cobrancas, 0) as numero_cobrancas,
    w.ultima_data_cobranca
  from public.wos_cabecalho w
  left join lateral (
    select
      pr.nome,
      pr.login,
      pr.celular
    from public.profiles pr
    where upper(trim(pr.identificacao)) = upper(trim(w.id_tecnico))
       or upper(trim(pr.login)) = upper(trim(w.id_tecnico))
    order by
      case
        when upper(trim(pr.identificacao)) = upper(trim(w.id_tecnico)) then 0
        when upper(trim(pr.login)) = upper(trim(w.id_tecnico)) then 1
        else 2
      end
    limit 1
  ) p on true
  left join lateral (
    select e.id, e.data_registro
    from public.evidencias e
    where trim(e.wo) = trim(w.work_order_id)
    order by e.data_registro desc
    limit 1
  ) ev on true
  where w.status = 3
    and w.sla < 0
  order by w.sla asc, w.work_order_id;
$$;

create or replace function public.increment_numero_cobrancas(p_work_order_ids text[])
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso negado';
  end if;

  update public.wos_cabecalho
  set numero_cobrancas = coalesce(numero_cobrancas, 0) + 1,
      ultima_data_cobranca = current_date,
      updated_at = now()
  where work_order_id = any(p_work_order_ids)
    and (ultima_data_cobranca is distinct from current_date);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.get_pendencias_evidencias() from public;
grant execute on function public.get_pendencias_evidencias() to authenticated;

revoke all on function public.increment_numero_cobrancas(text[]) from public;
grant execute on function public.increment_numero_cobrancas(text[]) to authenticated;
