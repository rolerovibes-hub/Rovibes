-- RoVibes 010: controle e exceções da operação (RoVibes Job, etapa 3).
-- Supervisão (T7004), ocorrências, cancelamento com aprovação, estorno, reabrir comanda,
-- garçom responsável e transferências, entrega "pega" pelo cumim, histórico e tempos.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Quem supervisiona: proprietário, gestor, administração ou quem tem Supervisão (T7004)
-- ============================================================
create or replace function public.pode_supervisionar(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'T7004') or coalesce(public.papel_em(p_estab) = 'gestor', false);
$$;

create or replace function public.equipe_do_salao(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'T7001') or public.pode_usar(p_estab, 'T7002') or public.pode_usar(p_estab, 'T7003')
      or public.pode_supervisionar(p_estab);
$$;

-- ============================================================
-- Novas colunas
-- ============================================================
alter table public.comandas add column if not exists responsavel_id uuid references auth.users(id);
alter table public.comandas add column if not exists reaberta_em timestamptz;
alter table public.pedido_itens add column if not exists bloqueado boolean not null default false;
alter table public.pedido_itens add column if not exists entregador_id uuid references auth.users(id);
alter table public.pedido_itens add column if not exists estornado boolean not null default false;
alter table public.pedido_itens add column if not exists refeito int not null default 0;

-- Histórico também por comanda (eventos de mesa, transferência, reabertura).
alter table public.pedido_eventos alter column pedido_id drop not null;
alter table public.pedido_eventos add column if not exists comanda_id uuid references public.comandas(id) on delete cascade;
update public.pedido_eventos e set comanda_id = p.comanda_id from public.pedidos p where p.id = e.pedido_id and e.comanda_id is null;
create index if not exists pedido_eventos_comanda_idx on public.pedido_eventos (comanda_id, criado_em);

create or replace function public.completar_evento()
returns trigger language plpgsql as $$
begin
  if new.comanda_id is null and new.pedido_id is not null then
    select comanda_id into new.comanda_id from public.pedidos where id = new.pedido_id;
  end if;
  return new;
end $$;
drop trigger if exists pedido_eventos_completar on public.pedido_eventos;
create trigger pedido_eventos_completar before insert on public.pedido_eventos
  for each row execute function public.completar_evento();

-- Garçom que lança o primeiro pedido numa mesa sem responsável assume a mesa.
create or replace function public.assumir_ao_lancar()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.lancado_por is not null then
    update public.comandas set responsavel_id = new.lancado_por where id = new.comanda_id and responsavel_id is null;
  end if;
  return new;
end $$;
drop trigger if exists pedidos_assumir on public.pedidos;
create trigger pedidos_assumir after insert on public.pedidos for each row execute function public.assumir_ao_lancar();

-- Quem abre a comanda pelo Job/Business já é o responsável.
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
    if v_id is not null then
      update public.comandas set responsavel_id = auth.uid() where id = v_id and responsavel_id is null;
      return v_id;
    end if;
  elsif coalesce(btrim(p_nome), '') = '' then
    raise exception 'Dê um nome para a comanda avulsa (ex.: nome do cliente).';
  end if;
  insert into public.comandas (estabelecimento_id, mesa_id, nome, aberta_por, responsavel_id)
  values (p_estab, p_mesa, nullif(btrim(p_nome), ''), auth.uid(), auth.uid()) returning id into v_id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id) values (p_estab, v_id, 'comanda_aberta', auth.uid());
  return v_id;
end $$;

-- ============================================================
-- Ações sobre itens, agora com as regras de autorização
-- ============================================================
create or replace function public.mudar_itens(p_itens uuid[], p_acao text, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  i record; v_feitos int := 0; v_de text[]; v_para text; v_estab uuid; v_retirada boolean := false; v_bloqueado boolean := false;
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
    select pi.id, pi.pedido_id, pi.situacao, pi.destino, pi.bloqueado, pi.entregador_id, pi.estabelecimento_id,
           p.modalidade, p.usuario_id as cliente, p.envio_id, c.situacao as comanda
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
    if i.bloqueado then v_bloqueado := true; continue; end if;
    -- Depois que o preparo começou, cancelar exige supervisão (a equipe abre uma ocorrência).
    if p_acao = 'cancelar' and not (i.situacao = 'recebido' or (i.situacao = 'pronto' and i.destino = 'sem_preparo'))
       and not public.pode_supervisionar(v_estab) then
      raise exception 'O item já está em preparo ou pronto: peça o cancelamento à supervisão.';
    end if;
    -- Item "pego" por outro cumim: só ele ou a supervisão.
    if p_acao in ('saiu', 'entregar') and i.entregador_id is not null and i.entregador_id <> auth.uid() and not public.pode_supervisionar(v_estab) then
      raise exception 'Este item está com outra pessoa da entrega.';
    end if;
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
        entregador_id = case when v_para = 'saiu' then auth.uid() when p_acao = 'voltar' then null else entregador_id end,
        entregue_por = case when v_para = 'entregue' then auth.uid() else entregue_por end,
        entregue_em = case when v_para = 'entregue' then now() else entregue_em end,
        entrega_por_qr = case when v_para = 'entregue' then false else entrega_por_qr end,
        motivo_cancelamento = case when v_para = 'cancelado' then btrim(p_motivo) else motivo_cancelamento end
     where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (v_estab, i.pedido_id, i.id, p_acao, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''));
    v_feitos := v_feitos + 1;

    if v_para = 'cancelado' and not exists (select 1 from public.pedido_itens where pedido_id = i.pedido_id and situacao <> 'cancelado') then
      update public.cupons set situacao = 'disponivel', usado_em = null
       where id in (select cupom_id from public.comanda_descontos where envio_id = i.envio_id);
      delete from public.comanda_descontos where envio_id = i.envio_id;
    end if;
  end loop;
  if v_feitos = 0 and v_bloqueado then raise exception 'Item aguardando decisão da supervisão.'; end if;
  if v_feitos = 0 and v_retirada then raise exception 'Pedido para retirada no balcão: entregue quando o cliente chegar.'; end if;
  if v_feitos = 0 then raise exception 'Nada foi alterado: os itens já mudaram de etapa (talvez outra pessoa atualizou).'; end if;
  return v_feitos;
end $$;

-- QR do cliente também respeita item bloqueado e "pego" por outro.
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
     where pi.id = any(p_itens) and p.comanda_id = c.id and pi.situacao in ('pronto', 'saiu') and not pi.bloqueado
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
-- Entregas: pegar e passar para outra pessoa
-- ============================================================
create or replace function public.pegar_itens(p_itens uuid[], p_para uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_para uuid := coalesce(p_para, auth.uid()); v_feitos int := 0; i record;
begin
  for i in select id, estabelecimento_id, pedido_id, entregador_id, situacao, bloqueado from public.pedido_itens
            where id = any(p_itens) for update loop
    v_estab := i.estabelecimento_id;
    if not (public.pode_usar(v_estab, 'T7003') or public.pode_usar(v_estab, 'T7001')) then raise exception 'Sem acesso às entregas.'; end if;
    if p_para is not null and p_para <> auth.uid() and not public.pode_supervisionar(v_estab) then
      raise exception 'Só a supervisão passa entregas para outra pessoa.';
    end if;
    if p_para is not null and not exists (select 1 from public.membros where estabelecimento_id = v_estab and usuario_id = p_para and ativo) then
      raise exception 'Pessoa não encontrada na equipe.';
    end if;
    if i.situacao not in ('pronto', 'saiu') or i.bloqueado then continue; end if;
    if i.entregador_id is not null and i.entregador_id <> auth.uid() and p_para is null and not public.pode_supervisionar(v_estab) then
      raise exception 'Este item já está com outra pessoa da entrega.';
    end if;
    update public.pedido_itens set entregador_id = v_para, atualizado_em = now() where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (v_estab, i.pedido_id, i.id, case when v_para = auth.uid() then 'pegar' else 'reatribuir' end, auth.uid(),
            case when v_para <> auth.uid() then 'Para ' || coalesce((select nome from public.perfis where id = v_para), 'outra pessoa') end);
    v_feitos := v_feitos + 1;
  end loop;
  if v_feitos = 0 then raise exception 'Nenhum item disponível para pegar.'; end if;
  return v_feitos;
end $$;

-- ============================================================
-- Ocorrências (problemas na operação que a supervisão resolve)
-- ============================================================
create table if not exists public.ocorrencias (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  pedido_id uuid references public.pedidos(id) on delete cascade,
  item_id uuid references public.pedido_itens(id) on delete cascade,
  tipo text not null check (tipo in ('cancelamento', 'nao_localizado', 'cliente_nao_encontrado', 'item_errado', 'qr_falhou', 'outro')),
  descricao text check (descricao is null or length(descricao) <= 300),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'resolvida', 'recusada')),
  resolucao text check (resolucao in ('cancelado', 'refeito', 'entregue', 'resolvido', 'recusado')),
  nota text,
  aberta_por uuid references auth.users(id),
  aberta_em timestamptz not null default now(),
  resolvida_por uuid references auth.users(id),
  resolvida_em timestamptz
);
create index if not exists ocorrencias_estab_idx on public.ocorrencias (estabelecimento_id, situacao, aberta_em desc);
alter table public.ocorrencias enable row level security;
drop policy if exists ocorrencias_ler on public.ocorrencias;
create policy ocorrencias_ler on public.ocorrencias for select to authenticated using (public.equipe_do_salao(estabelecimento_id));

create or replace function public.abrir_ocorrencia(p_itens uuid[], p_tipo text, p_descricao text)
returns int language plpgsql security definer set search_path = public as $$
declare i record; v_feitos int := 0;
begin
  if p_tipo not in ('cancelamento', 'nao_localizado', 'cliente_nao_encontrado', 'item_errado', 'qr_falhou', 'outro') then
    raise exception 'Tipo de ocorrência inválido.';
  end if;
  if p_tipo in ('cancelamento', 'item_errado', 'outro') and coalesce(btrim(p_descricao), '') = '' then
    raise exception 'Descreva o que aconteceu.';
  end if;
  for i in select pi.id, pi.pedido_id, pi.estabelecimento_id, pi.situacao, pi.bloqueado
             from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id join public.comandas c on c.id = p.comanda_id
            where pi.id = any(p_itens) and c.situacao = 'aberta' for update of pi loop
    if not public.equipe_do_salao(i.estabelecimento_id) then raise exception 'Sem acesso a este pedido.'; end if;
    if i.situacao in ('entregue', 'cancelado') or i.bloqueado then continue; end if;
    insert into public.ocorrencias (estabelecimento_id, pedido_id, item_id, tipo, descricao, aberta_por)
    values (i.estabelecimento_id, i.pedido_id, i.id, p_tipo, nullif(btrim(p_descricao), ''), auth.uid());
    update public.pedido_itens set bloqueado = true, atualizado_em = now() where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (i.estabelecimento_id, i.pedido_id, i.id, 'ocorrencia', auth.uid(), p_tipo || coalesce(': ' || nullif(btrim(p_descricao), ''), ''));
    v_feitos := v_feitos + 1;
  end loop;
  if v_feitos = 0 then raise exception 'Nenhum item pendente para registrar a ocorrência (já entregue ou aguardando supervisão?).'; end if;
  return v_feitos;
end $$;

-- Supervisão decide: cancelar, refazer (volta ao preparo sem cobrar de novo), entregar sem QR, resolver ou recusar.
create or replace function public.resolver_ocorrencia(p_ocorrencia uuid, p_acao text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.ocorrencias; it public.pedido_itens;
begin
  select * into o from public.ocorrencias where id = p_ocorrencia for update;
  if not found then raise exception 'Ocorrência não encontrada.'; end if;
  if not public.pode_supervisionar(o.estabelecimento_id) then raise exception 'Só a supervisão resolve ocorrências.'; end if;
  if o.situacao <> 'aberta' then raise exception 'Esta ocorrência já foi resolvida.'; end if;
  if p_acao not in ('cancelar', 'refazer', 'entregar', 'resolver', 'recusar') then raise exception 'Ação inválida.'; end if;
  select * into it from public.pedido_itens where id = o.item_id for update;

  if p_acao = 'cancelar' then
    update public.pedido_itens set situacao = 'cancelado', bloqueado = false, atualizado_em = now(),
           motivo_cancelamento = coalesce(nullif(btrim(p_nota), ''), o.descricao, 'Cancelado pela supervisão')
     where id = it.id and situacao not in ('entregue', 'cancelado');
  elsif p_acao = 'refazer' then
    update public.pedido_itens set bloqueado = false, refeito = refeito + 1, atualizado_em = now(),
           situacao = case when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
           preparo_por = null, preparo_em = null, pronto_por = null,
           pronto_em = case when destino = 'sem_preparo' then now() end,
           saiu_por = null, saiu_em = null, entregador_id = null
     where id = it.id and situacao not in ('entregue', 'cancelado');
  elsif p_acao = 'entregar' then
    if coalesce(btrim(p_nota), '') = '' then raise exception 'Informe por que a entrega está sendo confirmada sem QR.'; end if;
    update public.pedido_itens set situacao = 'entregue', bloqueado = false, entregue_por = auth.uid(), entregue_em = now(),
           entrega_por_qr = false, atualizado_em = now()
     where id = it.id and situacao not in ('entregue', 'cancelado');
  else
    update public.pedido_itens set bloqueado = false, atualizado_em = now() where id = it.id;
  end if;

  update public.ocorrencias
     set situacao = case when p_acao = 'recusar' then 'recusada' else 'resolvida' end,
         resolucao = case p_acao when 'cancelar' then 'cancelado' when 'refazer' then 'refeito' when 'entregar' then 'entregue'
                                 when 'recusar' then 'recusado' else 'resolvido' end,
         nota = nullif(btrim(coalesce(p_nota, '')), ''), resolvida_por = auth.uid(), resolvida_em = now()
   where id = o.id;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
  values (o.estabelecimento_id, o.pedido_id, o.item_id, 'supervisao_' || p_acao, auth.uid(), nullif(btrim(coalesce(p_nota, '')), ''));

  -- Pedido inteiro cancelado: cupom volta.
  if p_acao = 'cancelar' and not exists (select 1 from public.pedido_itens where pedido_id = o.pedido_id and situacao <> 'cancelado') then
    update public.cupons set situacao = 'disponivel', usado_em = null
     where id in (select cupom_id from public.comanda_descontos d join public.pedidos p on p.envio_id = d.envio_id where p.id = o.pedido_id);
    delete from public.comanda_descontos where envio_id = (select envio_id from public.pedidos where id = o.pedido_id);
  end if;
end $$;

-- ============================================================
-- Estorno de item entregue e reabertura de comanda (supervisão)
-- ============================================================
create or replace function public.estornar_item(p_item uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select pi.*, c.situacao as comanda from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
    join public.comandas c on c.id = p.comanda_id where pi.id = p_item into it;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.pode_supervisionar(it.estabelecimento_id) then raise exception 'Só a supervisão faz estornos.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if it.comanda <> 'aberta' then raise exception 'Reabra a comanda para estornar.'; end if;
  if it.situacao <> 'entregue' then raise exception 'Só itens entregues são estornados. Para os outros, use cancelar.'; end if;
  update public.pedido_itens set situacao = 'cancelado', estornado = true, motivo_cancelamento = 'Estorno: ' || btrim(p_motivo), atualizado_em = now()
   where id = p_item;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
  values (it.estabelecimento_id, it.pedido_id, it.id, 'estorno', auth.uid(), btrim(p_motivo));
end $$;

create or replace function public.reabrir_comanda(p_comanda uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if not public.pode_supervisionar(c.estabelecimento_id) then raise exception 'Só a supervisão reabre comandas.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da reabertura.'; end if;
  if c.situacao <> 'fechada' then raise exception 'Só comandas fechadas podem ser reabertas.'; end if;
  if (c.fechada_em at time zone 'America/Sao_Paulo')::date <> (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Só dá para reabrir comandas fechadas hoje.';
  end if;
  if c.mesa_id is not null and exists (select 1 from public.comandas where mesa_id = c.mesa_id and situacao = 'aberta') then
    raise exception 'A mesa já tem outra comanda aberta.';
  end if;
  update public.comandas set situacao = 'aberta', fechada_em = null, fechada_por = null, total = null, reaberta_em = now() where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'comanda_reaberta', auth.uid(), btrim(p_motivo));
end $$;

-- Fechamento registra no histórico.
create or replace function public.registrar_fechamento()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao in ('fechada', 'cancelada') and old.situacao = 'aberta' then
    insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
    values (new.estabelecimento_id, new.id, case when new.situacao = 'fechada' then 'comanda_fechada' else 'comanda_cancelada' end,
            auth.uid(), case when new.situacao = 'fechada' then 'Total ' || replace(to_char(coalesce(new.total, 0), 'FM999990.00'), '.', ',') end);
  end if;
  return new;
end $$;
drop trigger if exists comandas_fechamento on public.comandas;
create trigger comandas_fechamento after update of situacao on public.comandas for each row execute function public.registrar_fechamento();

-- ============================================================
-- Garçom responsável, transferência e troca de mesa
-- ============================================================
create or replace function public.garcons(p_estab uuid)
returns table (usuario_id uuid, nome text, cargo text)
language sql stable security definer set search_path = public as $$
  select m.usuario_id, coalesce(p.nome, ''), m.cargo
    from public.membros m left join public.perfis p on p.id = m.usuario_id
   where m.estabelecimento_id = p_estab and m.ativo
     and (m.papel in ('proprietario', 'gestor') or exists (select 1 from public.acessos a where a.estabelecimento_id = p_estab and a.usuario_id = m.usuario_id and a.codigo = 'T7001'))
     and public.equipe_do_salao(p_estab)
   order by p.nome;
$$;

create or replace function public.equipe_nomes(p_estab uuid)
returns table (usuario_id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select m.usuario_id, coalesce(p.nome, '') from public.membros m left join public.perfis p on p.id = m.usuario_id
   where m.estabelecimento_id = p_estab and public.equipe_do_salao(p_estab);
$$;

create or replace function public.assumir_comanda(p_comanda uuid, p_para uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_para uuid := coalesce(p_para, auth.uid());
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às mesas.'; end if;
  if c.responsavel_id is not null and c.responsavel_id <> auth.uid() and not public.pode_supervisionar(c.estabelecimento_id) then
    raise exception 'Esta mesa é de outro garçom. Peça a transferência para ele ou para a supervisão.';
  end if;
  if not exists (select 1 from public.garcons(c.estabelecimento_id) g where g.usuario_id = v_para) then
    raise exception 'Esta pessoa não atende mesas.';
  end if;
  update public.comandas set responsavel_id = v_para where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, case when v_para = auth.uid() then 'assumir' else 'transferir' end, auth.uid(),
          case when v_para <> auth.uid() then 'Para ' || coalesce((select nome from public.perfis where id = v_para), 'outro garçom') end);
end $$;

create or replace function public.trocar_mesa(p_comanda uuid, p_mesa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas; m public.mesas; v_de text;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às mesas.'; end if;
  select * into m from public.mesas where id = p_mesa and estabelecimento_id = c.estabelecimento_id and ativa;
  if not found then raise exception 'Mesa não encontrada.'; end if;
  perform pg_advisory_xact_lock(hashtext(m.id::text));
  if exists (select 1 from public.comandas where mesa_id = m.id and situacao = 'aberta') then
    raise exception 'A mesa % já está ocupada.', m.numero;
  end if;
  select numero into v_de from public.mesas where id = c.mesa_id;
  update public.comandas set mesa_id = m.id where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'trocar_mesa', auth.uid(), coalesce('Mesa ' || v_de, c.nome, 'Balcão') || ' → Mesa ' || m.numero);
end $$;

-- ============================================================
-- Histórico legível (linha do tempo)
-- ============================================================
create or replace function public.historico(p_comanda uuid)
returns table (criado_em timestamptz, acao text, detalhe text, pessoa text, numero int, item text)
language plpgsql stable security definer set search_path = public as $$
declare v_estab uuid;
begin
  select estabelecimento_id into v_estab from public.comandas where id = p_comanda;
  if v_estab is null or not public.equipe_do_salao(v_estab) then raise exception 'Sem acesso ao histórico.'; end if;
  return query
  select e.criado_em, e.acao, e.detalhe, coalesce(pf.nome, ''), p.numero, i.nome
    from public.pedido_eventos e
    left join public.perfis pf on pf.id = e.usuario_id
    left join public.pedidos p on p.id = e.pedido_id
    left join public.pedido_itens i on i.id = e.item_id
   where e.comanda_id = p_comanda
   order by e.criado_em, e.id;
end $$;

-- ============================================================
-- Indicadores de operação (registros reais de tempo)
-- ============================================================
create or replace function public.indicadores_operacao(p_estab uuid)
returns table (indicador text, unidade text, hoje numeric, sete_dias numeric, trinta_dias numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  h timestamptz := ((now() at time zone 'America/Sao_Paulo')::date)::timestamp at time zone 'America/Sao_Paulo';
  d7 timestamptz := now() - interval '7 days';
  d30 timestamptz := now() - interval '30 days';
begin
  if not public.pode_usar(p_estab, 'C8001') then raise exception 'Sem acesso aos indicadores deste estabelecimento.'; end if;
  return query
  with base as (
    select i.*, p.criado_em as pedido_em, p.usuario_id as cliente
      from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
     where i.estabelecimento_id = p_estab and p.criado_em >= d30
  ), periodos(nome, desde) as (values ('h', h), ('d7', d7), ('d30', d30)),
  calc as (
    select pr.nome,
           (select count(distinct b.pedido_id) from base b where b.pedido_em >= pr.desde)::numeric as pedidos,
           (select count(distinct b.pedido_id) from base b where b.pedido_em >= pr.desde and b.cliente is not null)::numeric as pedidos_app,
           (select coalesce(sum(b.quantidade), 0) from base b where b.pedido_em >= pr.desde and b.situacao <> 'cancelado')::numeric as itens,
           (select coalesce(sum(b.preco * b.quantidade), 0) from base b where b.pedido_em >= pr.desde and b.situacao <> 'cancelado')::numeric as vendas,
           (select round(avg(extract(epoch from b.pronto_em - b.pedido_em)) / 60, 1) from base b where b.pedido_em >= pr.desde and b.destino = 'cozinha' and b.pronto_em is not null) as t_cozinha,
           (select round(avg(extract(epoch from b.pronto_em - b.pedido_em)) / 60, 1) from base b where b.pedido_em >= pr.desde and b.destino = 'bar' and b.pronto_em is not null) as t_bar,
           (select round(avg(extract(epoch from b.entregue_em - b.pronto_em)) / 60, 1) from base b where b.pedido_em >= pr.desde and b.entregue_em is not null and b.pronto_em is not null) as t_entrega,
           (select round(avg(extract(epoch from b.entregue_em - b.pedido_em)) / 60, 1) from base b where b.pedido_em >= pr.desde and b.entregue_em is not null) as t_total,
           (select count(*) from base b where b.pedido_em >= pr.desde and b.situacao = 'cancelado' and not b.estornado)::numeric as cancelados,
           (select count(*) from base b where b.pedido_em >= pr.desde and b.estornado)::numeric as estornos,
           (select count(*) from public.ocorrencias o where o.estabelecimento_id = p_estab and o.aberta_em >= pr.desde)::numeric as ocorrencias,
           (select round(100.0 * count(*) filter (where b.entrega_por_qr) / nullif(count(*) filter (where b.cliente is not null), 0), 0)
              from base b where b.pedido_em >= pr.desde and b.situacao = 'entregue') as pct_qr
      from periodos pr
  )
  select x.indicador, x.unidade,
         max(x.valor) filter (where x.nome = 'h'), max(x.valor) filter (where x.nome = 'd7'), max(x.valor) filter (where x.nome = 'd30')
    from (
      select c.nome, v.ordem, v.indicador, v.unidade, v.valor from calc c,
      lateral (values
        (1, 'Pedidos', '', c.pedidos),
        (2, 'Pedidos pelo App', '', c.pedidos_app),
        (3, 'Itens vendidos', '', c.itens),
        (4, 'Vendas', 'R$', c.vendas),
        (5, 'Tempo até ficar pronto · Cozinha', 'min', c.t_cozinha),
        (6, 'Tempo até ficar pronto · Bar', 'min', c.t_bar),
        (7, 'Tempo do pronto até a entrega', 'min', c.t_entrega),
        (8, 'Tempo total do pedido à entrega', 'min', c.t_total),
        (9, 'Itens cancelados', '', c.cancelados),
        (10, 'Estornos', '', c.estornos),
        (11, 'Ocorrências', '', c.ocorrencias),
        (12, 'Entregas do App confirmadas por QR', '%', c.pct_qr)
      ) v(ordem, indicador, unidade, valor)
    ) x
   group by x.ordem, x.indicador, x.unidade
   order by x.ordem;
end $$;

create or replace function public.pedidos_por_hora(p_estab uuid, p_dias int default 7)
returns table (hora int, pedidos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'C8001') then raise exception 'Sem acesso aos indicadores deste estabelecimento.'; end if;
  return query
  select g.h, coalesce(count(p.id), 0)::int
    from generate_series(0, 23) g(h)
    left join public.pedidos p on p.estabelecimento_id = p_estab and p.criado_em >= now() - make_interval(days => greatest(1, least(p_dias, 90)))
                              and extract(hour from p.criado_em at time zone 'America/Sao_Paulo')::int = g.h
   group by g.h order by g.h;
end $$;

-- Tempo real das ocorrências e comandas (supervisão).
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'ocorrencias') then
    alter publication supabase_realtime add table public.ocorrencias;
  end if;
end $$;

grant execute on function public.pode_supervisionar(uuid), public.mudar_itens(uuid[], text, text), public.confirmar_entrega(uuid, text, uuid[]),
  public.pegar_itens(uuid[], uuid), public.abrir_ocorrencia(uuid[], text, text), public.resolver_ocorrencia(uuid, text, text),
  public.estornar_item(uuid, text), public.reabrir_comanda(uuid, text), public.garcons(uuid), public.equipe_nomes(uuid),
  public.assumir_comanda(uuid, uuid), public.trocar_mesa(uuid, uuid), public.historico(uuid),
  public.indicadores_operacao(uuid), public.pedidos_por_hora(uuid, int), public.abrir_comanda(uuid, uuid, text) to authenticated;

select 'RoVibes 010 aplicado com sucesso' as resultado;
