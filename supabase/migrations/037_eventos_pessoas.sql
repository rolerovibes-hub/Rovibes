-- 037 · Eventos criados por pessoas (anfitrião): churrasco colaborativo, aniversário, comemoração...
-- • Evento pequeno, para os amigos, com um anfitrião que recebe o valor (direto na conta Mercado Pago dele;
--   o RoVibes fica só com a taxa definida pela equipe).
-- • O anfitrião escolhe quem vê (só convidados, convidados + amigos, ou público) e aceita os termos de venda.
-- • O endereço completo só aparece para quem tem ingresso (antes, só o bairro e a região).
-- • Impulsionar: pacotes por dias, com preço e raio definidos pela equipe RoVibes.
-- Pode rodar de novo sem problema.

-- ============================================================
-- Regras e preços (equipe RoVibes)
-- ============================================================
create table if not exists public.regras_eventos_pessoa (
  id int primary key default 1 check (id = 1),
  ativo boolean not null default true,
  taxa_pct numeric(5,2) not null default 8 check (taxa_pct between 0 and 30),
  preco_min numeric(10,2) not null default 5 check (preco_min >= 0),
  preco_max numeric(10,2) not null default 500 check (preco_max > 0),
  max_ingressos int not null default 200 check (max_ingressos between 1 and 5000),
  max_por_compra int not null default 10 check (max_por_compra between 1 and 50),
  corte_venda_horas int not null default 1 check (corte_venda_horas between 0 and 72),
  antecedencia_max_dias int not null default 180 check (antecedencia_max_dias between 1 and 730),
  permitir_publico boolean not null default true,
  termos text not null default '',
  termos_versao int not null default 1,
  atualizado_em timestamptz not null default now(),
  atualizado_por uuid references auth.users(id)
);
insert into public.regras_eventos_pessoa (id, termos) values (1, $t$TERMOS DE VENDA DE INGRESSOS — EVENTOS DE ANFITRIÕES NO ROVIBES

1. Quem é responsável
1.1. O anfitrião é o organizador e o único responsável pelo evento: local, segurança, alvarás quando exigidos, comidas, bebidas, atrações e pelo que foi anunciado aos convidados.
1.2. O RoVibes é a plataforma que divulga o evento e intermedeia a venda dos ingressos. O RoVibes não organiza, não fiscaliza e não garante a realização do evento.

2. Valores e repasse
2.1. O valor de cada ingresso é definido pelo anfitrião, dentro dos limites do RoVibes.
2.2. O pagamento é feito pelo Mercado Pago e vai para a conta Mercado Pago do anfitrião. O RoVibes desconta a taxa de serviço em vigor (mostrada na criação do evento) de cada venda.
2.3. O anfitrião é responsável por declarar os valores recebidos, quando a lei exigir.

3. Cancelamento e reembolso
3.1. Quem compra pode desistir em até 7 dias da compra, desde que antes do evento, com reembolso integral (direito de arrependimento do Código de Defesa do Consumidor).
3.2. Se o anfitrião cancelar ou mudar a data, o local ou o que foi anunciado de forma relevante, os compradores têm direito ao reembolso integral.
3.3. O anfitrião autoriza o estorno dos valores nesses casos.

4. Regras do evento
4.1. É proibido: evento ilegal; venda ou oferta de bebida alcoólica a menores de 18 anos; discriminação; conteúdo enganoso; cobrar por algo que não será entregue.
4.2. O endereço completo só aparece para quem tem ingresso. O anfitrião não deve publicar dados pessoais de terceiros.
4.3. O RoVibes pode suspender eventos que descumpram estes termos ou recebam denúncias graves, com reembolso aos compradores.

5. Impulsionamento
5.1. O impulsionamento é um serviço pago ao RoVibes, por dias, para mostrar o evento a mais pessoas perto do local. Não garante número de vendas. Não é reembolsado depois de iniciado, exceto se o evento for suspenso pelo RoVibes.

6. Aceite
Ao criar o evento com venda de ingressos, o anfitrião declara que leu e aceita estes termos e que tem 18 anos ou mais.$t$)
on conflict (id) do nothing;

create table if not exists public.pacotes_impulso (
  id uuid primary key default gen_random_uuid(),
  nome text not null check (length(btrim(nome)) between 2 and 60),
  dias int not null check (dias between 1 and 60),
  preco numeric(10,2) not null check (preco >= 1),
  raio_km int not null default 10 check (raio_km between 1 and 200),
  descricao text check (descricao is null or length(descricao) <= 200),
  ativo boolean not null default true,
  ordem int not null default 0
);
insert into public.pacotes_impulso (nome, dias, preco, raio_km, descricao, ordem)
select v.* from (values ('1 dia', 1, 9.90, 5, 'Aparece para quem está perto, por 24 horas', 1),
                        ('3 dias', 3, 24.90, 10, 'Mais tempo e mais longe', 2),
                        ('7 dias', 7, 49.90, 20, 'A semana toda, na cidade inteira', 3)) v(nome, dias, preco, raio_km, descricao, ordem)
 where not exists (select 1 from public.pacotes_impulso);

-- ============================================================
-- Eventos, cotas (ingressos), convites
-- ============================================================
create table if not exists public.eventos_pessoa (
  id uuid primary key default gen_random_uuid(),
  anfitriao_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  titulo text not null check (length(btrim(titulo)) between 3 and 80),
  tipo text not null default 'outro' check (tipo in ('churrasco', 'aniversario', 'comemoracao', 'festa', 'outro')),
  descricao text check (descricao is null or length(descricao) <= 2000),
  capa_url text,
  inicio timestamptz not null,
  fim timestamptz,
  local_nome text check (local_nome is null or length(local_nome) <= 80),
  endereco text check (endereco is null or length(endereco) <= 200),
  bairro text check (bairro is null or length(bairro) <= 80),
  latitude double precision,
  longitude double precision,
  visibilidade text not null default 'amigos' check (visibilidade in ('convidados', 'amigos', 'publico')),
  situacao text not null default 'publicado' check (situacao in ('publicado', 'cancelado')),
  suspenso boolean not null default false,
  motivo_suspensao text,
  termos_versao int,
  termos_aceitos_em timestamptz,
  criado_em timestamptz not null default now(),
  check (fim is null or fim > inicio)
);
create index if not exists eventos_pessoa_anfitriao_idx on public.eventos_pessoa (anfitriao_id, inicio desc);
create index if not exists eventos_pessoa_inicio_idx on public.eventos_pessoa (inicio) where situacao = 'publicado' and not suspenso;

create table if not exists public.cotas_evento_pessoa (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_pessoa(id) on delete cascade,
  nome text not null check (length(btrim(nome)) between 2 and 60),
  descricao text check (descricao is null or length(descricao) <= 200),
  preco numeric(10,2) not null check (preco >= 0),
  quantidade int not null check (quantidade between 1 and 5000),
  ordem int not null default 0,
  ativo boolean not null default true
);
create index if not exists cotas_evento_pessoa_idx on public.cotas_evento_pessoa (evento_id, ordem);

create table if not exists public.convites_evento_pessoa (
  evento_id uuid not null references public.eventos_pessoa(id) on delete cascade,
  usuario_id uuid not null references auth.users(id) on delete cascade,
  situacao text not null default 'convidado' check (situacao in ('convidado', 'vou', 'talvez', 'nao_vou')),
  convidado_em timestamptz not null default now(),
  respondido_em timestamptz,
  primary key (evento_id, usuario_id)
);
create index if not exists convites_evento_pessoa_usuario_idx on public.convites_evento_pessoa (usuario_id, convidado_em desc);

create table if not exists public.compras_anfitriao (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_pessoa(id) on delete cascade,
  comprador_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  itens jsonb not null,
  total numeric(10,2) not null check (total >= 0),
  taxa_pct numeric(5,2) not null default 0,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'pago', 'cancelado', 'reembolsar', 'reembolsado')),
  expira_em timestamptz not null default now() + interval '15 minutes',
  mp_preferencia text,
  mp_pagamento text,
  comissao numeric(10,2) not null default 0,
  pago_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists compras_anfitriao_evento_idx on public.compras_anfitriao (evento_id, situacao);

create table if not exists public.ingressos_anfitriao (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_pessoa(id) on delete cascade,
  compra_id uuid references public.compras_anfitriao(id) on delete set null,
  cota_id uuid references public.cotas_evento_pessoa(id) on delete set null,
  titular_id uuid not null references auth.users(id) on delete cascade,
  codigo text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 10)),
  preco numeric(10,2) not null default 0,
  situacao text not null default 'valido' check (situacao in ('valido', 'usado', 'cancelado')),
  usado_em timestamptz,
  criado_em timestamptz not null default now()
);
create index if not exists ingressos_anfitriao_evento_idx on public.ingressos_anfitriao (evento_id, situacao);
create index if not exists ingressos_anfitriao_titular_idx on public.ingressos_anfitriao (titular_id, criado_em desc);

create table if not exists public.impulsos (
  id uuid primary key default gen_random_uuid(),
  evento_id uuid not null references public.eventos_pessoa(id) on delete cascade,
  pacote_id uuid references public.pacotes_impulso(id) on delete set null,
  comprador_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  dias int not null,
  raio_km int not null,
  preco numeric(10,2) not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'ativo', 'cancelado')),
  inicio timestamptz,
  fim timestamptz,
  mp_preferencia text,
  mp_pagamento text,
  criado_em timestamptz not null default now()
);
create index if not exists impulsos_evento_idx on public.impulsos (evento_id, situacao, fim desc);

-- Conta Mercado Pago pessoal do anfitrião (tokens só o servidor lê).
create table if not exists public.mp_contas_pessoas (
  usuario_id uuid primary key references auth.users(id) on delete cascade,
  mp_usuario text,
  access_token text not null,
  refresh_token text,
  expira_em timestamptz,
  conectado_em timestamptz not null default now()
);

alter table public.regras_eventos_pessoa enable row level security;
alter table public.pacotes_impulso enable row level security;
alter table public.eventos_pessoa enable row level security;
alter table public.cotas_evento_pessoa enable row level security;
alter table public.convites_evento_pessoa enable row level security;
alter table public.compras_anfitriao enable row level security;
alter table public.ingressos_anfitriao enable row level security;
alter table public.impulsos enable row level security;
alter table public.mp_contas_pessoas enable row level security;
revoke all on public.mp_contas_pessoas from anon, authenticated;
-- Leitura e escrita só pelas funções abaixo (exceto pacotes, que todos podem ver).
drop policy if exists pacotes_ler on public.pacotes_impulso;
create policy pacotes_ler on public.pacotes_impulso for select to authenticated using (ativo or public.eh_admin());
grant select on public.pacotes_impulso to authenticated;
drop policy if exists convites_meus on public.convites_evento_pessoa;
create policy convites_meus on public.convites_evento_pessoa for select to authenticated using (usuario_id = auth.uid());
grant select on public.convites_evento_pessoa to authenticated;

create or replace function public.anfitriao_conectado()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.mp_contas_pessoas where usuario_id = auth.uid());
$$;

-- Regras para o App (sem dados internos).
create or replace function public.regras_eventos_app()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('ativo', r.ativo, 'taxa_pct', r.taxa_pct, 'preco_min', r.preco_min, 'preco_max', r.preco_max,
           'max_ingressos', r.max_ingressos, 'max_por_compra', r.max_por_compra, 'corte_venda_horas', r.corte_venda_horas,
           'antecedencia_max_dias', r.antecedencia_max_dias, 'permitir_publico', r.permitir_publico,
           'termos', r.termos, 'termos_versao', r.termos_versao, 'mp_conectado', public.anfitriao_conectado(),
           'pacotes', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'dias', p.dias, 'preco', p.preco, 'raio_km', p.raio_km, 'descricao', p.descricao) order by p.ordem, p.dias), '[]'::jsonb)
                         from public.pacotes_impulso p where p.ativo))
    from public.regras_eventos_pessoa r where r.id = 1;
$$;

-- Quem pode ver o evento.
create or replace function public.pode_ver_evento_pessoa(p_evento uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.eventos_pessoa e
     where e.id = p_evento
       and (e.anfitriao_id = auth.uid() or public.eh_admin()
            or exists (select 1 from public.ingressos_anfitriao i where i.evento_id = e.id and i.titular_id = auth.uid())
            or (not e.suspenso and not public.bloqueado_entre(e.anfitriao_id, auth.uid()) and (
                  exists (select 1 from public.convites_evento_pessoa c where c.evento_id = e.id and c.usuario_id = auth.uid())
                  or (e.visibilidade = 'amigos' and public.segue(auth.uid(), e.anfitriao_id) and public.segue(e.anfitriao_id, auth.uid()))
                  or e.visibilidade = 'publico'
                  or exists (select 1 from public.impulsos m where m.evento_id = e.id and m.situacao = 'ativo' and m.fim > now())))));
$$;

-- Vendidos (pagos) + reservados (pendentes ainda no prazo) de uma cota.
create or replace function public.ocupados_cota(p_cota uuid)
returns int language sql stable security definer set search_path = public as $$
  select (select count(*) from public.ingressos_anfitriao i where i.cota_id = p_cota and i.situacao <> 'cancelado')::int
       + coalesce((select sum((x->>'quantidade')::int) from public.compras_anfitriao c, jsonb_array_elements(c.itens) x
                    where c.situacao = 'pendente' and c.expira_em > now() and (x->>'cota_id')::uuid = p_cota), 0)::int;
$$;

create or replace function public.salvar_cotas_evento(p_evento uuid, p_cotas jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare r public.regras_eventos_pessoa; x jsonb; v_id uuid; v_preco numeric; v_qtd int; v_total int := 0; n int := 0; v_manter uuid[] := '{}';
begin
  select * into r from public.regras_eventos_pessoa where id = 1;
  if p_cotas is null or jsonb_typeof(p_cotas) <> 'array' or jsonb_array_length(p_cotas) = 0 then raise exception 'Crie pelo menos um tipo de ingresso (pode ser grátis).'; end if;
  if jsonb_array_length(p_cotas) > 6 then raise exception 'Até 6 tipos de ingresso por evento.'; end if;
  for x in select * from jsonb_array_elements(p_cotas) loop
    n := n + 1;
    v_preco := round(coalesce(nullif(x->>'preco', '')::numeric, 0), 2);
    v_qtd := coalesce(nullif(x->>'quantidade', '')::int, 0);
    if coalesce(btrim(x->>'nome'), '') = '' then raise exception 'Dê um nome a cada ingresso (ex.: Cota churrasco).'; end if;
    if v_qtd < 1 then raise exception 'Informe a quantidade de "%".', x->>'nome'; end if;
    if v_preco > 0 and (v_preco < r.preco_min or v_preco > r.preco_max) then
      raise exception 'O preço de "%" precisa ficar entre R$ % e R$ %.', x->>'nome', replace(r.preco_min::text, '.', ','), replace(r.preco_max::text, '.', ',');
    end if;
    v_total := v_total + v_qtd;
    v_id := nullif(x->>'id', '')::uuid;
    if v_id is not null and exists (select 1 from public.cotas_evento_pessoa where id = v_id and evento_id = p_evento) then
      if public.ocupados_cota(v_id) > 0 and (select preco from public.cotas_evento_pessoa where id = v_id) <> v_preco then
        raise exception 'O preço de "%" não pode mudar depois da primeira venda.', x->>'nome';
      end if;
      if v_qtd < public.ocupados_cota(v_id) then raise exception 'A quantidade de "%" não pode ser menor do que o já vendido.', x->>'nome'; end if;
      update public.cotas_evento_pessoa set nome = left(btrim(x->>'nome'), 60), descricao = nullif(left(btrim(coalesce(x->>'descricao', '')), 200), ''),
             preco = v_preco, quantidade = v_qtd, ordem = n, ativo = true where id = v_id;
    else
      insert into public.cotas_evento_pessoa (evento_id, nome, descricao, preco, quantidade, ordem)
      values (p_evento, left(btrim(x->>'nome'), 60), nullif(left(btrim(coalesce(x->>'descricao', '')), 200), ''), v_preco, v_qtd, n)
      returning id into v_id;
    end if;
    v_manter := v_manter || v_id;
  end loop;
  if v_total > r.max_ingressos then raise exception 'O máximo é de % ingressos por evento.', r.max_ingressos; end if;
  -- Tipos tirados da lista: desativa (os já vendidos continuam valendo).
  update public.cotas_evento_pessoa c set ativo = false where c.evento_id = p_evento and c.ativo and not (c.id = any (v_manter));
end $$;

-- Cria ou edita (p_id) o evento. Venda paga exige aceitar a versão atual dos termos.
create or replace function public.salvar_evento_pessoa(p_id uuid, p_dados jsonb, p_cotas jsonb, p_termos_versao int)
returns uuid language plpgsql security definer set search_path = public as $$
declare r public.regras_eventos_pessoa; e public.eventos_pessoa; v_id uuid; v_inicio timestamptz; v_fim timestamptz; v_vis text; v_pago boolean;
begin
  perform public.exigir_conta_ativa();
  select * into r from public.regras_eventos_pessoa where id = 1;
  if not r.ativo then raise exception 'A criação de eventos está pausada no momento.'; end if;
  v_inicio := nullif(p_dados->>'inicio', '')::timestamptz;
  v_fim := nullif(p_dados->>'fim', '')::timestamptz;
  v_vis := coalesce(nullif(p_dados->>'visibilidade', ''), 'amigos');
  if v_inicio is null then raise exception 'Informe o dia e a hora do evento.'; end if;
  if v_inicio < now() then raise exception 'A data do evento já passou.'; end if;
  if v_inicio > now() + make_interval(days => r.antecedencia_max_dias) then raise exception 'O evento pode ser criado com até % dias de antecedência.', r.antecedencia_max_dias; end if;
  if v_vis = 'publico' and not r.permitir_publico then raise exception 'Eventos públicos estão desativados no momento.'; end if;
  v_pago := exists (select 1 from jsonb_array_elements(coalesce(p_cotas, '[]'::jsonb)) x where coalesce(nullif(x->>'preco', '')::numeric, 0) > 0);
  if v_pago and coalesce(p_termos_versao, 0) <> r.termos_versao then raise exception 'Leia e aceite os termos de venda de ingressos para continuar.'; end if;

  if p_id is null then
    insert into public.eventos_pessoa (titulo, tipo, descricao, capa_url, inicio, fim, local_nome, endereco, bairro, latitude, longitude, visibilidade,
                                       termos_versao, termos_aceitos_em)
    values (btrim(p_dados->>'titulo'), coalesce(nullif(p_dados->>'tipo', ''), 'outro'), nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
            nullif(p_dados->>'capa_url', ''), v_inicio, v_fim, nullif(btrim(coalesce(p_dados->>'local_nome', '')), ''),
            nullif(btrim(coalesce(p_dados->>'endereco', '')), ''), nullif(btrim(coalesce(p_dados->>'bairro', '')), ''),
            nullif(p_dados->>'latitude', '')::double precision, nullif(p_dados->>'longitude', '')::double precision, v_vis,
            case when v_pago then r.termos_versao end, case when v_pago then now() end)
    returning id into v_id;
  else
    select * into e from public.eventos_pessoa where id = p_id for update;
    if not found or e.anfitriao_id <> auth.uid() then raise exception 'Evento não encontrado.'; end if;
    if e.situacao = 'cancelado' then raise exception 'Este evento foi cancelado.'; end if;
    update public.eventos_pessoa set
      titulo = btrim(p_dados->>'titulo'), tipo = coalesce(nullif(p_dados->>'tipo', ''), 'outro'),
      descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''), capa_url = nullif(p_dados->>'capa_url', ''),
      inicio = v_inicio, fim = v_fim, local_nome = nullif(btrim(coalesce(p_dados->>'local_nome', '')), ''),
      endereco = nullif(btrim(coalesce(p_dados->>'endereco', '')), ''), bairro = nullif(btrim(coalesce(p_dados->>'bairro', '')), ''),
      latitude = nullif(p_dados->>'latitude', '')::double precision, longitude = nullif(p_dados->>'longitude', '')::double precision,
      visibilidade = v_vis,
      termos_versao = case when v_pago then coalesce(p_termos_versao, termos_versao) else termos_versao end,
      termos_aceitos_em = case when v_pago and p_termos_versao is not null then now() else termos_aceitos_em end
     where id = p_id;
    v_id := p_id;
  end if;
  perform public.salvar_cotas_evento(v_id, p_cotas);
  return v_id;
end $$;

-- Detalhes para a página do evento (endereço completo só para quem tem ingresso, o anfitrião e a equipe).
create or replace function public.evento_pessoa(p_evento uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare e public.eventos_pessoa; v_dono boolean; v_tem boolean; v_r public.regras_eventos_pessoa;
begin
  if not public.pode_ver_evento_pessoa(p_evento) then return null; end if;
  select * into e from public.eventos_pessoa where id = p_evento;
  select * into v_r from public.regras_eventos_pessoa where id = 1;
  v_dono := e.anfitriao_id = auth.uid();
  v_tem := exists (select 1 from public.ingressos_anfitriao i where i.evento_id = e.id and i.titular_id = auth.uid() and i.situacao <> 'cancelado');
  return jsonb_build_object(
    'id', e.id, 'titulo', e.titulo, 'tipo', e.tipo, 'descricao', e.descricao, 'capa_url', e.capa_url,
    'inicio', e.inicio, 'fim', e.fim, 'visibilidade', e.visibilidade, 'situacao', e.situacao, 'suspenso', e.suspenso,
    'local_nome', e.local_nome, 'bairro', e.bairro,
    'endereco', case when v_dono or v_tem or public.eh_admin() then e.endereco end,
    'latitude', case when v_dono or v_tem or public.eh_admin() then e.latitude else round(e.latitude::numeric, 2)::double precision end,
    'longitude', case when v_dono or v_tem or public.eh_admin() then e.longitude else round(e.longitude::numeric, 2)::double precision end,
    'endereco_liberado', v_dono or v_tem,
    'sou_anfitriao', v_dono,
    'anfitriao', (select jsonb_build_object('id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url) from public.perfis p where p.id = e.anfitriao_id),
    'vendas_abertas', e.situacao = 'publicado' and not e.suspenso and e.inicio - make_interval(hours => v_r.corte_venda_horas) > now(),
    'max_por_compra', v_r.max_por_compra,
    'taxa_pct', v_r.taxa_pct,
    'cotas', (select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'nome', c.nome, 'descricao', c.descricao, 'preco', c.preco, 'quantidade', c.quantidade,
                                                           'disponiveis', greatest(c.quantidade - public.ocupados_cota(c.id), 0)) order by c.ordem), '[]'::jsonb)
                from public.cotas_evento_pessoa c where c.evento_id = e.id and c.ativo),
    'meus_ingressos', (select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'codigo', i.codigo, 'situacao', i.situacao, 'cota', c.nome, 'preco', i.preco) order by i.criado_em), '[]'::jsonb)
                         from public.ingressos_anfitriao i left join public.cotas_evento_pessoa c on c.id = i.cota_id
                        where i.evento_id = e.id and i.titular_id = auth.uid()),
    'meu_convite', (select c.situacao from public.convites_evento_pessoa c where c.evento_id = e.id and c.usuario_id = auth.uid()),
    'confirmados', (select count(distinct i.titular_id) from public.ingressos_anfitriao i where i.evento_id = e.id and i.situacao <> 'cancelado')::int
                 + (select count(*) from public.convites_evento_pessoa c where c.evento_id = e.id and c.situacao = 'vou'
                      and not exists (select 1 from public.ingressos_anfitriao i where i.evento_id = e.id and i.titular_id = c.usuario_id))::int,
    'impulso', (select jsonb_build_object('fim', m.fim, 'raio_km', m.raio_km) from public.impulsos m where m.evento_id = e.id and m.situacao = 'ativo' and m.fim > now() order by m.fim desc limit 1),
    'painel', case when v_dono then jsonb_build_object(
        'vendidos', (select count(*) from public.ingressos_anfitriao i where i.evento_id = e.id and i.situacao <> 'cancelado')::int,
        'usados', (select count(*) from public.ingressos_anfitriao i where i.evento_id = e.id and i.situacao = 'usado')::int,
        'arrecadado', (select coalesce(sum(total), 0) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'pago'),
        'taxas', (select coalesce(sum(comissao), 0) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'pago'),
        'convidados', (select coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url, 'situacao', c.situacao,
                                                                     'ingressos', (select count(*) from public.ingressos_anfitriao i where i.evento_id = e.id and i.titular_id = p.id and i.situacao <> 'cancelado'))
                                                   order by c.convidado_em), '[]'::jsonb)
                         from public.convites_evento_pessoa c join public.perfis p on p.id = c.usuario_id where c.evento_id = e.id),
        'compradores', (select coalesce(jsonb_agg(distinct jsonb_build_object('id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url)), '[]'::jsonb)
                          from public.ingressos_anfitriao i join public.perfis p on p.id = i.titular_id where i.evento_id = e.id and i.situacao <> 'cancelado'),
        'mp_conectado', public.anfitriao_conectado()) end);
end $$;

-- Meus eventos (como anfitrião).
create or replace function public.meus_eventos_pessoa()
returns table (id uuid, titulo text, tipo text, inicio timestamptz, situacao text, suspenso boolean, capa_url text, vendidos int, arrecadado numeric, convidados int)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.tipo, e.inicio, e.situacao, e.suspenso, e.capa_url,
         (select count(*) from public.ingressos_anfitriao i where i.evento_id = e.id and i.situacao <> 'cancelado')::int,
         (select coalesce(sum(total), 0) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'pago'),
         (select count(*) from public.convites_evento_pessoa c where c.evento_id = e.id)::int
    from public.eventos_pessoa e where e.anfitriao_id = auth.uid()
   order by e.inicio desc limit 50;
$$;

-- Eventos para mim: convites, amigos, públicos e impulsionados perto (para o feed).
create or replace function public.eventos_pessoa_para_mim(p_lat double precision default null, p_lng double precision default null)
returns table (id uuid, titulo text, tipo text, inicio timestamptz, capa_url text, bairro text, anfitriao jsonb, motivo text, impulsionado boolean, menor_preco numeric)
language sql stable security definer set search_path = public as $$
  select e.id, e.titulo, e.tipo, e.inicio, e.capa_url, e.bairro,
         (select jsonb_build_object('id', p.id, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url) from public.perfis p where p.id = e.anfitriao_id),
         case when exists (select 1 from public.convites_evento_pessoa c where c.evento_id = e.id and c.usuario_id = auth.uid()) then 'Você foi convidado'
              when public.segue(auth.uid(), e.anfitriao_id) and public.segue(e.anfitriao_id, auth.uid()) then 'Evento de um amigo'
              when m.id is not null then 'Impulsionado'
              else 'Evento aberto' end,
         m.id is not null,
         (select min(c.preco) from public.cotas_evento_pessoa c where c.evento_id = e.id and c.ativo)
    from public.eventos_pessoa e
    left join lateral (select x.id, x.raio_km from public.impulsos x where x.evento_id = e.id and x.situacao = 'ativo' and x.fim > now() order by x.fim desc limit 1) m on true
   where e.situacao = 'publicado' and not e.suspenso and coalesce(e.fim, e.inicio + interval '8 hours') > now()
     and e.anfitriao_id <> auth.uid()
     and public.pode_ver_evento_pessoa(e.id)
     -- Impulsionado ou público de quem não é amigo: só se estiver no raio (quando a localização é conhecida).
     and (exists (select 1 from public.convites_evento_pessoa c where c.evento_id = e.id and c.usuario_id = auth.uid())
          or (public.segue(auth.uid(), e.anfitriao_id) and public.segue(e.anfitriao_id, auth.uid()))
          or p_lat is null or e.latitude is null
          or public.distancia_m(p_lat, p_lng, e.latitude, e.longitude) <= coalesce(m.raio_km, 15) * 1000)
   order by (m.id is not null) desc, e.inicio
   limit 20;
$$;

create or replace function public.convidar_evento_pessoa(p_evento uuid, p_pessoas uuid[])
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not exists (select 1 from public.eventos_pessoa where id = p_evento and anfitriao_id = auth.uid() and situacao = 'publicado') then
    raise exception 'Evento não encontrado.';
  end if;
  insert into public.convites_evento_pessoa (evento_id, usuario_id)
  select p_evento, x from unnest(p_pessoas) x
   where x <> auth.uid() and not public.bloqueado_entre(x, auth.uid())
     and exists (select 1 from public.perfis where id = x and not suspenso)
  on conflict do nothing;
  get diagnostics n = row_count;
  return n;
end $$;

create or replace function public.responder_convite_evento(p_evento uuid, p_resposta text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_resposta not in ('vou', 'talvez', 'nao_vou') then raise exception 'Resposta inválida.'; end if;
  if not public.pode_ver_evento_pessoa(p_evento) then raise exception 'Evento não encontrado.'; end if;
  insert into public.convites_evento_pessoa (evento_id, usuario_id, situacao, respondido_em)
  values (p_evento, auth.uid(), p_resposta, now())
  on conflict (evento_id, usuario_id) do update set situacao = excluded.situacao, respondido_em = now();
end $$;

-- Reserva os ingressos (15 min). Grátis: já emite.
create or replace function public.reservar_anfitriao(p_evento uuid, p_itens jsonb)
returns table (compra_id uuid, total numeric, gratis boolean)
language plpgsql security definer set search_path = public as $$
declare e public.eventos_pessoa; r public.regras_eventos_pessoa; x jsonb; c public.cotas_evento_pessoa; v_total numeric := 0; v_qtd int := 0; v_id uuid; v_itens jsonb := '[]'::jsonb; i int;
begin
  perform public.exigir_conta_ativa();
  select * into r from public.regras_eventos_pessoa where id = 1;
  select * into e from public.eventos_pessoa where id = p_evento for update;
  if not found or not public.pode_ver_evento_pessoa(p_evento) then raise exception 'Evento não encontrado.'; end if;
  if e.situacao <> 'publicado' or e.suspenso then raise exception 'Este evento não está vendendo ingressos.'; end if;
  if e.inicio - make_interval(hours => r.corte_venda_horas) <= now() then raise exception 'As vendas deste evento já encerraram.'; end if;
  if e.anfitriao_id = auth.uid() then raise exception 'Você é o anfitrião deste evento.'; end if;
  for x in select * from jsonb_array_elements(coalesce(p_itens, '[]'::jsonb)) loop
    if coalesce((x->>'quantidade')::int, 0) <= 0 then continue; end if;
    select * into c from public.cotas_evento_pessoa where id = (x->>'cota_id')::uuid and evento_id = p_evento and ativo for update;
    if not found then raise exception 'Ingresso não encontrado.'; end if;
    if public.ocupados_cota(c.id) + (x->>'quantidade')::int > c.quantidade then raise exception '"%" esgotou ou não tem essa quantidade.', c.nome; end if;
    v_total := v_total + c.preco * (x->>'quantidade')::int;
    v_qtd := v_qtd + (x->>'quantidade')::int;
    v_itens := v_itens || jsonb_build_object('cota_id', c.id, 'quantidade', (x->>'quantidade')::int, 'preco', c.preco, 'nome', c.nome);
  end loop;
  if v_qtd = 0 then raise exception 'Escolha pelo menos um ingresso.'; end if;
  if v_qtd > r.max_por_compra then raise exception 'Até % ingressos por compra.', r.max_por_compra; end if;
  update public.compras_anfitriao set situacao = 'cancelado' where comprador_id = auth.uid() and evento_id = p_evento and situacao = 'pendente';
  insert into public.compras_anfitriao (evento_id, itens, total, taxa_pct, situacao, pago_em)
  values (p_evento, v_itens, v_total, r.taxa_pct, case when v_total = 0 then 'pago' else 'pendente' end, case when v_total = 0 then now() end)
  returning id into v_id;
  if v_total = 0 then
    for x in select * from jsonb_array_elements(v_itens) loop
      for i in 1..(x->>'quantidade')::int loop
        insert into public.ingressos_anfitriao (evento_id, compra_id, cota_id, titular_id, preco) values (p_evento, v_id, (x->>'cota_id')::uuid, auth.uid(), 0);
      end loop;
    end loop;
    insert into public.convites_evento_pessoa (evento_id, usuario_id, situacao, respondido_em) values (p_evento, auth.uid(), 'vou', now())
    on conflict (evento_id, usuario_id) do update set situacao = 'vou', respondido_em = now();
  end if;
  return query select v_id, v_total, v_total = 0;
end $$;

-- Passo do servidor (com o login de quem compra): confere a reserva e devolve o que cobrar.
create or replace function public.preparar_compra_anfitriao(p_compra uuid)
returns table (compra_id uuid, total numeric, anfitriao_id uuid, descricao text, taxa_pct numeric)
language plpgsql security definer set search_path = public as $$
declare c public.compras_anfitriao; e public.eventos_pessoa;
begin
  select * into c from public.compras_anfitriao where id = p_compra;
  if not found or c.comprador_id <> auth.uid() then raise exception 'Compra não encontrada.'; end if;
  if c.situacao <> 'pendente' then raise exception 'Esta compra não está aguardando pagamento.'; end if;
  if c.expira_em < now() then raise exception 'A reserva expirou. Escolha os ingressos de novo.'; end if;
  select * into e from public.eventos_pessoa where id = c.evento_id;
  return query select c.id, c.total, e.anfitriao_id, left(e.titulo || ' · Ingressos · RoVibes', 120), c.taxa_pct;
end $$;

-- Passo final (só o servidor, depois de consultar o Mercado Pago).
create or replace function public.confirmar_compra_anfitriao(p_compra uuid, p_mp_id text, p_status text, p_valor numeric, p_comissao numeric)
returns text language plpgsql security definer set search_path = public as $$
declare c public.compras_anfitriao; x jsonb; i int;
begin
  select * into c from public.compras_anfitriao where id = p_compra for update;
  if not found then return 'nao_encontrado'; end if;
  if p_status = 'approved' then
    if c.situacao = 'pago' then return 'ja_aprovado'; end if;
    if abs(coalesce(p_valor, 0) - c.total) > 0.01 then return 'valor_divergente'; end if;
    update public.compras_anfitriao set situacao = 'pago', pago_em = now(), mp_pagamento = p_mp_id, comissao = coalesce(p_comissao, 0) where id = c.id;
    for x in select * from jsonb_array_elements(c.itens) loop
      for i in 1..(x->>'quantidade')::int loop
        insert into public.ingressos_anfitriao (evento_id, compra_id, cota_id, titular_id, preco)
        values (c.evento_id, c.id, (x->>'cota_id')::uuid, c.comprador_id, (x->>'preco')::numeric);
      end loop;
    end loop;
    insert into public.convites_evento_pessoa (evento_id, usuario_id, situacao, respondido_em) values (c.evento_id, c.comprador_id, 'vou', now())
    on conflict (evento_id, usuario_id) do update set situacao = 'vou', respondido_em = now();
    return 'aprovado';
  elsif p_status in ('rejected', 'cancelled') then
    if c.situacao = 'pendente' then update public.compras_anfitriao set situacao = 'cancelado', mp_pagamento = p_mp_id where id = c.id; end if;
    return 'recusado';
  elsif p_status in ('refunded', 'charged_back') then
    update public.compras_anfitriao set situacao = 'reembolsado' where id = c.id;
    update public.ingressos_anfitriao set situacao = 'cancelado' where compra_id = c.id and situacao = 'valido';
    return 'estornado';
  end if;
  return 'pendente';
end $$;

-- Portaria do anfitrião: confere o QR do ingresso.
create or replace function public.validar_ingresso_anfitriao(p_evento uuid, p_codigo text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare i public.ingressos_anfitriao; p public.perfis; v_cota text;
begin
  if not exists (select 1 from public.eventos_pessoa where id = p_evento and anfitriao_id = auth.uid()) then raise exception 'Só o anfitrião confere os ingressos.'; end if;
  select * into i from public.ingressos_anfitriao where codigo = upper(btrim(regexp_replace(p_codigo, '^.*[/:]', ''))) and evento_id = p_evento for update;
  if not found then return jsonb_build_object('ok', false, 'motivo', 'Ingresso não é deste evento.'); end if;
  select * into p from public.perfis where id = i.titular_id;
  select nome into v_cota from public.cotas_evento_pessoa where id = i.cota_id;
  if i.situacao = 'cancelado' then return jsonb_build_object('ok', false, 'motivo', 'Ingresso cancelado.', 'nome', p.nome, 'foto_url', p.foto_url); end if;
  if i.situacao = 'usado' then return jsonb_build_object('ok', false, 'motivo', 'Já entrou às ' || to_char(i.usado_em at time zone 'America/Sao_Paulo', 'HH24:MI') || '.', 'nome', p.nome, 'foto_url', p.foto_url); end if;
  update public.ingressos_anfitriao set situacao = 'usado', usado_em = now() where id = i.id;
  return jsonb_build_object('ok', true, 'nome', p.nome, 'usuario', p.usuario, 'foto_url', p.foto_url, 'cota', v_cota);
end $$;

-- Cancelar o evento: compras pagas ficam marcadas para reembolso (a equipe RoVibes conclui pelo Business).
create or replace function public.cancelar_evento_pessoa(p_evento uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  update public.eventos_pessoa set situacao = 'cancelado' where id = p_evento and anfitriao_id = auth.uid() and situacao = 'publicado';
  if not found then raise exception 'Evento não encontrado.'; end if;
  update public.compras_anfitriao set situacao = 'reembolsar' where evento_id = p_evento and situacao = 'pago' and total > 0;
  get diagnostics n = row_count;
  update public.compras_anfitriao set situacao = 'cancelado' where evento_id = p_evento and situacao = 'pendente';
  update public.ingressos_anfitriao set situacao = 'cancelado' where evento_id = p_evento and situacao = 'valido';
  return n;
end $$;

-- Meus ingressos de eventos de anfitriões (carteira).
create or replace function public.meus_ingressos_anfitriao()
returns table (id uuid, codigo text, situacao text, cota text, preco numeric, evento jsonb)
language sql stable security definer set search_path = public as $$
  select i.id, i.codigo, i.situacao, c.nome, i.preco,
         jsonb_build_object('id', e.id, 'titulo', e.titulo, 'inicio', e.inicio, 'capa_url', e.capa_url, 'local_nome', e.local_nome, 'situacao', e.situacao)
    from public.ingressos_anfitriao i
    join public.eventos_pessoa e on e.id = i.evento_id
    left join public.cotas_evento_pessoa c on c.id = i.cota_id
   where i.titular_id = auth.uid() and coalesce(e.fim, e.inicio + interval '12 hours') > now() - interval '1 day'
   order by e.inicio, i.criado_em;
$$;

-- ============================================================
-- Impulsionar
-- ============================================================
create or replace function public.preparar_impulso(p_evento uuid, p_pacote uuid)
returns table (impulso_id uuid, preco numeric, descricao text)
language plpgsql security definer set search_path = public as $$
declare e public.eventos_pessoa; pk public.pacotes_impulso; v_id uuid;
begin
  perform public.exigir_conta_ativa();
  select * into e from public.eventos_pessoa where id = p_evento;
  if not found or e.anfitriao_id <> auth.uid() then raise exception 'Evento não encontrado.'; end if;
  if e.situacao <> 'publicado' or e.suspenso then raise exception 'Este evento não pode ser impulsionado.'; end if;
  if e.inicio < now() then raise exception 'O evento já começou.'; end if;
  select * into pk from public.pacotes_impulso where id = p_pacote and ativo;
  if not found then raise exception 'Pacote não encontrado.'; end if;
  update public.impulsos set situacao = 'cancelado' where evento_id = p_evento and comprador_id = auth.uid() and situacao = 'pendente';
  insert into public.impulsos (evento_id, pacote_id, dias, raio_km, preco) values (p_evento, pk.id, pk.dias, pk.raio_km, pk.preco) returning id into v_id;
  return query select v_id, pk.preco, left('Impulsionar ' || e.titulo || ' · ' || pk.nome || ' · RoVibes', 120);
end $$;

create or replace function public.confirmar_impulso(p_impulso uuid, p_mp_id text, p_status text, p_valor numeric)
returns text language plpgsql security definer set search_path = public as $$
declare m public.impulsos; v_ini timestamptz;
begin
  select * into m from public.impulsos where id = p_impulso for update;
  if not found then return 'nao_encontrado'; end if;
  if p_status = 'approved' then
    if m.situacao = 'ativo' then return 'ja_aprovado'; end if;
    if abs(coalesce(p_valor, 0) - m.preco) > 0.01 then return 'valor_divergente'; end if;
    -- Soma ao impulso que já estiver ativo.
    select greatest(now(), coalesce(max(fim), now())) into v_ini from public.impulsos where evento_id = m.evento_id and situacao = 'ativo' and fim > now();
    update public.impulsos set situacao = 'ativo', inicio = v_ini, fim = v_ini + make_interval(days => m.dias), mp_pagamento = p_mp_id where id = m.id;
    return 'aprovado';
  elsif p_status in ('rejected', 'cancelled') then
    update public.impulsos set situacao = 'cancelado', mp_pagamento = p_mp_id where id = m.id and situacao = 'pendente';
    return 'recusado';
  end if;
  return 'pendente';
end $$;

-- ============================================================
-- Equipe RoVibes (Business)
-- ============================================================
create or replace function public.regras_eventos_admin()
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  return (select to_jsonb(r) from public.regras_eventos_pessoa r where id = 1)
      || jsonb_build_object('pacotes', (select coalesce(jsonb_agg(to_jsonb(p) order by p.ordem, p.dias), '[]'::jsonb) from public.pacotes_impulso p));
end $$;

create or replace function public.salvar_regras_eventos(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_termos text;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  select termos into v_termos from public.regras_eventos_pessoa where id = 1;
  update public.regras_eventos_pessoa set
    ativo = coalesce((p->>'ativo')::boolean, ativo),
    taxa_pct = coalesce((p->>'taxa_pct')::numeric, taxa_pct),
    preco_min = coalesce((p->>'preco_min')::numeric, preco_min),
    preco_max = coalesce((p->>'preco_max')::numeric, preco_max),
    max_ingressos = coalesce((p->>'max_ingressos')::int, max_ingressos),
    max_por_compra = coalesce((p->>'max_por_compra')::int, max_por_compra),
    corte_venda_horas = coalesce((p->>'corte_venda_horas')::int, corte_venda_horas),
    antecedencia_max_dias = coalesce((p->>'antecedencia_max_dias')::int, antecedencia_max_dias),
    permitir_publico = coalesce((p->>'permitir_publico')::boolean, permitir_publico),
    termos = coalesce(nullif(p->>'termos', ''), termos),
    -- Termos mudaram: nova versão (quem criar ou editar venda paga aceita de novo).
    termos_versao = termos_versao + case when nullif(p->>'termos', '') is not null and p->>'termos' <> v_termos then 1 else 0 end,
    atualizado_em = now(), atualizado_por = auth.uid()
   where id = 1;
  if (select preco_min > preco_max from public.regras_eventos_pessoa where id = 1) then raise exception 'O preço mínimo não pode ser maior que o máximo.'; end if;
end $$;

create or replace function public.salvar_pacote_impulso(p_id uuid, p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  if p_id is null then
    insert into public.pacotes_impulso (nome, dias, preco, raio_km, descricao, ativo, ordem)
    values (btrim(p->>'nome'), (p->>'dias')::int, (p->>'preco')::numeric, coalesce((p->>'raio_km')::int, 10), nullif(btrim(coalesce(p->>'descricao', '')), ''),
            coalesce((p->>'ativo')::boolean, true), coalesce((p->>'ordem')::int, 0))
    returning id into v_id;
  else
    update public.pacotes_impulso set nome = btrim(p->>'nome'), dias = (p->>'dias')::int, preco = (p->>'preco')::numeric,
           raio_km = coalesce((p->>'raio_km')::int, raio_km), descricao = nullif(btrim(coalesce(p->>'descricao', '')), ''),
           ativo = coalesce((p->>'ativo')::boolean, ativo), ordem = coalesce((p->>'ordem')::int, ordem)
     where id = p_id returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function public.eventos_pessoa_admin()
returns table (id uuid, titulo text, tipo text, inicio timestamptz, situacao text, suspenso boolean, visibilidade text, anfitriao text, anfitriao_usuario text,
               vendidos int, arrecadado numeric, taxas numeric, a_reembolsar int, impulsionado boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  return query
  select e.id, e.titulo, e.tipo, e.inicio, e.situacao, e.suspenso, e.visibilidade, p.nome, p.usuario,
         (select count(*) from public.ingressos_anfitriao i where i.evento_id = e.id and i.situacao <> 'cancelado')::int,
         (select coalesce(sum(total), 0) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'pago'),
         (select coalesce(sum(comissao), 0) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'pago'),
         (select count(*) from public.compras_anfitriao c where c.evento_id = e.id and c.situacao = 'reembolsar')::int,
         exists (select 1 from public.impulsos m where m.evento_id = e.id and m.situacao = 'ativo' and m.fim > now())
    from public.eventos_pessoa e join public.perfis p on p.id = e.anfitriao_id
   order by e.inicio desc limit 300;
end $$;

create or replace function public.suspender_evento_pessoa(p_evento uuid, p_suspender boolean, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  update public.eventos_pessoa set suspenso = p_suspender, motivo_suspensao = case when p_suspender then nullif(btrim(coalesce(p_motivo, '')), '') end where id = p_evento;
  if p_suspender then
    update public.compras_anfitriao set situacao = 'reembolsar' where evento_id = p_evento and situacao = 'pago' and total > 0;
    update public.ingressos_anfitriao set situacao = 'cancelado' where evento_id = p_evento and situacao = 'valido';
  end if;
end $$;

-- A equipe marca como reembolsado depois de estornar no Mercado Pago.
create or replace function public.marcar_reembolso_anfitriao(p_evento uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes.'; end if;
  update public.compras_anfitriao set situacao = 'reembolsado' where evento_id = p_evento and situacao = 'reembolsar';
  get diagnostics n = row_count;
  return n;
end $$;

revoke execute on function public.confirmar_compra_anfitriao(uuid, text, text, numeric, numeric), public.confirmar_impulso(uuid, text, text, numeric) from public, anon, authenticated;
grant execute on function public.confirmar_compra_anfitriao(uuid, text, text, numeric, numeric), public.confirmar_impulso(uuid, text, text, numeric) to service_role;
revoke execute on function public.salvar_cotas_evento(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.anfitriao_conectado(), public.regras_eventos_app(), public.pode_ver_evento_pessoa(uuid), public.ocupados_cota(uuid),
  public.salvar_evento_pessoa(uuid, jsonb, jsonb, int), public.evento_pessoa(uuid), public.meus_eventos_pessoa(),
  public.eventos_pessoa_para_mim(double precision, double precision), public.convidar_evento_pessoa(uuid, uuid[]), public.responder_convite_evento(uuid, text),
  public.reservar_anfitriao(uuid, jsonb), public.preparar_compra_anfitriao(uuid), public.validar_ingresso_anfitriao(uuid, text),
  public.cancelar_evento_pessoa(uuid), public.meus_ingressos_anfitriao(), public.preparar_impulso(uuid, uuid),
  public.regras_eventos_admin(), public.salvar_regras_eventos(jsonb), public.salvar_pacote_impulso(uuid, jsonb), public.eventos_pessoa_admin(),
  public.suspender_evento_pessoa(uuid, boolean, text), public.marcar_reembolso_anfitriao(uuid) to authenticated;

select 'Atualização 037 aplicada: eventos de anfitriões, ingressos, convites e impulsionamento.' as resultado;
