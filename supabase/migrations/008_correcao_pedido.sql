-- RoVibes 008: correção ao fazer pedido (erro "DELETE requires a WHERE clause").
-- Pode ser executado mais de uma vez.

-- Faz o pedido: p_itens = [{"item_id": "...", "quantidade": 2, "observacao": "sem gelo"}].
-- Cliente na comanda (pelo App, pode usar 1 cupom) ou equipe com Mesas e comandas.
create or replace function public.fazer_pedido(p_comanda uuid, p_itens jsonb, p_observacao text, p_cupom uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.comandas;
  v_cliente boolean; v_envio uuid := gen_random_uuid(); v_numero int;
  v_total numeric := 0; v_desconto numeric; v_pedido uuid;
  cp public.cupons;
  r record; s text;
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

  -- Itens válidos, do mesmo lugar, disponíveis e com preço.
  -- Tabela de trabalho só desta chamada (o Supabase não aceita DELETE sem WHERE).
  drop table if exists _pedido;
  create temporary table _pedido (item_id uuid, nome text, preco numeric, quantidade int, observacao text, setor text) on commit drop;
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

  -- Número do pedido do dia (#1, #2...) por estabelecimento.
  perform pg_advisory_xact_lock(hashtext('pedido' || c.estabelecimento_id::text));
  select coalesce(max(numero), 0) + 1 into v_numero from public.pedidos
   where estabelecimento_id = c.estabelecimento_id
     and (criado_em at time zone 'America/Sao_Paulo')::date = (now() at time zone 'America/Sao_Paulo')::date;

  for s in select distinct setor from _pedido order by 1 loop
    insert into public.pedidos (estabelecimento_id, comanda_id, envio_id, numero, setor, usuario_id, lancado_por, observacao)
    values (c.estabelecimento_id, c.id, v_envio, v_numero, s,
            case when v_cliente then auth.uid() end, case when not v_cliente then auth.uid() end,
            nullif(btrim(left(p_observacao, 300)), ''))
    returning id into v_pedido;
    insert into public.pedido_itens (pedido_id, item_id, nome, preco, quantidade, observacao)
    select v_pedido, item_id, nome, preco, quantidade, observacao from _pedido where setor = s;
  end loop;

  -- Cupom (só pelo App, do próprio cliente e deste lugar).
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
    values (c.id, v_envio, cp.id, auth.uid(), cp.titulo, v_desconto);
  end if;
  return v_envio;
end $$;

grant execute on function public.fazer_pedido(uuid, jsonb, text, uuid) to authenticated;

select 'RoVibes 008 aplicado com sucesso' as resultado;
