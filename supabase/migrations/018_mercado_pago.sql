-- RoVibes 018 (Fase 7b): pagamento da comanda pelo App via Mercado Pago (Checkout Pro).
-- O valor é calculado no banco (nunca pelo celular); o pagamento só vira "aprovado" quando
-- o próprio Mercado Pago confirma (consulta feita pelo servidor). Pode ser executado mais de uma vez.

-- Contas do Mercado Pago conectadas pelos estabelecimentos (tokens só o servidor lê).
create table if not exists public.mp_contas (
  estabelecimento_id uuid primary key references public.estabelecimentos(id) on delete cascade,
  mp_usuario text,
  access_token text not null,
  refresh_token text,
  expira_em timestamptz,
  modo text not null default 'teste' check (modo in ('teste', 'producao')),
  conectado_em timestamptz not null default now()
);
alter table public.mp_contas enable row level security;  -- sem políticas: ninguém do App lê
revoke all on public.mp_contas from anon, authenticated;

create or replace function public.mp_conectado(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_contas where estabelecimento_id = p_estab);
$$;

-- Passo 1 (chamado pelo servidor com o login da pessoa): calcula e reserva o valor a pagar.
create or replace function public.preparar_pagamento_app(p_comanda uuid, p_modo text, p_valor numeric default null)
returns table (pagamento_id uuid, valor numeric, estabelecimento_id uuid, descricao text, comissao_pct numeric)
language plpgsql security definer set search_path = public as $$
declare c public.comandas; t record; v numeric; v_id uuid; v_nome text; v_mesa text; v_pct numeric;
begin
  perform public.exigir_conta_ativa();
  select * into c from public.comandas where id = p_comanda;
  if not found or c.situacao <> 'aberta' then raise exception 'Esta comanda não está aberta.'; end if;
  if not public.na_comanda(c.id) then raise exception 'Você não está nesta comanda.'; end if;
  select * into t from public.totais_calculo(c.id, auth.uid());
  if t.falta <= 0 then raise exception 'A conta já está paga.'; end if;
  v := case p_modo
         when 'meus_itens' then t.minha_parte_itens
         when 'igual' then t.minha_parte_igual
         when 'total' then t.falta
         when 'valor' then round(coalesce(p_valor, 0), 2)
       end;
  if v is null then raise exception 'Forma de divisão inválida.'; end if;
  if v < 1 then raise exception 'O valor mínimo pelo App é R$ 1,00.'; end if;
  if v > t.falta then raise exception 'O valor é maior do que falta pagar.'; end if;
  -- Evita pagamentos repetidos: cancela tentativas antigas desta pessoa que não foram concluídas.
  update public.pagamentos set situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = 'Nova tentativa'
   where comanda_id = c.id and usuario_id = auth.uid() and situacao = 'pendente' and origem = 'app';
  select e.nome, e.comissao_rovibes into v_nome, v_pct from public.estabelecimentos e where e.id = c.estabelecimento_id;
  select numero into v_mesa from public.mesas where id = c.mesa_id;
  insert into public.pagamentos (estabelecimento_id, comanda_id, usuario_id, origem, modo, valor, situacao)
  values (c.estabelecimento_id, c.id, auth.uid(), 'app', p_modo, v, 'pendente') returning id into v_id;
  return query select v_id, v, c.estabelecimento_id,
    left(v_nome || coalesce(' · Mesa ' || v_mesa, '') || ' · RoVibes', 120), coalesce(v_pct, 3);
end $$;

-- Passo 2 (só o servidor, depois de consultar o Mercado Pago): confirma, recusa ou estorna.
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
revoke execute on function public.preparar_pagamento_app(uuid, text, numeric), public.mp_conectado(uuid) from public, anon;
grant execute on function public.preparar_pagamento_app(uuid, text, numeric), public.mp_conectado(uuid) to authenticated;
grant execute on function public.confirmar_pagamento_mp(uuid, text, text, numeric, numeric, text) to service_role;

select 'RoVibes 018 aplicado com sucesso' as resultado;
