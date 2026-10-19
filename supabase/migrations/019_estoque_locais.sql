-- RoVibes 019: cadastro completo de produtos (G4003), locais de estoque, saldo por local,
-- transferências pela equipe (T4004), perda/quebra, e consumo da venda saindo do ponto de
-- consumo do setor (bar/cozinha) conforme a receita. Pode ser executado mais de uma vez.

-- ============================================================
-- Cadastro de produtos (campos do padrão Expedição CD, adaptados ao bar/restaurante)
-- ============================================================
alter table public.estoque_produtos add column if not exists codigo text;
alter table public.estoque_produtos add column if not exists ean text;
alter table public.estoque_produtos add column if not exists marca text;
alter table public.estoque_produtos add column if not exists grupo text;
alter table public.estoque_produtos add column if not exists categoria text;
alter table public.estoque_produtos add column if not exists embalagem_nome text;
alter table public.estoque_produtos add column if not exists embalagem_fator numeric(12,3) check (embalagem_fator is null or embalagem_fator > 0);
alter table public.estoque_produtos add column if not exists controla_validade boolean not null default false;
alter table public.estoque_produtos add column if not exists conservacao text not null default 'ambiente';
alter table public.estoque_produtos add column if not exists ncm text;
alter table public.estoque_produtos add column if not exists local_padrao_id uuid;
do $$ begin
  alter table public.estoque_produtos add constraint estoque_produtos_conservacao check (conservacao in ('ambiente', 'refrigerado', 'congelado'));
exception when duplicate_object then null; end $$;
create unique index if not exists estoque_produtos_codigo_unico on public.estoque_produtos (estabelecimento_id, lower(codigo)) where codigo is not null;
create unique index if not exists estoque_produtos_ean_unico on public.estoque_produtos (estabelecimento_id, ean) where ean is not null;

-- ============================================================
-- Locais de estoque
-- ============================================================
create table if not exists public.estoque_locais (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 40),
  tipo text not null default 'deposito' check (tipo in ('deposito', 'refrigerador', 'bar', 'cozinha', 'camara', 'outro')),
  consumo_setor text check (consumo_setor in ('bar', 'cozinha', 'sem_preparo')),
  ativo boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now(),
  unique (estabelecimento_id, nome)
);
create unique index if not exists estoque_locais_consumo_unico on public.estoque_locais (estabelecimento_id, consumo_setor) where consumo_setor is not null and ativo;
do $$ begin
  alter table public.estoque_produtos add constraint estoque_produtos_local_fk foreign key (local_padrao_id) references public.estoque_locais(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.estoque_saldos (
  produto_id uuid not null references public.estoque_produtos(id) on delete cascade,
  local_id uuid not null references public.estoque_locais(id) on delete cascade,
  quantidade numeric(12,3) not null default 0,
  atualizado_em timestamptz not null default now(),
  primary key (produto_id, local_id)
);
create index if not exists estoque_saldos_local_idx on public.estoque_saldos (local_id);

alter table public.estoque_movimentos add column if not exists local_id uuid references public.estoque_locais(id) on delete set null;
alter table public.estoque_movimentos add column if not exists local_destino_id uuid references public.estoque_locais(id) on delete set null;
alter table public.estoque_movimentos drop constraint if exists estoque_movimentos_tipo_check;
alter table public.estoque_movimentos add constraint estoque_movimentos_tipo_check check (tipo in ('entrada', 'saida', 'ajuste', 'consumo', 'transferencia', 'perda'));

-- ============================================================
-- Quem vê e quem mexe
-- G4002 Estoque (gestão) · G4003 Cadastro de produtos · T4004 Movimentação (equipe)
-- ============================================================
create or replace function public.ve_estoque(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'G4002') or public.pode_usar(p_estab, 'G4003') or public.pode_usar(p_estab, 'T4004');
$$;

drop policy if exists estoque_produtos_ler on public.estoque_produtos;
create policy estoque_produtos_ler on public.estoque_produtos for select to authenticated using (public.ve_estoque(estabelecimento_id));
drop policy if exists estoque_produtos_gerir on public.estoque_produtos;
create policy estoque_produtos_gerir on public.estoque_produtos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G4002') or public.pode_usar(estabelecimento_id, 'G4003'))
  with check (public.pode_usar(estabelecimento_id, 'G4002') or public.pode_usar(estabelecimento_id, 'G4003'));
revoke insert, update on public.estoque_produtos from authenticated, anon;
grant insert (estabelecimento_id, nome, unidade, minimo, custo, validade, ativo, codigo, ean, marca, grupo, categoria,
              embalagem_nome, embalagem_fator, controla_validade, conservacao, ncm, local_padrao_id) on public.estoque_produtos to authenticated;
grant update (nome, unidade, minimo, custo, validade, ativo, codigo, ean, marca, grupo, categoria,
              embalagem_nome, embalagem_fator, controla_validade, conservacao, ncm, local_padrao_id) on public.estoque_produtos to authenticated;

alter table public.estoque_locais enable row level security;
drop policy if exists estoque_locais_ler on public.estoque_locais;
create policy estoque_locais_ler on public.estoque_locais for select to authenticated using (public.ve_estoque(estabelecimento_id));
drop policy if exists estoque_locais_gerir on public.estoque_locais;
create policy estoque_locais_gerir on public.estoque_locais for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G4002')) with check (public.pode_usar(estabelecimento_id, 'G4002'));

alter table public.estoque_saldos enable row level security;
drop policy if exists estoque_saldos_ler on public.estoque_saldos;
create policy estoque_saldos_ler on public.estoque_saldos for select to authenticated
  using (public.ve_estoque((select estabelecimento_id from public.estoque_locais where id = local_id)));
revoke insert, update, delete on public.estoque_saldos from authenticated, anon;

drop policy if exists estoque_movimentos_ler on public.estoque_movimentos;
create policy estoque_movimentos_ler on public.estoque_movimentos for select to authenticated using (public.ve_estoque(estabelecimento_id));

-- A receita também pode ser editada por quem cuida do cardápio (G4001).
drop policy if exists ficha_ler on public.ficha_tecnica;
create policy ficha_ler on public.ficha_tecnica for select to authenticated
  using (public.ve_estoque((select estabelecimento_id from public.cardapio_itens where id = item_id))
      or public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4001'));
drop policy if exists ficha_gerir on public.ficha_tecnica;
create policy ficha_gerir on public.ficha_tecnica for all to authenticated
  using (public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4002')
      or public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4001'))
  with check (
    (public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4002')
      or public.pode_usar((select estabelecimento_id from public.cardapio_itens where id = item_id), 'G4001'))
    and (select estabelecimento_id from public.cardapio_itens where id = item_id)
      = (select estabelecimento_id from public.estoque_produtos where id = produto_id));

-- ============================================================
-- Saldo por local (o total do produto acompanha sozinho)
-- ============================================================
create or replace function public.local_principal(p_estab uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  select id into v from public.estoque_locais where estabelecimento_id = p_estab and ativo order by (tipo = 'deposito') desc, ordem, criado_em limit 1;
  if v is null then
    insert into public.estoque_locais (estabelecimento_id, nome, tipo) values (p_estab, 'Depósito principal', 'deposito')
    on conflict (estabelecimento_id, nome) do update set ativo = true returning id into v;
  end if;
  return v;
end $$;

create or replace function public.somar_saldo(p_produto uuid, p_local uuid, p_delta numeric)
returns numeric language plpgsql security definer set search_path = public as $$
declare v numeric;
begin
  insert into public.estoque_saldos (produto_id, local_id, quantidade) values (p_produto, p_local, p_delta)
  on conflict (produto_id, local_id) do update set quantidade = estoque_saldos.quantidade + excluded.quantidade, atualizado_em = now()
  returning quantidade into v;
  update public.estoque_produtos set saldo = (select coalesce(sum(quantidade), 0) from public.estoque_saldos where produto_id = p_produto)
   where id = p_produto;
  return v;
end $$;

-- De onde a venda de um setor consome: o ponto de consumo do setor; senão o local padrão do produto; senão o principal.
create or replace function public.local_de_consumo(p_estab uuid, p_setor text, p_produto uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select coalesce(
    (select id from public.estoque_locais where estabelecimento_id = p_estab and consumo_setor = p_setor and ativo limit 1),
    (select l.id from public.estoque_produtos p join public.estoque_locais l on l.id = p.local_padrao_id and l.ativo where p.id = p_produto),
    (select id from public.estoque_locais where estabelecimento_id = p_estab and ativo order by (tipo = 'deposito') desc, ordem, criado_em limit 1));
$$;

-- Saldo disponível para vender um item de um setor (com ponto de consumo, vale só o saldo dele).
create or replace function public.saldo_para_venda(p_produto uuid, p_setor text)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when exists (select 1 from public.estoque_locais l join public.estoque_produtos p on p.estabelecimento_id = l.estabelecimento_id
                  where p.id = p_produto and l.consumo_setor = p_setor and l.ativo)
      then coalesce((select s.quantidade from public.estoque_saldos s join public.estoque_locais l on l.id = s.local_id
                      join public.estoque_produtos p on p.id = s.produto_id
                     where s.produto_id = p_produto and l.estabelecimento_id = p.estabelecimento_id and l.consumo_setor = p_setor and l.ativo), 0)
    else (select saldo from public.estoque_produtos where id = p_produto)
  end;
$$;

create or replace function public.setor_do_item(p_item uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select c.setor from public.cardapio_itens i join public.cardapio_categorias c on c.id = i.categoria_id where i.id = p_item), 'cozinha');
$$;

create or replace function public.recalcular_esgotados(p_produto uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and public.saldo_para_venda(p.id, public.setor_do_item(ci.id)) < f.quantidade)
   where ci.id in (select item_id from public.ficha_tecnica where produto_id = p_produto);
end $$;

create or replace function public.ao_mudar_ficha()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_item uuid := coalesce(new.item_id, old.item_id);
begin
  update public.cardapio_itens ci
     set esgotado = exists (
           select 1 from public.ficha_tecnica f join public.estoque_produtos p on p.id = f.produto_id
            where f.item_id = ci.id and p.ativo and public.saldo_para_venda(p.id, public.setor_do_item(ci.id)) < f.quantidade)
   where ci.id = v_item;
  return null;
end $$;

create or replace function public.ao_mudar_saldo_local()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.recalcular_esgotados(coalesce(new.produto_id, old.produto_id));
  return null;
end $$;
drop trigger if exists estoque_saldos_esgotados on public.estoque_saldos;
create trigger estoque_saldos_esgotados after insert or update or delete on public.estoque_saldos for each row execute function public.ao_mudar_saldo_local();

-- Mudar o ponto de consumo de um local muda o que está esgotado.
create or replace function public.ao_mudar_local()
returns trigger language plpgsql security definer set search_path = public as $$
declare p uuid;
begin
  for p in select id from public.estoque_produtos where estabelecimento_id = coalesce(new.estabelecimento_id, old.estabelecimento_id) loop
    perform public.recalcular_esgotados(p);
  end loop;
  return null;
end $$;
drop trigger if exists estoque_locais_esgotados on public.estoque_locais;
create trigger estoque_locais_esgotados after insert or update of consumo_setor, ativo or delete on public.estoque_locais
  for each row execute function public.ao_mudar_local();

-- ============================================================
-- Venda entregue: consome a receita no ponto de consumo do setor (pode ficar negativo e gera aviso de reposição)
-- ============================================================
create or replace function public.baixar_estoque()
returns trigger language plpgsql security definer set search_path = public as $$
declare f record; v_local uuid; v_saldo numeric;
begin
  if new.situacao = 'entregue' and old.situacao is distinct from 'entregue' and new.item_id is not null then
    for f in select ft.produto_id, ft.quantidade, p.estabelecimento_id from public.ficha_tecnica ft
               join public.estoque_produtos p on p.id = ft.produto_id where ft.item_id = new.item_id loop
      v_local := public.local_de_consumo(f.estabelecimento_id, coalesce(new.destino, public.setor_do_item(new.item_id)), f.produto_id);
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

-- ============================================================
-- Movimentações
-- ============================================================
drop function if exists public.movimentar_estoque(uuid, text, numeric, text, date);
create or replace function public.movimentar_estoque(p_produto uuid, p_tipo text, p_quantidade numeric, p_motivo text,
  p_validade date default null, p_local uuid default null, p_destino uuid default null, p_em_embalagem boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare p public.estoque_produtos; v_q numeric; v_local uuid; v_atual numeric; v_delta numeric; v_saldo numeric; v_tipo text := p_tipo;
begin
  select * into p from public.estoque_produtos where id = p_produto for update;
  if not found then raise exception 'Produto não encontrado.'; end if;
  if v_tipo = 'saida' then v_tipo := 'perda'; end if;
  if v_tipo in ('entrada', 'ajuste') and not public.pode_usar(p.estabelecimento_id, 'G4002') then
    raise exception 'Só a gestão do estoque registra entradas e ajustes.';
  end if;
  if v_tipo in ('transferencia', 'perda') and not (public.pode_usar(p.estabelecimento_id, 'G4002') or public.pode_usar(p.estabelecimento_id, 'T4004')) then
    raise exception 'Sem acesso à movimentação de estoque.';
  end if;
  if v_tipo not in ('entrada', 'ajuste', 'transferencia', 'perda') then raise exception 'Tipo inválido.'; end if;
  if p_quantidade is null or p_quantidade < 0 or (v_tipo <> 'ajuste' and p_quantidade = 0) then raise exception 'Informe uma quantidade válida.'; end if;
  v_q := p_quantidade * case when p_em_embalagem then coalesce(p.embalagem_fator, 1) else 1 end;

  v_local := coalesce(p_local, p.local_padrao_id, public.local_principal(p.estabelecimento_id));
  if not exists (select 1 from public.estoque_locais where id = v_local and estabelecimento_id = p.estabelecimento_id and ativo) then
    raise exception 'Local não encontrado.';
  end if;
  select coalesce((select quantidade from public.estoque_saldos where produto_id = p.id and local_id = v_local), 0) into v_atual;

  if v_tipo = 'transferencia' then
    if p_destino is null or p_destino = v_local then raise exception 'Escolha um local de destino diferente da origem.'; end if;
    if not exists (select 1 from public.estoque_locais where id = p_destino and estabelecimento_id = p.estabelecimento_id and ativo) then
      raise exception 'Local de destino não encontrado.';
    end if;
    if v_q > v_atual then raise exception 'Só há % % neste local.', trim_scale(v_atual), p.unidade; end if;
    perform public.somar_saldo(p.id, v_local, -v_q);
    perform public.somar_saldo(p.id, p_destino, v_q);
    select saldo into v_saldo from public.estoque_produtos where id = p.id;
    insert into public.estoque_movimentos (estabelecimento_id, produto_id, tipo, quantidade, saldo_depois, motivo, usuario_id, local_id, local_destino_id)
    values (p.estabelecimento_id, p.id, 'transferencia', v_q, v_saldo, nullif(btrim(coalesce(p_motivo, '')), ''), auth.uid(), v_local, p_destino);
    return v_saldo;
  end if;

  case v_tipo
    when 'entrada' then v_delta := v_q;
    when 'perda' then
      if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo (quebra, vencido, uso interno...).'; end if;
      if v_q > v_atual then raise exception 'Só há % % neste local. Para corrigir, use Ajuste.', trim_scale(v_atual), p.unidade; end if;
      v_delta := -v_q;
    when 'ajuste' then v_delta := v_q - v_atual;
  end case;
  perform public.somar_saldo(p.id, v_local, v_delta);
  if p_validade is not null then update public.estoque_produtos set validade = p_validade where id = p.id; end if;
  select saldo into v_saldo from public.estoque_produtos where id = p.id;
  insert into public.estoque_movimentos (estabelecimento_id, produto_id, tipo, quantidade, saldo_depois, motivo, usuario_id, local_id)
  values (p.estabelecimento_id, p.id, v_tipo, v_delta, v_saldo,
          coalesce(nullif(btrim(coalesce(p_motivo, '')), ''), case v_tipo when 'ajuste' then 'Contagem' when 'entrada' then 'Entrada' end), auth.uid(), v_local);
  return v_saldo;
end $$;

drop function if exists public.movimentos_estoque(uuid, uuid);
create or replace function public.movimentos_estoque(p_estab uuid, p_produto uuid default null)
returns table (id bigint, criado_em timestamptz, produto text, unidade text, tipo text, quantidade numeric, saldo_depois numeric,
               motivo text, pessoa text, local_nome text, destino_nome text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.ve_estoque(p_estab) then raise exception 'Sem acesso ao estoque.'; end if;
  return query
  select m.id, m.criado_em, p.nome, p.unidade, m.tipo, m.quantidade, m.saldo_depois, m.motivo, coalesce(pf.nome, ''), lo.nome, ld.nome
    from public.estoque_movimentos m
    join public.estoque_produtos p on p.id = m.produto_id
    left join public.perfis pf on pf.id = m.usuario_id
    left join public.estoque_locais lo on lo.id = m.local_id
    left join public.estoque_locais ld on ld.id = m.local_destino_id
   where m.estabelecimento_id = p_estab and (p_produto is null or m.produto_id = p_produto)
   order by m.criado_em desc, m.id desc
   limit 300;
end $$;

drop function if exists public.alertas_estoque(uuid) cascade;
create or replace function public.alertas_estoque(p_estab uuid)
returns table (baixos int, zerados int, vencendo int, negativos int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where saldo > 0 and minimo is not null and saldo <= minimo)::int,
         count(*) filter (where saldo <= 0)::int,
         count(*) filter (where validade is not null and validade <= (now() at time zone 'America/Sao_Paulo')::date + 7)::int,
         (select count(*) from public.estoque_saldos s join public.estoque_locais l on l.id = s.local_id where l.estabelecimento_id = p_estab and s.quantidade < 0)::int
    from public.estoque_produtos
   where estabelecimento_id = p_estab and ativo and public.ve_estoque(p_estab);
$$;

-- Importação de planilha: cria ou atualiza pelo código interno (ou EAN) num só passo.
create or replace function public.importar_produtos(p_estab uuid, p_linhas jsonb)
returns table (gravados int, erros text[])
language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0; e text[] := '{}'; i int := 0; v_id uuid; v_nome text;
begin
  if not (public.pode_usar(p_estab, 'G4002') or public.pode_usar(p_estab, 'G4003')) then raise exception 'Sem acesso ao cadastro de produtos.'; end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    v_nome := nullif(btrim(l->>'nome'), '');
    begin
      if v_nome is null then raise exception 'sem descrição'; end if;
      select id into v_id from public.estoque_produtos
       where estabelecimento_id = p_estab
         and ((nullif(btrim(l->>'codigo'), '') is not null and lower(codigo) = lower(btrim(l->>'codigo')))
           or (nullif(btrim(l->>'ean'), '') is not null and ean = btrim(l->>'ean'))
           or lower(nome) = lower(v_nome))
       limit 1;
      if v_id is null then
        insert into public.estoque_produtos (estabelecimento_id, nome, codigo, ean, marca, grupo, categoria, unidade, embalagem_nome, embalagem_fator, minimo, custo, conservacao, ncm)
        values (p_estab, v_nome, nullif(btrim(l->>'codigo'), ''), nullif(btrim(l->>'ean'), ''), nullif(btrim(l->>'marca'), ''),
                nullif(btrim(l->>'grupo'), ''), nullif(btrim(l->>'categoria'), ''), coalesce(nullif(btrim(l->>'unidade'), ''), 'un'),
                nullif(btrim(l->>'embalagem_nome'), ''), nullif(l->>'embalagem_fator', '')::numeric, nullif(l->>'minimo', '')::numeric,
                nullif(l->>'custo', '')::numeric, coalesce(nullif(btrim(l->>'conservacao'), ''), 'ambiente'), nullif(btrim(l->>'ncm'), ''));
      else
        update public.estoque_produtos set
          nome = v_nome,
          codigo = coalesce(nullif(btrim(l->>'codigo'), ''), codigo), ean = coalesce(nullif(btrim(l->>'ean'), ''), ean),
          marca = coalesce(nullif(btrim(l->>'marca'), ''), marca), grupo = coalesce(nullif(btrim(l->>'grupo'), ''), grupo),
          categoria = coalesce(nullif(btrim(l->>'categoria'), ''), categoria), unidade = coalesce(nullif(btrim(l->>'unidade'), ''), unidade),
          embalagem_nome = coalesce(nullif(btrim(l->>'embalagem_nome'), ''), embalagem_nome),
          embalagem_fator = coalesce(nullif(l->>'embalagem_fator', '')::numeric, embalagem_fator),
          minimo = coalesce(nullif(l->>'minimo', '')::numeric, minimo), custo = coalesce(nullif(l->>'custo', '')::numeric, custo),
          ncm = coalesce(nullif(btrim(l->>'ncm'), ''), ncm)
         where id = v_id;
      end if;
      n := n + 1;
    exception when others then
      e := e || ('Linha ' || (i + 1) || ' (' || coalesce(v_nome, 'sem descrição') || '): ' || sqlerrm);
    end;
  end loop;
  return query select n, e;
end $$;

-- ============================================================
-- Estabelecimentos que já tinham estoque: o saldo vai para o "Depósito principal"
-- ============================================================
do $$
declare r record; v_local uuid;
begin
  for r in select distinct estabelecimento_id from public.estoque_produtos loop
    v_local := public.local_principal(r.estabelecimento_id);
    insert into public.estoque_saldos (produto_id, local_id, quantidade)
    select p.id, v_local, p.saldo from public.estoque_produtos p
     where p.estabelecimento_id = r.estabelecimento_id and p.saldo <> 0
       and not exists (select 1 from public.estoque_saldos s where s.produto_id = p.id)
    on conflict do nothing;
  end loop;
end $$;

revoke execute on function public.somar_saldo(uuid, uuid, numeric), public.local_principal(uuid), public.ao_mudar_saldo_local(), public.ao_mudar_local()
  from public, anon, authenticated;
revoke execute on function public.movimentar_estoque(uuid, text, numeric, text, date, uuid, uuid, boolean), public.movimentos_estoque(uuid, uuid),
  public.alertas_estoque(uuid), public.importar_produtos(uuid, jsonb), public.ve_estoque(uuid) from public, anon;
grant execute on function public.movimentar_estoque(uuid, text, numeric, text, date, uuid, uuid, boolean), public.movimentos_estoque(uuid, uuid),
  public.alertas_estoque(uuid), public.importar_produtos(uuid, jsonb), public.ve_estoque(uuid) to authenticated;

select 'RoVibes 019 aplicado com sucesso' as resultado;
