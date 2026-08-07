-- Recria analitico_historico para o consolidado IAT (62 colunas de negócio).
-- Dados antigos (schema reduzido) são descartados; reimportar o Consolidado.

drop policy if exists "analitico_historico_admin_all" on public.analitico_historico;
drop table if exists public.analitico_historico cascade;

create table public.analitico_historico (
  id uuid primary key default gen_random_uuid(),

  data_base integer not null,
  nm_cidade text,
  nm_subcluster text,
  nm_cluster text,
  nm_regional text,
  cd_operadora integer,
  nr_contrato bigint,
  cd_os bigint,
  id_tipo_os integer,
  ds_tipo_os text,
  cd_baixa integer,
  tipo_os_consolid text,
  terminal text,
  tipo_term text,
  dt_agendamento timestamptz,
  dh_abertura timestamptz,
  dh_baixa timestamptz,
  dh_real_inicio_trabalho timestamptz,
  dh_real_termino_trabalho timestamptz,
  ds_janela_agendamento text,
  cd_user_abertura text,
  cd_user_baixa text,
  servidor text,
  id_equipe text,
  segmentacao text,
  id_empr_execucao text,
  ds_prestadora_servico text,
  produto_de text,
  produto_para text,
  tipo_edificacao text,
  contrato_mestre text,
  c_custo text,
  d_c_custo text,
  id_grp text,
  id_grp_item text,
  tempo numeric(14, 4),
  valor_hh numeric(14, 4),
  codigo text,
  conta_contabil text,
  cnpj_empresa text,
  qtde numeric(14, 4),
  dh_instal timestamptz,
  tipo_empresa text,
  valor_servico numeric(14, 4),
  id_item text,
  id_item_hfc text,
  id_item_geral text,
  cidade_apuracao text,
  fg_baixa text,
  c_custo_hfc text,
  d_custo_hfc text,
  c_custo_geral text,
  d_c_custo_geral text,
  modelo_eqp text,
  tipo_eqp text,
  node_ativo text,
  dt_acss_now timestamptz,
  dt_acss_telco timestamptz,
  fg_pagto_now_telco text,
  cd_ibge text,
  ds_centro_custo_sap text,
  unidade_negocio text,

  created_at timestamptz not null default now()
);

create index analitico_historico_data_base_idx
  on public.analitico_historico (data_base);

create index analitico_historico_cd_os_idx
  on public.analitico_historico (cd_os);

create index analitico_historico_nr_contrato_idx
  on public.analitico_historico (nr_contrato);

alter table public.analitico_historico enable row level security;

create policy "analitico_historico_admin_all"
  on public.analitico_historico for all
  using (public.is_admin())
  with check (public.is_admin());

comment on table public.analitico_historico is
  'Consolidado de pagamento IAT (Claro). Overwrite por DATA_BASE na importação.';
