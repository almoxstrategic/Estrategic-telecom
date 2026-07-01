-- Pendências: todas as WOs em risco (status 3, SLA < 0), com ou sem evidência no app

drop function if exists public.get_pendencias_evidencias();

create or replace function public.get_pendencias_evidencias()
returns table (
  work_order_id text,
  id_tecnico text,
  nome_tecnico text,
  sla numeric,
  celular text,
  tem_evidencia boolean,
  evidencia_data_registro timestamptz
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
    w.sla,
    coalesce(p.celular, '') as celular,
    (ev.id is not null) as tem_evidencia,
    ev.data_registro as evidencia_data_registro
  from public.wos_cabecalho w
  left join public.profiles p
    on upper(trim(p.identificacao)) = upper(trim(w.id_tecnico))
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

revoke all on function public.get_pendencias_evidencias() from public;
grant execute on function public.get_pendencias_evidencias() to authenticated;
