-- 054 · Carrossel de fotos, música nas fotos, hashtags pela vibe do lugar e biblioteca de músicas livres.

-- ============================================================
-- Carrossel e hashtags nas publicações de pessoas
-- ============================================================
alter table public.publicacoes_pessoas add column if not exists fotos text[];
alter table public.publicacoes_pessoas add column if not exists tags text[] not null default '{}';
alter table public.stories_pessoas add column if not exists tags text[] not null default '{}';

do $$ begin
  alter table public.publicacoes_pessoas add constraint publicacoes_pessoas_fotos_check check (fotos is null or cardinality(fotos) between 1 and 10);
exception when duplicate_object then null; end $$;

create index if not exists publicacoes_pessoas_tags_idx on public.publicacoes_pessoas using gin (tags);
create index if not exists stories_pessoas_tags_idx on public.stories_pessoas using gin (tags);

-- "#Happy Hour" → "happyhour"; "Música ao vivo" → "musicaaovivo".
create or replace function public.tag_normal(p text)
returns text language sql immutable set search_path = public as $$
  select nullif(left(regexp_replace(
           translate(lower(btrim(coalesce(p, ''))), 'áàâãäéèêëíìîïóòôõöúùûüçñ', 'aaaaaeeeeiiiiooooouuuucn'),
           '[^a-z0-9_]', '', 'g'), 30), '');
$$;

-- Junta as hashtags escolhidas com as escritas na legenda, sem repetir (até 10).
create or replace function public.tags_da_publicacao()
returns trigger language plpgsql set search_path = public as $$
declare v_texto text;
begin
  v_texto := coalesce(to_jsonb(new) ->> 'texto', to_jsonb(new) ->> 'legenda');
  new.tags := coalesce((
    select array_agg(t order by primeira) from (
      select t, min(ordem) primeira from (
        select public.tag_normal(x) t, o ordem from unnest(coalesce(new.tags, '{}')) with ordinality as u(x, o)
        union all
        select public.tag_normal(m[1]), 100 + row_number() over () from regexp_matches(coalesce(v_texto, ''), '#([[:alnum:]_À-ÿ]+)', 'g') m
      ) a where t is not null and length(t) >= 2 group by t order by min(ordem) limit 10) b), '{}');
  return new;
end $$;
drop trigger if exists tags_publicacao on public.publicacoes_pessoas;
create trigger tags_publicacao before insert or update of tags, texto on public.publicacoes_pessoas
for each row execute function public.tags_da_publicacao();
drop trigger if exists tags_story on public.stories_pessoas;
create trigger tags_story before insert or update of tags, legenda on public.stories_pessoas
for each row execute function public.tags_da_publicacao();

-- Sugestões de hashtags: a vibe e o estilo do lugar marcado, e as mais usadas lá.
-- Sem lugar: as que estão em alta na última semana.
create or replace function public.sugerir_tags(p_local uuid default null)
returns table (tag text, origem text)
language sql stable security definer set search_path = public as $$
  with s as (
    select public.tag_normal(v.nome) tag, 'vibe' origem, 1 ordem
      from public.estabelecimento_vibes ev join public.vibes v on v.id = ev.vibe_id
     where ev.estabelecimento_id = p_local and v.ativa
    union all
    select public.tag_normal(g.nome), 'gosto', 2
      from public.estabelecimento_gostos eg join public.gostos g on g.id = eg.gosto_id
     where eg.estabelecimento_id = p_local and g.ativo
    union all
    select public.tag_normal(c.nome), 'lugar', 3
      from public.estabelecimentos e join public.categorias c on c.id = e.categoria_id where e.id = p_local
    union all
    select public.tag_normal(e.bairro), 'lugar', 4 from public.estabelecimentos e where e.id = p_local and e.bairro is not null
    union all
    select x.tag, 'usada', 5 from (
      select unnest(p.tags) tag, count(*) n from public.publicacoes_pessoas p
       where p_local is not null and p.estabelecimento_id = p_local and not p.oculto and p.criado_em > now() - interval '60 days'
       group by 1 order by 2 desc limit 8) x
    union all
    select x.tag, 'alta', 6 from (
      select unnest(p.tags) tag, count(distinct p.usuario_id) n from public.publicacoes_pessoas p
       where p_local is null and not p.oculto and p.criado_em > now() - interval '7 days'
       group by 1 order by 2 desc limit 12) x
  )
  select tag, (array_agg(origem order by ordem))[1]
    from s where tag is not null and length(tag) >= 2
   group by tag
   order by min(ordem), tag
   limit 16;
$$;

-- ============================================================
-- VibeCut: recomendação também pelas hashtags que combinam com a pessoa
-- (os gostos dela e as hashtags do que ela brindou nos últimos 60 dias)
-- ============================================================
drop function if exists public.vibecuts(text, double precision, double precision, int, int, uuid);
create function public.vibecuts(p_modo text, p_lat double precision default null, p_lng double precision default null,
                                p_inicio int default 0, p_limite int default 10, p_local uuid default null)
returns table (id uuid, video_url text, foto_url text, texto text, criado_em timestamptz, autor jsonb, local jsonb,
               musica jsonb, tocando_agora text, curtidas int, curti boolean, comentarios int, ao_vivo boolean, distancia_km numeric, tags text[])
language sql stable security definer set search_path = public as $$
  with interesse as (
    select coalesce(array_agg(distinct t), '{}') tags from (
      select public.tag_normal(g.nome) t from public.perfil_gostos pg join public.gostos g on g.id = pg.gosto_id where pg.usuario_id = auth.uid()
      union all
      select unnest(p.tags) from public.curtidas_pessoas c join public.publicacoes_pessoas p on p.id = c.publicacao_id
       where c.usuario_id = auth.uid() and p.criado_em > now() - interval '60 days'
    ) x where t is not null
  ),
  base as (
    select p.*, e.nome as e_nome, e.logo_url as e_logo, e.latitude as e_lat, e.longitude as e_lng,
           (p.estabelecimento_id is not null and p.criado_em > now() - interval '2 hours') as vivo,
           case when p_lat is not null and p_lng is not null and e.latitude is not null and e.longitude is not null then
             round((6371 * 2 * asin(sqrt(power(sin(radians(e.latitude - p_lat) / 2), 2)
                   + cos(radians(p_lat)) * cos(radians(e.latitude)) * power(sin(radians(e.longitude - p_lng) / 2), 2))))::numeric, 1)
           end as dist,
           (select count(*)::int from public.curtidas_pessoas c where c.publicacao_id = p.id) as n_brindes
      from public.publicacoes_pessoas p
      left join public.estabelecimentos e on e.id = p.estabelecimento_id and public.estab_visivel(e.id)
     where p.video_url is not null and not p.oculto
       and p.criado_em > now() - interval '30 days'
       and (p_local is null or p.estabelecimento_id = p_local)
       and public.ve_publicacoes_de(p.usuario_id)
       and not exists (select 1 from public.bloqueios b where (b.bloqueador_id = auth.uid() and b.bloqueado_id = p.usuario_id)
                                                        or (b.bloqueador_id = p.usuario_id and b.bloqueado_id = auth.uid()))
  ),
  pontuado as (
    select b.*,
           (case when b.vivo then 3 else 0 end)
           + ln(1 + b.n_brindes)
           + (case when exists (select 1 from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = b.usuario_id and s.situacao = 'ativo') then 2 else 0 end)
           + (case when b.estabelecimento_id is not null and exists (
                select 1 from public.estabelecimento_gostos eg join public.perfil_gostos pg on pg.gosto_id = eg.gosto_id
                 where eg.estabelecimento_id = b.estabelecimento_id and pg.usuario_id = auth.uid()) then 1 else 0 end)
           + least(2, 0.75 * coalesce(cardinality(array(select unnest(b.tags) intersect select unnest(i.tags))), 0))
           - extract(epoch from (now() - b.criado_em)) / 86400.0 as pontos
      from base b cross join interesse i
     where p_modo <> 'ao_vivo' or b.vivo
  )
  select x.id, x.video_url, x.foto_url, x.texto, x.criado_em,
         jsonb_build_object('id', a.id, 'nome', a.nome, 'usuario', a.usuario, 'foto_url', a.foto_url),
         case when x.estabelecimento_id is not null and x.e_nome is not null then
           jsonb_build_object('id', x.estabelecimento_id, 'nome', x.e_nome, 'logo_url', x.e_logo, 'latitude', x.e_lat, 'longitude', x.e_lng) end,
         (select jsonb_build_object('id', m.id, 'titulo', m.titulo, 'artista', m.artista, 'licenca', m.licenca) from public.musicas m where m.id = x.musica_id),
         (select mi.musica from public.movimento_informado mi
           where mi.estabelecimento_id = x.estabelecimento_id and mi.musica is not null and mi.musica_em > now() - interval '3 hours'),
         x.n_brindes,
         exists (select 1 from public.curtidas_pessoas c where c.publicacao_id = x.id and c.usuario_id = auth.uid()),
         (select count(*)::int from public.comentarios c where c.publicacao_pessoa_id = x.id and not c.apagado),
         x.vivo, x.dist, x.tags
    from pontuado x join public.perfis a on a.id = x.usuario_id
   order by
     case when p_modo = 'ao_vivo' then coalesce(x.dist, 9999) end asc nulls last,
     case when p_modo = 'ao_vivo' then extract(epoch from x.criado_em) end desc,
     case when p_modo <> 'ao_vivo' then x.pontos end desc,
     x.criado_em desc
   offset greatest(coalesce(p_inicio, 0), 0)
   limit least(coalesce(p_limite, 10), 30);
$$;

-- ============================================================
-- Biblioteca de músicas: origem e créditos (faixas livres importadas pela Gestão)
-- ============================================================
alter table public.musicas add column if not exists fonte text;
alter table public.musicas add column if not exists fonte_id text;
alter table public.musicas add column if not exists link text;
alter table public.musicas add column if not exists creditos text;
create unique index if not exists musicas_fonte_idx on public.musicas (fonte, fonte_id) where fonte_id is not null;

revoke execute on function public.sugerir_tags(uuid), public.vibecuts(text, double precision, double precision, int, int, uuid) from public, anon;
grant execute on function public.sugerir_tags(uuid), public.vibecuts(text, double precision, double precision, int, int, uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 054 aplicada: carrossel, música nas fotos, hashtags e músicas livres.' as resultado;
