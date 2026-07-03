-- Permite que administradores corrijam WO e contrato nas evidências

drop policy if exists "evidencias_update_admin" on public.evidencias;
create policy "evidencias_update_admin"
  on public.evidencias for update
  using (public.is_admin())
  with check (public.is_admin());
