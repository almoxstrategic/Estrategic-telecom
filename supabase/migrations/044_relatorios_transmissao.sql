-- Papel Técnico Transmissão + relatórios de campo (lançamento)

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_role_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_role_check
  CHECK (role IN ('admin', 'gerente', 'tecnico', 'cop', 'transmissao'));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, nome, role, identificacao, login)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'nome', split_part(NEW.email, '@', 1)),
    lower(trim(COALESCE(NEW.raw_app_meta_data ->> 'role', 'tecnico'))),
    NULLIF(NEW.raw_user_meta_data ->> 'identificacao', ''),
    COALESCE(
      NULLIF(NEW.raw_user_meta_data ->> 'login', ''),
      NULLIF(split_part(NEW.email, '@', 1), '')
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TABLE IF NOT EXISTS public.relatorios_transmissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tecnico_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  os_wf text NOT NULL,
  cliente text NOT NULL,
  endereco text NOT NULL,
  cidade text NOT NULL,
  equipe_empreiteira text NOT NULL,
  responsavel text NOT NULL,
  data_inicio_execucao date NOT NULL,
  tipo_execucao text
    CHECK (tipo_execucao IS NULL OR tipo_execucao IN ('implantacao', 'empresarial')),
  status text NOT NULL DEFAULT 'em_aberto'
    CHECK (status IN ('em_aberto', 'avisado', 'fechado')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  avisado_at timestamptz,
  fechado_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS relatorios_transmissao_status_idx
  ON public.relatorios_transmissao (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS relatorios_transmissao_tecnico_idx
  ON public.relatorios_transmissao (tecnico_id);

CREATE INDEX IF NOT EXISTS relatorios_transmissao_os_wf_idx
  ON public.relatorios_transmissao (os_wf);

CREATE OR REPLACE FUNCTION public.set_relatorios_transmissao_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorios_transmissao_set_updated_at ON public.relatorios_transmissao;
CREATE TRIGGER relatorios_transmissao_set_updated_at
  BEFORE UPDATE ON public.relatorios_transmissao
  FOR EACH ROW
  EXECUTE FUNCTION public.set_relatorios_transmissao_updated_at();

ALTER TABLE public.relatorios_transmissao ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS relatorios_transmissao_select ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_select
  ON public.relatorios_transmissao FOR SELECT
  USING (tecnico_id = auth.uid() OR public.is_painel_reader());

DROP POLICY IF EXISTS relatorios_transmissao_insert ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_insert
  ON public.relatorios_transmissao FOR INSERT
  WITH CHECK (
    tecnico_id = auth.uid()
    AND status IN ('em_aberto', 'avisado')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  );

DROP POLICY IF EXISTS relatorios_transmissao_update_own ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_update_own
  ON public.relatorios_transmissao FOR UPDATE
  USING (
    tecnico_id = auth.uid()
    AND status <> 'fechado'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  )
  WITH CHECK (
    tecnico_id = auth.uid()
    AND status IN ('em_aberto', 'avisado')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  );

DROP POLICY IF EXISTS relatorios_transmissao_update_admin ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_update_admin
  ON public.relatorios_transmissao FOR UPDATE
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS relatorios_transmissao_delete_admin ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_delete_admin
  ON public.relatorios_transmissao FOR DELETE
  USING (public.is_admin());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.relatorios_transmissao TO authenticated;

COMMENT ON TABLE public.relatorios_transmissao IS
  'Relatórios de campo da equipe de Lançamento (Transmissão).';
