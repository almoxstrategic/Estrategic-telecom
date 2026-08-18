-- Despacho de OS: múltiplos técnicos atribuídos ao mesmo relatório colaborativo.

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS tecnicos_atribuidos uuid[] NOT NULL DEFAULT '{}'::uuid[];

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS tecnicos_nomes text[] NOT NULL DEFAULT '{}'::text[];

UPDATE public.relatorios_transmissao r
SET
  tecnicos_atribuidos = ARRAY[r.tecnico_id],
  tecnicos_nomes = ARRAY[
    COALESCE(
      (SELECT p.nome FROM public.profiles p WHERE p.id = r.tecnico_id),
      ''
    )
  ]
WHERE cardinality(r.tecnicos_atribuidos) = 0;

ALTER TABLE public.relatorios_transmissao
  DROP CONSTRAINT IF EXISTS relatorios_transmissao_tecnicos_atribuidos_chk;

ALTER TABLE public.relatorios_transmissao
  ADD CONSTRAINT relatorios_transmissao_tecnicos_atribuidos_chk
  CHECK (cardinality(tecnicos_atribuidos) >= 1);

CREATE INDEX IF NOT EXISTS relatorios_transmissao_tecnicos_atribuidos_gin
  ON public.relatorios_transmissao USING GIN (tecnicos_atribuidos);

DROP POLICY IF EXISTS relatorios_transmissao_select ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_select
  ON public.relatorios_transmissao FOR SELECT
  USING (
    auth.uid() = ANY (tecnicos_atribuidos)
    OR tecnico_id = auth.uid()
    OR public.is_painel_reader()
  );

DROP POLICY IF EXISTS relatorios_transmissao_insert ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_insert
  ON public.relatorios_transmissao FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND cardinality(tecnicos_atribuidos) >= 1
    AND status = 'em_aberto'
  );

DROP POLICY IF EXISTS relatorios_transmissao_update_own ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_update_own
  ON public.relatorios_transmissao FOR UPDATE
  USING (
    auth.uid() = ANY (tecnicos_atribuidos)
    AND status <> 'fechado'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  )
  WITH CHECK (
    auth.uid() = ANY (tecnicos_atribuidos)
    AND status IN ('em_aberto', 'avisado', 'pendente')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  );

CREATE OR REPLACE FUNCTION public.relatorios_transmissao_protect_assignees()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NOT public.is_admin() THEN
    NEW.tecnicos_atribuidos := OLD.tecnicos_atribuidos;
    NEW.tecnicos_nomes := OLD.tecnicos_nomes;
    NEW.tecnico_id := OLD.tecnico_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS relatorios_transmissao_protect_assignees
  ON public.relatorios_transmissao;
CREATE TRIGGER relatorios_transmissao_protect_assignees
  BEFORE UPDATE ON public.relatorios_transmissao
  FOR EACH ROW
  EXECUTE FUNCTION public.relatorios_transmissao_protect_assignees();

COMMENT ON COLUMN public.relatorios_transmissao.tecnicos_atribuidos IS
  'IDs dos técnicos de transmissão despachados nesta OS (relatório colaborativo).';
COMMENT ON COLUMN public.relatorios_transmissao.tecnicos_nomes IS
  'Nomes snapshot dos técnicos atribuídos, na mesma ordem de tecnicos_atribuidos.';
