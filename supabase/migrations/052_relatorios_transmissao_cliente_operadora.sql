-- Identificação da operadora (base multi-tenant / layouts de PDF futuros)

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS cliente_operadora text NOT NULL DEFAULT 'Claro';

ALTER TABLE public.relatorios_transmissao
  DROP CONSTRAINT IF EXISTS relatorios_transmissao_cliente_operadora_check;

ALTER TABLE public.relatorios_transmissao
  ADD CONSTRAINT relatorios_transmissao_cliente_operadora_check
  CHECK (cliente_operadora IN ('Claro', 'TIM', 'Vivo', 'Outro'));

COMMENT ON COLUMN public.relatorios_transmissao.cliente_operadora IS
  'Operadora/cliente contratante (base multi-tenant para layouts de PDF).';
