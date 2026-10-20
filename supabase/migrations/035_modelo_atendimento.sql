-- 035 · Modelo de atendimento de cada lugar
-- O estabelecimento decide:
--   • se tem atendimento em mesas;
--   • com mesas: se o cliente precisa ler o QR da mesa para pedir (ou escolhe a mesa na lista)
--     e se é comanda (paga no fim) ou pré-pago (paga cada pedido na hora);
--   • sem mesas: o cliente pede pelo cardápio, paga na hora pelo App e retira no balcão.
-- Pedido pré-pago só vai para o preparo depois que o Mercado Pago aprova; sem pagamento em 30 min, é cancelado.
-- Pode rodar de novo sem problema.

alter table public.estabelecimentos add column if not exists tem_mesas boolean not null default true;
alter table public.estabelecimentos add column if not exists exige_qr_mesa boolean not null default true;
alter table public.estabelecimentos add column if not exists pagamento_mesa text not null default 'comanda';
alter table public.estabelecimentos drop constraint if exists estabelecimentos_pagamento_mesa_check;
alter table public.estabelecimentos add constraint estabelecimentos_pagamento_mesa_check check (pagamento_mesa in ('comanda', 'prepago'));

alter table public.pedido_itens drop constraint if exists pedido_itens_situacao_check;
alter table public.pedido_itens add constraint pedido_itens_situacao_check
  check (situacao in ('aguardando', 'recebido', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado'));

alter table public.pagamentos drop constraint if exists pagamentos_alvo_check;
alter table public.pagamentos add constraint pagamentos_alvo_check check (alvo in ('comanda', 'retirada', 'ingresso', 'pedido'));

-- Quem decide: dono, gestão ou supervisão.
create or replace function public.definir_atendimento(p_estab uuid, p_tem_mesas boolean, p_exige_qr boolean, p_pagamento text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.pode_usar(p_estab, 'T7004') or public.eh_admin()) then
    raise exception 'Só o dono, a gestão ou a supervisão definem o atendimento.';
  end if;
  if p_pagamento not in ('comanda', 'prepago') then raise exception 'Forma de pagamento inválida.'; end if;
  update public.estabelecimentos
     set tem_mesas = coalesce(p_tem_mesas, true),
         exige_qr_mesa = coalesce(p_exige_qr, true),
         pagamento_mesa = p_pagamento,
         -- Sem mesas, o pedido é sempre retirado no balcão.
         entrega_pedidos = case when coalesce(p_tem_mesas, true) then entrega_pedidos else 'retirada' end
   where id = p_estab;
end $$;

-- Itens pré-pagos sem pagamento há mais de 30 min são cancelados (o cupom volta para a carteira).
create or replace function public.limpar_nao_pagos(p_estab uuid)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select distinct p.id, p.envio_id, p.usuario_id from public.pedidos p join public.pedido_itens i on i.pedido_id = p.id
            where p.estabelecimento_id = p_estab and i.situacao = 'aguardando' and p.criado_em < now() - interval '30 minutes'
              and not exists (select 1 from public.pagamentos g where g.alvo = 'pedido' and g.alvo_id = p.id and g.situacao = 'aprovado') loop
    update public.pedido_itens set situacao = 'cancelado', motivo_cancelamento = 'Pagamento não concluído', atualizado_em = now()
     where pedido_id = r.id and situacao = 'aguardando';
    update public.cupons set situacao = 'disponivel', usado_em = null
     where id in (select cupom_id from public.comanda_descontos where envio_id = r.envio_id and usuario_id = r.usuario_id);
    delete from public.comanda_descontos where envio_id = r.envio_id and usuario_id = r.usuario_id;
  end loop;
end $$;

-- Como este lugar atende (para o cardápio e a comanda no App).
create or replace function public.modelo_atendimento(p_estab uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'tem_mesas', e.tem_mesas,
    'exige_qr', e.exige_qr_mesa,
    'pagamento', case when e.tem_mesas then e.pagamento_mesa else 'prepago' end,
    'entrega', case when e.tem_mesas then e.entrega_pedidos else 'retirada' end,
    'mesas', case when e.tem_mesas and not e.exige_qr_mesa then
      (select coalesce(jsonb_agg(jsonb_build_object('id', m.id, 'numero', m.numero, 'area', m.area) order by m.area nulls first, m.numero), '[]'::jsonb)
         from public.mesas m where m.estabelecimento_id = e.id and m.ativa) end,
    'minha_comanda', (select c.id from public.comandas c join public.comanda_pessoas cp on cp.comanda_id = c.id
                       where c.estabelecimento_id = e.id and c.situacao = 'aberta' and cp.usuario_id = auth.uid()
                       order by c.aberta_em desc limit 1))
    from public.estabelecimentos e
   where e.id = p_estab and e.situacao = 'aprovado';
$$;

-- Mesa escolhida na lista (quando o lugar não exige o QR).
create or replace function public.entrar_na_mesa_id(p_mesa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare m public.mesas; e public.estabelecimentos; v_comanda uuid;
begin
  perform public.exigir_conta_ativa();
  select * into m from public.mesas where id = p_mesa and ativa;
  if not found then raise exception 'Mesa não encontrada.'; end if;
  select * into e from public.estabelecimentos where id = m.estabelecimento_id and situacao = 'aprovado';
  if not found then raise exception 'Este lugar não está recebendo pedidos pelo app.'; end if;
  if not e.tem_mesas or e.exige_qr_mesa then raise exception 'Neste lugar, leia o QR code da mesa para pedir.'; end if;
  perform pg_advisory_xact_lock(hashtext(m.id::text));
  select id into v_comanda from public.comandas where mesa_id = m.id and situacao = 'aberta';
  if v_comanda is null then
    insert into public.comandas (estabelecimento_id, mesa_id, aberta_por) values (m.estabelecimento_id, m.id, auth.uid()) returning id into v_comanda;
  end if;
  insert into public.comanda_pessoas (comanda_id, usuario_id) values (v_comanda, auth.uid()) on conflict do nothing;
  return v_comanda;
end $$;

-- Lugar sem mesas: o pedido do cliente vai numa comanda própria de balcão (retirada, pago na hora).
create or replace function public.abrir_pedido_balcao(p_estab uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare e public.estabelecimentos; v_id uuid;
begin
  perform public.exigir_conta_ativa();
  select * into e from public.estabelecimentos where id = p_estab and situacao = 'aprovado';
  if not found then raise exception 'Lugar não encontrado.'; end if;
  if e.tem_mesas then raise exception 'Neste lugar o pedido é feito pela mesa.'; end if;
  perform pg_advisory_xact_lock(hashtext('balcao' || p_estab::text || auth.uid()::text));
  select c.id into v_id from public.comandas c
   where c.estabelecimento_id = p_estab and c.mesa_id is null and c.aberta_por = auth.uid() and c.situacao = 'aberta'
     and c.aberta_em > now() - interval '12 hours'
   order by c.aberta_em desc limit 1;
  if v_id is null then
    insert into public.comandas (estabelecimento_id, mesa_id, nome, aberta_por, taxa_servico)
    values (p_estab, null, left(coalesce(public.nome_curto(auth.uid()), 'Cliente') || ' · App', 60), auth.uid(), 0)
    returning id into v_id;
  end if;
  insert into public.comanda_pessoas (comanda_id, usuario_id) values (v_id, auth.uid()) on conflict do nothing;
  return v_id;
end $$;

create or replace function public.fazer_pedido(p_comanda uuid, p_itens jsonb, p_observacao text, p_cupom uuid, p_modalidade text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.comandas;
  v_cliente boolean; v_pedido uuid; v_numero int; v_modalidade text; v_regra text;
  v_total numeric := 0; v_desconto numeric; v_prepago boolean; v_pag_mesa text;
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
  select coalesce(entrega_pedidos, 'mesa'), coalesce(pagamento_mesa, 'comanda') into v_regra, v_pag_mesa
    from public.estabelecimentos where id = c.estabelecimento_id;
  -- Pré-pago: pedido do cliente sem mesa (balcão) ou em mesa de lugar que cobra antes.
  -- Os itens ficam "aguardando" (não vão para o preparo) até o pagamento ser aprovado.
  v_prepago := v_cliente and (c.mesa_id is null or v_pag_mesa = 'prepago');
  perform public.limpar_nao_pagos(c.estabelecimento_id);
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
         case when v_prepago then 'aguardando' when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
         case when destino = 'sem_preparo' and not v_prepago then now() end
    from _pedido;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, v_pedido, 'criado', auth.uid(),
          case when v_cliente then 'Pelo App' else 'Lançado pela equipe' end || ' · ' || case v_modalidade when 'mesa' then 'entrega na mesa' else 'retirada no balcão' end
          || case when v_prepago then ' · aguardando pagamento' else '' end);
  -- Pré-pago não leva taxa de serviço (cada pedido é pago na hora).
  if v_prepago and coalesce(c.taxa_servico, 0) <> 0 then update public.comandas set taxa_servico = 0 where id = c.id; end if;

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


-- Pagamento de um pedido pré-pago (chamado pelo servidor com o login da pessoa).
create or replace function public.preparar_pagamento_pedido(p_pedido uuid)
returns table (pagamento_id uuid, valor numeric, estabelecimento_id uuid, descricao text, comissao_pct numeric, comanda_id uuid)
language plpgsql security definer set search_path = public as $$
declare p public.pedidos; v numeric; v_desc numeric; v_id uuid; v_nome text; v_pct numeric;
begin
  perform public.exigir_conta_ativa();
  select * into p from public.pedidos where id = p_pedido;
  if not found or p.usuario_id is distinct from auth.uid() then raise exception 'Pedido não encontrado.'; end if;
  perform public.limpar_nao_pagos(p.estabelecimento_id);
  select coalesce(sum(i.preco * i.quantidade), 0) into v from public.pedido_itens i where i.pedido_id = p.id and i.situacao = 'aguardando';
  if v <= 0 then raise exception 'Este pedido não tem nada a pagar (já foi pago ou expirou).'; end if;
  select coalesce(sum(d.valor), 0) into v_desc from public.comanda_descontos d where d.envio_id = p.envio_id and d.usuario_id = auth.uid();
  v := round(greatest(v - v_desc, 0), 2);
  if v < 1 then
    -- Cupom cobriu tudo: libera direto.
    update public.pedido_itens set situacao = case when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
           pronto_em = case when destino = 'sem_preparo' then now() end, atualizado_em = now()
     where pedido_id = p.id and situacao = 'aguardando';
    return query select null::uuid, 0::numeric, p.estabelecimento_id, null::text, 0::numeric, p.comanda_id;
    return;
  end if;
  update public.pagamentos g set situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = 'Nova tentativa'
   where g.alvo = 'pedido' and g.alvo_id = p.id and g.situacao = 'pendente';
  select e.nome, e.comissao_rovibes into v_nome, v_pct from public.estabelecimentos e where e.id = p.estabelecimento_id;
  insert into public.pagamentos (estabelecimento_id, comanda_id, alvo, alvo_id, usuario_id, origem, modo, valor, situacao)
  values (p.estabelecimento_id, p.comanda_id, 'pedido', p.id, auth.uid(), 'app', 'meus_itens', v, 'pendente') returning id into v_id;
  return query select v_id, v, p.estabelecimento_id, left(v_nome || ' · Pedido ' || p.numero || ' · RoVibes', 120), coalesce(v_pct, 3), p.comanda_id;
end $$;

create or replace function public.confirmar_pagamento_mp(p_pagamento uuid, p_mp_id text, p_status text, p_valor numeric, p_comissao numeric, p_meio text)
returns text language plpgsql security definer set search_path = public as $$
declare pg public.pagamentos;
begin
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if not found then return 'nao_encontrado'; end if;
  if p_status = 'approved' then
    if pg.situacao = 'aprovado' then return 'ja_aprovado'; end if;
    if abs(coalesce(p_valor, 0) - pg.valor) > 0.01 then
      update public.pagamentos set observacao = 'Valor divergente no Mercado Pago: ' || p_valor where id = pg.id;
      return 'valor_divergente';
    end if;
    update public.pagamentos
       set situacao = 'aprovado', aprovado_em = now(), mp_pagamento = p_mp_id, comissao = coalesce(p_comissao, 0),
           meio = case when p_meio in ('pix', 'credito', 'debito') then p_meio else 'outro' end,
           cancelado_em = null, motivo_cancelamento = null
     where id = pg.id;
    -- Pedido pré-pago: libera os itens para o preparo (inclusive se tinham expirado sem pagamento).
    if pg.alvo = 'pedido' and pg.alvo_id is not null then
      update public.pedido_itens
         set situacao = case when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
             pronto_em = case when destino = 'sem_preparo' then now() end,
             motivo_cancelamento = null, atualizado_em = now()
       where pedido_id = pg.alvo_id
         and (situacao = 'aguardando' or (situacao = 'cancelado' and motivo_cancelamento = 'Pagamento não concluído'));
      insert into public.pedido_eventos (estabelecimento_id, pedido_id, acao, usuario_id, detalhe)
      values (pg.estabelecimento_id, pg.alvo_id, 'pagamento', pg.usuario_id, 'Pago pelo App · liberado para o preparo');
    end if;
    if pg.comanda_id is not null then
      insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
      values (pg.estabelecimento_id, pg.comanda_id, 'pagamento', pg.usuario_id,
              'App · ' || coalesce(p_meio, 'Mercado Pago') || ' · R$ ' || replace(to_char(pg.valor, 'FM999990.00'), '.', ','));
      perform public.fechar_se_quitada(pg.comanda_id);
    end if;
    return 'aprovado';
  elsif p_status in ('rejected', 'cancelled') then
    if pg.situacao = 'pendente' then
      update public.pagamentos set situacao = 'recusado', mp_pagamento = p_mp_id where id = pg.id;
    end if;
    return 'recusado';
  elsif p_status in ('refunded', 'charged_back') then
    update public.pagamentos set situacao = 'estornado', cancelado_em = now(), motivo_cancelamento = 'Estornado no Mercado Pago' where id = pg.id;
    return 'estornado';
  end if;
  return 'pendente';
end $$;


revoke execute on function public.confirmar_pagamento_mp(uuid, text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.confirmar_pagamento_mp(uuid, text, text, numeric, numeric, text) to service_role;
revoke execute on function public.limpar_nao_pagos(uuid) from public, anon, authenticated;
revoke execute on function public.definir_atendimento(uuid, boolean, boolean, text), public.modelo_atendimento(uuid), public.entrar_na_mesa_id(uuid),
  public.abrir_pedido_balcao(uuid), public.preparar_pagamento_pedido(uuid) from public, anon;
grant execute on function public.definir_atendimento(uuid, boolean, boolean, text), public.modelo_atendimento(uuid), public.entrar_na_mesa_id(uuid),
  public.abrir_pedido_balcao(uuid), public.preparar_pagamento_pedido(uuid) to authenticated;

select 'Atualização 035 aplicada: modelo de atendimento (mesas, QR, comanda ou pré-pago, balcão).' as resultado;
