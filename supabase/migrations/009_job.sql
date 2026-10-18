-- RoVibes 009: RoVibes Job — situação por item, histórico de eventos, retirada no balcão,
-- fila de entregas (cumim) e QR dinâmico de confirmação de entrega.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Destino de preparo: cozinha, bar ou sem preparo (vai direto para entrega)
-- ============================================================
alter table public.cardapio_categorias drop constraint if exists cardapio_categorias_setor_check;
alter table public.cardapio_categorias add constraint cardapio_categorias_setor_check check (setor in ('cozinha', 'bar', 'sem_preparo'));

-- ============================================================
-- Pedido: um por envio, com modalidade. A situação do pedido passa a ser um resumo dos itens.
-- ============================================================
alter table public.pedidos alter column setor drop not null;
alter table public.pedidos add column if not exists modalidade text not null default 'mesa';
do $$ begin
  alter table public.pedidos add constraint pedidos_modalidade_check check (modalidade in ('mesa', 'retirada'));
exception when duplicate_object then null; end $$;

-- Itens com situação própria e quem fez cada etapa.
alter table public.pedido_itens add column if not exists estabelecimento_id uuid references public.estabelecimentos(id) on delete cascade;
alter table public.pedido_itens add column if not exists destino text;
alter table public.pedido_itens add column if not exists situacao text;
alter table public.pedido_itens add column if not exists preparo_por uuid references auth.users(id);
alter table public.pedido_itens add column if not exists preparo_em timestamptz;
alter table public.pedido_itens add column if not exists pronto_por uuid references auth.users(id);
alter table public.pedido_itens add column if not exists pronto_em timestamptz;
alter table public.pedido_itens add column if not exists saiu_por uuid references auth.users(id);
alter table public.pedido_itens add column if not exists saiu_em timestamptz;
alter table public.pedido_itens add column if not exists entregue_por uuid references auth.users(id);
alter table public.pedido_itens add column if not exists entregue_em timestamptz;
alter table public.pedido_itens add column if not exists entrega_por_qr boolean;
alter table public.pedido_itens add column if not exists motivo_cancelamento text;
alter table public.pedido_itens add column if not exists atualizado_em timestamptz not null default now();

-- Dados que já existiam: herdam do pedido.
update public.pedido_itens i
   set estabelecimento_id = p.estabelecimento_id,
       destino = coalesce(i.destino, p.setor, 'cozinha'),
       situacao = coalesce(i.situacao, case p.situacao when 'novo' then 'recebido' when 'preparo' then 'preparo' when 'pronto' then 'pronto'
                                                       when 'entregue' then 'entregue' else 'cancelado' end),
       motivo_cancelamento = coalesce(i.motivo_cancelamento, p.motivo_cancelamento)
  from public.pedidos p
 where p.id = i.pedido_id and (i.estabelecimento_id is null or i.destino is null or i.situacao is null);

alter table public.pedido_itens alter column estabelecimento_id set not null;
alter table public.pedido_itens alter column destino set not null;
alter table public.pedido_itens alter column situacao set not null;
alter table public.pedido_itens alter column situacao set default 'recebido';
do $$ begin
  alter table public.pedido_itens add constraint pedido_itens_destino_check check (destino in ('cozinha', 'bar', 'sem_preparo'));
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.pedido_itens add constraint pedido_itens_situacao_check
    check (situacao in ('recebido', 'preparo', 'pronto', 'saiu', 'entregue', 'cancelado'));
exception when duplicate_object then null; end $$;
create index if not exists pedido_itens_fila_idx on public.pedido_itens (estabelecimento_id, situacao, destino);

-- Resumo do pedido a partir dos itens (mantém a fila, a comanda e o tempo real atualizados).
create or replace function public.resumir_pedido()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_pedido uuid := coalesce(new.pedido_id, old.pedido_id); v_sit text;
begin
  select case
           when count(*) filter (where situacao <> 'cancelado') = 0 then 'cancelado'
           when bool_and(situacao = 'entregue') filter (where situacao <> 'cancelado') then 'entregue'
           when bool_and(situacao in ('pronto', 'saiu', 'entregue')) filter (where situacao <> 'cancelado') then 'pronto'
           when bool_and(situacao = 'recebido' or (situacao = 'pronto' and destino = 'sem_preparo')) filter (where situacao <> 'cancelado') then 'novo'
           else 'preparo'
         end into v_sit
    from public.pedido_itens where pedido_id = v_pedido;
  update public.pedidos set situacao = coalesce(v_sit, 'cancelado'), atualizado_em = now() where id = v_pedido;
  return null;
end $$;
drop trigger if exists pedido_itens_resumo on public.pedido_itens;
create trigger pedido_itens_resumo after insert or update of situacao on public.pedido_itens
  for each row execute function public.resumir_pedido();

-- ============================================================
-- Histórico de eventos (registro imutável: ninguém edita nem apaga)
-- ============================================================
create table if not exists public.pedido_eventos (
  id bigint generated always as identity primary key,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  pedido_id uuid not null references public.pedidos(id) on delete cascade,
  item_id uuid references public.pedido_itens(id) on delete cascade,
  acao text not null,
  usuario_id uuid references auth.users(id),
  detalhe text,
  criado_em timestamptz not null default now()
);
create index if not exists pedido_eventos_pedido_idx on public.pedido_eventos (pedido_id, criado_em);
create index if not exists pedido_eventos_estab_idx on public.pedido_eventos (estabelecimento_id, criado_em desc);
alter table public.pedido_eventos enable row level security;
drop policy if exists pedido_eventos_ler on public.pedido_eventos;
create policy pedido_eventos_ler on public.pedido_eventos for select to authenticated
  using (public.equipe_do_salao(estabelecimento_id) or public.pode_usar(estabelecimento_id, 'T7003'));

-- Quem participa da operação (garçom, preparo, entrega).
create or replace function public.equipe_do_salao(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'T7001') or public.pode_usar(p_estab, 'T7002') or public.pode_usar(p_estab, 'T7003');
$$;

-- ============================================================
-- Fazer pedido (um pedido por envio; itens sem preparo já nascem prontos)
-- ============================================================
drop function if exists public.fazer_pedido(uuid, jsonb, text, uuid);
create or replace function public.fazer_pedido(p_comanda uuid, p_itens jsonb, p_observacao text, p_cupom uuid, p_modalidade text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  c public.comandas;
  v_cliente boolean; v_pedido uuid; v_numero int; v_modalidade text;
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
  v_modalidade := coalesce(nullif(p_modalidade, ''), case when c.mesa_id is null then 'retirada' else 'mesa' end);
  if v_modalidade not in ('mesa', 'retirada') then raise exception 'Modalidade inválida.'; end if;
  if v_modalidade = 'mesa' and c.mesa_id is null then v_modalidade := 'retirada'; end if;

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

-- ============================================================
-- Ações da equipe sobre itens
--   iniciar   recebido → preparo           (Preparo T7002)
--   liberar   recebido/preparo → pronto    (Preparo T7002)
--   saiu      pronto → saiu (só entrega na mesa)   (Entregas T7003 ou Garçom T7001)
--   voltar    saiu → pronto                (Entregas ou Garçom)
--   entregar  pronto/saiu → entregue, sem QR: só pedido lançado pela equipe (cliente sem App)
--   cancelar  qualquer etapa antes de entregue, com motivo
-- ============================================================
create or replace function public.mudar_itens(p_itens uuid[], p_acao text, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  i record; v_feitos int := 0; v_de text[]; v_para text; v_estab uuid; v_envio uuid; v_retirada boolean := false;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_itens is null or cardinality(p_itens) = 0 then raise exception 'Escolha pelo menos um item.'; end if;
  case p_acao
    when 'iniciar' then v_de := array['recebido']; v_para := 'preparo';
    when 'liberar' then v_de := array['recebido', 'preparo']; v_para := 'pronto';
    when 'saiu' then v_de := array['pronto']; v_para := 'saiu';
    when 'voltar' then v_de := array['saiu']; v_para := 'pronto';
    when 'entregar' then v_de := array['pronto', 'saiu']; v_para := 'entregue';
    when 'cancelar' then v_de := array['recebido', 'preparo', 'pronto', 'saiu']; v_para := 'cancelado';
    else raise exception 'Ação inválida.';
  end case;
  if p_acao = 'cancelar' and coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;

  for i in
    select pi.id, pi.pedido_id, pi.situacao, pi.estabelecimento_id, p.modalidade, p.usuario_id as cliente, p.envio_id, c.situacao as comanda
      from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id join public.comandas c on c.id = p.comanda_id
     where pi.id = any(p_itens)
     order by pi.id
       for update of pi
  loop
    v_estab := i.estabelecimento_id;
    if p_acao in ('iniciar', 'liberar') and not public.pode_usar(v_estab, 'T7002') then
      raise exception 'Sem acesso ao preparo.';
    elsif p_acao in ('saiu', 'voltar', 'entregar') and not (public.pode_usar(v_estab, 'T7003') or public.pode_usar(v_estab, 'T7001')) then
      raise exception 'Sem acesso às entregas.';
    elsif p_acao = 'cancelar' and not public.equipe_do_salao(v_estab) then
      raise exception 'Sem acesso a este pedido.';
    end if;
    if i.comanda <> 'aberta' then raise exception 'A comanda deste pedido já foi fechada.'; end if;
    if p_acao = 'saiu' and i.modalidade <> 'mesa' then v_retirada := true; continue; end if;
    if p_acao = 'entregar' and i.cliente is not null then
      raise exception 'Pedido feito pelo App: confirme a entrega lendo o QR code do cliente.';
    end if;
    if not (i.situacao = any(v_de)) then continue; end if;

    update public.pedido_itens set
        situacao = v_para, atualizado_em = now(),
        preparo_por = case when v_para = 'preparo' then auth.uid() else preparo_por end,
        preparo_em = case when v_para = 'preparo' then now() else preparo_em end,
        pronto_por = case when v_para = 'pronto' and p_acao = 'liberar' then auth.uid() else pronto_por end,
        pronto_em = case when v_para = 'pronto' and p_acao = 'liberar' then now() else pronto_em end,
        saiu_por = case when v_para = 'saiu' then auth.uid() when p_acao = 'voltar' then null else saiu_por end,
        saiu_em = case when v_para = 'saiu' then now() when p_acao = 'voltar' then null else saiu_em end,
        entregue_por = case when v_para = 'entregue' then auth.uid() else entregue_por end,
        entregue_em = case when v_para = 'entregue' then now() else entregue_em end,
        entrega_por_qr = case when v_para = 'entregue' then false else entrega_por_qr end,
        motivo_cancelamento = case when v_para = 'cancelado' then btrim(p_motivo) else motivo_cancelamento end
     where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (v_estab, i.pedido_id, i.id, p_acao, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''));
    v_feitos := v_feitos + 1;
    v_envio := i.envio_id;

    -- Pedido inteiro cancelado: o cupom volta para a carteira.
    if v_para = 'cancelado' and not exists (select 1 from public.pedido_itens where pedido_id = i.pedido_id and situacao <> 'cancelado') then
      update public.cupons set situacao = 'disponivel', usado_em = null
       where id in (select cupom_id from public.comanda_descontos where envio_id = i.envio_id);
      delete from public.comanda_descontos where envio_id = i.envio_id;
    end if;
  end loop;
  if v_feitos = 0 and v_retirada then raise exception 'Pedido para retirada no balcão: entregue quando o cliente chegar.'; end if;
  if v_feitos = 0 then raise exception 'Nada foi alterado: os itens já mudaram de etapa (talvez outra pessoa atualizou).'; end if;
  return v_feitos;
end $$;

drop function if exists public.mudar_pedido(uuid, text, text);

-- Cliente cancela o próprio pedido enquanto nada começou a ser preparado nem saiu.
create or replace function public.cancelar_meu_pedido(p_envio uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_pedido uuid; v_estab uuid;
begin
  select id, estabelecimento_id into v_pedido, v_estab from public.pedidos where envio_id = p_envio and usuario_id = auth.uid();
  if v_pedido is null then raise exception 'Pedido não encontrado.'; end if;
  if exists (select 1 from public.pedido_itens where pedido_id = v_pedido
              and (situacao in ('preparo', 'saiu', 'entregue') or (situacao = 'pronto' and destino <> 'sem_preparo'))) then
    raise exception 'O pedido já começou a ser preparado. Fale com a equipe.';
  end if;
  update public.pedido_itens set situacao = 'cancelado', motivo_cancelamento = 'Cancelado pelo cliente', atualizado_em = now()
   where pedido_id = v_pedido and situacao <> 'cancelado';
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, acao, usuario_id, detalhe)
  values (v_estab, v_pedido, 'cancelar', auth.uid(), 'Cancelado pelo cliente');
  update public.cupons set situacao = 'disponivel', usado_em = null
   where id in (select cupom_id from public.comanda_descontos where envio_id = p_envio and usuario_id = auth.uid());
  delete from public.comanda_descontos where envio_id = p_envio and usuario_id = auth.uid();
end $$;

-- ============================================================
-- QR dinâmico de entrega: muda a cada poucos segundos, vale 90 s e uma única leitura.
-- ============================================================
create table if not exists public.codigos_entrega (
  codigo text primary key,
  comanda_id uuid not null references public.comandas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  usado_em timestamptz,
  usado_por uuid references auth.users(id)
);
create index if not exists codigos_entrega_comanda_idx on public.codigos_entrega (comanda_id, expira_em desc);
alter table public.codigos_entrega enable row level security;  -- só pelas funções abaixo

create or replace function public.gerar_codigo_entrega(p_comanda uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.na_comanda(p_comanda) then raise exception 'Você não está nesta comanda.'; end if;
  if not exists (select 1 from public.comandas where id = p_comanda and situacao = 'aberta') then
    raise exception 'Esta comanda já foi fechada.';
  end if;
  delete from public.codigos_entrega where usuario_id = auth.uid() and expira_em < now() - interval '1 hour';
  v := 'RVE-' || public.gerar_codigo(16);
  insert into public.codigos_entrega (codigo, comanda_id, usuario_id, expira_em) values (v, p_comanda, auth.uid(), now() + interval '90 seconds');
  return v;
end $$;

create or replace function public.exigir_entregas(p_estab uuid)
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if not (public.pode_usar(p_estab, 'T7003') or public.pode_usar(p_estab, 'T7001')) then
    raise exception 'Sem acesso às entregas.';
  end if;
end $$;

-- Lê o QR do cliente e mostra o que pode ser entregue (não confirma nada ainda).
create or replace function public.conferir_codigo_entrega(p_estab uuid, p_codigo text)
returns table (cliente text, destino text, item_id uuid, numero int, nome text, quantidade int, observacao text, situacao text)
language plpgsql stable security definer set search_path = public as $$
declare k public.codigos_entrega; c public.comandas; v_dest text;
begin
  perform public.exigir_entregas(p_estab);
  select * into k from public.codigos_entrega where codigo = upper(btrim(p_codigo));
  if not found then raise exception 'QR code inválido. Peça para o cliente abrir o QR de entrega no App.'; end if;
  if k.usado_em is not null then raise exception 'Este QR code já foi usado. Peça para o cliente mostrar o QR atualizado.'; end if;
  if k.expira_em < now() then raise exception 'QR code vencido. Peça para o cliente mostrar o QR atualizado na tela.'; end if;
  select * into c from public.comandas where id = k.comanda_id;
  if c.estabelecimento_id <> p_estab then raise exception 'Este QR code é de outro estabelecimento.'; end if;
  if c.situacao <> 'aberta' then raise exception 'A comanda deste cliente já foi fechada.'; end if;
  v_dest := coalesce('Mesa ' || (select m.numero from public.mesas m where m.id = c.mesa_id), c.nome, 'Comanda');
  return query
  select coalesce((select pf.nome from public.perfis pf where pf.id = k.usuario_id), 'Cliente'), v_dest,
         pi.id, p.numero, pi.nome, pi.quantidade, pi.observacao, pi.situacao
    from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
   where p.comanda_id = c.id and pi.situacao in ('pronto', 'saiu')
   order by p.numero, pi.nome;
end $$;

-- Confirma a entrega dos itens escolhidos. O QR é consumido: uma leitura, uma confirmação.
create or replace function public.confirmar_entrega(p_estab uuid, p_codigo text, p_itens uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare k public.codigos_entrega; c public.comandas; v_feitos int := 0; i record;
begin
  perform public.exigir_entregas(p_estab);
  if p_itens is null or cardinality(p_itens) = 0 then raise exception 'Marque os itens que estão sendo entregues.'; end if;
  select * into k from public.codigos_entrega where codigo = upper(btrim(p_codigo)) for update;
  if not found then raise exception 'QR code inválido.'; end if;
  if k.usado_em is not null then raise exception 'Este QR code já foi usado.'; end if;
  if k.expira_em < now() then raise exception 'QR code vencido. Leia o QR atualizado do cliente.'; end if;
  select * into c from public.comandas where id = k.comanda_id;
  if c.estabelecimento_id <> p_estab or c.situacao <> 'aberta' then raise exception 'Comanda indisponível.'; end if;
  update public.codigos_entrega set usado_em = now(), usado_por = auth.uid() where codigo = k.codigo;
  for i in
    select pi.id, pi.pedido_id from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
     where pi.id = any(p_itens) and p.comanda_id = c.id and pi.situacao in ('pronto', 'saiu')
       for update of pi
  loop
    update public.pedido_itens
       set situacao = 'entregue', entregue_por = auth.uid(), entregue_em = now(), entrega_por_qr = true, atualizado_em = now()
     where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (p_estab, i.pedido_id, i.id, 'entregar', auth.uid(), 'QR do cliente');
    v_feitos := v_feitos + 1;
  end loop;
  if v_feitos = 0 then raise exception 'Nenhum dos itens está pendente de entrega nesta comanda (já foram entregues?).'; end if;
  return v_feitos;
end $$;

-- ============================================================
-- Totais e fechamento passam a olhar os itens
-- ============================================================
create or replace function public.totais_comanda(p_comanda uuid)
returns table (subtotal numeric, desconto numeric, total numeric, meu_subtotal numeric)
language sql stable security definer set search_path = public as $$
  with s as (
    select coalesce(sum(i.preco * i.quantidade), 0) as sub,
           coalesce(sum(i.preco * i.quantidade) filter (where p.usuario_id = auth.uid()), 0) as meu
      from public.pedidos p join public.pedido_itens i on i.pedido_id = p.id
     where p.comanda_id = p_comanda and i.situacao <> 'cancelado'
  ), d as (
    select coalesce(sum(valor), 0) as desc_ from public.comanda_descontos where comanda_id = p_comanda
  )
  select s.sub, least(d.desc_, s.sub), greatest(s.sub - d.desc_, 0), s.meu
    from s, d
   where public.na_comanda(p_comanda)
      or public.equipe_do_salao((select c.estabelecimento_id from public.comandas c where c.id = p_comanda));
$$;

create or replace function public.fechar_comanda(p_comanda uuid, p_cancelar boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_total numeric;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta comanda já foi fechada.'; end if;
  if p_cancelar then
    if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                where p.comanda_id = c.id and i.situacao <> 'cancelado') then
      raise exception 'Só dá para cancelar uma comanda sem pedidos. Cancele os itens antes.';
    end if;
    update public.comandas set situacao = 'cancelada', fechada_por = auth.uid(), fechada_em = now(), total = 0 where id = c.id;
    return 0;
  end if;
  if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
              where p.comanda_id = c.id and i.situacao in ('recebido', 'preparo', 'pronto', 'saiu')) then
    raise exception 'Ainda há itens não entregues nesta comanda.';
  end if;
  select t.total into v_total from public.totais_comanda(c.id) t;
  update public.comandas set situacao = 'fechada', fechada_por = auth.uid(), fechada_em = now(), total = coalesce(v_total, 0) where id = c.id;
  return coalesce(v_total, 0);
end $$;

-- Políticas que dependem da equipe do salão passam a incluir Entregas (T7003).
drop policy if exists mesas_ler on public.mesas;
create policy mesas_ler on public.mesas for select to authenticated
  using (public.equipe_do_salao(estabelecimento_id)
      or exists (select 1 from public.comanda_pessoas cp join public.comandas c on c.id = cp.comanda_id
                  where c.mesa_id = mesas.id and cp.usuario_id = auth.uid()));

-- Tempo real também nos itens (filas do Job).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pedido_itens') then
    alter publication supabase_realtime add table public.pedido_itens;
  end if;
end $$;

revoke execute on function public.exigir_entregas(uuid) from anon;
grant execute on function public.fazer_pedido(uuid, jsonb, text, uuid, text), public.mudar_itens(uuid[], text, text),
  public.cancelar_meu_pedido(uuid), public.gerar_codigo_entrega(uuid), public.conferir_codigo_entrega(uuid, text),
  public.confirmar_entrega(uuid, text, uuid[]), public.totais_comanda(uuid), public.fechar_comanda(uuid, boolean) to authenticated;

select 'RoVibes 009 aplicado com sucesso' as resultado;
