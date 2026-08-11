-- TOA: duas colunas "Janela de Serviço" da planilha (horário agendado).

ALTER TABLE public.toa_importacoes
  ADD COLUMN IF NOT EXISTS janela_servico_1 text,
  ADD COLUMN IF NOT EXISTS janela_servico_2 text;

COMMENT ON COLUMN public.toa_importacoes.janela_servico_1 IS
  'Primeira coluna Janela de Serviço da planilha TOA (horário agendado).';

COMMENT ON COLUMN public.toa_importacoes.janela_servico_2 IS
  'Segunda coluna Janela de Serviço da planilha TOA (horário agendado).';
