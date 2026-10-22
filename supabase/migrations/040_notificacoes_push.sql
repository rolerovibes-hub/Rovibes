-- 040 · Notificações reais no celular (push)
-- • Tabela de notificações criada pelo próprio banco quando algo acontece: brinde, comentário, resposta,
--   novo seguidor, convite de evento, convite de rolê, convite de promoter, mensagem no chat e pedido pronto.
-- • Aparelhos de cada pessoa (navegador/iPhone na tela de início e app Android) e as preferências por tipo.
-- • A cada notificação nova o banco avisa a função "enviar-push", que manda para os aparelhos.
-- Pode rodar de novo sem problema.

-- ============================================================
-- Tabelas
-- ============================================================
create table if not exists public.notificacoes (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null references auth.users(id) on delete cascade,
  ator_id uuid references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('brinde', 'brinde_comentario', 'comentario', 'resposta', 'seguidor', 'pedido_seguir',
                                     'convite_evento', 'convite_role', 'convite_promoter', 'mensagem', 'pedido_pronto')),
  titulo text not null,
  texto text,
  link text not null default '/',
  grupo text,
  chave text unique,
  criado_em timestamptz not null default now(),
  lida_em timestamptz,
  enviada_em timestamptz,
  tentativas int not null default 0
);
create index if not exists notificacoes_usuario_idx on public.notificacoes (usuario_id, criado_em desc);
create index if not exists notificacoes_envio_idx on public.notificacoes (criado_em) where enviada_em is null;
alter table public.notificacoes enable row level security;
drop policy if exists notificacoes_minhas on public.notificacoes;
create policy notificacoes_minhas on public.notificacoes for select to authenticated using (usuario_id = auth.uid());

-- Aparelhos que recebem push: "web" (navegador, PWA no iPhone) e "android" (app RoVibes).
create table if not exists public.dispositivos_push (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('web', 'android')),
  endereco text not null unique,
  chaves jsonb,
  aparelho text,
  criado_em timestamptz not null default now(),
  visto_em timestamptz not null default now()
);
create index if not exists dispositivos_push_usuario_idx on public.dispositivos_push (usuario_id);
alter table public.dispositivos_push enable row level security;
drop policy if exists dispositivos_meus on public.dispositivos_push;
create policy dispositivos_meus on public.dispositivos_push for select to authenticated using (usuario_id = auth.uid());

-- Preferências: chave = categoria, false = não quero push dessa categoria. Vazio = tudo ligado.
alter table public.perfis add column if not exists notificacoes jsonb not null default '{}'::jsonb;

-- Endereço da função de envio (preenchido pela própria função na primeira vez que é chamada).
create table if not exists public.config_push (
  id boolean primary key default true check (id),
  url_envio text,
  atualizado_em timestamptz not null default now()
);
alter table public.config_push enable row level security;

-- ============================================================
-- Categorias (para as preferências)
-- ============================================================
create or replace function public.categoria_notificacao(p_tipo text)
returns text language sql immutable as $$
  select case
    when p_tipo in ('brinde', 'brinde_comentario') then 'brindes'
    when p_tipo in ('comentario', 'resposta') then 'comentarios'
    when p_tipo in ('seguidor', 'pedido_seguir') then 'seguidores'
    when p_tipo in ('convite_evento', 'convite_role', 'convite_promoter') then 'convites'
    when p_tipo = 'mensagem' then 'chat'
    else 'pedidos'
  end;
$$;

create or replace function public.primeiro_nome(p_usuario uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(nullif(split_part(btrim(nome), ' ', 1), ''), 'Alguém') from public.perfis where id = p_usuario;
$$;

-- ============================================================
-- Criar notificação (usado pelos gatilhos)
-- ============================================================
create or replace function public.notificar(p_usuario uuid, p_ator uuid, p_tipo text, p_titulo text, p_texto text, p_link text,
                                            p_chave text default null, p_grupo text default null)
returns void language plpgsql security definer set search_path = public as $$
declare v_url text;
begin
  if p_usuario is null or p_usuario = p_ator then return; end if;
  -- Quem foi bloqueado não gera notificação para quem bloqueou (nem o contrário).
  if p_ator is not null and exists (select 1 from public.bloqueios b
                                     where (b.bloqueador_id = p_usuario and b.bloqueado_id = p_ator)
                                        or (b.bloqueador_id = p_ator and b.bloqueado_id = p_usuario)) then
    return;
  end if;
  insert into public.notificacoes (usuario_id, ator_id, tipo, titulo, texto, link, chave, grupo)
  values (p_usuario, p_ator, p_tipo, left(p_titulo, 120), left(p_texto, 240), coalesce(p_link, '/'), p_chave, p_grupo)
  on conflict (chave) do nothing;
  if not found then return; end if;
  -- Avisa a função de envio (se o pg_net estiver ligado). Falha aqui nunca impede a ação da pessoa.
  begin
    select url_envio into v_url from public.config_push where id;
    if v_url is not null then
      perform net.http_post(url := v_url, body := '{}'::jsonb, headers := '{"Content-Type": "application/json"}'::jsonb);
    end if;
  exception when others then null;
  end;
end $$;
revoke execute on function public.notificar(uuid, uuid, text, text, text, text, text, text) from public, anon, authenticated;

do $$ begin
  create extension if not exists pg_net with schema extensions;
exception when others then null;
end $$;

-- ============================================================
-- Gatilhos
-- ============================================================
-- Brinde em publicação de pessoa.
create or replace function public.notif_brinde()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  select usuario_id into v_dono from public.publicacoes_pessoas where id = new.publicacao_id;
  perform public.notificar(v_dono, new.usuario_id, 'brinde', public.primeiro_nome(new.usuario_id) || ' brindou sua publicação 🥂', null,
                           '/publicacao/pessoa/' || new.publicacao_id, 'brinde:' || new.publicacao_id || ':' || new.usuario_id, 'brinde:' || new.publicacao_id);
  return new;
end $$;
drop trigger if exists curtidas_pessoas_notif on public.curtidas_pessoas;
create trigger curtidas_pessoas_notif after insert on public.curtidas_pessoas for each row execute function public.notif_brinde();

-- Brinde em comentário.
create or replace function public.notif_brinde_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.comentarios;
begin
  select * into c from public.comentarios where id = new.comentario_id;
  if c.id is null or c.como_estab then return new; end if;
  perform public.notificar(c.usuario_id, new.usuario_id, 'brinde_comentario', public.primeiro_nome(new.usuario_id) || ' brindou seu comentário 🥂', left(c.texto, 80),
                           '/publicacao/' || case when c.publicacao_pessoa_id is not null then 'pessoa/' || c.publicacao_pessoa_id else 'lugar/' || c.publicacao_lugar_id end || '?comentario=' || c.id,
                           'brinde_com:' || c.id || ':' || new.usuario_id);
  return new;
end $$;
drop trigger if exists curtidas_comentario_notif on public.curtidas_comentario;
create trigger curtidas_comentario_notif after insert on public.curtidas_comentario for each row execute function public.notif_brinde_comentario();

-- Comentário na minha publicação e resposta ao meu comentário.
create or replace function public.notif_comentario()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_dono uuid; v_pai uuid; v_link text; v_quem text;
begin
  if new.apagado then return new; end if;
  v_link := '/publicacao/' || case when new.publicacao_pessoa_id is not null then 'pessoa/' || new.publicacao_pessoa_id else 'lugar/' || new.publicacao_lugar_id end
            || '?comentario=' || new.id;
  v_quem := case when new.como_estab then coalesce((select e.nome from public.publicacoes p join public.estabelecimentos e on e.id = p.estabelecimento_id where p.id = new.publicacao_lugar_id), 'O lugar')
                 else public.primeiro_nome(new.usuario_id) end;
  if new.resposta_a is not null then
    select usuario_id into v_pai from public.comentarios where id = new.resposta_a and not como_estab;
    perform public.notificar(v_pai, new.usuario_id, 'resposta', v_quem || ' respondeu seu comentário', left(new.texto, 120), v_link, 'coment:' || new.id || ':pai');
  end if;
  if new.publicacao_pessoa_id is not null then
    select usuario_id into v_dono from public.publicacoes_pessoas where id = new.publicacao_pessoa_id;
    if v_dono is distinct from v_pai then
      perform public.notificar(v_dono, new.usuario_id, 'comentario', v_quem || ' comentou sua publicação', left(new.texto, 120), v_link, 'coment:' || new.id || ':dono');
    end if;
  end if;
  return new;
end $$;
drop trigger if exists comentarios_notif on public.comentarios;
create trigger comentarios_notif after insert on public.comentarios for each row execute function public.notif_comentario();

-- Novo seguidor ou pedido para seguir (perfil privado); pedido aceito vira "começou a seguir".
create or replace function public.notif_seguidor()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_usuario text;
begin
  select usuario into v_usuario from public.perfis where id = new.seguidor_id;
  if new.situacao = 'ativo' and (tg_op = 'INSERT' or old.situacao <> 'ativo') then
    perform public.notificar(new.seguido_id, new.seguidor_id, 'seguidor', public.primeiro_nome(new.seguidor_id) || ' começou a seguir você', null,
                             coalesce('/p/' || v_usuario, '/'), 'seguidor:' || new.seguidor_id || ':' || new.seguido_id);
  elsif new.situacao = 'pendente' and tg_op = 'INSERT' then
    perform public.notificar(new.seguido_id, new.seguidor_id, 'pedido_seguir', public.primeiro_nome(new.seguidor_id) || ' quer seguir você', 'Toque para aceitar ou recusar.',
                             coalesce('/p/' || v_usuario, '/'), 'pedido_seguir:' || new.seguidor_id || ':' || new.seguido_id);
  end if;
  return new;
end $$;
drop trigger if exists seguidores_pessoas_notif on public.seguidores_pessoas;
create trigger seguidores_pessoas_notif after insert or update of situacao on public.seguidores_pessoas for each row execute function public.notif_seguidor();

-- Convite para evento de amigo (anfitrião).
create or replace function public.notif_convite_evento()
returns trigger language plpgsql security definer set search_path = public as $$
declare e record;
begin
  select ep.titulo, ep.anfitriao_id, ep.inicio into e from public.eventos_pessoa ep where ep.id = new.evento_id;
  if e.anfitriao_id is null then return new; end if;
  perform public.notificar(new.usuario_id, e.anfitriao_id, 'convite_evento', public.primeiro_nome(e.anfitriao_id) || ' convidou você 🎉',
                           e.titulo || coalesce(' · ' || to_char(e.inicio at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'), ''),
                           '/evento-pessoa/' || new.evento_id, 'convite_ev:' || new.evento_id || ':' || new.usuario_id);
  return new;
end $$;
drop trigger if exists convites_evento_pessoa_notif on public.convites_evento_pessoa;
create trigger convites_evento_pessoa_notif after insert on public.convites_evento_pessoa for each row execute function public.notif_convite_evento();

-- Chamado para um rolê (grupo do chat).
create or replace function public.notif_convite_role()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversas;
begin
  select * into c from public.conversas where id = new.conversa_id;
  if c.tipo <> 'role' or new.usuario_id = c.criada_por or new.situacao not in ('ativo', 'pedido') then return new; end if;
  perform public.notificar(new.usuario_id, c.criada_por, 'convite_role', public.primeiro_nome(c.criada_por) || ' chamou você para um rolê',
                           coalesce(c.titulo, 'Rolê') || coalesce(' · ' || to_char(c.quando at time zone 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'), ''),
                           '/chat/' || c.id, 'convite_role:' || c.id || ':' || new.usuario_id);
  return new;
end $$;
drop trigger if exists conversa_membros_notif on public.conversa_membros;
create trigger conversa_membros_notif after insert on public.conversa_membros for each row execute function public.notif_convite_role();

-- Convite para ser promoter de um lugar.
create or replace function public.notif_convite_promoter()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao <> 'convidado' then return new; end if;
  perform public.notificar(new.usuario_id, new.convidado_por, 'convite_promoter', 'Convite para ser promoter',
                           coalesce((select nome from public.estabelecimentos where id = new.estabelecimento_id), 'Um lugar') || ' convidou você. Toque para responder.',
                           '/promoter', 'convite_promoter:' || new.id);
  return new;
end $$;
drop trigger if exists promoters_notif on public.promoters;
create trigger promoters_notif after insert on public.promoters for each row execute function public.notif_convite_promoter();

-- Mensagem no chat: vai para quem está na conversa (menos quem escreveu).
-- Conversa com um lugar: só a resposta do lugar vira push (a equipe usa o Business/Job).
create or replace function public.notif_mensagem()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.conversas; m record; v_titulo text; v_texto text;
begin
  if new.tipo = 'sistema' or new.apagada then return new; end if;
  select * into c from public.conversas where id = new.conversa_id;
  if c.tipo = 'estabelecimento' and not new.como_estab then return new; end if;
  v_titulo := case c.tipo
    when 'role' then coalesce(c.titulo, 'Rolê') || ' · ' || public.primeiro_nome(new.autor_id)
    when 'estabelecimento' then coalesce((select nome from public.estabelecimentos where id = c.estabelecimento_id), 'Lugar')
    else public.primeiro_nome(new.autor_id) end;
  v_texto := case new.tipo
    when 'foto' then '📷 Foto'
    when 'story' then 'Respondeu seu story' || coalesce(': ' || nullif(btrim(new.texto), ''), '')
    when 'lugar' then '📍 Mandou um lugar'
    when 'evento' then '🎟️ Mandou um evento'
    when 'plano' then '🗓️ Mandou um plano'
    when 'lista' then '📋 Mandou uma lista'
    else coalesce(new.texto, '') end;
  for m in select cm.usuario_id from public.conversa_membros cm
            where cm.conversa_id = c.id and cm.situacao = 'ativo' and cm.usuario_id is distinct from new.autor_id loop
    perform public.notificar(m.usuario_id, new.autor_id, 'mensagem', v_titulo, v_texto, '/chat/' || c.id, 'msg:' || new.id || ':' || m.usuario_id, 'chat:' || c.id);
  end loop;
  return new;
end $$;
drop trigger if exists mensagens_notif on public.mensagens;
create trigger mensagens_notif after insert on public.mensagens for each row execute function public.notif_mensagem();

-- Pedido feito pelo App ficou pronto.
create or replace function public.notif_pedido_pronto()
returns trigger language plpgsql security definer set search_path = public as $$
declare p record;
begin
  if new.situacao <> 'pronto' or old.situacao = 'pronto' then return new; end if;
  select pe.id, pe.numero, pe.usuario_id, pe.comanda_id, pe.modalidade, e.nome as lugar
    into p from public.pedidos pe join public.estabelecimentos e on e.id = pe.estabelecimento_id where pe.id = new.pedido_id;
  if p.usuario_id is null then return new; end if;
  perform public.notificar(p.usuario_id, null, 'pedido_pronto',
                           case when p.modalidade = 'mesa' then 'Seu pedido está saindo 🍽️' else 'Seu pedido está pronto para retirar 🍽️' end,
                           'Pedido #' || p.numero || ' · ' || p.lugar,
                           case when p.modalidade = 'mesa' then '/comanda/' || p.comanda_id else '/retirada' end,
                           'pronto:' || p.id, 'pedido:' || p.id);
  return new;
end $$;
drop trigger if exists pedido_itens_notif on public.pedido_itens;
create trigger pedido_itens_notif after update of situacao on public.pedido_itens for each row execute function public.notif_pedido_pronto();

-- ============================================================
-- O que o App usa
-- ============================================================
create or replace function public.registrar_dispositivo(p_tipo text, p_endereco text, p_chaves jsonb, p_aparelho text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_tipo not in ('web', 'android') or coalesce(btrim(p_endereco), '') = '' then raise exception 'Aparelho inválido.'; end if;
  insert into public.dispositivos_push (usuario_id, tipo, endereco, chaves, aparelho)
  values (auth.uid(), p_tipo, p_endereco, p_chaves, left(p_aparelho, 120))
  on conflict (endereco) do update set usuario_id = auth.uid(), tipo = excluded.tipo, chaves = excluded.chaves,
                                       aparelho = excluded.aparelho, visto_em = now();
end $$;

create or replace function public.remover_dispositivo(p_endereco text)
returns void language sql security definer set search_path = public as $$
  delete from public.dispositivos_push where endereco = p_endereco and usuario_id = auth.uid();
$$;

create or replace function public.salvar_preferencias_notificacao(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.perfis set notificacoes = coalesce(p, '{}'::jsonb) where id = auth.uid();
end $$;

create or replace function public.marcar_notificacoes_lidas()
returns void language sql security definer set search_path = public as $$
  update public.notificacoes set lida_em = now() where usuario_id = auth.uid() and lida_em is null;
$$;

-- Lista do sininho (as que não aparecem por outro caminho na tela de notificações).
create or replace function public.minhas_notificacoes(p_limite int default 50)
returns table (id uuid, tipo text, titulo text, texto text, link text, criado_em timestamptz, lida boolean, ator_foto text)
language sql stable security definer set search_path = public as $$
  select n.id, n.tipo, n.titulo, n.texto, n.link, n.criado_em, n.lida_em is not null, p.foto_url
    from public.notificacoes n left join public.perfis p on p.id = n.ator_id
   where n.usuario_id = auth.uid() and n.tipo <> 'mensagem'
   order by n.criado_em desc
   limit least(coalesce(p_limite, 50), 100);
$$;

revoke execute on function public.registrar_dispositivo(text, text, jsonb, text), public.remover_dispositivo(text),
  public.salvar_preferencias_notificacao(jsonb), public.marcar_notificacoes_lidas(), public.minhas_notificacoes(int) from public, anon;
grant execute on function public.registrar_dispositivo(text, text, jsonb, text), public.remover_dispositivo(text),
  public.salvar_preferencias_notificacao(jsonb), public.marcar_notificacoes_lidas(), public.minhas_notificacoes(int) to authenticated;
grant select on public.notificacoes, public.dispositivos_push to authenticated;

-- Usado só pela função de envio (service_role): pega as pendentes de uma vez, sem enviar duas vezes.
create or replace function public.reservar_envios(p_limite int default 100)
returns table (id uuid, usuario_id uuid, tipo text, titulo text, texto text, link text, grupo text, quer boolean)
language sql volatile security definer set search_path = public as $$
  with alvo as (
    select n.id from public.notificacoes n
     where n.enviada_em is null and n.criado_em > now() - interval '1 day'
     order by n.criado_em
     limit least(coalesce(p_limite, 100), 500)
       for update skip locked
  )
  update public.notificacoes n set enviada_em = now(), tentativas = n.tentativas + 1
    from alvo where n.id = alvo.id
  returning n.id, n.usuario_id, n.tipo, n.titulo, n.texto, n.link, n.grupo,
            coalesce((select (p.notificacoes ->> public.categoria_notificacao(n.tipo))::boolean from public.perfis p where p.id = n.usuario_id), true);
$$;
revoke execute on function public.reservar_envios(int) from public, anon, authenticated;

-- Abre uma publicação pelo link da notificação (/publicacao/pessoa/ID ou /publicacao/lugar/ID).
create or replace function public.publicacao_para_abrir(p_tipo text, p_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select case p_tipo
    when 'pessoa' then (
      select jsonb_build_object(
        'id', p.id, 'tipo', 'pessoa', 'foto_url', p.foto_url, 'video_url', p.video_url, 'texto', p.texto, 'criado_em', p.criado_em,
        'autor', jsonb_build_object('id', a.id, 'nome', a.nome, 'usuario', a.usuario, 'foto_url', a.foto_url),
        'local', (select jsonb_build_object('id', e.id, 'nome', e.nome) from public.estabelecimentos e where e.id = p.estabelecimento_id),
        'curtidas', (select count(*) from public.curtidas_pessoas c where c.publicacao_id = p.id),
        'curti', exists (select 1 from public.curtidas_pessoas c where c.publicacao_id = p.id and c.usuario_id = auth.uid()),
        'comentarios', (select count(*) from public.comentarios c where c.publicacao_pessoa_id = p.id and not c.apagado))
        from public.publicacoes_pessoas p join public.perfis a on a.id = p.usuario_id
       where p.id = p_id and (p.usuario_id = auth.uid() or (not p.oculto and public.ve_publicacoes_de(p.usuario_id))))
    when 'lugar' then (
      select jsonb_build_object(
        'id', p.id, 'tipo', 'lugar', 'foto_url', p.foto_url, 'video_url', null, 'texto', p.texto, 'criado_em', p.criado_em,
        'autor', jsonb_build_object('id', e.id, 'nome', e.nome, 'usuario', null, 'foto_url', e.logo_url, 'lugar', true),
        'local', null,
        'curtidas', (select count(*) from public.curtidas c where c.publicacao_id = p.id),
        'curti', exists (select 1 from public.curtidas c where c.publicacao_id = p.id and c.usuario_id = auth.uid()),
        'comentarios', (select count(*) from public.comentarios c where c.publicacao_lugar_id = p.id and not c.apagado))
        from public.publicacoes p join public.estabelecimentos e on e.id = p.estabelecimento_id
       where p.id = p_id and (p.situacao = 'publicada' or public.eh_membro(p.estabelecimento_id)))
  end;
$$;
revoke execute on function public.publicacao_para_abrir(text, uuid) from public, anon;
grant execute on function public.publicacao_para_abrir(text, uuid) to authenticated;

select 'Atualização 040 aplicada: notificações no celular.' as resultado;
