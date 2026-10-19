-- RoVibes 027: Publicações das pessoas no feed e na grade do perfil.
-- Foto com legenda e lugar marcado; perfil privado só aparece para quem segue. Curtidas, denúncia e feed misto.
-- Pode ser executado mais de uma vez.

create table if not exists public.publicacoes_pessoas (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  foto_url text not null,
  texto text check (texto is null or length(texto) <= 2200),
  estabelecimento_id uuid references public.estabelecimentos(id) on delete set null,
  oculto boolean not null default false,
  criado_em timestamptz not null default now()
);
create index if not exists publicacoes_pessoas_usuario_idx on public.publicacoes_pessoas (usuario_id, criado_em desc);
create index if not exists publicacoes_pessoas_data_idx on public.publicacoes_pessoas (criado_em desc);

create table if not exists public.curtidas_pessoas (
  publicacao_id uuid not null references public.publicacoes_pessoas(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (publicacao_id, usuario_id)
);

alter table public.publicacoes_pessoas enable row level security;
alter table public.curtidas_pessoas enable row level security;

-- Quem pode ver as publicações de uma pessoa.
create or replace function public.ve_publicacoes_de(p_pessoa uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select p_pessoa = auth.uid() or public.eh_admin()
      or exists (select 1 from public.perfis p where p.id = p_pessoa and not p.suspenso
                   and (not p.privado or public.segue(auth.uid(), p_pessoa))
                   and not public.bloqueado_entre(p_pessoa, auth.uid()));
$$;

drop policy if exists publicacoes_pessoas_ler on public.publicacoes_pessoas;
create policy publicacoes_pessoas_ler on public.publicacoes_pessoas for select to authenticated
  using (usuario_id = auth.uid() or public.eh_admin() or (not oculto and public.ve_publicacoes_de(usuario_id)));
drop policy if exists publicacoes_pessoas_criar on public.publicacoes_pessoas;
create policy publicacoes_pessoas_criar on public.publicacoes_pessoas for insert to authenticated
  with check (usuario_id = auth.uid() and not oculto
              and not exists (select 1 from public.perfis where id = auth.uid() and suspenso)
              and foto_url like '%/avatares/' || auth.uid()::text || '/%');
drop policy if exists publicacoes_pessoas_editar on public.publicacoes_pessoas;
create policy publicacoes_pessoas_editar on public.publicacoes_pessoas for update to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid() and not oculto);
drop policy if exists publicacoes_pessoas_apagar on public.publicacoes_pessoas;
create policy publicacoes_pessoas_apagar on public.publicacoes_pessoas for delete to authenticated using (usuario_id = auth.uid());

drop policy if exists curtidas_pessoas_ler on public.curtidas_pessoas;
create policy curtidas_pessoas_ler on public.curtidas_pessoas for select to authenticated
  using (exists (select 1 from public.publicacoes_pessoas p where p.id = publicacao_id));
drop policy if exists curtidas_pessoas_criar on public.curtidas_pessoas;
create policy curtidas_pessoas_criar on public.curtidas_pessoas for insert to authenticated
  with check (usuario_id = auth.uid() and exists (select 1 from public.publicacoes_pessoas p where p.id = publicacao_id));
drop policy if exists curtidas_pessoas_apagar on public.curtidas_pessoas;
create policy curtidas_pessoas_apagar on public.curtidas_pessoas for delete to authenticated using (usuario_id = auth.uid());

-- Grade do perfil.
create or replace function public.publicacoes_da_pessoa(p_pessoa uuid, p_antes timestamptz)
returns table (id uuid, foto_url text, texto text, criado_em timestamptz, local jsonb, curtidas int, curti boolean)
language sql stable security definer set search_path = public as $$
  select p.id, p.foto_url, p.texto, p.criado_em,
         case when e.id is not null then jsonb_build_object('id', e.id, 'nome', e.nome) end,
         (select count(*)::int from public.curtidas_pessoas c where c.publicacao_id = p.id),
         exists (select 1 from public.curtidas_pessoas c where c.publicacao_id = p.id and c.usuario_id = auth.uid())
    from public.publicacoes_pessoas p left join public.estabelecimentos e on e.id = p.estabelecimento_id
   where p.usuario_id = p_pessoa and (not p.oculto or p.usuario_id = auth.uid()) and public.ve_publicacoes_de(p_pessoa)
     and (p_antes is null or p.criado_em < p_antes)
   order by p.criado_em desc limit 60;
$$;

-- Feed misto: lugares (com a ordem do feed 016) e publicações de quem a pessoa segue (e as próprias).
create or replace function public.feed_geral(p_limite int)
returns table (tipo text, id uuid, texto text, foto_url text, criado_em timestamptz, autor jsonb, evento jsonb, local jsonb,
               curtidas int, curti boolean, sigo boolean, motivo text)
language sql stable security definer set search_path = public as $$
  with lugares as (
    select 'lugar'::text as tipo, f.id, f.texto, f.foto_url, f.criado_em, f.estabelecimento as autor, f.evento, null::jsonb as local,
           f.curtidas, f.curti, f.sigo, f.motivo, row_number() over () as pos
      from public.feed_publicacoes(least(coalesce(p_limite, 40), 60), null) f
  ),
  pessoas as (
    select 'pessoa'::text as tipo, p.id, p.texto, p.foto_url, p.criado_em,
           jsonb_build_object('id', pf.id, 'nome', pf.nome, 'usuario', pf.usuario, 'foto_url', pf.foto_url) as autor,
           null::jsonb as evento,
           case when e.id is not null then jsonb_build_object('id', e.id, 'nome', e.nome) end as local,
           (select count(*)::int from public.curtidas_pessoas c where c.publicacao_id = p.id) as curtidas,
           exists (select 1 from public.curtidas_pessoas c where c.publicacao_id = p.id and c.usuario_id = auth.uid()) as curti,
           true as sigo, null::text as motivo,
           row_number() over (order by p.criado_em desc) as pos
      from public.publicacoes_pessoas p join public.perfis pf on pf.id = p.usuario_id
      left join public.estabelecimentos e on e.id = p.estabelecimento_id
     where not p.oculto and not pf.suspenso and p.criado_em > now() - interval '30 days'
       and (p.usuario_id = auth.uid() or (public.segue(auth.uid(), p.usuario_id) and not public.bloqueado_entre(p.usuario_id, auth.uid())))
     limit 40
  )
  select x.tipo, x.id, x.texto, x.foto_url, x.criado_em, x.autor, x.evento, x.local, x.curtidas, x.curti, x.sigo, x.motivo
    from (select l.*, l.pos::numeric as ordem from lugares l
          union all
          -- Amigos intercalados com os lugares; o mais recente sobe.
          select p.*, (p.pos - 1) * 1.6 + 0.5 + least(extract(epoch from now() - p.criado_em) / 86400, 3) from pessoas p) x
   order by x.ordem
   limit least(coalesce(p_limite, 40), 80);
$$;

-- Denúncia de publicação de pessoa ("post").
alter table public.denuncias drop constraint if exists denuncias_tipo_alvo_check;
alter table public.denuncias add constraint denuncias_tipo_alvo_check check (tipo_alvo in ('perfil', 'story', 'publicacao', 'mensagem', 'post'));

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
    else null end;
  if p_tipo = 'mensagem' and not exists (select 1 from public.mensagens m where m.id = p_alvo and public.pode_ver_conversa(m.conversa_id)) then
    raise exception 'Mensagem não encontrada.';
  end if;
  if p_tipo = 'post' and v_dono is null then raise exception 'Publicação não encontrada.'; end if;
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

-- Contador de publicações no perfil.
create or replace function public.total_publicacoes(p_pessoa uuid)
returns int language sql stable security definer set search_path = public as $$
  select case when public.ve_publicacoes_de(p_pessoa)
              then (select count(*)::int from public.publicacoes_pessoas where usuario_id = p_pessoa and not oculto) end;
$$;

revoke execute on function public.ve_publicacoes_de(uuid), public.publicacoes_da_pessoa(uuid, timestamptz), public.feed_geral(int),
  public.total_publicacoes(uuid) from public, anon;
grant execute on function public.ve_publicacoes_de(uuid), public.publicacoes_da_pessoa(uuid, timestamptz), public.feed_geral(int),
  public.total_publicacoes(uuid) to authenticated;

select 'RoVibes 027 aplicado com sucesso' as resultado;
