-- RoVibes 020: item do cardápio nasce do produto do estoque (busca por nome/código de barras)
-- e escolhe de qual local o saldo é consumido na venda. Pode ser executado mais de uma vez.

alter table public.cardapio_itens add column if not exists produto_id uuid references public.estoque_produtos(id) on delete set null;
alter table public.cardapio_itens add column if not exists local_consumo_id uuid references public.estoque_locais(id) on delete set null;

-- Quem cuida do cardápio (G4001) também enxerga o estoque (para escolher o produto e o local).
create or replace function public.ve_estoque(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'G4002') or public.pode_usar(p_estab, 'G4003') or public.pode_usar(p_estab, 'T4004')
      or public.pode_usar(p_estab, 'G4001');
$$;

-- Produto vendido direto: a receita é "1 unidade do produto" e acompanha a troca de produto.
create or replace function public.ligar_produto_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.produto_id is not null and old.produto_id is distinct from new.produto_id then
    delete from public.ficha_tecnica where item_id = new.id and produto_id = old.produto_id;
  end if;
  if new.produto_id is not null and (tg_op = 'INSERT' or old.produto_id is distinct from new.produto_id) then
    if (select estabelecimento_id from public.estoque_produtos where id = new.produto_id) <> new.estabelecimento_id then
      raise exception 'Produto de outro estabelecimento.';
    end if;
    insert into public.ficha_tecnica (item_id, produto_id, quantidade) values (new.id, new.produto_id, 1)
    on conflict (item_id, produto_id) do nothing;
  end if;
  return null;
end $$;
drop trigger if exists cardapio_itens_produto on public.cardapio_itens;
create trigger cardapio_itens_produto after insert or update of produto_id on public.cardapio_itens
  for each row execute function public.ligar_produto_item();

-- Saldo que vale para vender o item: o local escolhido no item; senão o ponto de consumo do setor.
create or replace function public.saldo_do_item(p_item uuid, p_produto uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.cardapio_itens i join public.estoque_locais l on l.id = i.local_consumo_id and l.ativo where i.id = p_item)
      then coalesce((select s.quantidade from public.cardapio_itens i join public.estoque_saldos s on s.local_id = i.local_consumo_id
                      where i.id = p_item and s.produto_id = p_produto), 0)
    else public.saldo_para_venda(p_produto, public.setor_do_item(p_item))
  end;
$$;

create or replace function public.recalcular_esgotados(p_produto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and public.saldo_do_item(ci.id, p.id) < f.quantidade)
   where ci.id in (select item_id from public.ficha_tecnica where produto_id = p_produto);
end $$;

create or replace function public.recalcular_item(p_item uuid)
returns void language sql security definer set search_path = public as $$
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and public.saldo_do_item(ci.id, p.id) < f.quantidade)
   where ci.id = p_item;
$$;

create or replace function public.ao_mudar_ficha()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_item(coalesce(new.item_id, old.item_id));
  return null;
end $$;

create or replace function public.ao_mudar_local_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_item(new.id);
  return null;
end $$;
drop trigger if exists cardapio_itens_local on public.cardapio_itens;
create trigger cardapio_itens_local after update of local_consumo_id, categoria_id on public.cardapio_itens
  for each row execute function public.ao_mudar_local_item();

-- Venda entregue: consome do local escolhido no item; senão do ponto de consumo do setor.
create or replace function public.baixar_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record; v_local uuid; v_item_local uuid; v_saldo numeric;
begin
  if new.situacao = 'entregue' and old.situacao is distinct from 'entregue' and new.item_id is not null then
    select l.id into v_item_local from public.cardapio_itens i join public.estoque_locais l on l.id = i.local_consumo_id and l.ativo where i.id = new.item_id;
    for f in select ft.produto_id, ft.quantidade, p.estabelecimento_id from public.ficha_tecnica ft
               join public.estoque_produtos p on p.id = ft.produto_id where ft.item_id = new.item_id loop
      v_local := coalesce(v_item_local, public.local_de_consumo(f.estabelecimento_id, coalesce(new.destino, public.setor_do_item(new.item_id)), f.produto_id));
      if v_local is null then v_local := public.local_principal(f.estabelecimento_id); end if;
      perform public.somar_saldo(f.produto_id, v_local, -(f.quantidade * new.quantidade));
      select saldo into v_saldo from public.estoque_produtos where id = f.produto_id;
      insert into public.estoque_movimentos (estabelecimento_id, produto_id, tipo, quantidade, saldo_depois, motivo, item_pedido_id, usuario_id, local_id)
      values (f.estabelecimento_id, f.produto_id, 'consumo', -(f.quantidade * new.quantidade), v_saldo,
              new.quantidade || '× ' || new.nome, new.id, auth.uid(), v_local);
    end loop;
  end if;
  return null;
end $$;

revoke execute on function public.ligar_produto_item(), public.ao_mudar_local_item(), public.recalcular_item(uuid) from public, anon, authenticated;

select 'RoVibes 020 aplicado com sucesso' as resultado;
