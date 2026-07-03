-- Expande o ranking de materiais no KPI de consumo de Top 5 para Top 7.

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
          sum(qtd_baixada)::bigint as total
        from filtered
        group by descr_material, material
        order by sum(qtd_baixada) desc
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
