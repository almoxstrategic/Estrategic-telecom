-- Logística MVP: matrícula alfanumérica, celular, WOs importadas e RPCs de KPI/pendências

alter table public.profiles
  add column if not exists celular varchar(20);

comment on column public.profiles.identificacao is 'Matrícula alfanumérica do técnico (ex: Z628337)';

-- ─── Cabeçalho WO (auditoria / pendências) ───────────────────────────────
create table if not exists public.wos_cabecalho (
  work_order_id text primary key,
  id_tecnico text not null,
  status integer not null,
  sla numeric not null,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists wos_cabecalho_id_tecnico_idx on public.wos_cabecalho (id_tecnico);
create index if not exists wos_cabecalho_status_sla_idx on public.wos_cabecalho (status, sla);

-- ─── Consumo de material (KPIs) ──────────────────────────────────────────
create table if not exists public.wos_consumo (
  work_order_id text not null,
  id_tecnico text not null,
  material text not null,
  descr_material text not null,
  qtd_baixada numeric not null default 0,
  imported_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (work_order_id, material)
);

create index if not exists wos_consumo_id_tecnico_idx on public.wos_consumo (id_tecnico);

-- ─── RLS ───────────────────────────────────────────────────────────────────
alter table public.wos_cabecalho enable row level security;
alter table public.wos_consumo enable row level security;

drop policy if exists "wos_cabecalho_admin_all" on public.wos_cabecalho;
create policy "wos_cabecalho_admin_all"
  on public.wos_cabecalho for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "wos_consumo_admin_all" on public.wos_consumo;
create policy "wos_consumo_admin_all"
  on public.wos_consumo for all
  using (public.is_admin())
  with check (public.is_admin());

-- ─── Pendências: WOs atrasadas sem evidência no app ────────────────────────
create or replace function public.get_pendencias_evidencias()
returns table (
  work_order_id text,
  id_tecnico text,
  nome_tecnico text,
  sla numeric,
  celular text
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
    coalesce(p.celular, '') as celular
  from public.wos_cabecalho w
  left join public.profiles p
    on upper(trim(p.identificacao)) = upper(trim(w.id_tecnico))
  where w.status = 3
    and w.sla < 0
    and not exists (
      select 1
      from public.evidencias e
      where trim(e.wo) = trim(w.work_order_id)
    )
  order by w.sla asc, w.work_order_id;
$$;

revoke all on function public.get_pendencias_evidencias() from public;
grant execute on function public.get_pendencias_evidencias() to authenticated;

-- ─── KPIs de consumo agregados ─────────────────────────────────────────────
create or replace function public.get_kpis_consumo()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'total_itens', coalesce((select sum(qtd_baixada) from public.wos_consumo), 0),
    'total_wos', coalesce((select count(distinct work_order_id) from public.wos_consumo), 0),
    'top_materiais', coalesce((
      select jsonb_agg(row_to_json(t))
      from (
        select
          descr_material as descricao,
          material as sku,
          sum(qtd_baixada)::numeric as total
        from public.wos_consumo
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
        from public.wos_consumo
        group by id_tecnico
        order by sum(qtd_baixada) desc
        limit 10
      ) t
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.get_kpis_consumo() from public;
grant execute on function public.get_kpis_consumo() to authenticated;
