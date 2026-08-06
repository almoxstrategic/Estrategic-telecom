-- Tabela editável de preços usada nos cálculos financeiros do TOA.
-- tipo = RESUMO; tipo_os = ATIVIDADES NO TOA.
create table if not exists public.precos_os (
  id uuid primary key default gen_random_uuid(),
  tipo text not null default '',
  tipo_os text not null unique,
  valor numeric(12, 2) not null default 0 check (valor >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.precos_os enable row level security;

drop policy if exists "precos_os_admin_all" on public.precos_os;
create policy "precos_os_admin_all"
  on public.precos_os for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.precos_os (tipo, tipo_os, valor)
values
  ('REFAZER INSTALAÇÃO', '31 - REFAZER INSTALACAO', 218.48),
  ('MUDANÇA DE ENDEREÇO', '12 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA', 174.78),
  ('MUDANÇA DE LOCAL', '15 - MUDANCA DE LOCAL DE PONTO', 167.07),
  ('ADESÃO', '1 - ADESAO - INSTALACAO DE ASSINATURA', 100.00),
  ('MUDANÇA DE PACOTE', '24 - MUDANCA DE PACOTE', 98.81),
  ('REINSTALAÇÃO', 'REINSTALACAO - PONTO ADICIONAL', 77.11),
  ('MUDANÇA DE PACOTE', 'MUDANCA DE PACOTE - AGREGADA', 59.14)
on conflict (tipo_os) do nothing;
