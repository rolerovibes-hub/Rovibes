-- RoVibes 023: Busca única (um campo só). Lugares, eventos e pessoas na mesma lista,
-- ordenados pela semelhança com o texto (tolera erro de digitação e acentos) e pela proximidade.
-- Pode ser executado mais de uma vez.

create schema if not exists extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

-- Texto sem acento e em minúsculas (para comparar "Hamburgeria" com "hamburgueria").
create or replace function public.normalizar(t text)
returns text language sql immutable parallel safe set search_path = public, extensions as $$
  select lower(unaccent(coalesce(t, '')));
$$;

-- Nota de 0 a ~1,3: semelhança + bônus quando começa com o texto ou o contém.
create or replace function public.nota_texto(p_busca text, p_alvo text)
returns real language sql immutable parallel safe set search_path = public, extensions as $$
  select (greatest(similarity(p_busca, p_alvo), word_similarity(p_busca, p_alvo))
          + case when p_alvo like p_busca || '%' then 0.35
                 when p_alvo like '% ' || p_busca || '%' then 0.25
                 when p_alvo like '%' || p_busca || '%' then 0.15 else 0 end)::real;
$$;

create or replace function public.buscar_tudo(p_termo text, p_lat double precision, p_lng double precision)
returns table (tipo text, id uuid, titulo text, subtitulo text, imagem text, chave text, distancia_m double precision, pontos real, extra jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare t text := public.normalizar(btrim(ltrim(coalesce(p_termo, ''), '@')));
begin
  if length(t) < 2 then return; end if;
  return query
  with lugares as (
    select e.id, e.nome, e.bairro, e.logo_url, e.capa_url, c.nome as categoria,
           case when p_lat is not null and e.latitude is not null then public.distancia_m(p_lat, p_lng, e.latitude, e.longitude) end as dist,
           greatest(public.nota_texto(t, public.normalizar(e.nome)),
                    0.75 * public.nota_texto(t, public.normalizar(concat_ws(' ', c.nome, e.bairro,
                      (select string_agg(v.nome, ' ') from public.estabelecimento_vibes ev join public.vibes v on v.id = ev.vibe_id where ev.estabelecimento_id = e.id))))) as nota
      from public.estabelecimentos e left join public.categorias c on c.id = e.categoria_id
     where e.situacao = 'aprovado'
  ), eventos as (
    select ev.id, ev.nome, ev.inicio, ev.capa_url, e.nome as lugar, e.logo_url,
           case when p_lat is not null and e.latitude is not null then public.distancia_m(p_lat, p_lng, e.latitude, e.longitude) end as dist,
           greatest(public.nota_texto(t, public.normalizar(ev.nome)), 0.7 * public.nota_texto(t, public.normalizar(e.nome))) as nota
      from public.eventos ev join public.estabelecimentos e on e.id = ev.estabelecimento_id
     where e.situacao = 'aprovado' and ev.situacao = 'publicado' and coalesce(ev.fim, ev.inicio + interval '8 hours') > now()
  ), pessoas as (
    select p.id, p.nome, p.usuario, p.foto_url, p.privado,
           greatest(public.nota_texto(t, public.normalizar(p.nome)), public.nota_texto(t, lower(coalesce(p.usuario, '')))) as nota,
           (select s.situacao from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id) as sigo
      from public.perfis p
     where not p.suspenso and p.usuario is not null and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
       and not public.bloqueado_entre(p.id, auth.uid())
  )
  (select 'lugar'::text, l.id, l.nome, concat_ws(' · ', l.categoria, l.bairro), coalesce(l.logo_url, l.capa_url), l.id::text, l.dist,
          (l.nota + case when l.dist is not null then 0.25 / (1 + l.dist / 1000) else 0 end)::real, '{}'::jsonb
     from lugares l where l.nota >= 0.3 order by 8 desc limit 15)
  union all
  (select 'evento', v.id, v.nome, v.lugar, coalesce(v.capa_url, v.logo_url), v.id::text, v.dist,
          (v.nota + case when v.dist is not null then 0.2 / (1 + v.dist / 1000) else 0 end
                  + case when v.inicio < now() + interval '2 days' then 0.1 else 0 end)::real,
          jsonb_build_object('inicio', v.inicio)
     from eventos v where v.nota >= 0.3 order by 8 desc limit 15)
  union all
  (select 'pessoa', s.id, s.nome, '@' || s.usuario, s.foto_url, s.usuario, null::double precision,
          (s.nota + case when s.sigo = 'ativo' then 0.1 else 0 end)::real,
          jsonb_build_object('privado', s.privado, 'sigo', s.sigo)
     from pessoas s where s.nota >= 0.3 order by 8 desc limit 15);
end $$;

-- Busca rápida por nome: índices de trigramas.
create index if not exists estabelecimentos_nome_trgm on public.estabelecimentos using gin (public.normalizar(nome) extensions.gin_trgm_ops);
create index if not exists eventos_nome_trgm on public.eventos using gin (public.normalizar(nome) extensions.gin_trgm_ops);
create index if not exists perfis_nome_trgm on public.perfis using gin (public.normalizar(nome) extensions.gin_trgm_ops);

revoke execute on function public.buscar_tudo(text, double precision, double precision) from public, anon;
grant execute on function public.buscar_tudo(text, double precision, double precision) to authenticated;
grant execute on function public.normalizar(text), public.nota_texto(text, text) to authenticated;

select 'RoVibes 023 aplicado com sucesso' as resultado;
