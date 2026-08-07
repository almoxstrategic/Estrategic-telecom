-- TOA achatado: 1 linha = 1 O.S. (mesmo granularidade do Analítico).
-- Recria toa_importacoes (dados anteriores eram 1 linha = 1 WO + JSON).
-- Reimporte o TOA após aplicar esta migration.

drop table if exists public.toa_importacoes cascade;

create table public.toa_importacoes (
  id uuid primary key default gen_random_uuid(),
  competencia integer not null,
  data_toa date not null,
  nome_tecnico text not null default '',
  login_tecnico text not null default '',
  numero_wo text not null default '',
  contrato text not null default '',
  numero_os text not null default '',
  tipo_os text not null default '',
  cod_baixa integer,
  status_os text not null default '',
  status_nota text not null default 'Improdutiva'
    check (status_nota in ('Produtiva', 'Improdutiva')),
  imported_at timestamptz not null default now()
);

create index toa_importacoes_competencia_idx on public.toa_importacoes (competencia);
create index toa_importacoes_data_toa_idx on public.toa_importacoes (data_toa);
create index toa_importacoes_numero_wo_idx on public.toa_importacoes (numero_wo);
create index toa_importacoes_numero_os_idx on public.toa_importacoes (numero_os);
create index toa_importacoes_contrato_idx on public.toa_importacoes (contrato);

alter table public.toa_importacoes enable row level security;

create policy "toa_importacoes_admin_all"
  on public.toa_importacoes for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.toa_importacoes is
  'TOA achatado: 1 linha = 1 O.S. Overwrite por competencia (YYYYMM). Cruzamento futuro: numero_os ↔ analitico_historico.cd_os.';
