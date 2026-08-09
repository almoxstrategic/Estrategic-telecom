-- Campos de WO (pai) no detalhamento TOA flat
ALTER TABLE public.toa_importacoes
  ADD COLUMN IF NOT EXISTS endereco text,
  ADD COLUMN IF NOT EXISTS bairro text,
  ADD COLUMN IF NOT EXISTS inicio_fim text,
  ADD COLUMN IF NOT EXISTS duracao text,
  ADD COLUMN IF NOT EXISTS tipo_atividade text,
  ADD COLUMN IF NOT EXISTS categorias_capacidade text;
