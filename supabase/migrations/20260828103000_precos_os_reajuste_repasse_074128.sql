-- Reajuste global definitivo (+0,74128%) nos preços de OS.
-- Alinha projeção ao repasse consolidado por contrato (operadora).
-- Estrutura da tabela inalterada; apenas valor e updated_at.

update public.precos_os
set
  valor = round((valor * 1.0074128)::numeric, 2),
  updated_at = now()
where valor > 0;

comment on table public.precos_os is
  'Catálogo editável de preços TOA. Reajuste repasse +0,74128% aplicado em 2026-08-28.';
