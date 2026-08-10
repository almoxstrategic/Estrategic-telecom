-- RBAC: papel COP (leitura no painel) + is_painel_reader()

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gerente', 'tecnico', 'cop'));

-- Escrita / gestão: admin e gerente
CREATE OR REPLACE FUNCTION public.is_admin()
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
      AND role IN ('admin', 'gerente')
  );
$$;

-- Leitura no painel: admin, gerente e COP
CREATE OR REPLACE FUNCTION public.is_painel_reader()
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

COMMENT ON FUNCTION public.is_admin() IS
  'Escrita no painel: admin ou gerente.';
COMMENT ON FUNCTION public.is_painel_reader() IS
  'Leitura no painel: admin, gerente ou COP.';

-- Profiles: COP pode listar equipe (select); escrita continua admin/gerente
DROP POLICY IF EXISTS "profiles_select_own_or_admin" ON public.profiles;
CREATE POLICY "profiles_select_own_or_admin"
  ON public.profiles FOR SELECT
  USING (id = auth.uid() OR public.is_painel_reader());

-- TOA / Analítico / preços / dicionário — select para painel, write só admin
DROP POLICY IF EXISTS "toa_importacoes_admin_all" ON public.toa_importacoes;
CREATE POLICY "toa_importacoes_select_painel"
  ON public.toa_importacoes FOR SELECT
  USING (public.is_painel_reader());
CREATE POLICY "toa_importacoes_write_admin"
  ON public.toa_importacoes FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "analitico_historico_admin_all" ON public.analitico_historico;
CREATE POLICY "analitico_historico_select_painel"
  ON public.analitico_historico FOR SELECT
  USING (public.is_painel_reader());
CREATE POLICY "analitico_historico_write_admin"
  ON public.analitico_historico FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "precos_os_admin_all" ON public.precos_os;
CREATE POLICY "precos_os_select_painel"
  ON public.precos_os FOR SELECT
  USING (public.is_painel_reader());
CREATE POLICY "precos_os_write_admin"
  ON public.precos_os FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "dicionario_codigos_baixa_admin_all" ON public.dicionario_codigos_baixa;
CREATE POLICY "dicionario_codigos_baixa_select_painel"
  ON public.dicionario_codigos_baixa FOR SELECT
  USING (public.is_painel_reader());
CREATE POLICY "dicionario_codigos_baixa_write_admin"
  ON public.dicionario_codigos_baixa FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
