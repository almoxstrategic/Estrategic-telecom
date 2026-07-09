-- Pendências: expor data de geração da WO (data de atendimento do consolidado)

drop function if exists public.get_pendencias_evidencias();

create or replace function public.get_pendencias_evidencias()
returns table (
  work_order_id text,
  id_tecnico text,
  nome_tecnico text,
  login_tecnico text,
  sla numeric,
  celular text,
  tem_evidencia boolean,
  evidencia_data_registro timestamptz,
  numero_cobrancas integer,
  ultima_data_cobranca date,
  data_geracao_wo date
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.work_order_id,
    w.id_tecnico,
    coalesce(p.nome, '—') as nome_tecnico,
    coalesce(p.login, '') as login_tecnico,
    w.sla,
    coalesce(p.celular, '') as celular,
    (ev.id is not null) as tem_evidencia,
    ev.data_registro as evidencia_data_registro,
    coalesce(w.numero_cobrancas, 0) as numero_cobrancas,
    w.ultima_data_cobranca,
    (
      select min(c.data_atendimento)::date
      from public.wos_consumo c
      where trim(c.work_order_id) = trim(w.work_order_id)
        and c.data_atendimento is not null
    ) as data_geracao_wo
  from public.wos_cabecalho w
  left join lateral (
    select
      pr.nome,
      pr.login,
      pr.celular
    from public.profiles pr
    where upper(trim(pr.identificacao)) = upper(trim(w.id_tecnico))
       or upper(trim(pr.login)) = upper(trim(w.id_tecnico))
    order by
      case
        when upper(trim(pr.identificacao)) = upper(trim(w.id_tecnico)) then 0
        when upper(trim(pr.login)) = upper(trim(w.id_tecnico)) then 1
        else 2
      end
    limit 1
  ) p on true
  left join lateral (
    select e.id, e.data_registro
    from public.evidencias e
    where trim(e.wo) = trim(w.work_order_id)
    order by e.data_registro desc
    limit 1
  ) ev on true
  where w.status = 3
    and w.sla < 0
  order by w.sla asc, w.work_order_id;
$$;

revoke all on function public.get_pendencias_evidencias() from public;
grant execute on function public.get_pendencias_evidencias() to authenticated;
