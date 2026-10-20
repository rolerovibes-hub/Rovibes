-- 034 · Comentários nas publicações e interações nos stories
-- • Comentários em publicações de lugares e de pessoas: quem pode ver a publicação pode comentar;
--   uma resposta por nível (responder um comentário), curtir comentário, apagar e denunciar.
--   O dono da publicação (ou a equipe do lugar) pode apagar comentários; a equipe pode responder "como o lugar".
-- • Stories: responder e reagir. Vai para o chat direto com o autor (ou para a conversa com o lugar),
--   com a miniatura do story. O autor vê as reações em "Quem viu".
-- Pode rodar de novo sem problema.

create table if not exists public.comentarios (
  id uuid primary key default gen_random_uuid(),
  publicacao_lugar_id uuid references public.publicacoes(id) on delete cascade,
  publicacao_pessoa_id uuid references public.publicacoes_pessoas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  resposta_a uuid references public.comentarios(id) on delete cascade,
  texto text not null check (length(btrim(texto)) between 1 and 500),
  como_estab boolean not null default false,
  apagado boolean not null default false,
  criado_em timestamptz not null default now(),
  check (num_nonnulls(publicacao_lugar_id, publicacao_pessoa_id) = 1)
);
create index if not exists comentarios_lugar_idx on public.comentarios (publicacao_lugar_id, criado_em) where publicacao_lugar_id is not null;
create index if not exists comentarios_pessoa_idx on public.comentarios (publicacao_pessoa_id, criado_em) where publicacao_pessoa_id is not null;
create index if not exists comentarios_resposta_idx on public.comentarios (resposta_a) where resposta_a is not null;
alter table public.comentarios enable row level security; -- acesso só pelas funções abaixo

create table if not exists public.curtidas_comentario (
  comentario_id uuid not null references public.comentarios(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (comentario_id, usuario_id)
);
alter table public.curtidas_comentario enable row level security;

-- Dados de uma publicação: dono (pessoa) ou lugar, e se eu posso vê-la.
create or replace function public.info_publicacao(p_tipo text, p_id uuid)
returns table (dono uuid, estab uuid, visivel boolean)
language sql stable security definer set search_path = public as $$
  select p.usuario_id, null::uuid, (not p.oculto and public.ve_publicacoes_de(p.usuario_id))
    from public.publicacoes_pessoas p where p_tipo = 'pessoa' and p.id = p_id
  union all
  select null::uuid, p.estabelecimento_id,
         ((p.situacao = 'publicada' and public.estab_visivel(p.estabelecimento_id)) or public.eh_membro(p.estabelecimento_id))
    from public.publicacoes p where p_tipo = 'lugar' and p.id = p_id;
$$;

create or replace function public.modera_publicacao(p_tipo text, p_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select i.dono = auth.uid() or (i.estab is not null and public.eh_membro(i.estab)) from public.info_publicacao(p_tipo, p_id) i), false)
      or public.eh_admin();
$$;

create or replace function public.comentarios_da(p_tipo text, p_id uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare i record; v_lista jsonb;
begin
  select * into i from public.info_publicacao(p_tipo, p_id);
  if not found or not coalesce(i.visivel, false) then raise exception 'Publicação não encontrada.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'resposta_a', c.resposta_a, 'criado_em', c.criado_em, 'apagado', c.apagado,
           'texto', case when c.apagado then null else c.texto end,
           'como_estab', c.como_estab,
           'autor', case when c.como_estab and i.estab is not null
                         then jsonb_build_object('id', e.id, 'nome', e.nome, 'foto_url', e.logo_url, 'usuario', null, 'lugar', true)
                         else jsonb_build_object('id', p.id, 'nome', p.nome, 'foto_url', p.foto_url, 'usuario', p.usuario, 'lugar', false) end,
           'meu', c.usuario_id = auth.uid(),
           'curtidas', (select count(*) from public.curtidas_comentario k where k.comentario_id = c.id),
           'curti', exists (select 1 from public.curtidas_comentario k where k.comentario_id = c.id and k.usuario_id = auth.uid()))
         order by c.criado_em), '[]'::jsonb)
    into v_lista
    from public.comentarios c
    join public.perfis p on p.id = c.usuario_id
    left join public.estabelecimentos e on e.id = i.estab
   where (case when p_tipo = 'pessoa' then c.publicacao_pessoa_id else c.publicacao_lugar_id end) = p_id
     and not p.suspenso
     and not public.bloqueado_entre(c.usuario_id, auth.uid())
     -- comentário apagado só aparece se tiver respostas (para manter a conversa)
     and (not c.apagado or exists (select 1 from public.comentarios r where r.resposta_a = c.id and not r.apagado));
  return jsonb_build_object(
    'comentarios', v_lista,
    'pode_moderar', public.modera_publicacao(p_tipo, p_id),
    'sou_equipe', i.estab is not null and public.eh_membro(i.estab),
    'estab', case when i.estab is not null then (select jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url) from public.estabelecimentos e where e.id = i.estab) end);
end $$;

create or replace function public.comentar(p_tipo text, p_id uuid, p_texto text, p_resposta uuid default null, p_como_estab boolean default false)
returns uuid language plpgsql security definer set search_path = public as $$
declare i record; v_id uuid; v_pai uuid;
begin
  perform public.exigir_conta_ativa();
  if p_tipo not in ('lugar', 'pessoa') then raise exception 'Tipo inválido.'; end if;
  if coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva o comentário.'; end if;
  if length(btrim(p_texto)) > 500 then raise exception 'O comentário pode ter até 500 caracteres.'; end if;
  select * into i from public.info_publicacao(p_tipo, p_id);
  if not found or not coalesce(i.visivel, false) then raise exception 'Publicação não encontrada.'; end if;
  if i.dono is not null and public.bloqueado_entre(i.dono, auth.uid()) then raise exception 'Não é possível comentar nesta publicação.'; end if;
  if p_como_estab and (i.estab is null or not public.eh_membro(i.estab)) then raise exception 'Só a equipe do lugar comenta como o lugar.'; end if;
  if exists (select 1 from public.comentarios where usuario_id = auth.uid() and criado_em > now() - interval '3 seconds') then
    raise exception 'Calma! Espere um instante para comentar de novo.';
  end if;
  if p_resposta is not null then
    -- Responder uma resposta vira resposta ao comentário principal (um nível só).
    select coalesce(c.resposta_a, c.id) into v_pai from public.comentarios c
     where c.id = p_resposta and (case when p_tipo = 'pessoa' then c.publicacao_pessoa_id else c.publicacao_lugar_id end) = p_id;
    if v_pai is null then raise exception 'Comentário não encontrado.'; end if;
  end if;
  insert into public.comentarios (publicacao_lugar_id, publicacao_pessoa_id, resposta_a, texto, como_estab)
  values (case when p_tipo = 'lugar' then p_id end, case when p_tipo = 'pessoa' then p_id end, v_pai, btrim(p_texto), coalesce(p_como_estab, false))
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.apagar_comentario(p_comentario uuid)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comentarios; v_tipo text; v_pub uuid;
begin
  select * into c from public.comentarios where id = p_comentario;
  if not found then raise exception 'Comentário não encontrado.'; end if;
  v_tipo := case when c.publicacao_pessoa_id is not null then 'pessoa' else 'lugar' end;
  v_pub := coalesce(c.publicacao_pessoa_id, c.publicacao_lugar_id);
  if c.usuario_id <> auth.uid() and not public.modera_publicacao(v_tipo, v_pub) then raise exception 'Sem permissão para apagar.'; end if;
  update public.comentarios set apagado = true where id = p_comentario;
end $$;

create or replace function public.curtir_comentario(p_comentario uuid)
returns boolean language plpgsql security definer set search_path = public as $$
declare c public.comentarios;
begin
  perform public.exigir_conta_ativa();
  select * into c from public.comentarios where id = p_comentario and not apagado;
  if not found then raise exception 'Comentário não encontrado.'; end if;
  if exists (select 1 from public.curtidas_comentario where comentario_id = p_comentario and usuario_id = auth.uid()) then
    delete from public.curtidas_comentario where comentario_id = p_comentario and usuario_id = auth.uid();
    return false;
  end if;
  insert into public.curtidas_comentario (comentario_id) values (p_comentario);
  return true;
end $$;

-- Total de comentários de várias publicações (para o feed).
create or replace function public.contar_comentarios(p_tipo text, p_ids uuid[])
returns table (publicacao_id uuid, total int)
language sql stable security definer set search_path = public as $$
  select (case when p_tipo = 'pessoa' then c.publicacao_pessoa_id else c.publicacao_lugar_id end), count(*)::int
    from public.comentarios c
   where not c.apagado
     and (case when p_tipo = 'pessoa' then c.publicacao_pessoa_id else c.publicacao_lugar_id end) = any (p_ids)
   group by 1;
$$;

-- Notificações: comentários nas minhas publicações e respostas aos meus comentários (7 dias).
create or replace function public.minhas_interacoes()
returns table (id uuid, tipo text, quem text, foto_url text, texto text, criado_em timestamptz, pub_tipo text, pub_id uuid)
language sql stable security definer set search_path = public as $$
  select c.id,
         case when pai.usuario_id = auth.uid() then 'resposta' else 'comentario' end,
         case when c.como_estab then (select e.nome from public.publicacoes pl join public.estabelecimentos e on e.id = pl.estabelecimento_id where pl.id = c.publicacao_lugar_id) else p.nome end,
         p.foto_url, left(c.texto, 120), c.criado_em,
         case when c.publicacao_pessoa_id is not null then 'pessoa' else 'lugar' end,
         coalesce(c.publicacao_pessoa_id, c.publicacao_lugar_id)
    from public.comentarios c
    join public.perfis p on p.id = c.usuario_id
    left join public.comentarios pai on pai.id = c.resposta_a
    left join public.publicacoes_pessoas pp on pp.id = c.publicacao_pessoa_id
   where c.usuario_id <> auth.uid() and not c.apagado and c.criado_em > now() - interval '7 days'
     and not public.bloqueado_entre(c.usuario_id, auth.uid())
     and (pai.usuario_id = auth.uid() or (pai.id is null and pp.usuario_id = auth.uid()))
   order by c.criado_em desc
   limit 30;
$$;

grant execute on function public.info_publicacao(text, uuid), public.modera_publicacao(text, uuid), public.comentarios_da(text, uuid),
  public.comentar(text, uuid, text, uuid, boolean), public.apagar_comentario(uuid), public.curtir_comentario(uuid),
  public.contar_comentarios(text, uuid[]), public.minhas_interacoes() to authenticated;

-- ============================================================
-- Stories: responder e reagir
-- ============================================================
create table if not exists public.reacoes_story (
  story_tipo text not null check (story_tipo in ('lugar', 'pessoa')),
  story_id uuid not null,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  emoji text not null check (emoji in ('🔥', '😍', '😂', '😮', '👏', '🍻', '💜')),
  criado_em timestamptz not null default now(),
  primary key (story_tipo, story_id, usuario_id)
);
alter table public.reacoes_story enable row level security;
drop policy if exists reacoes_story_minhas on public.reacoes_story;
create policy reacoes_story_minhas on public.reacoes_story for select to authenticated using (usuario_id = auth.uid());
grant select on public.reacoes_story to authenticated;

alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens add constraint mensagens_tipo_check check (tipo in ('texto', 'foto', 'sistema', 'lugar', 'plano', 'evento', 'lista', 'story'));

-- Responder (p_texto) e/ou reagir (p_emoji) a um story. Devolve a conversa onde a mensagem foi.
create or replace function public.interagir_story(p_tipo text, p_story uuid, p_emoji text default null, p_texto text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_autor uuid; v_estab uuid; v_foto text; v_conv uuid; v_msg uuid; v_texto text;
begin
  perform public.exigir_conta_ativa();
  if coalesce(p_emoji, '') = '' and coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva uma resposta ou escolha uma reação.'; end if;
  if p_tipo = 'pessoa' then
    select s.usuario_id, s.foto_url into v_autor, v_foto from public.stories_pessoas s
      join public.perfis p on p.id = s.usuario_id
     where s.id = p_story and not s.oculto and s.expira_em > now() and not p.suspenso
       and (not p.privado or public.segue(auth.uid(), s.usuario_id));
    if v_autor is null then raise exception 'Este story não está mais disponível.'; end if;
    if v_autor = auth.uid() then raise exception 'Este story é seu.'; end if;
    if public.bloqueado_entre(v_autor, auth.uid()) then raise exception 'Não é possível responder este story.'; end if;
    v_conv := public.abrir_conversa(v_autor);
  elsif p_tipo = 'lugar' then
    select s.estabelecimento_id, s.foto_url into v_estab, v_foto from public.stories s
     where s.id = p_story and s.expira_em > now() and public.estab_visivel(s.estabelecimento_id);
    if v_estab is null then raise exception 'Este story não está mais disponível.'; end if;
    v_conv := public.abrir_conversa_estab(v_estab);
  else
    raise exception 'Tipo inválido.';
  end if;
  if coalesce(p_emoji, '') <> '' then
    insert into public.reacoes_story (story_tipo, story_id, emoji) values (p_tipo, p_story, p_emoji)
    on conflict (story_tipo, story_id, usuario_id) do update set emoji = excluded.emoji, criado_em = now();
  end if;
  v_texto := coalesce(nullif(btrim(coalesce(p_texto, '')), ''), 'Reagiu ao seu story ' || p_emoji);
  v_msg := public.enviar_mensagem(v_conv, left(v_texto, 2000), null, null);
  update public.mensagens set tipo = 'story',
         dados = jsonb_build_object('story_tipo', p_tipo, 'story_id', p_story, 'foto_url', v_foto, 'emoji', nullif(p_emoji, ''),
                                    'resposta', coalesce(btrim(p_texto), '') <> '')
   where id = v_msg;
  return v_conv;
end $$;
grant execute on function public.interagir_story(text, uuid, text, text) to authenticated;

-- "Quem viu" agora mostra a reação de cada pessoa.
drop function if exists public.quem_viu_story(uuid);
create or replace function public.quem_viu_story(p_story uuid)
returns table (nome text, usuario text, foto_url text, visto_em timestamptz, reacao text)
language sql stable security definer set search_path = public as $$
  select p.nome, p.usuario, p.foto_url, v.visto_em,
         (select r.emoji from public.reacoes_story r where r.story_tipo = 'pessoa' and r.story_id = v.story_id and r.usuario_id = v.usuario_id)
    from public.visualizacoes_story_pessoa v join public.perfis p on p.id = v.usuario_id
    join public.stories_pessoas s on s.id = v.story_id
   where v.story_id = p_story and s.usuario_id = auth.uid()
   order by (select r.criado_em from public.reacoes_story r where r.story_tipo = 'pessoa' and r.story_id = v.story_id and r.usuario_id = v.usuario_id) desc nulls last,
            v.visto_em desc;
$$;
grant execute on function public.quem_viu_story(uuid) to authenticated;

-- ============================================================
-- Denúncia de comentário
-- ============================================================
alter table public.denuncias drop constraint if exists denuncias_tipo_alvo_check;
alter table public.denuncias add constraint denuncias_tipo_alvo_check check (tipo_alvo in ('perfil', 'story', 'publicacao', 'mensagem', 'post', 'comentario'));

create or replace function public.denunciar(p_tipo text, p_alvo uuid, p_motivo text, p_detalhe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  v_dono := case p_tipo
    when 'perfil' then p_alvo
    when 'story' then (select usuario_id from public.stories_pessoas where id = p_alvo)
    when 'post' then (select usuario_id from public.publicacoes_pessoas where id = p_alvo)
    when 'mensagem' then (select autor_id from public.mensagens where id = p_alvo and not como_estab)
    when 'comentario' then (select usuario_id from public.comentarios where id = p_alvo and not como_estab)
    else null end;
  if p_tipo = 'mensagem' and not exists (select 1 from public.mensagens m where m.id = p_alvo and public.pode_ver_conversa(m.conversa_id)) then
    raise exception 'Mensagem não encontrada.';
  end if;
  if p_tipo = 'post' and v_dono is null then raise exception 'Publicação não encontrada.'; end if;
  if p_tipo = 'comentario' and not exists (select 1 from public.comentarios where id = p_alvo) then raise exception 'Comentário não encontrado.'; end if;
  if p_tipo = 'perfil' and not exists (select 1 from public.perfis where id = p_alvo) then raise exception 'Perfil não encontrado.'; end if;
  if exists (select 1 from public.denuncias where denunciante_id = auth.uid() and tipo_alvo = p_tipo and alvo_id = p_alvo and situacao = 'aberta') then
    raise exception 'Você já denunciou isto. A equipe RoVibes vai analisar.';
  end if;
  insert into public.denuncias (tipo_alvo, alvo_id, alvo_usuario, motivo, detalhe)
  values (p_tipo, p_alvo, v_dono, p_motivo, nullif(btrim(p_detalhe), ''));
end $$;

create or replace function public.denuncias_abertas()
returns table (id uuid, tipo_alvo text, alvo_id uuid, motivo text, detalhe text, criada_em timestamptz, situacao text, acao text,
               denunciante text, alvo_nome text, alvo_usuario_nome text, alvo_foto text, alvo_texto text, alvo_imagem text, total_contra int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a administração vê denúncias.'; end if;
  return query
  select d.id, d.tipo_alvo, d.alvo_id, d.motivo, d.detalhe, d.criada_em, d.situacao, d.acao,
         coalesce(pd.nome, ''), pa.nome, pa.usuario, pa.foto_url,
         case d.tipo_alvo when 'story' then (select legenda from public.stories_pessoas where stories_pessoas.id = d.alvo_id)
                          when 'publicacao' then (select texto from public.publicacoes where publicacoes.id = d.alvo_id)
                          when 'post' then (select texto from public.publicacoes_pessoas where publicacoes_pessoas.id = d.alvo_id)
                          when 'mensagem' then (select texto from public.mensagens where mensagens.id = d.alvo_id)
                          when 'comentario' then (select texto from public.comentarios where comentarios.id = d.alvo_id)
                          when 'perfil' then pa.bio end,
         case d.tipo_alvo when 'story' then (select foto_url from public.stories_pessoas where stories_pessoas.id = d.alvo_id)
                          when 'publicacao' then (select foto_url from public.publicacoes where publicacoes.id = d.alvo_id)
                          when 'post' then (select foto_url from public.publicacoes_pessoas where publicacoes_pessoas.id = d.alvo_id) end,
         (select count(*) from public.denuncias x where x.alvo_usuario = d.alvo_usuario and d.alvo_usuario is not null)::int
    from public.denuncias d
    left join public.perfis pd on pd.id = d.denunciante_id
    left join public.perfis pa on pa.id = d.alvo_usuario
   order by (d.situacao = 'aberta') desc, d.criada_em desc
   limit 300;
end $$;

create or replace function public.resolver_denuncia(p_denuncia uuid, p_acao text, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.denuncias;
begin
  if not public.eh_admin() then raise exception 'Só a administração resolve denúncias.'; end if;
  select * into d from public.denuncias where id = p_denuncia for update;
  if not found then raise exception 'Denúncia não encontrada.'; end if;
  if p_acao = 'ocultado' then
    if d.tipo_alvo = 'story' then update public.stories_pessoas set oculto = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'publicacao' then update public.publicacoes set situacao = 'oculta' where id = d.alvo_id;
    elsif d.tipo_alvo = 'post' then update public.publicacoes_pessoas set oculto = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'mensagem' then update public.mensagens set apagada = true, texto = null, foto = null where id = d.alvo_id;
    elsif d.tipo_alvo = 'comentario' then update public.comentarios set apagado = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'perfil' then update public.perfis set bio = null, foto_url = null where id = d.alvo_id;
    end if;
  elsif p_acao = 'advertido' then
    update public.perfis set advertencias = advertencias + 1 where id = d.alvo_usuario;
  elsif p_acao = 'suspenso' then
    update public.perfis set suspenso = true where id = d.alvo_usuario;
    update public.stories_pessoas set oculto = true where usuario_id = d.alvo_usuario and expira_em > now();
  elsif p_acao <> 'arquivado' then
    raise exception 'Ação inválida.';
  end if;
  update public.denuncias
     set situacao = case when p_acao = 'arquivado' then 'arquivada' else 'resolvida' end,
         acao = p_acao, nota = nullif(btrim(coalesce(p_nota, '')), ''), resolvida_por = auth.uid(), resolvida_em = now()
   where situacao = 'aberta' and tipo_alvo = d.tipo_alvo and alvo_id = d.alvo_id;
end $$;

select 'Atualização 034 aplicada: comentários e interações nos stories.' as resultado;
