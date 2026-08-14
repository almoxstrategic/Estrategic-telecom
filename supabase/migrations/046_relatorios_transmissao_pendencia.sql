-- QA: status pendente + motivo da devolução

ALTER TABLE public.relatorios_transmissao
  DROP CONSTRAINT IF EXISTS relatorios_transmissao_status_check;

ALTER TABLE public.relatorios_transmissao
  ADD CONSTRAINT relatorios_transmissao_status_check
  CHECK (status IN ('em_aberto', 'avisado', 'fechado', 'pendente'));

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS motivo_pendencia text;

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
    AND status IN ('em_aberto', 'avisado', 'pendente')
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'transmissao'
    )
  );
