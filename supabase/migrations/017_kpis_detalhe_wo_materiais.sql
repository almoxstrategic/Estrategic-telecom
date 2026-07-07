-- Materiais consumidos em uma WO específica (drill-down do modal de WOs Processadas).

create or replace function public.get_kpis_detalhe_wo_materiais(
  p_work_order_id text,
  p_mes integer default null,
  p_ano integer default null
)
returns table (
  material text,
  descr_material text,
  qtd_baixada bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.material,
    c.descr_material,
    c.qtd_baixada::bigint
  from public.wos_consumo c
  where c.work_order_id = p_work_order_id
    and c.qtd_baixada > 0
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  order by c.descr_material;
$$;

revoke all on function public.get_kpis_detalhe_wo_materiais(text, integer, integer) from public;
grant execute on function public.get_kpis_detalhe_wo_materiais(text, integer, integer) to authenticated;
