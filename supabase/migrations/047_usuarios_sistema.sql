-- 047 · Usuários do sistema do estabelecimento (RoVibes Business e Job), separados do perfil pessoal.
-- • Cada estabelecimento tem um código; cada usuário do sistema entra com código + usuário + senha.
-- • O dono cria e gerencia os usuários. O perfil pessoal do app não acessa mais o Business/Job.
-- • CORTE: ao rodar, os vínculos das contas pessoais saem da equipe (ficam guardados só para o
--   proprietário criar o usuário dele no "Primeiro acesso" e recuperar a senha depois).
-- Pode rodar de novo sem problema.

-- ============================================================
-- Perfis de contas do sistema (não aparecem no lado social)
-- ============================================================
alter table public.perfis add column if not exists conta_sistema boolean not null default false;
alter table public.perfis alter column data_nascimento drop not null;

create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text := nullif(btrim(new.raw_user_meta_data ->> 'nome'), '');
  v_nasc date;
begin
  -- Usuário do sistema do estabelecimento (criado pelo servidor): sem idade e sem lado social.
  if coalesce((new.raw_user_meta_data ->> 'conta_sistema')::boolean, false) then
    -- @ interno (não ocupa nomes de usuário do app)
    insert into public.perfis (id, nome, data_nascimento, conta_sistema, usuario)
    values (new.id, coalesce(v_nome, split_part(new.email, '@', 1)), null, true, 'sis.' || left(replace(new.id::text, '-', ''), 20))
    on conflict (id) do update set conta_sistema = true;
    return new;
  end if;
  v_nasc := nullif(new.raw_user_meta_data ->> 'data_nascimento', '')::date;
  if v_nasc is null or v_nasc > (current_date - interval '18 years') then
    raise exception 'O RoVibes é para maiores de 18 anos.';
  end if;
  insert into public.perfis (id, nome, data_nascimento)
  values (new.id, coalesce(v_nome, split_part(new.email, '@', 1)), v_nasc)
  on conflict (id) do nothing;
  if not exists (select 1 from public.administradores) then
    insert into public.administradores (usuario_id) values (new.id);
  end if;
  return new;
end $$;

-- Ninguém transforma a própria conta em conta do sistema (nem o contrário) pelo app.
create or replace function public.perfis_tipo_fixo()
returns trigger language plpgsql as $$
begin
  if current_user not in ('postgres', 'service_role', 'supabase_admin') then new.conta_sistema := old.conta_sistema; end if;
  return new;
end $$;
drop trigger if exists perfis_tipo_fixo on public.perfis;
create trigger perfis_tipo_fixo before update on public.perfis for each row execute function public.perfis_tipo_fixo();

-- ============================================================
-- Código do estabelecimento (fixo) e responsável (conta pessoal, só para recuperar o acesso)
-- ============================================================
alter table public.estabelecimentos add column if not exists codigo text;
alter table public.estabelecimentos add column if not exists responsavel_id uuid references auth.users(id) on delete set null;

create or replace function public.gerar_codigo_estab(p_nome text)
returns text language plpgsql stable set search_path = public, extensions as $$
declare base text; v text; n int := 1;
begin
  base := regexp_replace(lower(unaccent(coalesce(p_nome, ''))), '[^a-z0-9]+', '', 'g');
  base := left(base, 20);
  if length(base) < 3 then base := base || 'estab'; end if;
  v := base;
  while exists (select 1 from public.estabelecimentos where codigo = v) loop
    n := n + 1; v := base || n;
  end loop;
  return v;
end $$;

update public.estabelecimentos set codigo = public.gerar_codigo_estab(nome) where codigo is null;
do $$ begin
  alter table public.estabelecimentos add constraint estabelecimentos_codigo_formato check (codigo ~ '^[a-z0-9-]{3,30}$');
exception when duplicate_object then null; end $$;
create unique index if not exists estabelecimentos_codigo_unico on public.estabelecimentos (codigo);

create or replace function public.estab_codigo_fixo()
returns trigger language plpgsql set search_path = public, extensions as $$
begin
  if tg_op = 'INSERT' then
    new.codigo := coalesce(nullif(lower(btrim(new.codigo)), ''), public.gerar_codigo_estab(new.nome));
  elsif new.codigo is distinct from old.codigo and current_user not in ('postgres', 'service_role', 'supabase_admin') then
    new.codigo := old.codigo; -- o código entra no login dos usuários: não muda
  end if;
  return new;
end $$;
drop trigger if exists estab_codigo_fixo on public.estabelecimentos;
create trigger estab_codigo_fixo before insert or update on public.estabelecimentos for each row execute function public.estab_codigo_fixo();

-- ============================================================
-- Usuários do sistema
-- ============================================================
create table if not exists public.contas_sistema (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  login text not null check (login ~ '^[a-z0-9._]{3,30}$'),
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  unique (estabelecimento_id, login)
);
alter table public.contas_sistema enable row level security;
drop policy if exists contas_sistema_ler on public.contas_sistema;
create policy contas_sistema_ler on public.contas_sistema for select to authenticated
  using (usuario_id = auth.uid() or public.eh_membro(estabelecimento_id) or public.eh_admin());
grant select on public.contas_sistema to authenticated;

create or replace function public.eh_conta_sistema(p_usuario uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.contas_sistema where usuario_id = p_usuario);
$$;

-- Quem sou eu no sistema (login, código e estabelecimento).
create or replace function public.meu_acesso_sistema()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('conta_sistema', true, 'login', c.login, 'codigo', e.codigo,
                                             'estabelecimento_id', c.estabelecimento_id, 'estabelecimento', e.nome)
                     from public.contas_sistema c join public.estabelecimentos e on e.id = c.estabelecimento_id
                    where c.usuario_id = auth.uid()),
                  jsonb_build_object('conta_sistema', false, 'admin', public.eh_admin()));
$$;
revoke execute on function public.meu_acesso_sistema() from public, anon;
grant execute on function public.meu_acesso_sistema() to authenticated;

-- ============================================================
-- O CORTE: contas pessoais saem da equipe (guardadas para o primeiro acesso do proprietário)
-- ============================================================
create table if not exists public.membros_legado (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null,
  cargo text,
  movido_em timestamptz not null default now(),
  primary key (estabelecimento_id, usuario_id)
);
alter table public.membros_legado enable row level security;

insert into public.membros_legado (estabelecimento_id, usuario_id, papel, cargo)
select m.estabelecimento_id, m.usuario_id, m.papel, m.cargo from public.membros m
 where not exists (select 1 from public.contas_sistema c where c.usuario_id = m.usuario_id)
on conflict do nothing;

update public.estabelecimentos e
   set responsavel_id = (select l.usuario_id from public.membros_legado l where l.estabelecimento_id = e.id and l.papel = 'proprietario' order by l.movido_em limit 1)
 where e.responsavel_id is null;
update public.estabelecimentos e set responsavel_id = e.criado_por
 where e.responsavel_id is null and not public.eh_conta_sistema(e.criado_por);

delete from public.membros m where not exists (select 1 from public.contas_sistema c where c.usuario_id = m.usuario_id);

-- Daqui em diante, a equipe só tem usuários do sistema daquele estabelecimento.
create or replace function public.membros_so_sistema()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.contas_sistema c where c.usuario_id = new.usuario_id and c.estabelecimento_id = new.estabelecimento_id) then
    raise exception 'A equipe é formada pelos usuários do sistema do estabelecimento. Crie o usuário em Pessoas e Equipe.';
  end if;
  return new;
end $$;
drop trigger if exists membros_so_sistema on public.membros;
create trigger membros_so_sistema before insert or update of usuario_id, estabelecimento_id on public.membros
  for each row execute function public.membros_so_sistema();

-- O cadastro de estabelecimento agora é pelo RoVibes Business (cria o usuário do proprietário).
revoke execute on function public.cadastrar_estabelecimento(text, smallint, text, text, text) from authenticated;

-- ============================================================
-- Contas do sistema não aparecem na busca, sugestões e perfis do app
-- ============================================================
create or replace function public.buscar_pessoas(p_termo text)
returns table (id uuid, nome text, usuario text, foto_url text, privado boolean, eu_sigo text)
language sql stable security definer set search_path = public as $$
  select p.id, p.nome, p.usuario, p.foto_url, p.privado,
         (select s.situacao from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id)
    from public.perfis p
   where not p.suspenso and not p.conta_sistema and p.id <> auth.uid() and not public.bloqueado_entre(p.id, auth.uid())
     and length(btrim(p_termo)) >= 2
     and (p.usuario ilike '%' || lower(btrim(ltrim(p_termo, '@'))) || '%' or p.nome ilike '%' || btrim(p_termo) || '%')
   order by (p.usuario = lower(btrim(ltrim(p_termo, '@')))) desc, p.nome
   limit 30;
$$;



create or replace function public.pessoas_sugeridas()
returns table (id uuid, nome text, usuario text, foto_url text, privado boolean, em_comum int)
language sql stable security definer set search_path = public as $$
  with meus as (
    select distinct estabelecimento_id from public.checkins where usuario_id = auth.uid() and criado_em > now() - interval '30 days'
  )
  select p.id, p.nome, p.usuario, p.foto_url, p.privado, count(distinct c.estabelecimento_id)::int
    from public.checkins c join meus m on m.estabelecimento_id = c.estabelecimento_id
    join public.perfis p on p.id = c.usuario_id
   where c.criado_em > now() - interval '30 days' and c.usuario_id <> auth.uid() and not p.suspenso and not p.conta_sistema
     and not public.bloqueado_entre(p.id, auth.uid())
     and not exists (select 1 from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id)
   group by p.id, p.nome, p.usuario, p.foto_url, p.privado
   order by 6 desc, p.nome
   limit 12;
$$;



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
   where p.usuario = lower(btrim(p_usuario)) and not p.suspenso and not p.conta_sistema
     and not exists (select 1 from public.bloqueios b where b.bloqueador_id = p.id and b.bloqueado_id = auth.uid());
$$;



create or replace function public.buscar_tudo(p_termo text, p_lat double precision, p_lng double precision)
returns table (tipo text, id uuid, titulo text, subtitulo text, imagem text, chave text, distancia_m double precision, pontos real, extra jsonb)
language plpgsql stable security definer set search_path = public, extensions as $$
declare t text := public.normalizar(btrim(ltrim(coalesce(p_termo, ''), '@')));
begin
  if length(t) < 2 then return; end if;
  return query
  with lugares as (
    select e.id, e.nome, e.bairro, e.logo_url, e.capa_url, c.nome as categoria,
           case when p_lat is not null and e.latitude is not null then public.distancia_m(p_lat, p_lng, e.latitude, e.longitude) end as dist,
           greatest(public.nota_texto(t, public.normalizar(e.nome)),
                    0.75 * public.nota_texto(t, public.normalizar(concat_ws(' ', c.nome, e.bairro,
                      (select string_agg(v.nome, ' ') from public.estabelecimento_vibes ev join public.vibes v on v.id = ev.vibe_id where ev.estabelecimento_id = e.id))))) as nota
      from public.estabelecimentos e left join public.categorias c on c.id = e.categoria_id
     where e.situacao = 'aprovado'
  ), eventos as (
    select ev.id, ev.nome, ev.inicio, ev.capa_url, e.nome as lugar, e.logo_url,
           case when p_lat is not null and e.latitude is not null then public.distancia_m(p_lat, p_lng, e.latitude, e.longitude) end as dist,
           greatest(public.nota_texto(t, public.normalizar(ev.nome)), 0.7 * public.nota_texto(t, public.normalizar(e.nome))) as nota
      from public.eventos ev join public.estabelecimentos e on e.id = ev.estabelecimento_id
     where e.situacao = 'aprovado' and ev.situacao = 'publicado' and coalesce(ev.fim, ev.inicio + interval '8 hours') > now()
  ), pessoas as (
    select p.id, p.nome, p.usuario, p.foto_url, p.privado,
           greatest(public.nota_texto(t, public.normalizar(p.nome)), public.nota_texto(t, lower(coalesce(p.usuario, '')))) as nota,
           (select s.situacao from public.seguidores_pessoas s where s.seguidor_id = auth.uid() and s.seguido_id = p.id) as sigo
      from public.perfis p
     where not p.suspenso and not p.conta_sistema and p.usuario is not null and p.id <> coalesce(auth.uid(), '00000000-0000-0000-0000-000000000000'::uuid)
       and not public.bloqueado_entre(p.id, auth.uid())
  )
  (select 'lugar'::text, l.id, l.nome, concat_ws(' · ', l.categoria, l.bairro), coalesce(l.logo_url, l.capa_url), l.id::text, l.dist,
          (l.nota + case when l.dist is not null then 0.25 / (1 + l.dist / 1000) else 0 end)::real, '{}'::jsonb
     from lugares l where l.nota >= 0.3 order by 8 desc limit 15)
  union all
  (select 'evento', v.id, v.nome, v.lugar, coalesce(v.capa_url, v.logo_url), v.id::text, v.dist,
          (v.nota + case when v.dist is not null then 0.2 / (1 + v.dist / 1000) else 0 end
                  + case when v.inicio < now() + interval '2 days' then 0.1 else 0 end)::real,
          jsonb_build_object('inicio', v.inicio)
     from eventos v where v.nota >= 0.3 order by 8 desc limit 15)
  union all
  (select 'pessoa', s.id, s.nome, '@' || s.usuario, s.foto_url, s.usuario, null::double precision,
          (s.nota + case when s.sigo = 'ativo' then 0.1 else 0 end)::real,
          jsonb_build_object('privado', s.privado, 'sigo', s.sigo)
     from pessoas s where s.nota >= 0.3 order by 8 desc limit 15);
end $$;




notify pgrst, 'reload schema';

select 'Atualização 047 aplicada: usuários do sistema do estabelecimento.' as resultado;
