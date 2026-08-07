-- Status da Atividade da WO (visita), repetido em cada O.S. filha.
alter table public.toa_importacoes
  add column if not exists status_atividade text not null default '';

comment on column public.toa_importacoes.status_atividade is
  'Status da Atividade da WO-mãe no TOA (concluído, cancelado, suspenso, etc.), copiado para cada O.S.';

create index if not exists toa_importacoes_status_atividade_idx
  on public.toa_importacoes (status_atividade);
