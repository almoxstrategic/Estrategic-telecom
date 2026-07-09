-- Consolida agregações de materiais estritamente pelo código (ignora variações de descrição).

create or replace function public.get_kpis_consumo(
  p_mes integer default null,
  p_ano integer default null
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select c.*
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
  ),
  materiais_agrupados as (
    select
      trim(c.material) as material,
      (array_agg(c.descr_material order by c.imported_at, c.work_order_id, c.descr_material))[1]
        as descr_material,
      sum(c.qtd_baixada)::bigint as total
    from filtered c
    group by trim(c.material)
  )
  select jsonb_build_object(
    'total_itens', coalesce((select sum(qtd_baixada)::bigint from filtered), 0),
    'total_wos', coalesce((select count(distinct work_order_id) from filtered), 0),
    'top_materiais', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          descr_material as descricao,
          material as sku,
          total
        from materiais_agrupados
        order by total desc
        limit 7
      ) t
    ), '[]'::jsonb),
    'top_tecnicos', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          f.id_tecnico,
          coalesce(p.nome, '') as nome_tecnico,
          sum(f.qtd_baixada)::bigint as total
        from filtered f
        left join public.profiles p
          on upper(trim(p.identificacao)) = upper(trim(f.id_tecnico))
        group by f.id_tecnico, p.nome
        order by sum(f.qtd_baixada) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
$$;

create or replace function public.get_consumo_tecnico_detalhe(
  p_id_tecnico text,
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
    trim(c.material) as material,
    (array_agg(c.descr_material order by c.imported_at, c.work_order_id, c.descr_material))[1]
      as descr_material,
    sum(c.qtd_baixada)::bigint as qtd_baixada
  from public.wos_consumo c
  where c.qtd_baixada > 0
    and upper(trim(c.id_tecnico)) = upper(trim(p_id_tecnico))
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  group by trim(c.material)
  order by sum(c.qtd_baixada) desc;
$$;

create or replace function public.get_consumo_itens_criticos(
  p_materiais text[],
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
    trim(c.material) as material,
    (array_agg(c.descr_material order by c.imported_at, c.work_order_id, c.descr_material))[1]
      as descr_material,
    sum(c.qtd_baixada)::bigint as total
  from public.wos_consumo c
  where c.qtd_baixada > 0
    and trim(c.material) = any (
      select trim(m) from unnest(p_materiais) as t(m)
    )
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  group by trim(c.material)
  order by sum(c.qtd_baixada) desc;
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
    trim(c.material) as material,
    (array_agg(c.descr_material order by c.imported_at, c.work_order_id, c.descr_material))[1]
      as descr_material,
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
  group by trim(c.material)
  order by sum(c.qtd_baixada) desc;
$$;

revoke all on function public.get_kpis_consumo(integer, integer) from public;
grant execute on function public.get_kpis_consumo(integer, integer) to authenticated;

revoke all on function public.get_consumo_tecnico_detalhe(text, integer, integer) from public;
grant execute on function public.get_consumo_tecnico_detalhe(text, integer, integer) to authenticated;

revoke all on function public.get_consumo_itens_criticos(text[], integer, integer) from public;
grant execute on function public.get_consumo_itens_criticos(text[], integer, integer) to authenticated;

revoke all on function public.get_kpis_detalhe_itens(integer, integer) from public;
grant execute on function public.get_kpis_detalhe_itens(integer, integer) to authenticated;
