-- RoVibes · 001 · Base: pessoas, estabelecimentos, equipe e acessos aos aplicativos.
-- Pode ser executado mais de uma vez (só cria o que falta).

-- ============================================================
-- Pessoas
-- ============================================================
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  data_nascimento date not null,
  foto_url text,
  tema text not null default 'escuro' check (tema in ('escuro', 'claro', 'sistema')),
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

-- Equipe RoVibes que aprova estabelecimentos e trata denúncias.
create table if not exists public.administradores (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  criado_em timestamptz not null default now()
);

-- Cria o perfil ao criar a conta e exige 18 anos ou mais.
-- A primeira conta criada no sistema vira administradora.
create or replace function public.ao_criar_usuario()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_nome text := nullif(btrim(new.raw_user_meta_data ->> 'nome'), '');
  v_nasc date := nullif(new.raw_user_meta_data ->> 'data_nascimento', '')::date;
begin
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

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
for each row execute function public.ao_criar_usuario();

-- ============================================================
-- Catálogo mantido pela Administração
-- ============================================================
create table if not exists public.categorias (
  id smallint generated always as identity primary key,
  nome text not null unique,
  ativa boolean not null default true
);

create table if not exists public.vibes (
  id smallint generated always as identity primary key,
  nome text not null unique,
  ativa boolean not null default true
);

insert into public.categorias (nome) values
  ('Bar'), ('Restaurante'), ('Casa de shows'), ('Balada'), ('Café'), ('Pub'), ('Lanchonete'), ('Espaço de eventos')
on conflict (nome) do nothing;

insert into public.vibes (nome) values
  ('Animado'), ('Tranquilo'), ('Romântico'), ('Música ao vivo'), ('Balada'), ('Happy hour'),
  ('Ao ar livre'), ('Para ir em grupo'), ('Pet friendly'), ('Família')
on conflict (nome) do nothing;

-- ============================================================
-- Estabelecimentos e equipe
-- ============================================================
create table if not exists public.estabelecimentos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) > 1),
  categoria_id smallint references public.categorias(id),
  endereco text,
  bairro text,
  cidade text not null default 'Uberlândia',
  uf text not null default 'MG',
  telefone text,
  situacao text not null default 'pendente'
    check (situacao in ('pendente', 'aprovado', 'recusado', 'suspenso')),
  motivo_situacao text,
  criado_por uuid not null default auth.uid() references auth.users(id),
  criado_em timestamptz not null default now(),
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz
);

create table if not exists public.membros (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  papel text not null default 'equipe' check (papel in ('proprietario', 'gestor', 'equipe')),
  cargo text,
  ativo boolean not null default true,
  criado_em timestamptz not null default now(),
  primary key (estabelecimento_id, usuario_id)
);
create index if not exists membros_usuario_idx on public.membros (usuario_id) where ativo;

-- Aplicativos liberados individualmente para gestor e equipe (o proprietário tem todos).
create table if not exists public.acessos (
  estabelecimento_id uuid not null,
  usuario_id uuid not null,
  codigo text not null,
  concedido_por uuid references auth.users(id),
  concedido_em timestamptz not null default now(),
  primary key (estabelecimento_id, usuario_id, codigo),
  foreign key (estabelecimento_id, usuario_id) references public.membros(estabelecimento_id, usuario_id) on delete cascade
);

create table if not exists public.solicitacoes_acesso (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'recusada')),
  criado_em timestamptz not null default now(),
  decidido_por uuid references auth.users(id),
  decidido_em timestamptz
);
create unique index if not exists solicitacoes_pendente_unica
  on public.solicitacoes_acesso (coalesce(estabelecimento_id, '00000000-0000-0000-0000-000000000000'::uuid), usuario_id, codigo)
  where situacao = 'pendente';

-- Área de Trabalho de cada pessoa.
create table if not exists public.favoritos (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null,
  ordem int not null default 0,
  primary key (usuario_id, codigo)
);

create table if not exists public.usos_aplicativo (
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  codigo text not null,
  vezes int not null default 1,
  ultimo_em timestamptz not null default now(),
  primary key (usuario_id, codigo)
);

-- ============================================================
-- Funções de apoio (usadas pelas regras de acesso)
-- ============================================================
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where usuario_id = auth.uid());
$$;

create or replace function public.papel_em(p_estab uuid)
returns text language sql stable security definer set search_path = public as $$
  select papel from public.membros
   where estabelecimento_id = p_estab and usuario_id = auth.uid() and ativo;
$$;

create or replace function public.eh_membro(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.papel_em(p_estab) is not null;
$$;

create or replace function public.eh_proprietario(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.papel_em(p_estab) = 'proprietario', false);
$$;

-- ============================================================
-- Ações feitas pelo banco (as telas só chamam)
-- ============================================================

-- Cadastra o estabelecimento já com quem cadastrou como proprietário. Entra como pendente.
create or replace function public.cadastrar_estabelecimento(
  p_nome text, p_categoria smallint, p_bairro text, p_endereco text, p_telefone text
) returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta para continuar.'; end if;
  insert into public.estabelecimentos (nome, categoria_id, bairro, endereco, telefone, criado_por)
  values (btrim(p_nome), p_categoria, nullif(btrim(p_bairro), ''), nullif(btrim(p_endereco), ''), nullif(btrim(p_telefone), ''), auth.uid())
  returning id into v_id;
  insert into public.membros (estabelecimento_id, usuario_id, papel, cargo)
  values (v_id, auth.uid(), 'proprietario', 'Proprietário');
  return v_id;
end $$;

-- Só a Administração muda a situação do estabelecimento.
create or replace function public.decidir_estabelecimento(p_estab uuid, p_situacao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Somente a administração do RoVibes pode decidir.'; end if;
  if p_situacao not in ('aprovado', 'recusado', 'suspenso') then raise exception 'Situação inválida.'; end if;
  if p_situacao <> 'aprovado' and coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  update public.estabelecimentos
     set situacao = p_situacao, motivo_situacao = nullif(btrim(p_motivo), ''),
         decidido_por = auth.uid(), decidido_em = now()
   where id = p_estab;
end $$;

-- Impede que alguém troque a situação editando a linha diretamente.
create or replace function public.proteger_situacao()
returns trigger language plpgsql as $$
begin
  if new.situacao is distinct from old.situacao and not public.eh_admin() then
    raise exception 'A situação do estabelecimento é decidida pela administração.';
  end if;
  return new;
end $$;
drop trigger if exists proteger_situacao on public.estabelecimentos;
create trigger proteger_situacao before update on public.estabelecimentos
for each row execute function public.proteger_situacao();

create or replace function public.registrar_uso(p_codigo text)
returns void language sql security definer set search_path = public as $$
  insert into public.usos_aplicativo (usuario_id, codigo) values (auth.uid(), p_codigo)
  on conflict (usuario_id, codigo) do update set vezes = usos_aplicativo.vezes + 1, ultimo_em = now();
$$;

-- ============================================================
-- Regras de acesso por linha (RLS)
-- ============================================================
alter table public.perfis enable row level security;
alter table public.administradores enable row level security;
alter table public.categorias enable row level security;
alter table public.vibes enable row level security;
alter table public.estabelecimentos enable row level security;
alter table public.membros enable row level security;
alter table public.acessos enable row level security;
alter table public.solicitacoes_acesso enable row level security;
alter table public.favoritos enable row level security;
alter table public.usos_aplicativo enable row level security;

drop policy if exists perfis_ler on public.perfis;
create policy perfis_ler on public.perfis for select to authenticated using (true);
drop policy if exists perfis_editar on public.perfis;
create policy perfis_editar on public.perfis for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

drop policy if exists admins_ler on public.administradores;
create policy admins_ler on public.administradores for select to authenticated using (usuario_id = auth.uid() or public.eh_admin());

drop policy if exists categorias_ler on public.categorias;
create policy categorias_ler on public.categorias for select using (true);
drop policy if exists categorias_admin on public.categorias;
create policy categorias_admin on public.categorias for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

drop policy if exists vibes_ler on public.vibes;
create policy vibes_ler on public.vibes for select using (true);
drop policy if exists vibes_admin on public.vibes;
create policy vibes_admin on public.vibes for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Público vê só aprovados; equipe vê o seu; administração vê todos.
drop policy if exists estab_ler on public.estabelecimentos;
create policy estab_ler on public.estabelecimentos for select
  using (situacao = 'aprovado' or public.eh_membro(id) or public.eh_admin());
drop policy if exists estab_editar on public.estabelecimentos;
create policy estab_editar on public.estabelecimentos for update to authenticated
  using (public.papel_em(id) in ('proprietario', 'gestor') or public.eh_admin())
  with check (public.papel_em(id) in ('proprietario', 'gestor') or public.eh_admin());

drop policy if exists membros_ler on public.membros;
create policy membros_ler on public.membros for select to authenticated
  using (usuario_id = auth.uid() or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists membros_gerir on public.membros;
create policy membros_gerir on public.membros for all to authenticated
  using (public.eh_proprietario(estabelecimento_id)) with check (public.eh_proprietario(estabelecimento_id));

drop policy if exists acessos_ler on public.acessos;
create policy acessos_ler on public.acessos for select to authenticated
  using (usuario_id = auth.uid() or public.eh_proprietario(estabelecimento_id));
drop policy if exists acessos_gerir on public.acessos;
create policy acessos_gerir on public.acessos for all to authenticated
  using (public.eh_proprietario(estabelecimento_id)) with check (public.eh_proprietario(estabelecimento_id));

drop policy if exists solic_criar on public.solicitacoes_acesso;
create policy solic_criar on public.solicitacoes_acesso for insert to authenticated
  with check (usuario_id = auth.uid() and situacao = 'pendente');
drop policy if exists solic_ler on public.solicitacoes_acesso;
create policy solic_ler on public.solicitacoes_acesso for select to authenticated
  using (usuario_id = auth.uid() or public.eh_proprietario(estabelecimento_id) or public.eh_admin());
drop policy if exists solic_decidir on public.solicitacoes_acesso;
create policy solic_decidir on public.solicitacoes_acesso for update to authenticated
  using (public.eh_proprietario(estabelecimento_id) or public.eh_admin())
  with check (public.eh_proprietario(estabelecimento_id) or public.eh_admin());

drop policy if exists favoritos_meus on public.favoritos;
create policy favoritos_meus on public.favoritos for all to authenticated
  using (usuario_id = auth.uid()) with check (usuario_id = auth.uid());

drop policy if exists usos_meus on public.usos_aplicativo;
create policy usos_meus on public.usos_aplicativo for select to authenticated using (usuario_id = auth.uid());

-- Contas criadas antes desta estrutura (se houver) também ganham perfil.
insert into public.perfis (id, nome, data_nascimento)
select u.id, coalesce(nullif(btrim(u.raw_user_meta_data ->> 'nome'), ''), split_part(u.email, '@', 1)),
       coalesce(nullif(u.raw_user_meta_data ->> 'data_nascimento', '')::date, date '2000-01-01')
  from auth.users u
 where not exists (select 1 from public.perfis p where p.id = u.id);

select 'RoVibes 001 aplicado com sucesso' as resultado;
