-- Timestamp de quando o admin sinalizou a pendência

ALTER TABLE public.relatorios_transmissao
  ADD COLUMN IF NOT EXISTS data_pendencia timestamptz;
