-- RoVibes 014: chat — conversas diretas (com pedido de mensagem para quem não segue você),
-- conversa com o estabelecimento (respondida pela equipe no Mensagens T2001), grupo do rolê
-- com lugar fixado, "Bora!" e localização compartilhada por tempo limitado.
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Tabelas
-- ============================================================
create table if not exists public.conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta', 'estabelecimento', 'role')),
  estabelecimento_id uuid references public.estabelecimentos(id) on delete cascade,
  local_id uuid references public.estabelecimentos(id) on delete set null,
  titulo text check (titulo is null or length(titulo) <= 60),
  quando timestamptz,
  par text unique,
  criada_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  ultima_em timestamptz not null default now(),
  lida_estab_em timestamptz not null default now()
);
create index if not exists conversas_estab_idx on public.conversas (estabelecimento_id, ultima_em desc) where tipo = 'estabelecimento';

create table if not exists public.conversa_membros (
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'pedido', 'recusado', 'saiu')),
  papel text not null default 'membro' check (papel in ('admin', 'membro')),
  lida_em timestamptz not null default now(),
  bora boolean not null default false,
  entrou_em timestamptz not null default now(),
  primary key (conversa_id, usuario_id)
);
create index if not exists conversa_membros_usuario_idx on public.conversa_membros (usuario_id, situacao);

create table if not exists public.mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  autor_id uuid references auth.users(id) on delete set null,
  tipo text not null default 'texto' check (tipo in ('texto', 'foto', 'sistema')),
  texto text check (texto is null or length(texto) <= 2000),
  foto text,
  como_estab boolean not null default false,
  apagada boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists mensagens_conversa_idx on public.mensagens (conversa_id, criado_em desc);

create table if not exists public.localizacoes_role (
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  atualizado_em timestamptz not null default now(),
  ate timestamptz,
  primary key (conversa_id, usuario_id)
);

alter table public.conversas enable row level security;
alter table public.conversa_membros enable row level security;
alter table public.mensagens enable row level security;
alter table public.localizacoes_role enable row level security;

-- ============================================================
-- Quem vê o quê
-- ============================================================
-- Equipe que atende as conversas do estabelecimento: proprietário, gestor ou quem tem o Mensagens (T2001).
-- A administração RoVibes NÃO lê conversas privadas (só a mensagem que for denunciada).
create or replace function public.atende_estab(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false)
      or exists (select 1 from public.acessos a
                   join public.membros m on m.estabelecimento_id = a.estabelecimento_id and m.usuario_id = a.usuario_id and m.ativo
                  where a.estabelecimento_id = p_estab and a.usuario_id = auth.uid() and a.codigo = 'T2001');
$$;

create or replace function public.pode_ver_conversa(p_conversa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid() and situacao in ('ativo', 'pedido'))
      or exists (select 1 from public.conversas c where c.id = p_conversa and c.tipo = 'estabelecimento' and public.atende_estab(c.estabelecimento_id));
$$;

create or replace function public.membro_ativo(p_conversa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid() and situacao = 'ativo');
$$;

drop policy if exists conversas_ler on public.conversas;
create policy conversas_ler on public.conversas for select to authenticated using (public.pode_ver_conversa(id));
drop policy if exists membros_conversa_ler on public.conversa_membros;
create policy membros_conversa_ler on public.conversa_membros for select to authenticated using (public.pode_ver_conversa(conversa_id));
drop policy if exists mensagens_ler on public.mensagens;
create policy mensagens_ler on public.mensagens for select to authenticated using (public.pode_ver_conversa(conversa_id));
drop policy if exists locais_ler on public.localizacoes_role;
create policy locais_ler on public.localizacoes_role for select to authenticated
  using (public.membro_ativo(conversa_id) and (ate is null or ate > now()) and not public.bloqueado_entre(usuario_id, auth.uid()));

-- Tudo é gravado pelas funções abaixo (ninguém escreve direto nas tabelas).
revoke insert, update, delete on public.conversas, public.conversa_membros, public.mensagens, public.localizacoes_role from anon, authenticated;

create or replace function public.exigir_conta_ativa()
returns void language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if exists (select 1 from public.perfis where id = auth.uid() and suspenso) then raise exception 'Sua conta está suspensa pela moderação.'; end if;
end $$;

create or replace function public.nome_curto(p uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce(split_part((select nome from public.perfis where id = p), ' ', 1), 'Alguém');
$$;

create or replace function public.mensagem_sistema(p_conversa uuid, p_texto text)
returns void language sql security definer set search_path = public as $$
  insert into public.mensagens (conversa_id, autor_id, tipo, texto) values (p_conversa, auth.uid(), 'sistema', p_texto);
  update public.conversas set ultima_em = now() where id = p_conversa;
$$;

-- ============================================================
-- Abrir conversas
-- ============================================================
-- Conversa direta. Se a pessoa não segue você, a conversa chega para ela como pedido de mensagem.
create or replace function public.abrir_conversa(p_pessoa uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_par text; v_id uuid;
begin
  perform public.exigir_conta_ativa();
  if p_pessoa = auth.uid() then raise exception 'Não é possível conversar com você mesmo.'; end if;
  if not exists (select 1 from public.perfis where id = p_pessoa and not suspenso) or public.bloqueado_entre(auth.uid(), p_pessoa) then
    raise exception 'Não é possível enviar mensagens para esta pessoa.';
  end if;
  v_par := 'd:' || least(auth.uid(), p_pessoa)::text || ':' || greatest(auth.uid(), p_pessoa)::text;
  insert into public.conversas (tipo, par, criada_por) values ('direta', v_par, auth.uid()) on conflict (par) do nothing;
  select id into v_id from public.conversas where par = v_par;
  insert into public.conversa_membros (conversa_id, usuario_id, situacao) values (v_id, auth.uid(), 'ativo')
  on conflict (conversa_id, usuario_id) do update set situacao = 'ativo' where conversa_membros.situacao in ('saiu', 'pedido');
  insert into public.conversa_membros (conversa_id, usuario_id, situacao)
  values (v_id, p_pessoa, case when public.segue(p_pessoa, auth.uid()) then 'ativo' else 'pedido' end)
  on conflict (conversa_id, usuario_id) do nothing;
  return v_id;
end $$;

-- Conversa com um estabelecimento (uma por pessoa e lugar).
create or replace function public.abrir_conversa_estab(p_estab uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_par text; v_id uuid;
begin
  perform public.exigir_conta_ativa();
  if not public.estab_visivel(p_estab) then raise exception 'Estabelecimento não encontrado.'; end if;
  v_par := 'e:' || p_estab::text || ':' || auth.uid()::text;
  insert into public.conversas (tipo, estabelecimento_id, par, criada_por) values ('estabelecimento', p_estab, v_par, auth.uid()) on conflict (par) do nothing;
  select id into v_id from public.conversas where par = v_par;
  insert into public.conversa_membros (conversa_id, usuario_id, situacao) values (v_id, auth.uid(), 'ativo')
  on conflict (conversa_id, usuario_id) do update set situacao = 'ativo';
  return v_id;
end $$;

-- Grupo do rolê: título, lugar fixado (opcional), horário (opcional) e convidados.
create or replace function public.adicionar_ao_role(p_conversa uuid, p_pessoas uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare p uuid; n int := 0; v_nomes text[] := '{}';
begin
  perform public.exigir_conta_ativa();
  if not exists (select 1 from public.conversas where id = p_conversa and tipo = 'role') or not public.membro_ativo(p_conversa) then
    raise exception 'Você não está neste rolê.';
  end if;
  if (select count(*) from public.conversa_membros where conversa_id = p_conversa and situacao in ('ativo', 'pedido')) + coalesce(array_length(p_pessoas, 1), 0) > 50 then
    raise exception 'O rolê pode ter até 50 pessoas.';
  end if;
  foreach p in array coalesce(p_pessoas, '{}') loop
    continue when p = auth.uid() or public.bloqueado_entre(auth.uid(), p)
      or not exists (select 1 from public.perfis where id = p and not suspenso);
    insert into public.conversa_membros (conversa_id, usuario_id, situacao)
    values (p_conversa, p, case when public.segue(p, auth.uid()) then 'ativo' else 'pedido' end)
    on conflict (conversa_id, usuario_id) do update set situacao = excluded.situacao, bora = false, entrou_em = now()
      where conversa_membros.situacao in ('saiu', 'recusado');
    if found then
      n := n + 1;
      v_nomes := v_nomes || public.nome_curto(p);
    end if;
  end loop;
  if n > 0 then perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' adicionou ' || array_to_string(v_nomes, ', ')); end if;
  return n;
end $$;

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
  perform public.mensagem_sistema(v_id, public.nome_curto(auth.uid()) || ' criou o rolê');
  if coalesce(array_length(p_pessoas, 1), 0) > 0 then perform public.adicionar_ao_role(v_id, p_pessoas); end if;
  return v_id;
end $$;

create or replace function public.editar_role(p_conversa uuid, p_titulo text, p_local uuid, p_quando timestamptz)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_conta_ativa();
  if not exists (select 1 from public.conversas where id = p_conversa and tipo = 'role') or not public.membro_ativo(p_conversa) then
    raise exception 'Você não está neste rolê.';
  end if;
  if coalesce(btrim(p_titulo), '') = '' then raise exception 'Dê um nome para o rolê.'; end if;
  if p_local is not null and not public.estab_visivel(p_local) then raise exception 'Lugar não encontrado.'; end if;
  update public.conversas set titulo = left(btrim(p_titulo), 60), local_id = p_local, quando = p_quando where id = p_conversa;
  perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' atualizou o rolê');
end $$;

-- Aceitar ou recusar um pedido de mensagem / convite para rolê.
create or replace function public.responder_conversa(p_conversa uuid, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.conversa_membros set situacao = case when p_aceitar then 'ativo' else 'recusado' end, lida_em = now()
   where conversa_id = p_conversa and usuario_id = auth.uid() and situacao = 'pedido';
  if not found then raise exception 'Pedido não encontrado.'; end if;
end $$;

-- Sair do rolê / apagar a conversa da sua lista (volta se a outra pessoa escrever de novo).
create or replace function public.sair_da_conversa(p_conversa uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_tipo text;
begin
  select tipo into v_tipo from public.conversas where id = p_conversa;
  update public.conversa_membros set situacao = 'saiu', bora = false
   where conversa_id = p_conversa and usuario_id = auth.uid() and situacao in ('ativo', 'pedido');
  if not found then return; end if;
  delete from public.localizacoes_role where conversa_id = p_conversa and usuario_id = auth.uid();
  if v_tipo = 'role' then
    perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' saiu do rolê');
    -- Quem criou saiu: o mais antigo vira admin.
    if not exists (select 1 from public.conversa_membros where conversa_id = p_conversa and situacao = 'ativo' and papel = 'admin') then
      update public.conversa_membros set papel = 'admin'
       where (conversa_id, usuario_id) = (select conversa_id, usuario_id from public.conversa_membros
                                           where conversa_id = p_conversa and situacao = 'ativo' order by entrou_em limit 1);
    end if;
  end if;
end $$;

-- Admin do rolê tira alguém.
create or replace function public.remover_do_role(p_conversa uuid, p_pessoa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid() and situacao = 'ativo' and papel = 'admin') then
    raise exception 'Só quem organiza o rolê pode remover pessoas.';
  end if;
  update public.conversa_membros set situacao = 'saiu', bora = false where conversa_id = p_conversa and usuario_id = p_pessoa and usuario_id <> auth.uid();
  if found then
    delete from public.localizacoes_role where conversa_id = p_conversa and usuario_id = p_pessoa;
    perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' removeu ' || public.nome_curto(p_pessoa));
  end if;
end $$;

-- ============================================================
-- Mensagens
-- ============================================================
create or replace function public.enviar_mensagem(p_conversa uuid, p_texto text, p_foto text default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.conversas; v_sit text; v_estab boolean := false; v_id uuid; v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform public.exigir_conta_ativa();
  select * into c from public.conversas where id = p_conversa;
  if not found then raise exception 'Conversa não encontrada.'; end if;
  if v_texto is null and p_foto is null then raise exception 'Escreva uma mensagem.'; end if;
  if length(v_texto) > 2000 then raise exception 'Mensagem longa demais (máximo 2.000 caracteres).'; end if;
  if p_foto is not null and p_foto not like p_conversa::text || '/%' then raise exception 'Foto inválida.'; end if;

  select situacao into v_sit from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid();
  if v_sit in ('ativo', 'pedido') then
    -- Responder um pedido de mensagem é aceitar.
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

  insert into public.mensagens (conversa_id, autor_id, tipo, texto, foto, como_estab)
  values (p_conversa, auth.uid(), case when p_foto is null then 'texto' else 'foto' end, v_texto, p_foto, v_estab)
  returning id into v_id;
  update public.conversas set ultima_em = now(), lida_estab_em = case when v_estab then now() else lida_estab_em end where id = p_conversa;
  update public.conversa_membros set lida_em = now() where conversa_id = p_conversa and usuario_id = auth.uid();
  -- Conversa apagada por alguém volta para a lista quando chega mensagem nova.
  if c.tipo in ('direta', 'estabelecimento') then
    update public.conversa_membros set situacao = 'ativo' where conversa_id = p_conversa and usuario_id <> auth.uid() and situacao = 'saiu';
  end if;
  return v_id;
end $$;

create or replace function public.apagar_mensagem(p_mensagem uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_foto text;
begin
  update public.mensagens m set apagada = true, texto = null, foto = null
    from (select foto from public.mensagens where id = p_mensagem) antes
   where m.id = p_mensagem and m.autor_id = auth.uid() and m.tipo <> 'sistema' and not m.apagada
  returning antes.foto into v_foto;
  if not found then raise exception 'Só dá para apagar as suas mensagens.'; end if;
  return v_foto;
end $$;

create or replace function public.marcar_conversa_lida(p_conversa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  -- Pedido de mensagem ainda não aceito não marca como lido (quem enviou não fica sabendo).
  update public.conversa_membros set lida_em = now() where conversa_id = p_conversa and usuario_id = auth.uid() and situacao = 'ativo';
  if not found and exists (select 1 from public.conversas c where c.id = p_conversa and c.tipo = 'estabelecimento' and public.atende_estab(c.estabelecimento_id)) then
    update public.conversas set lida_estab_em = now() where id = p_conversa;
  end if;
end $$;

-- Lista do Chat no App.
create or replace function public.minhas_conversas()
returns table (id uuid, tipo text, titulo text, foto text, link text, situacao text, ultima_texto text, ultima_tipo text,
               ultima_minha boolean, ultima_em timestamptz, nao_lidas int, membros int, quando timestamptz, local_nome text)
language sql stable security definer set search_path = public as $$
  select c.id, c.tipo,
         case c.tipo when 'direta' then o.nome when 'estabelecimento' then e.nome else c.titulo end,
         case c.tipo when 'direta' then o.foto_url when 'estabelecimento' then e.logo_url else l.logo_url end,
         case c.tipo when 'direta' then o.usuario when 'estabelecimento' then e.id::text else null end,
         m.situacao,
         case when u.apagada then 'Mensagem apagada' when u.tipo = 'foto' and u.texto is null then 'Foto' else u.texto end,
         u.tipo, u.autor_id = auth.uid() and not u.como_estab, coalesce(u.criado_em, c.criado_em),
         (select count(*) from public.mensagens x where x.conversa_id = c.id and x.criado_em > m.lida_em
             and (x.autor_id is distinct from auth.uid() or x.como_estab) and x.tipo <> 'sistema')::int,
         (select count(*) from public.conversa_membros y where y.conversa_id = c.id and y.situacao = 'ativo')::int,
         c.quando, l.nome
    from public.conversa_membros m
    join public.conversas c on c.id = m.conversa_id
    left join lateral (select p.nome, p.usuario, p.foto_url, p.suspenso, p.id from public.conversa_membros mo join public.perfis p on p.id = mo.usuario_id
                        where c.tipo = 'direta' and mo.conversa_id = c.id and mo.usuario_id <> auth.uid() limit 1) o on true
    left join public.estabelecimentos e on e.id = c.estabelecimento_id
    left join public.estabelecimentos l on l.id = c.local_id
    left join lateral (select x.* from public.mensagens x where x.conversa_id = c.id order by x.criado_em desc limit 1) u on true
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

-- Cabeçalho de uma conversa + participantes.
create or replace function public.dados_conversa(p_conversa uuid)
returns table (id uuid, tipo text, titulo text, foto text, link text, situacao text, quando timestamptz,
               local_id uuid, local_nome text, local_lat double precision, local_lng double precision, local_endereco text,
               como_estab boolean, eu_admin boolean, bloqueado boolean)
language sql stable security definer set search_path = public as $$
  select c.id, c.tipo,
         case c.tipo when 'direta' then o.nome when 'estabelecimento' then case when m.usuario_id is null then cl.nome else e.nome end else c.titulo end,
         case c.tipo when 'direta' then o.foto_url when 'estabelecimento' then case when m.usuario_id is null then cl.foto_url else e.logo_url end else l.logo_url end,
         case c.tipo when 'direta' then o.usuario when 'estabelecimento' then case when m.usuario_id is null then null else e.id::text end else null end,
         coalesce(m.situacao, 'ativo'), c.quando, l.id, l.nome, l.latitude, l.longitude, l.endereco,
         m.usuario_id is null, coalesce(m.papel = 'admin', false),
         c.tipo = 'direta' and (o.id is null or o.suspenso or public.bloqueado_entre(o.id, auth.uid()))
    from public.conversas c
    left join public.conversa_membros m on m.conversa_id = c.id and m.usuario_id = auth.uid()
    left join lateral (select p.* from public.conversa_membros mo join public.perfis p on p.id = mo.usuario_id
                        where c.tipo = 'direta' and mo.conversa_id = c.id and mo.usuario_id <> auth.uid() limit 1) o on true
    left join lateral (select p.nome, p.foto_url from public.conversa_membros mo join public.perfis p on p.id = mo.usuario_id
                        where c.tipo = 'estabelecimento' and mo.conversa_id = c.id limit 1) cl on true
    left join public.estabelecimentos e on e.id = c.estabelecimento_id
    left join public.estabelecimentos l on l.id = c.local_id
   where c.id = p_conversa and public.pode_ver_conversa(c.id);
$$;

create or replace function public.membros_conversa(p_conversa uuid)
returns table (id uuid, nome text, usuario text, foto_url text, situacao text, papel text, bora boolean, lida_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.usuario, p.foto_url, m.situacao, m.papel, m.bora, m.lida_em
    from public.conversa_membros m join public.perfis p on p.id = m.usuario_id
   where m.conversa_id = p_conversa and m.situacao in ('ativo', 'pedido') and public.pode_ver_conversa(p_conversa)
   order by m.papel = 'admin' desc, m.situacao, p.nome;
$$;

-- ============================================================
-- Rolê: Bora! e localização
-- ============================================================
create or replace function public.bora(p_conversa uuid, p_vou boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_antes boolean;
begin
  select bora into v_antes from public.conversa_membros m join public.conversas c on c.id = m.conversa_id
   where m.conversa_id = p_conversa and m.usuario_id = auth.uid() and m.situacao = 'ativo' and c.tipo = 'role';
  if not found then raise exception 'Você não está neste rolê.'; end if;
  update public.conversa_membros set bora = p_vou where conversa_id = p_conversa and usuario_id = auth.uid();
  if p_vou and not v_antes then perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' topou o rolê! Bora!'); end if;
end $$;

-- p_minutos: 30, 60 ou nulo (até desligar). Só dentro do rolê, só para quem está nele.
create or replace function public.compartilhar_local(p_conversa uuid, p_lat double precision, p_lng double precision, p_minutos int)
returns void language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_conta_ativa();
  if not exists (select 1 from public.conversas where id = p_conversa and tipo = 'role') or not public.membro_ativo(p_conversa) then
    raise exception 'A localização só pode ser compartilhada dentro de um rolê.';
  end if;
  if p_minutos is not null and p_minutos not between 5 and 480 then raise exception 'Tempo inválido.'; end if;
  insert into public.localizacoes_role (conversa_id, usuario_id, latitude, longitude, ate)
  values (p_conversa, auth.uid(), p_lat, p_lng, case when p_minutos is null then null else now() + make_interval(mins => p_minutos) end)
  on conflict (conversa_id, usuario_id) do update set latitude = excluded.latitude, longitude = excluded.longitude, atualizado_em = now(), ate = excluded.ate;
  perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' está compartilhando a localização'
    || case when p_minutos is null then '' when p_minutos < 60 then ' por ' || p_minutos || ' min' else ' por ' || (p_minutos / 60) || ' h' end);
end $$;

-- Atualiza a posição sem mudar o prazo (o App chama de tempos em tempos).
create or replace function public.atualizar_local(p_conversa uuid, p_lat double precision, p_lng double precision)
returns boolean language plpgsql security definer set search_path = public as $$
begin
  update public.localizacoes_role set latitude = p_lat, longitude = p_lng, atualizado_em = now()
   where conversa_id = p_conversa and usuario_id = auth.uid() and (ate is null or ate > now()) and public.membro_ativo(p_conversa);
  return found;
end $$;

create or replace function public.parar_local(p_conversa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  delete from public.localizacoes_role where conversa_id = p_conversa and usuario_id = auth.uid();
  if found then perform public.mensagem_sistema(p_conversa, public.nome_curto(auth.uid()) || ' parou de compartilhar a localização'); end if;
end $$;

create or replace function public.locais_do_role(p_conversa uuid)
returns table (usuario_id uuid, nome text, foto_url text, latitude double precision, longitude double precision, atualizado_em timestamptz, ate timestamptz)
language sql stable security definer set search_path = public as $$
  select l.usuario_id, p.nome, p.foto_url, l.latitude, l.longitude, l.atualizado_em, l.ate
    from public.localizacoes_role l join public.perfis p on p.id = l.usuario_id
    join public.conversa_membros m on m.conversa_id = l.conversa_id and m.usuario_id = l.usuario_id and m.situacao = 'ativo'
   where l.conversa_id = p_conversa and public.membro_ativo(p_conversa)
     and (l.ate is null or l.ate > now()) and not public.bloqueado_entre(l.usuario_id, auth.uid());
$$;

-- ============================================================
-- Mensagens do estabelecimento (T2001)
-- ============================================================
create or replace function public.conversas_do_estab(p_estab uuid)
returns table (id uuid, cliente text, foto text, ultima_texto text, ultima_estab boolean, ultima_em timestamptz, nao_lidas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.atende_estab(p_estab) then raise exception 'Sem acesso ao Mensagens deste estabelecimento.'; end if;
  return query
  select c.id, coalesce(cl.nome, 'Cliente'), cl.foto_url,
         case when u.apagada then 'Mensagem apagada' when u.tipo = 'foto' and u.texto is null then 'Foto' else u.texto end,
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

create or replace function public.estab_nao_lidas(p_estab uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.atende_estab(p_estab) then
    (select count(distinct c.id) from public.conversas c join public.mensagens x on x.conversa_id = c.id
      where c.tipo = 'estabelecimento' and c.estabelecimento_id = p_estab and x.criado_em > c.lida_estab_em and not x.como_estab and x.tipo <> 'sistema')::int
  else 0 end;
$$;

-- ============================================================
-- Fotos do chat (pasta = id da conversa; só quem participa vê)
-- ============================================================
create or replace function public.pasta_de_conversa(p_nome text)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v uuid;
begin
  begin
    v := split_part(p_nome, '/', 1)::uuid;
  exception when others then return false;
  end;
  return public.pode_ver_conversa(v);
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('chat', 'chat', false)
    on conflict (id) do update set public = false;
    execute 'drop policy if exists "chat ler" on storage.objects';
    execute $p$create policy "chat ler" on storage.objects for select to authenticated
      using (bucket_id = 'chat' and public.pasta_de_conversa(name))$p$;
    execute 'drop policy if exists "chat enviar" on storage.objects';
    execute $p$create policy "chat enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'chat' and public.pasta_de_conversa(name))$p$;
    execute 'drop policy if exists "chat apagar" on storage.objects';
    execute $p$create policy "chat apagar" on storage.objects for delete to authenticated
      using (bucket_id = 'chat' and owner = auth.uid())$p$;
  end if;
end $$;

-- Tempo real.
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['mensagens', 'conversa_membros', 'localizacoes_role'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

-- ============================================================
-- Denúncia de mensagem (a administração vê só a mensagem denunciada)
-- ============================================================
create or replace function public.denunciar(p_tipo text, p_alvo uuid, p_motivo text, p_detalhe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  v_dono := case p_tipo
    when 'perfil' then p_alvo
    when 'story' then (select usuario_id from public.stories_pessoas where id = p_alvo)
    when 'mensagem' then (select autor_id from public.mensagens where id = p_alvo and not como_estab)
    else null end;
  if p_tipo = 'mensagem' and not exists (select 1 from public.mensagens m where m.id = p_alvo and public.pode_ver_conversa(m.conversa_id)) then
    raise exception 'Mensagem não encontrada.';
  end if;
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
                          when 'mensagem' then (select texto from public.mensagens where mensagens.id = d.alvo_id)
                          when 'perfil' then pa.bio end,
         case d.tipo_alvo when 'story' then (select foto_url from public.stories_pessoas where stories_pessoas.id = d.alvo_id)
                          when 'publicacao' then (select foto_url from public.publicacoes where publicacoes.id = d.alvo_id) end,
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
    elsif d.tipo_alvo = 'mensagem' then update public.mensagens set apagada = true, texto = null, foto = null where id = d.alvo_id;
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
  -- A mesma decisão vale para todas as denúncias abertas sobre o mesmo conteúdo.
  update public.denuncias
     set situacao = case when p_acao = 'arquivado' then 'arquivada' else 'resolvida' end,
         acao = p_acao, nota = nullif(btrim(coalesce(p_nota, '')), ''), resolvida_por = auth.uid(), resolvida_em = now()
   where situacao = 'aberta' and tipo_alvo = d.tipo_alvo and alvo_id = d.alvo_id;
end $$;

revoke execute on function public.atende_estab(uuid), public.pode_ver_conversa(uuid), public.membro_ativo(uuid), public.exigir_conta_ativa(),
  public.nome_curto(uuid), public.mensagem_sistema(uuid, text), public.pasta_de_conversa(text) from public, anon;
grant execute on function public.atende_estab(uuid), public.pode_ver_conversa(uuid), public.membro_ativo(uuid), public.pasta_de_conversa(text) to authenticated;
revoke execute on function public.mensagem_sistema(uuid, text), public.nome_curto(uuid), public.exigir_conta_ativa() from authenticated;
revoke execute on function public.abrir_conversa(uuid), public.abrir_conversa_estab(uuid), public.adicionar_ao_role(uuid, uuid[]),
  public.criar_role(text, uuid, timestamptz, uuid[]), public.editar_role(uuid, text, uuid, timestamptz), public.responder_conversa(uuid, boolean),
  public.sair_da_conversa(uuid), public.remover_do_role(uuid, uuid), public.enviar_mensagem(uuid, text, text), public.apagar_mensagem(uuid),
  public.marcar_conversa_lida(uuid), public.minhas_conversas(), public.chat_nao_lidas(), public.dados_conversa(uuid), public.membros_conversa(uuid),
  public.bora(uuid, boolean), public.compartilhar_local(uuid, double precision, double precision, int), public.atualizar_local(uuid, double precision, double precision),
  public.parar_local(uuid), public.locais_do_role(uuid), public.conversas_do_estab(uuid), public.estab_nao_lidas(uuid) from public, anon;
grant execute on function public.abrir_conversa(uuid), public.abrir_conversa_estab(uuid), public.adicionar_ao_role(uuid, uuid[]),
  public.criar_role(text, uuid, timestamptz, uuid[]), public.editar_role(uuid, text, uuid, timestamptz), public.responder_conversa(uuid, boolean),
  public.sair_da_conversa(uuid), public.remover_do_role(uuid, uuid), public.enviar_mensagem(uuid, text, text), public.apagar_mensagem(uuid),
  public.marcar_conversa_lida(uuid), public.minhas_conversas(), public.chat_nao_lidas(), public.dados_conversa(uuid), public.membros_conversa(uuid),
  public.bora(uuid, boolean), public.compartilhar_local(uuid, double precision, double precision, int), public.atualizar_local(uuid, double precision, double precision),
  public.parar_local(uuid), public.locais_do_role(uuid), public.conversas_do_estab(uuid), public.estab_nao_lidas(uuid) to authenticated;

select 'RoVibes 014 aplicado com sucesso' as resultado;
