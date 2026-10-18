-- RoVibes 015: do papo ao plano — lugar compartilhado na conversa, plano de rolê dentro de
-- qualquer conversa (ideia → confirmado), respostas separadas (interesse / vou / não vou),
-- sugestões de horário e localização dentro do plano. Pode ser executado mais de uma vez.

-- ============================================================
-- Mensagens: lugar compartilhado e cartão de plano
-- ============================================================
alter table public.mensagens add column if not exists estabelecimento_id uuid references public.estabelecimentos(id) on delete set null;
alter table public.mensagens add column if not exists plano_id uuid;
alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens add constraint mensagens_tipo_check check (tipo in ('texto', 'foto', 'sistema', 'lugar', 'plano'));

-- ============================================================
-- Planos
-- ============================================================
create table if not exists public.planos (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  local_id uuid references public.estabelecimentos(id) on delete set null,
  mensagem_id uuid references public.mensagens(id) on delete set null,
  quando timestamptz,
  situacao text not null default 'aberto' check (situacao in ('aberto', 'confirmado', 'cancelado')),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index if not exists planos_conversa_idx on public.planos (conversa_id, criado_em desc);
do $$ begin
  alter table public.mensagens add constraint mensagens_plano_fk foreign key (plano_id) references public.planos(id) on delete set null;
exception when duplicate_object then null; end $$;

create table if not exists public.plano_respostas (
  plano_id uuid not null references public.planos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  resposta text not null check (resposta in ('interesse', 'vou', 'nao_vou')),
  atualizado_em timestamptz not null default now(),
  primary key (plano_id, usuario_id)
);

create table if not exists public.plano_sugestoes (
  id uuid primary key default gen_random_uuid(),
  plano_id uuid not null references public.planos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  quando timestamptz not null,
  criado_em timestamptz not null default now(),
  unique (plano_id, usuario_id, quando)
);

alter table public.planos enable row level security;
alter table public.plano_respostas enable row level security;
alter table public.plano_sugestoes enable row level security;
drop policy if exists planos_ler on public.planos;
create policy planos_ler on public.planos for select to authenticated using (public.pode_ver_conversa(conversa_id));
drop policy if exists respostas_ler on public.plano_respostas;
create policy respostas_ler on public.plano_respostas for select to authenticated using (public.pode_ver_conversa(conversa_id));
drop policy if exists sugestoes_ler on public.plano_sugestoes;
create policy sugestoes_ler on public.plano_sugestoes for select to authenticated
  using (exists (select 1 from public.planos p where p.id = plano_id and public.pode_ver_conversa(p.conversa_id)));
revoke insert, update, delete on public.planos, public.plano_respostas, public.plano_sugestoes from anon, authenticated;

create or replace function public.quando_texto(p timestamptz)
returns text language sql stable set search_path = public as $$
  select case extract(dow from p at time zone 'America/Sao_Paulo')::int
           when 0 then 'dom' when 1 then 'seg' when 2 then 'ter' when 3 then 'qua' when 4 then 'qui' when 5 then 'sex' else 'sáb' end
         || ' ' || to_char(p at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI');
$$;

create or replace function public.pode_planejar(p_conversa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.membro_ativo(p_conversa)
     and exists (select 1 from public.conversas where id = p_conversa and tipo in ('direta', 'role'));
$$;

-- ============================================================
-- Enviar mensagem (agora também com lugar compartilhado)
-- ============================================================
drop function if exists public.enviar_mensagem(uuid, text, text);
create or replace function public.enviar_mensagem(p_conversa uuid, p_texto text, p_foto text default null, p_lugar uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.conversas; v_sit text; v_estab boolean := false; v_id uuid; v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform public.exigir_conta_ativa();
  select * into c from public.conversas where id = p_conversa;
  if not found then raise exception 'Conversa não encontrada.'; end if;
  if v_texto is null and p_foto is null and p_lugar is null then raise exception 'Escreva uma mensagem.'; end if;
  if length(v_texto) > 2000 then raise exception 'Mensagem longa demais (máximo 2.000 caracteres).'; end if;
  if p_foto is not null and p_foto not like p_conversa::text || '/%' then raise exception 'Foto inválida.'; end if;
  if p_lugar is not null and not public.estab_visivel(p_lugar) then raise exception 'Lugar não encontrado.'; end if;

  select situacao into v_sit from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid();
  if v_sit in ('ativo', 'pedido') then
    if v_sit = 'pedido' then update public.conversa_membros set situacao = 'ativo' where conversa_id = p_conversa and usuario_id = auth.uid(); end if;
  elsif c.tipo = 'estabelecimento' and public.atende_estab(c.estabelecimento_id) then
    v_estab := true;
  else
    raise exception 'Você não participa desta conversa.';
  end if;

  if c.tipo = 'direta' and exists (
       select 1 from public.conversa_membros m where m.conversa_id = p_conversa and m.usuario_id <> auth.uid()
          and (public.bloqueado_entre(m.usuario_id, auth.uid()) or exists (select 1 from public.perfis where id = m.usuario_id and suspenso))) then
    raise exception 'Não é possível enviar mensagens para esta pessoa.';
  end if;

  insert into public.mensagens (conversa_id, autor_id, tipo, texto, foto, estabelecimento_id, como_estab)
  values (p_conversa, auth.uid(), case when p_lugar is not null then 'lugar' when p_foto is not null then 'foto' else 'texto' end,
          v_texto, p_foto, p_lugar, v_estab)
  returning id into v_id;
  update public.conversas set ultima_em = now(), lida_estab_em = case when v_estab then now() else lida_estab_em end where id = p_conversa;
  update public.conversa_membros set lida_em = now() where conversa_id = p_conversa and usuario_id = auth.uid();
  if c.tipo in ('direta', 'estabelecimento') then
    update public.conversa_membros set situacao = 'ativo' where conversa_id = p_conversa and usuario_id <> auth.uid() and situacao = 'saiu';
  end if;
  return v_id;
end $$;

-- ============================================================
-- Plano: criar, responder, sugerir horário, fechar, cancelar
-- ============================================================
create or replace function public.criar_plano(p_conversa uuid, p_local uuid, p_mensagem uuid default null, p_quando timestamptz default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_nome text;
begin
  perform public.exigir_conta_ativa();
  if not public.pode_planejar(p_conversa) then raise exception 'Não é possível criar um plano nesta conversa.'; end if;
  if p_local is not null and not public.estab_visivel(p_local) then raise exception 'Lugar não encontrado.'; end if;
  if p_mensagem is not null then
    if not exists (select 1 from public.mensagens where id = p_mensagem and conversa_id = p_conversa) then raise exception 'Mensagem inválida.'; end if;
    select id into v_id from public.planos where mensagem_id = p_mensagem and situacao <> 'cancelado';
    if found then return v_id; end if;
  end if;
  insert into public.planos (conversa_id, local_id, mensagem_id, quando, criado_por)
  values (p_conversa, p_local, p_mensagem, p_quando, auth.uid()) returning id into v_id;
  -- Quem propõe começa com interesse (não é confirmação).
  insert into public.plano_respostas (plano_id, usuario_id, conversa_id, resposta) values (v_id, auth.uid(), p_conversa, 'interesse');
  select nome into v_nome from public.estabelecimentos where id = p_local;
  insert into public.mensagens (conversa_id, autor_id, tipo, texto, plano_id, estabelecimento_id)
  values (p_conversa, auth.uid(), 'plano', coalesce('Vamos no ' || v_nome || '?', 'Bora fazer um rolê?'), v_id, p_local);
  update public.conversas set ultima_em = now() where id = p_conversa;
  update public.conversa_membros set lida_em = now() where conversa_id = p_conversa and usuario_id = auth.uid();
  return v_id;
end $$;

create or replace function public.exigir_plano(p_plano uuid)
returns public.planos language plpgsql stable security definer set search_path = public as $$
declare p public.planos;
begin
  select * into p from public.planos where id = p_plano;
  if not found or not public.membro_ativo(p.conversa_id) then raise exception 'Plano não encontrado.'; end if;
  return p;
end $$;

create or replace function public.responder_plano(p_plano uuid, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos; v_antes text;
begin
  perform public.exigir_conta_ativa();
  p := public.exigir_plano(p_plano);
  if p.situacao = 'cancelado' then raise exception 'Este plano foi cancelado.'; end if;
  select resposta into v_antes from public.plano_respostas where plano_id = p_plano and usuario_id = auth.uid();
  if p_resposta is null then
    delete from public.plano_respostas where plano_id = p_plano and usuario_id = auth.uid();
  else
    if p_resposta not in ('interesse', 'vou', 'nao_vou') then raise exception 'Resposta inválida.'; end if;
    insert into public.plano_respostas (plano_id, usuario_id, conversa_id, resposta) values (p_plano, auth.uid(), p.conversa_id, p_resposta)
    on conflict (plano_id, usuario_id) do update set resposta = excluded.resposta, atualizado_em = now();
  end if;
  -- Só a confirmação de presença (ou desistência depois de confirmar) vira aviso na conversa.
  if p_resposta = 'vou' and v_antes is distinct from 'vou' then
    perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' confirmou presença');
  elsif v_antes = 'vou' and p_resposta is distinct from 'vou' then
    perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' não vai mais');
  end if;
end $$;

create or replace function public.sugerir_horario(p_plano uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos;
begin
  perform public.exigir_conta_ativa();
  p := public.exigir_plano(p_plano);
  if p.situacao <> 'aberto' then raise exception 'O plano já está fechado.'; end if;
  if p_quando < now() - interval '1 hour' then raise exception 'Escolha um horário futuro.'; end if;
  insert into public.plano_sugestoes (plano_id, usuario_id, quando) values (p_plano, auth.uid(), p_quando) on conflict do nothing;
  perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' sugeriu ' || public.quando_texto(p_quando));
end $$;

-- Quem criou o plano (ou organiza o grupo) muda lugar/horário, fecha ou cancela.
create or replace function public.pode_editar_plano(p public.planos)
returns boolean language sql stable security definer set search_path = public as $$
  select p.criado_por = auth.uid()
      or exists (select 1 from public.conversa_membros where conversa_id = p.conversa_id and usuario_id = auth.uid() and situacao = 'ativo' and papel = 'admin')
      or (p.criado_por is null or not exists (select 1 from public.conversa_membros where conversa_id = p.conversa_id and usuario_id = p.criado_por and situacao = 'ativo'));
$$;

create or replace function public.editar_plano(p_plano uuid, p_local uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos; v_msg text := '';
begin
  perform public.exigir_conta_ativa();
  p := public.exigir_plano(p_plano);
  if not public.pode_editar_plano(p) then raise exception 'Só quem criou o plano pode mudar.'; end if;
  if p.situacao = 'cancelado' then raise exception 'Este plano foi cancelado.'; end if;
  if p_local is not null and not public.estab_visivel(p_local) then raise exception 'Lugar não encontrado.'; end if;
  if p_local is distinct from p.local_id then
    v_msg := 'mudou o lugar para ' || coalesce((select nome from public.estabelecimentos where id = p_local), 'a definir');
  end if;
  if p_quando is distinct from p.quando then
    v_msg := v_msg || case when v_msg <> '' then ' e ' else '' end
             || case when p_quando is null then 'deixou o horário a combinar' else 'mudou o horário para ' || public.quando_texto(p_quando) end;
  end if;
  if v_msg = '' then return; end if;
  update public.planos set local_id = p_local, quando = p_quando, atualizado_em = now() where id = p_plano;
  perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' ' || v_msg);
end $$;

create or replace function public.fechar_plano(p_plano uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos; v_nome text;
begin
  perform public.exigir_conta_ativa();
  p := public.exigir_plano(p_plano);
  if not public.pode_editar_plano(p) then raise exception 'Só quem criou o plano pode fechar.'; end if;
  if p.situacao <> 'aberto' then raise exception 'O plano não está aberto.'; end if;
  if coalesce(p_quando, p.quando) is null then raise exception 'Defina dia e horário para fechar o plano.'; end if;
  update public.planos set situacao = 'confirmado', quando = coalesce(p_quando, p.quando), atualizado_em = now() where id = p_plano;
  select nome into v_nome from public.estabelecimentos where id = p.local_id;
  perform public.mensagem_sistema(p.conversa_id, 'Plano confirmado: ' || coalesce(v_nome || ' · ', '') || public.quando_texto(coalesce(p_quando, p.quando)));
end $$;

create or replace function public.reabrir_plano(p_plano uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos;
begin
  p := public.exigir_plano(p_plano);
  if not public.pode_editar_plano(p) then raise exception 'Só quem criou o plano pode reabrir.'; end if;
  if p.situacao = 'aberto' then return; end if;
  update public.planos set situacao = 'aberto', atualizado_em = now() where id = p_plano;
  perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' reabriu o plano para combinar de novo');
end $$;

create or replace function public.cancelar_plano(p_plano uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.planos;
begin
  p := public.exigir_plano(p_plano);
  if not public.pode_editar_plano(p) then raise exception 'Só quem criou o plano pode cancelar.'; end if;
  if p.situacao = 'cancelado' then return; end if;
  update public.planos set situacao = 'cancelado', atualizado_em = now() where id = p_plano;
  delete from public.localizacoes_role where conversa_id = p.conversa_id
    and not exists (select 1 from public.planos o where o.conversa_id = p.conversa_id and o.situacao <> 'cancelado');
  perform public.mensagem_sistema(p.conversa_id, public.nome_curto(auth.uid()) || ' cancelou o plano');
end $$;

-- Planos de uma conversa, com lugar, respostas e sugestões.
create or replace function public.planos_da_conversa(p_conversa uuid)
returns table (id uuid, situacao text, quando timestamptz, criado_por uuid, criado_em timestamptz, mensagem_id uuid, pode_editar boolean,
               local_id uuid, local_nome text, local_bairro text, local_foto text, local_lat double precision, local_lng double precision,
               minha text, vao int, interessados int, nao_vao int, respostas jsonb, sugestoes jsonb)
language sql stable security definer set search_path = public as $$
  select p.id, p.situacao, p.quando, p.criado_por, p.criado_em, p.mensagem_id, public.pode_editar_plano(p),
         e.id, e.nome, e.bairro, coalesce(e.capa_url, e.logo_url), e.latitude, e.longitude,
         (select r.resposta from public.plano_respostas r where r.plano_id = p.id and r.usuario_id = auth.uid()),
         (select count(*) from public.plano_respostas r where r.plano_id = p.id and r.resposta = 'vou')::int,
         (select count(*) from public.plano_respostas r where r.plano_id = p.id and r.resposta = 'interesse')::int,
         (select count(*) from public.plano_respostas r where r.plano_id = p.id and r.resposta = 'nao_vou')::int,
         coalesce((select jsonb_agg(jsonb_build_object('id', pf.id, 'nome', pf.nome, 'foto', pf.foto_url, 'resposta', r.resposta) order by r.resposta desc, pf.nome)
                     from public.plano_respostas r join public.perfis pf on pf.id = r.usuario_id where r.plano_id = p.id), '[]'::jsonb),
         coalesce((select jsonb_agg(jsonb_build_object('quando', s.quando, 'nome', split_part(pf.nome, ' ', 1), 'meu', s.usuario_id = auth.uid()) order by s.quando)
                     from public.plano_sugestoes s join public.perfis pf on pf.id = s.usuario_id where s.plano_id = p.id and s.quando > now() - interval '1 hour'), '[]'::jsonb)
    from public.planos p left join public.estabelecimentos e on e.id = p.local_id
   where p.conversa_id = p_conversa and public.pode_ver_conversa(p_conversa)
   order by p.criado_em desc
   limit 50;
$$;

-- ============================================================
-- Rolê: o grupo nasce com um plano; localização só onde há plano
-- ============================================================
create or replace function public.criar_role(p_titulo text, p_local uuid, p_quando timestamptz, p_pessoas uuid[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  perform public.exigir_conta_ativa();
  if coalesce(btrim(p_titulo), '') = '' then raise exception 'Dê um nome para o rolê.'; end if;
  if p_local is not null and not public.estab_visivel(p_local) then raise exception 'Lugar não encontrado.'; end if;
  insert into public.conversas (tipo, titulo, local_id, quando, criada_por)
  values ('role', left(btrim(p_titulo), 60), p_local, p_quando, auth.uid()) returning id into v_id;
  insert into public.conversa_membros (conversa_id, usuario_id, situacao, papel) values (v_id, auth.uid(), 'ativo', 'admin');
  perform public.mensagem_sistema(v_id, public.nome_curto(auth.uid()) || ' criou o grupo');
  perform public.criar_plano(v_id, p_local, null, p_quando);
  if coalesce(array_length(p_pessoas, 1), 0) > 0 then perform public.adicionar_ao_role(v_id, p_pessoas); end if;
  return v_id;
end $$;

create or replace function public.compartilhar_local(p_conversa uuid, p_lat double precision, p_lng double precision, p_minutos int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_conta_ativa();
  if not public.membro_ativo(p_conversa)
     or not exists (select 1 from public.planos where conversa_id = p_conversa and situacao <> 'cancelado') then
    raise exception 'A localização só pode ser compartilhada dentro de um plano de rolê.';
  end if;
  if p_minutos is not null and p_minutos not between 5 and 480 then raise exception 'Tempo inválido.'; end if;
  insert into public.localizacoes_role (conversa_id, usuario_id, latitude, longitude, ate)
  values (p_conversa, auth.uid(), p_lat, p_lng, case when p_minutos is null then null else now() + make_interval(mins => p_minutos) end)
  on conflict (conversa_id, usuario_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, atualizado_em = now(), ate = excluded.ate;
  perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' está compartilhando a localização'
    || case when p_minutos is null then '' when p_minutos < 60 then ' por ' || p_minutos || ' min' else ' por ' || (p_minutos / 60) || ' h' end);
end $$;

-- Rolês criados antes desta atualização ganham o seu plano ("Bora!" vira "Vou").
do $$
declare c record; v_plano uuid;
begin
  for c in select * from public.conversas k where k.tipo = 'role' and not exists (select 1 from public.planos p where p.conversa_id = k.id) loop
    insert into public.planos (conversa_id, local_id, quando, criado_por, criado_em)
    values (c.id, c.local_id, c.quando, c.criada_por, c.criado_em) returning id into v_plano;
    insert into public.plano_respostas (plano_id, usuario_id, conversa_id, resposta)
    select v_plano, m.usuario_id, c.id, 'vou' from public.conversa_membros m where m.conversa_id = c.id and m.bora and m.situacao = 'ativo'
    on conflict do nothing;
    insert into public.mensagens (conversa_id, autor_id, tipo, texto, plano_id, estabelecimento_id, criado_em)
    values (c.id, c.criada_por, 'plano', 'Plano do rolê', v_plano, c.local_id, c.criado_em + interval '1 second');
  end loop;
end $$;

-- ============================================================
-- Lista do Chat: com filtro de planos e prévias de lugar/plano
-- ============================================================
drop function if exists public.chat_nao_lidas();
drop function if exists public.minhas_conversas();
create or replace function public.minhas_conversas()
returns table (id uuid, tipo text, titulo text, foto text, link text, situacao text, ultima_texto text, ultima_tipo text,
               ultima_minha boolean, ultima_em timestamptz, nao_lidas int, membros int, quando timestamptz, local_nome text,
               tem_plano boolean, plano_situacao text)
language sql stable security definer set search_path = public as $$
  select c.id, c.tipo,
         case c.tipo when 'direta' then o.nome when 'estabelecimento' then e.nome else c.titulo end,
         case c.tipo when 'direta' then o.foto_url when 'estabelecimento' then e.logo_url else l.logo_url end,
         case c.tipo when 'direta' then o.usuario when 'estabelecimento' then e.id::text else null end,
         m.situacao,
         case when u.apagada then 'Mensagem apagada'
              when u.tipo = 'foto' and u.texto is null then 'Foto'
              when u.tipo = 'lugar' then coalesce(u.texto, 'Compartilhou ' || coalesce((select nome from public.estabelecimentos where estabelecimentos.id = u.estabelecimento_id), 'um lugar'))
              when u.tipo = 'plano' then 'Ideia de rolê: ' || coalesce((select nome from public.estabelecimentos where estabelecimentos.id = u.estabelecimento_id), 'lugar a definir')
              else u.texto end,
         u.tipo, u.autor_id = auth.uid() and not u.como_estab and u.tipo <> 'sistema', coalesce(u.criado_em, c.criado_em),
         (select count(*) from public.mensagens x where x.conversa_id = c.id and x.criado_em > m.lida_em
             and (x.autor_id is distinct from auth.uid() or x.como_estab) and x.tipo <> 'sistema')::int,
         (select count(*) from public.conversa_membros y where y.conversa_id = c.id and y.situacao = 'ativo')::int,
         pl.quando, pe.nome,
         pl.id is not null, pl.situacao
    from public.conversa_membros m
    join public.conversas c on c.id = m.conversa_id
    left join lateral (select p.nome, p.usuario, p.foto_url, p.suspenso, p.id from public.conversa_membros mo join public.perfis p on p.id = mo.usuario_id
                        where c.tipo = 'direta' and mo.conversa_id = c.id and mo.usuario_id <> auth.uid() limit 1) o on true
    left join public.estabelecimentos e on e.id = c.estabelecimento_id
    left join public.estabelecimentos l on l.id = c.local_id
    left join lateral (select x.* from public.mensagens x where x.conversa_id = c.id order by x.criado_em desc limit 1) u on true
    left join lateral (select p.* from public.planos p where p.conversa_id = c.id and p.situacao <> 'cancelado'
                          and (p.quando is null or p.quando > now() - interval '12 hours')
                        order by (p.situacao = 'confirmado') desc, p.criado_em desc limit 1) pl on true
    left join public.estabelecimentos pe on pe.id = pl.local_id
   where m.usuario_id = auth.uid() and m.situacao in ('ativo', 'pedido')
     and (c.tipo <> 'direta' or (o.id is not null and not o.suspenso and not public.bloqueado_entre(o.id, auth.uid())))
     and (m.situacao = 'ativo' or u.id is not null)
   order by coalesce(u.criado_em, c.criado_em) desc
   limit 200;
$$;

create or replace function public.chat_nao_lidas()
returns table (conversas int, pedidos int)
language sql stable security definer set search_path = public as $$
  select count(*) filter (where situacao = 'ativo' and nao_lidas > 0)::int, count(*) filter (where situacao = 'pedido')::int
    from public.minhas_conversas();
$$;

-- Prévia de lugar no Mensagens do estabelecimento.
create or replace function public.conversas_do_estab(p_estab uuid)
returns table (id uuid, cliente text, foto text, ultima_texto text, ultima_estab boolean, ultima_em timestamptz, nao_lidas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atende_estab(p_estab) then raise exception 'Sem acesso ao Mensagens deste estabelecimento.'; end if;
  return query
  select c.id, coalesce(cl.nome, 'Cliente'), cl.foto_url,
         case when u.apagada then 'Mensagem apagada' when u.tipo = 'foto' and u.texto is null then 'Foto'
              when u.tipo = 'lugar' and u.texto is null then 'Compartilhou um lugar' else u.texto end,
         coalesce(u.como_estab, false), coalesce(u.criado_em, c.criado_em),
         (select count(*) from public.mensagens x where x.conversa_id = c.id and x.criado_em > c.lida_estab_em and not x.como_estab and x.tipo <> 'sistema')::int
    from public.conversas c
    left join lateral (select p.nome, p.foto_url from public.conversa_membros mo join public.perfis p on p.id = mo.usuario_id
                        where mo.conversa_id = c.id limit 1) cl on true
    join lateral (select x.* from public.mensagens x where x.conversa_id = c.id order by x.criado_em desc limit 1) u on true
   where c.tipo = 'estabelecimento' and c.estabelecimento_id = p_estab
   order by u.criado_em desc
   limit 300;
end $$;

-- Tempo real dos planos.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['planos', 'plano_respostas'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.exigir_plano(uuid), public.pode_editar_plano(public.planos) from public, anon, authenticated;
revoke execute on function public.enviar_mensagem(uuid, text, text, uuid), public.criar_plano(uuid, uuid, uuid, timestamptz),
  public.responder_plano(uuid, text), public.sugerir_horario(uuid, timestamptz), public.editar_plano(uuid, uuid, timestamptz),
  public.fechar_plano(uuid, timestamptz), public.reabrir_plano(uuid), public.cancelar_plano(uuid), public.planos_da_conversa(uuid),
  public.minhas_conversas(), public.chat_nao_lidas(), public.conversas_do_estab(uuid), public.pode_planejar(uuid) from public, anon;
grant execute on function public.enviar_mensagem(uuid, text, text, uuid), public.criar_plano(uuid, uuid, uuid, timestamptz),
  public.responder_plano(uuid, text), public.sugerir_horario(uuid, timestamptz), public.editar_plano(uuid, uuid, timestamptz),
  public.fechar_plano(uuid, timestamptz), public.reabrir_plano(uuid), public.cancelar_plano(uuid), public.planos_da_conversa(uuid),
  public.minhas_conversas(), public.chat_nao_lidas(), public.conversas_do_estab(uuid), public.pode_planejar(uuid) to authenticated;

select 'RoVibes 015 aplicado com sucesso' as resultado;
