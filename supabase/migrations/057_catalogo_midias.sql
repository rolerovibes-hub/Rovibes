-- 057 · Catálogo central de mídias (Media Management).
-- Cada arquivo do RoVibes tem um registro aqui, não importa onde esteja guardado (Supabase, R2, serviço de vídeo).
-- O arquivo em si nunca fica no banco: só a referência, as versões e as regras.

create table if not exists public.midias (
  id uuid primary key default gen_random_uuid(),
  dono_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid references public.estabelecimentos(id) on delete set null,
  tipo text not null check (tipo in ('imagem', 'video', 'audio', 'documento')),
  finalidade text not null check (finalidade ~ '^[a-z-]{2,20}$'),
  provedor text not null check (provedor in ('supabase', 'r2', 'bunny', 'cloudflare_stream')),
  -- Chave base no provedor (ex.: u/<dono>/publicacao/<id>) e as versões: {"160": "160.webp", ..., "original": "original.jpg"}
  chave text not null,
  variantes jsonb not null default '{}'::jsonb,
  formato text,
  bytes bigint check (bytes is null or bytes >= 0),
  largura int,
  altura int,
  duracao numeric,
  visibilidade text not null default 'publica' check (visibilidade in ('publica', 'restrita', 'privada')),
  situacao text not null default 'pronta' check (situacao in ('enviando', 'processando', 'pronta', 'falhou', 'removida')),
  retencao_ate timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  unique (provedor, chave)
);
create index if not exists midias_dono_idx on public.midias (dono_id, criado_em desc);
create index if not exists midias_estab_idx on public.midias (estabelecimento_id, criado_em desc) where estabelecimento_id is not null;
create index if not exists midias_situacao_idx on public.midias (situacao) where situacao <> 'pronta';

alter table public.midias enable row level security;
drop policy if exists midias_ver on public.midias;
create policy midias_ver on public.midias for select to authenticated
  using (dono_id = auth.uid() or (visibilidade = 'publica' and situacao = 'pronta'));
revoke insert, update, delete on public.midias from anon, authenticated;

-- Registro feito pelo app logo após o envio. A chave precisa estar na pasta da própria pessoa.
create or replace function public.registrar_midia(
  p_provedor text, p_chave text, p_tipo text, p_finalidade text,
  p_variantes jsonb default '{}'::jsonb, p_formato text default null, p_bytes bigint default null,
  p_largura int default null, p_altura int default null, p_duracao numeric default null,
  p_estab uuid default null, p_visibilidade text default 'publica', p_situacao text default 'pronta')
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre no RoVibes para enviar arquivos.'; end if;
  if p_provedor = 'r2' and p_chave not like 'u/' || auth.uid()::text || '/%' then
    raise exception 'Arquivo fora da pasta da pessoa.';
  end if;
  if p_estab is not null and not exists (select 1 from membros where estabelecimento_id = p_estab and usuario_id = auth.uid() and ativo) then
    p_estab := null;
  end if;
  insert into midias (dono_id, estabelecimento_id, tipo, finalidade, provedor, chave, variantes, formato, bytes, largura, altura, duracao, visibilidade, situacao)
  values (auth.uid(), p_estab, p_tipo, p_finalidade, p_provedor, p_chave, coalesce(p_variantes, '{}'::jsonb), p_formato, p_bytes, p_largura, p_altura, p_duracao,
          coalesce(p_visibilidade, 'publica'), coalesce(p_situacao, 'pronta'))
  on conflict (provedor, chave) do update set variantes = excluded.variantes, situacao = excluded.situacao, atualizado_em = now()
    where midias.dono_id = auth.uid()
  returning id into v_id;
  return v_id;
end $$;

-- Marcar como removida (o arquivo é apagado no provedor pelo app/serviço).
create or replace function public.remover_midia(p_id uuid)
returns void language sql security definer set search_path = public as $$
  update midias set situacao = 'removida', atualizado_em = now() where id = p_id and dono_id = auth.uid();
$$;

revoke execute on function public.registrar_midia(text, text, text, text, jsonb, text, bigint, int, int, numeric, uuid, text, text) from public, anon;
grant execute on function public.registrar_midia(text, text, text, text, jsonb, text, bigint, int, int, numeric, uuid, text, text) to authenticated;
revoke execute on function public.remover_midia(uuid) from public, anon;
grant execute on function public.remover_midia(uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 057 aplicada: catálogo central de mídias.' as resultado;
