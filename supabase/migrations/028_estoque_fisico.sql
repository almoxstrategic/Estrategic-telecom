-- Estoque físico (galpão) + estoque em campo — base do módulo Estoque Físico X BTP

create table if not exists public.estoque_fisico (
  id uuid primary key default gen_random_uuid(),
  material text not null,
  descricao_material text not null,
  quantidade_fisica double precision not null default 0,
  quantidade_campo double precision not null default 0,
  created_at timestamptz not null default now(),
  constraint estoque_fisico_material_unique unique (material)
);

create index if not exists estoque_fisico_material_idx on public.estoque_fisico (material);
create index if not exists estoque_fisico_descricao_idx on public.estoque_fisico (descricao_material);

comment on table public.estoque_fisico is
  'Estoque físico (galpão) e estoque em campo por material. Divergência futura: (fisico + campo) - BTP.';

alter table public.estoque_fisico enable row level security;

drop policy if exists "estoque_fisico_admin_all" on public.estoque_fisico;
create policy "estoque_fisico_admin_all"
  on public.estoque_fisico for all
  using (public.is_admin())
  with check (public.is_admin());
