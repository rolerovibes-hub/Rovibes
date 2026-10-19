-- RoVibes 025: Perfil Promoter.
-- O estabelecimento convida qualquer pessoa (pelo @) na tela de Equipe; ao aceitar, ela modera o chat ao vivo,
-- cria listas de presença, divulga o lugar e os eventos com link próprio e recebe os benefícios definidos pelo lugar.
-- Requer a 024. Pode ser executado mais de uma vez.

create table if not exists public.promoters (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'convidado' check (situacao in ('convidado', 'ativo', 'recusado', 'removido', 'saiu')),
  codigo text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 7)),
  mensagem text,
  convidado_por uuid references auth.users(id) on delete set null,
  convidado_em timestamptz not null default now(),
  aceito_em timestamptz,
  encerrado_em timestamptz
);
create unique index if not exists promoters_um_por_estab on public.promoters (estabelecimento_id, usuario_id) where situacao in ('convidado', 'ativo');
create index if not exists promoters_usuario_idx on public.promoters (usuario_id);

create table if not exists public.promoter_beneficios (
  id uuid primary key default gen_random_uuid(),
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  tipo text not null check (tipo in ('comissao', 'evento', 'consumacao', 'vip', 'outro')),
  descricao text not null check (length(btrim(descricao)) between 2 and 200),
  valor numeric(12,2),
  unidade text check (unidade is null or unidade in ('%', 'R$', 'itens', 'pessoas')),
  condicao text check (condicao is null or length(condicao) <= 200),
  evento_id uuid references public.eventos(id) on delete set null,
  ativo boolean not null default true,
  criado_em timestamptz not null default now()
);

create table if not exists public.listas_presenca (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  evento_id uuid references public.eventos(id) on delete cascade,
  promoter_id uuid references public.promoters(id) on delete set null,
  nome text not null check (length(btrim(nome)) between 2 and 80),
  beneficio text check (beneficio is null or length(beneficio) <= 160),
  limite int check (limite is null or limite > 0),
  encerra_em timestamptz,
  ativa boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists listas_presenca_evento_idx on public.listas_presenca (evento_id);

create table if not exists public.lista_nomes (
  id uuid primary key default gen_random_uuid(),
  lista_id uuid not null references public.listas_presenca(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete cascade,
  nome text not null,
  acompanhantes int not null default 0 check (acompanhantes between 0 and 10),
  via_promoter uuid references public.promoters(id) on delete set null,
  criado_em timestamptz not null default now(),
  chegou_em timestamptz,
  conferido_por uuid references auth.users(id) on delete set null,
  unique (lista_id, usuario_id)
);

create table if not exists public.promoter_cliques (
  id bigint generated always as identity primary key,
  promoter_id uuid not null references public.promoters(id) on delete cascade,
  alvo text not null check (alvo in ('lugar', 'evento')),
  alvo_id uuid not null,
  usuario_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists promoter_cliques_idx on public.promoter_cliques (promoter_id, criado_em desc);

alter table public.promoters enable row level security;
alter table public.promoter_beneficios enable row level security;
alter table public.listas_presenca enable row level security;
alter table public.lista_nomes enable row level security;
alter table public.promoter_cliques enable row level security;

drop policy if exists promoters_ler on public.promoters;
create policy promoters_ler on public.promoters for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G3001') or public.eh_admin());
drop policy if exists promoter_beneficios_ler on public.promoter_beneficios;
create policy promoter_beneficios_ler on public.promoter_beneficios for select to authenticated
  using (exists (select 1 from public.promoters p where p.id = promoter_id and (p.usuario_id = auth.uid() or public.pode_usar(p.estabelecimento_id, 'G3001'))));
drop policy if exists listas_presenca_ler on public.listas_presenca;
create policy listas_presenca_ler on public.listas_presenca for select to authenticated using (true);

-- ============================================================
-- Quem é promoter ativo
-- ============================================================
create or replace function public.promoter_ativo(p_estab uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select id from public.promoters where estabelecimento_id = p_estab and usuario_id = auth.uid() and situacao = 'ativo' limit 1;
$$;

-- Promoters moderam o chat ao vivo enquanto ele está aberto (o histórico continua só da equipe).
create or replace function public.modera_ao_vivo(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.equipe_ao_vivo(p_estab) or public.promoter_ativo(p_estab) is not null;
$$;

-- ============================================================
-- Convite, resposta e encerramento
-- ============================================================
create or replace function public.convidar_promoter(p_estab uuid, p_usuario text, p_mensagem text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_pessoa uuid; v_id uuid;
begin
  perform public.exigir_gestao_equipe(p_estab);
  select id into v_pessoa from public.perfis where usuario = lower(btrim(ltrim(p_usuario, '@'))) and not suspenso;
  if v_pessoa is null then raise exception 'Não encontramos ninguém com o usuário @%.', lower(btrim(ltrim(p_usuario, '@'))); end if;
  if exists (select 1 from public.promoters where estabelecimento_id = p_estab and usuario_id = v_pessoa and situacao = 'ativo') then
    raise exception 'Esta pessoa já é promoter do lugar.';
  end if;
  select id into v_id from public.promoters where estabelecimento_id = p_estab and usuario_id = v_pessoa and situacao = 'convidado';
  if v_id is not null then
    update public.promoters set mensagem = nullif(btrim(p_mensagem), ''), convidado_em = now(), convidado_por = auth.uid() where id = v_id;
    return v_id;
  end if;
  insert into public.promoters (estabelecimento_id, usuario_id, mensagem, convidado_por)
  values (p_estab, v_pessoa, nullif(btrim(p_mensagem), ''), auth.uid()) returning id into v_id;
  return v_id;
end $$;

create or replace function public.responder_convite_promoter(p_id uuid, p_aceitar boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.promoters
     set situacao = case when p_aceitar then 'ativo' else 'recusado' end,
         aceito_em = case when p_aceitar then now() end,
         encerrado_em = case when p_aceitar then null else now() end
   where id = p_id and usuario_id = auth.uid() and situacao = 'convidado';
  if not found then raise exception 'Convite não encontrado ou já respondido.'; end if;
end $$;

create or replace function public.encerrar_promoter(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare p public.promoters;
begin
  select * into p from public.promoters where id = p_id and situacao in ('convidado', 'ativo');
  if p.id is null then raise exception 'Promoter não encontrado.'; end if;
  if p.usuario_id = auth.uid() then
    update public.promoters set situacao = 'saiu', encerrado_em = now() where id = p_id;
  else
    perform public.exigir_gestao_equipe(p.estabelecimento_id);
    update public.promoters set situacao = 'removido', encerrado_em = now() where id = p_id;
  end if;
  update public.listas_presenca set ativa = false where promoter_id = p_id;
end $$;

-- ============================================================
-- Benefícios (definidos pelo estabelecimento)
-- ============================================================
create or replace function public.salvar_beneficio_promoter(p_promoter uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_id uuid := p_id;
begin
  select estabelecimento_id into v_estab from public.promoters where id = p_promoter;
  if v_estab is null then raise exception 'Promoter não encontrado.'; end if;
  perform public.exigir_gestao_equipe(v_estab);
  if v_id is null then
    insert into public.promoter_beneficios (promoter_id, tipo, descricao) values (p_promoter, p_dados->>'tipo', btrim(p_dados->>'descricao')) returning id into v_id;
  end if;
  update public.promoter_beneficios set
    tipo = p_dados->>'tipo', descricao = btrim(p_dados->>'descricao'),
    valor = nullif(p_dados->>'valor', '')::numeric, unidade = nullif(p_dados->>'unidade', ''),
    condicao = nullif(btrim(coalesce(p_dados->>'condicao', '')), ''), evento_id = nullif(p_dados->>'evento_id', '')::uuid,
    ativo = coalesce((p_dados->>'ativo')::boolean, true)
   where id = v_id and promoter_id = p_promoter;
  return v_id;
end $$;

create or replace function public.remover_beneficio_promoter(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid;
begin
  select p.estabelecimento_id into v_estab from public.promoter_beneficios b join public.promoters p on p.id = b.promoter_id where b.id = p_id;
  if v_estab is null then return; end if;
  perform public.exigir_gestao_equipe(v_estab);
  delete from public.promoter_beneficios where id = p_id;
end $$;

-- ============================================================
-- Resultados de cada promoter
-- ============================================================
create or replace function public.resultados_promoter(p_promoter uuid, p_desde timestamptz)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'cliques', (select count(*) from public.promoter_cliques c where c.promoter_id = p_promoter and c.criado_em >= p_desde),
    'pessoas', (select count(distinct c.usuario_id) from public.promoter_cliques c where c.promoter_id = p_promoter and c.criado_em >= p_desde),
    'na_lista', (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.via_promoter = p_promoter and n.criado_em >= p_desde),
    'chegaram', (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.via_promoter = p_promoter and n.chegou_em is not null and n.criado_em >= p_desde),
    -- Check-in até 24 h depois de abrir o link do promoter.
    'checkins', (select count(distinct k.id) from public.promoter_cliques c
                   join public.promoters p on p.id = c.promoter_id
                   join public.checkins k on k.usuario_id = c.usuario_id and k.estabelecimento_id = p.estabelecimento_id
                                          and k.criado_em between c.criado_em and c.criado_em + interval '24 hours'
                  where c.promoter_id = p_promoter and c.criado_em >= p_desde)
  );
$$;

-- Lista para a tela de Equipe do estabelecimento.
create or replace function public.promoters_do_estab(p_estab uuid)
returns table (id uuid, usuario_id uuid, nome text, usuario text, foto_url text, situacao text, codigo text, convidado_em timestamptz,
               aceito_em timestamptz, beneficios jsonb, resultados jsonb)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_gestao_equipe(p_estab);
  return query
  select p.id, p.usuario_id, pf.nome, pf.usuario, pf.foto_url, p.situacao, p.codigo, p.convidado_em, p.aceito_em,
         coalesce((select jsonb_agg(to_jsonb(b) order by b.criado_em) from public.promoter_beneficios b where b.promoter_id = p.id), '[]'::jsonb),
         public.resultados_promoter(p.id, now() - interval '30 days')
    from public.promoters p join public.perfis pf on pf.id = p.usuario_id
   where p.estabelecimento_id = p_estab and p.situacao in ('convidado', 'ativo')
   order by (p.situacao = 'ativo') desc, pf.nome;
end $$;

-- Área do Promoter (no app): convites, lugares, benefícios, resultados e próximos eventos.
create or replace function public.minha_area_promoter()
returns table (id uuid, situacao text, codigo text, mensagem text, convidado_em timestamptz, estab jsonb, beneficios jsonb, resultados jsonb,
               eventos jsonb, ao_vivo boolean)
language plpgsql security definer set search_path = public as $$
begin
  return query
  select p.id, p.situacao, p.codigo, p.mensagem, p.convidado_em,
         jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url),
         coalesce((select jsonb_agg(to_jsonb(b) order by b.criado_em) from public.promoter_beneficios b where b.promoter_id = p.id and b.ativo), '[]'::jsonb),
         case when p.situacao = 'ativo' then public.resultados_promoter(p.id, now() - interval '30 days') end,
         case when p.situacao = 'ativo' then coalesce((select jsonb_agg(jsonb_build_object('id', ev.id, 'nome', ev.nome, 'inicio', ev.inicio) order by ev.inicio)
                     from public.eventos ev where ev.estabelecimento_id = e.id and ev.situacao = 'publicado'
                      and coalesce(ev.fim, ev.inicio + interval '8 hours') > now()), '[]'::jsonb) end,
         case when p.situacao = 'ativo' then public.sala_ao_vivo(e.id) is not null else false end
    from public.promoters p join public.estabelecimentos e on e.id = p.estabelecimento_id
   where p.usuario_id = auth.uid() and p.situacao in ('convidado', 'ativo')
   order by (p.situacao = 'convidado') desc, e.nome;
end $$;

-- Selo no perfil da pessoa.
create or replace function public.selos_promoter(p_usuario uuid)
returns table (estabelecimento_id uuid, nome text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome from public.promoters p join public.estabelecimentos e on e.id = p.estabelecimento_id
   where p.usuario_id = p_usuario and p.situacao = 'ativo' and e.situacao = 'aprovado' order by e.nome;
$$;

-- Link de divulgação aberto (?ref=CODIGO).
create or replace function public.registrar_clique_promoter(p_codigo text, p_alvo text, p_alvo_id uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  select id into v_id from public.promoters where codigo = upper(btrim(p_codigo)) and situacao = 'ativo';
  if v_id is null then return null; end if;
  if exists (select 1 from public.promoters where id = v_id and usuario_id = auth.uid()) then return v_id; end if;
  if not exists (select 1 from public.promoter_cliques where promoter_id = v_id and alvo_id = p_alvo_id and usuario_id = auth.uid()
                   and criado_em > now() - interval '6 hours') then
    insert into public.promoter_cliques (promoter_id, alvo, alvo_id, usuario_id) values (v_id, p_alvo, p_alvo_id, auth.uid());
  end if;
  return v_id;
end $$;

-- ============================================================
-- Listas de presença
-- ============================================================
create or replace function public.criar_lista_presenca(p_estab uuid, p_evento uuid, p_nome text, p_beneficio text, p_limite int, p_encerra timestamptz)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_promoter uuid := public.promoter_ativo(p_estab); v_id uuid;
begin
  if v_promoter is null and not public.equipe_ao_vivo(p_estab) and not public.pode_usar(p_estab, 'G5001') then
    raise exception 'Só a equipe e os Promoters do lugar criam listas.';
  end if;
  if p_evento is not null and not exists (select 1 from public.eventos where id = p_evento and estabelecimento_id = p_estab) then
    raise exception 'Evento de outro lugar.';
  end if;
  insert into public.listas_presenca (estabelecimento_id, evento_id, promoter_id, nome, beneficio, limite, encerra_em, criado_por)
  values (p_estab, p_evento, case when public.equipe_ao_vivo(p_estab) and v_promoter is null then null else v_promoter end,
          btrim(p_nome), nullif(btrim(coalesce(p_beneficio, '')), ''), nullif(p_limite, 0), p_encerra, auth.uid())
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.pode_gerir_lista(p_lista uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.listas_presenca l
                  where l.id = p_lista and (public.eh_membro(l.estabelecimento_id) or public.pode_usar(l.estabelecimento_id, 'G5001')
                         or l.promoter_id = public.promoter_ativo(l.estabelecimento_id) and l.promoter_id is not null));
$$;

create or replace function public.encerrar_lista_presenca(p_lista uuid, p_ativa boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.pode_gerir_lista(p_lista) then raise exception 'Sem permissão.'; end if;
  update public.listas_presenca set ativa = p_ativa where id = p_lista;
end $$;

-- Listas que aparecem para o público (página do evento ou do lugar).
create or replace function public.listas_abertas(p_estab uuid, p_evento uuid)
returns table (id uuid, nome text, beneficio text, limite int, encerra_em timestamptz, inscritos int, promoter text, promoter_codigo text, eu_estou boolean, cheia boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.nome, l.beneficio, l.limite, l.encerra_em,
         (select coalesce(sum(1 + n.acompanhantes), 0)::int from public.lista_nomes n where n.lista_id = l.id),
         pf.nome, p.codigo,
         exists (select 1 from public.lista_nomes n where n.lista_id = l.id and n.usuario_id = auth.uid()),
         l.limite is not null and (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.lista_id = l.id) >= l.limite
    from public.listas_presenca l
    left join public.promoters p on p.id = l.promoter_id
    left join public.perfis pf on pf.id = p.usuario_id
   where l.ativa and (l.encerra_em is null or l.encerra_em > now())
     and l.estabelecimento_id = p_estab and (p_evento is null or l.evento_id = p_evento or l.evento_id is null)
     and (l.evento_id is null or exists (select 1 from public.eventos ev where ev.id = l.evento_id and coalesce(ev.fim, ev.inicio + interval '8 hours') > now()))
   order by l.criado_em;
$$;

create or replace function public.entrar_na_lista(p_lista uuid, p_acompanhantes int, p_ref text)
returns void language plpgsql security definer set search_path = public as $$
declare l public.listas_presenca; v_total int; v_via uuid; v_nome text;
begin
  select * into l from public.listas_presenca where id = p_lista;
  if l.id is null or not l.ativa or (l.encerra_em is not null and l.encerra_em <= now()) then raise exception 'Esta lista está encerrada.'; end if;
  select coalesce(sum(1 + acompanhantes), 0) into v_total from public.lista_nomes where lista_id = p_lista and usuario_id is distinct from auth.uid();
  if l.limite is not null and v_total + 1 + coalesce(p_acompanhantes, 0) > l.limite then raise exception 'A lista está cheia.'; end if;
  select id into v_via from public.promoters where codigo = upper(btrim(coalesce(p_ref, ''))) and situacao = 'ativo' and estabelecimento_id = l.estabelecimento_id;
  v_via := coalesce(l.promoter_id, v_via);
  select nome into v_nome from public.perfis where id = auth.uid();
  insert into public.lista_nomes (lista_id, usuario_id, nome, acompanhantes, via_promoter)
  values (p_lista, auth.uid(), coalesce(v_nome, 'Convidado'), greatest(0, least(10, coalesce(p_acompanhantes, 0))), v_via)
  on conflict (lista_id, usuario_id) do update set acompanhantes = excluded.acompanhantes;
end $$;

create or replace function public.sair_da_lista(p_lista uuid)
returns void language sql security definer set search_path = public as $$
  delete from public.lista_nomes where lista_id = p_lista and usuario_id = auth.uid() and chegou_em is null;
$$;

-- Listas para quem gerencia (promoter: as suas; equipe: todas do lugar).
create or replace function public.listas_para_gerir(p_estab uuid)
returns table (id uuid, nome text, beneficio text, limite int, encerra_em timestamptz, ativa boolean, evento jsonb, promoter text,
               inscritos int, chegaram int, minha boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_promoter uuid := public.promoter_ativo(p_estab); v_equipe boolean := public.eh_membro(p_estab) or public.pode_usar(p_estab, 'G5001');
begin
  if v_promoter is null and not v_equipe then raise exception 'Sem permissão.'; end if;
  return query
  select l.id, l.nome, l.beneficio, l.limite, l.encerra_em, l.ativa,
         case when ev.id is not null then jsonb_build_object('id', ev.id, 'nome', ev.nome, 'inicio', ev.inicio) end,
         pf.nome,
         (select coalesce(sum(1 + n.acompanhantes), 0)::int from public.lista_nomes n where n.lista_id = l.id),
         (select coalesce(sum(1 + n.acompanhantes), 0)::int from public.lista_nomes n where n.lista_id = l.id and n.chegou_em is not null),
         l.promoter_id is not distinct from v_promoter and v_promoter is not null
    from public.listas_presenca l
    left join public.eventos ev on ev.id = l.evento_id
    left join public.promoters p on p.id = l.promoter_id
    left join public.perfis pf on pf.id = p.usuario_id
   where l.estabelecimento_id = p_estab and (v_equipe or l.promoter_id = v_promoter)
     and (l.evento_id is null or coalesce(ev.fim, ev.inicio + interval '8 hours') > now() - interval '2 days')
   order by l.ativa desc, coalesce(ev.inicio, l.criado_em) desc
   limit 100;
end $$;

create or replace function public.nomes_da_lista(p_lista uuid)
returns table (id uuid, nome text, usuario text, acompanhantes int, criado_em timestamptz, chegou_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_gerir_lista(p_lista) then raise exception 'Sem permissão.'; end if;
  return query
  select n.id, n.nome, pf.usuario, n.acompanhantes, n.criado_em, n.chegou_em
    from public.lista_nomes n left join public.perfis pf on pf.id = n.usuario_id
   where n.lista_id = p_lista order by n.nome;
end $$;

-- Portaria confere (só a equipe do lugar).
create or replace function public.conferir_nome_lista(p_nome uuid, p_chegou boolean)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid;
begin
  select l.estabelecimento_id into v_estab from public.lista_nomes n join public.listas_presenca l on l.id = n.lista_id where n.id = p_nome;
  if v_estab is null or not (public.eh_membro(v_estab) or public.eh_admin()) then raise exception 'Só a equipe do lugar confere a lista.'; end if;
  update public.lista_nomes set chegou_em = case when p_chegou then now() end, conferido_por = case when p_chegou then auth.uid() end where id = p_nome;
end $$;

revoke execute on function public.promoter_ativo(uuid), public.convidar_promoter(uuid, text, text), public.responder_convite_promoter(uuid, boolean),
  public.encerrar_promoter(uuid), public.salvar_beneficio_promoter(uuid, uuid, jsonb), public.remover_beneficio_promoter(uuid),
  public.resultados_promoter(uuid, timestamptz), public.promoters_do_estab(uuid), public.minha_area_promoter(), public.selos_promoter(uuid),
  public.registrar_clique_promoter(text, text, uuid), public.criar_lista_presenca(uuid, uuid, text, text, int, timestamptz), public.pode_gerir_lista(uuid),
  public.encerrar_lista_presenca(uuid, boolean), public.listas_abertas(uuid, uuid), public.entrar_na_lista(uuid, int, text), public.sair_da_lista(uuid),
  public.listas_para_gerir(uuid), public.nomes_da_lista(uuid), public.conferir_nome_lista(uuid, boolean) from public, anon;
grant execute on function public.promoter_ativo(uuid), public.convidar_promoter(uuid, text, text), public.responder_convite_promoter(uuid, boolean),
  public.encerrar_promoter(uuid), public.salvar_beneficio_promoter(uuid, uuid, jsonb), public.remover_beneficio_promoter(uuid),
  public.promoters_do_estab(uuid), public.minha_area_promoter(), public.selos_promoter(uuid),
  public.registrar_clique_promoter(text, text, uuid), public.criar_lista_presenca(uuid, uuid, text, text, int, timestamptz), public.pode_gerir_lista(uuid),
  public.encerrar_lista_presenca(uuid, boolean), public.listas_abertas(uuid, uuid), public.entrar_na_lista(uuid, int, text), public.sair_da_lista(uuid),
  public.listas_para_gerir(uuid), public.nomes_da_lista(uuid), public.conferir_nome_lista(uuid, boolean) to authenticated;

select 'RoVibes 025 aplicado com sucesso' as resultado;
