-- 043 · VibeCut: vídeos verticais dos rolês
-- • "Para você": os melhores vídeos dos últimos 30 dias (brindes, quem você segue, lugares com seus gostos, recentes).
-- • "Ao vivo agora": só vídeos gravados num lugar marcado nas últimas 2 horas, do mais perto para o mais longe.
-- • Cada vídeo traz a trilha (música escolhida ou o que o lugar informou que está tocando agora) e a distância.
-- Pode rodar de novo sem problema.

create or replace function public.vibecuts(p_modo text, p_lat double precision default null, p_lng double precision default null,
                                           p_inicio int default 0, p_limite int default 10, p_local uuid default null)
returns table (id uuid, video_url text, foto_url text, texto text, criado_em timestamptz, autor jsonb, local jsonb,
               musica jsonb, tocando_agora text, curtidas int, curti boolean, comentarios int, ao_vivo boolean, distancia_km numeric)
language sql stable security definer set search_path = public as $$
  with base as (
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
           - extract(epoch from (now() - b.criado_em)) / 86400.0 as pontos
      from base b
     where p_modo <> 'ao_vivo' or b.vivo
  )
  select x.id, x.video_url, x.foto_url, x.texto, x.criado_em,
         jsonb_build_object('id', a.id, 'nome', a.nome, 'usuario', a.usuario, 'foto_url', a.foto_url),
         case when x.estabelecimento_id is not null and x.e_nome is not null then
           jsonb_build_object('id', x.estabelecimento_id, 'nome', x.e_nome, 'logo_url', x.e_logo, 'latitude', x.e_lat, 'longitude', x.e_lng) end,
         (select jsonb_build_object('id', m.id, 'titulo', m.titulo, 'artista', m.artista) from public.musicas m where m.id = x.musica_id),
         (select mi.musica from public.movimento_informado mi
           where mi.estabelecimento_id = x.estabelecimento_id and mi.musica is not null and mi.musica_em > now() - interval '3 hours'),
         x.n_brindes,
         exists (select 1 from public.curtidas_pessoas c where c.publicacao_id = x.id and c.usuario_id = auth.uid()),
         (select count(*)::int from public.comentarios c where c.publicacao_pessoa_id = x.id and not c.apagado),
         x.vivo, x.dist
    from pontuado x join public.perfis a on a.id = x.usuario_id
   order by
     case when p_modo = 'ao_vivo' then coalesce(x.dist, 9999) end asc nulls last,
     case when p_modo = 'ao_vivo' then extract(epoch from x.criado_em) end desc,
     case when p_modo <> 'ao_vivo' then x.pontos end desc,
     x.criado_em desc
   offset greatest(coalesce(p_inicio, 0), 0)
   limit least(coalesce(p_limite, 10), 30);
$$;
revoke execute on function public.vibecuts(text, double precision, double precision, int, int, uuid) from public, anon;
grant execute on function public.vibecuts(text, double precision, double precision, int, int, uuid) to authenticated;

select 'Atualização 043 aplicada: VibeCut.' as resultado;
