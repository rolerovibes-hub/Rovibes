-- 052 · Gestão com dados reais: pessoas do app, financeiro, registro de segurança e buscas sem resultado.

-- ============================================================
-- Registro de segurança (quem fez o quê, em ações sensíveis)
-- ============================================================
create table if not exists public.registro_gestao (
  id bigint generated always as identity primary key,
  acao text not null,
  alvo text,
  detalhe text,
  autor_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists registro_gestao_idx on public.registro_gestao (criado_em desc);
alter table public.registro_gestao enable row level security;

create or replace function public.registrar_gestao(p_acao text, p_alvo text, p_detalhe text default null)
returns void language sql security definer set search_path = public as $$
  insert into public.registro_gestao (acao, alvo, detalhe, autor_id) values (p_acao, p_alvo, nullif(btrim(coalesce(p_detalhe, '')), ''), auth.uid());
$$;

create or replace function public.registro_perfis()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.suspenso is distinct from old.suspenso then
    perform public.registrar_gestao(case when new.suspenso then 'Conta suspensa' else 'Conta reativada' end,
                                    new.nome || coalesce(' (@' || new.usuario || ')', ''));
  end if;
  if new.advertencias > old.advertencias then
    perform public.registrar_gestao('Pessoa advertida', new.nome || coalesce(' (@' || new.usuario || ')', ''));
  end if;
  return new;
end $$;
drop trigger if exists registro_perfis on public.perfis;
create trigger registro_perfis after update of suspenso, advertencias on public.perfis
for each row execute function public.registro_perfis();

create or replace function public.registro_estabelecimentos()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.situacao is distinct from old.situacao then
    perform public.registrar_gestao(
      case new.situacao when 'aprovado' then case when old.situacao = 'suspenso' then 'Estabelecimento reativado' else 'Estabelecimento aprovado' end
                        when 'recusado' then 'Estabelecimento recusado' when 'suspenso' then 'Estabelecimento suspenso'
                        else 'Estabelecimento: ' || new.situacao end,
      new.nome, new.motivo_situacao);
  end if;
  return new;
end $$;
drop trigger if exists registro_estabelecimentos on public.estabelecimentos;
create trigger registro_estabelecimentos after update of situacao on public.estabelecimentos
for each row execute function public.registro_estabelecimentos();

create or replace function public.registro_contas_gestao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_gestao(case when new.ceo then 'CEO criado' else 'Usuário da Gestão criado' end, new.nome || ' (' || new.login || ')',
                                    (select nome from public.gestao_cargos where id = new.cargo_id));
  elsif new.ativo is distinct from old.ativo then
    perform public.registrar_gestao(case when new.ativo then 'Usuário da Gestão reativado' else 'Usuário da Gestão desativado' end, new.nome || ' (' || new.login || ')');
  elsif new.cargo_id is distinct from old.cargo_id then
    perform public.registrar_gestao('Cargo alterado', new.nome || ' (' || new.login || ')', (select nome from public.gestao_cargos where id = new.cargo_id));
  end if;
  return new;
end $$;
drop trigger if exists registro_contas_gestao on public.gestao_contas;
create trigger registro_contas_gestao after insert or update of ativo, cargo_id on public.gestao_contas
for each row execute function public.registro_contas_gestao();

create or replace function public.registro_cargos_gestao()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    perform public.registrar_gestao('Cargo apagado', old.nome);
    return old;
  end if;
  if tg_op = 'INSERT' then
    perform public.registrar_gestao('Cargo criado', new.nome);
  elsif new.permissoes is distinct from old.permissoes or new.nome is distinct from old.nome then
    perform public.registrar_gestao('Permissões do cargo alteradas', new.nome);
  end if;
  return new;
end $$;
drop trigger if exists registro_cargos_gestao on public.gestao_cargos;
create trigger registro_cargos_gestao after insert or update or delete on public.gestao_cargos
for each row execute function public.registro_cargos_gestao();

create or replace function public.registro_suportes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    perform public.registrar_gestao('Modo suporte liberado', (select nome from public.estabelecimentos where id = new.estabelecimento_id), new.motivo);
  elsif new.encerrado_em is not null and old.encerrado_em is null then
    perform public.registrar_gestao('Modo suporte encerrado', (select nome from public.estabelecimentos where id = new.estabelecimento_id));
  end if;
  return new;
end $$;
drop trigger if exists registro_suportes on public.suportes;
create trigger registro_suportes after insert or update of encerrado_em on public.suportes
for each row execute function public.registro_suportes();

create or replace function public.registro_seguranca(p_termo text default null, p_limite int default 200)
returns table (id bigint, acao text, alvo text, detalhe text, autor text, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare t text := '%' || lower(btrim(coalesce(p_termo, ''))) || '%';
begin
  if public.nivel_gestao('seguranca') < 1 then raise exception 'Sem acesso a Segurança.'; end if;
  return query
  select r.id, r.acao, r.alvo, r.detalhe,
         case when r.autor_id is null then 'Sistema'
              when exists (select 1 from public.gestao_contas g where g.usuario_id = r.autor_id) then public.nome_gestao(r.autor_id)
              when exists (select 1 from public.contas_sistema c where c.usuario_id = r.autor_id)
                then (select c.login || ' · ' || e.nome from public.contas_sistema c join public.estabelecimentos e on e.id = c.estabelecimento_id where c.usuario_id = r.autor_id)
              else 'Conta do app' end,
         r.criado_em
    from public.registro_gestao r
   where t = '%%' or lower(r.acao || ' ' || coalesce(r.alvo, '') || ' ' || coalesce(r.detalhe, '')) like t
   order by r.criado_em desc
   limit greatest(1, least(p_limite, 500));
end $$;

-- ============================================================
-- Pessoas do app (Usuários)
-- ============================================================
create or replace function public.buscar_pessoas_gestao(p_termo text, p_filtro text default 'todas')
returns table (id uuid, nome text, usuario text, foto_url text, criado_em timestamptz, suspenso boolean, advertencias int, denuncias_abertas int)
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(btrim(coalesce(p_termo, '')));
begin
  if public.nivel_gestao('usuarios') < 1 and public.nivel_gestao('seguranca') < 1 then raise exception 'Sem acesso a Usuários.'; end if;
  return query
  select p.id, p.nome, p.usuario, p.foto_url, p.criado_em, p.suspenso, p.advertencias,
         (select count(*) from public.denuncias d where d.alvo_usuario = p.id and d.situacao = 'aberta')::int
    from public.perfis p
   where not p.conta_sistema
     and (t = '' or lower(p.nome) like '%' || t || '%' or lower(coalesce(p.usuario, '')) like '%' || ltrim(t, '@') || '%'
          or p.id::text = t or exists (select 1 from auth.users u where u.id = p.id and lower(u.email) = t))
     and case coalesce(p_filtro, 'todas')
           when 'suspensas' then p.suspenso
           when 'denunciadas' then exists (select 1 from public.denuncias d where d.alvo_usuario = p.id and d.situacao = 'aberta')
           when 'advertidas' then p.advertencias > 0
           when 'novas' then p.criado_em > now() - interval '7 days'
           else true end
   order by (t <> '' and lower(coalesce(p.usuario, '')) = ltrim(t, '@')) desc, p.criado_em desc
   limit 100;
end $$;

create or replace function public.ficha_pessoa_gestao(p_pessoa uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare p public.perfis; r jsonb;
begin
  if public.nivel_gestao('usuarios') < 1 and public.nivel_gestao('seguranca') < 1 then raise exception 'Sem acesso a Usuários.'; end if;
  select * into p from public.perfis where id = p_pessoa and not conta_sistema;
  if not found then return null; end if;
  r := jsonb_build_object(
    'id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url, 'bio', p.bio, 'criado_em', p.criado_em,
    'suspenso', p.suspenso, 'advertencias', p.advertencias, 'privado', p.privado,
    'email', (select email from auth.users where id = p.id),
    'ultimo_acesso', (select last_sign_in_at from auth.users where id = p.id),
    'denuncias_abertas', (select count(*) from public.denuncias where alvo_usuario = p.id and situacao = 'aberta'),
    'denuncias_total', (select count(*) from public.denuncias where alvo_usuario = p.id),
    'denuncias_feitas', (select count(*) from public.denuncias where denunciante_id = p.id));
  begin
    r := r || jsonb_build_object(
      'seguidores', (select count(*) from public.seguidores_pessoas where seguido_id = p.id),
      'pagamentos', (select count(*) from public.pagamentos where usuario_id = p.id and situacao = 'aprovado'),
      'gasto', (select coalesce(sum(valor), 0) from public.pagamentos where usuario_id = p.id and situacao = 'aprovado'),
      'ingressos', (select count(*) from public.compras_ingresso where usuario_id = p.id and situacao = 'paga'),
      'checkins', (select count(*) from public.checkins where usuario_id = p.id));
  exception when undefined_column or undefined_table then null;
  end;
  r := r || jsonb_build_object('situacoes', coalesce((
    select jsonb_agg(jsonb_build_object('numero', s.numero, 'titulo', s.titulo, 'estado', s.estado) order by s.criado_em desc)
      from (select * from public.situacoes where usuario_alvo = p.id order by criado_em desc limit 10) s), '[]'::jsonb));
  return r;
end $$;

-- Suspender/reativar direto pela ficha da pessoa (nível Autorizar em Usuários ou Segurança).
create or replace function public.suspender_conta(p_pessoa uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if greatest(public.nivel_gestao('usuarios'), public.nivel_gestao('seguranca')) < 4 then
    raise exception 'Suspender conta exige nível Autorizar em Usuários ou Segurança.';
  end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Escreva o motivo.'; end if;
  update public.perfis set suspenso = true where id = p_pessoa and not conta_sistema and not suspenso;
  if found then
    update public.registro_gestao set detalhe = btrim(p_motivo)
     where id = (select max(id) from public.registro_gestao where acao = 'Conta suspensa' and autor_id is not distinct from auth.uid());
  end if;
end $$;

create or replace function public.reativar_conta(p_pessoa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if greatest(public.nivel_gestao('usuarios'), public.nivel_gestao('seguranca')) < 4 then
    raise exception 'Reativar conta exige nível Autorizar em Usuários ou Segurança.';
  end if;
  update public.perfis set suspenso = false where id = p_pessoa;
end $$;

-- ============================================================
-- Financeiro
-- ============================================================
create or replace function public.resumo_financeiro_gestao(p_dias int default 30)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare d timestamptz := now() - make_interval(days => greatest(1, least(p_dias, 365))); r jsonb;
begin
  if public.nivel_gestao('financeiro') < 1 then raise exception 'Sem acesso ao Financeiro.'; end if;
  select jsonb_build_object(
    'aprovado', coalesce(sum(valor) filter (where situacao = 'aprovado'), 0),
    'comissao', coalesce(sum(comissao) filter (where situacao = 'aprovado'), 0),
    'aprovados', count(*) filter (where situacao = 'aprovado'),
    'recusados', count(*) filter (where situacao in ('recusado', 'cancelado')),
    'estornado', coalesce(sum(valor) filter (where situacao = 'estornado'), 0),
    'pelo_app', coalesce(sum(valor) filter (where situacao = 'aprovado' and origem = 'app'), 0),
    'no_caixa', coalesce(sum(valor) filter (where situacao = 'aprovado' and origem = 'caixa'), 0),
    'taxa_aprovacao', round(100.0 * count(*) filter (where situacao = 'aprovado' and origem = 'app')
                            / nullif(count(*) filter (where origem = 'app' and situacao in ('aprovado', 'recusado', 'cancelado')), 0)))
    into r
    from public.pagamentos where criado_em > d;
  begin
    r := r || jsonb_build_object(
      'reembolsos_pendentes', (select count(*) from public.reembolsos_ingresso where situacao = 'solicitado'),
      'reembolsos_falhos', (select count(*) from public.reembolsos_ingresso where situacao = 'falhou'),
      'reembolsado', (select coalesce(sum(valor), 0) from public.reembolsos_ingresso where situacao = 'feito' and feito_em > d));
  exception when undefined_table then null;
  end;
  r := r || jsonb_build_object('sem_mercado_pago', (
    select count(*) from public.estabelecimentos e where e.situacao = 'aprovado'
       and not exists (select 1 from public.mp_contas m where m.estabelecimento_id = e.id)));
  r := r || jsonb_build_object('por_estabelecimento', coalesce((
    select jsonb_agg(x order by x.total desc) from (
      select e.id, e.nome, sum(p.valor) total, sum(p.comissao) comissao, count(*) pagamentos
        from public.pagamentos p join public.estabelecimentos e on e.id = p.estabelecimento_id
       where p.criado_em > d and p.situacao = 'aprovado'
       group by e.id, e.nome order by sum(p.valor) desc limit 10) x), '[]'::jsonb));
  return r;
exception when undefined_table or undefined_column then
  return coalesce(r, '{}'::jsonb);
end $$;

create or replace function public.pagamentos_gestao(p_situacao text default null, p_termo text default null, p_limite int default 100)
returns table (id uuid, criado_em timestamptz, estabelecimento_id uuid, estabelecimento text, pessoa text, origem text, meio text,
               valor numeric, comissao numeric, situacao text, motivo text, mp_pagamento text)
language plpgsql stable security definer set search_path = public as $$
declare t text := lower(btrim(coalesce(p_termo, '')));
begin
  if public.nivel_gestao('financeiro') < 1 then raise exception 'Sem acesso ao Financeiro.'; end if;
  return query
  select p.id, p.criado_em, p.estabelecimento_id, e.nome, pe.nome, p.origem, p.meio, p.valor, p.comissao, p.situacao, p.motivo_cancelamento, p.mp_pagamento
    from public.pagamentos p
    join public.estabelecimentos e on e.id = p.estabelecimento_id
    left join public.perfis pe on pe.id = p.usuario_id
   where (p_situacao is null or p_situacao = '' or p.situacao = p_situacao or (p_situacao = 'falhas' and p.situacao in ('recusado', 'cancelado')))
     and (t = '' or lower(e.nome) like '%' || t || '%' or lower(coalesce(pe.nome, '')) like '%' || t || '%' or coalesce(p.mp_pagamento, '') = t)
   order by p.criado_em desc
   limit greatest(1, least(p_limite, 300));
end $$;

create or replace function public.reembolsos_gestao(p_situacao text default null)
returns table (id uuid, criado_em timestamptz, estabelecimento text, pessoa text, valor numeric, motivo text, situacao text, feito_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.nivel_gestao('financeiro') < 1 then raise exception 'Sem acesso ao Financeiro.'; end if;
  return query
  select r.id, r.criado_em, e.nome, pe.nome, r.valor, r.motivo, r.situacao, r.feito_em
    from public.reembolsos_ingresso r
    join public.estabelecimentos e on e.id = r.estabelecimento_id
    left join public.perfis pe on pe.id = r.usuario_id
   where p_situacao is null or p_situacao = '' or r.situacao = p_situacao
   order by (r.situacao = 'falhou') desc, (r.situacao = 'solicitado') desc, r.criado_em desc
   limit 200;
end $$;

-- ============================================================
-- Produto: buscas do app que não encontraram nada
-- ============================================================
create table if not exists public.buscas_vazias (
  id bigint generated always as identity primary key,
  termo text not null check (length(termo) between 2 and 80),
  usuario_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists buscas_vazias_idx on public.buscas_vazias (criado_em desc);
alter table public.buscas_vazias enable row level security;

create or replace function public.registrar_busca_vazia(p_termo text)
returns void language plpgsql security definer set search_path = public as $$
declare t text := lower(regexp_replace(btrim(coalesce(p_termo, '')), '\s+', ' ', 'g'));
begin
  if length(t) < 3 or length(t) > 80 then return; end if;
  -- Uma vez por pessoa e termo a cada 30 min.
  if exists (select 1 from public.buscas_vazias where usuario_id is not distinct from auth.uid() and termo = t and criado_em > now() - interval '30 minutes') then return; end if;
  insert into public.buscas_vazias (termo, usuario_id) values (t, auth.uid());
end $$;

create or replace function public.buscas_vazias_gestao(p_dias int default 30)
returns table (termo text, vezes int, pessoas int, ultima timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.nivel_gestao('produto') < 1 then raise exception 'Sem acesso a Produto.'; end if;
  return query
  select b.termo, count(*)::int, count(distinct b.usuario_id)::int, max(b.criado_em)
    from public.buscas_vazias b
   where b.criado_em > now() - make_interval(days => greatest(1, least(p_dias, 365)))
   group by b.termo
   order by count(distinct b.usuario_id) desc, count(*) desc, max(b.criado_em) desc
   limit 200;
end $$;

revoke execute on function public.registrar_gestao(text, text, text) from public, anon, authenticated;
revoke execute on function public.registro_seguranca(text, int), public.buscar_pessoas_gestao(text, text), public.ficha_pessoa_gestao(uuid),
  public.suspender_conta(uuid, text), public.reativar_conta(uuid), public.resumo_financeiro_gestao(int), public.pagamentos_gestao(text, text, int),
  public.reembolsos_gestao(text), public.registrar_busca_vazia(text), public.buscas_vazias_gestao(int) from public, anon;
grant execute on function public.registro_seguranca(text, int), public.buscar_pessoas_gestao(text, text), public.ficha_pessoa_gestao(uuid),
  public.suspender_conta(uuid, text), public.reativar_conta(uuid), public.resumo_financeiro_gestao(int), public.pagamentos_gestao(text, text, int),
  public.reembolsos_gestao(text), public.registrar_busca_vazia(text), public.buscas_vazias_gestao(int) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 052 aplicada: pessoas, financeiro, registro de segurança e buscas sem resultado.' as resultado;
