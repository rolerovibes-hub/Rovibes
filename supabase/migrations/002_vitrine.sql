-- RoVibes · 002 · Vitrine: perfil completo do estabelecimento, fotos, horários,
-- vibes, cardápio e eventos. Pode ser executado mais de uma vez.

-- ============================================================
-- Quem pode usar cada aplicativo num estabelecimento
-- ============================================================
-- Proprietário usa todos; os demais, os liberados em "acessos"; a administração também.
create or replace function public.pode_usar(p_estab uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_admin()
      or public.eh_proprietario(p_estab)
      or exists (
        select 1 from public.acessos a
          join public.membros m on m.estabelecimento_id = a.estabelecimento_id and m.usuario_id = a.usuario_id and m.ativo
         where a.estabelecimento_id = p_estab and a.usuario_id = auth.uid() and a.codigo = p_codigo);
$$;

create or replace function public.estab_visivel(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.estabelecimentos where id = p_estab and situacao = 'aprovado');
$$;

-- ============================================================
-- Perfil do estabelecimento (G1001)
-- ============================================================
alter table public.estabelecimentos add column if not exists descricao text;
alter table public.estabelecimentos add column if not exists latitude double precision;
alter table public.estabelecimentos add column if not exists longitude double precision;
alter table public.estabelecimentos add column if not exists instagram text;
alter table public.estabelecimentos add column if not exists capa_url text;
alter table public.estabelecimentos add column if not exists faixa_preco smallint check (faixa_preco between 1 and 4);
alter table public.estabelecimentos add column if not exists atualizado_em timestamptz not null default now();

drop policy if exists estab_editar on public.estabelecimentos;
create policy estab_editar on public.estabelecimentos for update to authenticated
  using (public.pode_usar(id, 'G1001')) with check (public.pode_usar(id, 'G1001'));

create table if not exists public.estabelecimento_vibes (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  vibe_id smallint not null references public.vibes(id),
  primary key (estabelecimento_id, vibe_id)
);

-- Um horário por dia da semana (0 = domingo). Fechar antes de abrir = vira a madrugada.
create table if not exists public.horarios (
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  dia_semana smallint not null check (dia_semana between 0 and 6),
  abre time not null,
  fecha time not null,
  primary key (estabelecimento_id, dia_semana)
);

create table if not exists public.fotos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  url text not null,
  caminho text not null,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists fotos_estab_idx on public.fotos (estabelecimento_id, ordem);

-- ============================================================
-- Cardápio e produtos (G4001)
-- ============================================================
create table if not exists public.cardapio_categorias (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 0),
  ordem int not null default 0
);

create table if not exists public.cardapio_itens (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  categoria_id uuid references public.cardapio_categorias(id) on delete set null,
  nome text not null check (length(btrim(nome)) > 0),
  descricao text,
  preco numeric(10, 2) check (preco >= 0),
  foto_url text,
  disponivel boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
create index if not exists cardapio_itens_estab_idx on public.cardapio_itens (estabelecimento_id, ordem);

-- ============================================================
-- Eventos (G5001)
-- ============================================================
create table if not exists public.eventos (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  nome text not null check (length(btrim(nome)) > 1),
  descricao text,
  inicio timestamptz not null,
  fim timestamptz,
  entrada text,
  capa_url text,
  situacao text not null default 'publicado' check (situacao in ('rascunho', 'publicado', 'cancelado')),
  criado_em timestamptz not null default now(),
  check (fim is null or fim > inicio)
);
create index if not exists eventos_inicio_idx on public.eventos (inicio);
create index if not exists eventos_estab_idx on public.eventos (estabelecimento_id, inicio);

-- ============================================================
-- Regras de acesso
-- ============================================================
alter table public.estabelecimento_vibes enable row level security;
alter table public.horarios enable row level security;
alter table public.fotos enable row level security;
alter table public.cardapio_categorias enable row level security;
alter table public.cardapio_itens enable row level security;
alter table public.eventos enable row level security;

-- Leitura: público vê o que é de estabelecimento aprovado; a equipe vê o seu.
drop policy if exists vibes_estab_ler on public.estabelecimento_vibes;
create policy vibes_estab_ler on public.estabelecimento_vibes for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists vibes_estab_gerir on public.estabelecimento_vibes;
create policy vibes_estab_gerir on public.estabelecimento_vibes for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G1001')) with check (public.pode_usar(estabelecimento_id, 'G1001'));

drop policy if exists horarios_ler on public.horarios;
create policy horarios_ler on public.horarios for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists horarios_gerir on public.horarios;
create policy horarios_gerir on public.horarios for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G1001')) with check (public.pode_usar(estabelecimento_id, 'G1001'));

drop policy if exists fotos_ler on public.fotos;
create policy fotos_ler on public.fotos for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists fotos_gerir on public.fotos;
create policy fotos_gerir on public.fotos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G1001')) with check (public.pode_usar(estabelecimento_id, 'G1001'));

drop policy if exists cardcat_ler on public.cardapio_categorias;
create policy cardcat_ler on public.cardapio_categorias for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists cardcat_gerir on public.cardapio_categorias;
create policy cardcat_gerir on public.cardapio_categorias for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G4001')) with check (public.pode_usar(estabelecimento_id, 'G4001'));

drop policy if exists carditem_ler on public.cardapio_itens;
create policy carditem_ler on public.cardapio_itens for select
  using (public.estab_visivel(estabelecimento_id) or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists carditem_gerir on public.cardapio_itens;
create policy carditem_gerir on public.cardapio_itens for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G4001')) with check (public.pode_usar(estabelecimento_id, 'G4001'));

-- Eventos: público vê só os publicados de estabelecimentos aprovados.
drop policy if exists eventos_ler on public.eventos;
create policy eventos_ler on public.eventos for select
  using ((situacao = 'publicado' and public.estab_visivel(estabelecimento_id))
         or public.eh_membro(estabelecimento_id) or public.eh_admin());
drop policy if exists eventos_gerir on public.eventos;
create policy eventos_gerir on public.eventos for all to authenticated
  using (public.pode_usar(estabelecimento_id, 'G5001')) with check (public.pode_usar(estabelecimento_id, 'G5001'));

-- Data da última alteração do perfil.
create or replace function public.marcar_atualizado()
returns trigger language plpgsql as $$
begin new.atualizado_em := now(); return new; end $$;
drop trigger if exists marcar_atualizado on public.estabelecimentos;
create trigger marcar_atualizado before update on public.estabelecimentos
for each row execute function public.marcar_atualizado();

-- ============================================================
-- Fotos (Supabase Storage): pasta = id do estabelecimento
-- ============================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('estabelecimentos', 'estabelecimentos', true)
    on conflict (id) do update set public = true;

    execute 'drop policy if exists "estab fotos enviar" on storage.objects';
    execute $p$create policy "estab fotos enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'estabelecimentos'
        and (public.pode_usar(((storage.foldername(name))[1])::uuid, 'G1001')
          or public.pode_usar(((storage.foldername(name))[1])::uuid, 'G4001')
          or public.pode_usar(((storage.foldername(name))[1])::uuid, 'G5001')))$p$;

    execute 'drop policy if exists "estab fotos apagar" on storage.objects';
    execute $p$create policy "estab fotos apagar" on storage.objects for delete to authenticated
      using (bucket_id = 'estabelecimentos'
        and (public.pode_usar(((storage.foldername(name))[1])::uuid, 'G1001')
          or public.pode_usar(((storage.foldername(name))[1])::uuid, 'G4001')
          or public.pode_usar(((storage.foldername(name))[1])::uuid, 'G5001')))$p$;
  end if;
end $$;

select 'RoVibes 002 aplicado com sucesso' as resultado;
