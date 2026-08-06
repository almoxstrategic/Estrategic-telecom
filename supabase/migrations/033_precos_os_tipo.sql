-- Evolui a tabela de preços para o modelo RESUMO + ATIVIDADES NO TOA + Valor.
alter table public.precos_os
  add column if not exists tipo text not null default '';

comment on column public.precos_os.tipo is 'Categoria/resumo (coluna RESUMO da planilha de preços).';
comment on column public.precos_os.tipo_os is 'Atividade exata no TOA (coluna ATIVIDADES NO TOA).';

-- Preenche o RESUMO a partir das atividades já seedadas.
update public.precos_os
set tipo = 'ADESÃO'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('1 - ADESAO - INSTALACAO DE ASSINATURA'));

update public.precos_os
set tipo = 'MUDANÇA DE PACOTE'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('24 - MUDANCA DE PACOTE'));

update public.precos_os
set tipo = 'MUDANÇA DE PACOTE'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('MUDANCA DE PACOTE - AGREGADA'));

update public.precos_os
set tipo = 'MUDANÇA DE ENDEREÇO'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('12 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA'));

update public.precos_os
set tipo = 'MUDANÇA DE LOCAL'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('15 - MUDANCA DE LOCAL DE PONTO'));

update public.precos_os
set tipo = 'REFAZER INSTALAÇÃO'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('31 - REFAZER INSTALACAO'));

update public.precos_os
set tipo = 'REINSTALAÇÃO'
where coalesce(trim(tipo), '') = ''
  and upper(trim(tipo_os)) = upper(trim('REINSTALACAO - PONTO ADICIONAL'));
