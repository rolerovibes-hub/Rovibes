-- 031 · "Como está agora", presença de amigos e gostos (vibe)
-- • Cada informação dinâmica tem origem, horário e confiança (nada de número inventado).
-- • Música: a programação de hoje é "prevista"; "tocando agora" vem de um toque da equipe.
-- • Check-in com visibilidade: público (seguidores sabem), amigos (quem se segue de volta sabe)
--   ou privado (conta só para o movimento; aparece como número, sem nome). Vale 4 h ou até "Saí".
-- • Catálogo de gostos (músicas, ambientes, bebidas, comidas, experiências) para a "Primeira vibe",
--   para os estilos da casa e dos eventos.
-- Pode rodar de novo sem problema.

-- ============================================================
-- Gostos
-- ============================================================
create table if not exists public.gostos (
  id smallint generated always as identity primary key,
  tipo text not null check (tipo in ('musica', 'ambiente', 'bebida', 'comida', 'experiencia')),
  nome text not null check (length(btrim(nome)) between 2 and 40),
  emoji text,
  ordem int not null default 0,
  ativo boolean not null default true,
  unique (tipo, nome)
);
alter table public.gostos enable row level security;
drop policy if exists gostos_ler on public.gostos;
create policy gostos_ler on public.gostos for select using (true);
drop policy if exists gostos_admin on public.gostos;
create policy gostos_admin on public.gostos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

insert into public.gostos (tipo, nome, emoji, ordem) values
  ('musica', 'Samba', '🥁', 1), ('musica', 'Pagode', '🪘', 2), ('musica', 'Sertanejo', '🤠', 3), ('musica', 'Funk', '🔊', 4),
  ('musica', 'MPB', '🎶', 5), ('musica', 'Rock', '🎸', 6), ('musica', 'Pop', '🎤', 7), ('musica', 'Eletrônica', '🎧', 8),
  ('musica', 'Rap e hip-hop', '🎙️', 9), ('musica', 'Forró', '🪗', 10), ('musica', 'Reggae', '🌴', 11), ('musica', 'Jazz e blues', '🎷', 12),
  ('musica', 'Axé', '☀️', 13), ('musica', 'Indie', '📻', 14), ('musica', 'Flashback', '🪩', 15),
  ('ambiente', 'Boteco', '🍻', 1), ('ambiente', 'Barzinho para conversar', '💬', 2), ('ambiente', 'Pista de dança', '💃', 3),
  ('ambiente', 'Ao ar livre', '🌳', 4), ('ambiente', 'Rooftop', '🌆', 5), ('ambiente', 'Pub', '🍺', 6), ('ambiente', 'Lounge', '🛋️', 7),
  ('ambiente', 'Gastrobar', '🍽️', 8), ('ambiente', 'Música ao vivo', '🎤', 9), ('ambiente', 'Karaokê', '🎙️', 10),
  ('ambiente', 'Balada', '🪩', 11), ('ambiente', 'Pet friendly', '🐶', 12),
  ('bebida', 'Cerveja gelada', '🍺', 1), ('bebida', 'Chope', '🍻', 2), ('bebida', 'Cerveja artesanal', '🍯', 3),
  ('bebida', 'Drinks autorais', '🍸', 4), ('bebida', 'Caipirinha', '🍋', 5), ('bebida', 'Vinho', '🍷', 6), ('bebida', 'Gin', '🫒', 7),
  ('bebida', 'Whisky', '🥃', 8), ('bebida', 'Sem álcool', '🧃', 9), ('bebida', 'Café', '☕', 10),
  ('comida', 'Petiscos', '🍟', 1), ('comida', 'Hambúrguer', '🍔', 2), ('comida', 'Pizza', '🍕', 3), ('comida', 'Japonesa', '🍣', 4),
  ('comida', 'Churrasco', '🥩', 5), ('comida', 'Vegetariana', '🥗', 6), ('comida', 'Comida mineira', '🧀', 7), ('comida', 'Doces', '🍰', 8),
  ('experiencia', 'Shows', '🎫', 1), ('experiencia', 'Stand-up', '😂', 2), ('experiencia', 'Futebol no telão', '⚽', 3),
  ('experiencia', 'Happy hour', '🕔', 4), ('experiencia', 'Festa temática', '🎭', 5), ('experiencia', 'Conhecer gente nova', '🤝', 6),
  ('experiencia', 'Date', '💘', 7), ('experiencia', 'Rolê com a galera', '👯', 8)
on conflict (tipo, nome) do nothing;

-- Gostos de cada pessoa ("Primeira vibe"). origem 'escolha' = marcou; 'uso' = o app aprendeu.
create table if not exists public.perfil_gostos (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  gosto_id smallint not null references public.gostos(id) on delete cascade,
  origem text not null default 'escolha' check (origem in ('escolha', 'uso')),
  peso numeric not null default 1,
  atualizado_em timestamptz not null default now(),
  primary key (usuario_id, gosto_id)
);
alter table public.perfil_gostos enable row level security;
drop policy if exists perfil_gostos_meus on public.perfil_gostos;
create policy perfil_gostos_meus on public.perfil_gostos for select to authenticated using (usuario_id = auth.uid());

alter table public.perfis add column if not exists vibe_inicial_em timestamptz;

-- Gostos da casa (estilos de música, ambiente, bebidas...) e dos eventos.
create table if not exists public.estabelecimento_gostos (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  gosto_id smallint not null references public.gostos(id) on delete cascade,
  primary key (estabelecimento_id, gosto_id)
);
alter table public.estabelecimento_gostos enable row level security;
drop policy if exists estab_gostos_ler on public.estabelecimento_gostos;
create policy estab_gostos_ler on public.estabelecimento_gostos for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id));
drop policy if exists estab_gostos_gerir on public.estabelecimento_gostos;
create policy estab_gostos_gerir on public.estabelecimento_gostos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G1001')) with check (public.pode_usar(estabelecimento_id, 'G1001'));

alter table public.eventos add column if not exists gostos smallint[] not null default '{}';

-- Salva a "Primeira vibe": mínimo de 3 escolhas. Lista vazia = pulou (não pergunta de novo).
create or replace function public.salvar_meus_gostos(p_ids smallint[])
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  v := coalesce(array_length(p_ids, 1), 0);
  if v between 1 and 2 then raise exception 'Escolha pelo menos 3 opções (ou pule esta etapa).'; end if;
  if v > 0 then
    delete from public.perfil_gostos where usuario_id = auth.uid() and origem = 'escolha' and not (gosto_id = any (p_ids));
    insert into public.perfil_gostos (usuario_id, gosto_id, origem, peso)
    select auth.uid(), g.id, 'escolha', 3 from public.gostos g where g.id = any (p_ids) and g.ativo
    on conflict (usuario_id, gosto_id) do update set origem = 'escolha', peso = greatest(public.perfil_gostos.peso, 3), atualizado_em = now();
  end if;
  update public.perfis set vibe_inicial_em = now() where id = auth.uid();
  return v;
end $$;
grant execute on function public.salvar_meus_gostos(smallint[]) to authenticated;

create or replace function public.salvar_gostos_estab(p_estab uuid, p_ids smallint[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'G1001') then raise exception 'Sem permissão para editar o perfil deste lugar.'; end if;
  delete from public.estabelecimento_gostos where estabelecimento_id = p_estab and not (gosto_id = any (coalesce(p_ids, '{}')));
  insert into public.estabelecimento_gostos (estabelecimento_id, gosto_id)
  select p_estab, g.id from public.gostos g where g.id = any (coalesce(p_ids, '{}')) on conflict do nothing;
end $$;
grant execute on function public.salvar_gostos_estab(uuid, smallint[]) to authenticated;

-- ============================================================
-- Status agora (equipe): movimento e música tocando, cada um com o seu horário
-- ============================================================
alter table public.movimento_informado alter column nivel drop not null;
alter table public.movimento_informado add column if not exists musica text check (musica is null or length(musica) <= 80);
alter table public.movimento_informado add column if not exists musica_em timestamptz;
alter table public.movimento_informado add column if not exists musica_por uuid references auth.users(id) on delete set null;

-- p_movimento / p_musica: null = não mexe; '' = apaga.
create or replace function public.informar_agora(p_estab uuid, p_movimento text default null, p_musica text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_usar(p_estab, 'T5002') then raise exception 'Sem permissão para atualizar o status deste lugar.'; end if;
  if p_movimento is not null and p_movimento not in ('', 'tranquilo', 'moderado', 'cheio') then raise exception 'Movimento inválido.'; end if;
  insert into public.movimento_informado (estabelecimento_id, nivel, informado_por, informado_em, musica, musica_em, musica_por)
  values (p_estab, nullif(p_movimento, ''), auth.uid(), now(), nullif(btrim(p_musica), ''),
          case when p_musica is not null then now() end, case when p_musica is not null then auth.uid() end)
  on conflict (estabelecimento_id) do update set
    nivel = case when p_movimento is null then public.movimento_informado.nivel else nullif(p_movimento, '') end,
    informado_por = case when p_movimento is null then public.movimento_informado.informado_por else auth.uid() end,
    informado_em = case when p_movimento is null then public.movimento_informado.informado_em else now() end,
    musica = case when p_musica is null then public.movimento_informado.musica else left(nullif(btrim(p_musica), ''), 80) end,
    musica_em = case when p_musica is null then public.movimento_informado.musica_em else now() end,
    musica_por = case when p_musica is null then public.movimento_informado.musica_por else auth.uid() end;
end $$;
grant execute on function public.informar_agora(uuid, text, text) to authenticated;

-- ============================================================
-- Presença (check-in) com visibilidade e saída
-- ============================================================
alter table public.checkins add column if not exists visibilidade text not null default 'amigos';
alter table public.checkins drop constraint if exists checkins_visibilidade_ok;
alter table public.checkins add constraint checkins_visibilidade_ok check (visibilidade in ('publico', 'amigos', 'privado'));
alter table public.checkins add column if not exists saiu_em timestamptz;
create index if not exists checkins_presentes_idx on public.checkins (estabelecimento_id, criado_em desc) where saiu_em is null;

-- Sinal rápido de quem está no lugar: "Como está o movimento?"
create table if not exists public.sinais_movimento (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nivel text not null check (nivel in ('tranquilo', 'moderado', 'cheio')),
  criado_em timestamptz not null default now()
);
create index if not exists sinais_movimento_estab_idx on public.sinais_movimento (estabelecimento_id, criado_em desc);
alter table public.sinais_movimento enable row level security;
drop policy if exists sinais_movimento_ler on public.sinais_movimento;
create policy sinais_movimento_ler on public.sinais_movimento for select to authenticated
  using (usuario_id = auth.uid() or public.eh_membro(estabelecimento_id));

-- Presença válida: até 4 h depois do check-in, se a pessoa não tocou em "Saí".
create or replace function public.presente(c public.checkins)
returns boolean language sql stable as $$
  select c.saiu_em is null and c.criado_em > now() - interval '4 hours';
$$;

drop function if exists public.fazer_checkin(uuid, double precision, double precision, text, boolean);
create or replace function public.fazer_checkin(
  p_estab uuid, p_lat double precision, p_lng double precision, p_movimento text, p_vibe_confere boolean,
  p_visibilidade text default 'amigos'
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lat double precision; v_lng double precision; v_dist double precision; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para fazer check-in.'; end if;
  if coalesce(p_visibilidade, 'amigos') not in ('publico', 'amigos', 'privado') then raise exception 'Escolha quem pode ver seu check-in.'; end if;
  select latitude, longitude into v_lat, v_lng from public.estabelecimentos where id = p_estab and situacao = 'aprovado';
  if not found then raise exception 'Lugar não encontrado.'; end if;
  if v_lat is not null and v_lng is not null then
    if p_lat is null or p_lng is null then raise exception 'Permita a localização para fazer check-in.'; end if;
    v_dist := public.distancia_m(p_lat, p_lng, v_lat, v_lng);
    if v_dist > 300 then
      raise exception 'Você precisa estar no local para fazer check-in (está a % m).', round(v_dist)::int;
    end if;
  end if;
  if exists (select 1 from public.checkins c where c.usuario_id = auth.uid() and c.estabelecimento_id = p_estab
              and c.saiu_em is null and c.criado_em > now() - interval '3 hours') then
    raise exception 'Você já fez check-in aqui nas últimas 3 horas.';
  end if;
  -- Quem faz check-in num lugar saiu dos outros.
  update public.checkins set saiu_em = now()
   where usuario_id = auth.uid() and saiu_em is null and criado_em > now() - interval '4 hours' and estabelecimento_id <> p_estab;
  insert into public.checkins (usuario_id, estabelecimento_id, movimento, vibe_confere, distancia_m, visibilidade)
  values (auth.uid(), p_estab, nullif(p_movimento, ''), p_vibe_confere, round(v_dist)::int, coalesce(p_visibilidade, 'amigos'))
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.fazer_checkin(uuid, double precision, double precision, text, boolean, text) to authenticated;

create or replace function public.minha_presenca(p_estab uuid)
returns table (checkin_id uuid, visibilidade text, desde timestamptz, ate timestamptz)
language sql stable security definer set search_path = public as $$
  select c.id, c.visibilidade, c.criado_em, c.criado_em + interval '4 hours'
    from public.checkins c
   where c.usuario_id = auth.uid() and c.estabelecimento_id = p_estab and public.presente(c)
   order by c.criado_em desc limit 1;
$$;
grant execute on function public.minha_presenca(uuid) to authenticated;

create or replace function public.mudar_presenca(p_estab uuid, p_visibilidade text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_visibilidade not in ('publico', 'amigos', 'privado') then raise exception 'Opção inválida.'; end if;
  update public.checkins c set visibilidade = p_visibilidade
   where c.usuario_id = auth.uid() and c.estabelecimento_id = p_estab and public.presente(c);
  if not found then raise exception 'Você não está com check-in ativo aqui.'; end if;
end $$;
grant execute on function public.mudar_presenca(uuid, text) to authenticated;

create or replace function public.sair_do_lugar(p_estab uuid)
returns void language sql security definer set search_path = public as $$
  update public.checkins c set saiu_em = now()
   where c.usuario_id = auth.uid() and c.estabelecimento_id = p_estab and public.presente(c);
$$;
grant execute on function public.sair_do_lugar(uuid) to authenticated;

-- Onde estou agora (para o hub "no rolê").
create or replace function public.onde_estou()
returns table (estabelecimento_id uuid, nome text, logo_url text, desde timestamptz, visibilidade text)
language sql stable security definer set search_path = public as $$
  select c.estabelecimento_id, e.nome, e.logo_url, c.criado_em, c.visibilidade
    from public.checkins c join public.estabelecimentos e on e.id = c.estabelecimento_id
   where c.usuario_id = auth.uid() and public.presente(c)
   order by c.criado_em desc limit 1;
$$;
grant execute on function public.onde_estou() to authenticated;

create or replace function public.confirmar_movimento(p_estab uuid, p_nivel text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_nivel not in ('tranquilo', 'moderado', 'cheio') then raise exception 'Movimento inválido.'; end if;
  if not exists (select 1 from public.checkins c where c.usuario_id = auth.uid() and c.estabelecimento_id = p_estab and public.presente(c)) then
    raise exception 'Só quem está no lugar (com check-in) pode informar o movimento.';
  end if;
  if exists (select 1 from public.sinais_movimento s where s.usuario_id = auth.uid() and s.estabelecimento_id = p_estab
              and s.criado_em > now() - interval '20 minutes') then
    raise exception 'Você já informou há pouco. Obrigado!';
  end if;
  insert into public.sinais_movimento (estabelecimento_id, nivel) values (p_estab, p_nivel);
end $$;
grant execute on function public.confirmar_movimento(uuid, text) to authenticated;

-- Pessoas que eu sigo presentes nos lugares.
-- Com nome: quem marcou "público" e eu sigo, ou "amigos" e nos seguimos.
-- Sem nome (só número): as demais que eu sigo — e só quando o lugar tem 3+ presenças, para não dar para adivinhar.
create or replace function public.presenca_amigos(p_ids uuid[])
returns table (estabelecimento_id uuid, pessoas jsonb, identificados int, anonimos int, presentes int)
language sql stable security definer set search_path = public as $$
  with ult as (
    select distinct on (c.estabelecimento_id, c.usuario_id) c.estabelecimento_id, c.usuario_id, c.visibilidade, c.criado_em
      from public.checkins c
     where c.estabelecimento_id = any (p_ids) and c.saiu_em is null and c.criado_em > now() - interval '4 hours'
     order by c.estabelecimento_id, c.usuario_id, c.criado_em desc
  ), tot as (
    select u.estabelecimento_id, count(*)::int n from ult u group by 1
  ), meus as (
    select u.*, public.segue(u.usuario_id, auth.uid()) volta
      from ult u
      join public.perfis p on p.id = u.usuario_id and not p.suspenso
     where auth.uid() is not null and u.usuario_id <> auth.uid()
       and public.segue(auth.uid(), u.usuario_id)
       and not public.bloqueado_entre(u.usuario_id, auth.uid())
  ), marcados as (
    select m.*, (m.visibilidade = 'publico' or (m.visibilidade = 'amigos' and m.volta)) com_nome from meus m
  )
  select t.estabelecimento_id,
         coalesce((select jsonb_agg(jsonb_build_object('id', p.id, 'nome', public.nome_curto(p.id), 'usuario', p.usuario, 'foto_url', p.foto_url)
                                    order by x.volta desc, x.criado_em desc)
                     from (select * from marcados m where m.estabelecimento_id = t.estabelecimento_id and m.com_nome
                            order by m.volta desc, m.criado_em desc limit 5) x
                     join public.perfis p on p.id = x.usuario_id), '[]'::jsonb),
         (select count(*)::int from marcados m where m.estabelecimento_id = t.estabelecimento_id and m.com_nome),
         case when t.n >= 3 then (select count(*)::int from marcados m where m.estabelecimento_id = t.estabelecimento_id and not m.com_nome) else 0 end,
         t.n
    from tot t;
$$;
grant execute on function public.presenca_amigos(uuid[]) to authenticated;

-- ============================================================
-- "Como está agora": tudo de um lugar numa chamada, com origem, horário e confiança
-- ============================================================
create or replace function public.agora_no_lugar(p_estab uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_mi public.movimento_informado;
  v_eq_min numeric;
  v_n int; v_moda text; v_moda_n int; v_ult_com timestamptz;
  v_mov jsonb; v_musica jsonb; v_prevista jsonb; v_estilos jsonb; v_hoje jsonb; v_amigos jsonb;
  v_hoje_ini timestamptz := (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo';
begin
  if not public.estab_visivel(p_estab) and not public.eh_membro(p_estab) then return null; end if;
  select * into v_mi from public.movimento_informado where estabelecimento_id = p_estab;
  v_eq_min := case when v_mi.nivel is not null then extract(epoch from now() - v_mi.informado_em) / 60 end;

  -- Comunidade: check-ins e sinais dos últimos 90 min.
  with s as (
    select c.movimento nivel, c.criado_em from public.checkins c
     where c.estabelecimento_id = p_estab and c.movimento is not null and c.criado_em > now() - interval '90 minutes'
    union all
    select m.nivel, m.criado_em from public.sinais_movimento m
     where m.estabelecimento_id = p_estab and m.criado_em > now() - interval '90 minutes'
  )
  select count(*)::int, max(criado_em) into v_n, v_ult_com from s;
  if v_n > 0 then
    select x.nivel, count(*)::int into v_moda, v_moda_n from (
      select c.movimento nivel from public.checkins c
       where c.estabelecimento_id = p_estab and c.movimento is not null and c.criado_em > now() - interval '90 minutes'
      union all
      select m.nivel from public.sinais_movimento m where m.estabelecimento_id = p_estab and m.criado_em > now() - interval '90 minutes'
    ) x group by x.nivel order by count(*) desc, max(case x.nivel when 'cheio' then 3 when 'moderado' then 2 else 1 end) desc limit 1;
  end if;

  if v_eq_min is not null and v_eq_min <= 60 then
    v_mov := jsonb_build_object('nivel', v_mi.nivel, 'fonte', 'equipe', 'em', v_mi.informado_em, 'confianca', 'alta', 'respostas', v_n);
  elsif v_n >= 2 then
    v_mov := jsonb_build_object('nivel', v_moda, 'fonte', 'comunidade', 'em', v_ult_com, 'respostas', v_n,
      'confianca', case when v_n >= 3 and v_moda_n::numeric / v_n >= 0.6 then 'alta' else 'media' end);
  elsif v_eq_min is not null and v_eq_min <= 180 then
    v_mov := jsonb_build_object('nivel', v_mi.nivel, 'fonte', 'equipe', 'em', v_mi.informado_em, 'confianca', 'media', 'respostas', v_n);
  elsif v_n = 1 then
    v_mov := jsonb_build_object('nivel', v_moda, 'fonte', 'comunidade', 'em', v_ult_com, 'confianca', 'baixa', 'respostas', 1);
  else
    v_mov := jsonb_build_object('nivel', null, 'ultimo_em', (
      select max(t) from (
        select v_mi.informado_em t where v_mi.nivel is not null
        union all select max(c.criado_em) from public.checkins c where c.estabelecimento_id = p_estab and c.movimento is not null
        union all select max(m.criado_em) from public.sinais_movimento m where m.estabelecimento_id = p_estab) z));
  end if;

  v_musica := case when v_mi.musica is not null and v_mi.musica_em > now() - interval '3 hours'
                   then jsonb_build_object('texto', v_mi.musica, 'em', v_mi.musica_em, 'fonte', 'equipe') end;

  select coalesce(jsonb_agg(jsonb_build_object('id', e.id, 'nome', e.nome, 'inicio', e.inicio, 'fim', e.fim, 'entrada', e.entrada,
                                               'capa_url', e.capa_url,
                                               'estilos', (select coalesce(jsonb_agg(g.nome order by g.ordem), '[]'::jsonb) from public.gostos g where g.id = any (e.gostos)))
                            order by e.inicio), '[]'::jsonb)
    into v_hoje
    from public.eventos e
   where e.estabelecimento_id = p_estab and e.situacao = 'publicado'
     and ((e.inicio >= v_hoje_ini and e.inicio < v_hoje_ini + interval '1 day')
          or (e.inicio < now() and coalesce(e.fim, e.inicio + interval '6 hours') > now()));

  select coalesce(jsonb_agg(g.nome order by g.ordem), '[]'::jsonb) into v_estilos
    from public.estabelecimento_gostos eg join public.gostos g on g.id = eg.gosto_id
   where eg.estabelecimento_id = p_estab and g.tipo = 'musica';

  select coalesce(jsonb_agg(distinct x), '[]'::jsonb) into v_prevista
    from (select jsonb_array_elements_text(ev -> 'estilos') x from jsonb_array_elements(v_hoje) ev) z;

  select to_jsonb(a) - 'estabelecimento_id' into v_amigos from public.presenca_amigos(array[p_estab]) a;

  return jsonb_build_object(
    'movimento', v_mov,
    'musica_agora', v_musica,
    'musica_prevista', case when jsonb_array_length(v_prevista) > 0 then v_prevista else v_estilos end,
    'prevista_de', case when jsonb_array_length(v_prevista) > 0 then 'programacao' when jsonb_array_length(v_estilos) > 0 then 'estilos_da_casa' end,
    'estilos_da_casa', v_estilos,
    'hoje', v_hoje,
    'amigos', coalesce(v_amigos, jsonb_build_object('pessoas', '[]'::jsonb, 'identificados', 0, 'anonimos', 0, 'presentes', 0)),
    'agora', now()
  );
end $$;
grant execute on function public.agora_no_lugar(uuid) to anon, authenticated;

grant select on public.gostos, public.estabelecimento_gostos to anon, authenticated;
grant select on public.perfil_gostos, public.sinais_movimento to authenticated;
grant select, insert, update, delete on public.estabelecimento_gostos to authenticated;

select 'Atualização 031 aplicada: Como está agora, presença de amigos e gostos.' as resultado;
