-- Evidências: tipo de material e observação geral por envio

alter table public.evidencias
  add column if not exists tipo_material text,
  add column if not exists observacao text;
