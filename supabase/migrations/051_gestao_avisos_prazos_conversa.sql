-- 051 · Gestão: avisos para quem precisa agir, prazo por situação e conversa com o estabelecimento.

-- ============================================================
-- Prazos (em minutos, por prioridade) e tempo parado
-- ============================================================
insert into public.config_gestao (chave, valor)
values ('prazos', '{"critica": 60, "alta": 240, "media": 1440, "baixa": 4320}')
on conflict (chave) do nothing;

alter table public.situacoes add column if not exists prazo_em timestamptz;
alter table public.situacoes add column if not exists lido_estab_em timestamptz;

create or replace function public.prazo_da_prioridade(p_prioridade text, p_inicio timestamptz)
returns timestamptz language sql stable security definer set search_path = public as $$
  select p_inicio + make_interval(mins => coalesce((select (valor ->> p_prioridade)::int from public.config_gestao where chave = 'prazos'),
                                                    case p_prioridade when 'critica' then 60 when 'alta' then 240 when 'media' then 1440 else 4320 end));
$$;

create or replace function public.situacao_prazo()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' or new.prioridade is distinct from old.prioridade then
    new.prazo_em := public.prazo_da_prioridade(new.prioridade, new.criado_em);
    new.dados := new.dados - 'prazo_avisado';
  end if;
  return new;
end $$;
drop trigger if exists situacao_prazo on public.situacoes;
create trigger situacao_prazo before insert or update of prioridade on public.situacoes
for each row execute function public.situacao_prazo();

update public.situacoes set prazo_em = public.prazo_da_prioridade(prioridade, criado_em) where prazo_em is null;

-- ============================================================
-- Avisos da Gestão (sino)
-- ============================================================
create table if not exists public.gestao_avisos (
  id bigint generated always as identity primary key,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao_id uuid references public.situacoes(id) on delete cascade,
  tipo text not null check (tipo in ('atribuida', 'critica', 'prazo', 'resposta', 'pedido')),
  texto text not null,
  lido_em timestamptz,
  criado_em timestamptz not null default now()
);
alter table public.gestao_avisos drop constraint if exists gestao_avisos_tipo_check;
alter table public.gestao_avisos add constraint gestao_avisos_tipo_check check (tipo in ('atribuida', 'critica', 'prazo', 'resposta', 'pedido'));
create index if not exists gestao_avisos_usuario_idx on public.gestao_avisos (usuario_id, criado_em desc);
alter table public.gestao_avisos enable row level security;
drop policy if exists gestao_avisos_ler on public.gestao_avisos;
create policy gestao_avisos_ler on public.gestao_avisos for select to authenticated using (usuario_id = auth.uid() and public.gestao_confirmada());
grant select on public.gestao_avisos to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'gestao_avisos') then
    alter publication supabase_realtime add table public.gestao_avisos;
  end if;
end $$;

-- Nível de outra pessoa numa área (para escolher quem recebe o aviso).
create or replace function public.nivel_gestao_de(p_usuario uuid, p_area text)
returns int language sql stable security definer set search_path = public as $$
  select case
    when g.ceo then 5
    else coalesce((c.permissoes ->> p_area)::int, 0)
  end
  from public.gestao_contas g left join public.gestao_cargos c on c.id = g.cargo_id
  where g.usuario_id = p_usuario and g.ativo;
$$;

-- p_todos = true avisa inclusive quem fez a ação (detecção automática e prazos).
create or replace function public.avisar_gestao(p_usuario uuid, p_situacao uuid, p_tipo text, p_texto text, p_todos boolean default false)
returns void language sql security definer set search_path = public as $$
  insert into public.gestao_avisos (usuario_id, situacao_id, tipo, texto)
  select p_usuario, p_situacao, p_tipo, p_texto
   where p_usuario is not null and (p_todos or p_usuario is distinct from auth.uid())
     and not exists (select 1 from public.gestao_avisos a where a.usuario_id = p_usuario and a.situacao_id = p_situacao
                       and a.tipo = p_tipo and a.lido_em is null);
$$;

create or replace function public.avisar_area(p_area text, p_minimo int, p_situacao uuid, p_tipo text, p_texto text, p_todos boolean default false)
returns void language plpgsql security definer set search_path = public as $$
declare r record;
begin
  for r in select usuario_id from public.gestao_contas where ativo loop
    if coalesce(public.nivel_gestao_de(r.usuario_id, p_area), 0) >= p_minimo then
      perform public.avisar_gestao(r.usuario_id, p_situacao, p_tipo, p_texto, p_todos);
    end if;
  end loop;
end $$;

create or replace function public.situacao_avisos()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_cod text := 'SIT-' || lpad(new.numero::text, 4, '0');
begin
  if new.estado not in ('nova', 'em_analise', 'aguardando') then return new; end if;
  if new.responsavel_id is not null and (tg_op = 'INSERT' or new.responsavel_id is distinct from old.responsavel_id) then
    perform public.avisar_gestao(new.responsavel_id, new.id, 'atribuida', v_cod || ' · ' || new.titulo);
  end if;
  if tg_op = 'INSERT' and new.origem = 'estabelecimento' then
    perform public.avisar_area(new.area, 2, new.id, 'pedido', v_cod || ' · ' || new.titulo, true);
  end if;
  if new.prioridade = 'critica' and (tg_op = 'INSERT' or old.prioridade <> 'critica') then
    perform public.avisar_area(new.area, 2, new.id, 'critica', v_cod || ' · ' || new.titulo, new.origem = 'automatica');
  end if;
  return new;
end $$;
drop trigger if exists situacao_avisos on public.situacoes;
create trigger situacao_avisos after insert or update of responsavel_id, prioridade on public.situacoes
for each row execute function public.situacao_avisos();

create or replace function public.meus_avisos_gestao(p_limite int default 30)
returns table (id bigint, tipo text, texto text, numero bigint, lido boolean, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select a.id, a.tipo, a.texto, s.numero, a.lido_em is not null, a.criado_em
    from public.gestao_avisos a left join public.situacoes s on s.id = a.situacao_id
   where a.usuario_id = auth.uid() and public.gestao_confirmada()
   order by a.criado_em desc limit greatest(1, least(p_limite, 100));
$$;

create or replace function public.ler_avisos_gestao(p_id bigint default null)
returns void language sql security definer set search_path = public as $$
  update public.gestao_avisos set lido_em = now()
   where usuario_id = auth.uid() and lido_em is null and (p_id is null or id = p_id);
$$;

-- Abrir a situação também marca os avisos dela como lidos.
create or replace function public.ler_avisos_da_situacao(p_situacao uuid)
returns void language sql security definer set search_path = public as $$
  update public.gestao_avisos set lido_em = now()
   where usuario_id = auth.uid() and lido_em is null and situacao_id = p_situacao;
$$;

-- ============================================================
-- Conversa com o estabelecimento (Ajuda RoVibes)
-- Eventos do tipo 'mensagem' são vistos pelo estabelecimento; 'comentario' continua interno.
-- ============================================================
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
    when 'responder' then
      if n < 2 and s.responsavel_id is distinct from auth.uid() then raise exception 'Seu cargo só permite ver esta área.'; end if;
      if s.origem <> 'estabelecimento' then raise exception 'Esta situação não tem conversa com o estabelecimento.'; end if;
      if coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
      perform public.registrar_evento_situacao(p_id, 'mensagem', btrim(p_texto), jsonb_build_object('lado', 'equipe'));
      if s.responsavel_id is null then
        update public.situacoes set responsavel_id = auth.uid(), estado = case when estado = 'nova' then 'em_analise' else estado end where id = p_id;
      elsif s.estado = 'nova' then
        update public.situacoes set estado = 'em_analise' where id = p_id;
      end if;
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

-- Lista de pedidos do estabelecimento, com quantas respostas novas da equipe.
drop function if exists public.minhas_solicitacoes_rovibes(uuid);
create function public.minhas_solicitacoes_rovibes(p_estab uuid)
returns table (numero bigint, titulo text, estado text, criado_em timestamptz, resultado text, novas int, atualizado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select s.numero, s.titulo, s.estado, s.criado_em, case when s.estado in ('resolvida', 'encerrada') then s.resultado end,
         (select count(*) from public.situacao_eventos ev
           where ev.situacao_id = s.id and (ev.tipo = 'mensagem' and ev.dados ->> 'lado' = 'equipe'
                                             or ev.tipo = 'estado' and ev.texto in ('Resolvida', 'Encerrada'))
             and ev.criado_em > coalesce(s.lido_estab_em, s.criado_em))::int,
         s.atualizado_em
    from public.situacoes s
   where s.estabelecimento_id = p_estab and s.origem = 'estabelecimento' and public.eh_membro(p_estab)
   order by (s.estado in ('resolvida', 'encerrada')), s.atualizado_em desc limit 50;
$$;

-- Conversa de um pedido (o estabelecimento só vê o que é para ele).
create or replace function public.conversa_ajuda_rovibes(p_estab uuid, p_numero bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare s public.situacoes;
begin
  if not public.eh_membro(p_estab) then raise exception 'Você não faz parte deste estabelecimento.'; end if;
  select * into s from public.situacoes where numero = p_numero and estabelecimento_id = p_estab and origem = 'estabelecimento';
  if not found then raise exception 'Pedido não encontrado.'; end if;
  update public.situacoes set lido_estab_em = now() where id = s.id;
  return jsonb_build_object(
    'numero', s.numero, 'titulo', s.titulo, 'descricao', s.descricao, 'estado', s.estado, 'criado_em', s.criado_em,
    'resultado', case when s.estado in ('resolvida', 'encerrada') then s.resultado end,
    'mensagens', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', ev.id, 'texto', ev.texto, 'criado_em', ev.criado_em,
               'lado', coalesce(ev.dados ->> 'lado', 'equipe'),
               'autor', case when ev.dados ->> 'lado' = 'estabelecimento'
                             then coalesce((select login from public.contas_sistema where usuario_id = ev.autor_id), 'Estabelecimento')
                             else 'RoVibes' end) order by ev.criado_em)
        from public.situacao_eventos ev where ev.situacao_id = s.id and ev.tipo = 'mensagem'), '[]'::jsonb));
end $$;

create or replace function public.responder_ajuda_rovibes(p_estab uuid, p_numero bigint, p_texto text)
returns void language plpgsql security definer set search_path = public as $$
declare s public.situacoes;
begin
  if not public.eh_membro(p_estab) then raise exception 'Você não faz parte deste estabelecimento.'; end if;
  if coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
  select * into s from public.situacoes where numero = p_numero and estabelecimento_id = p_estab and origem = 'estabelecimento';
  if not found then raise exception 'Pedido não encontrado.'; end if;
  perform public.registrar_evento_situacao(s.id, 'mensagem', btrim(p_texto), jsonb_build_object('lado', 'estabelecimento'));
  -- Resposta reabre o pedido e tira do "aguardando".
  if s.estado in ('aguardando', 'resolvida', 'encerrada') then
    update public.situacoes set estado = 'em_analise', resolvida_em = null where id = s.id;
    if s.estado <> 'aguardando' then
      perform public.registrar_evento_situacao(s.id, 'estado', 'Reaberta pelo estabelecimento');
    end if;
  end if;
  update public.situacoes set lido_estab_em = now() where id = s.id;
  if s.responsavel_id is not null then
    perform public.avisar_gestao(s.responsavel_id, s.id, 'resposta', 'SIT-' || lpad(s.numero::text, 4, '0') || ' · ' || s.titulo);
  else
    perform public.avisar_area(s.area, 2, s.id, 'resposta', 'SIT-' || lpad(s.numero::text, 4, '0') || ' · ' || s.titulo);
  end if;
end $$;

-- ============================================================
-- Lista de situações com prazo
-- ============================================================
drop function if exists public.situacoes_lista(text, text, uuid);
create function public.situacoes_lista(p_filtro text default 'atencao', p_area text default null, p_estab uuid default null)
returns table (id uuid, numero bigint, titulo text, area text, tipo text, prioridade text, estado text, origem text,
               conhecimento_numero bigint, estabelecimento_id uuid, estabelecimento text, responsavel_id uuid, responsavel text,
               criado_em timestamptz, atualizado_em timestamptz, prazo_em timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.numero, s.titulo, s.area, s.tipo, s.prioridade, s.estado, s.origem, k.numero, s.estabelecimento_id, e.nome,
         s.responsavel_id, public.nome_gestao(s.responsavel_id), s.criado_em, s.atualizado_em, s.prazo_em
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
           when 'atrasadas' then s.estado in ('nova', 'em_analise') and s.prazo_em < now()
           when 'resolvidas' then s.estado in ('resolvida', 'encerrada')
           else true end
   order by case when s.estado in ('resolvida', 'encerrada') then 1 else 0 end,
            case s.prioridade when 'critica' then 0 when 'alta' then 1 when 'media' then 2 else 3 end,
            (s.estado <> 'aguardando' and s.prazo_em < now()) desc,
            (s.responsavel_id = auth.uid()) desc, s.atualizado_em desc
   limit 200;
$$;

-- KPI "atrasadas" na Central (no lugar de "comigo", que já é um filtro da lista)
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
    'atrasadas', (select count(*) from vis where estado in ('nova', 'em_analise') and prazo_em < now()),
    'resolvidas_semana', (select count(*) from vis where estado in ('resolvida', 'encerrada') and resolvida_em > now() - interval '7 days'),
    'por_area', (select coalesce(jsonb_object_agg(area, n), '{}'::jsonb) from (select area, count(*) n from vis where estado in ('nova', 'em_analise', 'aguardando') group by area) x),
    'saude', case when public.nivel_gestao('operacao') >= 1 then jsonb_build_object(
      'pedidos_hora', (select count(*) from public.pedidos where criado_em > now() - interval '1 hour'),
      'pagamentos_aprovados', (select round(100.0 * count(*) filter (where situacao = 'aprovado') / nullif(count(*) filter (where situacao in ('aprovado', 'recusado', 'cancelado')), 0))
                                 from public.pagamentos where criado_em > now() - interval '24 hours'),
      'notificacoes_atrasadas', (select count(*) from public.notificacoes where enviada_em is null and criado_em between now() - interval '1 day' and now() - interval '10 minutes'),
      -- Normal do horário: média da mesma hora nos últimos 4 mesmos dias da semana.
      'pedidos_hora_normal', (select round(count(*) / 4.0) from public.pedidos
                               where criado_em > now() - interval '29 days'
                                 and extract(dow from criado_em at time zone 'America/Sao_Paulo') = extract(dow from now() at time zone 'America/Sao_Paulo')
                                 and extract(hour from criado_em at time zone 'America/Sao_Paulo') = extract(hour from now() at time zone 'America/Sao_Paulo')
                                 and criado_em < now() - interval '1 day'),
      'cadastros_em_analise', (select count(*) from public.estabelecimentos where situacao = 'pendente')
    ) end
  ) into r;
  return r;
exception when undefined_column or undefined_table then
  return r;
end $$;

-- ============================================================
-- Detecção: avisa quando o prazo vence (uma vez por situação)
-- ============================================================
create or replace function public.avisar_prazos_vencidos()
returns void language plpgsql security definer set search_path = public as $$
declare r record; v_cod text;
begin
  for r in select * from public.situacoes
            where estado in ('nova', 'em_analise') and prazo_em < now() and not (dados ? 'prazo_avisado') loop
    v_cod := 'SIT-' || lpad(r.numero::text, 4, '0') || ' · ' || r.titulo;
    perform public.avisar_gestao(r.responsavel_id, r.id, 'prazo', v_cod, true);
    -- Quem decide na área também fica sabendo.
    perform public.avisar_area(r.area, 3, r.id, 'prazo', v_cod, true);
    update public.situacoes set dados = dados || '{"prazo_avisado": true}' where id = r.id;
  end loop;
end $$;

create or replace function public.detectar_situacoes(p_forcar boolean default false)
returns int language plpgsql security definer set search_path = public as $$
declare r record; n int := 0; v_ultima timestamptz;
begin
  if not public.gestao_confirmada() then return 0; end if;
  select (valor ->> 'ultima')::timestamptz into v_ultima from public.config_gestao where chave = 'deteccao';
  if not p_forcar and v_ultima is not null and v_ultima > now() - interval '2 minutes' then return 0; end if;
  update public.config_gestao set valor = jsonb_build_object('ultima', now()), atualizado_em = now() where chave = 'deteccao';

  -- Aprovação esperando há mais de 48 h sobe para alta
  update public.situacoes s set prioridade = 'alta'
    from public.estabelecimentos e
   where s.chave = 'aprovacao:' || e.id and e.situacao = 'pendente' and e.criado_em < now() - interval '48 hours'
     and s.prioridade in ('media', 'baixa') and s.estado in ('nova', 'em_analise', 'aguardando');

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

  -- Notificações sem sair há mais de 10 min
  if (select count(*) from public.notificacoes where enviada_em is null and criado_em between now() - interval '1 day' and now() - interval '10 minutes') >= 20 then
    perform public.criar_situacao_automatica('push:' || current_date, 'Notificações atrasadas', 'Mais de 20 notificações sem envio há mais de 10 min',
      'operacao', 'integracao', 'alta', null, '{}');
    n := n + 1;
  end if;
  perform public.avisar_prazos_vencidos();
  return n;
end $$;

revoke execute on function public.prazo_da_prioridade(text, timestamptz), public.nivel_gestao_de(uuid, text),
  public.avisar_gestao(uuid, uuid, text, text, boolean), public.avisar_area(text, int, uuid, text, text, boolean), public.avisar_prazos_vencidos() from public, anon, authenticated;
revoke execute on function public.meus_avisos_gestao(int), public.ler_avisos_gestao(bigint), public.ler_avisos_da_situacao(uuid),
  public.minhas_solicitacoes_rovibes(uuid), public.conversa_ajuda_rovibes(uuid, bigint), public.responder_ajuda_rovibes(uuid, bigint, text),
  public.situacoes_lista(text, text, uuid) from public, anon;
grant execute on function public.meus_avisos_gestao(int), public.ler_avisos_gestao(bigint), public.ler_avisos_da_situacao(uuid),
  public.minhas_solicitacoes_rovibes(uuid), public.conversa_ajuda_rovibes(uuid, bigint), public.responder_ajuda_rovibes(uuid, bigint, text),
  public.situacoes_lista(text, text, uuid) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 051 aplicada: avisos, prazos e conversa com o estabelecimento.' as resultado;
