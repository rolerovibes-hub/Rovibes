-- RoVibes · 004 · Presença: salvos, seguidores, check-ins, movimento agora e avaliações.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Salvos e seguidores
-- ============================================================
create table if not exists public.salvos (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (usuario_id, estabelecimento_id)
);

create table if not exists public.seguidores (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (usuario_id, estabelecimento_id)
);
create index if not exists seguidores_estab_idx on public.seguidores (estabelecimento_id);

alter table public.salvos enable row level security;
alter table public.seguidores enable row level security;

drop policy if exists salvos_meus on public.salvos;
create policy salvos_meus on public.salvos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.estab_visivel(estabelecimento_id));

drop policy if exists seguidores_meus on public.seguidores;
create policy seguidores_meus on public.seguidores for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.estab_visivel(estabelecimento_id));

-- ============================================================
-- Check-ins (só perto do lugar, no máximo 1 a cada 3 horas)
-- ============================================================
create table if not exists public.checkins (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  movimento text check (movimento in ('tranquilo', 'moderado', 'cheio')),
  vibe_confere boolean,
  distancia_m int,
  criado_em timestamptz not null default now()
);
create index if not exists checkins_estab_idx on public.checkins (estabelecimento_id, criado_em desc);
create index if not exists checkins_usuario_idx on public.checkins (usuario_id, criado_em desc);

alter table public.checkins enable row level security;
-- A pessoa vê os próprios check-ins; a equipe vê os do seu estabelecimento. Gravação só pela função.
drop policy if exists checkins_ler on public.checkins;
create policy checkins_ler on public.checkins for select to authenticated
  using (usuario_id = auth.uid() or public.eh_membro(estabelecimento_id) or public.eh_admin());

create or replace function public.distancia_m(lat1 double precision, lng1 double precision, lat2 double precision, lng2 double precision)
returns double precision language sql immutable as $$
  select 6371000 * 2 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)));
$$;

create or replace function public.fazer_checkin(
  p_estab uuid, p_lat double precision, p_lng double precision, p_movimento text, p_vibe_confere boolean
) returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_lat double precision; v_lng double precision; v_dist double precision; v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para fazer check-in.'; end if;
  select latitude, longitude into v_lat, v_lng from public.estabelecimentos
   where id = p_estab and situacao = 'aprovado';
  if not found then raise exception 'Lugar não encontrado.'; end if;
  if v_lat is not null and v_lng is not null then
    if p_lat is null or p_lng is null then raise exception 'Permita a localização para fazer check-in.'; end if;
    v_dist := public.distancia_m(p_lat, p_lng, v_lat, v_lng);
    if v_dist > 300 then
      raise exception 'Você precisa estar no local para fazer check-in (está a % m).', round(v_dist)::int;
    end if;
  end if;
  if exists (select 1 from public.checkins where usuario_id = auth.uid() and estabelecimento_id = p_estab
              and criado_em > now() - interval '3 hours') then
    raise exception 'Você já fez check-in aqui nas últimas 3 horas.';
  end if;
  insert into public.checkins (usuario_id, estabelecimento_id, movimento, vibe_confere, distancia_m)
  values (auth.uid(), p_estab, nullif(p_movimento, ''), p_vibe_confere, round(v_dist)::int)
  returning id into v_id;
  return v_id;
end $$;

-- ============================================================
-- Movimento informado pelo estabelecimento (vale por 3 horas)
-- ============================================================
create table if not exists public.movimento_informado (
  estabelecimento_id uuid primary key references public.estabelecimentos(id) on delete cascade,
  nivel text not null check (nivel in ('tranquilo', 'moderado', 'cheio')),
  informado_por uuid references auth.users(id),
  informado_em timestamptz not null default now()
);
alter table public.movimento_informado enable row level security;
drop policy if exists movinf_ler on public.movimento_informado;
create policy movinf_ler on public.movimento_informado for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id));
drop policy if exists movinf_gerir on public.movimento_informado;
create policy movinf_gerir on public.movimento_informado for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'T5002')) with check (public.pode_usar(estabelecimento_id, 'T5002'));

-- ============================================================
-- Avaliações (só de quem fez check-in nos últimos 30 dias)
-- ============================================================
create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nota smallint not null check (nota between 1 and 5),
  comentario text check (comentario is null or length(comentario) <= 500),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (usuario_id, estabelecimento_id)
);
create index if not exists avaliacoes_estab_idx on public.avaliacoes (estabelecimento_id, atualizado_em desc);

create or replace function public.pode_avaliar(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.checkins where usuario_id = auth.uid() and estabelecimento_id = p_estab
                  and criado_em > now() - interval '30 days');
$$;

alter table public.avaliacoes enable row level security;
drop policy if exists aval_ler on public.avaliacoes;
create policy aval_ler on public.avaliacoes for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or usuario_id = auth.uid());
drop policy if exists aval_criar on public.avaliacoes;
create policy aval_criar on public.avaliacoes for insert to authenticated
  with check (usuario_id = auth.uid() and public.pode_avaliar(estabelecimento_id));
drop policy if exists aval_editar on public.avaliacoes;
create policy aval_editar on public.avaliacoes for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and public.pode_avaliar(estabelecimento_id));
drop policy if exists aval_apagar on public.avaliacoes;
create policy aval_apagar on public.avaliacoes for delete to authenticated using (usuario_id = auth.uid());

-- Avaliações com o primeiro nome de quem avaliou (o perfil completo continua privado).
create or replace function public.avaliacoes_do_lugar(p_estab uuid, p_limite int default 20)
returns table (id uuid, nota smallint, comentario text, atualizado_em timestamptz, autor text, minha boolean)
language sql stable security definer set search_path = public as $$
  select a.id, a.nota, a.comentario, a.atualizado_em, split_part(p.nome, ' ', 1), a.usuario_id = auth.uid()
    from public.avaliacoes a
    join public.perfis p on p.id = a.usuario_id
   where a.estabelecimento_id = p_estab and public.estab_visivel(p_estab)
   order by a.usuario_id = auth.uid() desc, a.atualizado_em desc
   limit least(p_limite, 50);
$$;

-- ============================================================
-- Resumo público por lugar: nota, movimento agora, pessoas nas últimas 2 h, seguidores
-- ============================================================
create or replace function public.resumo_lugares(p_ids uuid[] default null)
returns table (estabelecimento_id uuid, nota numeric, avaliacoes int, movimento text, pessoas_2h int, seguidores int)
language sql stable security definer set search_path = public as $$
  with alvo as (
    select e.id from public.estabelecimentos e
     where e.situacao = 'aprovado' and (p_ids is null or e.id = any (p_ids))
  ), notas as (
    select a.estabelecimento_id, round(avg(a.nota)::numeric, 1) nota, count(*)::int total
      from public.avaliacoes a join alvo on alvo.id = a.estabelecimento_id group by 1
  ), recentes as (
    select c.estabelecimento_id, count(*)::int pessoas,
           mode() within group (order by c.movimento) filter (where c.movimento is not null) moda,
           count(c.movimento)::int respostas
      from public.checkins c join alvo on alvo.id = c.estabelecimento_id
     where c.criado_em > now() - interval '2 hours' group by 1
  ), seg as (
    select s.estabelecimento_id, count(*)::int total
      from public.seguidores s join alvo on alvo.id = s.estabelecimento_id group by 1
  )
  select alvo.id, n.nota, coalesce(n.total, 0),
         coalesce(
           (select mi.nivel from public.movimento_informado mi
             where mi.estabelecimento_id = alvo.id and mi.informado_em > now() - interval '3 hours'),
           case when r.respostas >= 2 then r.moda end),
         coalesce(r.pessoas, 0), coalesce(sg.total, 0)
    from alvo
    left join notas n on n.estabelecimento_id = alvo.id
    left join recentes r on r.estabelecimento_id = alvo.id
    left join seg sg on sg.estabelecimento_id = alvo.id;
$$;

grant execute on function public.resumo_lugares(uuid[]) to anon, authenticated;
grant execute on function public.avaliacoes_do_lugar(uuid, int) to anon, authenticated;

select 'RoVibes 004 aplicado com sucesso' as resultado;
