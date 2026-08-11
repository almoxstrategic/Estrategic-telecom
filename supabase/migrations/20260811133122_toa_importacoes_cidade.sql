-- TOA: coluna Cidade (WO-mãe) para filtro geográfico no Detalhamento de Notas.

ALTER TABLE public.toa_importacoes
  ADD COLUMN IF NOT EXISTS cidade text;

COMMENT ON COLUMN public.toa_importacoes.cidade IS
  'Cidade da WO-mãe no TOA (coluna Cidade da planilha), copiada para cada O.S.';
