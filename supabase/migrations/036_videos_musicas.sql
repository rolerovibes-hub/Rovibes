-- 036 · Vídeos de até 15 s nas publicações e stories, e biblioteca de músicas
-- • publicacoes_pessoas e stories_pessoas ganham vídeo (foto_url continua sendo a capa).
-- • Músicas: a administração mantém uma biblioteca de faixas com licença de uso (sem direitos autorais de terceiros).
--   Já vem com 3 faixas originais do RoVibes, livres para uso no app.
-- Pode rodar de novo sem problema.

alter table public.publicacoes_pessoas add column if not exists video_url text;
alter table public.publicacoes_pessoas add column if not exists duracao numeric(5,2) check (duracao is null or duracao between 0 and 16);
alter table public.publicacoes_pessoas add column if not exists musica_id uuid;
alter table public.stories_pessoas add column if not exists video_url text;
alter table public.stories_pessoas add column if not exists duracao numeric(5,2) check (duracao is null or duracao between 0 and 16);
alter table public.stories_pessoas add column if not exists musica_id uuid;

create table if not exists public.musicas (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) between 1 and 80),
  artista text check (artista is null or length(artista) <= 80),
  estilo text check (estilo is null or length(estilo) <= 40),
  arquivo_url text not null,
  duracao numeric(6,2),
  licenca text not null check (length(btrim(licenca)) between 2 and 200),
  ativa boolean not null default true,
  ordem int not null default 0,
  criado_em timestamptz not null default now()
);
alter table public.musicas enable row level security;
drop policy if exists musicas_ler on public.musicas;
create policy musicas_ler on public.musicas for select to authenticated using (ativa or public.eh_admin());
drop policy if exists musicas_admin on public.musicas;
create policy musicas_admin on public.musicas for all to authenticated using (public.eh_admin()) with check (public.eh_admin());
grant select on public.musicas to authenticated;
grant insert, update, delete on public.musicas to authenticated;

do $$ begin
  alter table public.publicacoes_pessoas add constraint publicacoes_pessoas_musica_fk foreign key (musica_id) references public.musicas(id) on delete set null;
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.stories_pessoas add constraint stories_pessoas_musica_fk foreign key (musica_id) references public.musicas(id) on delete set null;
exception when duplicate_object then null; end $$;

-- Faixas originais do RoVibes (arquivos publicados junto com o site).
insert into public.musicas (titulo, artista, estilo, arquivo_url, duracao, licenca, ordem)
select v.titulo, 'RoVibes', v.estilo, v.url, 30, 'Faixa original do RoVibes, livre para uso no app', v.ordem
  from (values ('Noite lo-fi', 'Lo-fi', '/musicas/noite-lofi.mp3', 1),
               ('Pista', 'House', '/musicas/pista-house.mp3', 2),
               ('Roda de samba', 'Samba', '/musicas/roda-de-samba.mp3', 3)) v(titulo, estilo, url, ordem)
 where not exists (select 1 from public.musicas m where m.arquivo_url = v.url);

-- Pasta pública para as músicas enviadas pela administração.
do $$ begin
  insert into storage.buckets (id, name, public) values ('musicas', 'musicas', true) on conflict (id) do nothing;
end $$;
drop policy if exists musicas_arquivos_admin on storage.objects;
create policy musicas_arquivos_admin on storage.objects for all to authenticated
  using (bucket_id = 'musicas' and public.eh_admin()) with check (bucket_id = 'musicas' and public.eh_admin());

-- Vídeos de até 15 s cabem com folga em 50 MB.
do $$ begin
  update storage.buckets set file_size_limit = 52428800 where id = 'avatares' and (file_size_limit is null or file_size_limit < 52428800);
exception when undefined_column then null; end $$;

select 'Atualização 036 aplicada: vídeos de 15 s e biblioteca de músicas.' as resultado;
