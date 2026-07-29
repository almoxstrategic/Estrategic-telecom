-- Status operacional do técnico na Gestão de Equipe (Ativos / Demitidos).
alter table public.profiles
  add column if not exists status text not null default 'ATIVO';

alter table public.profiles
  drop constraint if exists profiles_status_check;

alter table public.profiles
  add constraint profiles_status_check
  check (status in ('ATIVO', 'DEMITIDO'));

comment on column public.profiles.status is 'ATIVO | DEMITIDO — abas da Gestão de Equipe';
