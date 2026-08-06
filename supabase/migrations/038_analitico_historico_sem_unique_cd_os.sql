-- Permite múltiplas linhas com o mesmo CD_OS no mesmo DATA_BASE
-- (gabarito Claro tem 3 duplicatas; checksums exigem as 2162 linhas).
alter table public.analitico_historico
  drop constraint if exists analitico_historico_data_base_cd_os_key;

create index if not exists analitico_historico_cd_os_idx
  on public.analitico_historico (cd_os);
