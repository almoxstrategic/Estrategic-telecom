-- COP pode gravar TOA (upload/importação); Analítico e demais writes seguem is_admin().

CREATE OR REPLACE FUNCTION public.can_import_toa()
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

COMMENT ON FUNCTION public.can_import_toa() IS
  'Escrita em toa_importacoes: admin, gerente ou COP.';

DROP POLICY IF EXISTS "toa_importacoes_write_admin" ON public.toa_importacoes;
CREATE POLICY "toa_importacoes_write_importadores"
  ON public.toa_importacoes FOR ALL
  USING (public.can_import_toa())
  WITH CHECK (public.can_import_toa());
