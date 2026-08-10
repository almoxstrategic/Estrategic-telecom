-- Permite papel gerente com o mesmo acesso de painel do admin (RLS via is_admin).

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gerente', 'tecnico'));

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

COMMENT ON FUNCTION public.is_admin() IS
  'True se o usuário autenticado tem role admin ou gerente (acesso ao painel).';
