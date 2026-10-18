-- RoVibes 011: estoque (G4002) — produtos, movimentos, ficha técnica dos itens do cardápio,
-- baixa automática na entrega, alerta de estoque baixo e item esgotado no App.
-- Pode ser executado mais de uma vez.

create table if not exists public.estoque_produtos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 1),
  unidade text not null default 'un' check (unidade in ('un', 'kg', 'g', 'l', 'ml', 'cx', 'dose')),
  saldo numeric(12,3) not null default 0,
  minimo numeric(12,3) check (minimo is null or minimo >= 0),
  custo numeric(10,2) check (custo is null or custo >= 0),
  validade date,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (estabelecimento_id, nome)
);
create index if not exists estoque_produtos_estab_idx on public.estoque_produtos (estabelecimento_id, ativo);

create table if not exists public.estoque_movimentos (
  id bigint generated always as identity primary key,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  produto_id uuid not null references public.estoque_produtos(id) on delete cascade,
  tipo text not null check (tipo in ('entrada', 'saida', 'ajuste', 'consumo')),
  quantidade numeric(12,3) not null,          -- variação (+ entra, − sai)
  saldo_depois numeric(12,3) not null,
  motivo text,
  item_pedido_id uuid references public.pedido_itens(id) on delete set null,
  usuario_id uuid references auth.users(id),
  criado_em timestamptz not null default now()
);
create index if not exists estoque_movimentos_idx on public.estoque_movimentos (estabelecimento_id, criado_em desc);
create index if not exists estoque_movimentos_produto_idx on public.estoque_movimentos (produto_id, criado_em desc);

-- Ficha técnica: quanto de cada produto um item do cardápio usa (por unidade vendida).
create table if not exists public.ficha_tecnica (
  item_id uuid not null references public.cardapio_itens(id) on delete cascade,
  produto_id uuid not null references public.estoque_produtos(id) on delete cascade,
  quantidade numeric(12,3) not null check (quantidade > 0),
  primary key (item_id, produto_id)
);

alter table public.cardapio_itens add column if not exists esgotado boolean not null default false;

-- ============================================================
-- Permissões: quem tem Estoque (G4002). Saldo só muda pelas funções.
-- ============================================================
alter table public.estoque_produtos enable row level security;
drop policy if exists estoque_produtos_ler on public.estoque_produtos;
create policy estoque_produtos_ler on public.estoque_produtos for select to authenticated using (public.pode_usar(estabelecimento_id, 'G4002'));
drop policy if exists estoque_produtos_gerir on public.estoque_produtos;
create policy estoque_produtos_gerir on public.estoque_produtos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G4002')) with check (public.pode_usar(estabelecimento_id, 'G4002'));
revoke insert, update on public.estoque_produtos from authenticated, anon;
grant insert (estabelecimento_id, nome, unidade, minimo, custo, validade, ativo) on public.estoque_produtos to authenticated;
grant update (nome, unidade, minimo, custo, validade, ativo) on public.estoque_produtos to authenticated;

alter table public.estoque_movimentos enable row level security;
drop policy if exists estoque_movimentos_ler on public.estoque_movimentos;
create policy estoque_movimentos_ler on public.estoque_movimentos for select to authenticated using (public.pode_usar(estabelecimento_id, 'G4002'));

alter table public.ficha_tecnica enable row level security;
drop policy if exists ficha_ler on public.ficha_tecnica;
create policy ficha_ler on public.ficha_tecnica for select to authenticated
  using (public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4002'));
drop policy if exists ficha_gerir on public.ficha_tecnica;
create policy ficha_gerir on public.ficha_tecnica for all to authenticated
  using (public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4002'))
  with check (
    public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4002')
    and (select estabelecimento_id from public.cardapio_itens where id = item_id)
      = (select estabelecimento_id from public.estoque_produtos where id = produto_id));

-- ============================================================
-- Esgotado: item fica esgotado quando algum produto da ficha não dá para uma unidade.
-- ============================================================
create or replace function public.recalcular_esgotados(p_produto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and p.saldo < f.quantidade)
   where ci.id in (select item_id from public.ficha_tecnica where produto_id = p_produto);
end $$;

create or replace function public.ao_mudar_produto()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_esgotados(new.id);
  return null;
end $$;
drop trigger if exists estoque_produtos_esgotados on public.estoque_produtos;
create trigger estoque_produtos_esgotados after update of saldo, ativo on public.estoque_produtos
  for each row execute function public.ao_mudar_produto();

create or replace function public.ao_mudar_ficha()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and p.saldo < f.quantidade)
   where ci.id = v_item;
  return null;
end $$;
drop trigger if exists ficha_esgotados on public.ficha_tecnica;
create trigger ficha_esgotados after insert or update or delete on public.ficha_tecnica
  for each row execute function public.ao_mudar_ficha();

-- Pedido não aceita item esgotado.
create or replace function public.barrar_esgotado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.item_id is not null and exists (select 1 from public.cardapio_itens where id = new.item_id and esgotado) then
    raise exception '"%" esgotou. Escolha outro item.', new.nome;
  end if;
  return new;
end $$;
drop trigger if exists pedido_itens_esgotado on public.pedido_itens;
create trigger pedido_itens_esgotado before insert on public.pedido_itens for each row execute function public.barrar_esgotado();

-- ============================================================
-- Baixa automática quando o item é entregue
-- ============================================================
create or replace function public.baixar_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record; v_saldo numeric;
begin
  if new.situacao = 'entregue' and old.situacao is distinct from 'entregue' and new.item_id is not null then
    for f in select ft.produto_id, ft.quantidade from public.ficha_tecnica ft where ft.item_id = new.item_id loop
      update public.estoque_produtos set saldo = saldo - f.quantidade * new.quantidade
       where id = f.produto_id returning saldo into v_saldo;
      insert into public.estoque_movimentos (estabelecimento_id, produto_id, tipo, quantidade, saldo_depois, motivo, item_pedido_id, usuario_id)
      values (new.estabelecimento_id, f.produto_id, 'consumo', -(f.quantidade * new.quantidade), v_saldo,
              new.quantidade || '× ' || new.nome, new.id, auth.uid());
    end loop;
  end if;
  return null;
end $$;
drop trigger if exists pedido_itens_baixa on public.pedido_itens;
create trigger pedido_itens_baixa after update of situacao on public.pedido_itens for each row execute function public.baixar_estoque();

-- ============================================================
-- Entrada, saída e ajuste (contagem)
-- ============================================================
create or replace function public.movimentar_estoque(p_produto uuid, p_tipo text, p_quantidade numeric, p_motivo text, p_validade date default null)
returns numeric language plpgsql security definer set search_path = public as $$
declare p public.estoque_produtos; v_delta numeric; v_saldo numeric;
begin
  select * into p from public.estoque_produtos where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if not public.pode_usar(p.estabelecimento_id, 'G4002') then raise exception 'Sem acesso ao estoque.'; end if;
  if p_quantidade is null or p_quantidade < 0 or (p_tipo <> 'ajuste' and p_quantidade = 0) then raise exception 'Informe uma quantidade válida.'; end if;
  case p_tipo
    when 'entrada' then v_delta := p_quantidade;
    when 'saida' then
      if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da saída (perda, quebra, uso interno...).'; end if;
      if p_quantidade > p.saldo then raise exception 'O saldo é de % %. Para corrigir o saldo, use Ajuste.', trim_scale(p.saldo), p.unidade; end if;
      v_delta := -p_quantidade;
    when 'ajuste' then v_delta := p_quantidade - p.saldo;
    else raise exception 'Tipo inválido.';
  end case;
  update public.estoque_produtos set saldo = saldo + v_delta, validade = coalesce(p_validade, validade) where id = p.id returning saldo into v_saldo;
  insert into public.estoque_movimentos (estabelecimento_id, produto_id, tipo, quantidade, saldo_depois, motivo, usuario_id)
  values (p.estabelecimento_id, p.id, p_tipo, v_delta, v_saldo,
          coalesce(nullif(btrim(p_motivo), ''), case p_tipo when 'ajuste' then 'Contagem' when 'entrada' then 'Entrada' end), auth.uid());
  return v_saldo;
end $$;

-- Movimentos com o nome de quem fez.
create or replace function public.movimentos_estoque(p_estab uuid, p_produto uuid default null)
returns table (id bigint, criado_em timestamptz, produto text, unidade text, tipo text, quantidade numeric, saldo_depois numeric, motivo text, pessoa text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G4002') then raise exception 'Sem acesso ao estoque.'; end if;
  return query
  select m.id, m.criado_em, p.nome, p.unidade, m.tipo, m.quantidade, m.saldo_depois, m.motivo, coalesce(pf.nome, '')
    from public.estoque_movimentos m
    join public.estoque_produtos p on p.id = m.produto_id
    left join public.perfis pf on pf.id = m.usuario_id
   where m.estabelecimento_id = p_estab and (p_produto is null or m.produto_id = p_produto)
   order by m.criado_em desc, m.id desc
   limit 300;
end $$;

-- Quantos produtos estão abaixo do mínimo, zerados ou vencendo (para avisos).
create or replace function public.alertas_estoque(p_estab uuid)
returns table (baixos int, zerados int, vencendo int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where saldo > 0 and minimo is not null and saldo <= minimo)::int,
         count(*) filter (where saldo <= 0)::int,
         count(*) filter (where validade is not null and validade <= (now() at time zone 'America/Sao_Paulo')::date + 7)::int
    from public.estoque_produtos
   where estabelecimento_id = p_estab and ativo and public.pode_usar(p_estab, 'G4002');
$$;

grant execute on function public.movimentar_estoque(uuid, text, numeric, text, date), public.movimentos_estoque(uuid, uuid),
  public.alertas_estoque(uuid) to authenticated;

select 'RoVibes 011 aplicado com sucesso' as resultado;
