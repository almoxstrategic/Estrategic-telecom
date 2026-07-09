-- Agrupa materiais enviados juntos na mesma submissão de metragem

alter table public.evidencias
  add column if not exists envio_grupo_id uuid;

create index if not exists evidencias_envio_grupo_id_idx
  on public.evidencias (envio_grupo_id);

comment on column public.evidencias.envio_grupo_id is
  'Identificador compartilhado entre materiais enviados no mesmo formulário /metragem.';
