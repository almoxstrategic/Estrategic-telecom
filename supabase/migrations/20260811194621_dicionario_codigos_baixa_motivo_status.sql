-- Classificação operacional do dicionário de códigos de baixa.
ALTER TABLE public.dicionario_codigos_baixa
  ADD COLUMN IF NOT EXISTS motivo_quebra TEXT,
  ADD COLUMN IF NOT EXISTS status_contrato TEXT;

COMMENT ON COLUMN public.dicionario_codigos_baixa.motivo_quebra IS
  'Classificação da quebra: COMERCIAL, TÉCNICO ou PRODUTIVO (quando aplicável).';

COMMENT ON COLUMN public.dicionario_codigos_baixa.status_contrato IS
  'Status da nota no contrato: PRODUTIVO ou IMPRODUTIVO.';
