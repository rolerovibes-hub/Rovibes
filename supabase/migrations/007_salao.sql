-- RoVibes 007: equipe e permissões, mesas e comandas, pedidos pelo App e fila de pedidos.
-- A conta é paga no caixa do lugar até o pagamento pelo App (fase 7).
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Equipe e permissões (G3001)
-- ============================================================

-- Quem gerencia a equipe só pode liberar aplicativos que ele mesmo usa.
create or replace function public.pode_liberar(p_estab uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select p_codigo not like 'A%' and public.pode_usar(p_estab, p_codigo);
$$;

create or replace function public.exigir_gestao_equipe(p_estab uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G3001') then
    raise exception 'Sem acesso à equipe deste estabelecimento.';
  end if;
end $$;

create or replace function public.equipe(p_estab uuid)
returns table (usuario_id uuid, nome text, email text, papel text, cargo text, ativo boolean, codigos text[], desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_gestao_equipe(p_estab);
  return query
  select m.usuario_id, coalesce(p.nome, ''), u.email::text, m.papel, m.cargo, m.ativo,
         coalesce((select array_agg(a.codigo order by a.codigo) from public.acessos a
                    where a.estabelecimento_id = m.estabelecimento_id and a.usuario_id = m.usuario_id), '{}'),
         m.criado_em
    from public.membros m
    left join public.perfis p on p.id = m.usuario_id
    left join auth.users u on u.id = m.usuario_id
   where m.estabelecimento_id = p_estab
   order by (m.papel = 'proprietario') desc, m.ativo desc, p.nome;
end $$;

create or replace function public.adicionar_membro(p_estab uuid, p_email text, p_papel text, p_cargo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_usuario uuid; v_papel text;
begin
  perform public.exigir_gestao_equipe(p_estab);
  if p_papel not in ('gestor', 'equipe') then raise exception 'Papel inválido.'; end if;
  if p_papel = 'gestor' and not (public.eh_proprietario(p_estab) or public.eh_admin()) then
    raise exception 'Só o proprietário pode adicionar gestores.';
  end if;
  select id into v_usuario from auth.users where lower(email) = lower(btrim(p_email));
  if v_usuario is null then
    raise exception 'Não há conta no RoVibes com este e-mail. Peça para a pessoa criar a conta primeiro.';
  end if;
  select papel into v_papel from public.membros where estabelecimento_id = p_estab and usuario_id = v_usuario;
  if v_papel = 'proprietario' then raise exception 'Esta pessoa já é proprietária.'; end if;
  insert into public.membros (estabelecimento_id, usuario_id, papel, cargo, ativo)
  values (p_estab, v_usuario, p_papel, nullif(btrim(p_cargo), ''), true)
  on conflict (estabelecimento_id, usuario_id)
  do update set papel = excluded.papel, cargo = excluded.cargo, ativo = true;
  return v_usuario;
end $$;

create or replace function public.atualizar_membro(p_estab uuid, p_usuario uuid, p_papel text, p_cargo text, p_ativo boolean, p_codigos text[])
returns void language plpgsql security definer set search_path = public as $$
declare v_atual text; c text;
begin
  perform public.exigir_gestao_equipe(p_estab);
  select papel into v_atual from public.membros where estabelecimento_id = p_estab and usuario_id = p_usuario;
  if v_atual is null then raise exception 'Pessoa não encontrada na equipe.'; end if;
  if v_atual = 'proprietario' then raise exception 'O proprietário não pode ser alterado aqui.'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode alterar o seu próprio acesso.'; end if;
  if p_papel not in ('gestor', 'equipe') then raise exception 'Papel inválido.'; end if;
  if (p_papel = 'gestor' or v_atual = 'gestor') and not (public.eh_proprietario(p_estab) or public.eh_admin()) then
    raise exception 'Só o proprietário pode alterar gestores.';
  end if;
  update public.membros set papel = p_papel, cargo = nullif(btrim(p_cargo), ''), ativo = coalesce(p_ativo, true)
   where estabelecimento_id = p_estab and usuario_id = p_usuario;
  if p_codigos is not null then
    -- Remove o que saiu (só o que quem edita pode liberar) e adiciona o que entrou.
    delete from public.acessos a
     where a.estabelecimento_id = p_estab and a.usuario_id = p_usuario
       and not (a.codigo = any(p_codigos)) and public.pode_liberar(p_estab, a.codigo);
    foreach c in array p_codigos loop
      if not public.pode_liberar(p_estab, c) then
        if exists (select 1 from public.acessos where estabelecimento_id = p_estab and usuario_id = p_usuario and codigo = c) then
          continue;
        end if;
        raise exception 'Você não pode liberar o aplicativo %.', c;
      end if;
      insert into public.acessos (estabelecimento_id, usuario_id, codigo, concedido_por)
      values (p_estab, p_usuario, c, auth.uid()) on conflict do nothing;
    end loop;
    update public.solicitacoes_acesso set situacao = 'aprovada', decidido_por = auth.uid(), decidido_em = now()
     where estabelecimento_id = p_estab and usuario_id = p_usuario and situacao = 'pendente' and codigo = any(p_codigos);
  end if;
end $$;

create or replace function public.solicitacoes_pendentes(p_estab uuid)
returns table (id uuid, usuario_id uuid, nome text, codigo text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_gestao_equipe(p_estab);
  return query
  select s.id, s.usuario_id, coalesce(p.nome, ''), s.codigo, s.criado_em
    from public.solicitacoes_acesso s left join public.perfis p on p.id = s.usuario_id
   where s.estabelecimento_id = p_estab and s.situacao = 'pendente'
     and exists (select 1 from public.membros m where m.estabelecimento_id = p_estab and m.usuario_id = s.usuario_id and m.ativo)
   order by s.criado_em;
end $$;

create or replace function public.decidir_solicitacao(p_id uuid, p_aprovar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.solicitacoes_acesso;
begin
  select * into s from public.solicitacoes_acesso where id = p_id and situacao = 'pendente';
  if not found or s.estabelecimento_id is null then raise exception 'Pedido de acesso não encontrado.'; end if;
  perform public.exigir_gestao_equipe(s.estabelecimento_id);
  if p_aprovar then
    if not public.pode_liberar(s.estabelecimento_id, s.codigo) then
      raise exception 'Você não pode liberar este aplicativo.';
    end if;
    insert into public.acessos (estabelecimento_id, usuario_id, codigo, concedido_por)
    values (s.estabelecimento_id, s.usuario_id, s.codigo, auth.uid()) on conflict do nothing;
  end if;
  update public.solicitacoes_acesso
     set situacao = case when p_aprovar then 'aprovada' else 'recusada' end, decidido_por = auth.uid(), decidido_em = now()
   where id = p_id;
end $$;

-- ============================================================
-- Setor de preparo das categorias do cardápio
-- ============================================================
alter table public.cardapio_categorias add column if not exists setor text not null default 'cozinha';
do $$ begin
  alter table public.cardapio_categorias add constraint cardapio_categorias_setor_check check (setor in ('cozinha', 'bar'));
exception when duplicate_object then null; end $$;

-- ============================================================
-- Mesas e comandas (T7001)
-- ============================================================
create table if not exists public.mesas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  numero text not null check (length(btrim(numero)) between 1 and 12),
  area text,
  lugares int check (lugares is null or lugares between 1 and 100),
  codigo text not null unique default public.gerar_codigo(10),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (estabelecimento_id, numero)
);
alter table public.mesas enable row level security;

drop policy if exists mesas_gerir on public.mesas;
create policy mesas_gerir on public.mesas for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'T7001')) with check (public.pode_usar(estabelecimento_id, 'T7001'));

create table if not exists public.comandas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  mesa_id uuid references public.mesas(id) on delete set null,
  nome text,
  situacao text not null default 'aberta' check (situacao in ('aberta', 'fechada', 'cancelada')),
  aberta_por uuid references auth.users(id),
  aberta_em timestamptz not null default now(),
  fechada_por uuid references auth.users(id),
  fechada_em timestamptz,
  total numeric(10,2)
);
create unique index if not exists comandas_mesa_aberta on public.comandas (mesa_id) where situacao = 'aberta' and mesa_id is not null;
create index if not exists comandas_estab_idx on public.comandas (estabelecimento_id, situacao, aberta_em desc);

create table if not exists public.comanda_pessoas (
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  entrou_em timestamptz not null default now(),
  primary key (comanda_id, usuario_id)
);
create index if not exists comanda_pessoas_usuario_idx on public.comanda_pessoas (usuario_id, entrou_em desc);

create or replace function public.na_comanda(p_comanda uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.comanda_pessoas where comanda_id = p_comanda and usuario_id = auth.uid());
$$;

create or replace function public.equipe_do_salao(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'T7001') or public.pode_usar(p_estab, 'T7002');
$$;

drop policy if exists mesas_ler on public.mesas;
create policy mesas_ler on public.mesas for select to authenticated
  using (public.equipe_do_salao(estabelecimento_id)
      or exists (select 1 from public.comanda_pessoas cp join public.comandas c on c.id = cp.comanda_id
                  where c.mesa_id = mesas.id and cp.usuario_id = auth.uid()));

alter table public.comandas enable row level security;
drop policy if exists comandas_ler on public.comandas;
create policy comandas_ler on public.comandas for select to authenticated
  using (public.na_comanda(id) or public.equipe_do_salao(estabelecimento_id));

alter table public.comanda_pessoas enable row level security;
drop policy if exists comanda_pessoas_ler on public.comanda_pessoas;
create policy comanda_pessoas_ler on public.comanda_pessoas for select to authenticated
  using (public.na_comanda(comanda_id)
      or public.equipe_do_salao((select c.estabelecimento_id from public.comandas c where c.id = comanda_id)));

-- ============================================================
-- Pedidos (um por setor: cozinha e bar andam separados na fila)
-- ============================================================
create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  envio_id uuid not null,
  numero int not null,
  setor text not null check (setor in ('cozinha', 'bar')),
  usuario_id uuid references auth.users(id),
  lancado_por uuid references auth.users(id),
  observacao text check (observacao is null or length(observacao) <= 300),
  situacao text not null default 'novo' check (situacao in ('novo', 'preparo', 'pronto', 'entregue', 'cancelado')),
  motivo_cancelamento text,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists pedidos_fila_idx on public.pedidos (estabelecimento_id, situacao, criado_em);
create index if not exists pedidos_comanda_idx on public.pedidos (comanda_id, criado_em);

create table if not exists public.pedido_itens (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  item_id uuid references public.cardapio_itens(id) on delete set null,
  nome text not null,
  preco numeric(10,2) not null check (preco >= 0),
  quantidade int not null check (quantidade between 1 and 50),
  observacao text check (observacao is null or length(observacao) <= 200)
);
create index if not exists pedido_itens_pedido_idx on public.pedido_itens (pedido_id);

-- Descontos de cupons aplicados na comanda (cupom só vale em pedido feito pelo App).
create table if not exists public.comanda_descontos (
  id uuid primary key default gen_random_uuid(),
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  envio_id uuid not null,
  cupom_id uuid not null unique references public.cupons(id),
  usuario_id uuid not null references auth.users(id),
  titulo text not null,
  valor numeric(10,2) not null check (valor >= 0),
  criado_em timestamptz not null default now()
);

alter table public.pedidos enable row level security;
drop policy if exists pedidos_ler on public.pedidos;
create policy pedidos_ler on public.pedidos for select to authenticated
  using (public.na_comanda(comanda_id) or public.equipe_do_salao(estabelecimento_id));

alter table public.pedido_itens enable row level security;
drop policy if exists pedido_itens_ler on public.pedido_itens;
create policy pedido_itens_ler on public.pedido_itens for select to authenticated
  using (exists (select 1 from public.pedidos p where p.id = pedido_id));

alter table public.comanda_descontos enable row level security;
drop policy if exists comanda_descontos_ler on public.comanda_descontos;
create policy comanda_descontos_ler on public.comanda_descontos for select to authenticated
  using (public.na_comanda(comanda_id)
      or public.equipe_do_salao((select c.estabelecimento_id from public.comandas c where c.id = comanda_id)));

-- Totais da comanda: soma dos itens não cancelados menos os descontos.
create or replace function public.totais_comanda(p_comanda uuid)
returns table (subtotal numeric, desconto numeric, total numeric, meu_subtotal numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce(sum(i.preco * i.quantidade), 0) as sub,
           coalesce(sum(i.preco * i.quantidade) filter (where p.usuario_id = auth.uid()), 0) as meu
      from public.pedidos p join public.pedido_itens i on i.pedido_id = p.id
     where p.comanda_id = p_comanda and p.situacao <> 'cancelado'
  ), d as (
    select coalesce(sum(valor), 0) as desc_ from public.comanda_descontos where comanda_id = p_comanda
  )
  select s.sub, least(d.desc_, s.sub), greatest(s.sub - d.desc_, 0), s.meu
    from s, d
   where public.na_comanda(p_comanda)
      or public.equipe_do_salao((select c.estabelecimento_id from public.comandas c where c.id = p_comanda));
$$;

-- Cliente lê o QR da mesa: entra na comanda aberta (ou abre uma) e ganha o check-in.
create or replace function public.entrar_na_mesa(p_codigo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  m public.mesas;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '^.*/', ''));
  v_comanda uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para pedir pela mesa.'; end if;
  select * into m from public.mesas where codigo = v_codigo;
  if not found or not m.ativa then raise exception 'Mesa não encontrada. Peça ajuda à equipe.'; end if;
  if not exists (select 1 from public.estabelecimentos where id = m.estabelecimento_id and situacao = 'aprovado') then
    raise exception 'Este lugar não está recebendo pedidos pelo app.';
  end if;
  perform pg_advisory_xact_lock(hashtext(m.id::text));
  select id into v_comanda from public.comandas where mesa_id = m.id and situacao = 'aberta';
  if v_comanda is null then
    insert into public.comandas (estabelecimento_id, mesa_id, aberta_por)
    values (m.estabelecimento_id, m.id, auth.uid()) returning id into v_comanda;
  end if;
  insert into public.comanda_pessoas (comanda_id, usuario_id) values (v_comanda, auth.uid()) on conflict do nothing;
  -- Check-in automático (o QR da mesa já prova que a pessoa está no local).
  if not exists (select 1 from public.checkins where usuario_id = auth.uid() and estabelecimento_id = m.estabelecimento_id
                  and criado_em > now() - interval '3 hours') then
    insert into public.checkins (usuario_id, estabelecimento_id, distancia_m) values (auth.uid(), m.estabelecimento_id, 0);
  end if;
  return v_comanda;
end $$;

create or replace function public.sair_da_comanda(p_comanda uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pedidos where comanda_id = p_comanda and usuario_id = auth.uid() and situacao <> 'cancelado') then
    raise exception 'Você já fez pedidos nesta mesa. A comanda é fechada pela equipe no caixa.';
  end if;
  delete from public.comanda_pessoas where comanda_id = p_comanda and usuario_id = auth.uid();
end $$;

-- Equipe abre comanda numa mesa ou avulsa (balcão, com nome).
create or replace function public.abrir_comanda(p_estab uuid, p_mesa uuid, p_nome text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.pode_usar(p_estab, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if p_mesa is not null then
    if not exists (select 1 from public.mesas where id = p_mesa and estabelecimento_id = p_estab) then
      raise exception 'Mesa não encontrada.';
    end if;
    perform pg_advisory_xact_lock(hashtext(p_mesa::text));
    select id into v_id from public.comandas where mesa_id = p_mesa and situacao = 'aberta';
    if v_id is not null then return v_id; end if;
  elsif coalesce(btrim(p_nome), '') = '' then
    raise exception 'Dê um nome para a comanda avulsa (ex.: nome do cliente).';
  end if;
  insert into public.comandas (estabelecimento_id, mesa_id, nome, aberta_por)
  values (p_estab, p_mesa, nullif(btrim(p_nome), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

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

-- Fila: avança ou cancela um pedido (T7002; cancelar também com T7001).
create or replace function public.mudar_pedido(p_pedido uuid, p_situacao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.pedidos;
begin
  select * into p from public.pedidos where id = p_pedido for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if p_situacao not in ('novo', 'preparo', 'pronto', 'entregue', 'cancelado') then raise exception 'Situação inválida.'; end if;
  if not (public.pode_usar(p.estabelecimento_id, 'T7002') or (p_situacao in ('cancelado', 'entregue') and public.pode_usar(p.estabelecimento_id, 'T7001'))) then
    raise exception 'Sem acesso à fila de pedidos.';
  end if;
  if p.situacao = 'cancelado' then raise exception 'Este pedido já foi cancelado.'; end if;
  if p_situacao = 'cancelado' and coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;
  if exists (select 1 from public.comandas where id = p.comanda_id and situacao <> 'aberta') then
    raise exception 'A comanda deste pedido já foi fechada.';
  end if;
  update public.pedidos
     set situacao = p_situacao, atualizado_em = now(),
         motivo_cancelamento = case when p_situacao = 'cancelado' then btrim(p_motivo) end
   where id = p_pedido;
  -- Se o envio inteiro foi cancelado, o cupom volta para a carteira do cliente.
  if p_situacao = 'cancelado' and not exists (select 1 from public.pedidos where envio_id = p.envio_id and situacao <> 'cancelado') then
    update public.cupons set situacao = 'disponivel', usado_em = null
     where id in (select cupom_id from public.comanda_descontos where envio_id = p.envio_id);
    delete from public.comanda_descontos where envio_id = p.envio_id;
  end if;
end $$;

-- Cliente pode cancelar o próprio pedido enquanto ninguém começou a preparar.
create or replace function public.cancelar_meu_pedido(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if exists (select 1 from public.pedidos where envio_id = p_envio and usuario_id = auth.uid() and situacao <> 'novo') then
    raise exception 'O pedido já começou a ser preparado. Fale com a equipe.';
  end if;
  update public.pedidos set situacao = 'cancelado', motivo_cancelamento = 'Cancelado pelo cliente', atualizado_em = now()
   where envio_id = p_envio and usuario_id = auth.uid() and situacao = 'novo';
  if not found then raise exception 'Pedido não encontrado.'; end if;
  -- O cupom volta para a carteira.
  update public.cupons set situacao = 'disponivel', usado_em = null
   where id in (select cupom_id from public.comanda_descontos where envio_id = p_envio and usuario_id = auth.uid());
  delete from public.comanda_descontos where envio_id = p_envio and usuario_id = auth.uid();
end $$;

-- Fechar a comanda no caixa (pagamento no local até a fase 7).
create or replace function public.fechar_comanda(p_comanda uuid, p_cancelar boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_total numeric;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta comanda já foi fechada.'; end if;
  if p_cancelar then
    if exists (select 1 from public.pedidos where comanda_id = c.id and situacao <> 'cancelado') then
      raise exception 'Só dá para cancelar uma comanda sem pedidos. Cancele os pedidos antes.';
    end if;
    update public.comandas set situacao = 'cancelada', fechada_por = auth.uid(), fechada_em = now(), total = 0 where id = c.id;
    return 0;
  end if;
  if exists (select 1 from public.pedidos where comanda_id = c.id and situacao in ('novo', 'preparo', 'pronto')) then
    raise exception 'Ainda há pedidos não entregues nesta comanda.';
  end if;
  select t.total into v_total from public.totais_comanda(c.id) t;
  update public.comandas set situacao = 'fechada', fechada_por = auth.uid(), fechada_em = now(), total = coalesce(v_total, 0) where id = c.id;
  return coalesce(v_total, 0);
end $$;

-- Mesa vista pelo App antes de entrar (nome do lugar e número).
create or replace function public.mesa_pelo_codigo(p_codigo text)
returns table (estabelecimento_id uuid, estabelecimento text, numero text, area text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, m.numero, m.area from public.mesas m join public.estabelecimentos e on e.id = m.estabelecimento_id
   where m.codigo = upper(regexp_replace(coalesce(p_codigo, ''), '^.*/', '')) and m.ativa and e.situacao = 'aprovado';
$$;

-- Atualização em tempo real da fila e da comanda.
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pedidos') then
      alter publication supabase_realtime add table public.pedidos;
    end if;
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'comandas') then
      alter publication supabase_realtime add table public.comandas;
    end if;
  end if;
end $$;

revoke execute on function public.pode_liberar(uuid, text), public.exigir_gestao_equipe(uuid) from anon;
grant execute on function public.equipe(uuid), public.adicionar_membro(uuid, text, text, text),
  public.atualizar_membro(uuid, uuid, text, text, boolean, text[]), public.solicitacoes_pendentes(uuid),
  public.decidir_solicitacao(uuid, boolean), public.totais_comanda(uuid), public.entrar_na_mesa(text),
  public.sair_da_comanda(uuid), public.abrir_comanda(uuid, uuid, text), public.fazer_pedido(uuid, jsonb, text, uuid),
  public.mudar_pedido(uuid, text, text), public.cancelar_meu_pedido(uuid), public.fechar_comanda(uuid, boolean),
  public.mesa_pelo_codigo(text) to authenticated;

select 'RoVibes 007 aplicado com sucesso' as resultado;
