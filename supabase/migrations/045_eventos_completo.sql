-- 045 · Eventos: categoria, endereço próprio, "Tenho interesse", visualizações,
-- painel com números para o Business e avisos automáticos (novo evento, mudança e cancelamento).
-- Pode rodar de novo sem problema.

-- ============================================================
-- Novos dados do evento
-- ============================================================
alter table public.eventos add column if not exists categoria text check (categoria is null or length(btrim(categoria)) between 2 and 30);
alter table public.eventos add column if not exists local_nome text check (local_nome is null or length(local_nome) <= 80);
alter table public.eventos add column if not exists endereco text check (endereco is null or length(endereco) <= 200);
alter table public.eventos add column if not exists latitude double precision;
alter table public.eventos add column if not exists longitude double precision;
alter table public.eventos add column if not exists avisar_seguidores boolean not null default true;
alter table public.eventos add column if not exists avisado_em timestamptz;
alter table public.eventos add column if not exists atualizado_em timestamptz not null default now();
-- Eventos que já existem não disparam aviso de "novo evento".
update public.eventos set avisado_em = criado_em where avisado_em is null and situacao <> 'rascunho' and criado_em < now() - interval '1 minute';

-- O público também vê o evento cancelado (para quem tinha interesse ou ingresso saber).
drop policy if exists eventos_ler on public.eventos;
create policy eventos_ler on public.eventos for select
  using ((situacao in ('publicado', 'cancelado') and public.estab_visivel(estabelecimento_id))
         or public.eh_membro(estabelecimento_id) or public.eh_admin());

-- ============================================================
-- Tenho interesse e visualizações
-- ============================================================
create table if not exists public.eventos_interesse (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (evento_id, usuario_id)
);
create index if not exists eventos_interesse_usuario_idx on public.eventos_interesse (usuario_id, criado_em desc);
alter table public.eventos_interesse enable row level security;
drop policy if exists eventos_interesse_ler on public.eventos_interesse;
create policy eventos_interesse_ler on public.eventos_interesse for select to authenticated using (usuario_id = auth.uid());
grant select on public.eventos_interesse to authenticated;

-- Uma visualização por pessoa por dia.
create table if not exists public.eventos_vistos (
  evento_id uuid not null references public.eventos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null default (now() at time zone 'America/Sao_Paulo')::date,
  primary key (evento_id, usuario_id, dia)
);
alter table public.eventos_vistos enable row level security;

create or replace function public.ver_evento(p_evento uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.eventos_vistos (evento_id, usuario_id)
  select e.id, auth.uid() from public.eventos e
  where e.id = p_evento and e.situacao = 'publicado' and not public.eh_membro(e.estabelecimento_id)
  on conflict do nothing;
end $$;

create or replace function public.alternar_interesse_evento(p_evento uuid)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if exists (select 1 from public.eventos_interesse where evento_id = p_evento and usuario_id = auth.uid()) then
    delete from public.eventos_interesse where evento_id = p_evento and usuario_id = auth.uid();
    return false;
  end if;
  if not exists (select 1 from public.eventos where id = p_evento and situacao = 'publicado') then
    raise exception 'Evento não encontrado.';
  end if;
  insert into public.eventos_interesse (evento_id) values (p_evento) on conflict do nothing;
  return true;
end $$;

-- Total de interessados, se eu tenho interesse e quais pessoas que eu sigo também têm.
create or replace function public.interesse_evento(p_evento uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'total', (select count(*) from public.eventos_interesse where evento_id = p_evento),
    'eu', exists (select 1 from public.eventos_interesse where evento_id = p_evento and usuario_id = auth.uid()),
    'amigos_total', (select count(*) from public.eventos_interesse i
                      join public.seguidores_pessoas s on s.seguido_id = i.usuario_id and s.seguidor_id = auth.uid() and s.situacao = 'ativo'
                      where i.evento_id = p_evento),
    'amigos', coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'foto_url', p.foto_url) order by i.criado_em desc)
                        from (select i.usuario_id, i.criado_em from public.eventos_interesse i
                              join public.seguidores_pessoas s on s.seguido_id = i.usuario_id and s.seguidor_id = auth.uid() and s.situacao = 'ativo'
                              where i.evento_id = p_evento order by i.criado_em desc limit 5) i
                        join public.perfis p on p.id = i.usuario_id), '[]'::jsonb)
  );
$$;

-- ============================================================
-- Painel do Business: números de cada evento
-- ============================================================
create or replace function public.painel_eventos(p_estab uuid)
returns table (evento_id uuid, visualizacoes int, interessados int, no_chat int, vendidos int, vagas int, receita numeric, vende_ingressos boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G5001') then raise exception 'Sem acesso aos eventos deste estabelecimento.'; end if;
  return query
  select e.id,
    (select count(*)::int from public.eventos_vistos v where v.evento_id = e.id),
    (select count(*)::int from public.eventos_interesse i where i.evento_id = e.id),
    (select count(*)::int from public.mensagens m where m.tipo = 'evento' and m.dados ->> 'id' = e.id::text and not m.apagada),
    (select count(*)::int from public.ingressos g where g.evento_id = e.id and g.situacao in ('valido', 'usado')),
    coalesce((select sum(l.quantidade)::int from public.ingresso_lotes l join public.ingresso_tipos t on t.id = l.tipo_id
              where t.evento_id = e.id and t.ativo and l.ativo), e.ingressos_vagas),
    coalesce((select sum(c.total) from public.compras_ingresso c where c.evento_id = e.id and c.situacao = 'paga'), 0),
    exists (select 1 from public.ingresso_tipos t where t.evento_id = e.id and t.ativo)
  from public.eventos e
  where e.estabelecimento_id = p_estab;
end $$;

revoke execute on function public.ver_evento(uuid), public.alternar_interesse_evento(uuid), public.interesse_evento(uuid), public.painel_eventos(uuid) from public, anon;
grant execute on function public.ver_evento(uuid), public.alternar_interesse_evento(uuid), public.interesse_evento(uuid), public.painel_eventos(uuid) to authenticated;

-- ============================================================
-- Avisos automáticos
-- ============================================================
alter table public.notificacoes drop constraint if exists notificacoes_tipo_check;
alter table public.notificacoes add constraint notificacoes_tipo_check check (tipo in ('brinde', 'brinde_comentario', 'comentario', 'resposta', 'seguidor', 'pedido_seguir',
  'convite_evento', 'convite_role', 'convite_promoter', 'mensagem', 'pedido_pronto', 'evento'));

create or replace function public.categoria_notificacao(p_tipo text)
returns text language sql immutable as $$
  select case
    when p_tipo in ('brinde', 'brinde_comentario') then 'brindes'
    when p_tipo in ('comentario', 'resposta') then 'comentarios'
    when p_tipo in ('seguidor', 'pedido_seguir') then 'seguidores'
    when p_tipo in ('convite_evento', 'convite_role', 'convite_promoter') then 'convites'
    when p_tipo = 'evento' then 'eventos'
    when p_tipo = 'mensagem' then 'chat'
    else 'pedidos'
  end;
$$;

create or replace function public.quando_evento_texto(p_inicio timestamptz)
returns text language sql immutable as $$
  select to_char(p_inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$$;

-- Novo evento → quem segue o lugar. Mudou data/horário/local ou cancelou → quem tem interesse ou ingresso.
create or replace function public.eventos_avisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_lugar text; v_titulo text; v_texto text; v_chave text; u uuid;
begin
  new.atualizado_em := now();
  if new.situacao = 'rascunho' then return new; end if;
  begin
    select nome into v_lugar from public.estabelecimentos where id = new.estabelecimento_id;

    -- Publicou agora (e ainda não avisou): seguidores do lugar.
    if new.situacao = 'publicado' and new.avisado_em is null then
      new.avisado_em := now();
      if new.avisar_seguidores and coalesce(new.fim, new.inicio) > now() then
        for u in select s.usuario_id from public.seguidores s where s.estabelecimento_id = new.estabelecimento_id loop
          perform public.notificar(u, auth.uid(), 'evento', coalesce(v_lugar, 'Novo evento'),
                                   'Novo evento: ' || new.nome || ' · ' || public.quando_evento_texto(new.inicio),
                                   '/evento/' || new.id, 'evento:' || new.id || ':novo:' || u, 'evento:' || new.id);
        end loop;
      end if;
    end if;

    if tg_op = 'UPDATE' and old.situacao = 'publicado' then
      if new.situacao = 'cancelado' then
        v_titulo := 'Evento cancelado';
        v_texto := new.nome || ' (' || public.quando_evento_texto(old.inicio) || ') foi cancelado por ' || coalesce(v_lugar, 'o lugar') || '.';
        v_chave := 'cancelado';
      elsif new.situacao = 'publicado' and (new.inicio is distinct from old.inicio or new.fim is distinct from old.fim
            or new.endereco is distinct from old.endereco or new.local_nome is distinct from old.local_nome) then
        v_titulo := 'Mudança no evento';
        v_texto := case
          when new.inicio is distinct from old.inicio or new.fim is distinct from old.fim then new.nome || ' agora é ' || public.quando_evento_texto(new.inicio) || '.'
          else new.nome || ' mudou de local: ' || coalesce(new.local_nome, new.endereco, v_lugar) || '.' end;
        v_chave := 'mudou:' || extract(epoch from now())::bigint;
      end if;
      if v_titulo is not null then
        for u in select usuario_id from public.eventos_interesse where evento_id = new.id
                 union select usuario_id from public.ingressos where evento_id = new.id and situacao in ('valido', 'pendente') loop
          perform public.notificar(u, auth.uid(), 'evento', v_titulo, v_texto, '/evento/' || new.id,
                                   'evento:' || new.id || ':' || v_chave || ':' || u, 'evento:' || new.id);
        end loop;
      end if;
    end if;
  exception when undefined_function or undefined_table then null;
  end;
  return new;
end $$;

drop trigger if exists eventos_avisos on public.eventos;
create trigger eventos_avisos before insert or update on public.eventos
  for each row execute function public.eventos_avisos();

notify pgrst, 'reload schema';

select 'Atualização 045 aplicada: eventos com categoria, interesse, painel e avisos.' as resultado;
