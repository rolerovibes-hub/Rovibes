-- 050 · Gestão RoVibes: aprovações e denúncias viram situações (uma fila só) e o nível "Autorizar" passa a valer.
-- • Cada cadastro de estabelecimento em análise é uma situação em Estabelecimentos; fecha sozinha quando decidido.
-- • Denúncias sobre a mesma pessoa (ou o mesmo conteúdo) se juntam numa situação em Segurança; fecha quando todas forem tratadas.
-- • Aprovar/recusar e ocultar/advertir: nível Decidir. Suspender/reativar estabelecimento ou conta: nível Autorizar.
-- Pode rodar de novo sem problema. Requer a 049.

create or replace function public.decidir_estabelecimento(p_estab uuid, p_situacao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare v_atual text;
begin
  if not public.eh_equipe('comercial') then raise exception 'Somente a administração do RoVibes pode decidir.'; end if;
  select situacao into v_atual from public.estabelecimentos where id = p_estab;
  -- Aprovar ou recusar o cadastro: quem decide. Suspender ou reativar: quem autoriza.
  if public.nivel_gestao('estabelecimentos') < (case when p_situacao = 'suspenso' or v_atual = 'suspenso' then 4 else 3 end) then
    raise exception 'Seu cargo não permite esta decisão em Estabelecimentos.';
  end if;
  if p_situacao not in ('aprovado', 'recusado', 'suspenso') then raise exception 'Situação inválida.'; end if;
  if p_situacao <> 'aprovado' and coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  update public.estabelecimentos
     set situacao = p_situacao, motivo_situacao = nullif(btrim(p_motivo), ''),
         decidido_por = auth.uid(), decidido_em = now()
   where id = p_estab;
end $$;




create or replace function public.resolver_denuncia(p_denuncia uuid, p_acao text, p_nota text)
returns void language plpgsql security definer set search_path = public as $$
declare d public.denuncias;
begin
  if not public.eh_equipe('moderacao') then raise exception 'Só a administração resolve denúncias.'; end if;
  -- Ocultar, advertir e arquivar: quem decide em Segurança. Suspender a conta: quem autoriza.
  if public.nivel_gestao('seguranca') < (case when p_acao = 'suspenso' then 4 else 3 end) then
    raise exception 'Seu cargo não permite esta decisão em Segurança.';
  end if;
  select * into d from public.denuncias where id = p_denuncia for update;
  if not found then raise exception 'Denúncia não encontrada.'; end if;
  if p_acao = 'ocultado' then
    if d.tipo_alvo = 'story' then update public.stories_pessoas set oculto = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'publicacao' then update public.publicacoes set situacao = 'oculta' where id = d.alvo_id;
    elsif d.tipo_alvo = 'post' then update public.publicacoes_pessoas set oculto = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'mensagem' then update public.mensagens set apagada = true, texto = null, foto = null where id = d.alvo_id;
    elsif d.tipo_alvo = 'comentario' then update public.comentarios set apagado = true where id = d.alvo_id;
    elsif d.tipo_alvo = 'perfil' then update public.perfis set bio = null, foto_url = null where id = d.alvo_id;
    end if;
  elsif p_acao = 'advertido' then
    update public.perfis set advertencias = advertencias + 1 where id = d.alvo_usuario;
  elsif p_acao = 'suspenso' then
    update public.perfis set suspenso = true where id = d.alvo_usuario;
    update public.stories_pessoas set oculto = true where usuario_id = d.alvo_usuario and expira_em > now();
  elsif p_acao <> 'arquivado' then
    raise exception 'Ação inválida.';
  end if;
  update public.denuncias
     set situacao = case when p_acao = 'arquivado' then 'arquivada' else 'resolvida' end,
         acao = p_acao, nota = nullif(btrim(coalesce(p_nota, '')), ''), resolvida_por = auth.uid(), resolvida_em = now()
   where situacao = 'aberta' and tipo_alvo = d.tipo_alvo and alvo_id = d.alvo_id;
end $$;




create or replace function public.reativar_conta(p_pessoa uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('moderacao') then raise exception 'Só a administração.'; end if;
  if public.nivel_gestao('seguranca') < 4 then raise exception 'Só quem autoriza em Segurança reativa contas.'; end if;
  update public.perfis set suspenso = false where id = p_pessoa;
end $$;




create or replace function public.denuncias_da_situacao(p_situacao uuid)
returns table (id uuid, tipo_alvo text, alvo_id uuid, motivo text, detalhe text, criada_em timestamptz, situacao text, acao text,
               denunciante text, alvo_nome text, alvo_usuario_nome text, alvo_foto text, alvo_texto text, alvo_imagem text, total_contra int)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.nivel_gestao('seguranca') < 1 then raise exception 'Sem acesso a Segurança.'; end if;
  return query
  select d.id, d.tipo_alvo, d.alvo_id, d.motivo, d.detalhe, d.criada_em, d.situacao, d.acao,
         coalesce(pd.nome, ''), pa.nome, pa.usuario, pa.foto_url,
         case d.tipo_alvo when 'story' then (select legenda from public.stories_pessoas where stories_pessoas.id = d.alvo_id)
                          when 'publicacao' then (select texto from public.publicacoes where publicacoes.id = d.alvo_id)
                          when 'post' then (select texto from public.publicacoes_pessoas where publicacoes_pessoas.id = d.alvo_id)
                          when 'mensagem' then (select texto from public.mensagens where mensagens.id = d.alvo_id)
                          when 'comentario' then (select texto from public.comentarios where comentarios.id = d.alvo_id)
                          when 'perfil' then pa.bio end,
         case d.tipo_alvo when 'story' then (select foto_url from public.stories_pessoas where stories_pessoas.id = d.alvo_id)
                          when 'publicacao' then (select foto_url from public.publicacoes where publicacoes.id = d.alvo_id)
                          when 'post' then (select foto_url from public.publicacoes_pessoas where publicacoes_pessoas.id = d.alvo_id) end,
         (select count(*) from public.denuncias x where x.alvo_usuario = d.alvo_usuario and d.alvo_usuario is not null)::int
    from public.denuncias d
    left join public.perfis pd on pd.id = d.denunciante_id
    left join public.perfis pa on pa.id = d.alvo_usuario
   where exists (select 1 from public.situacoes s where s.id = p_situacao
                   and ((s.usuario_alvo is not null and d.alvo_usuario = s.usuario_alvo)
                        or (s.usuario_alvo is null and d.alvo_id = (s.dados ->> 'alvo_id')::uuid)))
   order by (d.situacao = 'aberta') desc, d.criada_em desc
   limit 100;
end $$;



revoke execute on function public.denuncias_da_situacao(uuid) from public, anon;
grant execute on function public.denuncias_da_situacao(uuid) to authenticated;

-- ============================================================
-- Aprovação de cadastro → situação
-- ============================================================
create or replace function public.situacao_da_aprovacao()
returns trigger language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if new.situacao = 'pendente' and (tg_op = 'INSERT' or old.situacao is distinct from 'pendente') then
    perform public.criar_situacao_automatica('aprovacao:' || new.id, 'Cadastro aguardando aprovação', new.nome,
      'estabelecimentos', 'solicitacao', 'media', new.id, '{}');
    -- Voltou para análise: reabre a mesma situação.
    update public.situacoes set estado = 'nova', resolvida_em = null, resultado = null
     where chave = 'aprovacao:' || new.id and estado in ('resolvida', 'encerrada');
  elsif tg_op = 'UPDATE' and old.situacao = 'pendente' and new.situacao <> 'pendente' then
    for v in select id from public.situacoes where chave = 'aprovacao:' || new.id and estado in ('nova', 'em_analise', 'aguardando') loop
      update public.situacoes set estado = 'resolvida', resolvida_em = now(),
             resultado = case new.situacao when 'aprovado' then 'Aprovado.' when 'recusado' then 'Recusado: ' || coalesce(new.motivo_situacao, '') else initcap(new.situacao) || '.' end
       where id = v;
      insert into public.situacao_eventos (situacao_id, tipo, texto, autor_id)
      values (v, 'estado', case new.situacao when 'aprovado' then 'Aprovado' when 'recusado' then 'Recusado' else initcap(new.situacao) end, auth.uid());
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists situacao_da_aprovacao on public.estabelecimentos;
create trigger situacao_da_aprovacao after insert or update of situacao on public.estabelecimentos
  for each row execute function public.situacao_da_aprovacao();

-- ============================================================
-- Denúncias → situação (juntando as da mesma pessoa/conteúdo)
-- ============================================================
create or replace function public.situacao_da_denuncia()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_alvo text := coalesce(new.alvo_usuario::text, new.alvo_id::text); v uuid; v_total int; v_pri text;
begin
  if tg_op = 'INSERT' then
    select count(*) into v_total from public.denuncias d
     where d.situacao = 'aberta' and coalesce(d.alvo_usuario::text, d.alvo_id::text) = v_alvo;
    v_pri := case when new.motivo in ('menor', 'violencia') then 'critica' when new.motivo = 'assedio' or v_total >= 3 then 'alta' else 'media' end;
    select id into v from public.situacoes where chave like 'denuncia:' || v_alvo || ':%' and estado in ('nova', 'em_analise', 'aguardando') limit 1;
    if v is null then
      perform public.criar_situacao_automatica('denuncia:' || v_alvo || ':' || new.id, 'Denúncia: ' || replace(new.motivo, '_', ' '),
        coalesce(new.detalhe, 'Denúncia de ' || new.tipo_alvo), 'seguranca', 'seguranca', v_pri, null,
        jsonb_build_object('alvo_tipo', new.tipo_alvo, 'alvo_id', new.alvo_id));
      update public.situacoes set usuario_alvo = new.alvo_usuario where chave = 'denuncia:' || v_alvo || ':' || new.id;
    else
      update public.situacoes
         set titulo = 'Denúncias (' || v_total || ')',
             prioridade = case when prioridade = 'critica' or v_pri = 'critica' then 'critica' when prioridade = 'alta' or v_pri = 'alta' then 'alta' else prioridade end,
             atualizado_em = now()
       where id = v;
      insert into public.situacao_eventos (situacao_id, tipo, texto) values (v, 'comentario', 'Nova denúncia: ' || replace(new.motivo, '_', ' ') || coalesce(' · ' || new.detalhe, ''));
    end if;
  elsif new.situacao <> 'aberta' and old.situacao = 'aberta'
        and not exists (select 1 from public.denuncias d where d.situacao = 'aberta' and coalesce(d.alvo_usuario::text, d.alvo_id::text) = v_alvo) then
    for v in select id from public.situacoes where chave like 'denuncia:' || v_alvo || ':%' and estado in ('nova', 'em_analise', 'aguardando') loop
      update public.situacoes set estado = 'resolvida', resolvida_em = now(),
             resultado = case new.acao when 'ocultado' then 'Conteúdo ocultado' when 'advertido' then 'Pessoa advertida' when 'suspenso' then 'Conta suspensa' else 'Arquivada sem ação' end
                         || coalesce(': ' || new.nota, '') where id = v;
      insert into public.situacao_eventos (situacao_id, tipo, texto, autor_id) values (v, 'estado', 'Resolvida', auth.uid());
    end loop;
  end if;
  return new;
end $$;
drop trigger if exists situacao_da_denuncia on public.denuncias;
create trigger situacao_da_denuncia after insert or update of situacao on public.denuncias
  for each row execute function public.situacao_da_denuncia();

-- Situações antigas do detector de "denúncias repetidas" deixam de existir (agora toda denúncia é situação).
update public.situacoes set estado = 'encerrada', resolvida_em = now(), resultado = 'Substituída pela situação de cada denúncia.'
 where chave like 'denuncias:%' and estado in ('nova', 'em_analise', 'aguardando');

-- Os que já estão esperando entram agora.
do $$
declare e record; d record; v uuid; v_alvo text;
begin
  for e in select id, nome from public.estabelecimentos where situacao = 'pendente' loop
    perform public.criar_situacao_automatica('aprovacao:' || e.id, 'Cadastro aguardando aprovação', e.nome, 'estabelecimentos', 'solicitacao', 'media', e.id, '{}');
  end loop;
  for d in select * from public.denuncias where situacao = 'aberta' order by criada_em loop
    v_alvo := coalesce(d.alvo_usuario::text, d.alvo_id::text);
    select id into v from public.situacoes where chave like 'denuncia:' || v_alvo || ':%' and estado in ('nova', 'em_analise', 'aguardando') limit 1;
    if v is null then
      perform public.criar_situacao_automatica('denuncia:' || v_alvo || ':' || d.id, 'Denúncia: ' || replace(d.motivo, '_', ' '),
        coalesce(d.detalhe, 'Denúncia de ' || d.tipo_alvo), 'seguranca', 'seguranca',
        case when d.motivo in ('menor', 'violencia') then 'critica' when d.motivo = 'assedio' then 'alta' else 'media' end, null,
        jsonb_build_object('alvo_tipo', d.tipo_alvo, 'alvo_id', d.alvo_id));
      update public.situacoes set usuario_alvo = d.alvo_usuario where chave = 'denuncia:' || v_alvo || ':' || d.id;
    end if;
  end loop;
end $$;

-- Detecção automática sem as duplicadas (aprovação e denúncias agora entram na hora).
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
  return n;
end $$;

-- ============================================================
-- Estabelecimentos: uma lista só, com filtros
-- ============================================================
drop function if exists public.buscar_estabelecimentos_gestao(text);
create or replace function public.buscar_estabelecimentos_gestao(p_termo text, p_filtro text default 'todos')
returns table (id uuid, nome text, codigo text, bairro text, situacao text, abertas int, criado_em timestamptz)
language sql stable security definer set search_path = public, extensions as $$
  select e.id, e.nome, e.codigo, e.bairro, e.situacao,
         (select count(*) from public.situacoes s where s.estabelecimento_id = e.id and s.estado in ('nova', 'em_analise', 'aguardando'))::int, e.criado_em
    from public.estabelecimentos e
   where (public.nivel_gestao('estabelecimentos') >= 1 or public.nivel_gestao('suporte') >= 1 or public.nivel_gestao('atendimento') >= 1)
     and (coalesce(btrim(p_termo), '') = '' or public.normalizar(e.nome) like '%' || public.normalizar(p_termo) || '%' or e.codigo like '%' || lower(btrim(p_termo)) || '%')
     and case coalesce(p_filtro, 'todos')
           when 'todos' then true
           when 'com_situacao' then exists (select 1 from public.situacoes s where s.estabelecimento_id = e.id and s.estado in ('nova', 'em_analise', 'aguardando'))
           else e.situacao = p_filtro end
   order by (e.situacao = 'pendente') desc, e.nome limit 200;
$$;
revoke execute on function public.buscar_estabelecimentos_gestao(text, text) from public, anon;
grant execute on function public.buscar_estabelecimentos_gestao(text, text) to authenticated;

-- Central: saúde comparada com o normal do horário e "O que mudou" só com o que os outros fizeram.
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

create or replace function public.mudancas_central(p_limite int default 15)
returns table (situacao_id uuid, numero bigint, titulo text, tipo text, texto text, autor text, criado_em timestamptz)
language sql stable security definer set search_path = public as $$
  select s.id, s.numero, s.titulo, ev.tipo, ev.texto, public.nome_gestao(ev.autor_id), ev.criado_em
    from public.situacao_eventos ev join public.situacoes s on s.id = ev.situacao_id
   where public.gestao_confirmada() and (public.nivel_gestao(s.area) >= 1 or s.responsavel_id = auth.uid())
     and ev.autor_id is distinct from auth.uid() -- o que os outros fizeram
   order by ev.criado_em desc
   limit least(coalesce(p_limite, 15), 50);
$$;

notify pgrst, 'reload schema';

select 'Atualização 050 aplicada: aprovações e denúncias como situações.' as resultado;
