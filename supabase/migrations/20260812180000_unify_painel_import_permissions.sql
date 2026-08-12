-- Unifica permissões de importação/visualização do painel:
-- admin, gerente e COP têm o mesmo SELECT/INSERT/UPDATE/DELETE em
-- toa_importacoes e analitico_historico (todas as colunas).
-- Técnicos de campo continuam sem escrita nessas tabelas.

CREATE OR REPLACE FUNCTION public.is_painel_importer()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('admin', 'gerente', 'cop')
  );
$$;

COMMENT ON FUNCTION public.is_painel_importer() IS
  'Escrita de importação no painel (TOA/Analítico): admin, gerente ou COP — paridade total.';

-- Mantém alias usado pelo app/código legado
CREATE OR REPLACE FUNCTION public.can_import_toa()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.is_painel_importer();
$$;

-- TOA: SELECT para leitores do painel; escrita completa para importadores
DROP POLICY IF EXISTS "toa_importacoes_select_painel" ON public.toa_importacoes;
DROP POLICY IF EXISTS "toa_importacoes_write_importadores" ON public.toa_importacoes;
DROP POLICY IF EXISTS "toa_importacoes_write_admin" ON public.toa_importacoes;
DROP POLICY IF EXISTS "toa_importacoes_admin_all" ON public.toa_importacoes;

CREATE POLICY "toa_importacoes_select_painel"
  ON public.toa_importacoes FOR SELECT
  USING (public.is_painel_reader());

CREATE POLICY "toa_importacoes_write_importadores"
  ON public.toa_importacoes FOR ALL
  USING (public.is_painel_importer())
  WITH CHECK (public.is_painel_importer());

-- Analítico: mesma paridade de escrita (COP importa como Admin)
DROP POLICY IF EXISTS "analitico_historico_select_painel" ON public.analitico_historico;
DROP POLICY IF EXISTS "analitico_historico_write_admin" ON public.analitico_historico;
DROP POLICY IF EXISTS "analitico_historico_admin_all" ON public.analitico_historico;

CREATE POLICY "analitico_historico_select_painel"
  ON public.analitico_historico FOR SELECT
  USING (public.is_painel_reader());

CREATE POLICY "analitico_historico_write_importadores"
  ON public.analitico_historico FOR ALL
  USING (public.is_painel_importer())
  WITH CHECK (public.is_painel_importer());

-- Garante privilégios de tabela (todas as colunas atuais e futuras via table-level)
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.toa_importacoes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.analitico_historico TO authenticated;

-- Força PostgREST a recarregar o schema (colunas cidade / janela_servico_*)
NOTIFY pgrst, 'reload schema';
