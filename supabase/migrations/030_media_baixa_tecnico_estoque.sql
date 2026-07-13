-- Estoque em posse do técnico + RPC mês/ano para Média de Baixa por Técnico.

create table if not exists public.estoque_tecnico (
  id_tecnico text not null,
  material text not null,
  descr_material text not null default '',
  quantidade numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (id_tecnico, material)
);

create index if not exists estoque_tecnico_id_tecnico_idx
  on public.estoque_tecnico (id_tecnico);

create index if not exists estoque_tecnico_material_idx
  on public.estoque_tecnico (material);

comment on table public.estoque_tecnico is
  'Saldo atual de materiais em posse de cada técnico (estoque técnico).';

alter table public.estoque_tecnico enable row level security;

drop policy if exists "estoque_tecnico_admin_all" on public.estoque_tecnico;
create policy "estoque_tecnico_admin_all"
  on public.estoque_tecnico for all
  using (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  )
  with check (
    exists (
      select 1 from public.profiles p
      where p.id = auth.uid() and p.role = 'admin'
    )
  );

drop function if exists public.get_media_baixa_tecnico(date, date);
drop function if exists public.get_media_baixa_tecnico(integer, integer);

create or replace function public.get_media_baixa_tecnico(
  p_mes integer default null,
  p_ano integer default null
)
returns table (
  id_tecnico text,
  nome_tecnico text,
  material text,
  descr_material text,
  estoque_tecnico numeric,
  media_consumo numeric,
  autonomia_dias integer
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
      c.imported_at,
      c.data_atendimento
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
      sum(f.qtd_baixada)::numeric as total_acumulado
    from filtered f
    group by f.id_tecnico, f.material
  ),
  base as (
    select
      c.id_tecnico,
      coalesce(p.nome, '') as nome_tecnico,
      c.material,
      c.descr_material,
      coalesce(et.quantidade, 0)::numeric as estoque_tecnico,
      round(
        c.total_acumulado / nullif(w.total_wos, 0)::numeric,
        2
      ) as media_consumo
    from consumo_por_tecnico_material c
    inner join wos_por_tecnico w
      on w.id_tecnico = c.id_tecnico
    left join public.profiles p
      on upper(trim(p.identificacao)) = upper(trim(c.id_tecnico))
    left join public.estoque_tecnico et
      on upper(trim(et.id_tecnico)) = upper(trim(c.id_tecnico))
     and trim(et.material) = c.material
  )
  select
    b.id_tecnico,
    b.nome_tecnico,
    b.material,
    b.descr_material,
    b.estoque_tecnico,
    b.media_consumo,
    case
      when b.media_consumo is null or b.media_consumo <= 0 then null
      else floor(b.estoque_tecnico / b.media_consumo)::integer
    end as autonomia_dias
  from base b
  order by coalesce(nullif(trim(b.nome_tecnico), ''), b.id_tecnico) asc, b.material asc;
$$;

revoke all on function public.get_media_baixa_tecnico(integer, integer) from public;
grant execute on function public.get_media_baixa_tecnico(integer, integer) to authenticated;
