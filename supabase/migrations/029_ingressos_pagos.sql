-- RoVibes 029: Ingressos pagos.
-- Tipos (Pista, VIP...) com lotes (preço, quantidade, data limite), meia-entrada, compra pelo App (Mercado Pago),
-- regras de cancelamento (modelos com ajuste + 7 dias de arrependimento), envio para amigos e transferência
-- até X horas antes, ingresso nominal na portaria. A taxa do RoVibes é absorvida pelo estabelecimento.
-- Requer a 017/018 (pagamentos) e a 025 (promoters). Pode ser executado mais de uma vez.

-- ============================================================
-- Configuração do evento
-- ============================================================
alter table public.eventos add column if not exists cancelamento jsonb not null default '{"modelo":"moderada","prazo_horas":48,"percentual":50}'::jsonb;
alter table public.eventos add column if not exists transferencia_horas int check (transferencia_horas is null or transferencia_horas between 0 and 720);
alter table public.eventos add column if not exists limite_por_compra int not null default 10 check (limite_por_compra between 1 and 50);

create table if not exists public.ingresso_tipos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 60),
  descricao text check (descricao is null or length(descricao) <= 300),
  meia_entrada boolean not null default true,
  ordem int not null default 0,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);
create index if not exists ingresso_tipos_evento_idx on public.ingresso_tipos (evento_id, ordem);

create table if not exists public.ingresso_lotes (
  id uuid primary key default gen_random_uuid(),
  tipo_id uuid not null references public.ingresso_tipos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 40),
  preco numeric(10,2) not null check (preco >= 0),
  quantidade int not null check (quantidade between 1 and 100000),
  vende_ate timestamptz,
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists ingresso_lotes_tipo_idx on public.ingresso_lotes (tipo_id, ordem);

create table if not exists public.compras_ingresso (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'reservada' check (situacao in ('reservada', 'paga', 'expirada', 'cancelada')),
  total numeric(10,2) not null default 0,
  comissao numeric(10,2) not null default 0,
  promoter_id uuid references public.promoters(id) on delete set null,
  mp_preferencia text,
  mp_pagamento text,
  meio text,
  expira_em timestamptz not null default now() + interval '10 minutes',
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists compras_ingresso_evento_idx on public.compras_ingresso (evento_id, situacao);

-- Ingressos: agora podem ser vários por pessoa (comprou para os amigos) e ter tipo, lote e preço.
alter table public.ingressos drop constraint if exists ingressos_evento_id_usuario_id_key;
alter table public.ingressos add column if not exists tipo_id uuid references public.ingresso_tipos(id) on delete set null;
alter table public.ingressos add column if not exists lote_id uuid references public.ingresso_lotes(id) on delete set null;
alter table public.ingressos add column if not exists compra_id uuid references public.compras_ingresso(id) on delete cascade;
alter table public.ingressos add column if not exists preco numeric(10,2) not null default 0;
alter table public.ingressos add column if not exists meia boolean not null default false;
alter table public.ingressos add column if not exists comprador_id uuid references auth.users(id) on delete set null;
alter table public.ingressos add column if not exists transferido_em timestamptz;
alter table public.ingressos drop constraint if exists ingressos_situacao_check;
alter table public.ingressos add constraint ingressos_situacao_check check (situacao in ('pendente', 'valido', 'usado', 'cancelado', 'reembolsado'));
-- Gratuitos continuam um por pessoa.
create unique index if not exists ingressos_gratis_um_por_pessoa on public.ingressos (evento_id, usuario_id) where compra_id is null;

create table if not exists public.ingresso_transferencias (
  id bigint generated always as identity primary key,
  ingresso_id uuid not null references public.ingressos(id) on delete cascade,
  de_usuario uuid references auth.users(id) on delete set null,
  para_usuario uuid references auth.users(id) on delete set null,
  em timestamptz not null default now()
);

create table if not exists public.reembolsos_ingresso (
  id uuid primary key default gen_random_uuid(),
  ingresso_id uuid not null references public.ingressos(id) on delete cascade,
  compra_id uuid not null references public.compras_ingresso(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  valor numeric(10,2) not null check (valor >= 0),
  motivo text not null,
  situacao text not null default 'solicitado' check (situacao in ('solicitado', 'feito', 'falhou')),
  mp_reembolso text,
  criado_em timestamptz not null default now(),
  feito_em timestamptz
);

alter table public.ingresso_tipos enable row level security;
alter table public.ingresso_lotes enable row level security;
alter table public.compras_ingresso enable row level security;
alter table public.ingresso_transferencias enable row level security;
alter table public.reembolsos_ingresso enable row level security;

create or replace function public.gere_ingressos(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'G5004') or public.pode_usar(p_estab, 'G5001');
$$;

drop policy if exists ingresso_tipos_ler on public.ingresso_tipos;
create policy ingresso_tipos_ler on public.ingresso_tipos for select to authenticated using (true);
drop policy if exists ingresso_lotes_ler on public.ingresso_lotes;
create policy ingresso_lotes_ler on public.ingresso_lotes for select to authenticated using (true);
drop policy if exists compras_ingresso_ler on public.compras_ingresso;
create policy compras_ingresso_ler on public.compras_ingresso for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G5004'));
drop policy if exists reembolsos_ingresso_ler on public.reembolsos_ingresso;
create policy reembolsos_ingresso_ler on public.reembolsos_ingresso for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G5004'));

-- Ingresso: dono atual, quem comprou e a equipe.
drop policy if exists ingressos_ler on public.ingressos;
create policy ingressos_ler on public.ingressos for select to authenticated
  using (usuario_id = auth.uid() or comprador_id = auth.uid()
      or public.pode_usar((select e.estabelecimento_id from public.eventos e where e.id = evento_id), 'G5004'));

-- ============================================================
-- Disponibilidade
-- ============================================================
-- Ocupados num lote: pagos/usados + reservas ainda no prazo.
create or replace function public.ocupados_lote(p_lote uuid, p_meia boolean default null)
returns int language sql stable security definer set search_path = public as $$
  select count(*)::int from public.ingressos i left join public.compras_ingresso c on c.id = i.compra_id
   where i.lote_id = p_lote and (p_meia is null or i.meia = p_meia)
     and (i.situacao in ('valido', 'usado') or (i.situacao = 'pendente' and c.situacao = 'reservada' and c.expira_em > now()));
$$;

-- Lote à venda agora de cada tipo: o primeiro (na ordem) que ainda tem lugar e não venceu.
create or replace function public.lote_atual(p_tipo uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select l.id from public.ingresso_lotes l
   where l.tipo_id = p_tipo and l.ativo and (l.vende_ate is null or l.vende_ate > now())
     and public.ocupados_lote(l.id) < l.quantidade
   order by l.ordem, l.preco limit 1;
$$;

-- Texto da política de cancelamento (para o App e para o Business).
create or replace function public.texto_cancelamento(p_evento uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
    when coalesce((e.cancelamento->>'percentual')::int, 0) <= 0 or e.cancelamento->>'modelo' = 'rigida' then
      'Reembolso integral em até 7 dias da compra (antes do evento). Depois disso, não há reembolso.'
    else 'Reembolso integral em até 7 dias da compra (antes do evento). Depois, ' || (e.cancelamento->>'percentual') ||
         '% do valor se cancelar até ' || (e.cancelamento->>'prazo_horas') || ' horas antes do início.' end
    || case when e.transferencia_horas is not null then ' Transferência para outra pessoa até ' || e.transferencia_horas || ' horas antes.'
            else ' Este ingresso não pode ser transferido (só enviado aos amigos logo após a compra).' end
    from public.eventos e where e.id = p_evento;
$$;

create or replace function public.ingressos_a_venda(p_evento uuid)
returns table (tipo_id uuid, tipo text, descricao text, meia_entrada boolean, lote_id uuid, lote text, preco numeric,
               disponiveis int, meias_disponiveis int, vende_ate timestamptz, esgotado boolean)
language sql stable security definer set search_path = public as $$
  select t.id, t.nome, t.descricao, t.meia_entrada and l.preco > 0, l.id, l.nome, l.preco,
         case when l.id is null then 0 else greatest(0, l.quantidade - public.ocupados_lote(l.id)) end,
         case when l.id is null or not t.meia_entrada or l.preco = 0 then 0
              else greatest(0, least(floor(l.quantidade * 0.4)::int - public.ocupados_lote(l.id, true), l.quantidade - public.ocupados_lote(l.id))) end,
         l.vende_ate, l.id is null
    from public.ingresso_tipos t
    left join public.ingresso_lotes l on l.id = public.lote_atual(t.id)
   where t.evento_id = p_evento and t.ativo
     and exists (select 1 from public.eventos e where e.id = p_evento and e.situacao = 'publicado' and public.estab_visivel(e.estabelecimento_id))
   order by t.ordem, t.nome;
$$;

-- ============================================================
-- Business: tipos, lotes e regras
-- ============================================================
create or replace function public.salvar_ingressos_evento(p_evento uuid, p_tipos jsonb, p_regras jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid; t jsonb; l jsonb; v_tipo uuid; v_lote uuid; v_ord int := 0; v_lord int; v_tipos uuid[] := '{}'; v_lotes uuid[] := '{}';
        v_modelo text := coalesce(p_regras->>'modelo', 'moderada');
begin
  select estabelecimento_id into v_estab from public.eventos where id = p_evento;
  if v_estab is null or not public.gere_ingressos(v_estab) then raise exception 'Sem acesso a este evento.'; end if;
  if v_modelo not in ('flexivel', 'moderada', 'rigida') then raise exception 'Modelo de cancelamento inválido.'; end if;
  update public.eventos set
    cancelamento = jsonb_build_object('modelo', v_modelo,
                     'prazo_horas', greatest(0, least(720, coalesce((p_regras->>'prazo_horas')::int, 48))),
                     'percentual', case when v_modelo = 'rigida' then 0 else greatest(0, least(100, coalesce((p_regras->>'percentual')::int, 50))) end),
    transferencia_horas = nullif(p_regras->>'transferencia_horas', '')::int,
    limite_por_compra = greatest(1, least(50, coalesce((p_regras->>'limite_por_compra')::int, 10)))
   where id = p_evento;

  for t in select * from jsonb_array_elements(coalesce(p_tipos, '[]'::jsonb)) loop
    v_ord := v_ord + 1;
    v_tipo := nullif(t->>'id', '')::uuid;
    if v_tipo is not null and not exists (select 1 from public.ingresso_tipos where id = v_tipo and evento_id = p_evento) then v_tipo := null; end if;
    if v_tipo is null then
      insert into public.ingresso_tipos (evento_id, nome) values (p_evento, btrim(t->>'nome')) returning id into v_tipo;
    end if;
    update public.ingresso_tipos set nome = btrim(t->>'nome'), descricao = nullif(btrim(coalesce(t->>'descricao', '')), ''),
           meia_entrada = coalesce((t->>'meia_entrada')::boolean, true), ordem = v_ord, ativo = true
     where id = v_tipo;
    v_tipos := v_tipos || v_tipo;
    v_lord := 0;
    for l in select * from jsonb_array_elements(coalesce(t->'lotes', '[]'::jsonb)) loop
      v_lord := v_lord + 1;
      v_lote := nullif(l->>'id', '')::uuid;
      if v_lote is not null and not exists (select 1 from public.ingresso_lotes where id = v_lote and tipo_id = v_tipo) then v_lote := null; end if;
      if (l->>'quantidade')::int < 1 then raise exception 'Informe a quantidade do lote %.', coalesce(l->>'nome', ''); end if;
      if v_lote is null then
        insert into public.ingresso_lotes (tipo_id, nome, preco, quantidade) values (v_tipo, btrim(l->>'nome'), (l->>'preco')::numeric, (l->>'quantidade')::int)
        returning id into v_lote;
      elsif (l->>'quantidade')::int < public.ocupados_lote(v_lote) then
        raise exception 'O lote "%" já tem % ingressos vendidos ou reservados.', l->>'nome', public.ocupados_lote(v_lote);
      end if;
      update public.ingresso_lotes set nome = btrim(l->>'nome'), preco = round((l->>'preco')::numeric, 2), quantidade = (l->>'quantidade')::int,
             vende_ate = nullif(l->>'vende_ate', '')::timestamptz, ordem = v_lord, ativo = true
       where id = v_lote;
      v_lotes := v_lotes || v_lote;
    end loop;
  end loop;
  -- O que saiu da lista: apaga se nunca vendeu; senão só desativa.
  update public.ingresso_lotes l set ativo = false
   where l.tipo_id in (select id from public.ingresso_tipos where evento_id = p_evento) and not (l.id = any(v_lotes))
     and exists (select 1 from public.ingressos i where i.lote_id = l.id);
  delete from public.ingresso_lotes l
   where l.tipo_id in (select id from public.ingresso_tipos where evento_id = p_evento) and not (l.id = any(v_lotes))
     and not exists (select 1 from public.ingressos i where i.lote_id = l.id);
  update public.ingresso_tipos t set ativo = false
   where t.evento_id = p_evento and not (t.id = any(v_tipos)) and exists (select 1 from public.ingressos i where i.tipo_id = t.id);
  delete from public.ingresso_tipos t
   where t.evento_id = p_evento and not (t.id = any(v_tipos)) and not exists (select 1 from public.ingressos i where i.tipo_id = t.id);
end $$;

-- ============================================================
-- Compra (reserva por 10 minutos; gratuito confirma na hora)
-- ============================================================
create or replace function public.reservar_ingressos(p_evento uuid, p_itens jsonb, p_ref text)
returns table (compra_id uuid, total numeric, gratis boolean)
language plpgsql security definer set search_path = public as $$
declare e public.eventos; it jsonb; l record; v_compra uuid; v_total numeric := 0; v_qtd int := 0; v_q int; v_meia boolean; v_promoter uuid;
        v_disp int; v_meias int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para comprar.'; end if;
  perform public.exigir_conta_ativa();
  select * into e from public.eventos where id = p_evento for update;
  if e.id is null or e.situacao <> 'publicado' or not public.estab_visivel(e.estabelecimento_id) then raise exception 'Evento não encontrado.'; end if;
  if public.fim_do_evento(e) <= now() then raise exception 'Este evento já terminou.'; end if;
  -- Reservas antigas da pessoa para este evento expiram (libera os lugares).
  update public.compras_ingresso ci set situacao = 'expirada' where ci.evento_id = p_evento and ci.usuario_id = auth.uid() and ci.situacao = 'reservada';
  update public.ingressos ig set situacao = 'cancelado'
   where ig.compra_id in (select ci.id from public.compras_ingresso ci where ci.evento_id = p_evento and ci.usuario_id = auth.uid() and ci.situacao = 'expirada')
     and ig.situacao = 'pendente';

  select id into v_promoter from public.promoters where codigo = upper(btrim(coalesce(p_ref, ''))) and situacao = 'ativo' and estabelecimento_id = e.estabelecimento_id;
  insert into public.compras_ingresso (evento_id, estabelecimento_id, usuario_id, promoter_id)
  values (p_evento, e.estabelecimento_id, auth.uid(), v_promoter) returning id into v_compra;

  for it in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    v_q := greatest(0, coalesce((it->>'quantidade')::int, 0));
    if v_q = 0 then continue; end if;
    v_meia := coalesce((it->>'meia')::boolean, false);
    select lt.*, t.meia_entrada, t.evento_id as ev into l from public.ingresso_lotes lt join public.ingresso_tipos t on t.id = lt.tipo_id
     where lt.id = (it->>'lote_id')::uuid for update of lt;
    if l.id is null or l.ev <> p_evento or l.id <> public.lote_atual(l.tipo_id) then raise exception 'Este lote não está mais à venda. Atualize a página.'; end if;
    v_disp := l.quantidade - public.ocupados_lote(l.id);
    if v_q > v_disp then raise exception 'Só restam % ingressos de "%".', v_disp, l.nome; end if;
    if v_meia then
      if not l.meia_entrada or l.preco = 0 then raise exception 'Este ingresso não tem meia-entrada.'; end if;
      v_meias := floor(l.quantidade * 0.4)::int - public.ocupados_lote(l.id, true);
      if v_q > v_meias then raise exception 'Só restam % meias-entradas neste lote.', greatest(v_meias, 0); end if;
    end if;
    for n in 1..v_q loop
      insert into public.ingressos (evento_id, usuario_id, comprador_id, codigo, situacao, tipo_id, lote_id, compra_id, preco, meia)
      values (p_evento, auth.uid(), auth.uid(), public.gerar_codigo(8), 'pendente', l.tipo_id, l.id, v_compra,
              case when v_meia then round(l.preco / 2, 2) else l.preco end, v_meia);
    end loop;
    v_total := v_total + v_q * case when v_meia then round(l.preco / 2, 2) else l.preco end;
    v_qtd := v_qtd + v_q;
  end loop;
  if v_qtd = 0 then raise exception 'Escolha pelo menos um ingresso.'; end if;
  if v_qtd > e.limite_por_compra then raise exception 'Máximo de % ingressos por compra.', e.limite_por_compra; end if;
  update public.compras_ingresso ci set total = v_total where ci.id = v_compra;
  if v_total = 0 then
    update public.compras_ingresso ci set situacao = 'paga', pago_em = now() where ci.id = v_compra;
    update public.ingressos ig set situacao = 'valido' where ig.compra_id = v_compra;
  end if;
  return query select v_compra, v_total, v_total = 0;
end $$;

-- Confirmação do pagamento (só o servidor, depois de consultar o Mercado Pago).
create or replace function public.confirmar_compra_ingresso(p_compra uuid, p_mp_id text, p_status text, p_valor numeric, p_comissao numeric, p_meio text)
returns text language plpgsql security definer set search_path = public as $$
declare c public.compras_ingresso;
begin
  select * into c from public.compras_ingresso where id = p_compra for update;
  if c.id is null then return 'desconhecida'; end if;
  if c.situacao = 'paga' then return 'paga'; end if;
  if p_status <> 'approved' then return c.situacao; end if;
  if abs(coalesce(p_valor, 0) - c.total) > 0.01 then raise exception 'Valor pago não confere.'; end if;
  update public.compras_ingresso set situacao = 'paga', pago_em = now(), mp_pagamento = p_mp_id, comissao = coalesce(p_comissao, 0), meio = p_meio
   where id = p_compra;
  -- Pago mesmo depois de expirar: os ingressos voltam a valer (o lugar foi segurado pelo pagamento aprovado).
  update public.ingressos set situacao = 'valido' where compra_id = p_compra and situacao in ('pendente', 'cancelado');
  return 'paga';
end $$;

-- Dados para a função do servidor montar o pagamento (com o login de quem compra).
create or replace function public.preparar_compra_ingresso(p_compra uuid)
returns table (compra_id uuid, total numeric, estabelecimento_id uuid, descricao text, comissao_pct numeric, quantidade int, evento_id uuid)
language plpgsql security definer set search_path = public as $$
declare c public.compras_ingresso;
begin
  select * into c from public.compras_ingresso ci where ci.id = p_compra and ci.usuario_id = auth.uid();
  if c.id is null then raise exception 'Compra não encontrada.'; end if;
  if c.situacao <> 'reservada' or c.expira_em <= now() then raise exception 'A reserva expirou. Escolha os ingressos de novo.'; end if;
  return query
  select c.id, c.total, c.estabelecimento_id,
         'Ingressos · ' || (select ev.nome from public.eventos ev where ev.id = c.evento_id),
         coalesce((select es.comissao_rovibes from public.estabelecimentos es where es.id = c.estabelecimento_id), 3),
         (select count(*)::int from public.ingressos ig where ig.compra_id = c.id), c.evento_id;
end $$;

-- ============================================================
-- Enviar para amigos / transferir e cancelar
-- ============================================================
create or replace function public.transferir_ingresso(p_ingresso uuid, p_para uuid)
returns void language plpgsql security definer set search_path = public as $$
declare i public.ingressos; e public.eventos; c public.compras_ingresso;
begin
  select * into i from public.ingressos where id = p_ingresso for update;
  if i.id is null or i.usuario_id <> auth.uid() then raise exception 'Ingresso não encontrado.'; end if;
  if i.situacao <> 'valido' then raise exception 'Só ingressos válidos podem ser enviados.'; end if;
  if i.compra_id is null then raise exception 'Ingresso gratuito não pode ser transferido.'; end if;
  if p_para = auth.uid() then raise exception 'Escolha outra pessoa.'; end if;
  if not exists (select 1 from public.perfis where id = p_para and not suspenso) or public.bloqueado_entre(p_para, auth.uid()) then
    raise exception 'Não é possível enviar para esta pessoa.';
  end if;
  select * into e from public.eventos where id = i.evento_id;
  select * into c from public.compras_ingresso where id = i.compra_id;
  -- Quem comprou pode distribuir para o grupo enquanto ainda não transferiu; depois, vale o prazo do evento.
  if not (i.comprador_id = auth.uid() and i.transferido_em is null) then
    if e.transferencia_horas is null then raise exception 'Este evento não permite transferir ingressos.'; end if;
    if now() > e.inicio - make_interval(hours => e.transferencia_horas) then
      raise exception 'O prazo para transferir terminou (% horas antes do evento).', e.transferencia_horas;
    end if;
  end if;
  if now() >= e.inicio then raise exception 'O evento já começou.'; end if;
  update public.ingressos set usuario_id = p_para, transferido_em = now() where id = i.id;
  insert into public.ingresso_transferencias (ingresso_id, de_usuario, para_usuario) values (i.id, auth.uid(), p_para);
end $$;

-- Quanto devolve se cancelar agora (e por quê).
create or replace function public.simular_cancelamento(p_ingresso uuid)
returns table (permitido boolean, valor numeric, motivo text)
language plpgsql stable security definer set search_path = public as $$
declare i public.ingressos; e public.eventos; c public.compras_ingresso; v_pct int; v_prazo int;
begin
  select * into i from public.ingressos where id = p_ingresso;
  if i.id is null or i.usuario_id <> auth.uid() then raise exception 'Ingresso não encontrado.'; end if;
  if i.situacao <> 'valido' or i.compra_id is null then return query select false, 0::numeric, 'Este ingresso não pode ser cancelado.'; return; end if;
  select * into e from public.eventos where id = i.evento_id;
  select * into c from public.compras_ingresso where id = i.compra_id;
  if now() >= e.inicio then return query select false, 0::numeric, 'O evento já começou.'; return; end if;
  if now() <= c.pago_em + interval '7 days' then
    return query select true, i.preco, 'Arrependimento: até 7 dias da compra, reembolso integral.'; return;
  end if;
  v_pct := coalesce((e.cancelamento->>'percentual')::int, 0);
  v_prazo := coalesce((e.cancelamento->>'prazo_horas')::int, 0);
  if v_pct > 0 and now() <= e.inicio - make_interval(hours => v_prazo) then
    return query select true, round(i.preco * v_pct / 100, 2), 'Política do evento: ' || v_pct || '% até ' || v_prazo || ' horas antes.'; return;
  end if;
  return query select false, 0::numeric, 'Pela política do evento, não há mais reembolso. Você ainda pode transferir, se o evento permitir.';
end $$;

create or replace function public.cancelar_ingresso(p_ingresso uuid)
returns numeric language plpgsql security definer set search_path = public as $$
declare s record; i public.ingressos;
begin
  select * into s from public.simular_cancelamento(p_ingresso);
  if not s.permitido then raise exception '%', s.motivo; end if;
  select * into i from public.ingressos where id = p_ingresso for update;
  update public.ingressos set situacao = case when s.valor > 0 then 'reembolsado' else 'cancelado' end where id = i.id;
  if s.valor > 0 then
    insert into public.reembolsos_ingresso (ingresso_id, compra_id, estabelecimento_id, usuario_id, valor, motivo)
    select i.id, i.compra_id, c.estabelecimento_id, auth.uid(), s.valor, s.motivo from public.compras_ingresso c where c.id = i.compra_id;
  end if;
  return s.valor;
end $$;

-- Evento cancelado pelo lugar: todos os ingressos pagos voltam 100%.
create or replace function public.reembolsar_evento_cancelado()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao = 'cancelado' and old.situacao is distinct from 'cancelado' then
    insert into public.reembolsos_ingresso (ingresso_id, compra_id, estabelecimento_id, usuario_id, valor, motivo)
    select i.id, i.compra_id, new.estabelecimento_id, i.usuario_id, i.preco, 'Evento cancelado pelo estabelecimento'
      from public.ingressos i where i.evento_id = new.id and i.situacao = 'valido' and i.compra_id is not null and i.preco > 0;
    update public.ingressos set situacao = 'reembolsado' where evento_id = new.id and situacao = 'valido' and compra_id is not null and preco > 0;
    update public.ingressos set situacao = 'cancelado' where evento_id = new.id and situacao in ('valido', 'pendente');
  end if;
  return new;
end $$;
drop trigger if exists eventos_reembolso on public.eventos;
create trigger eventos_reembolso after update of situacao on public.eventos for each row execute function public.reembolsar_evento_cancelado();

-- Reembolso feito (pelo servidor no Mercado Pago, ou marcado pela equipe se pagou por fora).
create or replace function public.marcar_reembolso(p_reembolso uuid, p_situacao text, p_mp text)
returns void language plpgsql security definer set search_path = public as $$
declare r public.reembolsos_ingresso;
begin
  select * into r from public.reembolsos_ingresso where id = p_reembolso;
  if r.id is null then raise exception 'Reembolso não encontrado.'; end if;
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role' and not public.pode_usar(r.estabelecimento_id, 'G5004') then
    raise exception 'Sem acesso.';
  end if;
  if p_situacao not in ('feito', 'falhou') then raise exception 'Situação inválida.'; end if;
  update public.reembolsos_ingresso set situacao = p_situacao, mp_reembolso = coalesce(p_mp, mp_reembolso),
         feito_em = case when p_situacao = 'feito' then now() end where id = p_reembolso;
end $$;

-- ============================================================
-- Carteira e portaria
-- ============================================================
drop function if exists public.meus_ingressos();
create or replace function public.meus_ingressos()
returns table (id uuid, codigo text, situacao text, preco numeric, meia boolean, tipo text, evento jsonb, comprei boolean, posso_transferir boolean,
               transferencia_ate timestamptz, compra_situacao text, reembolso jsonb, compra_id uuid, expira_em timestamptz)
language sql stable security definer set search_path = public as $$
  select i.id, i.codigo, i.situacao, i.preco, i.meia, t.nome,
         jsonb_build_object('id', e.id, 'nome', e.nome, 'inicio', e.inicio, 'fim', e.fim, 'capa_url', e.capa_url,
                            'estabelecimento', jsonb_build_object('id', es.id, 'nome', es.nome)),
         i.comprador_id = auth.uid(),
         i.situacao = 'valido' and i.compra_id is not null and now() < e.inicio
           and ((i.comprador_id = auth.uid() and i.transferido_em is null)
                or (e.transferencia_horas is not null and now() <= e.inicio - make_interval(hours => e.transferencia_horas))),
         case when e.transferencia_horas is not null then e.inicio - make_interval(hours => e.transferencia_horas) end,
         c.situacao,
         (select jsonb_build_object('valor', r.valor, 'situacao', r.situacao) from public.reembolsos_ingresso r where r.ingresso_id = i.id order by r.criado_em desc limit 1),
         i.compra_id, c.expira_em
    from public.ingressos i
    join public.eventos e on e.id = i.evento_id
    join public.estabelecimentos es on es.id = e.estabelecimento_id
    left join public.ingresso_tipos t on t.id = i.tipo_id
    left join public.compras_ingresso c on c.id = i.compra_id
   where i.usuario_id = auth.uid() and (i.situacao <> 'pendente' or (c.situacao = 'reservada' and c.expira_em > now()))
   order by e.inicio desc, i.criado_em;
$$;

drop function if exists public.validar_ingresso(uuid, text);
create or replace function public.validar_ingresso(p_estab uuid, p_codigo text)
returns table (nome text, evento text, pontos int, foto_url text, usuario text, tipo text, meia boolean)
language plpgsql security definer set search_path = public as $$
declare
  i public.ingressos; e public.eventos;
  v_codigo text := upper(regexp_replace(coalesce(p_codigo, ''), '[^A-Za-z0-9]', '', 'g'));
  v_pontos int := 0;
begin
  if not public.pode_usar(p_estab, 'G5004') then raise exception 'Sem acesso para validar ingressos.'; end if;
  if v_codigo like 'RVI%' and length(v_codigo) = 11 then v_codigo := substr(v_codigo, 4); end if;
  select ig.* into i from public.ingressos ig join public.eventos ev on ev.id = ig.evento_id
   where ig.codigo = v_codigo and ev.estabelecimento_id = p_estab for update of ig;
  if not found then raise exception 'Ingresso não encontrado neste estabelecimento.'; end if;
  select * into e from public.eventos where id = i.evento_id;
  if i.situacao in ('cancelado', 'reembolsado') then raise exception 'Este ingresso foi cancelado.'; end if;
  if i.situacao = 'pendente' then raise exception 'Este ingresso ainda não foi pago.'; end if;
  if i.situacao = 'usado' then
    raise exception 'Ingresso já usado em %.', to_char(i.usado_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;
  if e.situacao = 'cancelado' then raise exception 'Este evento foi cancelado.'; end if;
  if now() < e.inicio - interval '12 hours' then
    raise exception 'O evento é em %. A entrada só pode ser validada no dia.', to_char(e.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;
  if now() > public.fim_do_evento(e) + interval '6 hours' then raise exception 'Este evento já terminou.'; end if;
  update public.ingressos set situacao = 'usado', usado_em = now(), validado_por = auth.uid() where id = i.id;
  select coalesce(pp.pontos_ingresso, 0) into v_pontos from public.programa_pontos pp where pp.estabelecimento_id = p_estab and pp.ativo;
  if coalesce(v_pontos, 0) > 0 then
    insert into public.pontos (usuario_id, estabelecimento_id, pontos, motivo, referencia) values (i.usuario_id, p_estab, v_pontos, 'ingresso', i.id);
  end if;
  return query
  select coalesce(p.nome, 'Cliente'), e.nome, coalesce(v_pontos, 0), p.foto_url, p.usuario,
         (select t.nome from public.ingresso_tipos t where t.id = i.tipo_id), i.meia
    from (select 1) x left join public.perfis p on p.id = i.usuario_id;
end $$;

-- Business: vendas por tipo/lote e reembolsos.
create or replace function public.vendas_ingressos(p_evento uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_estab uuid; r jsonb;
begin
  select estabelecimento_id into v_estab from public.eventos where id = p_evento;
  if v_estab is null or not public.pode_usar(v_estab, 'G5004') then raise exception 'Sem acesso aos ingressos.'; end if;
  select jsonb_build_object(
    'lotes', coalesce((select jsonb_agg(jsonb_build_object('tipo', t.nome, 'lote', l.nome, 'preco', l.preco, 'quantidade', l.quantidade,
                         'vendidos', (select count(*) from public.ingressos i where i.lote_id = l.id and i.situacao in ('valido', 'usado')),
                         'meias', (select count(*) from public.ingressos i where i.lote_id = l.id and i.meia and i.situacao in ('valido', 'usado')),
                         'entraram', (select count(*) from public.ingressos i where i.lote_id = l.id and i.situacao = 'usado'),
                         'ativo', l.ativo and t.ativo, 'atual', l.id = public.lote_atual(t.id)) order by t.ordem, l.ordem)
                        from public.ingresso_tipos t join public.ingresso_lotes l on l.tipo_id = t.id where t.evento_id = p_evento), '[]'::jsonb),
    'bruto', (select coalesce(sum(total), 0) from public.compras_ingresso where evento_id = p_evento and situacao = 'paga'),
    'comissao', (select coalesce(sum(comissao), 0) from public.compras_ingresso where evento_id = p_evento and situacao = 'paga'),
    'reembolsado', (select coalesce(sum(valor), 0) from public.reembolsos_ingresso r join public.ingressos i on i.id = r.ingresso_id where i.evento_id = p_evento),
    'reembolsos', coalesce((select jsonb_agg(jsonb_build_object('id', r.id, 'valor', r.valor, 'motivo', r.motivo, 'situacao', r.situacao,
                              'nome', (select nome from public.perfis where id = r.usuario_id), 'em', r.criado_em) order by r.criado_em desc)
                            from public.reembolsos_ingresso r join public.ingressos i on i.id = r.ingresso_id where i.evento_id = p_evento), '[]'::jsonb)
  ) into r;
  return r;
end $$;

-- Promoter: vendas pelo link entram nos resultados.
create or replace function public.resultados_promoter(p_promoter uuid, p_desde timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cliques', (select count(*) from public.promoter_cliques c where c.promoter_id = p_promoter and c.criado_em >= p_desde),
    'pessoas', (select count(distinct c.usuario_id) from public.promoter_cliques c where c.promoter_id = p_promoter and c.criado_em >= p_desde),
    'na_lista', (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.via_promoter = p_promoter and n.criado_em >= p_desde),
    'chegaram', (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.via_promoter = p_promoter and n.chegou_em is not null and n.criado_em >= p_desde),
    'checkins', (select count(distinct k.id) from public.promoter_cliques c
                   join public.promoters p on p.id = c.promoter_id
                   join public.checkins k on k.usuario_id = c.usuario_id and k.estabelecimento_id = p.estabelecimento_id
                                          and k.criado_em between c.criado_em and c.criado_em + interval '24 hours'
                  where c.promoter_id = p_promoter and c.criado_em >= p_desde),
    'ingressos', (select count(*) from public.ingressos i join public.compras_ingresso c on c.id = i.compra_id
                   where c.promoter_id = p_promoter and c.situacao = 'paga' and c.pago_em >= p_desde and i.situacao in ('valido', 'usado')),
    'vendas', (select coalesce(sum(c.total), 0) from public.compras_ingresso c where c.promoter_id = p_promoter and c.situacao = 'paga' and c.pago_em >= p_desde)
  );
$$;

revoke execute on function public.confirmar_compra_ingresso(uuid, text, text, numeric, numeric, text) from public, anon, authenticated;
grant execute on function public.confirmar_compra_ingresso(uuid, text, text, numeric, numeric, text) to service_role;
revoke execute on function public.gere_ingressos(uuid), public.ocupados_lote(uuid, boolean), public.lote_atual(uuid), public.texto_cancelamento(uuid),
  public.ingressos_a_venda(uuid), public.salvar_ingressos_evento(uuid, jsonb, jsonb), public.reservar_ingressos(uuid, jsonb, text),
  public.preparar_compra_ingresso(uuid), public.transferir_ingresso(uuid, uuid), public.simular_cancelamento(uuid), public.cancelar_ingresso(uuid),
  public.marcar_reembolso(uuid, text, text), public.meus_ingressos(), public.validar_ingresso(uuid, text), public.vendas_ingressos(uuid) from public, anon;
grant execute on function public.gere_ingressos(uuid), public.ocupados_lote(uuid, boolean), public.lote_atual(uuid), public.texto_cancelamento(uuid),
  public.ingressos_a_venda(uuid), public.salvar_ingressos_evento(uuid, jsonb, jsonb), public.reservar_ingressos(uuid, jsonb, text),
  public.preparar_compra_ingresso(uuid), public.transferir_ingresso(uuid, uuid), public.simular_cancelamento(uuid), public.cancelar_ingresso(uuid),
  public.marcar_reembolso(uuid, text, text), public.meus_ingressos(), public.validar_ingresso(uuid, text), public.vendas_ingressos(uuid) to authenticated;
grant execute on function public.marcar_reembolso(uuid, text, text) to service_role;

select 'RoVibes 029 aplicado com sucesso' as resultado;
