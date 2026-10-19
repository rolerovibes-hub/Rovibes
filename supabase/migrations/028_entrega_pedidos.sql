-- RoVibes 028: O estabelecimento decide como os pedidos chegam ao cliente (modelo do negócio):
-- entrega na mesa, retirada no balcão ou o cliente escolhe. Pode ser executado mais de uma vez.

alter table public.estabelecimentos add column if not exists entrega_pedidos text not null default 'mesa';
alter table public.estabelecimentos drop constraint if exists estabelecimentos_entrega_pedidos_check;
alter table public.estabelecimentos add constraint estabelecimentos_entrega_pedidos_check check (entrega_pedidos in ('mesa', 'retirada', 'cliente'));

create or replace function public.definir_entrega_pedidos(p_estab uuid, p_modo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.pode_usar(p_estab, 'T7004') or public.eh_admin()) then
    raise exception 'Só o dono, a gestão ou a supervisão definem como os pedidos chegam.';
  end if;
  if p_modo not in ('mesa', 'retirada', 'cliente') then raise exception 'Opção inválida.'; end if;
  update public.estabelecimentos set entrega_pedidos = p_modo where id = p_estab;
end $$;

create or replace function public.fazer_pedido(p_comanda uuid, p_itens jsonb, p_observacao text, p_cupom uuid, p_modalidade text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.comandas;
  v_cliente boolean; v_pedido uuid; v_numero int; v_modalidade text; v_regra text;
  v_total numeric := 0; v_desconto numeric;
  cp public.cupons;
  r record;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para fazer pedidos.'; end if;
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta comanda já foi fechada.'; end if;
  v_cliente := public.na_comanda(c.id);
  if not v_cliente and not public.pode_usar(c.estabelecimento_id, 'T7001') then
    raise exception 'Leia o QR code da mesa para fazer pedidos.';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Escolha pelo menos um item.';
  end if;
  -- Quem decide como o pedido chega é o estabelecimento (modelo do negócio):
  -- "mesa" (a equipe leva), "retirada" (balcão, com QR) ou "cliente" (o cliente escolhe).
  -- A equipe pode abrir exceção ao lançar. Comanda sem mesa é sempre retirada no balcão.
  select coalesce(entrega_pedidos, 'mesa') into v_regra from public.estabelecimentos where id = c.estabelecimento_id;
  if nullif(p_modalidade, '') is not null and p_modalidade not in ('mesa', 'retirada') then raise exception 'Modalidade inválida.'; end if;
  v_modalidade := case
    when c.mesa_id is null then 'retirada'
    when not v_cliente then coalesce(nullif(p_modalidade, ''), case when v_regra = 'cliente' then 'mesa' else v_regra end)
    when v_regra = 'cliente' then coalesce(nullif(p_modalidade, ''), 'mesa')
    else v_regra end;

  drop table if exists _pedido;
  create temporary table _pedido (item_id uuid, nome text, preco numeric, quantidade int, observacao text, destino text) on commit drop;
  insert into _pedido
  select ci.id, ci.nome, ci.preco, greatest(1, least(50, coalesce((x->>'quantidade')::int, 1))),
         nullif(btrim(left(x->>'observacao', 200)), ''), coalesce(cc.setor, 'cozinha')
    from jsonb_array_elements(p_itens) x
    left join public.cardapio_itens ci on ci.id = (x->>'item_id')::uuid
    left join public.cardapio_categorias cc on cc.id = ci.categoria_id;
  if exists (select 1 from _pedido where item_id is null) then raise exception 'Algum item não existe mais no cardápio.'; end if;
  for r in select p.nome from _pedido p join public.cardapio_itens ci on ci.id = p.item_id
            where ci.estabelecimento_id <> c.estabelecimento_id or not ci.disponivel or ci.preco is null loop
    raise exception '"%" não está disponível agora.', r.nome;
  end loop;
  select sum(preco * quantidade) into v_total from _pedido;

  perform pg_advisory_xact_lock(hashtext('pedido' || c.estabelecimento_id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pedidos
   where estabelecimento_id = c.estabelecimento_id
     and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;

  v_pedido := gen_random_uuid();
  insert into public.pedidos (id, estabelecimento_id, comanda_id, envio_id, numero, setor, usuario_id, lancado_por, observacao, modalidade)
  values (v_pedido, c.estabelecimento_id, c.id, v_pedido, v_numero, null,
          case when v_cliente then auth.uid() end, case when not v_cliente then auth.uid() end,
          nullif(btrim(left(p_observacao, 300)), ''), v_modalidade);
  insert into public.pedido_itens (pedido_id, estabelecimento_id, item_id, nome, preco, quantidade, observacao, destino, situacao, pronto_em)
  select v_pedido, c.estabelecimento_id, item_id, nome, preco, quantidade, observacao, destino,
         case when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
         case when destino = 'sem_preparo' then now() end
    from _pedido;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, v_pedido, 'criado', auth.uid(),
          case when v_cliente then 'Pelo App' else 'Lançado pela equipe' end || ' · ' || case v_modalidade when 'mesa' then 'entrega na mesa' else 'retirada no balcão' end);

  if p_cupom is not null then
    if not v_cliente then raise exception 'Cupons só valem em pedidos feitos pelo cliente no App.'; end if;
    select * into cp from public.cupons where id = p_cupom and usuario_id = auth.uid() for update;
    if not found then raise exception 'Cupom não encontrado.'; end if;
    if cp.estabelecimento_id <> c.estabelecimento_id then raise exception 'Este cupom é de outro lugar.'; end if;
    if cp.tipo = 'item_gratis' and not exists (select 1 from _pedido where item_id = cp.item_id) then
      raise exception 'Adicione "%" ao pedido para usar este cupom.',
        coalesce((select nome from public.cardapio_itens where id = cp.item_id), 'o item grátis');
    end if;
    v_desconto := public.desconto_do_cupom(cp.id, v_total);
    update public.cupons set situacao = 'usado', usado_em = now() where id = cp.id;
    insert into public.comanda_descontos (comanda_id, envio_id, cupom_id, usuario_id, titulo, valor)
    values (c.id, v_pedido, cp.id, auth.uid(), cp.titulo, v_desconto);
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, acao, usuario_id, detalhe)
    values (c.estabelecimento_id, v_pedido, 'cupom', auth.uid(), cp.titulo);
  end if;
  return v_pedido;
end $$;

revoke execute on function public.definir_entrega_pedidos(uuid, text) from public, anon;
grant execute on function public.definir_entrega_pedidos(uuid, text) to authenticated;

select 'RoVibes 028 aplicado com sucesso' as resultado;
