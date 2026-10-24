-- 046 · Resumo da Área de Trabalho (Business por áreas de negócio).
-- Números do dia e alertas de cada área, cada um só para quem tem acesso àquela parte.
-- Pode rodar de novo sem problema.

create or replace function public.resumo_area_trabalho(p_estab uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  r jsonb := '{}'::jsonb;
  hoje timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  v jsonb;
begin
  if p_estab is not null then
    if public.pode_usar(p_estab, 'C8001') or public.pode_usar(p_estab, 'G1003') then
      r := r || jsonb_build_object('vendas_hoje', (
        select coalesce(sum(i.preco * i.quantidade), 0) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
        where i.estabelecimento_id = p_estab and p.criado_em >= hoje and i.situacao <> 'cancelado'));
    end if;
    if public.pode_usar(p_estab, 'T7002') or public.pode_usar(p_estab, 'T7004') or public.pode_usar(p_estab, 'T7003') then
      r := r || jsonb_build_object(
        'pedidos_abertos', (select count(distinct i.pedido_id) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                             where i.estabelecimento_id = p_estab and i.situacao in ('aguardando', 'recebido', 'preparo', 'pronto', 'saiu')
                               and p.criado_em > now() - interval '12 hours'),
        'pedidos_atrasados', (select count(distinct i.pedido_id) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                               where i.estabelecimento_id = p_estab and i.situacao in ('recebido', 'preparo') and p.criado_em < now() - interval '20 minutes'
                                 and p.criado_em > now() - interval '12 hours'));
    end if;
    if public.pode_usar(p_estab, 'G4002') or public.pode_usar(p_estab, 'G4003') then
      begin
        r := r || jsonb_build_object('estoque_baixo', (select count(*) from public.estoque_produtos e
          where e.estabelecimento_id = p_estab and e.ativo and e.minimo is not null and e.saldo <= e.minimo));
      exception when undefined_table or undefined_column then null;
      end;
    end if;
    if public.pode_usar(p_estab, 'T7004') then
      begin
        r := r || jsonb_build_object('ocorrencias', (select count(*) from public.ocorrencias o where o.estabelecimento_id = p_estab and o.situacao = 'aberta'));
      exception when undefined_table or undefined_column then null;
      end;
      begin
        r := r || jsonb_build_object('autorizacoes', (select count(*) from public.autorizacoes a where a.estabelecimento_id = p_estab and a.situacao = 'pendente'));
      exception when undefined_table or undefined_column then null;
      end;
    end if;
    if public.pode_usar(p_estab, 'G5001') then
      begin
        select jsonb_build_object('id', e.id, 'nome', e.nome, 'inicio', e.inicio,
                                  'interessados', (select count(*) from public.eventos_interesse i where i.evento_id = e.id))
          into v
        from public.eventos e
        where e.estabelecimento_id = p_estab and e.situacao = 'publicado' and coalesce(e.fim, e.inicio + interval '6 hours') > now()
        order by e.inicio limit 1;
      exception when undefined_table then
        select jsonb_build_object('id', e.id, 'nome', e.nome, 'inicio', e.inicio) into v
        from public.eventos e
        where e.estabelecimento_id = p_estab and e.situacao = 'publicado' and coalesce(e.fim, e.inicio + interval '6 hours') > now()
        order by e.inicio limit 1;
      end;
      if v is not null then r := r || jsonb_build_object('proximo_evento', v); end if;
    end if;
  end if;

  -- Administração RoVibes
  if public.eh_admin() then
    r := r || jsonb_build_object('aprovacoes', (select count(*) from public.estabelecimentos where situacao = 'pendente'));
    begin
      r := r || jsonb_build_object('denuncias', (select count(*) from public.denuncias where situacao = 'aberta'));
    exception when undefined_table or undefined_column then null;
    end;
  end if;
  return r;
end $$;

revoke execute on function public.resumo_area_trabalho(uuid) from public, anon;
grant execute on function public.resumo_area_trabalho(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 046 aplicada: resumo da Área de Trabalho.' as resultado;
