-- RoVibes 006: carteira sem dinheiro
-- Promoções e cupons (só para compras pelo App), ingressos gratuitos com QR code
-- e programa de pontos por estabelecimento, com recompensas.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Código curto (sem letras que confundem: 0/O, 1/I/L)
-- ============================================================
create or replace function public.gerar_codigo(p_tamanho int default 8)
returns text language plpgsql volatile as $$
declare
  alfabeto constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  r text := '';
begin
  for i in 1..p_tamanho loop
    r := r || substr(alfabeto, 1 + floor(random() * length(alfabeto))::int, 1);
  end loop;
  return r;
end $$;

-- ============================================================
-- Promoções (campanhas do estabelecimento)
-- ============================================================
create table if not exists public.promocoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) > 1),
  descricao text check (descricao is null or length(descricao) <= 400),
  tipo text not null check (tipo in ('percentual', 'valor', 'item_gratis')),
  valor numeric(10,2) check (valor is null or valor > 0),
  item_id uuid references public.cardapio_itens(id) on delete set null,
  pedido_minimo numeric(10,2) check (pedido_minimo is null or pedido_minimo >= 0),
  inicio timestamptz not null default now(),
  fim timestamptz,
  dias smallint[],                 -- 0 = domingo ... 6 = sábado; vazio = todos os dias
  hora_inicio time,
  hora_fim time,
  limite_total int check (limite_total is null or limite_total > 0),
  limite_por_pessoa int not null default 1 check (limite_por_pessoa between 1 and 20),
  validade_dias int not null default 30 check (validade_dias between 1 and 365),
  situacao text not null default 'ativa' check (situacao in ('ativa', 'pausada', 'encerrada')),
  criado_em timestamptz not null default now(),
  check (fim is null or fim > inicio),
  check ((tipo = 'percentual' and valor is not null and valor <= 100)
      or (tipo = 'valor' and valor is not null)
      or (tipo = 'item_gratis'))
);
create index if not exists promocoes_estab_idx on public.promocoes (estabelecimento_id, situacao);

alter table public.promocoes enable row level security;
drop policy if exists promocoes_ler on public.promocoes;
create policy promocoes_ler on public.promocoes for select
  using ((situacao = 'ativa' and public.estab_visivel(estabelecimento_id)) or public.pode_usar(estabelecimento_id, 'G5003'));
drop policy if exists promocoes_gerir on public.promocoes;
create policy promocoes_gerir on public.promocoes for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G5003')) with check (public.pode_usar(estabelecimento_id, 'G5003'));

-- ============================================================
-- Programa de pontos e recompensas
-- ============================================================
create table if not exists public.programa_pontos (
  estabelecimento_id uuid primary key references public.estabelecimentos(id) on delete cascade,
  ativo boolean not null default true,
  pontos_checkin int not null default 10 check (pontos_checkin between 0 and 1000),
  pontos_ingresso int not null default 0 check (pontos_ingresso between 0 and 1000),
  atualizado_em timestamptz not null default now()
);
alter table public.programa_pontos enable row level security;
drop policy if exists programa_ler on public.programa_pontos;
create policy programa_ler on public.programa_pontos for select
  using (public.estab_visivel(estabelecimento_id) or public.pode_usar(estabelecimento_id, 'G9001'));
drop policy if exists programa_gerir on public.programa_pontos;
create policy programa_gerir on public.programa_pontos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G9001')) with check (public.pode_usar(estabelecimento_id, 'G9001'));

create table if not exists public.recompensas (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) > 1),
  custo int not null check (custo between 1 and 100000),
  tipo text not null check (tipo in ('percentual', 'valor', 'item_gratis')),
  valor numeric(10,2) check (valor is null or valor > 0),
  item_id uuid references public.cardapio_itens(id) on delete set null,
  pedido_minimo numeric(10,2) check (pedido_minimo is null or pedido_minimo >= 0),
  validade_dias int not null default 30 check (validade_dias between 1 and 365),
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  check ((tipo = 'percentual' and valor is not null and valor <= 100)
      or (tipo = 'valor' and valor is not null)
      or (tipo = 'item_gratis'))
);
create index if not exists recompensas_estab_idx on public.recompensas (estabelecimento_id, custo);
alter table public.recompensas enable row level security;
drop policy if exists recompensas_ler on public.recompensas;
create policy recompensas_ler on public.recompensas for select
  using ((ativa and public.estab_visivel(estabelecimento_id)) or public.pode_usar(estabelecimento_id, 'G9001'));
drop policy if exists recompensas_gerir on public.recompensas;
create policy recompensas_gerir on public.recompensas for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G9001')) with check (public.pode_usar(estabelecimento_id, 'G9001'));

-- Extrato de pontos (ganhos positivos, trocas negativas). Só o banco grava.
create table if not exists public.pontos (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  pontos int not null check (pontos <> 0),
  motivo text not null check (motivo in ('checkin', 'ingresso', 'troca', 'ajuste')),
  referencia uuid,
  criado_em timestamptz not null default now()
);
create index if not exists pontos_usuario_idx on public.pontos (usuario_id, estabelecimento_id);
create index if not exists pontos_estab_idx on public.pontos (estabelecimento_id, criado_em desc);
alter table public.pontos enable row level security;
drop policy if exists pontos_ler on public.pontos;
create policy pontos_ler on public.pontos for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G9001'));

create or replace function public.saldo_pontos(p_usuario uuid, p_estab uuid)
returns int language sql stable security definer set search_path = public as $$
  select coalesce(sum(pontos), 0)::int from public.pontos where usuario_id = p_usuario and estabelecimento_id = p_estab;
$$;

-- Ganha pontos ao fazer check-in, se o lugar tiver programa ativo.
create or replace function public.pontos_por_checkin()
returns trigger language plpgsql security definer set search_path = public as $$
declare v int;
begin
  select pontos_checkin into v from public.programa_pontos where estabelecimento_id = new.estabelecimento_id and ativo;
  if coalesce(v, 0) > 0 then
    insert into public.pontos (usuario_id, estabelecimento_id, pontos, motivo, referencia)
    values (new.usuario_id, new.estabelecimento_id, v, 'checkin', new.id);
  end if;
  return new;
end $$;
drop trigger if exists checkins_pontos on public.checkins;
create trigger checkins_pontos after insert on public.checkins
  for each row execute function public.pontos_por_checkin();

-- ============================================================
-- Cupons na carteira (cópia das regras no momento do resgate)
-- ============================================================
create table if not exists public.cupons (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  promocao_id uuid references public.promocoes(id) on delete set null,
  recompensa_id uuid references public.recompensas(id) on delete set null,
  titulo text not null,
  tipo text not null check (tipo in ('percentual', 'valor', 'item_gratis')),
  valor numeric(10,2),
  item_id uuid references public.cardapio_itens(id) on delete set null,
  pedido_minimo numeric(10,2),
  dias smallint[],
  hora_inicio time,
  hora_fim time,
  codigo text not null unique,
  situacao text not null default 'disponivel' check (situacao in ('disponivel', 'usado', 'cancelado')),
  validade timestamptz not null,
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists cupons_usuario_idx on public.cupons (usuario_id, situacao, validade);
create index if not exists cupons_promocao_idx on public.cupons (promocao_id);
alter table public.cupons enable row level security;
drop policy if exists cupons_ler on public.cupons;
create policy cupons_ler on public.cupons for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G5003'));

create or replace function public.inserir_cupom(
  p_usuario uuid, p_estab uuid, p_promocao uuid, p_recompensa uuid, p_titulo text, p_tipo text, p_valor numeric,
  p_item uuid, p_minimo numeric, p_dias smallint[], p_hi time, p_hf time, p_validade timestamptz
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  for tentativa in 1..5 loop
    begin
      insert into public.cupons (usuario_id, estabelecimento_id, promocao_id, recompensa_id, titulo, tipo, valor, item_id,
                                 pedido_minimo, dias, hora_inicio, hora_fim, codigo, validade)
      values (p_usuario, p_estab, p_promocao, p_recompensa, p_titulo, p_tipo, p_valor, p_item,
              p_minimo, p_dias, p_hi, p_hf, public.gerar_codigo(8), p_validade)
      returning id into v_id;
      return v_id;
    exception when unique_violation then
      null;
    end;
  end loop;
  raise exception 'Não foi possível gerar o cupom. Tente de novo.';
end $$;
revoke execute on function public.inserir_cupom(uuid, uuid, uuid, uuid, text, text, numeric, uuid, numeric, smallint[], time, time, timestamptz) from public, anon, authenticated;

-- Resgatar o cupom de uma promoção (exige conta).
create or replace function public.resgatar_cupom(p_promocao uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  p public.promocoes;
  v_total int; v_meus int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para resgatar cupons.'; end if;
  select * into p from public.promocoes where id = p_promocao for update;
  if not found or p.situacao <> 'ativa' or not public.estab_visivel(p.estabelecimento_id) then
    raise exception 'Esta promoção não está disponível.';
  end if;
  if p.inicio > now() then raise exception 'Esta promoção ainda não começou.'; end if;
  if p.fim is not null and p.fim <= now() then raise exception 'Esta promoção já terminou.'; end if;
  select count(*) into v_total from public.cupons where promocao_id = p.id and situacao <> 'cancelado';
  if p.limite_total is not null and v_total >= p.limite_total then
    raise exception 'Os cupons desta promoção acabaram.';
  end if;
  select count(*) into v_meus from public.cupons where promocao_id = p.id and usuario_id = auth.uid() and situacao <> 'cancelado';
  if v_meus >= p.limite_por_pessoa then
    raise exception 'Você já resgatou este cupom.';
  end if;
  return public.inserir_cupom(auth.uid(), p.estabelecimento_id, p.id, null, p.titulo, p.tipo, p.valor, p.item_id,
    p.pedido_minimo, p.dias, p.hora_inicio, p.hora_fim,
    least(coalesce(p.fim, 'infinity'::timestamptz), now() + make_interval(days => p.validade_dias)));
end $$;

-- Resgates de cada promoção (para o App mostrar "restam X" e o Business acompanhar).
create or replace function public.resumo_promocoes(p_ids uuid[])
returns table (promocao_id uuid, resgatados int, usados int, meus int)
language sql stable security definer set search_path = public as $$
  select p.id,
         (select count(*) from public.cupons c where c.promocao_id = p.id and c.situacao <> 'cancelado')::int,
         (select count(*) from public.cupons c where c.promocao_id = p.id and c.situacao = 'usado')::int,
         (select count(*) from public.cupons c where c.promocao_id = p.id and c.usuario_id = auth.uid() and c.situacao <> 'cancelado')::int
    from public.promocoes p
   where p.id = any(p_ids)
     and ((p.situacao = 'ativa' and public.estab_visivel(p.estabelecimento_id)) or public.pode_usar(p.estabelecimento_id, 'G5003'));
$$;

-- Desconto de um cupom num pedido feito pelo App. Usado pelos pedidos (fase 5);
-- confere dono, validade, dia, horário e pedido mínimo.
create or replace function public.desconto_do_cupom(p_cupom uuid, p_total numeric)
returns numeric language plpgsql stable security definer set search_path = public as $$
declare
  c public.cupons;
  agora timestamp := now() at time zone 'America/Sao_Paulo';
  v_preco numeric;
begin
  select * into c from public.cupons where id = p_cupom and usuario_id = auth.uid();
  if not found then raise exception 'Cupom não encontrado.'; end if;
  if c.situacao = 'usado' then raise exception 'Este cupom já foi usado.'; end if;
  if c.situacao <> 'disponivel' or c.validade <= now() then raise exception 'Este cupom venceu.'; end if;
  if c.dias is not null and cardinality(c.dias) > 0 and not (extract(dow from agora)::smallint = any(c.dias)) then
    raise exception 'Este cupom não vale hoje.';
  end if;
  if c.hora_inicio is not null and c.hora_fim is not null then
    if (c.hora_inicio <= c.hora_fim and not (agora::time between c.hora_inicio and c.hora_fim))
       or (c.hora_inicio > c.hora_fim and agora::time < c.hora_inicio and agora::time > c.hora_fim) then
      raise exception 'Este cupom vale das % às %.', to_char(c.hora_inicio, 'HH24:MI'), to_char(c.hora_fim, 'HH24:MI');
    end if;
  end if;
  if c.pedido_minimo is not null and p_total < c.pedido_minimo then
    raise exception 'Este cupom vale para pedidos a partir de R$ %.', replace(to_char(c.pedido_minimo, 'FM999990.00'), '.', ',');
  end if;
  if c.tipo = 'percentual' then return round(p_total * c.valor / 100, 2); end if;
  if c.tipo = 'valor' then return least(c.valor, p_total); end if;
  select preco into v_preco from public.cardapio_itens where id = c.item_id;
  return least(coalesce(v_preco, 0), p_total);
end $$;

-- Trocar pontos por uma recompensa: o benefício vira cupom na carteira.
create or replace function public.trocar_recompensa(p_recompensa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  r public.recompensas;
  v_saldo int; v_cupom uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para trocar pontos.'; end if;
  select * into r from public.recompensas where id = p_recompensa;
  if not found or not r.ativa or not public.estab_visivel(r.estabelecimento_id) then
    raise exception 'Esta recompensa não está disponível.';
  end if;
  if not exists (select 1 from public.programa_pontos where estabelecimento_id = r.estabelecimento_id and ativo) then
    raise exception 'O programa de pontos deste lugar está pausado.';
  end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text || r.estabelecimento_id::text));
  v_saldo := public.saldo_pontos(auth.uid(), r.estabelecimento_id);
  if v_saldo < r.custo then
    raise exception 'Você tem % pontos. Faltam % para esta recompensa.', v_saldo, r.custo - v_saldo;
  end if;
  v_cupom := public.inserir_cupom(auth.uid(), r.estabelecimento_id, null, r.id, r.titulo, r.tipo, r.valor, r.item_id,
    r.pedido_minimo, null, null, null, now() + make_interval(days => r.validade_dias));
  insert into public.pontos (usuario_id, estabelecimento_id, pontos, motivo, referencia)
  values (auth.uid(), r.estabelecimento_id, -r.custo, 'troca', v_cupom);
  return v_cupom;
end $$;

-- Saldo da pessoa em cada lugar (carteira) ou num lugar só.
create or replace function public.meus_pontos(p_estab uuid default null)
returns table (estabelecimento_id uuid, nome text, logo_url text, saldo int, ativo boolean)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.logo_url, sum(p.pontos)::int, coalesce(pp.ativo, false)
    from public.pontos p
    join public.estabelecimentos e on e.id = p.estabelecimento_id
    left join public.programa_pontos pp on pp.estabelecimento_id = e.id
   where p.usuario_id = auth.uid() and (p_estab is null or p.estabelecimento_id = p_estab)
   group by e.id, e.nome, e.logo_url, pp.ativo
  having sum(p.pontos) <> 0 or p_estab is not null
   order by 4 desc;
$$;

-- Clientes do programa (Business).
create or replace function public.clientes_pontos(p_estab uuid)
returns table (usuario_id uuid, nome text, saldo int, ganhos int, ultimo_ganho timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G9001') then raise exception 'Sem acesso ao programa de pontos.'; end if;
  return query
  select p.usuario_id, coalesce(pf.nome, 'Cliente'), sum(p.pontos)::int,
         coalesce(sum(p.pontos) filter (where p.pontos > 0), 0)::int,
         max(p.criado_em) filter (where p.pontos > 0)
    from public.pontos p
    left join public.perfis pf on pf.id = p.usuario_id
   where p.estabelecimento_id = p_estab
   group by p.usuario_id, pf.nome
   order by 3 desc, 5 desc nulls last
   limit 500;
end $$;

-- ============================================================
-- Ingressos gratuitos (lista pelo App, QR code na entrada)
-- ============================================================
alter table public.eventos add column if not exists ingressos_vagas int check (ingressos_vagas is null or ingressos_vagas between 1 and 100000);

create table if not exists public.ingressos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null unique,
  situacao text not null default 'valido' check (situacao in ('valido', 'usado', 'cancelado')),
  criado_em timestamptz not null default now(),
  usado_em timestamptz,
  validado_por uuid references auth.users(id),
  unique (evento_id, usuario_id)
);
create index if not exists ingressos_usuario_idx on public.ingressos (usuario_id, criado_em desc);
alter table public.ingressos enable row level security;
drop policy if exists ingressos_ler on public.ingressos;
create policy ingressos_ler on public.ingressos for select to authenticated
  using (usuario_id = auth.uid()
      or public.pode_usar((select e.estabelecimento_id from public.eventos e where e.id = evento_id), 'G5004'));

-- Pode configurar vagas quem tem Eventos ou Ingressos.
create or replace function public.definir_vagas(p_evento uuid, p_vagas int)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_pegos int;
begin
  select estabelecimento_id into v_estab from public.eventos where id = p_evento;
  if v_estab is null or not (public.pode_usar(v_estab, 'G5004') or public.pode_usar(v_estab, 'G5001')) then
    raise exception 'Sem acesso a este evento.';
  end if;
  select count(*) into v_pegos from public.ingressos where evento_id = p_evento and situacao <> 'cancelado';
  if p_vagas is not null and p_vagas < v_pegos then
    raise exception 'Já foram pegos % ingressos. As vagas não podem ser menores que isso.', v_pegos;
  end if;
  update public.eventos set ingressos_vagas = p_vagas where id = p_evento;
end $$;

create or replace function public.fim_do_evento(e public.eventos)
returns timestamptz language sql immutable as $$
  select coalesce(e.fim, e.inicio + interval '6 hours');
$$;

create or replace function public.pegar_ingresso(p_evento uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  e public.eventos;
  v_pegos int; v_id uuid; v_sit text;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para pegar ingresso.'; end if;
  select * into e from public.eventos where id = p_evento for update;
  if not found or e.situacao <> 'publicado' or not public.estab_visivel(e.estabelecimento_id) then
    raise exception 'Evento não encontrado.';
  end if;
  if e.ingressos_vagas is null then raise exception 'Este evento não tem ingressos pelo app.'; end if;
  if public.fim_do_evento(e) <= now() then raise exception 'Este evento já terminou.'; end if;
  select id, situacao into v_id, v_sit from public.ingressos where evento_id = e.id and usuario_id = auth.uid();
  if v_sit in ('valido', 'usado') then raise exception 'Você já tem ingresso para este evento.'; end if;
  select count(*) into v_pegos from public.ingressos where evento_id = e.id and situacao <> 'cancelado';
  if v_pegos >= e.ingressos_vagas then raise exception 'Os ingressos esgotaram.'; end if;
  if v_id is not null then
    update public.ingressos set situacao = 'valido', criado_em = now() where id = v_id;
    return v_id;
  end if;
  for tentativa in 1..5 loop
    begin
      insert into public.ingressos (evento_id, usuario_id, codigo)
      values (e.id, auth.uid(), public.gerar_codigo(8)) returning id into v_id;
      return v_id;
    exception when unique_violation then
      if exists (select 1 from public.ingressos where evento_id = e.id and usuario_id = auth.uid()) then
        raise exception 'Você já tem ingresso para este evento.';
      end if;
    end;
  end loop;
  raise exception 'Não foi possível gerar o ingresso. Tente de novo.';
end $$;

create or replace function public.devolver_ingresso(p_ingresso uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.ingressos set situacao = 'cancelado'
   where id = p_ingresso and usuario_id = auth.uid() and situacao = 'valido';
  if not found then raise exception 'Este ingresso não pode ser devolvido.'; end if;
end $$;

create or replace function public.resumo_ingressos(p_eventos uuid[])
returns table (evento_id uuid, vagas int, pegos int, entraram int, meu_ingresso uuid, meu_situacao text)
language sql stable security definer set search_path = public as $$
  select e.id, e.ingressos_vagas,
         (select count(*) from public.ingressos i where i.evento_id = e.id and i.situacao <> 'cancelado')::int,
         (select count(*) from public.ingressos i where i.evento_id = e.id and i.situacao = 'usado')::int,
         m.id, m.situacao
    from public.eventos e
    left join public.ingressos m on m.evento_id = e.id and m.usuario_id = auth.uid() and m.situacao <> 'cancelado'
   where e.id = any(p_eventos)
     and ((e.situacao <> 'rascunho' and public.estab_visivel(e.estabelecimento_id))
          or public.pode_usar(e.estabelecimento_id, 'G5004') or public.pode_usar(e.estabelecimento_id, 'G5001'));
$$;

-- Lista de quem pegou ingresso (Business).
create or replace function public.lista_ingressos(p_evento uuid)
returns table (id uuid, nome text, codigo text, situacao text, criado_em timestamptz, usado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_estab uuid;
begin
  select ev.estabelecimento_id into v_estab from public.eventos ev where ev.id = p_evento;
  if v_estab is null or not public.pode_usar(v_estab, 'G5004') then raise exception 'Sem acesso aos ingressos.'; end if;
  return query
  select i.id, coalesce(p.nome, 'Cliente'), i.codigo, i.situacao, i.criado_em, i.usado_em
    from public.ingressos i left join public.perfis p on p.id = i.usuario_id
   where i.evento_id = p_evento and i.situacao <> 'cancelado'
   order by i.usado_em desc nulls last, p.nome;
end $$;

-- Validar a entrada pelo código ou QR. Vale uma vez.
create or replace function public.validar_ingresso(p_estab uuid, p_codigo text)
returns table (nome text, evento text, pontos int)
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
  if i.situacao = 'cancelado' then raise exception 'Este ingresso foi devolvido.'; end if;
  if i.situacao = 'usado' then
    raise exception 'Ingresso já usado em %.', to_char(i.usado_em at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;
  if e.situacao = 'cancelado' then raise exception 'Este evento foi cancelado.'; end if;
  if now() < e.inicio - interval '12 hours' then
    raise exception 'O evento é em %. A entrada só pode ser validada no dia.', to_char(e.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
  end if;
  if now() > public.fim_do_evento(e) + interval '6 hours' then raise exception 'Este evento já terminou.'; end if;
  update public.ingressos set situacao = 'usado', usado_em = now(), validado_por = auth.uid() where id = i.id;
  select coalesce(pp.pontos_ingresso, 0) into v_pontos from public.programa_pontos pp
   where pp.estabelecimento_id = p_estab and pp.ativo;
  if coalesce(v_pontos, 0) > 0 then
    insert into public.pontos (usuario_id, estabelecimento_id, pontos, motivo, referencia)
    values (i.usuario_id, p_estab, v_pontos, 'ingresso', i.id);
  end if;
  return query select coalesce((select p.nome from public.perfis p where p.id = i.usuario_id), 'Cliente'), e.nome, coalesce(v_pontos, 0);
end $$;

grant execute on function public.resgatar_cupom(uuid), public.resumo_promocoes(uuid[]), public.desconto_do_cupom(uuid, numeric),
  public.trocar_recompensa(uuid), public.meus_pontos(uuid), public.clientes_pontos(uuid), public.definir_vagas(uuid, int),
  public.pegar_ingresso(uuid), public.devolver_ingresso(uuid), public.resumo_ingressos(uuid[]), public.lista_ingressos(uuid),
  public.validar_ingresso(uuid, text) to authenticated;

select 'RoVibes 006 aplicado com sucesso' as resultado;
