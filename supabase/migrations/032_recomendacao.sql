-- 032 · Vibe progressiva e recomendações "Para você agora"
-- O feed aprende com o que a pessoa faz (abrir, salvar, compartilhar, marcar rolê, check-in, seguir, ocultar),
-- sem perguntar de novo. Abrir um lugar pesa pouco (abrir não é gostar); ocultar tira o lugar por 30 dias.
-- Requer a 031. Pode rodar de novo sem problema.

create table if not exists public.sinais_uso (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  tipo text not null check (tipo in ('abriu', 'salvou', 'compartilhou', 'role', 'checkin', 'seguiu', 'ocultou')),
  criado_em timestamptz not null default now()
);
create index if not exists sinais_uso_usuario_idx on public.sinais_uso (usuario_id, criado_em desc);
create index if not exists sinais_uso_ocultos_idx on public.sinais_uso (usuario_id, estabelecimento_id) where tipo = 'ocultou';
alter table public.sinais_uso enable row level security;
drop policy if exists sinais_uso_meus on public.sinais_uso;
create policy sinais_uso_meus on public.sinais_uso for select to authenticated using (usuario_id = auth.uid());
grant select on public.sinais_uso to authenticated;

create or replace function public.registrar_sinal(p_estab uuid, p_tipo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_delta numeric;
begin
  if auth.uid() is null or not public.estab_visivel(p_estab) then return; end if;
  v_delta := case p_tipo when 'abriu' then 0.1 when 'salvou' then 0.6 when 'compartilhou' then 0.5 when 'role' then 1
                         when 'checkin' then 1 when 'seguiu' then 0.5 when 'ocultou' then -1 end;
  if v_delta is null then raise exception 'Sinal inválido.'; end if;
  -- "abriu" conta no máximo uma vez a cada 6 h por lugar.
  if p_tipo = 'abriu' and exists (select 1 from public.sinais_uso where usuario_id = auth.uid() and estabelecimento_id = p_estab
                                    and tipo = 'abriu' and criado_em > now() - interval '6 hours') then
    return;
  end if;
  insert into public.sinais_uso (estabelecimento_id, tipo) values (p_estab, p_tipo);
  insert into public.perfil_gostos (usuario_id, gosto_id, origem, peso)
  select auth.uid(), eg.gosto_id, 'uso', v_delta from public.estabelecimento_gostos eg where eg.estabelecimento_id = p_estab
  on conflict (usuario_id, gosto_id) do update
    set peso = least(6, greatest(-3, public.perfil_gostos.peso + v_delta)), atualizado_em = now();
end $$;
grant execute on function public.registrar_sinal(uuid, text) to authenticated;

create or replace function public.desfazer_ocultar(p_estab uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.sinais_uso where usuario_id = auth.uid() and estabelecimento_id = p_estab and tipo = 'ocultou';
$$;
grant execute on function public.desfazer_ocultar(uuid) to authenticated;

-- Aberto agora pelo horário cadastrado (fuso de Brasília; vira a meia-noite).
create or replace function public.aberto_agora(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  with agora as (
    select extract(dow from now() at time zone 'America/Sao_Paulo')::int dia, (now() at time zone 'America/Sao_Paulo')::time hora
  )
  select exists (
    select 1 from public.horarios h, agora a
     where h.estabelecimento_id = p_estab and (
       (h.dia_semana = a.dia and ((h.abre <= h.fecha and a.hora between h.abre and h.fecha) or (h.abre > h.fecha and a.hora >= h.abre)))
       or (h.dia_semana = (a.dia + 6) % 7 and h.abre > h.fecha and a.hora < h.fecha)));
$$;

-- Meus gostos (para a tela "Meus gostos" e para editar a Primeira vibe).
create or replace function public.meus_gostos()
returns table (gosto_id smallint, origem text, peso numeric)
language sql stable security definer set search_path = public as $$
  select gosto_id, origem, peso from public.perfil_gostos where usuario_id = auth.uid() and (origem = 'escolha' or peso > 0.5);
$$;
grant execute on function public.meus_gostos() to authenticated;

-- Recomendações: relevância para a pessoa agora (não só popularidade).
create or replace function public.recomendados(p_lat double precision default null, p_lng double precision default null, p_limite int default 12)
returns table (estabelecimento_id uuid, pontos numeric, motivos text[], evento_id uuid, evento_nome text, evento_inicio timestamptz, aberto boolean, distancia_m int)
language sql stable security definer set search_path = public as $$
  with hoje as (
    select (date_trunc('day', now() at time zone 'America/Sao_Paulo')) at time zone 'America/Sao_Paulo' ini
  ), cand as (
    select e.id, e.latitude, e.longitude, public.aberto_agora(e.id) aberto
      from public.estabelecimentos e
     where e.situacao = 'aprovado'
       and not exists (select 1 from public.sinais_uso s where s.usuario_id = auth.uid() and s.estabelecimento_id = e.id
                         and s.tipo = 'ocultou' and s.criado_em > now() - interval '30 days')
  ), ev as (
    select distinct on (x.estabelecimento_id) x.estabelecimento_id, x.id, x.nome, x.inicio, x.gostos
      from public.eventos x, hoje
     where x.situacao = 'publicado'
       and ((x.inicio >= hoje.ini and x.inicio < hoje.ini + interval '1 day')
            or (x.inicio < now() and coalesce(x.fim, x.inicio + interval '6 hours') > now()))
     order by x.estabelecimento_id, x.inicio
  ), gosto as (
    select eg.estabelecimento_id, sum(pg.peso) total,
           (array_agg(g.nome order by pg.peso desc, g.ordem))[1:2] nomes
      from public.estabelecimento_gostos eg
      join public.perfil_gostos pg on pg.gosto_id = eg.gosto_id and pg.usuario_id = auth.uid() and pg.peso > 0
      join public.gostos g on g.id = eg.gosto_id
     group by 1
  ), gosto_ev as (
    select ev.estabelecimento_id, sum(pg.peso) total
      from ev join public.perfil_gostos pg on pg.gosto_id = any (ev.gostos) and pg.usuario_id = auth.uid() and pg.peso > 0
     group by 1
  ), mov as (
    select c.estabelecimento_id, count(*) n from public.checkins c
     where c.criado_em > now() - interval '2 hours' group by 1
  ), amg as (
    select a.estabelecimento_id, a.identificados, a.anonimos
      from public.presenca_amigos((select array_agg(id) from cand)) a
  ), conta as (
    select c.id, c.aberto, ev.id evento_id, ev.nome evento_nome, ev.inicio evento_inicio,
           case when p_lat is not null and c.latitude is not null then public.distancia_m(p_lat, p_lng, c.latitude, c.longitude) end dist,
           coalesce(gosto.total, 0) * 1.5 + coalesce(gosto_ev.total, 0) * 2 g_pts,
           gosto.nomes,
           coalesce(amg.identificados, 0) * 4 + coalesce(amg.anonimos, 0) * 2 a_pts,
           amg.identificados, amg.anonimos,
           least(coalesce(mov.n, 0) * 0.5, 3) m_pts
      from cand c
      left join ev on ev.estabelecimento_id = c.id
      left join gosto on gosto.estabelecimento_id = c.id
      left join gosto_ev on gosto_ev.estabelecimento_id = c.id
      left join amg on amg.estabelecimento_id = c.id
      left join mov on mov.estabelecimento_id = c.id
  )
  select k.id,
         round((k.g_pts + k.a_pts + k.m_pts
           + case when k.evento_id is not null then 4 else 0 end
           + case when k.aberto then 3 when k.evento_id is null then -2 else 0 end
           + case when k.dist is not null then 6 / (1 + k.dist / 1000) else 0 end)::numeric, 2),
         array_remove(array[
           case when coalesce(k.identificados, 0) > 0 then k.identificados || case when k.identificados = 1 then ' amigo por aqui' else ' amigos por aqui' end
                when coalesce(k.anonimos, 0) > 0 then k.anonimos || case when k.anonimos = 1 then ' pessoa que você segue está lá' else ' pessoas que você segue estão lá' end end,
           case when k.nomes is not null then 'Combina com ' || array_to_string(k.nomes, ' e ') end,
           case when k.m_pts >= 1.5 then 'Movimentado agora' end
         ], null),
         k.evento_id, k.evento_nome, k.evento_inicio, k.aberto, round(k.dist)::int
    from conta k
   order by 2 desc
   limit least(coalesce(p_limite, 12), 40);
$$;
grant execute on function public.recomendados(double precision, double precision, int) to authenticated;

select 'Atualização 032 aplicada: vibe progressiva e recomendações.' as resultado;
