-- Backlog de OS: permite despacho sem técnicos e com cliente/endereço vazios.

ALTER TABLE public.relatorios_transmissao
  DROP CONSTRAINT IF EXISTS relatorios_transmissao_tecnicos_atribuidos_chk;

ALTER TABLE public.relatorios_transmissao
  ALTER COLUMN tecnico_id DROP NOT NULL;

DROP POLICY IF EXISTS relatorios_transmissao_insert ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_insert
  ON public.relatorios_transmissao FOR INSERT
  WITH CHECK (
    public.is_admin()
    AND status = 'em_aberto'
  );

COMMENT ON COLUMN public.relatorios_transmissao.tecnicos_atribuidos IS
  'IDs dos técnicos despachados. Array vazio = OS em backlog, ainda sem atribuição.';
