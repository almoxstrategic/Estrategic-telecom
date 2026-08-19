-- Técnico dono da OS (tecnico_id) também pode atualizar o rascunho.
-- A policy de SELECT já permitia tecnico_id; a de UPDATE só checava tecnicos_atribuidos,
-- o que gerava UPDATE com 0 linhas e "Falha ao salvar" no auto-save.

DROP POLICY IF EXISTS relatorios_transmissao_update_own ON public.relatorios_transmissao;
CREATE POLICY relatorios_transmissao_update_own
  ON public.relatorios_transmissao FOR UPDATE
  USING (
    (
      auth.uid() = ANY (tecnicos_atribuidos)
      OR tecnico_id = auth.uid()
    )
    AND status <> 'fechado'
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  )
  WITH CHECK (
    (
      auth.uid() = ANY (tecnicos_atribuidos)
      OR tecnico_id = auth.uid()
    )
    AND status IN ('em_aberto', 'avisado', 'pendente')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  );
