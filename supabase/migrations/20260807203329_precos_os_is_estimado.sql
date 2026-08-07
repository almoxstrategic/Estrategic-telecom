-- Marca preços preenchidos por estimativa de semelhança (não pelo Analítico).
alter table public.precos_os
  add column if not exists is_estimado boolean not null default false;

comment on column public.precos_os.is_estimado is
  'true = preço preenchido por estimativa de semelhança (não veio do Analítico)';

create index if not exists precos_os_is_estimado_idx
  on public.precos_os (is_estimado)
  where is_estimado = true;
