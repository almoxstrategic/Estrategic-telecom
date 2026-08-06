-- Persistência de faturamento: Analítico histórico (Claro) + importações TOA.
-- Idempotência por competência (YYYYMM).

create table if not exists public.analitico_historico (
  id uuid primary key default gen_random_uuid(),
  data_base integer not null,
  nr_contrato text not null default '',
  cd_os text not null,
  id_tipo_os integer,
  ds_tipo_os text not null default '',
  cd_baixa integer,
  qtde numeric(12, 4) not null default 1,
  valor_servico numeric(14, 2) not null default 0,
  dh_baixa date,
  tipo_os_consolid text not null default '',
  nm_cidade text not null default '',
  created_at timestamptz not null default now()
);

create index if not exists analitico_historico_data_base_idx
  on public.analitico_historico (data_base);

create index if not exists analitico_historico_cd_os_idx
  on public.analitico_historico (cd_os);

create table if not exists public.toa_importacoes (
  id uuid primary key default gen_random_uuid(),
  competencia integer not null,
  data date not null,
  login text not null default '',
  numero_wo text not null default '',
  contrato text not null default '',
  ordens jsonb not null default '[]'::jsonb,
  imported_at timestamptz not null default now()
);

create index if not exists toa_importacoes_competencia_idx
  on public.toa_importacoes (competencia);

create index if not exists toa_importacoes_data_idx
  on public.toa_importacoes (data);

alter table public.analitico_historico enable row level security;
alter table public.toa_importacoes enable row level security;

drop policy if exists "analitico_historico_admin_all" on public.analitico_historico;
create policy "analitico_historico_admin_all"
  on public.analitico_historico for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "toa_importacoes_admin_all" on public.toa_importacoes;
create policy "toa_importacoes_admin_all"
  on public.toa_importacoes for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.analitico_historico is
  'Gabarito financeiro Claro (DATA_BASE). Usado no painel para períodos <= 202606.';
comment on table public.toa_importacoes is
  'Notas TOA importadas (1 linha = 1 Nota/WO). Overwrite por competencia (YYYYMM).';
