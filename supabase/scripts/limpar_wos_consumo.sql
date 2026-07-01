-- =============================================================================
-- Limpeza de consumo corrompido (rodar no SQL Editor do Supabase)
-- Use APÓS deploy do fix de parse e ANTES de reimportar o Upload B.
-- =============================================================================

-- Apaga todos os registros de consumo importados
TRUNCATE TABLE public.wos_consumo;

-- Verificação
SELECT count(*) AS linhas_restantes FROM public.wos_consumo;
