-- Equipes de Transmissão: cadastro persistente para despacho de OS.

CREATE TABLE IF NOT EXISTS public.equipes_transmissao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT equipes_transmissao_nome_unique UNIQUE (nome),
  CONSTRAINT equipes_transmissao_nome_not_blank CHECK (char_length(trim(nome)) >= 1)
);

CREATE TABLE IF NOT EXISTS public.equipe_transmissao_tecnicos (
  equipe_id uuid NOT NULL REFERENCES public.equipes_transmissao (id) ON DELETE CASCADE,
  tecnico_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (equipe_id, tecnico_id)
);

CREATE INDEX IF NOT EXISTS equipe_transmissao_tecnicos_tecnico_id_idx
  ON public.equipe_transmissao_tecnicos (tecnico_id);

CREATE OR REPLACE FUNCTION public.equipes_transmissao_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS equipes_transmissao_set_updated_at ON public.equipes_transmissao;
CREATE TRIGGER equipes_transmissao_set_updated_at
  BEFORE UPDATE ON public.equipes_transmissao
  FOR EACH ROW
  EXECUTE FUNCTION public.equipes_transmissao_set_updated_at();

ALTER TABLE public.equipes_transmissao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipe_transmissao_tecnicos ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS equipes_transmissao_select ON public.equipes_transmissao;
CREATE POLICY equipes_transmissao_select
  ON public.equipes_transmissao FOR SELECT
  USING (public.is_painel_reader());

DROP POLICY IF EXISTS equipes_transmissao_write ON public.equipes_transmissao;
CREATE POLICY equipes_transmissao_write
  ON public.equipes_transmissao FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS equipe_transmissao_tecnicos_select ON public.equipe_transmissao_tecnicos;
CREATE POLICY equipe_transmissao_tecnicos_select
  ON public.equipe_transmissao_tecnicos FOR SELECT
  USING (public.is_painel_reader());

DROP POLICY IF EXISTS equipe_transmissao_tecnicos_write ON public.equipe_transmissao_tecnicos;
CREATE POLICY equipe_transmissao_tecnicos_write
  ON public.equipe_transmissao_tecnicos FOR ALL
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

COMMENT ON TABLE public.equipes_transmissao IS
  'Equipes de transmissão usadas no despacho de OS/contratos.';
COMMENT ON TABLE public.equipe_transmissao_tecnicos IS
  'Técnicos (role transmissao) associados a cada equipe de transmissão.';
