-- 042 · Pastas na Área de Trabalho do Business
-- • Cada pessoa cria pastas (ex.: "Dashboard") e agrupa os apps favoritos de mesma linha de ação.
-- • A pasta ocupa um lugar na grade como um app (linha "pasta:ID" em favoritos, para a ordem continuar funcionando).
-- Pode rodar de novo sem problema.

create table if not exists public.pastas_area (
  id uuid primary key default gen_random_uuid(),
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 1 and 30),
  cor text check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$'),
  criado_em timestamptz not null default now()
);
create index if not exists pastas_area_usuario_idx on public.pastas_area (usuario_id);
alter table public.pastas_area enable row level security;
drop policy if exists pastas_area_minhas on public.pastas_area;
create policy pastas_area_minhas on public.pastas_area for select to authenticated using (usuario_id = auth.uid());

alter table public.favoritos add column if not exists pasta_id uuid references public.pastas_area(id) on delete set null;

-- Cria a pasta (no fim da grade) já com os apps escolhidos.
create or replace function public.criar_pasta(p_nome text, p_cor text, p_apps text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if (select count(*) from public.pastas_area where usuario_id = auth.uid()) >= 30 then raise exception 'Limite de 30 pastas.'; end if;
  insert into public.pastas_area (nome, cor) values (btrim(p_nome), nullif(p_cor, '')) returning id into v_id;
  insert into public.favoritos (usuario_id, codigo, ordem)
  values (auth.uid(), 'pasta:' || v_id, coalesce((select max(ordem) + 1 from public.favoritos where usuario_id = auth.uid()), 0));
  update public.favoritos set pasta_id = v_id
   where usuario_id = auth.uid() and codigo = any (coalesce(p_apps, '{}')) and codigo not like 'pasta:%';
  return v_id;
end $$;

create or replace function public.editar_pasta(p_pasta uuid, p_nome text, p_cor text, p_apps text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.pastas_area where id = p_pasta and usuario_id = auth.uid()) then raise exception 'Pasta não encontrada.'; end if;
  update public.pastas_area set nome = btrim(p_nome), cor = nullif(p_cor, '') where id = p_pasta;
  if p_apps is not null then
    update public.favoritos set pasta_id = null
     where usuario_id = auth.uid() and pasta_id = p_pasta and not (codigo = any (p_apps));
    update public.favoritos set pasta_id = p_pasta
     where usuario_id = auth.uid() and codigo = any (p_apps) and codigo not like 'pasta:%';
  end if;
end $$;

-- Põe (ou tira, com p_pasta nulo) um app numa pasta.
create or replace function public.mover_para_pasta(p_codigo text, p_pasta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_pasta is not null and not exists (select 1 from public.pastas_area where id = p_pasta and usuario_id = auth.uid()) then
    raise exception 'Pasta não encontrada.';
  end if;
  update public.favoritos set pasta_id = p_pasta where usuario_id = auth.uid() and codigo = p_codigo and codigo not like 'pasta:%';
end $$;

-- Apaga a pasta; os apps voltam para a grade.
create or replace function public.apagar_pasta(p_pasta uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.favoritos set pasta_id = null where usuario_id = auth.uid() and pasta_id = p_pasta;
  delete from public.favoritos where usuario_id = auth.uid() and codigo = 'pasta:' || p_pasta;
  delete from public.pastas_area where id = p_pasta and usuario_id = auth.uid();
end $$;

revoke execute on function public.criar_pasta(text, text, text[]), public.editar_pasta(uuid, text, text, text[]),
  public.mover_para_pasta(text, uuid), public.apagar_pasta(uuid) from public, anon;
grant execute on function public.criar_pasta(text, text, text[]), public.editar_pasta(uuid, text, text, text[]),
  public.mover_para_pasta(text, uuid), public.apagar_pasta(uuid) to authenticated;
grant select on public.pastas_area to authenticated;

-- Faz o Supabase enxergar na hora a coluna e a tabela novas.
notify pgrst, 'reload schema';

select 'Atualização 042 aplicada: pastas na Área de Trabalho.' as resultado;
