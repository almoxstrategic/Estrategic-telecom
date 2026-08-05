-- Tabela editável de preços usada nos cálculos financeiros do TOA.
create table if not exists public.precos_os (
  id uuid primary key default gen_random_uuid(),
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

insert into public.precos_os (tipo_os, valor)
values
  ('31 - REFAZER INSTALACAO', 218.48),
  ('12 - MUDANCA DE ENDERECO - INSTALAR ASSINATURA', 174.78),
  ('15 - MUDANCA DE LOCAL DE PONTO', 167.07),
  ('1 - ADESAO - INSTALACAO DE ASSINATURA', 100.00),
  ('24 - MUDANCA DE PACOTE', 98.81),
  ('REINSTALACAO - PONTO ADICIONAL', 77.11),
  ('MUDANCA DE PACOTE - AGREGADA', 59.14)
on conflict (tipo_os) do nothing;
