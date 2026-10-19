-- RoVibes 026: Divulgação de eventos e listas.
-- Cartões de evento e de lista de presença no chat direto e em grupos (com o código do promoter),
-- página pública da lista e regra do chat ao vivo: só vale divulgar o próprio lugar.
-- Requer a 025. Pode ser executado mais de uma vez.

alter table public.mensagens add column if not exists dados jsonb;
alter table public.mensagens drop constraint if exists mensagens_tipo_check;
alter table public.mensagens add constraint mensagens_tipo_check check (tipo in ('texto', 'foto', 'sistema', 'lugar', 'plano', 'evento', 'lista'));

-- Lugar e evento de cada alvo divulgável.
create or replace function public.alvo_divulgacao(p_tipo text, p_id uuid)
returns table (estab uuid, evento uuid, titulo text)
language sql stable security definer set search_path = public as $$
  select e.id, null::uuid, e.nome from public.estabelecimentos e where p_tipo = 'lugar' and e.id = p_id and e.situacao = 'aprovado'
  union all
  select ev.estabelecimento_id, ev.id, ev.nome from public.eventos ev join public.estabelecimentos e on e.id = ev.estabelecimento_id
   where p_tipo = 'evento' and ev.id = p_id and e.situacao = 'aprovado' and ev.situacao = 'publicado'
  union all
  select l.estabelecimento_id, l.evento_id, l.nome from public.listas_presenca l join public.estabelecimentos e on e.id = l.estabelecimento_id
   where p_tipo = 'lista' and l.id = p_id and e.situacao = 'aprovado';
$$;

-- Enviar cartão de evento ou de lista numa conversa (direta, grupo ou com o lugar).
create or replace function public.enviar_cartao(p_conversa uuid, p_tipo text, p_id uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare a record; v_id uuid; v_ref text;
begin
  if p_tipo not in ('evento', 'lista') then raise exception 'Tipo inválido.'; end if;
  select * into a from public.alvo_divulgacao(p_tipo, p_id);
  if a.estab is null then raise exception 'Não encontramos o que você quer compartilhar.'; end if;
  -- Usa as mesmas regras de envio (participação, bloqueios, conta ativa).
  v_id := public.enviar_mensagem(p_conversa, coalesce(nullif(btrim(coalesce(p_texto, '')), ''),
            case p_tipo when 'evento' then 'Evento: ' else 'Lista: ' end || a.titulo), null, a.estab);
  select codigo into v_ref from public.promoters where estabelecimento_id = a.estab and usuario_id = auth.uid() and situacao = 'ativo';
  update public.mensagens set tipo = p_tipo, dados = jsonb_build_object('id', p_id, 'evento', a.evento, 'ref', v_ref) where id = v_id;
  return v_id;
end $$;

-- Página pública da lista (/lista/ID).
create or replace function public.lista_publica(p_lista uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', l.id, 'nome', l.nome, 'beneficio', l.beneficio, 'limite', l.limite, 'encerra_em', l.encerra_em,
    'aberta', l.ativa and (l.encerra_em is null or l.encerra_em > now())
              and (ev.id is null or coalesce(ev.fim, ev.inicio + interval '8 hours') > now()),
    'inscritos', (select coalesce(sum(1 + n.acompanhantes), 0) from public.lista_nomes n where n.lista_id = l.id),
    'eu_estou', exists (select 1 from public.lista_nomes n where n.lista_id = l.id and n.usuario_id = auth.uid()),
    'meus_acompanhantes', (select n.acompanhantes from public.lista_nomes n where n.lista_id = l.id and n.usuario_id = auth.uid()),
    'promoter', pf.nome, 'promoter_codigo', p.codigo,
    'estab', jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url, 'bairro', e.bairro),
    'evento', case when ev.id is not null then jsonb_build_object('id', ev.id, 'nome', ev.nome, 'inicio', ev.inicio, 'capa_url', ev.capa_url) end)
    from public.listas_presenca l
    join public.estabelecimentos e on e.id = l.estabelecimento_id and e.situacao = 'aprovado'
    left join public.eventos ev on ev.id = l.evento_id
    left join public.promoters p on p.id = l.promoter_id
    left join public.perfis pf on pf.id = p.usuario_id
   where l.id = p_lista;
$$;

-- Meu código de promoter num lugar (para montar o link de divulgação).
create or replace function public.meu_codigo_promoter(p_estab uuid)
returns text language sql stable security definer set search_path = public as $$
  select codigo from public.promoters where estabelecimento_id = p_estab and usuario_id = auth.uid() and situacao = 'ativo' limit 1;
$$;

-- ============================================================
-- Chat ao vivo: divulgação só do próprio lugar
-- ============================================================
alter table public.mensagens_ao_vivo drop constraint if exists mensagens_ao_vivo_tipo_check;
alter table public.mensagens_ao_vivo add constraint mensagens_ao_vivo_tipo_check
  check (tipo in ('texto', 'foto', 'musica', 'ambiente', 'enquete', 'sistema', 'divulgacao'));

-- Confere se o texto divulga algo que não é deste lugar (links de fora, links de outro lugar, nome de outro lugar que a pessoa promove).
create or replace function public.texto_divulga_outro(p_estab uuid, p_texto text)
returns text language plpgsql stable security definer set search_path = public, extensions as $$
declare u text; v_tipo text; v_id uuid; a record; e record; t text := public.normalizar(coalesce(p_texto, ''));
begin
  for u in select m[1] from regexp_matches(coalesce(p_texto, ''),
             '((?:https?://|www\.)[^\s]+|[a-z0-9-]+\.(?:com\.br|com|net|app|link|ly|me|io|bio|site|br)(?:/[^\s]*)?)', 'gi') as m loop
    if u !~* 'rovibes' then return 'No chat ao vivo não é permitido divulgar links de fora. Divulgue só este lugar e os eventos dele.'; end if;
    v_tipo := substring(u from '/(lugar|evento|lista)/');
    begin
      v_id := substring(u from '/(?:lugar|evento|lista)/([0-9a-fA-F-]{36})')::uuid;
    exception when others then v_id := null;
    end;
    if v_tipo is null or v_id is null then continue; end if;
    select * into a from public.alvo_divulgacao(v_tipo, v_id);
    if a.estab is distinct from p_estab then return 'No chat ao vivo só vale divulgar este lugar e os eventos dele.'; end if;
  end loop;
  -- Promoter de outro lugar não pode citar o lugar que ele promove.
  for e in select x.nome from public.promoters p join public.estabelecimentos x on x.id = p.estabelecimento_id
            where p.usuario_id = auth.uid() and p.situacao = 'ativo' and p.estabelecimento_id <> p_estab and length(x.nome) >= 4 loop
    if position(public.normalizar(e.nome) in t) > 0 then
      return 'Você é promoter de outro lugar: aqui não dá para divulgar ' || e.nome || '.';
    end if;
  end loop;
  return null;
end $$;

-- Regras de envio do chat ao vivo com a checagem de divulgação.
create or replace function public.enviar_ao_vivo(p_sala uuid, p_tipo text, p_texto text, p_foto text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sil timestamptz; v_dados jsonb := coalesce(p_dados, '{}'::jsonb); v_estab uuid; v_motivo text;
begin
  if not public.participa_ao_vivo(p_sala) then raise exception 'Faça check-in no lugar para participar do chat ao vivo.'; end if;
  select estabelecimento_id into v_estab from public.salas_ao_vivo where id = p_sala;
  select ate into v_sil from public.silenciados_ao_vivo where sala_id = p_sala and usuario_id = auth.uid() and ate > now();
  if v_sil is not null then raise exception 'Você foi silenciado pela moderação até %.', to_char(v_sil at time zone 'America/Sao_Paulo', 'HH24:MI'); end if;
  if p_tipo in ('texto', 'foto') and exists (select 1 from public.mensagens_ao_vivo where sala_id = p_sala and usuario_id = auth.uid()
                                              and tipo in ('texto', 'foto') and criado_em > now() - interval '1 second') then
    raise exception 'Calma! Espere um instante antes de mandar outra.';
  end if;
  if p_tipo = 'texto' and coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
  if p_tipo = 'foto' and (p_foto is null or split_part(p_foto, '/', 1) <> p_sala::text) then raise exception 'Foto inválida.'; end if;
  v_motivo := public.texto_divulga_outro(v_estab, coalesce(p_texto, '') || ' ' || coalesce(v_dados->>'musica', ''));
  if v_motivo is not null then raise exception '%', v_motivo; end if;
  if p_tipo = 'musica' then
    if coalesce((v_dados->>'voto')::int, 0) not in (1, -1) then raise exception 'Voto inválido.'; end if;
    v_dados := jsonb_build_object('voto', (v_dados->>'voto')::int, 'musica', nullif(left(btrim(coalesce(v_dados->>'musica', '')), 120), ''));
    if exists (select 1 from public.mensagens_ao_vivo where sala_id = p_sala and usuario_id = auth.uid() and tipo = 'musica' and criado_em > now() - interval '10 minutes') then
      raise exception 'Você já avaliou a música agora há pouco.';
    end if;
  elsif p_tipo = 'ambiente' then
    if coalesce(v_dados->>'movimento', '') not in ('tranquilo', 'moderado', 'cheio') or coalesce((v_dados->>'vibe')::int, 0) not between 1 and 5 then
      raise exception 'Avaliação inválida.';
    end if;
    v_dados := jsonb_build_object('movimento', v_dados->>'movimento', 'vibe', (v_dados->>'vibe')::int);
    if exists (select 1 from public.mensagens_ao_vivo where sala_id = p_sala and usuario_id = auth.uid() and tipo = 'ambiente' and criado_em > now() - interval '20 minutes') then
      raise exception 'Você já avaliou o ambiente agora há pouco.';
    end if;
  elsif p_tipo not in ('texto', 'foto') then
    raise exception 'Tipo de mensagem inválido.';
  end if;
  insert into public.mensagens_ao_vivo (sala_id, usuario_id, tipo, texto, foto_path, dados)
  values (p_sala, auth.uid(), p_tipo, nullif(left(btrim(coalesce(p_texto, '')), 1000), ''), p_foto, v_dados)
  returning id into v_id;
  return v_id;
end $$;

-- Equipe e Promoters do lugar divulgam evento ou lista DESTE lugar no chat ao vivo.
create or replace function public.divulgar_ao_vivo(p_sala uuid, p_tipo text, p_id uuid, p_texto text)
returns uuid language plpgsql security definer set search_path = public as $$
declare s public.salas_ao_vivo; a record; v_id uuid; v_ref text;
begin
  select * into s from public.salas_ao_vivo where id = p_sala and fechou_em is null;
  if s.id is null then raise exception 'O chat ao vivo está fechado.'; end if;
  if not public.modera_ao_vivo(s.estabelecimento_id) then raise exception 'Só a equipe e os Promoters do lugar divulgam no chat ao vivo.'; end if;
  select * into a from public.alvo_divulgacao(p_tipo, p_id);
  if a.estab is distinct from s.estabelecimento_id then raise exception 'No chat ao vivo só vale divulgar este lugar e os eventos dele.'; end if;
  if p_texto is not null and public.texto_divulga_outro(s.estabelecimento_id, p_texto) is not null then
    raise exception '%', public.texto_divulga_outro(s.estabelecimento_id, p_texto);
  end if;
  v_ref := public.meu_codigo_promoter(s.estabelecimento_id);
  insert into public.mensagens_ao_vivo (sala_id, usuario_id, tipo, texto, dados)
  values (p_sala, auth.uid(), 'divulgacao', coalesce(nullif(btrim(coalesce(p_texto, '')), ''), a.titulo),
          jsonb_build_object('alvo', p_tipo, 'id', p_id, 'titulo', a.titulo, 'ref', v_ref))
  returning id into v_id;
  return v_id;
end $$;

revoke execute on function public.alvo_divulgacao(text, uuid), public.enviar_cartao(uuid, text, uuid, text), public.lista_publica(uuid),
  public.meu_codigo_promoter(uuid), public.texto_divulga_outro(uuid, text), public.divulgar_ao_vivo(uuid, text, uuid, text) from public, anon;
grant execute on function public.alvo_divulgacao(text, uuid), public.enviar_cartao(uuid, text, uuid, text), public.lista_publica(uuid),
  public.meu_codigo_promoter(uuid), public.texto_divulga_outro(uuid, text), public.divulgar_ao_vivo(uuid, text, uuid, text) to authenticated;

select 'RoVibes 026 aplicado com sucesso' as resultado;
