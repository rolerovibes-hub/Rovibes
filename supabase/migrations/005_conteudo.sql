-- RoVibes · 005 · Conteúdo: publicações, curtidas, stories, visitas e indicadores.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Publicações (G6001)
-- ============================================================
create table if not exists public.publicacoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  texto text check (texto is null or length(texto) <= 1000),
  foto_url text,
  evento_id uuid references public.eventos(id) on delete set null,
  situacao text not null default 'publicada' check (situacao in ('publicada', 'oculta')),
  criado_em timestamptz not null default now(),
  check (coalesce(btrim(texto), '') <> '' or foto_url is not null)
);
create index if not exists publicacoes_data_idx on public.publicacoes (criado_em desc);
create index if not exists publicacoes_estab_idx on public.publicacoes (estabelecimento_id, criado_em desc);

create table if not exists public.curtidas (
  publicacao_id uuid not null references public.publicacoes(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (publicacao_id, usuario_id)
);

alter table public.publicacoes enable row level security;
alter table public.curtidas enable row level security;

drop policy if exists pub_ler on public.publicacoes;
create policy pub_ler on public.publicacoes for select
  using ((situacao = 'publicada' and public.estab_visivel(estabelecimento_id))
         or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists pub_gerir on public.publicacoes;
create policy pub_gerir on public.publicacoes for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G6001')) with check (public.pode_usar(estabelecimento_id, 'G6001'));

drop policy if exists curtidas_minhas on public.curtidas;
create policy curtidas_minhas on public.curtidas for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Total de curtidas e se eu curti, para várias publicações de uma vez.
create or replace function public.curtidas_de(p_ids uuid[])
returns table (publicacao_id uuid, total int, eu boolean)
language sql stable security definer set search_path = public as $$
  select p.id, count(c.usuario_id)::int, coalesce(bool_or(c.usuario_id = auth.uid()), false)
    from public.publicacoes p left join public.curtidas c on c.publicacao_id = p.id
   where p.id = any (p_ids)
   group by p.id;
$$;

-- ============================================================
-- Stories (G6002): somem depois de 24 horas
-- ============================================================
create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  foto_url text not null,
  legenda text check (legenda is null or length(legenda) <= 200),
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_ativos_idx on public.stories (expira_em desc);

create table if not exists public.visualizacoes_story (
  story_id uuid not null references public.stories(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visto_em timestamptz not null default now(),
  primary key (story_id, usuario_id)
);

alter table public.stories enable row level security;
alter table public.visualizacoes_story enable row level security;

drop policy if exists stories_ler on public.stories;
create policy stories_ler on public.stories for select
  using ((expira_em > now() and public.estab_visivel(estabelecimento_id))
         or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists stories_gerir on public.stories;
create policy stories_gerir on public.stories for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G6002')) with check (public.pode_usar(estabelecimento_id, 'G6002'));

drop policy if exists vistos_meus on public.visualizacoes_story;
create policy vistos_meus on public.visualizacoes_story for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Visualizações por story, só para a equipe do estabelecimento.
create or replace function public.vistas_de_stories(p_estab uuid)
returns table (story_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select s.id, count(v.usuario_id)::int
    from public.stories s left join public.visualizacoes_story v on v.story_id = s.id
   where s.estabelecimento_id = p_estab and public.eh_membro(p_estab)
   group by s.id;
$$;

-- ============================================================
-- Visitas à página do lugar (uma por pessoa por dia)
-- ============================================================
create table if not exists public.visitas_lugar (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  dia date not null default current_date,
  primary key (estabelecimento_id, usuario_id, dia)
);
alter table public.visitas_lugar enable row level security;

create or replace function public.registrar_visita(p_estab uuid)
returns void language sql security definer set search_path = public as $$
  insert into public.visitas_lugar (estabelecimento_id, usuario_id)
  select p_estab, auth.uid() where auth.uid() is not null and public.estab_visivel(p_estab)
  on conflict do nothing;
$$;

-- ============================================================
-- Indicadores (C8001)
-- ============================================================
create or replace function public.indicadores(p_estab uuid)
returns table (indicador text, hoje numeric, sete_dias numeric, trinta_dias numeric)
language plpgsql stable security definer set search_path = public as $$
declare
  h timestamptz := date_trunc('day', now());
  d7 timestamptz := now() - interval '7 days';
  d30 timestamptz := now() - interval '30 days';
begin
  if not public.pode_usar(p_estab, 'C8001') then
    raise exception 'Sem acesso aos indicadores deste estabelecimento.';
  end if;
  return query
  select 'Visitas à página'::text,
         (select count(*) from visitas_lugar where estabelecimento_id = p_estab and dia >= h::date)::numeric,
         (select count(*) from visitas_lugar where estabelecimento_id = p_estab and dia >= d7::date)::numeric,
         (select count(*) from visitas_lugar where estabelecimento_id = p_estab and dia >= d30::date)::numeric
  union all
  select 'Check-ins',
         (select count(*) from checkins where estabelecimento_id = p_estab and criado_em >= h),
         (select count(*) from checkins where estabelecimento_id = p_estab and criado_em >= d7),
         (select count(*) from checkins where estabelecimento_id = p_estab and criado_em >= d30)
  union all
  select 'Novos seguidores',
         (select count(*) from seguidores where estabelecimento_id = p_estab and criado_em >= h),
         (select count(*) from seguidores where estabelecimento_id = p_estab and criado_em >= d7),
         (select count(*) from seguidores where estabelecimento_id = p_estab and criado_em >= d30)
  union all
  select 'Vezes que foi salvo',
         (select count(*) from salvos where estabelecimento_id = p_estab and criado_em >= h),
         (select count(*) from salvos where estabelecimento_id = p_estab and criado_em >= d7),
         (select count(*) from salvos where estabelecimento_id = p_estab and criado_em >= d30)
  union all
  select 'Curtidas nas publicações',
         (select count(*) from curtidas c join publicacoes p on p.id = c.publicacao_id where p.estabelecimento_id = p_estab and c.criado_em >= h),
         (select count(*) from curtidas c join publicacoes p on p.id = c.publicacao_id where p.estabelecimento_id = p_estab and c.criado_em >= d7),
         (select count(*) from curtidas c join publicacoes p on p.id = c.publicacao_id where p.estabelecimento_id = p_estab and c.criado_em >= d30)
  union all
  select 'Visualizações de stories',
         (select count(*) from visualizacoes_story v join stories s on s.id = v.story_id where s.estabelecimento_id = p_estab and v.visto_em >= h),
         (select count(*) from visualizacoes_story v join stories s on s.id = v.story_id where s.estabelecimento_id = p_estab and v.visto_em >= d7),
         (select count(*) from visualizacoes_story v join stories s on s.id = v.story_id where s.estabelecimento_id = p_estab and v.visto_em >= d30)
  union all
  select 'Avaliações recebidas',
         (select count(*) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= h),
         (select count(*) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= d7),
         (select count(*) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= d30)
  union all
  select 'Nota média',
         (select round(avg(nota), 1) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= h),
         (select round(avg(nota), 1) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= d7),
         (select round(avg(nota), 1) from avaliacoes where estabelecimento_id = p_estab and atualizado_em >= d30);
end $$;

-- Check-ins por dia nos últimos 14 dias, para o gráfico dos indicadores.
create or replace function public.checkins_por_dia(p_estab uuid)
returns table (dia date, total int)
language sql stable security definer set search_path = public as $$
  select d::date, count(c.id)::int
    from generate_series(current_date - 13, current_date, interval '1 day') d
    left join public.checkins c on c.estabelecimento_id = p_estab and c.criado_em::date = d::date
   where public.pode_usar(p_estab, 'C8001')
   group by d order by d;
$$;

-- ============================================================
-- Fotos: publicações e stories também podem enviar para a pasta do estabelecimento
-- ============================================================
create or replace function public.pode_enviar_midia(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'G1001') or public.pode_usar(p_estab, 'G4001') or public.pode_usar(p_estab, 'G5001')
      or public.pode_usar(p_estab, 'G6001') or public.pode_usar(p_estab, 'G6002');
$$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    execute 'drop policy if exists "estab fotos enviar" on storage.objects';
    execute $p$create policy "estab fotos enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'estabelecimentos' and public.pode_enviar_midia(((storage.foldername(name))[1])::uuid))$p$;
    execute 'drop policy if exists "estab fotos apagar" on storage.objects';
    execute $p$create policy "estab fotos apagar" on storage.objects for delete to authenticated
      using (bucket_id = 'estabelecimentos' and public.pode_enviar_midia(((storage.foldername(name))[1])::uuid))$p$;
  end if;
end $$;

grant execute on function public.curtidas_de(uuid[]) to anon, authenticated;

select 'RoVibes 005 aplicado com sucesso' as resultado;
