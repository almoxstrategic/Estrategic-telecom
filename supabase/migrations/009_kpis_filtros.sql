-- KPIs com filtros de período, drill-down por técnico e itens críticos

create index if not exists wos_consumo_updated_at_idx on public.wos_consumo (updated_at);
create index if not exists wos_consumo_material_idx on public.wos_consumo (material);

drop function if exists public.get_kpis_consumo();

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
    select *
    from public.wos_consumo c
    where (
      p_mes is null
      or p_ano is null
      or (
        extract(month from coalesce(c.updated_at, c.imported_at))::int = p_mes
        and extract(year from coalesce(c.updated_at, c.imported_at))::int = p_ano
      )
    )
  )
  select jsonb_build_object(
    'total_itens', coalesce((select sum(qtd_baixada) from filtered), 0),
    'total_wos', coalesce((select count(distinct work_order_id) from filtered), 0),
    'top_materiais', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          descr_material as descricao,
          material as sku,
          sum(qtd_baixada)::numeric as total
        from filtered
        group by descr_material, material
        order by sum(qtd_baixada) desc
        limit 5
      ) t
    ), '[]'::jsonb),
    'top_tecnicos', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          id_tecnico,
          sum(qtd_baixada)::numeric as total
        from filtered
        group by id_tecnico
        order by sum(qtd_baixada) desc
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
  qtd_baixada numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.material,
    c.descr_material,
    sum(c.qtd_baixada)::numeric as qtd_baixada
  from public.wos_consumo c
  where upper(trim(c.id_tecnico)) = upper(trim(p_id_tecnico))
    and (
      p_mes is null
      or p_ano is null
      or (
        extract(month from coalesce(c.updated_at, c.imported_at))::int = p_mes
        and extract(year from coalesce(c.updated_at, c.imported_at))::int = p_ano
      )
    )
  group by c.material, c.descr_material
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
  total numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.material,
    c.descr_material,
    sum(c.qtd_baixada)::numeric as total
  from public.wos_consumo c
  where c.material = any(p_materiais)
    and (
      p_mes is null
      or p_ano is null
      or (
        extract(month from coalesce(c.updated_at, c.imported_at))::int = p_mes
        and extract(year from coalesce(c.updated_at, c.imported_at))::int = p_ano
      )
    )
  group by c.material, c.descr_material
  order by sum(c.qtd_baixada) desc;
$$;

revoke all on function public.get_kpis_consumo(integer, integer) from public;
grant execute on function public.get_kpis_consumo(integer, integer) to authenticated;

revoke all on function public.get_consumo_tecnico_detalhe(text, integer, integer) from public;
grant execute on function public.get_consumo_tecnico_detalhe(text, integer, integer) to authenticated;

revoke all on function public.get_consumo_itens_criticos(text[], integer, integer) from public;
grant execute on function public.get_consumo_itens_criticos(text[], integer, integer) to authenticated;
