-- Catálogo mestre de materiais, períodos dinâmicos e reforço de cardinalidade WO+Material

comment on table public.wos_consumo is
  'Consumo por WO: chave composta (work_order_id, material) — uma WO pode ter N materiais.';

-- Garante tipo inteiro para quantidades (sem frações na operação)
alter table public.wos_consumo
  alter column qtd_baixada type integer using round(qtd_baixada)::integer;

-- ─── Catálogo mestre de estoque ────────────────────────────────────────────
create table if not exists public.dim_materiais (
  material text primary key,
  descr_material text not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dim_materiais_descr_idx on public.dim_materiais (descr_material);

alter table public.dim_materiais enable row level security;

drop policy if exists "dim_materiais_admin_all" on public.dim_materiais;
create policy "dim_materiais_admin_all"
  on public.dim_materiais for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Períodos com consumo real (qtd > 0) ───────────────────────────────────
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
    extract(year from coalesce(c.updated_at, c.imported_at))::integer as ano,
    extract(month from coalesce(c.updated_at, c.imported_at))::integer as mes
  from public.wos_consumo c
  where c.qtd_baixada > 0
  order by ano desc, mes desc;
$$;

revoke all on function public.get_periodos_consumo() from public;
grant execute on function public.get_periodos_consumo() to authenticated;

-- ─── Busca de materiais para autocomplete ────────────────────────────────────
create or replace function public.search_dim_materiais(
  p_query text default '',
  p_limit integer default 40
)
returns table (
  material text,
  descr_material text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    d.material,
    d.descr_material
  from public.dim_materiais d
  where
    coalesce(trim(p_query), '') = ''
    or d.material ilike '%' || trim(p_query) || '%'
    or d.descr_material ilike '%' || trim(p_query) || '%'
  order by d.descr_material, d.material
  limit greatest(1, least(coalesce(p_limit, 40), 100));
$$;

revoke all on function public.search_dim_materiais(text, integer) from public;
grant execute on function public.search_dim_materiais(text, integer) to authenticated;

-- Recria RPCs de KPI com filtro qtd > 0 (tipos de retorno atualizados)
drop function if exists public.get_consumo_tecnico_detalhe(text, integer, integer);
drop function if exists public.get_consumo_itens_criticos(text[], integer, integer);

-- ─── KPIs: apenas linhas com qtd > 0 ───────────────────────────────────────
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
    where c.qtd_baixada > 0
      and (
        p_mes is null
        or p_ano is null
        or (
          extract(month from coalesce(c.updated_at, c.imported_at))::int = p_mes
          and extract(year from coalesce(c.updated_at, c.imported_at))::int = p_ano
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
          id_tecnico,
          sum(qtd_baixada)::bigint as total
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
