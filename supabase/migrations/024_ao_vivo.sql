-- RoVibes 024: Chat ao vivo do estabelecimento.
-- Abre e fecha sozinho pelos horários do lugar (ou na mão pela equipe). Quem fez check-in participa;
-- quem não fez vê uma prévia de 5 minutos por noite. Depois de fechado, só a equipe vê (histórico de 90 dias).
-- Pode ser executado mais de uma vez.

create table if not exists public.salas_ao_vivo (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  abriu_em timestamptz not null default now(),
  fecha_previsto timestamptz not null,
  fechou_em timestamptz,
  modo text not null default 'auto' check (modo in ('auto', 'manual')),
  aberta_por uuid references auth.users(id) on delete set null,
  fixada_id uuid
);
create unique index if not exists salas_ao_vivo_uma_aberta on public.salas_ao_vivo (estabelecimento_id) where fechou_em is null;
create index if not exists salas_ao_vivo_estab_idx on public.salas_ao_vivo (estabelecimento_id, abriu_em desc);

create table if not exists public.mensagens_ao_vivo (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_ao_vivo(id) on delete cascade,
  usuario_id uuid references auth.users(id) on delete set null,
  tipo text not null check (tipo in ('texto', 'foto', 'musica', 'ambiente', 'enquete', 'sistema')),
  texto text check (texto is null or length(texto) <= 1000),
  foto_path text,
  dados jsonb not null default '{}'::jsonb,
  criado_em timestamptz not null default now(),
  apagada_em timestamptz,
  apagada_por uuid references auth.users(id) on delete set null
);
create index if not exists mensagens_ao_vivo_sala_idx on public.mensagens_ao_vivo (sala_id, criado_em desc);

create table if not exists public.enquetes_ao_vivo (
  id uuid primary key default gen_random_uuid(),
  sala_id uuid not null references public.salas_ao_vivo(id) on delete cascade,
  criada_por uuid references auth.users(id) on delete set null,
  pergunta text not null check (length(btrim(pergunta)) between 3 and 200),
  opcoes text[] not null check (array_length(opcoes, 1) between 2 and 6),
  fecha_em timestamptz,
  encerrada boolean not null default false,
  criado_em timestamptz not null default now()
);
create table if not exists public.votos_ao_vivo (
  enquete_id uuid not null references public.enquetes_ao_vivo(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  opcao smallint not null,
  votado_em timestamptz not null default now(),
  primary key (enquete_id, usuario_id)
);
create table if not exists public.silenciados_ao_vivo (
  sala_id uuid not null references public.salas_ao_vivo(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  ate timestamptz not null,
  expulso boolean not null default false,
  por uuid references auth.users(id) on delete set null,
  primary key (sala_id, usuario_id)
);
create table if not exists public.previas_ao_vivo (
  sala_id uuid not null references public.salas_ao_vivo(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  inicio timestamptz not null default now(),
  primary key (sala_id, usuario_id)
);

alter table public.salas_ao_vivo enable row level security;
alter table public.mensagens_ao_vivo enable row level security;
alter table public.enquetes_ao_vivo enable row level security;
alter table public.votos_ao_vivo enable row level security;
alter table public.silenciados_ao_vivo enable row level security;
alter table public.previas_ao_vivo enable row level security;

-- ============================================================
-- Quem é quem
-- ============================================================
-- Equipe que modera e vê o histórico: dono, gestor, quem atende mensagens (T2001) ou tem o app Chat ao vivo (T2002).
create or replace function public.equipe_ao_vivo(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.atende_estab(p_estab) or public.pode_usar(p_estab, 'T2002');
$$;

-- Moderação na sala aberta (a atualização dos Promoters amplia esta função).
create or replace function public.modera_ao_vivo(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.equipe_ao_vivo(p_estab);
$$;

create or replace function public.participa_ao_vivo(p_sala uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.salas_ao_vivo s
     where s.id = p_sala and s.fechou_em is null
       and not exists (select 1 from public.silenciados_ao_vivo x where x.sala_id = s.id and x.usuario_id = auth.uid() and x.expulso)
       and (public.modera_ao_vivo(s.estabelecimento_id)
            or exists (select 1 from public.checkins c where c.usuario_id = auth.uid() and c.estabelecimento_id = s.estabelecimento_id
                         and c.criado_em >= s.abriu_em - interval '1 hour')));
$$;

create or replace function public.pode_ler_ao_vivo(p_sala uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.salas_ao_vivo s
     where s.id = p_sala
       and (case when s.fechou_em is null then
                   public.participa_ao_vivo(s.id)
                   or exists (select 1 from public.previas_ao_vivo p where p.sala_id = s.id and p.usuario_id = auth.uid() and p.inicio > now() - interval '5 minutes')
                 else public.equipe_ao_vivo(s.estabelecimento_id) end));
$$;

drop policy if exists salas_ao_vivo_ler on public.salas_ao_vivo;
create policy salas_ao_vivo_ler on public.salas_ao_vivo for select to authenticated
  using (fechou_em is null or public.equipe_ao_vivo(estabelecimento_id));
drop policy if exists mensagens_ao_vivo_ler on public.mensagens_ao_vivo;
create policy mensagens_ao_vivo_ler on public.mensagens_ao_vivo for select to authenticated
  using (public.pode_ler_ao_vivo(sala_id) and (apagada_em is null or public.equipe_ao_vivo((select estabelecimento_id from public.salas_ao_vivo where id = sala_id))));
drop policy if exists enquetes_ao_vivo_ler on public.enquetes_ao_vivo;
create policy enquetes_ao_vivo_ler on public.enquetes_ao_vivo for select to authenticated using (public.pode_ler_ao_vivo(sala_id));
drop policy if exists votos_ao_vivo_ler on public.votos_ao_vivo;
create policy votos_ao_vivo_ler on public.votos_ao_vivo for select to authenticated
  using (public.pode_ler_ao_vivo((select sala_id from public.enquetes_ao_vivo where id = enquete_id)));

-- ============================================================
-- Abertura e fechamento automáticos (pelos horários, no fuso de Uberlândia)
-- ============================================================
create or replace function public.janela_funcionamento(p_estab uuid, p_em timestamptz default now())
returns table (inicio timestamptz, fim timestamptz)
language sql stable security definer set search_path = public as $$
  with agora as (select (p_em at time zone 'America/Sao_Paulo') as l),
  cand as (
    select (d::date + h.abre) as ini,
           (d::date + h.fecha + case when h.fecha <= h.abre then interval '1 day' else interval '0' end) as fim
      from agora, public.horarios h,
           lateral (values ((agora.l)::date), ((agora.l)::date - 1)) as dias(d)
     where h.estabelecimento_id = p_estab and h.dia_semana = extract(dow from d)::int
  )
  select (ini at time zone 'America/Sao_Paulo'), (fim at time zone 'America/Sao_Paulo')
    from cand, agora where agora.l >= ini and agora.l < fim
   order by ini desc limit 1;
$$;

-- Devolve a sala aberta agora (abre sozinha no horário; fecha sozinha no fim).
create or replace function public.sala_ao_vivo(p_estab uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; j record;
begin
  update public.salas_ao_vivo set fechou_em = fecha_previsto
   where estabelecimento_id = p_estab and fechou_em is null and fecha_previsto <= now();
  select id into v_id from public.salas_ao_vivo where estabelecimento_id = p_estab and fechou_em is null;
  if v_id is not null then return v_id; end if;
  if not exists (select 1 from public.estabelecimentos where id = p_estab and situacao = 'aprovado') then return null; end if;
  select * into j from public.janela_funcionamento(p_estab);
  if j.inicio is null then return null; end if;
  -- Se a equipe fechou na mão nesta mesma noite, não reabre sozinha.
  if exists (select 1 from public.salas_ao_vivo where estabelecimento_id = p_estab and abriu_em >= j.inicio) then return null; end if;
  insert into public.salas_ao_vivo (estabelecimento_id, abriu_em, fecha_previsto, modo)
  values (p_estab, j.inicio, j.fim, 'auto')
  on conflict do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.salas_ao_vivo where estabelecimento_id = p_estab and fechou_em is null; end if;
  return v_id;
end $$;

create or replace function public.abrir_ao_vivo(p_estab uuid, p_horas numeric)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; j record;
begin
  if not public.equipe_ao_vivo(p_estab) then raise exception 'Só a equipe do estabelecimento abre o chat ao vivo.'; end if;
  v_id := public.sala_ao_vivo(p_estab);
  if v_id is not null then return v_id; end if;
  select * into j from public.janela_funcionamento(p_estab);
  insert into public.salas_ao_vivo (estabelecimento_id, abriu_em, fecha_previsto, modo, aberta_por)
  values (p_estab, now(), coalesce(case when p_horas > 0 then now() + make_interval(mins => (p_horas * 60)::int) end, j.fim, now() + interval '6 hours'), 'manual', auth.uid())
  returning id into v_id;
  insert into public.mensagens_ao_vivo (sala_id, tipo, texto) values (v_id, 'sistema', 'O chat ao vivo começou.');
  return v_id;
end $$;

create or replace function public.fechar_ao_vivo(p_estab uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.equipe_ao_vivo(p_estab) then raise exception 'Só a equipe do estabelecimento fecha o chat ao vivo.'; end if;
  update public.salas_ao_vivo set fechou_em = now() where estabelecimento_id = p_estab and fechou_em is null;
end $$;

-- ============================================================
-- Entrar, ler e escrever
-- ============================================================
create or replace function public.entrar_ao_vivo(p_estab uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare v_sala uuid; s public.salas_ao_vivo; v_papel text; v_previa timestamptz; v_sil public.silenciados_ao_vivo; e record;
begin
  select id, nome, logo_url into e from public.estabelecimentos where id = p_estab;
  v_sala := public.sala_ao_vivo(p_estab);
  if v_sala is null then
    return jsonb_build_object('sala', null, 'papel', case when public.equipe_ao_vivo(p_estab) then 'equipe_fechado' else 'fechado' end,
                              'estab', jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url));
  end if;
  select * into s from public.salas_ao_vivo where id = v_sala;
  select * into v_sil from public.silenciados_ao_vivo where sala_id = v_sala and usuario_id = auth.uid();
  if v_sil.expulso then
    v_papel := 'expulso';
  elsif public.modera_ao_vivo(p_estab) then
    v_papel := 'moderador';
  elsif public.participa_ao_vivo(v_sala) then
    v_papel := 'participante';
  else
    insert into public.previas_ao_vivo (sala_id, usuario_id) values (v_sala, auth.uid()) on conflict do nothing;
    select inicio + interval '5 minutes' into v_previa from public.previas_ao_vivo where sala_id = v_sala and usuario_id = auth.uid();
    v_papel := case when v_previa > now() then 'previa' else 'previa_encerrada' end;
  end if;
  return jsonb_build_object(
    'sala', v_sala, 'papel', v_papel, 'previa_ate', v_previa,
    'silenciado_ate', case when v_sil.ate > now() and not v_sil.expulso then v_sil.ate end,
    'abriu_em', s.abriu_em, 'fecha_previsto', s.fecha_previsto, 'fixada_id', s.fixada_id,
    'estab', jsonb_build_object('id', e.id, 'nome', e.nome, 'logo_url', e.logo_url));
end $$;

create or replace function public.mensagens_ao_vivo_lista(p_sala uuid, p_antes timestamptz, p_limite int)
returns table (id uuid, usuario_id uuid, nome text, usuario text, foto_url text, moderador boolean, tipo text, texto text, foto_path text,
               dados jsonb, criado_em timestamptz, apagada boolean)
language plpgsql stable security definer set search_path = public as $$
declare v_estab uuid; v_equipe boolean;
begin
  if not public.pode_ler_ao_vivo(p_sala) then raise exception 'Sem acesso a este chat ao vivo.'; end if;
  select estabelecimento_id into v_estab from public.salas_ao_vivo where salas_ao_vivo.id = p_sala;
  v_equipe := public.equipe_ao_vivo(v_estab);
  return query
  select * from (
    select m.id, m.usuario_id, p.nome, p.usuario, p.foto_url,
           (m.usuario_id is not null and (exists (select 1 from public.membros mb where mb.estabelecimento_id = v_estab and mb.usuario_id = m.usuario_id and mb.ativo)
             or exists (select 1 from public.estabelecimentos x where x.id = v_estab and x.criado_por = m.usuario_id))),
           m.tipo, case when m.apagada_em is null or v_equipe then m.texto end, case when m.apagada_em is null or v_equipe then m.foto_path end,
           m.dados, m.criado_em, m.apagada_em is not null
      from public.mensagens_ao_vivo m left join public.perfis p on p.id = m.usuario_id
     where m.sala_id = p_sala and (p_antes is null or m.criado_em < p_antes) and (m.apagada_em is null or v_equipe)
     order by m.criado_em desc limit least(greatest(coalesce(p_limite, 50), 1), 1000)
  ) x order by x.criado_em;
end $$;

create or replace function public.enviar_ao_vivo(p_sala uuid, p_tipo text, p_texto text, p_foto text, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid; v_sil timestamptz; v_dados jsonb := coalesce(p_dados, '{}'::jsonb);
begin
  if not public.participa_ao_vivo(p_sala) then raise exception 'Faça check-in no lugar para participar do chat ao vivo.'; end if;
  select ate into v_sil from public.silenciados_ao_vivo where sala_id = p_sala and usuario_id = auth.uid() and ate > now();
  if v_sil is not null then raise exception 'Você foi silenciado pela moderação até %.', to_char(v_sil at time zone 'America/Sao_Paulo', 'HH24:MI'); end if;
  if p_tipo in ('texto', 'foto') and exists (select 1 from public.mensagens_ao_vivo where sala_id = p_sala and usuario_id = auth.uid()
                                              and tipo in ('texto', 'foto') and criado_em > now() - interval '1 second') then
    raise exception 'Calma! Espere um instante antes de mandar outra.';
  end if;
  if p_tipo = 'texto' and coalesce(btrim(p_texto), '') = '' then raise exception 'Escreva a mensagem.'; end if;
  if p_tipo = 'foto' and (p_foto is null or split_part(p_foto, '/', 1) <> p_sala::text) then raise exception 'Foto inválida.'; end if;
  if p_tipo = 'musica' then
    if coalesce((v_dados->>'voto')::int, 0) not in (1, -1) then raise exception 'Voto inválido.'; end if;
    v_dados := jsonb_build_object('voto', (v_dados->>'voto')::int, 'musica', nullif(left(btrim(coalesce(v_dados->>'musica', '')), 120), ''));
    -- Um voto por música a cada 10 minutos por pessoa.
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

-- ============================================================
-- Enquetes (só equipe e Promoters criam; quem participa vota)
-- ============================================================
create or replace function public.criar_enquete_ao_vivo(p_sala uuid, p_pergunta text, p_opcoes text[], p_minutos int)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_id uuid; v_opcoes text[];
begin
  select estabelecimento_id into v_estab from public.salas_ao_vivo where id = p_sala and fechou_em is null;
  if v_estab is null or not public.modera_ao_vivo(v_estab) then raise exception 'Só a equipe e os Promoters criam enquetes.'; end if;
  select array_agg(left(btrim(o), 60)) into v_opcoes from unnest(p_opcoes) o where btrim(o) <> '';
  if coalesce(array_length(v_opcoes, 1), 0) < 2 then raise exception 'Informe pelo menos 2 opções.'; end if;
  insert into public.enquetes_ao_vivo (sala_id, criada_por, pergunta, opcoes, fecha_em)
  values (p_sala, auth.uid(), btrim(p_pergunta), v_opcoes[1:6], case when p_minutos > 0 then now() + make_interval(mins => p_minutos) end)
  returning id into v_id;
  insert into public.mensagens_ao_vivo (sala_id, usuario_id, tipo, texto, dados)
  values (p_sala, auth.uid(), 'enquete', btrim(p_pergunta), jsonb_build_object('enquete_id', v_id));
  return v_id;
end $$;

create or replace function public.votar_enquete_ao_vivo(p_enquete uuid, p_opcao int)
returns void language plpgsql security definer set search_path = public as $$
declare q public.enquetes_ao_vivo;
begin
  select * into q from public.enquetes_ao_vivo where id = p_enquete;
  if q.id is null or not public.participa_ao_vivo(q.sala_id) then raise exception 'Faça check-in no lugar para votar.'; end if;
  if q.encerrada or (q.fecha_em is not null and q.fecha_em <= now()) then raise exception 'A enquete já foi encerrada.'; end if;
  if p_opcao < 0 or p_opcao >= array_length(q.opcoes, 1) then raise exception 'Opção inválida.'; end if;
  insert into public.votos_ao_vivo (enquete_id, usuario_id, opcao) values (p_enquete, auth.uid(), p_opcao)
  on conflict (enquete_id, usuario_id) do update set opcao = excluded.opcao, votado_em = now();
end $$;

create or replace function public.encerrar_enquete_ao_vivo(p_enquete uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid;
begin
  select s.estabelecimento_id into v_estab from public.enquetes_ao_vivo q join public.salas_ao_vivo s on s.id = q.sala_id where q.id = p_enquete;
  if v_estab is null or not public.modera_ao_vivo(v_estab) then raise exception 'Sem permissão.'; end if;
  update public.enquetes_ao_vivo set encerrada = true where id = p_enquete;
end $$;

create or replace function public.enquetes_ao_vivo_lista(p_sala uuid)
returns table (id uuid, pergunta text, opcoes text[], votos int[], total int, meu_voto int, aberta boolean, fecha_em timestamptz, criado_em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.pode_ler_ao_vivo(p_sala) then raise exception 'Sem acesso a este chat ao vivo.'; end if;
  return query
  select q.id, q.pergunta, q.opcoes,
         (select array_agg((select count(*) from public.votos_ao_vivo v where v.enquete_id = q.id and v.opcao = i - 1)::int order by i)
            from generate_series(1, array_length(q.opcoes, 1)) i),
         (select count(*)::int from public.votos_ao_vivo v where v.enquete_id = q.id),
         (select v.opcao::int from public.votos_ao_vivo v where v.enquete_id = q.id and v.usuario_id = auth.uid()),
         not q.encerrada and (q.fecha_em is null or q.fecha_em > now()), q.fecha_em, q.criado_em
    from public.enquetes_ao_vivo q where q.sala_id = p_sala order by q.criado_em desc;
end $$;

-- ============================================================
-- Moderação
-- ============================================================
create or replace function public.apagar_ao_vivo(p_msg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare m record;
begin
  select msg.usuario_id, s.estabelecimento_id into m from public.mensagens_ao_vivo msg join public.salas_ao_vivo s on s.id = msg.sala_id where msg.id = p_msg;
  if m is null then raise exception 'Mensagem não encontrada.'; end if;
  if m.usuario_id is distinct from auth.uid() and not public.modera_ao_vivo(m.estabelecimento_id) then raise exception 'Sem permissão.'; end if;
  update public.mensagens_ao_vivo set apagada_em = now(), apagada_por = auth.uid() where id = p_msg;
end $$;

create or replace function public.fixar_ao_vivo(p_sala uuid, p_msg uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_estab uuid;
begin
  select estabelecimento_id into v_estab from public.salas_ao_vivo where id = p_sala and fechou_em is null;
  if v_estab is null or not public.modera_ao_vivo(v_estab) then raise exception 'Sem permissão.'; end if;
  update public.salas_ao_vivo set fixada_id = p_msg where id = p_sala;
end $$;

create or replace function public.silenciar_ao_vivo(p_sala uuid, p_usuario uuid, p_minutos int, p_expulsar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare s public.salas_ao_vivo;
begin
  select * into s from public.salas_ao_vivo where id = p_sala and fechou_em is null;
  if s.id is null or not public.modera_ao_vivo(s.estabelecimento_id) then raise exception 'Sem permissão.'; end if;
  if public.equipe_ao_vivo(s.estabelecimento_id) and p_usuario = auth.uid() then raise exception 'Você não pode se silenciar.'; end if;
  if p_minutos <= 0 and not p_expulsar then
    delete from public.silenciados_ao_vivo where sala_id = p_sala and usuario_id = p_usuario;
    return;
  end if;
  insert into public.silenciados_ao_vivo (sala_id, usuario_id, ate, expulso, por)
  values (p_sala, p_usuario, case when p_expulsar then s.fecha_previsto else now() + make_interval(mins => p_minutos) end, p_expulsar, auth.uid())
  on conflict (sala_id, usuario_id) do update set ate = excluded.ate, expulso = excluded.expulso, por = excluded.por;
end $$;

-- ============================================================
-- Resumo ao vivo (música, ambiente e quem está)
-- ============================================================
create or replace function public.resumo_ao_vivo(p_sala uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare s public.salas_ao_vivo; r jsonb;
begin
  if not public.pode_ler_ao_vivo(p_sala) then raise exception 'Sem acesso a este chat ao vivo.'; end if;
  select * into s from public.salas_ao_vivo where id = p_sala;
  select jsonb_build_object(
    'musica_positivos', count(*) filter (where tipo = 'musica' and (dados->>'voto')::int = 1 and criado_em > now() - interval '30 minutes'),
    'musica_negativos', count(*) filter (where tipo = 'musica' and (dados->>'voto')::int = -1 and criado_em > now() - interval '30 minutes'),
    'musica_agora', (select dados->>'musica' from public.mensagens_ao_vivo x where x.sala_id = p_sala and x.tipo = 'musica' and x.dados->>'musica' is not null
                      and x.apagada_em is null order by x.criado_em desc limit 1),
    'tranquilo', count(*) filter (where tipo = 'ambiente' and dados->>'movimento' = 'tranquilo' and criado_em > now() - interval '60 minutes'),
    'moderado', count(*) filter (where tipo = 'ambiente' and dados->>'movimento' = 'moderado' and criado_em > now() - interval '60 minutes'),
    'cheio', count(*) filter (where tipo = 'ambiente' and dados->>'movimento' = 'cheio' and criado_em > now() - interval '60 minutes'),
    'vibe_media', round(avg((dados->>'vibe')::numeric) filter (where tipo = 'ambiente' and criado_em > now() - interval '60 minutes'), 1),
    'mensagens', count(*) filter (where tipo in ('texto', 'foto')),
    'presentes', (select count(distinct c.usuario_id) from public.checkins c where c.estabelecimento_id = s.estabelecimento_id and c.criado_em >= s.abriu_em - interval '1 hour')
  ) into r from public.mensagens_ao_vivo where sala_id = p_sala and apagada_em is null;
  return r;
end $$;

-- Aba Chat: salas abertas agora (onde fiz check-in, lugares que sigo, perto de mim).
create or replace function public.salas_ao_vivo_agora(p_lat double precision, p_lng double precision)
returns table (estabelecimento_id uuid, nome text, logo_url text, sala_id uuid, presentes int, ultima text, ultima_em timestamptz,
               participo boolean, sigo boolean, distancia_m double precision, fecha_previsto timestamptz)
language plpgsql security definer set search_path = public as $$
declare e record;
begin
  -- Abre as salas dos lugares que estão no horário agora.
  for e in select x.id from public.estabelecimentos x
            where x.situacao = 'aprovado' and exists (select 1 from public.janela_funcionamento(x.id)) loop
    perform public.sala_ao_vivo(e.id);
  end loop;
  update public.salas_ao_vivo sv set fechou_em = sv.fecha_previsto where sv.fechou_em is null and sv.fecha_previsto <= now();
  return query
  select x.id, x.nome, x.logo_url, s.id,
         (select count(distinct c.usuario_id)::int from public.checkins c where c.estabelecimento_id = x.id and c.criado_em >= s.abriu_em - interval '1 hour'),
         (select coalesce(m.texto, case m.tipo when 'foto' then 'Foto' when 'musica' then 'Avaliou a música' when 'ambiente' then 'Avaliou o ambiente' else m.texto end)
            from public.mensagens_ao_vivo m where m.sala_id = s.id and m.apagada_em is null order by m.criado_em desc limit 1),
         (select max(m.criado_em) from public.mensagens_ao_vivo m where m.sala_id = s.id),
         public.participa_ao_vivo(s.id),
         exists (select 1 from public.seguidores f where f.usuario_id = auth.uid() and f.estabelecimento_id = x.id),
         case when p_lat is not null and x.latitude is not null then public.distancia_m(p_lat, p_lng, x.latitude, x.longitude) end,
         s.fecha_previsto
    from public.salas_ao_vivo s join public.estabelecimentos x on x.id = s.estabelecimento_id
   where s.fechou_em is null
   order by 8 desc, 9 desc, 10 nulls last, 5 desc
   limit 30;
end $$;

-- ============================================================
-- Histórico (só a equipe; guarda 90 dias)
-- ============================================================
create or replace function public.historico_ao_vivo(p_estab uuid)
returns table (sala_id uuid, abriu_em timestamptz, fechou_em timestamptz, aberta boolean, mensagens int, participantes int, enquetes int)
language plpgsql security definer set search_path = public as $$
begin
  if not public.equipe_ao_vivo(p_estab) then raise exception 'Só a equipe do estabelecimento vê o histórico.'; end if;
  delete from public.salas_ao_vivo sv where sv.estabelecimento_id = p_estab and sv.fechou_em < now() - interval '90 days';
  perform public.sala_ao_vivo(p_estab);
  return query
  select s.id, s.abriu_em, coalesce(s.fechou_em, s.fecha_previsto), s.fechou_em is null,
         (select count(*)::int from public.mensagens_ao_vivo m where m.sala_id = s.id and m.tipo in ('texto', 'foto')),
         (select count(distinct m.usuario_id)::int from public.mensagens_ao_vivo m where m.sala_id = s.id),
         (select count(*)::int from public.enquetes_ao_vivo q where q.sala_id = s.id)
    from public.salas_ao_vivo s where s.estabelecimento_id = p_estab order by s.abriu_em desc limit 120;
end $$;

-- ============================================================
-- Fotos (bucket privado; pasta = id da sala)
-- ============================================================
create or replace function public.pasta_ao_vivo(p_nome text, p_escrever boolean)
returns boolean language plpgsql stable security definer set search_path = public as $$
declare v_sala uuid;
begin
  begin
    v_sala := split_part(p_nome, '/', 1)::uuid;
  exception when others then return false;
  end;
  return case when p_escrever then public.participa_ao_vivo(v_sala) else public.pode_ler_ao_vivo(v_sala) end;
end $$;

do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('ao-vivo', 'ao-vivo', false) on conflict (id) do nothing;
    execute 'drop policy if exists "ao vivo ler" on storage.objects';
    execute $p$create policy "ao vivo ler" on storage.objects for select to authenticated
      using (bucket_id = 'ao-vivo' and public.pasta_ao_vivo(name, false))$p$;
    execute 'drop policy if exists "ao vivo enviar" on storage.objects';
    execute $p$create policy "ao vivo enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'ao-vivo' and public.pasta_ao_vivo(name, true))$p$;
  end if;
end $$;

-- Tempo real
do $$
declare t text;
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    foreach t in array array['mensagens_ao_vivo', 'votos_ao_vivo', 'enquetes_ao_vivo', 'salas_ao_vivo'] loop
      if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
        execute format('alter publication supabase_realtime add table public.%I', t);
      end if;
    end loop;
  end if;
end $$;

revoke execute on function public.equipe_ao_vivo(uuid), public.modera_ao_vivo(uuid), public.participa_ao_vivo(uuid), public.pode_ler_ao_vivo(uuid),
  public.janela_funcionamento(uuid, timestamptz), public.sala_ao_vivo(uuid), public.abrir_ao_vivo(uuid, numeric), public.fechar_ao_vivo(uuid),
  public.entrar_ao_vivo(uuid), public.mensagens_ao_vivo_lista(uuid, timestamptz, int), public.enviar_ao_vivo(uuid, text, text, text, jsonb),
  public.criar_enquete_ao_vivo(uuid, text, text[], int), public.votar_enquete_ao_vivo(uuid, int), public.encerrar_enquete_ao_vivo(uuid),
  public.enquetes_ao_vivo_lista(uuid), public.apagar_ao_vivo(uuid), public.fixar_ao_vivo(uuid, uuid), public.silenciar_ao_vivo(uuid, uuid, int, boolean),
  public.resumo_ao_vivo(uuid), public.salas_ao_vivo_agora(double precision, double precision), public.historico_ao_vivo(uuid),
  public.pasta_ao_vivo(text, boolean) from public, anon;
grant execute on function public.equipe_ao_vivo(uuid), public.modera_ao_vivo(uuid), public.participa_ao_vivo(uuid), public.pode_ler_ao_vivo(uuid),
  public.janela_funcionamento(uuid, timestamptz), public.sala_ao_vivo(uuid), public.abrir_ao_vivo(uuid, numeric), public.fechar_ao_vivo(uuid),
  public.entrar_ao_vivo(uuid), public.mensagens_ao_vivo_lista(uuid, timestamptz, int), public.enviar_ao_vivo(uuid, text, text, text, jsonb),
  public.criar_enquete_ao_vivo(uuid, text, text[], int), public.votar_enquete_ao_vivo(uuid, int), public.encerrar_enquete_ao_vivo(uuid),
  public.enquetes_ao_vivo_lista(uuid), public.apagar_ao_vivo(uuid), public.fixar_ao_vivo(uuid, uuid), public.silenciar_ao_vivo(uuid, uuid, int, boolean),
  public.resumo_ao_vivo(uuid), public.salas_ao_vivo_agora(double precision, double precision), public.historico_ao_vivo(uuid),
  public.pasta_ao_vivo(text, boolean) to authenticated;

select 'RoVibes 024 aplicado com sucesso' as resultado;
