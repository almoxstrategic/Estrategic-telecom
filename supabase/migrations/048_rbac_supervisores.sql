-- RBAC: Supervisor de IAT e Supervisor de Transmissão
-- herdam o mesmo acesso de escrita do Admin/Gerente.

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN (
    'admin',
    'gerente',
    'tecnico',
    'cop',
    'transmissao',
    'supervisor_iat',
    'supervisor_transmissao'
  ));

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
      AND role IN ('admin', 'gerente', 'supervisor_iat', 'supervisor_transmissao')
  );
$$;

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
      AND role IN (
        'admin',
        'gerente',
        'cop',
        'supervisor_iat',
        'supervisor_transmissao'
      )
  );
$$;

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
      AND role IN (
        'admin',
        'gerente',
        'cop',
        'supervisor_iat',
        'supervisor_transmissao'
      )
  );
$$;

COMMENT ON FUNCTION public.is_admin() IS
  'Escrita no painel: admin, gerente ou supervisores.';
COMMENT ON FUNCTION public.is_painel_reader() IS
  'Leitura no painel: admin, gerente, supervisores ou COP.';
COMMENT ON FUNCTION public.is_painel_importer() IS
  'Escrita de importação no painel: admin, gerente, supervisores ou COP.';

DROP POLICY IF EXISTS "estoque_tecnico_admin_all" ON public.estoque_tecnico;
CREATE POLICY "estoque_tecnico_admin_all"
  ON public.estoque_tecnico FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());
