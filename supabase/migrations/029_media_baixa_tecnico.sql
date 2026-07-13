-- Média de Baixa por Técnico: consumo médio por material / total de WOs do técnico no período.

create or replace function public.get_media_baixa_tecnico(
  p_data_inicio date default null,
  p_data_fim date default null
)
returns table (
  id_tecnico text,
  nome_tecnico text,
  material text,
  descr_material text,
  total_acumulado bigint,
  total_wos_tecnico bigint,
  media_consumo numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with filtered as (
    select
      c.id_tecnico,
      trim(c.material) as material,
      c.descr_material,
      c.qtd_baixada,
      c.work_order_id,
      c.imported_at
    from public.wos_consumo c
    where c.qtd_baixada > 0
      and (
        p_data_inicio is null
        or p_data_fim is null
        or (
          c.data_atendimento is not null
          and c.data_atendimento >= p_data_inicio
          and c.data_atendimento <= p_data_fim
        )
      )
  ),
  wos_por_tecnico as (
    select
      f.id_tecnico,
      count(distinct f.work_order_id)::bigint as total_wos
    from filtered f
    group by f.id_tecnico
  ),
  consumo_por_tecnico_material as (
    select
      f.id_tecnico,
      f.material,
      (array_agg(f.descr_material order by f.imported_at, f.work_order_id, f.descr_material))[1]
        as descr_material,
      sum(f.qtd_baixada)::bigint as total_acumulado
    from filtered f
    group by f.id_tecnico, f.material
  )
  select
    c.id_tecnico,
    coalesce(p.nome, '') as nome_tecnico,
    c.material,
    c.descr_material,
    c.total_acumulado,
    w.total_wos as total_wos_tecnico,
    round(
      c.total_acumulado::numeric / nullif(w.total_wos, 0)::numeric,
      2
    ) as media_consumo
  from consumo_por_tecnico_material c
  inner join wos_por_tecnico w
    on w.id_tecnico = c.id_tecnico
  left join public.profiles p
    on upper(trim(p.identificacao)) = upper(trim(c.id_tecnico))
  order by coalesce(nullif(trim(p.nome), ''), c.id_tecnico) asc, c.material asc;
$$;

revoke all on function public.get_media_baixa_tecnico(date, date) from public;
grant execute on function public.get_media_baixa_tecnico(date, date) to authenticated;
