-- 038 · Fotos da "Primeira vibe"
-- • Cada gosto pode ter uma foto escolhida pela equipe RoVibes (app A1004).
-- • Sem foto da equipe, o card usa a capa de um lugar (ou evento) da cidade que tem aquele gosto,
--   e mostra o nome do lugar — o onboarding já apresenta o que existe no RoVibes.
-- Pode rodar de novo sem problema.

alter table public.gostos add column if not exists imagem_url text;

-- Devolve a foto da equipe e até 6 opções de lugares/eventos; o app escolhe uma que ainda não apareceu,
-- para a mesma foto não se repetir em vários cards.
drop function if exists public.capas_gostos();
create or replace function public.capas_gostos()
returns table (gosto_id smallint, imagem_url text, candidatos jsonb)
language sql stable security definer set search_path = public as $$
  select g.id, g.imagem_url,
         coalesce((select jsonb_agg(jsonb_build_object('url', x.capa, 'lugar', x.nome) order by x.prioridade, x.peso desc)
                     from (
                       (select e.capa_url as capa, e.nome, 1 as prioridade,
                               (select count(*) from public.checkins c where c.estabelecimento_id = e.id and c.criado_em > now() - interval '30 days') as peso
                          from public.estabelecimento_gostos eg
                          join public.estabelecimentos e on e.id = eg.estabelecimento_id
                         where eg.gosto_id = g.id and e.capa_url is not null and public.estab_visivel(e.id)
                         order by peso desc limit 4)
                       union all
                       (select v.capa_url, v.nome, 2, 0
                          from public.eventos v
                         where g.id = any (v.gostos) and v.capa_url is not null and public.estab_visivel(v.estabelecimento_id)
                           and v.inicio > now() - interval '1 day'
                         order by v.inicio limit 2)
                     ) x), '[]'::jsonb)
    from public.gostos g
   where g.ativo;
$$;
grant execute on function public.capas_gostos() to authenticated;

create or replace function public.salvar_imagem_gosto(p_gosto smallint, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes pode mudar as fotos.'; end if;
  update public.gostos set imagem_url = nullif(btrim(coalesce(p_url, '')), '') where id = p_gosto;
end $$;
grant execute on function public.salvar_imagem_gosto(smallint, text) to authenticated;

-- Pasta pública para as fotos dos gostos (só a equipe envia).
do $$ begin
  insert into storage.buckets (id, name, public) values ('gostos', 'gostos', true) on conflict (id) do nothing;
end $$;
drop policy if exists gostos_arquivos_admin on storage.objects;
create policy gostos_arquivos_admin on storage.objects for all to authenticated
  using (bucket_id = 'gostos' and public.eh_admin()) with check (bucket_id = 'gostos' and public.eh_admin());

select 'Atualização 038 aplicada: fotos da Primeira vibe.' as resultado;
