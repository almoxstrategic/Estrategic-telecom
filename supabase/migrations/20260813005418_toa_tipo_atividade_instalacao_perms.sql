-- Garante coluna tipo_atividade (serviço real da WO) sem alterar colunas existentes.
-- Permissões: políticas RLS de tabela (SELECT via is_painel_reader;
-- INSERT/UPDATE/DELETE via is_painel_importer = admin/gerente/COP) e
-- GRANT table-level já existentes cobrem esta coluna automaticamente.

ALTER TABLE public.toa_importacoes
  ADD COLUMN IF NOT EXISTS tipo_atividade text;

COMMENT ON COLUMN public.toa_importacoes.tipo_atividade IS
  'Serviço real da WO (2ª coluna "Tipo de Atividade" da planilha TOA: Instalacao, Retorno Credenciada, etc.). Nullable.';

NOTIFY pgrst, 'reload schema';
