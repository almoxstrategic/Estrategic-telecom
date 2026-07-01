-- Data de atendimento (Consolidado) como origem do filtro de KPIs + melhorias de RPC

alter table public.wos_consumo
  add column if not exists data_atendimento date;

create index if not exists wos_consumo_data_atendimento_idx
  on public.wos_consumo (data_atendimento);

-- Pendências: incluir login do técnico
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
    coalesce(p.login, '') as login_tecnico,
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

-- Períodos com base em data_atendimento
create or replace function public.get_periodos_consumo()
returns table (
  ano integer,
  mes integer
)
language sql
stable
security definer
set search_path = public
as $$
  select distinct
    extract(year from c.data_atendimento)::integer as ano,
    extract(month from c.data_atendimento)::integer as mes
  from public.wos_consumo c
  where c.qtd_baixada > 0
    and c.data_atendimento is not null
  order by ano desc, mes desc;
$$;

drop function if exists public.get_consumo_tecnico_detalhe(text, integer, integer);
drop function if exists public.get_consumo_itens_criticos(text[], integer, integer);
drop function if exists public.get_top_consumidores_material(text, integer, integer);

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
        limit 5
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
    c.material,
    c.descr_material,
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
    and c.material = any(p_materiais)
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

create or replace function public.get_top_consumidores_material(
  p_material text,
  p_mes integer default null,
  p_ano integer default null
)
returns table (
  id_tecnico text,
  nome_tecnico text,
  total bigint
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id_tecnico,
    coalesce(p.nome, '') as nome_tecnico,
    sum(c.qtd_baixada)::bigint as total
  from public.wos_consumo c
  left join public.profiles p
    on upper(trim(p.identificacao)) = upper(trim(c.id_tecnico))
  where c.qtd_baixada > 0
    and c.material = trim(p_material)
    and (
      p_mes is null
      or p_ano is null
      or (
        c.data_atendimento is not null
        and extract(month from c.data_atendimento)::int = p_mes
        and extract(year from c.data_atendimento)::int = p_ano
      )
    )
  group by c.id_tecnico, p.nome
  order by sum(c.qtd_baixada) desc;
$$;

revoke all on function public.get_kpis_consumo(integer, integer) from public;
grant execute on function public.get_kpis_consumo(integer, integer) to authenticated;

revoke all on function public.get_consumo_tecnico_detalhe(text, integer, integer) from public;
grant execute on function public.get_consumo_tecnico_detalhe(text, integer, integer) to authenticated;

revoke all on function public.get_consumo_itens_criticos(text[], integer, integer) from public;
grant execute on function public.get_consumo_itens_criticos(text[], integer, integer) to authenticated;

revoke all on function public.get_top_consumidores_material(text, integer, integer) from public;
grant execute on function public.get_top_consumidores_material(text, integer, integer) to authenticated;
