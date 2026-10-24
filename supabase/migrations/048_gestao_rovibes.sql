-- 048 · Gestão RoVibes: sistema próprio da equipe da plataforma (endereço /gestao).
-- • Contas próprias (usuário + senha + código do app autenticador), separadas do perfil pessoal.
-- • Um CEO cria os cargos (com os níveis de acesso) e os usuários da Gestão.
-- • A partir daqui, só conta da Gestão com o código confirmado tem poderes de administração.
--   (O CEO é criado pela tela /gestao, confirmando com a conta pessoal que hoje é administradora.)
-- Pode rodar de novo sem problema.

create table if not exists public.gestao_cargos (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 40),
  niveis text[] not null default '{}',
  criado_em timestamptz not null default now(),
  unique (nome)
);

create table if not exists public.gestao_contas (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  login text not null unique check (login ~ '^[a-z0-9._]{3,30}$'),
  nome text not null,
  cargo_id uuid references public.gestao_cargos(id) on delete set null,
  ceo boolean not null default false,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create unique index if not exists gestao_um_ceo on public.gestao_contas ((true)) where ceo;

alter table public.gestao_cargos enable row level security;
alter table public.gestao_contas enable row level security;

insert into public.gestao_cargos (nome, niveis) values
  ('Operações', array['comercial', 'suporte']),
  ('Moderação', array['moderacao']),
  ('Catálogo', array['catalogo']),
  ('Financeiro', array['financeiro'])
on conflict (nome) do nothing;

-- Conta da Gestão ativa e com o código do autenticador confirmado nesta sessão.
create or replace function public.gestao_confirmada()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
     and exists (select 1 from public.gestao_contas where usuario_id = auth.uid() and ativo);
$$;

-- Poderes de administração: só pela Gestão RoVibes (não mais pelo perfil pessoal).
create or replace function public.eh_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select public.gestao_confirmada() and exists (select 1 from public.administradores where usuario_id = auth.uid());
$$;

create or replace function public.eh_equipe(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.gestao_confirmada()
     and exists (select 1 from public.administradores where usuario_id = auth.uid() and ('geral' = any (niveis) or p_area = any (niveis)));
$$;

create or replace function public.meus_niveis()
returns text[] language sql stable security definer set search_path = public as $$
  select case when public.gestao_confirmada() then coalesce((select niveis from public.administradores where usuario_id = auth.uid()), '{}') else '{}' end;
$$;

-- Já existe CEO? (a tela de entrada mostra "Configurar CEO" só antes do primeiro)
create or replace function public.gestao_tem_ceo()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.gestao_contas where ceo);
$$;
grant execute on function public.gestao_tem_ceo() to anon, authenticated;

create or replace function public.meu_acesso_gestao()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('gestao', true, 'login', g.login, 'nome', g.nome, 'ceo', g.ceo, 'ativo', g.ativo,
                                             'cargo', c.nome, 'niveis', coalesce(a.niveis, '{}'), 'confirmada', public.gestao_confirmada())
                     from public.gestao_contas g left join public.gestao_cargos c on c.id = g.cargo_id
                     left join public.administradores a on a.usuario_id = g.usuario_id
                    where g.usuario_id = auth.uid()), jsonb_build_object('gestao', false));
$$;
revoke execute on function public.meu_acesso_gestao() from public, anon;
grant execute on function public.meu_acesso_gestao() to authenticated;

-- ============================================================
-- Organização (só CEO ou nível geral)
-- ============================================================
drop policy if exists gestao_cargos_ler on public.gestao_cargos;
create policy gestao_cargos_ler on public.gestao_cargos for select to authenticated using (public.gestao_confirmada());
drop policy if exists gestao_contas_ler on public.gestao_contas;
create policy gestao_contas_ler on public.gestao_contas for select to authenticated using (usuario_id = auth.uid() or public.eh_equipe('geral'));
grant select on public.gestao_cargos, public.gestao_contas to authenticated;

create or replace function public.organizacao_gestao()
returns table (usuario_id uuid, login text, nome text, ceo boolean, ativo boolean, cargo_id uuid, cargo text, niveis text[], criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_equipe('geral') then raise exception 'Só o CEO e o nível geral veem a organização.'; end if;
  return query
  select g.usuario_id, g.login, g.nome, g.ceo, g.ativo, g.cargo_id, c.nome, coalesce(a.niveis, '{}'), g.criado_em
    from public.gestao_contas g left join public.gestao_cargos c on c.id = g.cargo_id left join public.administradores a on a.usuario_id = g.usuario_id
   order by g.ceo desc, g.nome;
end $$;

create or replace function public.validar_niveis(p_niveis text[])
returns void language plpgsql immutable as $$
declare n text;
begin
  foreach n in array coalesce(p_niveis, '{}') loop
    if n not in ('geral', 'comercial', 'moderacao', 'catalogo', 'financeiro', 'suporte') then raise exception 'Nível inválido: %.', n; end if;
  end loop;
end $$;

create or replace function public.salvar_cargo_gestao(p_id uuid, p_nome text, p_niveis text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not public.eh_equipe('geral') then raise exception 'Só o CEO e o nível geral mexem nos cargos.'; end if;
  perform public.validar_niveis(p_niveis);
  if p_id is null then
    insert into public.gestao_cargos (nome, niveis) values (btrim(p_nome), coalesce(p_niveis, '{}')) returning id into v;
  else
    update public.gestao_cargos set nome = btrim(p_nome), niveis = coalesce(p_niveis, '{}') where id = p_id returning id into v;
    -- Quem tem o cargo passa a ter os níveis novos.
    update public.administradores a set niveis = coalesce(p_niveis, '{}')
      from public.gestao_contas g where g.usuario_id = a.usuario_id and g.cargo_id = p_id and not g.ceo;
  end if;
  return v;
end $$;

create or replace function public.apagar_cargo_gestao(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('geral') then raise exception 'Só o CEO e o nível geral mexem nos cargos.'; end if;
  if exists (select 1 from public.gestao_contas where cargo_id = p_id) then raise exception 'Tire as pessoas deste cargo antes de apagar.'; end if;
  delete from public.gestao_cargos where id = p_id;
end $$;

create or replace function public.definir_cargo_gestao(p_usuario uuid, p_cargo uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_niveis text[];
begin
  if not public.eh_equipe('geral') then raise exception 'Só o CEO e o nível geral mexem na organização.'; end if;
  if exists (select 1 from public.gestao_contas where usuario_id = p_usuario and ceo) then raise exception 'O cargo do CEO não muda.'; end if;
  select niveis into v_niveis from public.gestao_cargos where id = p_cargo;
  if not found then raise exception 'Cargo não encontrado.'; end if;
  update public.gestao_contas set cargo_id = p_cargo where usuario_id = p_usuario;
  insert into public.administradores (usuario_id, niveis, adicionado_por) values (p_usuario, v_niveis, auth.uid())
  on conflict (usuario_id) do update set niveis = excluded.niveis;
end $$;

create or replace function public.situacao_gestao(p_usuario uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('geral') then raise exception 'Só o CEO e o nível geral mexem na organização.'; end if;
  if exists (select 1 from public.gestao_contas where usuario_id = p_usuario and ceo) then raise exception 'O CEO não pode ser desativado.'; end if;
  update public.gestao_contas set ativo = p_ativo where usuario_id = p_usuario;
end $$;

revoke execute on function public.organizacao_gestao(), public.salvar_cargo_gestao(uuid, text, text[]), public.apagar_cargo_gestao(uuid),
  public.definir_cargo_gestao(uuid, uuid), public.situacao_gestao(uuid, boolean) from public, anon;
grant execute on function public.organizacao_gestao(), public.salvar_cargo_gestao(uuid, text, text[]), public.apagar_cargo_gestao(uuid),
  public.definir_cargo_gestao(uuid, uuid), public.situacao_gestao(uuid, boolean) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 048 aplicada: Gestão RoVibes.' as resultado;
