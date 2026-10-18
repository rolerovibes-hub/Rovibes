-- RoVibes 017 (Fase 7a): pagamentos da comanda (caixa agora; Mercado Pago na 7b), taxa de serviço,
-- dividir a conta (só o meu / igual / outro valor), quanto falta, fechamento automático e juntar mesas.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Configuração de pagamento do estabelecimento
-- ============================================================
alter table public.estabelecimentos add column if not exists taxa_servico numeric(4,2) not null default 0 check (taxa_servico between 0 and 20);
alter table public.estabelecimentos add column if not exists comissao_rovibes numeric(4,2) not null default 3 check (comissao_rovibes between 0 and 20);

-- Taxa de serviço da comanda (copiada do lugar ao abrir; o garçom pode tirar a pedido do cliente).
alter table public.comandas add column if not exists taxa_servico numeric(4,2);
alter table public.comandas add column if not exists juntada_em uuid references public.comandas(id);
alter table public.comandas drop constraint if exists comandas_situacao_check;
alter table public.comandas add constraint comandas_situacao_check check (situacao in ('aberta', 'fechada', 'cancelada', 'juntada'));

create or replace function public.copiar_taxa_servico()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.taxa_servico is null then
    select taxa_servico into new.taxa_servico from public.estabelecimentos where id = new.estabelecimento_id;
  end if;
  return new;
end $$;
drop trigger if exists comandas_taxa_servico on public.comandas;
create trigger comandas_taxa_servico before insert on public.comandas for each row execute function public.copiar_taxa_servico();

-- Só o proprietário (G1001) muda taxa e comissão não muda pelo cliente.
create or replace function public.definir_taxa_servico(p_estab uuid, p_taxa numeric)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G1003') and not public.eh_proprietario(p_estab) then raise exception 'Sem acesso aos pagamentos.'; end if;
  if p_taxa is null or p_taxa < 0 or p_taxa > 20 then raise exception 'A taxa de serviço vai de 0%% a 20%%.'; end if;
  update public.estabelecimentos set taxa_servico = round(p_taxa, 2) where id = p_estab;
end $$;

create or replace function public.tirar_servico(p_comanda uuid, p_tirar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  update public.comandas set taxa_servico = case when p_tirar then 0 else (select taxa_servico from public.estabelecimentos where id = c.estabelecimento_id) end
   where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, case when p_tirar then 'servico_retirado' else 'servico_incluido' end, auth.uid(), null);
end $$;

-- ============================================================
-- Pagamentos
-- ============================================================
create table if not exists public.pagamentos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  comanda_id uuid references public.comandas(id) on delete set null,
  alvo text not null default 'comanda' check (alvo in ('comanda', 'retirada', 'ingresso')),
  alvo_id uuid,
  usuario_id uuid references auth.users(id) on delete set null,
  origem text not null check (origem in ('app', 'caixa')),
  meio text check (meio in ('pix', 'credito', 'debito', 'dinheiro', 'outro')),
  modo text check (modo in ('meus_itens', 'igual', 'valor', 'total')),
  valor numeric(10,2) not null check (valor > 0),
  comissao numeric(10,2) not null default 0,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovado', 'recusado', 'cancelado', 'estornado')),
  mp_preferencia text,
  mp_pagamento text unique,
  observacao text check (observacao is null or length(observacao) <= 200),
  registrado_por uuid references auth.users(id),
  criado_em timestamptz not null default now(),
  aprovado_em timestamptz,
  cancelado_em timestamptz,
  motivo_cancelamento text
);
create index if not exists pagamentos_comanda_idx on public.pagamentos (comanda_id, situacao);
create index if not exists pagamentos_estab_idx on public.pagamentos (estabelecimento_id, criado_em desc);
alter table public.pagamentos enable row level security;
drop policy if exists pagamentos_ler on public.pagamentos;
create policy pagamentos_ler on public.pagamentos for select to authenticated
  using (usuario_id = auth.uid()
      or (comanda_id is not null and public.na_comanda(comanda_id))
      or public.equipe_do_salao(estabelecimento_id)
      or public.pode_usar(estabelecimento_id, 'G1003'));
revoke insert, update, delete on public.pagamentos from anon, authenticated;

-- ============================================================
-- Totais com serviço, pagamentos e as partes de cada um
-- ============================================================
-- Cálculo interno (sem checar quem pede; usado pelas funções e pelo retorno do Mercado Pago).
create or replace function public.totais_calculo(p_comanda uuid, p_eu uuid)
returns table (subtotal numeric, desconto numeric, servico numeric, taxa_servico numeric, total numeric, pago numeric, falta numeric,
               pessoas int, meu_subtotal numeric, minha_parte_itens numeric, minha_parte_igual numeric, pendente numeric)
language sql stable security definer set search_path = public as $$
  with c as (select * from public.comandas where id = p_comanda),
  itens as (
    select p.usuario_id, i.preco * i.quantidade as v
      from public.pedidos p join public.pedido_itens i on i.pedido_id = p.id
     where p.comanda_id = p_comanda and i.situacao <> 'cancelado'
  ),
  s as (
    select coalesce(sum(v), 0) as sub,
           coalesce(sum(v) filter (where usuario_id = p_eu), 0) as meu,
           -- Itens lançados pela equipe (sem dono) são divididos entre todos.
           coalesce(sum(v) filter (where usuario_id is null or usuario_id not in (select usuario_id from public.comanda_pessoas where comanda_id = p_comanda)), 0) as sem_dono
      from itens
  ),
  d as (
    select coalesce(sum(valor), 0) as desc_, coalesce(sum(valor) filter (where usuario_id = p_eu), 0) as meu_desc
      from public.comanda_descontos where comanda_id = p_comanda
  ),
  pg as (
    select coalesce(sum(valor) filter (where situacao = 'aprovado'), 0) as pago,
           coalesce(sum(valor) filter (where situacao = 'pendente' and criado_em > now() - interval '30 minutes'), 0) as pend
      from public.pagamentos where comanda_id = p_comanda
  ),
  n as (select greatest((select count(*) from public.comanda_pessoas where comanda_id = p_comanda), 1)::int as qtd),
  t as (
    select s.*, d.*, pg.*, n.qtd, coalesce((select taxa_servico from c), 0) as taxa,
           greatest(s.sub - least(d.desc_, s.sub), 0) as liquido
      from s, d, pg, n
  ),
  f as (
    select t.*, round(t.liquido * t.taxa / 100, 2) as serv, round(t.liquido * (1 + t.taxa / 100), 2) as tot
      from t
  )
  select f.sub, least(f.desc_, f.sub), f.serv, f.taxa, f.tot, f.pago, greatest(f.tot - f.pago, 0), f.qtd, f.meu,
         least(greatest(f.tot - f.pago, 0), round((greatest(f.meu - f.meu_desc, 0) + f.sem_dono / f.qtd) * (1 + f.taxa / 100), 2)),
         least(greatest(f.tot - f.pago, 0), round(f.tot / f.qtd, 2)),
         f.pend
    from f;
$$;

drop function if exists public.totais_comanda(uuid);
create or replace function public.totais_comanda(p_comanda uuid)
returns table (subtotal numeric, desconto numeric, servico numeric, taxa_servico numeric, total numeric, pago numeric, falta numeric,
               pessoas int, meu_subtotal numeric, minha_parte_itens numeric, minha_parte_igual numeric, pendente numeric)
language sql stable security definer set search_path = public as $$
  select t.* from public.totais_calculo(p_comanda, auth.uid()) t
   where public.na_comanda(p_comanda)
      or public.equipe_do_salao((select estabelecimento_id from public.comandas where id = p_comanda))
      or public.pode_usar((select estabelecimento_id from public.comandas where id = p_comanda), 'G1003');
$$;

-- Fecha sozinha quando tudo foi pago e entregue.
create or replace function public.fechar_se_quitada(p_comanda uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_total numeric; v_falta numeric; c public.comandas;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then return false; end if;
  if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
              where p.comanda_id = c.id and i.situacao in ('recebido', 'preparo', 'pronto', 'saiu')) then
    return false;
  end if;
  select t.total, t.falta into v_total, v_falta from public.totais_calculo(c.id, null) t;
  if v_total <= 0 or v_falta > 0 then return false; end if;
  update public.comandas set situacao = 'fechada', fechada_em = now(), fechada_por = auth.uid(), total = v_total where id = c.id;
  return true;
end $$;

-- Paga antes de tudo chegar: quando o último item é entregue, a comanda fecha sozinha.
create or replace function public.fechar_ao_entregar()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_comanda uuid;
begin
  if new.situacao in ('entregue', 'cancelado') and old.situacao is distinct from new.situacao then
    select comanda_id into v_comanda from public.pedidos where id = new.pedido_id;
    if exists (select 1 from public.pagamentos where comanda_id = v_comanda and situacao = 'aprovado') then
      perform public.fechar_se_quitada(v_comanda);
    end if;
  end if;
  return new;
end $$;
drop trigger if exists pedido_itens_fechar_quitada on public.pedido_itens;
create trigger pedido_itens_fechar_quitada after update of situacao on public.pedido_itens for each row execute function public.fechar_ao_entregar();

-- Registro no caixa: dinheiro, maquininha ou Pix na hora.
create or replace function public.registrar_pagamento_caixa(p_comanda uuid, p_valor numeric, p_meio text, p_observacao text default null)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_falta numeric;
begin
  select * into c from public.comandas where id = p_comanda;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if p_meio not in ('pix', 'credito', 'debito', 'dinheiro', 'outro') then raise exception 'Forma de pagamento inválida.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor.'; end if;
  select t.falta into v_falta from public.totais_calculo(c.id, null) t;
  if p_valor > coalesce(v_falta, 0) + 0.009 then
    raise exception 'O valor é maior do que falta pagar (R$ %).', replace(to_char(coalesce(v_falta, 0), 'FM999990.00'), '.', ',');
  end if;
  insert into public.pagamentos (estabelecimento_id, comanda_id, origem, meio, modo, valor, situacao, observacao, registrado_por, aprovado_em)
  values (c.estabelecimento_id, c.id, 'caixa', p_meio, 'valor', round(p_valor, 2), 'aprovado', nullif(btrim(coalesce(p_observacao, '')), ''), auth.uid(), now());
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'pagamento', auth.uid(),
          'Caixa · ' || p_meio || ' · R$ ' || replace(to_char(round(p_valor, 2), 'FM999990.00'), '.', ','));
  return public.fechar_se_quitada(c.id);
end $$;

-- Supervisão cancela um pagamento do caixa registrado errado (os do App são estornados pelo Mercado Pago, na 7b).
create or replace function public.cancelar_pagamento(p_pagamento uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare pg public.pagamentos; c public.comandas;
begin
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if not public.pode_supervisionar(pg.estabelecimento_id) then raise exception 'Só a supervisão cancela pagamentos.'; end if;
  if pg.origem <> 'caixa' then raise exception 'Pagamentos pelo App são estornados pelo Mercado Pago.'; end if;
  if pg.situacao <> 'aprovado' then raise exception 'Este pagamento não está aprovado.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  select * into c from public.comandas where id = pg.comanda_id;
  if c.situacao = 'fechada' then raise exception 'Reabra a comanda antes de cancelar um pagamento dela.'; end if;
  update public.pagamentos set situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = btrim(p_motivo) where id = pg.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (pg.estabelecimento_id, pg.comanda_id, 'pagamento_cancelado', auth.uid(),
          'R$ ' || replace(to_char(pg.valor, 'FM999990.00'), '.', ',') || ' · ' || btrim(p_motivo));
end $$;

create or replace function public.pagamentos_comanda(p_comanda uuid)
returns table (id uuid, origem text, meio text, modo text, valor numeric, situacao text, criado_em timestamptz, quem text, minha boolean, observacao text)
language sql stable security definer set search_path = public as $$
  select pg.id, pg.origem, pg.meio, pg.modo, pg.valor, pg.situacao, coalesce(pg.aprovado_em, pg.criado_em),
         coalesce(split_part(pu.nome, ' ', 1), case when pg.origem = 'caixa' then 'Caixa' end),
         coalesce(pg.usuario_id = auth.uid(), false), pg.observacao
    from public.pagamentos pg
    left join public.perfis pu on pu.id = pg.usuario_id
   where pg.comanda_id = p_comanda and pg.situacao in ('aprovado', 'cancelado', 'estornado')
     and (public.na_comanda(p_comanda) or public.equipe_do_salao(pg.estabelecimento_id) or public.pode_usar(pg.estabelecimento_id, 'G1003'))
   order by coalesce(pg.aprovado_em, pg.criado_em);
$$;

-- O fechamento manual agora avisa quando ainda falta pagar (a equipe confirma com p_mesmo_assim).
drop function if exists public.fechar_comanda(uuid, boolean);
create or replace function public.fechar_comanda(p_comanda uuid, p_cancelar boolean default false, p_mesmo_assim boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_total numeric; v_falta numeric;
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
    if exists (select 1 from public.pagamentos where comanda_id = c.id and situacao = 'aprovado') then
      raise exception 'Esta comanda tem pagamentos. Cancele os pagamentos antes.';
    end if;
    update public.comandas set situacao = 'cancelada', fechada_por = auth.uid(), fechada_em = now(), total = 0 where id = c.id;
    return 0;
  end if;
  if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
              where p.comanda_id = c.id and i.situacao in ('recebido', 'preparo', 'pronto', 'saiu')) then
    raise exception 'Ainda há itens não entregues nesta comanda.';
  end if;
  select t.total, t.falta into v_total, v_falta from public.totais_calculo(c.id, null) t;
  if coalesce(v_falta, 0) > 0 and not p_mesmo_assim then
    raise exception 'FALTA_PAGAR:%', replace(to_char(v_falta, 'FM999990.00'), '.', ',');
  end if;
  update public.comandas set situacao = 'fechada', fechada_por = auth.uid(), fechada_em = now(), total = coalesce(v_total, 0) where id = c.id;
  return coalesce(v_total, 0);
end $$;

-- ============================================================
-- Juntar mesas: tudo da comanda de origem vai para a de destino
-- ============================================================
create or replace function public.juntar_comandas(p_destino uuid, p_origem uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.comandas; o public.comandas; v_de text; v_para text;
begin
  if p_destino = p_origem then raise exception 'Escolha outra mesa.'; end if;
  -- Trava as duas na mesma ordem para não haver impasse.
  perform 1 from public.comandas where id in (p_destino, p_origem) order by id for update;
  select * into d from public.comandas where id = p_destino;
  select * into o from public.comandas where id = p_origem;
  if d.id is null or o.id is null or d.situacao <> 'aberta' or o.situacao <> 'aberta' then raise exception 'As duas comandas precisam estar abertas.'; end if;
  if d.estabelecimento_id <> o.estabelecimento_id then raise exception 'Comandas de lugares diferentes.'; end if;
  if not public.pode_usar(d.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;

  update public.pedidos set comanda_id = d.id where comanda_id = o.id;
  insert into public.comanda_pessoas (comanda_id, usuario_id, entrou_em)
  select d.id, usuario_id, entrou_em from public.comanda_pessoas where comanda_id = o.id
  on conflict (comanda_id, usuario_id) do nothing;
  delete from public.comanda_pessoas where comanda_id = o.id;
  update public.comanda_descontos set comanda_id = d.id where comanda_id = o.id;
  update public.pagamentos set comanda_id = d.id where comanda_id = o.id;
  update public.codigos_entrega set comanda_id = d.id where comanda_id = o.id;

  select coalesce('Mesa ' || numero, o.nome, 'Balcão') into v_de from public.mesas where id = o.mesa_id;
  v_de := coalesce(v_de, o.nome, 'Balcão');
  select 'Mesa ' || numero into v_para from public.mesas where id = d.mesa_id;
  v_para := coalesce(v_para, d.nome, 'Balcão');
  update public.comandas set situacao = 'juntada', juntada_em = d.id, fechada_em = now(), fechada_por = auth.uid(), total = 0, mesa_id = null where id = o.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (d.estabelecimento_id, d.id, 'juntar_mesas', auth.uid(), v_de || ' juntou com ' || v_para),
         (o.estabelecimento_id, o.id, 'juntar_mesas', auth.uid(), v_de || ' foi juntada à ' || v_para);
end $$;

-- Quem estava na comanda juntada é levado para a nova (o App consulta isto ao abrir uma comanda antiga).
create or replace function public.comanda_atual(p_comanda uuid)
returns uuid language sql stable security definer set search_path = public as $$
  with recursive cadeia(id, juntada_em, n) as (
    select id, juntada_em, 0 from public.comandas where id = p_comanda
    union all
    select c.id, c.juntada_em, cadeia.n + 1 from public.comandas c join cadeia on c.id = cadeia.juntada_em where cadeia.n < 10
  )
  select id from cadeia where juntada_em is null order by n desc limit 1;
$$;

-- Tempo real dos pagamentos (a comanda de todos atualiza quando alguém paga).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'pagamentos') then
    alter publication supabase_realtime add table public.pagamentos;
  end if;
end $$;

revoke execute on function public.fechar_se_quitada(uuid), public.copiar_taxa_servico(), public.fechar_ao_entregar(), public.totais_calculo(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.totais_comanda(uuid), public.registrar_pagamento_caixa(uuid, numeric, text, text), public.cancelar_pagamento(uuid, text),
  public.pagamentos_comanda(uuid), public.fechar_comanda(uuid, boolean, boolean), public.juntar_comandas(uuid, uuid), public.comanda_atual(uuid),
  public.definir_taxa_servico(uuid, numeric), public.tirar_servico(uuid, boolean) from public, anon;
grant execute on function public.totais_comanda(uuid), public.registrar_pagamento_caixa(uuid, numeric, text, text), public.cancelar_pagamento(uuid, text),
  public.pagamentos_comanda(uuid), public.fechar_comanda(uuid, boolean, boolean), public.juntar_comandas(uuid, uuid), public.comanda_atual(uuid),
  public.definir_taxa_servico(uuid, numeric), public.tirar_servico(uuid, boolean) to authenticated;

select 'RoVibes 017 aplicado com sucesso' as resultado;
