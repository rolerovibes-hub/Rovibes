-- RoVibes 016: Feed único de publicações, ordenado pela interação de cada pessoa
-- (lugares que segue, curtiu, salvou, visitou ou fez check-in, e onde os amigos estão indo),
-- misturando lugares que ainda não segue para alimentar a descoberta.
-- Pode ser executado mais de uma vez.

create or replace function public.feed_publicacoes(p_limite int default 30, p_antes timestamptz default null)
returns table (id uuid, texto text, foto_url text, criado_em timestamptz, estabelecimento jsonb, evento jsonb,
               curtidas int, curti boolean, sigo boolean, motivo text)
language sql stable security definer set search_path = public as $$
  with eu as (select auth.uid() as id),
  -- Afinidade da pessoa com cada lugar (últimos 60 dias).
  afinidade as (
    select e.id as estab,
           (exists (select 1 from public.seguidores s where s.estabelecimento_id = e.id and s.usuario_id = (select id from eu))) as segue,
           (select count(*) from public.curtidas c join public.publicacoes p on p.id = c.publicacao_id
             where p.estabelecimento_id = e.id and c.usuario_id = (select id from eu) and c.criado_em > now() - interval '60 days') as curtiu,
           (exists (select 1 from public.salvos s where s.estabelecimento_id = e.id and s.usuario_id = (select id from eu))) as salvou,
           (select count(*) from public.checkins k where k.estabelecimento_id = e.id and k.usuario_id = (select id from eu) and k.criado_em > now() - interval '60 days') as checkins,
           (select count(*) from public.visitas_lugar v where v.estabelecimento_id = e.id and v.usuario_id = (select id from eu) and v.dia > current_date - 60) as visitas,
           -- Pessoas que você segue que fizeram check-in lá recentemente.
           (select count(distinct k.usuario_id) from public.checkins k
              join public.seguidores_pessoas sp on sp.seguido_id = k.usuario_id and sp.seguidor_id = (select id from eu) and sp.situacao = 'ativo'
             where k.estabelecimento_id = e.id and k.criado_em > now() - interval '30 days') as amigos
      from public.estabelecimentos e
     where e.situacao = 'aprovado'
  ),
  base as (
    select p.*, a.segue, a.amigos,
           (select count(*) from public.curtidas c where c.publicacao_id = p.id) as total_curtidas,
           ( case when a.segue then 3 else 0 end
           + least(a.curtiu, 6) * 0.5
           + case when a.salvou then 2 else 0 end
           + least(a.checkins, 3) * 1.0
           + least(a.visitas, 5) * 0.3
           + least(a.amigos, 3) * 0.8 ) as afinidade
      from public.publicacoes p join afinidade a on a.estab = p.estabelecimento_id
     where p.situacao = 'publicada' and p.criado_em > now() - interval '45 days'
       and (p_antes is null or p.criado_em < p_antes)
  ),
  pontuado as (
    select b.*,
           -- Interesse (afinidade + popularidade) dividido pela idade: novidade pesa, mas o que importa para você sobe.
           (1 + b.afinidade + 0.6 * ln(1 + b.total_curtidas))
             / power(extract(epoch from (now() - b.criado_em)) / 3600 + 2, 0.9) as nota
      from base b
  ),
  variado as (
    -- Evita várias publicações seguidas do mesmo lugar.
    select v.*, v.nota / (1 + 0.7 * (row_number() over (partition by v.estabelecimento_id order by v.nota desc) - 1)) as nota_final
      from pontuado v
  )
  select v.id, v.texto, v.foto_url, v.criado_em,
         jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url),
         case when ev.id is null then null else jsonb_build_object('id', ev.id, 'nome', ev.nome, 'inicio', ev.inicio) end,
         v.total_curtidas::int,
         exists (select 1 from public.curtidas c where c.publicacao_id = v.id and c.usuario_id = auth.uid()),
         v.segue,
         case when v.segue then null
              when v.amigos > 0 then 'Pessoas que você segue foram'
              when v.afinidade > 0 then 'Baseado no que você curte'
              else 'Sugestão para você' end
    from variado v
    join public.estabelecimentos e on e.id = v.estabelecimento_id
    left join public.eventos ev on ev.id = v.evento_id
   order by v.nota_final desc, v.criado_em desc
   limit least(coalesce(p_limite, 30), 60);
$$;

revoke execute on function public.feed_publicacoes(int, timestamptz) from public, anon;
grant execute on function public.feed_publicacoes(int, timestamptz) to authenticated;

select 'RoVibes 016 aplicado com sucesso' as resultado;
