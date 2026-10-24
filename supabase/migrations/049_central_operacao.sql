-- 049 · Central de operação da Gestão RoVibes.
-- • Situações: tudo o que acontece na plataforma (criadas pela equipe, pelos estabelecimentos ou detectadas sozinhas),
--   com área, prioridade, responsável, histórico e resultado.
-- • Conhecimento: a memória da operação. Situação nova, quando entendida, vira conhecimento (causa e tratamento).
-- • Cargos com nível por área: 1 ver · 2 atuar · 3 decidir · 4 autorizar · 5 administrar.
-- • Inteligência: tabelas e configuração preparadas, desligada.
-- Pode rodar de novo sem problema. Requer a 048.

-- ============================================================
-- Níveis por área nos cargos
-- ============================================================
create or replace function public.areas_gestao()
returns text[] language sql immutable as $$
  select array['atendimento', 'suporte', 'operacao', 'estabelecimentos', 'usuarios', 'produto', 'financeiro',
               'seguranca', 'conhecimento', 'configuracoes', 'inteligencia'];
$$;

alter table public.gestao_cargos add column if not exists permissoes jsonb not null default '{}'::jsonb;

-- Os níveis antigos (usados pelas telas de administração que já existiam) saem das permissões novas.
create or replace function public.niveis_de_permissoes(p jsonb)
returns text[] language sql immutable as $$
  select array_remove(array[
    case when coalesce((p ->> 'configuracoes')::int, 0) >= 5 then 'geral' end,
    case when coalesce((p ->> 'estabelecimentos')::int, 0) >= 3 then 'comercial' end,
    case when greatest(coalesce((p ->> 'seguranca')::int, 0), coalesce((p ->> 'usuarios')::int, 0)) >= 2 then 'moderacao' end,
    case when coalesce((p ->> 'produto')::int, 0) >= 2 then 'catalogo' end,
    case when coalesce((p ->> 'financeiro')::int, 0) >= 2 then 'financeiro' end,
    case when coalesce((p ->> 'suporte')::int, 0) >= 2 then 'suporte' end
  ], null);
$$;

update public.gestao_cargos set permissoes = case nome
  when 'Operações' then '{"atendimento":2,"suporte":3,"operacao":3,"estabelecimentos":3,"usuarios":1,"conhecimento":2}'::jsonb
  when 'Moderação' then '{"atendimento":2,"usuarios":3,"seguranca":3,"conhecimento":2}'::jsonb
  when 'Catálogo' then '{"produto":3,"conhecimento":2}'::jsonb
  when 'Financeiro' then '{"financeiro":4,"estabelecimentos":1,"conhecimento":1}'::jsonb
  else permissoes end
 where permissoes = '{}'::jsonb;

-- Nível da pessoa na área (CEO = 5 em tudo). Sem o código do autenticador confirmado: 0.
create or replace function public.nivel_gestao(p_area text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when not public.gestao_confirmada() then 0
    when exists (select 1 from public.gestao_contas where usuario_id = auth.uid() and ceo) then 5
    else coalesce((select (c.permissoes ->> p_area)::int from public.gestao_contas g join public.gestao_cargos c on c.id = g.cargo_id where g.usuario_id = auth.uid()), 0)
  end;
$$;

create or replace function public.minhas_permissoes_gestao()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_object_agg(a, public.nivel_gestao(a)), '{}'::jsonb) from unnest(public.areas_gestao()) a;
$$;

-- Cargos: agora com permissões por área (os níveis antigos são calculados delas).
drop function if exists public.salvar_cargo_gestao(uuid, text, text[]);
create or replace function public.salvar_cargo_gestao(p_id uuid, p_nome text, p_permissoes jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid; k text; n int; p jsonb := '{}'::jsonb;
begin
  if public.nivel_gestao('configuracoes') < 5 then raise exception 'Só quem administra as configurações mexe nos cargos.'; end if;
  for k, n in select key, coalesce(nullif(value::text, 'null'), '0')::int from jsonb_each(coalesce(p_permissoes, '{}'::jsonb)) loop
    if not k = any (public.areas_gestao()) then raise exception 'Área inválida: %.', k; end if;
    if n < 0 or n > 5 then raise exception 'Nível inválido em %.', k; end if;
    if n > 0 then p := p || jsonb_build_object(k, n); end if;
  end loop;
  if p_id is null then
    insert into public.gestao_cargos (nome, niveis, permissoes) values (btrim(p_nome), public.niveis_de_permissoes(p), p) returning id into v;
  else
    update public.gestao_cargos set nome = btrim(p_nome), permissoes = p, niveis = public.niveis_de_permissoes(p) where id = p_id returning id into v;
    update public.administradores a set niveis = public.niveis_de_permissoes(p)
      from public.gestao_contas g where g.usuario_id = a.usuario_id and g.cargo_id = p_id and not g.ceo;
  end if;
  return v;
end $$;
revoke execute on function public.salvar_cargo_gestao(uuid, text, jsonb) from public, anon;
grant execute on function public.salvar_cargo_gestao(uuid, text, jsonb) to authenticated;

update public.gestao_cargos set niveis = public.niveis_de_permissoes(permissoes) where permissoes <> '{}'::jsonb;
update public.administradores a set niveis = c.niveis
  from public.gestao_contas g join public.gestao_cargos c on c.id = g.cargo_id where g.usuario_id = a.usuario_id and not g.ceo;

create or replace function public.meu_acesso_gestao()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce((select jsonb_build_object('gestao', true, 'login', g.login, 'nome', g.nome, 'ceo', g.ceo, 'ativo', g.ativo,
                                             'cargo', c.nome, 'niveis', coalesce(a.niveis, '{}'), 'confirmada', public.gestao_confirmada(),
                                             'permissoes', public.minhas_permissoes_gestao())
                     from public.gestao_contas g left join public.gestao_cargos c on c.id = g.cargo_id
                     left join public.administradores a on a.usuario_id = g.usuario_id
                    where g.usuario_id = auth.uid()), jsonb_build_object('gestao', false));
$$;

-- ============================================================
-- Conhecimento e situações
-- ============================================================
create table if not exists public.conhecimentos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  titulo text not null check (length(btrim(titulo)) between 3 and 140),
  area text not null check (area = any (public.areas_gestao())),
  tipo text not null default 'tecnica',
  sintomas text,
  causa text,
  tratamento text,
  palavras text[] not null default '{}',
  -- Situações automáticas cuja chave começa com esta regra já nascem ligadas a este conhecimento.
  regra text,
  ativo boolean not null default true,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table if not exists public.situacoes (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  titulo text not null check (length(btrim(titulo)) between 3 and 160),
  descricao text,
  area text not null check (area = any (public.areas_gestao())),
  tipo text not null default 'tecnica' check (tipo in ('tecnica', 'solicitacao', 'reclamacao', 'anomalia', 'integracao', 'financeira', 'seguranca', 'melhoria', 'outra')),
  prioridade text not null default 'media' check (prioridade in ('critica', 'alta', 'media', 'baixa')),
  estado text not null default 'nova' check (estado in ('nova', 'em_analise', 'aguardando', 'resolvida', 'encerrada')),
  origem text not null default 'equipe' check (origem in ('equipe', 'estabelecimento', 'automatica', 'inteligencia')),
  chave text unique,
  conhecimento_id uuid references public.conhecimentos(id) on delete set null,
  estabelecimento_id uuid references public.estabelecimentos(id) on delete set null,
  usuario_alvo uuid references auth.users(id) on delete set null,
  responsavel_id uuid references auth.users(id) on delete set null,
  criado_por uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  resolvida_em timestamptz,
  resultado text,
  dados jsonb not null default '{}'::jsonb
);
create index if not exists situacoes_abertas_idx on public.situacoes (estado, prioridade, criado_em desc);
create index if not exists situacoes_estab_idx on public.situacoes (estabelecimento_id, criado_em desc);

create table if not exists public.situacao_eventos (
  id bigint generated always as identity primary key,
  situacao_id uuid not null references public.situacoes(id) on delete cascade,
  tipo text not null,
  texto text,
  dados jsonb not null default '{}'::jsonb,
  autor_id uuid references auth.users(id) on delete set null,
  criado_em timestamptz not null default now()
);
create index if not exists situacao_eventos_idx on public.situacao_eventos (situacao_id, criado_em);
create index if not exists situacao_eventos_recentes_idx on public.situacao_eventos (criado_em desc);

create table if not exists public.situacao_relacoes (
  a uuid not null references public.situacoes(id) on delete cascade,
  b uuid not null references public.situacoes(id) on delete cascade,
  primary key (a, b),
  check (a <> b)
);

-- Inteligência (preparada, desligada): análises guardadas com o grau de certeza.
create table if not exists public.ia_analises (
  id uuid primary key default gen_random_uuid(),
  escopo text not null check (escopo in ('situacao', 'central', 'estabelecimento', 'area')),
  alvo uuid,
  area text,
  tipo text not null check (tipo in ('padrao', 'relacao', 'causa', 'recomendacao', 'anomalia', 'tendencia')),
  conteudo jsonb not null,
  confianca numeric(3, 2) check (confianca between 0 and 1),
  modelo text,
  criado_em timestamptz not null default now()
);

create table if not exists public.config_gestao (
  chave text primary key,
  valor jsonb not null,
  atualizado_por uuid references auth.users(id) on delete set null,
  atualizado_em timestamptz not null default now()
);
insert into public.config_gestao (chave, valor) values ('inteligencia', '{"ligada": false}'), ('deteccao', '{"ultima": null}')
on conflict (chave) do nothing;

alter table public.conhecimentos enable row level security;
alter table public.situacoes enable row level security;
alter table public.situacao_eventos enable row level security;
alter table public.situacao_relacoes enable row level security;
alter table public.ia_analises enable row level security;
alter table public.config_gestao enable row level security;

drop policy if exists conhecimentos_ler on public.conhecimentos;
create policy conhecimentos_ler on public.conhecimentos for select to authenticated using (public.gestao_confirmada());
drop policy if exists situacoes_ler on public.situacoes;
create policy situacoes_ler on public.situacoes for select to authenticated
  using (public.nivel_gestao(area) >= 1 or (responsavel_id = auth.uid() and public.gestao_confirmada()));
drop policy if exists situacao_eventos_ler on public.situacao_eventos;
create policy situacao_eventos_ler on public.situacao_eventos for select to authenticated
  using (exists (select 1 from public.situacoes s where s.id = situacao_id));
drop policy if exists situacao_relacoes_ler on public.situacao_relacoes;
create policy situacao_relacoes_ler on public.situacao_relacoes for select to authenticated using (public.gestao_confirmada());
drop policy if exists ia_analises_ler on public.ia_analises;
create policy ia_analises_ler on public.ia_analises for select to authenticated using (public.nivel_gestao('inteligencia') >= 1);
drop policy if exists config_gestao_ler on public.config_gestao;
create policy config_gestao_ler on public.config_gestao for select to authenticated using (public.gestao_confirmada());
grant select on public.conhecimentos, public.situacoes, public.situacao_eventos, public.situacao_relacoes, public.ia_analises, public.config_gestao to authenticated;

-- Registro no histórico (usado pelas funções abaixo).
create or replace function public.registrar_evento_situacao(p_situacao uuid, p_tipo text, p_texto text, p_dados jsonb default '{}'::jsonb)
returns void language sql security definer set search_path = public as $$
  insert into public.situacao_eventos (situacao_id, tipo, texto, dados, autor_id) values (p_situacao, p_tipo, p_texto, coalesce(p_dados, '{}'::jsonb), auth.uid());
  update public.situacoes set atualizado_em = now() where id = p_situacao;
$$;
revoke execute on function public.registrar_evento_situacao(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.nome_gestao(p_usuario uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce((select nome from public.gestao_contas where usuario_id = p_usuario), (select nome from public.perfis where id = p_usuario), 'Sistema');
$$;

-- Abrir situação (equipe).
create or replace function public.abrir_situacao(p_titulo text, p_descricao text, p_area text, p_tipo text, p_prioridade text,
                                                 p_estab uuid default null, p_conhecimento uuid default null)
returns bigint language plpgsql security definer set search_path = public as $$
declare v public.situacoes;
begin
  if public.nivel_gestao(p_area) < 2 then raise exception 'Você não pode abrir situações nesta área.'; end if;
  insert into public.situacoes (titulo, descricao, area, tipo, prioridade, estado, origem, estabelecimento_id, conhecimento_id, criado_por, responsavel_id)
  values (btrim(p_titulo), nullif(btrim(p_descricao), ''), p_area, coalesce(p_tipo, 'outra'), coalesce(p_prioridade, 'media'), 'em_analise', 'equipe',
          p_estab, p_conhecimento, auth.uid(), auth.uid())
  returning * into v;
  perform public.registrar_evento_situacao(v.id, 'criada', null);
  return v.numero;
end $$;

-- Ações sobre a situação (cada uma pede o nível certo e fica no histórico).
create or replace function public.agir_situacao(p_id uuid, p_acao text, p_valor text default null, p_texto text default null)
returns void language plpgsql security definer set search_path = public as $$
declare s public.situacoes; n int; v_outra uuid;
begin
  select * into s from public.situacoes where id = p_id;
  if not found then raise exception 'Situação não encontrada.'; end if;
  n := public.nivel_gestao(s.area);
  if n < 1 and not (s.responsavel_id = auth.uid() and public.gestao_confirmada()) then raise exception 'Sem acesso a esta situação.'; end if;
  case p_acao
    when 'comentar' then
      if coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva o comentário.'; end if;
      perform public.registrar_evento_situacao(p_id, 'comentario', btrim(p_texto));
    when 'assumir' then
      if n < 2 then raise exception 'Seu cargo só permite ver esta área.'; end if;
      update public.situacoes set responsavel_id = auth.uid(), estado = case when estado = 'nova' then 'em_analise' else estado end where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'responsavel', public.nome_gestao(auth.uid()) || ' assumiu');
    when 'passar' then
      if n < 3 and s.responsavel_id is distinct from auth.uid() then raise exception 'Só quem decide na área (ou o responsável) passa a situação.'; end if;
      if not exists (select 1 from public.gestao_contas where usuario_id = p_valor::uuid and ativo) then raise exception 'Pessoa não encontrada na Gestão.'; end if;
      update public.situacoes set responsavel_id = p_valor::uuid where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'responsavel', 'Passada para ' || public.nome_gestao(p_valor::uuid), jsonb_build_object('texto', p_texto));
    when 'prioridade' then
      if n < 3 then raise exception 'Só quem decide na área muda a prioridade.'; end if;
      if p_valor not in ('critica', 'alta', 'media', 'baixa') then raise exception 'Prioridade inválida.'; end if;
      update public.situacoes set prioridade = p_valor where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'prioridade', 'Prioridade: ' || p_valor);
    when 'aguardar' then
      if n < 2 then raise exception 'Seu cargo só permite ver esta área.'; end if;
      update public.situacoes set estado = 'aguardando' where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'estado', 'Aguardando', jsonb_build_object('texto', p_texto));
    when 'analisar' then
      if n < 2 then raise exception 'Seu cargo só permite ver esta área.'; end if;
      update public.situacoes set estado = 'em_analise', resolvida_em = null where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'estado', case when s.estado in ('resolvida', 'encerrada') then 'Reaberta' else 'Em análise' end);
    when 'resolver' then
      if n < 2 then raise exception 'Seu cargo só permite ver esta área.'; end if;
      if coalesce(btrim(p_texto), '') = '' then raise exception 'Conte como foi resolvida.'; end if;
      update public.situacoes set estado = 'resolvida', resolvida_em = now(), resultado = btrim(p_texto) where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'estado', 'Resolvida', jsonb_build_object('texto', btrim(p_texto)));
    when 'encerrar' then
      if n < 3 then raise exception 'Só quem decide na área encerra sem resolver.'; end if;
      update public.situacoes set estado = 'encerrada', resolvida_em = coalesce(resolvida_em, now()), resultado = coalesce(nullif(btrim(p_texto), ''), resultado) where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'estado', 'Encerrada', jsonb_build_object('texto', p_texto));
    when 'conhecimento' then
      if n < 2 then raise exception 'Seu cargo só permite ver esta área.'; end if;
      update public.situacoes set conhecimento_id = nullif(p_valor, '')::uuid where id = p_id;
      perform public.registrar_evento_situacao(p_id, 'conhecimento',
        coalesce('Reconhecida como CON-' || lpad((select numero::text from public.conhecimentos where id = nullif(p_valor, '')::uuid), 3, '0'), 'Conhecimento desligado'));
    when 'relacionar' then
      select id into v_outra from public.situacoes where numero = nullif(regexp_replace(coalesce(p_valor, ''), '\D', '', 'g'), '')::bigint;
      if v_outra is null or v_outra = p_id then raise exception 'Situação relacionada não encontrada.'; end if;
      insert into public.situacao_relacoes (a, b) values (least(p_id, v_outra), greatest(p_id, v_outra)) on conflict do nothing;
      perform public.registrar_evento_situacao(p_id, 'relacao', 'Relacionada à SIT-' || lpad((select numero::text from public.situacoes where id = v_outra), 4, '0'));
    else raise exception 'Ação desconhecida.';
  end case;
end $$;

-- Situação nova entendida → conhecimento (memória da operação).
create or replace function public.registrar_conhecimento(p_situacao uuid, p_titulo text, p_sintomas text, p_causa text, p_tratamento text, p_palavras text[])
returns bigint language plpgsql security definer set search_path = public as $$
declare s public.situacoes; c public.conhecimentos;
begin
  select * into s from public.situacoes where id = p_situacao;
  if not found then raise exception 'Situação não encontrada.'; end if;
  if public.nivel_gestao('conhecimento') < 2 and public.nivel_gestao(s.area) < 3 then raise exception 'Você não pode registrar conhecimento.'; end if;
  insert into public.conhecimentos (titulo, area, tipo, sintomas, causa, tratamento, palavras, criado_por)
  values (btrim(p_titulo), s.area, s.tipo, nullif(btrim(p_sintomas), ''), nullif(btrim(p_causa), ''), nullif(btrim(p_tratamento), ''),
          coalesce(p_palavras, '{}'), auth.uid())
  returning * into c;
  update public.situacoes set conhecimento_id = c.id where id = p_situacao;
  perform public.registrar_evento_situacao(p_situacao, 'conhecimento', 'Registrada como conhecimento CON-' || lpad(c.numero::text, 3, '0'));
  return c.numero;
end $$;

create or replace function public.salvar_conhecimento(p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if public.nivel_gestao('conhecimento') < 3 then raise exception 'Só quem decide no Conhecimento edita.'; end if;
  if p_id is null then
    insert into public.conhecimentos (titulo, area, tipo, sintomas, causa, tratamento, palavras, regra, criado_por)
    values (btrim(p_dados ->> 'titulo'), p_dados ->> 'area', coalesce(p_dados ->> 'tipo', 'tecnica'), p_dados ->> 'sintomas', p_dados ->> 'causa', p_dados ->> 'tratamento',
            coalesce((select array_agg(x) from jsonb_array_elements_text(p_dados -> 'palavras') x), '{}'), nullif(p_dados ->> 'regra', ''), auth.uid())
    returning id into v;
  else
    update public.conhecimentos set titulo = btrim(p_dados ->> 'titulo'), area = p_dados ->> 'area', sintomas = p_dados ->> 'sintomas', causa = p_dados ->> 'causa',
           tratamento = p_dados ->> 'tratamento', palavras = coalesce((select array_agg(x) from jsonb_array_elements_text(p_dados -> 'palavras') x), '{}'),
           regra = nullif(p_dados ->> 'regra', ''), ativo = coalesce((p_dados ->> 'ativo')::boolean, true), atualizado_em = now()
     where id = p_id returning id into v;
  end if;
  return v;
end $$;

-- Conhecimentos parecidos com a situação (por texto e área).
create or replace function public.sugerir_conhecimentos(p_situacao uuid)
returns table (id uuid, numero bigint, titulo text, causa text, tratamento text, semelhanca real)
language plpgsql stable security definer set search_path = public, extensions as $$
declare s public.situacoes; t text;
begin
  select * into s from public.situacoes where situacoes.id = p_situacao;
  if not found or public.nivel_gestao(s.area) < 1 then return; end if;
  t := public.normalizar(s.titulo || ' ' || coalesce(s.descricao, ''));
  return query
  select c.id, c.numero, c.titulo, c.causa, c.tratamento,
         (greatest(similarity(public.normalizar(c.titulo || ' ' || coalesce(c.sintomas, '')), t),
                   case when exists (select 1 from unnest(c.palavras) w where t like '%' || public.normalizar(w) || '%') then 0.45 else 0 end)
          + case when c.area = s.area then 0.1 else 0 end)::real as nota
    from public.conhecimentos c
   where c.ativo
   order by nota desc
   limit 3;
end $$;

-- ============================================================
-- Central: lista, números, saúde e mudanças
-- ============================================================
create or replace function public.situacoes_lista(p_filtro text default 'atencao', p_area text default null, p_estab uuid default null)
returns table (id uuid, numero bigint, titulo text, area text, tipo text, prioridade text, estado text, origem text,
               conhecimento_numero bigint, estabelecimento_id uuid, estabelecimento text, responsavel_id uuid, responsavel text,
               criado_em timestamptz, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.numero, s.titulo, s.area, s.tipo, s.prioridade, s.estado, s.origem, k.numero, s.estabelecimento_id, e.nome,
         s.responsavel_id, public.nome_gestao(s.responsavel_id), s.criado_em, s.atualizado_em
    from public.situacoes s
    left join public.conhecimentos k on k.id = s.conhecimento_id
    left join public.estabelecimentos e on e.id = s.estabelecimento_id
   where (public.nivel_gestao(s.area) >= 1 or s.responsavel_id = auth.uid())
     and (p_area is null or s.area = p_area)
     and (p_estab is null or s.estabelecimento_id = p_estab)
     and case coalesce(p_filtro, 'atencao')
           when 'atencao' then s.estado in ('nova', 'em_analise', 'aguardando')
                               and (s.responsavel_id = auth.uid() or s.responsavel_id is null or public.nivel_gestao(s.area) >= 2)
           when 'comigo' then s.responsavel_id = auth.uid() and s.estado in ('nova', 'em_analise', 'aguardando')
           when 'novas' then s.conhecimento_id is null and s.estado in ('nova', 'em_analise', 'aguardando')
           when 'abertas' then s.estado in ('nova', 'em_analise', 'aguardando')
           when 'resolvidas' then s.estado in ('resolvida', 'encerrada')
           else true end
   order by case when s.estado in ('resolvida', 'encerrada') then 1 else 0 end,
            case s.prioridade when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            (s.responsavel_id = auth.uid()) desc, s.atualizado_em desc
   limit 200;
$$;

create or replace function public.resumo_central()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.gestao_confirmada() then return '{}'::jsonb; end if;
  with vis as (select * from public.situacoes s where public.nivel_gestao(s.area) >= 1 or s.responsavel_id = auth.uid())
  select jsonb_build_object(
    'criticas', (select count(*) from vis where prioridade = 'critica' and estado in ('nova', 'em_analise', 'aguardando')),
    'sem_responsavel', (select count(*) from vis where responsavel_id is null and estado in ('nova', 'em_analise', 'aguardando')),
    'novas', (select count(*) from vis where conhecimento_id is null and estado in ('nova', 'em_analise', 'aguardando')),
    'comigo', (select count(*) from vis where responsavel_id = auth.uid() and estado in ('nova', 'em_analise', 'aguardando')),
    'resolvidas_semana', (select count(*) from vis where estado in ('resolvida', 'encerrada') and resolvida_em > now() - interval '7 days'),
    'por_area', (select coalesce(jsonb_object_agg(area, n), '{}'::jsonb) from (select area, count(*) n from vis where estado in ('nova', 'em_analise', 'aguardando') group by area) x),
    'saude', case when public.nivel_gestao('operacao') >= 1 then jsonb_build_object(
      'pedidos_hora', (select count(*) from public.pedidos where criado_em > now() - interval '1 hour'),
      'pagamentos_aprovados', (select round(100.0 * count(*) filter (where situacao = 'aprovado') / nullif(count(*) filter (where situacao in ('aprovado', 'recusado', 'cancelado')), 0))
                                 from public.pagamentos where criado_em > now() - interval '24 hours'),
      'notificacoes_atrasadas', (select count(*) from public.notificacoes where enviada_em is null and criado_em between now() - interval '1 day' and now() - interval '10 minutes'),
      'estabelecimentos_ativos', (select count(distinct i.estabelecimento_id) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id where p.criado_em > now() - interval '3 hours')
    ) end
  ) into r;
  return r;
exception when undefined_column or undefined_table then
  return r;
end $$;

create or replace function public.mudancas_central(p_limite int default 15)
returns table (situacao_id uuid, numero bigint, titulo text, tipo text, texto text, autor text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.numero, s.titulo, ev.tipo, ev.texto, public.nome_gestao(ev.autor_id), ev.criado_em
    from public.situacao_eventos ev join public.situacoes s on s.id = ev.situacao_id
   where public.gestao_confirmada() and (public.nivel_gestao(s.area) >= 1 or s.responsavel_id = auth.uid())
   order by ev.criado_em desc
   limit least(coalesce(p_limite, 15), 50);
$$;

-- Pessoas da Gestão (para "Passar para…").
create or replace function public.pessoas_gestao()
returns table (usuario_id uuid, nome text, cargo text)
language sql stable security definer set search_path = public as $$
  select g.usuario_id, g.nome, case when g.ceo then 'CEO' else c.nome end
    from public.gestao_contas g left join public.gestao_cargos c on c.id = g.cargo_id
   where public.gestao_confirmada() and g.ativo order by g.ceo desc, g.nome;
$$;

-- ============================================================
-- Detecção automática (roda ao abrir a Central, no máximo a cada 2 minutos)
-- ============================================================
create or replace function public.criar_situacao_automatica(p_chave text, p_titulo text, p_descricao text, p_area text, p_tipo text,
                                                            p_prioridade text, p_estab uuid, p_dados jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v uuid; k uuid;
begin
  select id into k from public.conhecimentos where ativo and regra is not null and p_chave like regra || '%' order by length(regra) desc limit 1;
  insert into public.situacoes (titulo, descricao, area, tipo, prioridade, origem, chave, estabelecimento_id, conhecimento_id, dados)
  values (p_titulo, p_descricao, p_area, p_tipo, p_prioridade, 'automatica', p_chave, p_estab, k, coalesce(p_dados, '{}'))
  on conflict (chave) do update set dados = excluded.dados, descricao = excluded.descricao,
     prioridade = case when public.situacoes.prioridade = 'critica' then 'critica' else excluded.prioridade end
  returning id into v;
  if not exists (select 1 from public.situacao_eventos where situacao_id = v) then
    insert into public.situacao_eventos (situacao_id, tipo, texto) values (v, 'criada', 'Detectada automaticamente' || coalesce(' · ' || p_descricao, ''));
    if k is not null then
      insert into public.situacao_eventos (situacao_id, tipo, texto)
      values (v, 'conhecimento', 'Reconhecida como CON-' || lpad((select numero::text from public.conhecimentos where id = k), 3, '0'));
    end if;
  end if;
end $$;
revoke execute on function public.criar_situacao_automatica(text, text, text, text, text, text, uuid, jsonb) from public, anon, authenticated;

create or replace function public.detectar_situacoes(p_forcar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_ultima timestamptz;
begin
  if not public.gestao_confirmada() then return 0; end if;
  select (valor ->> 'ultima')::timestamptz into v_ultima from public.config_gestao where chave = 'deteccao';
  if not p_forcar and v_ultima is not null and v_ultima > now() - interval '2 minutes' then return 0; end if;
  update public.config_gestao set valor = jsonb_build_object('ultima', now()), atualizado_em = now() where chave = 'deteccao';

  -- Aprovação parada há mais de 24 h
  for r in select id, nome, criado_em from public.estabelecimentos where situacao = 'pendente' and criado_em < now() - interval '24 hours' loop
    perform public.criar_situacao_automatica('aprovacao:' || r.id, 'Estabelecimento aguardando aprovação', r.nome || ' · desde ' || to_char(r.criado_em at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      'estabelecimentos', 'solicitacao', case when r.criado_em < now() - interval '48 hours' then 'alta' else 'media' end, r.id, '{}');
    n := n + 1;
  end loop;
  -- Fecha as de aprovação que já foram decididas
  update public.situacoes s set estado = 'resolvida', resolvida_em = now(), resultado = 'Estabelecimento ' || e.situacao || '.'
    from public.estabelecimentos e
   where s.chave = 'aprovacao:' || e.id and e.situacao <> 'pendente' and s.estado in ('nova', 'em_analise', 'aguardando');

  -- Pagamentos falhando (3 ou mais recusados/cancelados na última hora no mesmo lugar)
  begin
    for r in select p.estabelecimento_id, e.nome, count(*) c from public.pagamentos p join public.estabelecimentos e on e.id = p.estabelecimento_id
              where p.criado_em > now() - interval '1 hour' and p.situacao in ('recusado', 'cancelado')
              group by 1, 2 having count(*) >= 3 loop
      perform public.criar_situacao_automatica('pagamentos:' || r.estabelecimento_id || ':' || current_date, 'Pagamentos falhando', r.nome || ' · ' || r.c || ' falhas na última hora',
        'financeiro', 'integracao', 'critica', r.estabelecimento_id, jsonb_build_object('falhas', r.c));
      n := n + 1;
    end loop;
  exception when undefined_table or undefined_column then null;
  end;

  -- Pedidos parados no preparo (5 ou mais itens há mais de 40 min)
  for r in select i.estabelecimento_id, e.nome, count(*) c from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
            join public.estabelecimentos e on e.id = i.estabelecimento_id
            where i.situacao in ('recebido', 'preparo') and p.criado_em between now() - interval '6 hours' and now() - interval '40 minutes'
            group by 1, 2 having count(*) >= 5 loop
    perform public.criar_situacao_automatica('atraso:' || r.estabelecimento_id || ':' || current_date, 'Pedidos parados no preparo', r.nome || ' · ' || r.c || ' itens há mais de 40 min',
      'operacao', 'anomalia', 'critica', r.estabelecimento_id, jsonb_build_object('itens', r.c));
    n := n + 1;
  end loop;

  -- Denúncias repetidas sobre a mesma pessoa (3 ou mais abertas)
  for r in select alvo_usuario, count(*) c from public.denuncias where situacao = 'aberta' and alvo_usuario is not null group by 1 having count(*) >= 3 loop
    perform public.criar_situacao_automatica('denuncias:' || r.alvo_usuario, 'Denúncias repetidas sobre a mesma pessoa', r.c || ' denúncias abertas',
      'seguranca', 'seguranca', 'alta', null, jsonb_build_object('denuncias', r.c, 'usuario', r.alvo_usuario));
    update public.situacoes set usuario_alvo = r.alvo_usuario where chave = 'denuncias:' || r.alvo_usuario;
    n := n + 1;
  end loop;

  -- Notificações sem sair há mais de 10 min
  if (select count(*) from public.notificacoes where enviada_em is null and criado_em between now() - interval '1 day' and now() - interval '10 minutes') >= 20 then
    perform public.criar_situacao_automatica('push:' || current_date, 'Notificações atrasadas', 'Mais de 20 notificações sem envio há mais de 10 min',
      'operacao', 'integracao', 'alta', null, '{}');
    n := n + 1;
  end if;
  return n;
end $$;

-- ============================================================
-- Estabelecimento em contexto
-- ============================================================
create or replace function public.ficha_estabelecimento(p_estab uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if public.nivel_gestao('estabelecimentos') < 1 and public.nivel_gestao('suporte') < 1 and public.nivel_gestao('atendimento') < 1 then
    raise exception 'Sem acesso aos estabelecimentos.';
  end if;
  select jsonb_build_object(
    'id', e.id, 'nome', e.nome, 'codigo', e.codigo, 'bairro', e.bairro, 'situacao', e.situacao, 'motivo_situacao', e.motivo_situacao,
    'criado_em', e.criado_em, 'logo_url', e.logo_url, 'telefone', e.telefone,
    'usuarios_sistema', (select count(*) from public.contas_sistema c where c.estabelecimento_id = e.id),
    'mp_conectado', exists (select 1 from public.mp_contas m where m.estabelecimento_id = e.id),
    'vendas_30', (select coalesce(sum(i.preco * i.quantidade), 0) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                   where i.estabelecimento_id = e.id and p.criado_em > now() - interval '30 days' and i.situacao <> 'cancelado'),
    'pedidos_30', (select count(distinct i.pedido_id) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                    where i.estabelecimento_id = e.id and p.criado_em > now() - interval '30 days'),
    'preparo_medio', (select round(avg(extract(epoch from i.pronto_em - p.criado_em)) / 60) from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                       where i.estabelecimento_id = e.id and i.pronto_em is not null and p.criado_em > now() - interval '30 days'),
    'nota', (select round(avg(nota)::numeric, 1) from public.avaliacoes a where a.estabelecimento_id = e.id),
    'suporte_ativo', exists (select 1 from public.suportes s where s.estabelecimento_id = e.id and s.encerrado_em is null and s.expira_em > now()),
    'historico', coalesce((select jsonb_agg(h order by h.quando desc) from (
        select s.criado_em as quando, 'situacao' as tipo, 'SIT-' || lpad(s.numero::text, 4, '0') || ' · ' || s.titulo || ' · ' || s.estado as texto, s.numero
          from public.situacoes s where s.estabelecimento_id = e.id
        union all
        select su.liberado_em, 'suporte', 'Modo suporte liberado' || coalesce(' · ' || su.motivo, ''), null from public.suportes su where su.estabelecimento_id = e.id
        union all
        select ev.criado_em, 'evento', 'Evento "' || ev.nome || '" ' || ev.situacao, null from public.eventos ev where ev.estabelecimento_id = e.id
        union all
        select e.decidido_em, 'decisao', 'Cadastro ' || e.situacao, null where e.decidido_em is not null
        union all
        select e.criado_em, 'cadastro', 'Cadastro enviado', null
        order by 1 desc limit 30) h), '[]'::jsonb)
  ) into r
  from public.estabelecimentos e where e.id = p_estab;
  return r;
exception when undefined_column or undefined_table then
  return r;
end $$;

create or replace function public.buscar_estabelecimentos_gestao(p_termo text)
returns table (id uuid, nome text, codigo text, bairro text, situacao text, abertas int)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.nome, e.codigo, e.bairro, e.situacao,
         (select count(*) from public.situacoes s where s.estabelecimento_id = e.id and s.estado in ('nova', 'em_analise', 'aguardando'))::int
    from public.estabelecimentos e
   where (public.nivel_gestao('estabelecimentos') >= 1 or public.nivel_gestao('suporte') >= 1 or public.nivel_gestao('atendimento') >= 1)
     and (coalesce(btrim(p_termo), '') = '' or public.normalizar(e.nome) like '%' || public.normalizar(p_termo) || '%' or e.codigo like '%' || lower(btrim(p_termo)) || '%')
   order by e.nome limit 60;
$$;

-- ============================================================
-- Pedido de ajuda do estabelecimento (Business) → situação no Atendimento
-- ============================================================
create or replace function public.pedir_ajuda_rovibes(p_estab uuid, p_titulo text, p_descricao text)
returns bigint language plpgsql security definer set search_path = public as $$
declare v public.situacoes;
begin
  if not public.eh_membro(p_estab) then raise exception 'Você não faz parte deste estabelecimento.'; end if;
  if length(btrim(coalesce(p_titulo, ''))) < 3 then raise exception 'Escreva o assunto.'; end if;
  insert into public.situacoes (titulo, descricao, area, tipo, prioridade, origem, estabelecimento_id, criado_por)
  values (btrim(p_titulo), nullif(btrim(p_descricao), ''), 'atendimento', 'solicitacao', 'media', 'estabelecimento', p_estab, auth.uid())
  returning * into v;
  insert into public.situacao_eventos (situacao_id, tipo, texto, autor_id) values (v.id, 'criada', 'Pedido do estabelecimento', auth.uid());
  return v.numero;
end $$;

create or replace function public.minhas_solicitacoes_rovibes(p_estab uuid)
returns table (numero bigint, titulo text, estado text, criado_em timestamptz, resultado text)
language sql stable security definer set search_path = public as $$
  select s.numero, s.titulo, s.estado, s.criado_em, case when s.estado in ('resolvida', 'encerrada') then s.resultado end
    from public.situacoes s
   where s.estabelecimento_id = p_estab and s.origem = 'estabelecimento' and public.eh_membro(p_estab)
   order by s.criado_em desc limit 50;
$$;

-- Inteligência (preparada): ligar/desligar. A análise em si entra numa próxima etapa.
create or replace function public.configurar_inteligencia(p_ligada boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if public.nivel_gestao('inteligencia') < 5 then raise exception 'Só quem administra a Inteligência muda esta configuração.'; end if;
  update public.config_gestao set valor = jsonb_build_object('ligada', p_ligada), atualizado_por = auth.uid(), atualizado_em = now() where chave = 'inteligencia';
end $$;

revoke execute on function public.abrir_situacao(text, text, text, text, text, uuid, uuid), public.agir_situacao(uuid, text, text, text),
  public.registrar_conhecimento(uuid, text, text, text, text, text[]), public.salvar_conhecimento(uuid, jsonb), public.sugerir_conhecimentos(uuid),
  public.situacoes_lista(text, text, uuid), public.resumo_central(), public.mudancas_central(int), public.pessoas_gestao(), public.detectar_situacoes(boolean),
  public.ficha_estabelecimento(uuid), public.buscar_estabelecimentos_gestao(text), public.pedir_ajuda_rovibes(uuid, text, text),
  public.minhas_solicitacoes_rovibes(uuid), public.configurar_inteligencia(boolean), public.minhas_permissoes_gestao(), public.nivel_gestao(text) from public, anon;
grant execute on function public.abrir_situacao(text, text, text, text, text, uuid, uuid), public.agir_situacao(uuid, text, text, text),
  public.registrar_conhecimento(uuid, text, text, text, text, text[]), public.salvar_conhecimento(uuid, jsonb), public.sugerir_conhecimentos(uuid),
  public.situacoes_lista(text, text, uuid), public.resumo_central(), public.mudancas_central(int), public.pessoas_gestao(), public.detectar_situacoes(boolean),
  public.ficha_estabelecimento(uuid), public.buscar_estabelecimentos_gestao(text), public.pedir_ajuda_rovibes(uuid, text, text),
  public.minhas_solicitacoes_rovibes(uuid), public.configurar_inteligencia(boolean), public.minhas_permissoes_gestao(), public.nivel_gestao(text) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 049 aplicada: Central de operação.' as resultado;
