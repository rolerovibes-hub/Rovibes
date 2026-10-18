-- RoVibes 013: pessoas — @usuário, bio, perfil privado, seguir pessoas, stories de pessoas,
-- bloquear, denunciar e moderação (Denúncias A1003).
-- Pode ser executado mais de uma vez.

-- ============================================================
-- Perfil público
-- ============================================================
alter table public.perfis add column if not exists usuario text;
alter table public.perfis add column if not exists bio text check (bio is null or length(bio) <= 160);
alter table public.perfis add column if not exists privado boolean not null default false;
alter table public.perfis add column if not exists suspenso boolean not null default false;
alter table public.perfis add column if not exists advertencias int not null default 0;

create or replace function public.sugerir_usuario(p_nome text)
returns text language plpgsql volatile security definer set search_path = public as $$
declare
  base text := left(regexp_replace(lower(translate(coalesce(p_nome, ''),
                 'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ', 'aaaaaeeeeiiiiooooouuuucnaaaaaeeeeiiiiooooouuuucn')), '[^a-z0-9]+', '.', 'g'), 18);
  v text;
begin
  base := trim(both '.' from base);
  if length(base) < 3 then base := 'rolezeiro'; end if;
  v := base;
  while exists (select 1 from public.perfis where usuario = v) loop
    v := base || floor(random() * 9000 + 100)::int;
  end loop;
  return v;
end $$;

create or replace function public.completar_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.usuario is null or btrim(new.usuario) = '' then new.usuario := public.sugerir_usuario(new.nome); end if;
  new.usuario := lower(btrim(new.usuario));
  return new;
end $$;
drop trigger if exists perfis_completar on public.perfis;
create trigger perfis_completar before insert or update of usuario on public.perfis for each row execute function public.completar_perfil();

update public.perfis set usuario = public.sugerir_usuario(nome) where usuario is null;
alter table public.perfis alter column usuario set not null;
do $$ begin
  alter table public.perfis add constraint perfis_usuario_unico unique (usuario);
exception when duplicate_object or duplicate_table then null; end $$;
do $$ begin
  alter table public.perfis add constraint perfis_usuario_formato check (usuario ~ '^[a-z0-9._]{3,24}$');
exception when duplicate_object then null; end $$;

-- Os dados privados (nascimento, telefone) deixam de ser visíveis para todos.
drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (id = auth.uid() or public.eh_admin());
-- Quem está suspenso não muda o próprio perfil para fugir da moderação.
create or replace function public.proteger_perfil()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then
    new.suspenso := old.suspenso;
    new.advertencias := old.advertencias;
  end if;
  return new;
end $$;
drop trigger if exists perfis_proteger on public.perfis;
create trigger perfis_proteger before update on public.perfis for each row execute function public.proteger_perfil();

-- ============================================================
-- Bloqueios
-- ============================================================
create table if not exists public.bloqueios (
  bloqueador_id uuid not null references auth.users(id) on delete cascade,
  bloqueado_id uuid not null references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (bloqueador_id, bloqueado_id),
  check (bloqueador_id <> bloqueado_id)
);
alter table public.bloqueios enable row level security;
drop policy if exists bloqueios_meus on public.bloqueios;
create policy bloqueios_meus on public.bloqueios for select to authenticated using (bloqueador_id = auth.uid());

create or replace function public.bloqueado_entre(a uuid, b uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.bloqueios where (bloqueador_id = a and bloqueado_id = b) or (bloqueador_id = b and bloqueado_id = a));
$$;

-- Dados públicos de quem não bloqueou você e não está suspenso.
create or replace view public.perfis_publicos as
  select p.id, p.nome, p.usuario, p.foto_url, p.bio, p.privado
    from public.perfis p
   where not p.suspenso and not public.bloqueado_entre(p.id, auth.uid());
grant select on public.perfis_publicos to authenticated;
revoke all on public.perfis_publicos from anon;

-- ============================================================
-- Seguir pessoas
-- ============================================================
create table if not exists public.seguidores_pessoas (
  seguidor_id uuid not null references auth.users(id) on delete cascade,
  seguido_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'ativo' check (situacao in ('ativo', 'pendente')),
  criado_em timestamptz not null default now(),
  primary key (seguidor_id, seguido_id),
  check (seguidor_id <> seguido_id)
);
create index if not exists seguidores_pessoas_seguido_idx on public.seguidores_pessoas (seguido_id, situacao);
alter table public.seguidores_pessoas enable row level security;
drop policy if exists seg_pessoas_ler on public.seguidores_pessoas;
create policy seg_pessoas_ler on public.seguidores_pessoas for select to authenticated
  using (seguidor_id = auth.uid() or seguido_id = auth.uid());

create or replace function public.segue(p_seguidor uuid, p_seguido uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.seguidores_pessoas where seguidor_id = p_seguidor and seguido_id = p_seguido and situacao = 'ativo');
$$;

create or replace function public.seguir_pessoa(p_pessoa uuid)
returns text language plpgsql security definer set search_path = public as $$
declare v_privado boolean; v_sit text;
begin
  if auth.uid() is null or p_pessoa = auth.uid() then raise exception 'Não é possível seguir.'; end if;
  select privado into v_privado from public.perfis where id = p_pessoa and not suspenso;
  if not found or public.bloqueado_entre(auth.uid(), p_pessoa) then raise exception 'Perfil não encontrado.'; end if;
  v_sit := case when v_privado then 'pendente' else 'ativo' end;
  insert into public.seguidores_pessoas (seguidor_id, seguido_id, situacao) values (auth.uid(), p_pessoa, v_sit)
  on conflict (seguidor_id, seguido_id) do nothing;
  select situacao into v_sit from public.seguidores_pessoas where seguidor_id = auth.uid() and seguido_id = p_pessoa;
  return v_sit;
end $$;

create or replace function public.deixar_de_seguir(p_pessoa uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.seguidores_pessoas where seguidor_id = auth.uid() and seguido_id = p_pessoa;
$$;

create or replace function public.responder_seguidor(p_seguidor uuid, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_aceitar then
    update public.seguidores_pessoas set situacao = 'ativo' where seguidor_id = p_seguidor and seguido_id = auth.uid() and situacao = 'pendente';
  else
    delete from public.seguidores_pessoas where seguidor_id = p_seguidor and seguido_id = auth.uid();
  end if;
end $$;

-- Remover um seguidor (sem bloquear).
create or replace function public.remover_seguidor(p_seguidor uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.seguidores_pessoas where seguidor_id = p_seguidor and seguido_id = auth.uid();
$$;

-- Ao ficar público, pedidos pendentes viram seguidores.
create or replace function public.ao_mudar_privacidade()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.privado and not new.privado then
    update public.seguidores_pessoas set situacao = 'ativo' where seguido_id = new.id and situacao = 'pendente';
  end if;
  return new;
end $$;
drop trigger if exists perfis_privacidade on public.perfis;
create trigger perfis_privacidade after update of privado on public.perfis for each row execute function public.ao_mudar_privacidade();

create or replace function public.bloquear(p_pessoa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pessoa = auth.uid() then raise exception 'Não é possível bloquear você mesmo.'; end if;
  insert into public.bloqueios (bloqueador_id, bloqueado_id) values (auth.uid(), p_pessoa) on conflict do nothing;
  delete from public.seguidores_pessoas
   where (seguidor_id = auth.uid() and seguido_id = p_pessoa) or (seguidor_id = p_pessoa and seguido_id = auth.uid());
end $$;

create or replace function public.desbloquear(p_pessoa uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.bloqueios where bloqueador_id = auth.uid() and bloqueado_id = p_pessoa;
$$;

create or replace function public.meus_bloqueados()
returns table (id uuid, nome text, usuario text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.usuario from public.bloqueios b join public.perfis p on p.id = b.bloqueado_id
   where b.bloqueador_id = auth.uid() order by b.criado_em desc;
$$;

-- Página de uma pessoa: dados públicos, contadores e a relação com quem está vendo.
create or replace function public.perfil_pessoa(p_usuario text)
returns table (id uuid, nome text, usuario text, foto_url text, bio text, privado boolean, seguidores int, seguindo int,
               eu_sigo text, me_segue boolean, eu_bloqueei boolean, pode_ver boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.usuario, p.foto_url, p.bio, p.privado,
         (select count(*) from public.seguidores_pessoas s where s.seguido_id = p.id and s.situacao = 'ativo')::int,
         (select count(*) from public.seguidores_pessoas s where s.seguidor_id = p.id and s.situacao = 'ativo')::int,
         (select s.situacao from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id),
         public.segue(p.id, auth.uid()),
         exists (select 1 from public.bloqueios b where b.bloqueador_id = auth.uid() and b.bloqueado_id = p.id),
         p.id = auth.uid() or not p.privado or public.segue(auth.uid(), p.id)
    from public.perfis p
   where p.usuario = lower(btrim(p_usuario)) and not p.suspenso
     and not exists (select 1 from public.bloqueios b where b.bloqueador_id = p.id and b.bloqueado_id = auth.uid());
$$;

create or replace function public.buscar_pessoas(p_termo text)
returns table (id uuid, nome text, usuario text, foto_url text, privado boolean, eu_sigo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.usuario, p.foto_url, p.privado,
         (select s.situacao from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id)
    from public.perfis p
   where not p.suspenso and p.id <> auth.uid() and not public.bloqueado_entre(p.id, auth.uid())
     and length(btrim(p_termo)) >= 2
     and (p.usuario ilike '%' || lower(btrim(ltrim(p_termo, '@'))) || '%' or p.nome ilike '%' || btrim(p_termo) || '%')
   order by (p.usuario = lower(btrim(ltrim(p_termo, '@')))) desc, p.nome
   limit 30;
$$;

-- Sugestões: quem fez check-in nos mesmos lugares nos últimos 30 dias.
create or replace function public.pessoas_sugeridas()
returns table (id uuid, nome text, usuario text, foto_url text, privado boolean, em_comum int)
language sql stable security definer set search_path = public as $$
  with meus as (
    select distinct estabelecimento_id from public.checkins where usuario_id = auth.uid() and criado_em > now() - interval '30 days'
  )
  select p.id, p.nome, p.usuario, p.foto_url, p.privado, count(distinct c.estabelecimento_id)::int
    from public.checkins c join meus m on m.estabelecimento_id = c.estabelecimento_id
    join public.perfis p on p.id = c.usuario_id
   where c.criado_em > now() - interval '30 days' and c.usuario_id <> auth.uid() and not p.suspenso
     and not public.bloqueado_entre(p.id, auth.uid())
     and not exists (select 1 from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id)
   group by p.id, p.nome, p.usuario, p.foto_url, p.privado
   order by 6 desc, p.nome
   limit 12;
$$;

-- Lista de seguidores / seguindo (respeita perfil privado).
create or replace function public.lista_conexoes(p_pessoa uuid, p_tipo text)
returns table (id uuid, nome text, usuario text, foto_url text, situacao text)
language plpgsql stable security definer set search_path = public as $$
begin
  if not (p_pessoa = auth.uid() or not coalesce((select privado from public.perfis where perfis.id = p_pessoa), true) or public.segue(auth.uid(), p_pessoa)) then
    raise exception 'Este perfil é privado.';
  end if;
  return query
  select p.id, p.nome, p.usuario, p.foto_url, s.situacao
    from public.seguidores_pessoas s
    join public.perfis p on p.id = case when p_tipo = 'seguidores' then s.seguidor_id else s.seguido_id end
   where (case when p_tipo = 'seguidores' then s.seguido_id else s.seguidor_id end) = p_pessoa
     and (s.situacao = 'ativo' or (p_pessoa = auth.uid() and p_tipo = 'seguidores'))
     and not p.suspenso and not public.bloqueado_entre(p.id, auth.uid())
   order by s.situacao desc, p.nome
   limit 500;
end $$;

-- ============================================================
-- Stories de pessoas (24 h, só para quem segue)
-- ============================================================
create table if not exists public.stories_pessoas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  foto_url text not null,
  legenda text check (legenda is null or length(legenda) <= 200),
  estabelecimento_id uuid references public.estabelecimentos(id) on delete set null,
  oculto boolean not null default false,
  criado_em timestamptz not null default now(),
  expira_em timestamptz not null default now() + interval '24 hours'
);
create index if not exists stories_pessoas_idx on public.stories_pessoas (usuario_id, expira_em desc);
alter table public.stories_pessoas enable row level security;
drop policy if exists stories_pessoas_ler on public.stories_pessoas;
create policy stories_pessoas_ler on public.stories_pessoas for select to authenticated
  using (usuario_id = auth.uid()
      or (not oculto and expira_em > now() and public.segue(auth.uid(), usuario_id) and not public.bloqueado_entre(usuario_id, auth.uid()))
      or public.eh_admin());
drop policy if exists stories_pessoas_criar on public.stories_pessoas;
create policy stories_pessoas_criar on public.stories_pessoas for insert to authenticated
  with check (usuario_id = auth.uid() and not oculto
              and not exists (select 1 from public.perfis where id = auth.uid() and suspenso)
              and foto_url like '%/avatares/' || auth.uid()::text || '/%');
drop policy if exists stories_pessoas_apagar on public.stories_pessoas;
create policy stories_pessoas_apagar on public.stories_pessoas for delete to authenticated using (usuario_id = auth.uid());

create table if not exists public.visualizacoes_story_pessoa (
  story_id uuid not null references public.stories_pessoas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  visto_em timestamptz not null default now(),
  primary key (story_id, usuario_id)
);
alter table public.visualizacoes_story_pessoa enable row level security;
drop policy if exists vsp_meus on public.visualizacoes_story_pessoa;
create policy vsp_meus on public.visualizacoes_story_pessoa for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

-- Quem viu o meu story.
create or replace function public.quem_viu_story(p_story uuid)
returns table (nome text, usuario text, foto_url text, visto_em timestamptz)
language sql stable security definer set search_path = public as $$
  select p.nome, p.usuario, p.foto_url, v.visto_em
    from public.visualizacoes_story_pessoa v join public.perfis p on p.id = v.usuario_id
    join public.stories_pessoas s on s.id = v.story_id
   where v.story_id = p_story and s.usuario_id = auth.uid()
   order by v.visto_em desc;
$$;

-- ============================================================
-- Denúncias e moderação (Administração A1003)
-- ============================================================
create table if not exists public.denuncias (
  id uuid primary key default gen_random_uuid(),
  denunciante_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  tipo_alvo text not null check (tipo_alvo in ('perfil', 'story', 'publicacao', 'mensagem')),
  alvo_id uuid not null,
  alvo_usuario uuid references auth.users(id) on delete set null,
  motivo text not null check (motivo in ('spam', 'assedio', 'improprio', 'perfil_falso', 'menor', 'violencia', 'outro')),
  detalhe text check (detalhe is null or length(detalhe) <= 500),
  situacao text not null default 'aberta' check (situacao in ('aberta', 'resolvida', 'arquivada')),
  acao text check (acao in ('ocultado', 'advertido', 'suspenso', 'arquivado')),
  nota text,
  criada_em timestamptz not null default now(),
  resolvida_por uuid references auth.users(id),
  resolvida_em timestamptz
);
create index if not exists denuncias_situacao_idx on public.denuncias (situacao, criada_em);
alter table public.denuncias enable row level security;
drop policy if exists denuncias_ler on public.denuncias;
create policy denuncias_ler on public.denuncias for select to authenticated using (denunciante_id = auth.uid() or public.eh_admin());

create or replace function public.denunciar(p_tipo text, p_alvo uuid, p_motivo text, p_detalhe text)
returns void language plpgsql security definer set search_path = public as $$
declare v_dono uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  v_dono := case p_tipo
    when 'perfil' then p_alvo
    when 'story' then (select usuario_id from public.stories_pessoas where id = p_alvo)
    else null end;
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

create or replace function public.reativar_conta(p_pessoa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a administração.'; end if;
  update public.perfis set suspenso = false where id = p_pessoa;
end $$;

grant execute on function public.seguir_pessoa(uuid), public.deixar_de_seguir(uuid), public.responder_seguidor(uuid, boolean),
  public.remover_seguidor(uuid), public.bloquear(uuid), public.meus_bloqueados(), public.desbloquear(uuid), public.perfil_pessoa(text), public.buscar_pessoas(text),
  public.pessoas_sugeridas(), public.lista_conexoes(uuid, text), public.quem_viu_story(uuid), public.denunciar(text, uuid, text, text),
  public.denuncias_abertas(), public.resolver_denuncia(uuid, text, text), public.reativar_conta(uuid) to authenticated;
revoke execute on function public.sugerir_usuario(text) from public, anon, authenticated;
revoke execute on function public.seguir_pessoa(uuid), public.deixar_de_seguir(uuid), public.responder_seguidor(uuid, boolean),
  public.remover_seguidor(uuid), public.bloquear(uuid), public.meus_bloqueados(), public.desbloquear(uuid), public.perfil_pessoa(text), public.buscar_pessoas(text),
  public.pessoas_sugeridas(), public.lista_conexoes(uuid, text), public.quem_viu_story(uuid), public.denunciar(text, uuid, text, text),
  public.denuncias_abertas(), public.resolver_denuncia(uuid, text, text), public.reativar_conta(uuid) from public, anon;

select 'RoVibes 013 aplicado com sucesso' as resultado;
