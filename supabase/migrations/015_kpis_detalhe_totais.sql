-- Detalhamento de WOs e itens para modais dos totais de KPI.

create or replace function public.get_kpis_detalhe_wos(
  p_mes integer default null,
  p_ano integer default null
)
returns table (
  work_order_id text,
  id_tecnico text,
  nome_tecnico text,
  total_itens bigint,
  data_atendimento date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.work_order_id,
    c.id_tecnico,
    coalesce(p.nome, '') as nome_tecnico,
    sum(c.qtd_baixada)::bigint as total_itens,
    min(c.data_atendimento)::date as data_atendimento
  from public.wos_consumo c
  left join public.profiles p
    on upper(trim(p.identificacao)) = upper(trim(c.id_tecnico))
  where c.qtd_baixada > 0
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  group by c.work_order_id, c.id_tecnico, p.nome
  order by c.work_order_id;
$$;

create or replace function public.get_kpis_detalhe_itens(
  p_mes integer default null,
  p_ano integer default null
)
returns table (
  material text,
  descr_material text,
  total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.material,
    c.descr_material,
    sum(c.qtd_baixada)::bigint as total
  from public.wos_consumo c
  where c.qtd_baixada > 0
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  group by c.material, c.descr_material
  order by sum(c.qtd_baixada) desc;
$$;

revoke all on function public.get_kpis_detalhe_wos(integer, integer) from public;
grant execute on function public.get_kpis_detalhe_wos(integer, integer) to authenticated;

revoke all on function public.get_kpis_detalhe_itens(integer, integer) from public;
grant execute on function public.get_kpis_detalhe_itens(integer, integer) to authenticated;
