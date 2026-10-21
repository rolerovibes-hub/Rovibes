-- 039 · Funções da equipe, ações sensíveis e pedidos de autorização
-- • Cada estabelecimento recebe funções prontas (Gerente, Caixa, Garçom, Cumim, Barman, Chef...) que o dono ajusta ou cria novas.
-- • Uma pessoa pode ter várias funções; os acessos se somam. O dono ainda dá ou tira um app só daquela pessoa.
-- • Barman e ajudantes de bar só preparam itens do bar; cozinha só da cozinha.
-- • Ações sensíveis separadas: cancelar item, resolver ocorrências, desconto (com limite), estornar,
--   reabrir comanda, fechar conta em aberto e transferir mesa/entrega. Sem a permissão, vira pedido de autorização.
-- • Novo app Caixa (T7005).
-- • Equipe RoVibes com níveis (geral, comercial, moderação, catálogo, financeiro, suporte). A equipe RoVibes
--   só entra na operação de um estabelecimento quando o proprietário libera o "modo suporte" por algumas horas.
-- Pode rodar de novo sem problema.

-- ============================================================
-- Equipe RoVibes: níveis e modo suporte
-- ============================================================
-- Níveis: geral (tudo, inclusive a própria equipe RoVibes), comercial (aprovar estabelecimentos),
-- moderacao (denúncias, eventos de pessoas), catalogo (vibes, gostos, biblioteca, músicas),
-- financeiro (regras, taxas e preços) e suporte (entrar num estabelecimento quando o dono libera).
alter table public.administradores add column if not exists niveis text[] not null default array['geral'];
alter table public.administradores add column if not exists adicionado_por uuid references auth.users(id) on delete set null;

create or replace function public.eh_equipe(p_area text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.administradores where usuario_id = auth.uid() and ('geral' = any (niveis) or p_area = any (niveis)));
$$;

create table if not exists public.suportes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  liberado_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  liberado_em timestamptz not null default now(),
  expira_em timestamptz not null,
  motivo text check (motivo is null or length(motivo) <= 300),
  encerrado_em timestamptz,
  encerrado_por uuid references auth.users(id) on delete set null
);
create index if not exists suportes_estab_idx on public.suportes (estabelecimento_id, expira_em desc);
alter table public.suportes enable row level security;
drop policy if exists suportes_ler on public.suportes;
create policy suportes_ler on public.suportes for select to authenticated
  using (public.eh_proprietario(estabelecimento_id) or public.eh_equipe('suporte'));

-- A equipe RoVibes (nível suporte) só entra na operação enquanto o dono deixa.
create or replace function public.suporte_ativo(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_equipe('suporte')
     and exists (select 1 from public.suportes s where s.estabelecimento_id = p_estab and s.encerrado_em is null and s.expira_em > now());
$$;

create or replace function public.liberar_suporte(p_estab uuid, p_horas int, p_motivo text)
returns timestamptz language plpgsql security definer set search_path = public as $$
declare v_fim timestamptz;
begin
  if not public.eh_proprietario(p_estab) then raise exception 'Só o proprietário libera o suporte RoVibes.'; end if;
  if p_horas is null or p_horas < 1 or p_horas > 72 then raise exception 'Escolha de 1 a 72 horas.'; end if;
  update public.suportes set encerrado_em = now(), encerrado_por = auth.uid()
   where estabelecimento_id = p_estab and encerrado_em is null and expira_em > now();
  v_fim := now() + make_interval(hours => p_horas);
  insert into public.suportes (estabelecimento_id, expira_em, motivo) values (p_estab, v_fim, nullif(btrim(coalesce(p_motivo, '')), ''));
  return v_fim;
end $$;

create or replace function public.encerrar_suporte(p_estab uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_proprietario(p_estab) or public.eh_equipe('suporte')) then raise exception 'Sem acesso.'; end if;
  update public.suportes set encerrado_em = now(), encerrado_por = auth.uid()
   where estabelecimento_id = p_estab and encerrado_em is null and expira_em > now();
end $$;

create or replace function public.suportes_do_estab(p_estab uuid)
returns table (id uuid, liberado_em timestamptz, expira_em timestamptz, motivo text, encerrado_em timestamptz, ativo boolean)
language sql stable security definer set search_path = public as $$
  select s.id, s.liberado_em, s.expira_em, s.motivo, s.encerrado_em, s.encerrado_em is null and s.expira_em > now()
    from public.suportes s
   where s.estabelecimento_id = p_estab and (public.eh_proprietario(p_estab) or public.eh_equipe('suporte'))
   order by s.liberado_em desc limit 20;
$$;

-- Estabelecimentos em que a equipe RoVibes pode entrar agora.
create or replace function public.estabelecimentos_em_suporte()
returns table (estabelecimento_id uuid, nome text, situacao text, motivo_situacao text, expira_em timestamptz, motivo text)
language sql stable security definer set search_path = public as $$
  select e.id, e.nome, e.situacao, e.motivo_situacao, s.expira_em, s.motivo
    from public.suportes s join public.estabelecimentos e on e.id = s.estabelecimento_id
   where public.eh_equipe('suporte') and s.encerrado_em is null and s.expira_em > now()
   order by s.expira_em;
$$;

create or replace function public.meus_niveis()
returns text[] language sql stable security definer set search_path = public as $$
  select coalesce((select niveis from public.administradores where usuario_id = auth.uid()), '{}');
$$;

-- Equipe RoVibes (app A1008, só nível geral).
create or replace function public.equipe_rovibes()
returns table (usuario_id uuid, nome text, email text, foto_url text, niveis text[], desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_equipe('geral') then raise exception 'Só o nível geral vê a equipe RoVibes.'; end if;
  return query
  select a.usuario_id, coalesce(p.nome, ''), u.email::text, p.foto_url, a.niveis, a.criado_em
    from public.administradores a left join public.perfis p on p.id = a.usuario_id left join auth.users u on u.id = a.usuario_id
   order by ('geral' = any (a.niveis)) desc, p.nome;
end $$;

create or replace function public.salvar_equipe_rovibes(p_email text, p_niveis text[])
returns uuid language plpgsql security definer set search_path = public as $$
declare v_usuario uuid; n text;
begin
  if not public.eh_equipe('geral') then raise exception 'Só o nível geral mexe na equipe RoVibes.'; end if;
  if p_niveis is null or cardinality(p_niveis) = 0 then raise exception 'Escolha pelo menos um nível.'; end if;
  foreach n in array p_niveis loop
    if n not in ('geral', 'comercial', 'moderacao', 'catalogo', 'financeiro', 'suporte') then raise exception 'Nível inválido: %.', n; end if;
  end loop;
  select id into v_usuario from auth.users where lower(email) = lower(btrim(p_email));
  if v_usuario is null then raise exception 'Não há conta no RoVibes com este e-mail.'; end if;
  if v_usuario = auth.uid() and not ('geral' = any (p_niveis)) then raise exception 'Você não pode tirar o seu próprio nível geral.'; end if;
  insert into public.administradores (usuario_id, niveis, adicionado_por) values (v_usuario, p_niveis, auth.uid())
  on conflict (usuario_id) do update set niveis = excluded.niveis;
  return v_usuario;
end $$;

create or replace function public.remover_equipe_rovibes(p_usuario uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('geral') then raise exception 'Só o nível geral mexe na equipe RoVibes.'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode se remover.'; end if;
  delete from public.administradores where usuario_id = p_usuario;
end $$;

revoke execute on function public.eh_equipe(text), public.suporte_ativo(uuid), public.liberar_suporte(uuid, int, text), public.encerrar_suporte(uuid),
  public.suportes_do_estab(uuid), public.estabelecimentos_em_suporte(), public.meus_niveis(), public.equipe_rovibes(),
  public.salvar_equipe_rovibes(text, text[]), public.remover_equipe_rovibes(uuid) from public, anon;
grant execute on function public.eh_equipe(text), public.suporte_ativo(uuid), public.liberar_suporte(uuid, int, text), public.encerrar_suporte(uuid),
  public.suportes_do_estab(uuid), public.estabelecimentos_em_suporte(), public.meus_niveis(), public.equipe_rovibes(),
  public.salvar_equipe_rovibes(text, text[]), public.remover_equipe_rovibes(uuid) to authenticated;
grant select on public.suportes to authenticated;

-- ============================================================
-- Tabelas
-- ============================================================
create table if not exists public.funcoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  modelo text,
  nome text not null check (length(btrim(nome)) between 2 and 40),
  descricao text check (descricao is null or length(descricao) <= 160),
  nivel text not null default 'equipe' check (nivel in ('gerente', 'lider', 'equipe')),
  setor text check (setor in ('cozinha', 'bar')),
  codigos text[] not null default '{}',
  acoes text[] not null default '{}',
  desconto_max numeric(5,2) not null default 0 check (desconto_max between 0 and 100),
  ordem int not null default 0,
  ativa boolean not null default true,
  criado_em timestamptz not null default now(),
  unique (estabelecimento_id, nome)
);
create index if not exists funcoes_estab_idx on public.funcoes (estabelecimento_id, ordem);

create table if not exists public.membro_funcoes (
  estabelecimento_id uuid not null,
  usuario_id uuid not null,
  funcao_id uuid not null references public.funcoes(id) on delete cascade,
  criado_em timestamptz not null default now(),
  primary key (estabelecimento_id, usuario_id, funcao_id),
  foreign key (estabelecimento_id, usuario_id) references public.membros(estabelecimento_id, usuario_id) on delete cascade
);

-- App tirado só daquela pessoa (mesmo que a função dê).
create table if not exists public.acessos_retirados (
  estabelecimento_id uuid not null,
  usuario_id uuid not null,
  codigo text not null,
  primary key (estabelecimento_id, usuario_id, codigo),
  foreign key (estabelecimento_id, usuario_id) references public.membros(estabelecimento_id, usuario_id) on delete cascade
);

alter table public.funcoes enable row level security;
alter table public.membro_funcoes enable row level security;
alter table public.acessos_retirados enable row level security;
drop policy if exists funcoes_ler on public.funcoes;
create policy funcoes_ler on public.funcoes for select to authenticated using (public.papel_em(estabelecimento_id) is not null or public.suporte_ativo(estabelecimento_id));
drop policy if exists membro_funcoes_ler on public.membro_funcoes;
create policy membro_funcoes_ler on public.membro_funcoes for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G3001'));
drop policy if exists acessos_retirados_ler on public.acessos_retirados;
create policy acessos_retirados_ler on public.acessos_retirados for select to authenticated
  using (usuario_id = auth.uid() or public.pode_usar(estabelecimento_id, 'G3001'));

-- Desconto dado pela equipe (sem cupom).
alter table public.comanda_descontos alter column cupom_id drop not null;
alter table public.comanda_descontos alter column envio_id drop not null;
alter table public.comanda_descontos add column if not exists tipo text not null default 'cupom';
do $$ begin
  alter table public.comanda_descontos add constraint comanda_descontos_tipo_check check (tipo in ('cupom', 'manual'));
exception when duplicate_object then null; end $$;
alter table public.comanda_descontos add column if not exists motivo text;

-- ============================================================
-- Quem tem o quê
-- ============================================================
-- Um app vale para a pessoa se veio de uma função dela ou foi liberado só para ela, e não foi tirado.
-- O Caixa (T7005) também abre as comandas (T7001) por baixo, para receber e fechar.
create or replace function public.tem_codigo(p_estab uuid, p_usuario uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.membros m
     where m.estabelecimento_id = p_estab and m.usuario_id = p_usuario and m.ativo
       and (m.papel = 'proprietario'
            or (not exists (select 1 from public.acessos_retirados r
                             where r.estabelecimento_id = p_estab and r.usuario_id = p_usuario and r.codigo = p_codigo)
                and (exists (select 1 from public.acessos a
                              where a.estabelecimento_id = p_estab and a.usuario_id = p_usuario
                                and (a.codigo = p_codigo or (p_codigo = 'T7001' and a.codigo = 'T7005')))
                     or exists (select 1 from public.membro_funcoes mf join public.funcoes f on f.id = mf.funcao_id
                                 where mf.estabelecimento_id = p_estab and mf.usuario_id = p_usuario and f.ativa
                                   and (p_codigo = any (f.codigos) or (p_codigo = 'T7001' and 'T7005' = any (f.codigos)))))))
  );
$$;

create or replace function public.pode_usar(p_estab uuid, p_codigo text)
returns boolean language sql stable security definer set search_path = public as $$
  select public.suporte_ativo(p_estab) or public.tem_codigo(p_estab, auth.uid(), p_codigo);
$$;

-- Ação sensível. Proprietário, gerente e quem tem Supervisão (T7004) podem todas.
-- Funções com setor (ex.: Chef de cozinha) só valem para os itens do setor delas.
create or replace function public.pode_acao(p_estab uuid, p_acao text, p_setor text default null)
returns boolean language sql stable security definer set search_path = public as $$
  select public.suporte_ativo(p_estab) or public.eh_proprietario(p_estab)
      or coalesce(public.papel_em(p_estab) = 'gestor', false)
      or public.pode_usar(p_estab, 'T7004')
      or exists (select 1 from public.membro_funcoes mf
                   join public.funcoes f on f.id = mf.funcao_id
                   join public.membros m on m.estabelecimento_id = mf.estabelecimento_id and m.usuario_id = mf.usuario_id and m.ativo
                  where mf.estabelecimento_id = p_estab and mf.usuario_id = auth.uid() and f.ativa and p_acao = any (f.acoes)
                    and (p_setor is null or p_setor not in ('cozinha', 'bar') or f.setor is null or f.setor = p_setor));
$$;

create or replace function public.desconto_maximo(p_estab uuid)
returns numeric language sql stable security definer set search_path = public as $$
  select case
    when public.suporte_ativo(p_estab) or public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.pode_usar(p_estab, 'T7004') then 100
    else coalesce((select max(f.desconto_max) from public.membro_funcoes mf join public.funcoes f on f.id = mf.funcao_id
                    join public.membros m on m.estabelecimento_id = mf.estabelecimento_id and m.usuario_id = mf.usuario_id and m.ativo
                   where mf.estabelecimento_id = p_estab and mf.usuario_id = auth.uid() and f.ativa and 'desconto' = any (f.acoes)), 0)
  end;
$$;

-- Setores que a pessoa prepara: todos (dono, gerente, liberado só para ela) ou os das funções com Preparo.
create or replace function public.setores_preparo(p_estab uuid)
returns text[] language sql stable security definer set search_path = public as $$
  select case
    when public.suporte_ativo(p_estab) or public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false)
      or exists (select 1 from public.acessos a where a.estabelecimento_id = p_estab and a.usuario_id = auth.uid() and a.codigo = 'T7002')
      or exists (select 1 from public.membro_funcoes mf join public.funcoes f on f.id = mf.funcao_id
                  where mf.estabelecimento_id = p_estab and mf.usuario_id = auth.uid() and f.ativa and 'T7002' = any (f.codigos) and f.setor is null)
      then array['cozinha', 'bar']
    else coalesce((select array_agg(distinct f.setor) from public.membro_funcoes mf join public.funcoes f on f.id = mf.funcao_id
                    where mf.estabelecimento_id = p_estab and mf.usuario_id = auth.uid() and f.ativa and 'T7002' = any (f.codigos) and f.setor is not null), '{}')
  end;
$$;

-- "Supervisão" agora é ter alguma ação sensível (vê ocorrências e autorizações).
create or replace function public.pode_supervisionar(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from unnest(array['cancelar_item', 'resolver_ocorrencias', 'desconto', 'estornar', 'reabrir_comanda', 'fechar_em_aberto', 'transferir']) a
                  where public.pode_acao(p_estab, a));
$$;

create or replace function public.atende_estab(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.tem_codigo(p_estab, auth.uid(), 'T2001');
$$;

create or replace function public.garcons(p_estab uuid)
returns table (usuario_id uuid, nome text, cargo text)
language sql stable security definer set search_path = public as $$
  select m.usuario_id, coalesce(p.nome, ''), m.cargo
    from public.membros m left join public.perfis p on p.id = m.usuario_id
   where m.estabelecimento_id = p_estab and m.ativo
     and (m.papel in ('proprietario', 'gestor') or public.tem_codigo(p_estab, m.usuario_id, 'T7001'))
     and public.equipe_do_salao(p_estab)
   order by p.nome;
$$;

-- ============================================================
-- Funções prontas
-- ============================================================
create or replace function public.modelos_funcoes()
returns table (modelo text, nome text, descricao text, nivel text, setor text, codigos text[], acoes text[], desconto_max numeric, ordem int)
language sql immutable as $$
  values
  ('gerente', 'Gerente', 'Cuida da operação e da equipe. Faz todas as ações sensíveis.', 'gerente', null::text,
     array['G1001','T2001','T2002','T5005','G3001','G4001','G4002','G4003','T4004','G5001','T5002','G5003','G5004','G6001','G6002','T7001','T7002','T7003','T7004','T7005','C8001','G9001'],
     array['cancelar_item','resolver_ocorrencias','desconto','estornar','reabrir_comanda','fechar_em_aberto','transferir'], 100::numeric, 1),
  ('caixa', 'Caixa', 'Recebe, fecha contas e vende no balcão.', 'equipe', null, array['T7005','T7003'], array['desconto'], 10, 2),
  ('garcom', 'Garçom', 'Atende as mesas, lança pedidos e entrega.', 'equipe', null, array['T7001','T7003'], array[]::text[], 0, 3),
  ('cumim', 'Cumim', 'Leva os pedidos prontos até a mesa.', 'equipe', null, array['T7003'], array[]::text[], 0, 4),
  ('chefe_bar', 'Chefe de bar', 'Lidera o bar: prepara e autoriza cancelamentos do bar.', 'lider', 'bar', array['T7002','T7003','T4004','G4002'], array['cancelar_item'], 0, 5),
  ('barman', 'Barman', 'Prepara os drinks e bebidas do bar.', 'equipe', 'bar', array['T7002','T7003'], array[]::text[], 0, 6),
  ('ajudante_bar', 'Ajudante de bar', 'Apoia o bar no preparo e na reposição.', 'equipe', 'bar', array['T7002','T4004'], array[]::text[], 0, 7),
  ('chef', 'Chef de cozinha', 'Lidera a cozinha: cardápio, estoque e cancelamentos da cozinha.', 'lider', 'cozinha', array['T7002','G4001','G4002','T4004'], array['cancelar_item','resolver_ocorrencias'], 0, 8),
  ('ajudante_cozinha', 'Ajudante de cozinha', 'Prepara os pratos da cozinha.', 'equipe', 'cozinha', array['T7002'], array[]::text[], 0, 9),
  ('recepcao', 'Recepção e portaria', 'Confere ingressos e listas na entrada.', 'equipe', null, array['T5005'], array[]::text[], 0, 10),
  ('estoquista', 'Estoquista', 'Entradas, transferências e contagem de estoque.', 'equipe', null, array['G4002','G4003','T4004'], array[]::text[], 0, 11),
  ('marketing', 'Marketing', 'Publicações, stories, eventos e promoções.', 'equipe', null, array['G6001','G6002','G5001','G5003','T2001'], array[]::text[], 0, 12);
$$;

-- Cria as funções prontas que ainda não existem (não mexe nas que o dono já ajustou).
create or replace function public.criar_funcoes_padrao(p_estab uuid)
returns int language plpgsql security definer set search_path = public as $$
declare v int;
begin
  insert into public.funcoes (estabelecimento_id, modelo, nome, descricao, nivel, setor, codigos, acoes, desconto_max, ordem)
  select p_estab, m.modelo, m.nome, m.descricao, m.nivel, m.setor, m.codigos, m.acoes, m.desconto_max, m.ordem
    from public.modelos_funcoes() m
   where not exists (select 1 from public.funcoes f where f.estabelecimento_id = p_estab and (f.modelo = m.modelo or lower(f.nome) = lower(m.nome)));
  get diagnostics v = row_count;
  return v;
end $$;
revoke execute on function public.criar_funcoes_padrao(uuid) from public, anon, authenticated;

create or replace function public.funcoes_ao_criar_estab()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.criar_funcoes_padrao(new.id);
  return new;
end $$;
drop trigger if exists estabelecimentos_funcoes on public.estabelecimentos;
create trigger estabelecimentos_funcoes after insert on public.estabelecimentos for each row execute function public.funcoes_ao_criar_estab();

-- Estabelecimentos que já existem ganham as funções; gestores atuais viram Gerente.
do $$ declare e record; begin
  for e in select id from public.estabelecimentos loop
    perform public.criar_funcoes_padrao(e.id);
  end loop;
end $$;
insert into public.membro_funcoes (estabelecimento_id, usuario_id, funcao_id)
select m.estabelecimento_id, m.usuario_id, f.id
  from public.membros m join public.funcoes f on f.estabelecimento_id = m.estabelecimento_id and f.modelo = 'gerente'
 where m.papel = 'gestor'
on conflict do nothing;

-- ============================================================
-- Ações sensíveis nas funções da operação (antes: "supervisão" para tudo)
-- ============================================================
create or replace function public.mudar_itens(p_itens uuid[], p_acao text, p_motivo text default null)
returns int language plpgsql security definer set search_path = public as $$
declare
  i record; v_feitos int := 0; v_de text[]; v_para text; v_estab uuid; v_retirada boolean := false; v_bloqueado boolean := false;
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  if p_itens is null or cardinality(p_itens) = 0 then raise exception 'Escolha pelo menos um item.'; end if;
  case p_acao
    when 'iniciar' then v_de := array['recebido']; v_para := 'preparo';
    when 'liberar' then v_de := array['recebido', 'preparo']; v_para := 'pronto';
    when 'saiu' then v_de := array['pronto']; v_para := 'saiu';
    when 'voltar' then v_de := array['saiu']; v_para := 'pronto';
    when 'entregar' then v_de := array['pronto', 'saiu']; v_para := 'entregue';
    when 'cancelar' then v_de := array['recebido', 'preparo', 'pronto', 'saiu']; v_para := 'cancelado';
    else raise exception 'Ação inválida.';
  end case;
  if p_acao = 'cancelar' and coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do cancelamento.'; end if;

  for i in
    select pi.id, pi.pedido_id, pi.situacao, pi.destino, pi.bloqueado, pi.entregador_id, pi.estabelecimento_id,
           p.modalidade, p.usuario_id as cliente, p.envio_id, c.situacao as comanda
      from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id join public.comandas c on c.id = p.comanda_id
     where pi.id = any(p_itens)
     order by pi.id
       for update of pi
  loop
    v_estab := i.estabelecimento_id;
    if p_acao in ('iniciar', 'liberar') and not public.pode_usar(v_estab, 'T7002') then
      raise exception 'Sem acesso ao preparo.';
    elsif p_acao in ('iniciar', 'liberar') and i.destino in ('cozinha', 'bar') and not (i.destino = any(public.setores_preparo(v_estab))) then
      raise exception 'Este item é do setor %: sua função não prepara itens desse setor.', case i.destino when 'bar' then 'bar' else 'cozinha' end;
    elsif p_acao in ('saiu', 'voltar', 'entregar') and not (public.pode_usar(v_estab, 'T7003') or public.pode_usar(v_estab, 'T7001')) then
      raise exception 'Sem acesso às entregas.';
    elsif p_acao = 'cancelar' and not public.equipe_do_salao(v_estab) then
      raise exception 'Sem acesso a este pedido.';
    end if;
    if i.comanda <> 'aberta' then raise exception 'A comanda deste pedido já foi fechada.'; end if;
    if i.bloqueado then v_bloqueado := true; continue; end if;
    -- Depois que o preparo começou, cancelar exige supervisão (a equipe abre uma ocorrência).
    if p_acao = 'cancelar' and not (i.situacao = 'recebido' or (i.situacao = 'pronto' and i.destino = 'sem_preparo'))
       and not public.pode_acao(v_estab, 'cancelar_item', i.destino) then
      raise exception 'O item já está em preparo ou pronto: peça o cancelamento à supervisão.';
    end if;
    -- Item "pego" por outro cumim: só ele ou a supervisão.
    if p_acao in ('saiu', 'entregar') and i.entregador_id is not null and i.entregador_id <> auth.uid() and not public.pode_acao(v_estab, 'transferir') then
      raise exception 'Este item está com outra pessoa da entrega.';
    end if;
    if p_acao = 'saiu' and i.modalidade <> 'mesa' then v_retirada := true; continue; end if;
    if p_acao = 'entregar' and i.cliente is not null then
      raise exception 'Pedido feito pelo App: confirme a entrega lendo o QR code do cliente.';
    end if;
    if not (i.situacao = any(v_de)) then continue; end if;

    update public.pedido_itens set
        situacao = v_para, atualizado_em = now(),
        preparo_por = case when v_para = 'preparo' then auth.uid() else preparo_por end,
        preparo_em = case when v_para = 'preparo' then now() else preparo_em end,
        pronto_por = case when v_para = 'pronto' and p_acao = 'liberar' then auth.uid() else pronto_por end,
        pronto_em = case when v_para = 'pronto' and p_acao = 'liberar' then now() else pronto_em end,
        saiu_por = case when v_para = 'saiu' then auth.uid() when p_acao = 'voltar' then null else saiu_por end,
        saiu_em = case when v_para = 'saiu' then now() when p_acao = 'voltar' then null else saiu_em end,
        entregador_id = case when v_para = 'saiu' then auth.uid() when p_acao = 'voltar' then null else entregador_id end,
        entregue_por = case when v_para = 'entregue' then auth.uid() else entregue_por end,
        entregue_em = case when v_para = 'entregue' then now() else entregue_em end,
        entrega_por_qr = case when v_para = 'entregue' then false else entrega_por_qr end,
        motivo_cancelamento = case when v_para = 'cancelado' then btrim(p_motivo) else motivo_cancelamento end
     where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (v_estab, i.pedido_id, i.id, p_acao, auth.uid(), nullif(btrim(coalesce(p_motivo, '')), ''));
    v_feitos := v_feitos + 1;

    if v_para = 'cancelado' and not exists (select 1 from public.pedido_itens where pedido_id = i.pedido_id and situacao <> 'cancelado') then
      update public.cupons set situacao = 'disponivel', usado_em = null
       where id in (select cupom_id from public.comanda_descontos where envio_id = i.envio_id);
      delete from public.comanda_descontos where envio_id = i.envio_id;
    end if;
  end loop;
  if v_feitos = 0 and v_bloqueado then raise exception 'Item aguardando decisão da supervisão.'; end if;
  if v_feitos = 0 and v_retirada then raise exception 'Pedido para retirada no balcão: entregue quando o cliente chegar.'; end if;
  if v_feitos = 0 then raise exception 'Nada foi alterado: os itens já mudaram de etapa (talvez outra pessoa atualizou).'; end if;
  return v_feitos;
end $$;


create or replace function public.pegar_itens(p_itens uuid[], p_para uuid default null)
returns int language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_para uuid := coalesce(p_para, auth.uid()); v_feitos int := 0; i record;
begin
  for i in select id, estabelecimento_id, pedido_id, entregador_id, situacao, bloqueado from public.pedido_itens
            where id = any(p_itens) for update loop
    v_estab := i.estabelecimento_id;
    if not (public.pode_usar(v_estab, 'T7003') or public.pode_usar(v_estab, 'T7001')) then raise exception 'Sem acesso às entregas.'; end if;
    if p_para is not null and p_para <> auth.uid() and not public.pode_acao(v_estab, 'transferir') then
      raise exception 'Só a supervisão passa entregas para outra pessoa.';
    end if;
    if p_para is not null and not exists (select 1 from public.membros where estabelecimento_id = v_estab and usuario_id = p_para and ativo) then
      raise exception 'Pessoa não encontrada na equipe.';
    end if;
    if i.situacao not in ('pronto', 'saiu') or i.bloqueado then continue; end if;
    if i.entregador_id is not null and i.entregador_id <> auth.uid() and p_para is null and not public.pode_acao(v_estab, 'transferir') then
      raise exception 'Este item já está com outra pessoa da entrega.';
    end if;
    update public.pedido_itens set entregador_id = v_para, atualizado_em = now() where id = i.id;
    insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
    values (v_estab, i.pedido_id, i.id, case when v_para = auth.uid() then 'pegar' else 'reatribuir' end, auth.uid(),
            case when v_para <> auth.uid() then 'Para ' || coalesce((select nome from public.perfis where id = v_para), 'outra pessoa') end);
    v_feitos := v_feitos + 1;
  end loop;
  if v_feitos = 0 then raise exception 'Nenhum item disponível para pegar.'; end if;
  return v_feitos;
end $$;


create or replace function public.resolver_ocorrencia(p_ocorrencia uuid, p_acao text, p_nota text default null)
returns void language plpgsql security definer set search_path = public as $$
declare o public.ocorrencias; it public.pedido_itens;
begin
  select * into o from public.ocorrencias where id = p_ocorrencia for update;
  if not found then raise exception 'Ocorrência não encontrada.'; end if;
  if o.situacao <> 'aberta' then raise exception 'Esta ocorrência já foi resolvida.'; end if;
  if p_acao not in ('cancelar', 'refazer', 'entregar', 'resolver', 'recusar') then raise exception 'Ação inválida.'; end if;
  select * into it from public.pedido_itens where id = o.item_id for update;
  if p_acao in ('cancelar', 'refazer') then
    if not public.pode_acao(o.estabelecimento_id, 'cancelar_item', it.destino) then raise exception 'Sua função não autoriza cancelar ou refazer itens deste setor.'; end if;
  elsif not public.pode_acao(o.estabelecimento_id, 'resolver_ocorrencias') then
    raise exception 'Sua função não resolve ocorrências.';
  end if;

  if p_acao = 'cancelar' then
    update public.pedido_itens set situacao = 'cancelado', bloqueado = false, atualizado_em = now(),
           motivo_cancelamento = coalesce(nullif(btrim(p_nota), ''), o.descricao, 'Cancelado pela supervisão')
     where id = it.id and situacao not in ('entregue', 'cancelado');
  elsif p_acao = 'refazer' then
    update public.pedido_itens set bloqueado = false, refeito = refeito + 1, atualizado_em = now(),
           situacao = case when destino = 'sem_preparo' then 'pronto' else 'recebido' end,
           preparo_por = null, preparo_em = null, pronto_por = null,
           pronto_em = case when destino = 'sem_preparo' then now() end,
           saiu_por = null, saiu_em = null, entregador_id = null
     where id = it.id and situacao not in ('entregue', 'cancelado');
  elsif p_acao = 'entregar' then
    if coalesce(btrim(p_nota), '') = '' then raise exception 'Informe por que a entrega está sendo confirmada sem QR.'; end if;
    update public.pedido_itens set situacao = 'entregue', bloqueado = false, entregue_por = auth.uid(), entregue_em = now(),
           entrega_por_qr = false, atualizado_em = now()
     where id = it.id and situacao not in ('entregue', 'cancelado');
  else
    update public.pedido_itens set bloqueado = false, atualizado_em = now() where id = it.id;
  end if;

  update public.ocorrencias
     set situacao = case when p_acao = 'recusar' then 'recusada' else 'resolvida' end,
         resolucao = case p_acao when 'cancelar' then 'cancelado' when 'refazer' then 'refeito' when 'entregar' then 'entregue'
                                 when 'recusar' then 'recusado' else 'resolvido' end,
         nota = nullif(btrim(coalesce(p_nota, '')), ''), resolvida_por = auth.uid(), resolvida_em = now()
   where id = o.id;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
  values (o.estabelecimento_id, o.pedido_id, o.item_id, 'supervisao_' || p_acao, auth.uid(), nullif(btrim(coalesce(p_nota, '')), ''));

  -- Pedido inteiro cancelado: cupom volta.
  if p_acao = 'cancelar' and not exists (select 1 from public.pedido_itens where pedido_id = o.pedido_id and situacao <> 'cancelado') then
    update public.cupons set situacao = 'disponivel', usado_em = null
     where id in (select cupom_id from public.comanda_descontos d join public.pedidos p on p.envio_id = d.envio_id where p.id = o.pedido_id);
    delete from public.comanda_descontos where envio_id = (select envio_id from public.pedidos where id = o.pedido_id);
  end if;
end $$;


create or replace function public.estornar_item(p_item uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare it record;
begin
  select pi.*, c.situacao as comanda from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id
    join public.comandas c on c.id = p.comanda_id where pi.id = p_item into it;
  if not found then raise exception 'Item não encontrado.'; end if;
  if not public.pode_acao(it.estabelecimento_id, 'estornar') then raise exception 'Sua função não faz estornos: peça autorização.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do estorno.'; end if;
  if it.comanda <> 'aberta' then raise exception 'Reabra a comanda para estornar.'; end if;
  if it.situacao <> 'entregue' then raise exception 'Só itens entregues são estornados. Para os outros, use cancelar.'; end if;
  update public.pedido_itens set situacao = 'cancelado', estornado = true, motivo_cancelamento = 'Estorno: ' || btrim(p_motivo), atualizado_em = now()
   where id = p_item;
  insert into public.pedido_eventos (estabelecimento_id, pedido_id, item_id, acao, usuario_id, detalhe)
  values (it.estabelecimento_id, it.pedido_id, it.id, 'estorno', auth.uid(), btrim(p_motivo));
end $$;


create or replace function public.reabrir_comanda(p_comanda uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if not public.pode_acao(c.estabelecimento_id, 'reabrir_comanda') then raise exception 'Sua função não reabre comandas: peça autorização.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo da reabertura.'; end if;
  if c.situacao <> 'fechada' then raise exception 'Só comandas fechadas podem ser reabertas.'; end if;
  if (c.fechada_em at time zone 'America/Sao_Paulo')::date <> (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'Só dá para reabrir comandas fechadas hoje.';
  end if;
  if c.mesa_id is not null and exists (select 1 from public.comandas where mesa_id = c.mesa_id and situacao = 'aberta') then
    raise exception 'A mesa já tem outra comanda aberta.';
  end if;
  update public.comandas set situacao = 'aberta', fechada_em = null, fechada_por = null, total = null, reaberta_em = now() where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'comanda_reaberta', auth.uid(), btrim(p_motivo));
end $$;


create or replace function public.assumir_comanda(p_comanda uuid, p_para uuid default null)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_para uuid := coalesce(p_para, auth.uid());
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às mesas.'; end if;
  if c.responsavel_id is not null and c.responsavel_id <> auth.uid() and not public.pode_acao(c.estabelecimento_id, 'transferir') then
    raise exception 'Esta mesa é de outro garçom. Peça a transferência para ele ou para a supervisão.';
  end if;
  if not exists (select 1 from public.garcons(c.estabelecimento_id) g where g.usuario_id = v_para) then
    raise exception 'Esta pessoa não atende mesas.';
  end if;
  update public.comandas set responsavel_id = v_para where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, case when v_para = auth.uid() then 'assumir' else 'transferir' end, auth.uid(),
          case when v_para <> auth.uid() then 'Para ' || coalesce((select nome from public.perfis where id = v_para), 'outro garçom') end);
end $$;


create or replace function public.cancelar_pagamento(p_pagamento uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare pg public.pagamentos; c public.comandas;
begin
  select * into pg from public.pagamentos where id = p_pagamento for update;
  if not found then raise exception 'Pagamento não encontrado.'; end if;
  if not public.pode_acao(pg.estabelecimento_id, 'estornar') then raise exception 'Sua função não cancela pagamentos: peça autorização.'; end if;
  if pg.origem <> 'caixa' then raise exception 'Pagamentos pelo App são estornados pelo Mercado Pago.'; end if;
  if pg.situacao <> 'aprovado' then raise exception 'Este pagamento não está aprovado.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo.'; end if;
  select * into c from public.comandas where id = pg.comanda_id;
  if c.situacao = 'fechada' then raise exception 'Reabra a comanda antes de cancelar um pagamento dela.'; end if;
  update public.pagamentos set situacao = 'cancelado', cancelado_em = now(), motivo_cancelamento = btrim(p_motivo) where id = pg.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (pg.estabelecimento_id, pg.comanda_id, 'pagamento_cancelado', auth.uid(),
          'R$ ' || replace(to_char(pg.valor, 'FM999990.00'), '.', ',') || ' · ' || btrim(p_motivo));
end $$;


create or replace function public.tirar_servico(p_comanda uuid, p_tirar boolean)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if p_tirar and not public.pode_acao(c.estabelecimento_id, 'desconto') then raise exception 'Sua função não tira a taxa de serviço: peça autorização.'; end if;
  update public.comandas set taxa_servico = case when p_tirar then 0 else (select taxa_servico from public.estabelecimentos where id = c.estabelecimento_id) end
   where id = c.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, case when p_tirar then 'servico_retirado' else 'servico_incluido' end, auth.uid(), null);
end $$;


create or replace function public.fechar_comanda(p_comanda uuid, p_cancelar boolean default false, p_mesmo_assim boolean default false)
returns numeric language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_total numeric; v_falta numeric;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found then raise exception 'Comanda não encontrada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if c.situacao <> 'aberta' then raise exception 'Esta comanda já foi fechada.'; end if;
  if p_cancelar then
    if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
                where p.comanda_id = c.id and i.situacao <> 'cancelado') then
      raise exception 'Só dá para cancelar uma comanda sem pedidos. Cancele os itens antes.';
    end if;
    if exists (select 1 from public.pagamentos where comanda_id = c.id and situacao = 'aprovado') then
      raise exception 'Esta comanda tem pagamentos. Cancele os pagamentos antes.';
    end if;
    update public.comandas set situacao = 'cancelada', fechada_por = auth.uid(), fechada_em = now(), total = 0 where id = c.id;
    return 0;
  end if;
  if exists (select 1 from public.pedido_itens i join public.pedidos p on p.id = i.pedido_id
              where p.comanda_id = c.id and i.situacao in ('recebido', 'preparo', 'pronto', 'saiu')) then
    raise exception 'Ainda há itens não entregues nesta comanda.';
  end if;
  select t.total, t.falta into v_total, v_falta from public.totais_calculo(c.id, null) t;
  if coalesce(v_falta, 0) > 0 and not p_mesmo_assim then
    raise exception 'FALTA_PAGAR:%', replace(to_char(v_falta, 'FM999990.00'), '.', ',');
  end if;
  if coalesce(v_falta, 0) > 0 and not public.pode_acao(c.estabelecimento_id, 'fechar_em_aberto') then
    raise exception 'Sua função não fecha conta com valor em aberto: peça autorização.';
  end if;
  update public.comandas set situacao = 'fechada', fechada_por = auth.uid(), fechada_em = now(), total = coalesce(v_total, 0) where id = c.id;
  return coalesce(v_total, 0);
end $$;


-- ============================================================
-- Equipe: funções, apps extras e apps retirados
-- ============================================================
drop function if exists public.equipe(uuid);
create or replace function public.equipe(p_estab uuid)
returns table (usuario_id uuid, nome text, email text, foto_url text, papel text, cargo text, ativo boolean,
               codigos text[], funcoes uuid[], retirados text[], desde timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  perform public.exigir_gestao_equipe(p_estab);
  return query
  select m.usuario_id, coalesce(p.nome, ''), u.email::text, p.foto_url, m.papel, m.cargo, m.ativo,
         coalesce((select array_agg(a.codigo order by a.codigo) from public.acessos a
                    where a.estabelecimento_id = m.estabelecimento_id and a.usuario_id = m.usuario_id), '{}'),
         coalesce((select array_agg(mf.funcao_id) from public.membro_funcoes mf
                    where mf.estabelecimento_id = m.estabelecimento_id and mf.usuario_id = m.usuario_id), '{}'),
         coalesce((select array_agg(r.codigo order by r.codigo) from public.acessos_retirados r
                    where r.estabelecimento_id = m.estabelecimento_id and r.usuario_id = m.usuario_id), '{}'),
         m.criado_em
    from public.membros m
    left join public.perfis p on p.id = m.usuario_id
    left join auth.users u on u.id = m.usuario_id
   where m.estabelecimento_id = p_estab
   order by (m.papel = 'proprietario') desc, (m.papel = 'gestor') desc, m.ativo desc, p.nome;
end $$;

create or replace function public.funcoes_do_estab(p_estab uuid)
returns table (id uuid, modelo text, nome text, descricao text, nivel text, setor text, codigos text[], acoes text[],
               desconto_max numeric, ordem int, ativa boolean, pessoas int)
language plpgsql stable security definer set search_path = public as $$
begin
  if public.papel_em(p_estab) is null and not public.suporte_ativo(p_estab) then raise exception 'Sem acesso a este estabelecimento.'; end if;
  return query
  select f.id, f.modelo, f.nome, f.descricao, f.nivel, f.setor, f.codigos, f.acoes, f.desconto_max, f.ordem, f.ativa,
         (select count(*)::int from public.membro_funcoes mf join public.membros m on m.estabelecimento_id = mf.estabelecimento_id and m.usuario_id = mf.usuario_id and m.ativo
           where mf.funcao_id = f.id)
    from public.funcoes f
   where f.estabelecimento_id = p_estab
   order by f.ativa desc, case f.nivel when 'gerente' then 0 when 'lider' then 1 else 2 end, f.ordem, f.nome;
end $$;

create or replace function public.acoes_validas()
returns text[] language sql immutable as $$
  select array['cancelar_item', 'resolver_ocorrencias', 'desconto', 'estornar', 'reabrir_comanda', 'fechar_em_aberto', 'transferir'];
$$;

create or replace function public.salvar_funcao(p_estab uuid, p_id uuid, p_dados jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  f public.funcoes; v_dono boolean := public.eh_proprietario(p_estab) or public.suporte_ativo(p_estab);
  v_nivel text := coalesce(p_dados->>'nivel', 'equipe');
  v_setor text := nullif(p_dados->>'setor', '');
  v_codigos text[] := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_dados->'codigos', '[]'))), '{}');
  v_acoes text[] := coalesce(array(select distinct jsonb_array_elements_text(coalesce(p_dados->'acoes', '[]'))), '{}');
  v_desc numeric := coalesce((p_dados->>'desconto_max')::numeric, 0);
  v_id uuid; c text;
begin
  perform public.exigir_gestao_equipe(p_estab);
  if p_id is not null then
    select * into f from public.funcoes where id = p_id and estabelecimento_id = p_estab for update;
    if not found then raise exception 'Função não encontrada.'; end if;
    if f.nivel = 'gerente' and not v_dono then raise exception 'Só o proprietário altera a função de gerente.'; end if;
  end if;
  if v_nivel not in ('gerente', 'lider', 'equipe') then raise exception 'Nível inválido.'; end if;
  if v_nivel = 'gerente' and not v_dono then raise exception 'Só o proprietário cria funções de gerente.'; end if;
  if v_setor is not null and v_setor not in ('cozinha', 'bar') then raise exception 'Setor inválido.'; end if;
  if v_desc < 0 or v_desc > 100 then raise exception 'O limite de desconto vai de 0%% a 100%%.'; end if;
  if v_desc > public.desconto_maximo(p_estab) then raise exception 'Você não pode dar um limite de desconto maior que o seu.'; end if;
  foreach c in array v_acoes loop
    if not (c = any (public.acoes_validas())) then raise exception 'Ação inválida: %.', c; end if;
    if not public.pode_acao(p_estab, c) and not (f.id is not null and c = any (f.acoes)) then
      raise exception 'Você não pode liberar uma ação que você mesmo não tem.';
    end if;
  end loop;
  foreach c in array v_codigos loop
    if c like 'A%' then raise exception 'Aplicativos da administração RoVibes não entram nas funções.'; end if;
    if not public.pode_liberar(p_estab, c) and not (f.id is not null and c = any (f.codigos)) then
      raise exception 'Você não pode liberar o aplicativo %.', c;
    end if;
  end loop;
  if not ('desconto' = any (v_acoes)) then v_desc := 0; end if;

  if p_id is null then
    insert into public.funcoes (estabelecimento_id, nome, descricao, nivel, setor, codigos, acoes, desconto_max, ordem)
    values (p_estab, btrim(p_dados->>'nome'), nullif(btrim(coalesce(p_dados->>'descricao', '')), ''), v_nivel, v_setor, v_codigos, v_acoes, v_desc,
            coalesce((select max(ordem) + 1 from public.funcoes where estabelecimento_id = p_estab), 1))
    returning id into v_id;
  else
    update public.funcoes set nome = btrim(p_dados->>'nome'), descricao = nullif(btrim(coalesce(p_dados->>'descricao', '')), ''),
           nivel = v_nivel, setor = v_setor, codigos = v_codigos, acoes = v_acoes, desconto_max = v_desc,
           ativa = coalesce((p_dados->>'ativa')::boolean, ativa)
     where id = p_id
    returning id into v_id;
    -- Quem tem a função muda de papel se ela virou (ou deixou de ser) de gerente.
    update public.membros m set papel = case when exists (select 1 from public.membro_funcoes mf join public.funcoes x on x.id = mf.funcao_id
                                                          where mf.estabelecimento_id = m.estabelecimento_id and mf.usuario_id = m.usuario_id and x.nivel = 'gerente' and x.ativa)
                                             then 'gestor' else 'equipe' end
     where m.estabelecimento_id = p_estab and m.papel <> 'proprietario'
       and exists (select 1 from public.membro_funcoes mf where mf.funcao_id = v_id and mf.usuario_id = m.usuario_id);
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'Já existe uma função com esse nome.';
end $$;

create or replace function public.apagar_funcao(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
declare f public.funcoes;
begin
  select * into f from public.funcoes where id = p_id;
  if not found then raise exception 'Função não encontrada.'; end if;
  perform public.exigir_gestao_equipe(f.estabelecimento_id);
  if f.nivel = 'gerente' and not (public.eh_proprietario(f.estabelecimento_id) or public.suporte_ativo(f.estabelecimento_id)) then
    raise exception 'Só o proprietário apaga a função de gerente.';
  end if;
  delete from public.funcoes where id = p_id;
  update public.membros m set papel = 'equipe'
   where m.estabelecimento_id = f.estabelecimento_id and m.papel = 'gestor'
     and not exists (select 1 from public.membro_funcoes mf join public.funcoes x on x.id = mf.funcao_id
                      where mf.estabelecimento_id = m.estabelecimento_id and mf.usuario_id = m.usuario_id and x.nivel = 'gerente');
end $$;

create or replace function public.restaurar_funcoes(p_estab uuid)
returns int language plpgsql security definer set search_path = public as $$
begin
  perform public.exigir_gestao_equipe(p_estab);
  return public.criar_funcoes_padrao(p_estab);
end $$;

-- Define as funções da pessoa, os apps só dela e os apps tirados dela.
create or replace function public.definir_membro(p_estab uuid, p_usuario uuid, p_funcoes uuid[], p_extras text[], p_retirados text[], p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_atual text; v_dono boolean := public.eh_proprietario(p_estab) or public.suporte_ativo(p_estab); v_ger boolean; f record; c text;
begin
  perform public.exigir_gestao_equipe(p_estab);
  select papel into v_atual from public.membros where estabelecimento_id = p_estab and usuario_id = p_usuario;
  if v_atual is null then raise exception 'Pessoa não encontrada na equipe.'; end if;
  if v_atual = 'proprietario' then raise exception 'O proprietário não pode ser alterado aqui.'; end if;
  if p_usuario = auth.uid() then raise exception 'Você não pode alterar o seu próprio acesso.'; end if;
  p_funcoes := coalesce(p_funcoes, '{}');
  if exists (select 1 from unnest(p_funcoes) x where not exists (select 1 from public.funcoes where id = x and estabelecimento_id = p_estab)) then
    raise exception 'Função não encontrada.';
  end if;
  v_ger := exists (select 1 from public.funcoes where id = any (p_funcoes) and nivel = 'gerente');
  if (v_ger or v_atual = 'gestor') and not v_dono then raise exception 'Só o proprietário define gerentes.'; end if;

  -- Gerente só dá função com apps que ele mesmo usa.
  for f in select x.* from public.funcoes x where x.id = any (p_funcoes)
             and not exists (select 1 from public.membro_funcoes mf where mf.funcao_id = x.id and mf.usuario_id = p_usuario) loop
    foreach c in array f.codigos loop
      if not public.pode_liberar(p_estab, c) then raise exception 'Você não pode dar a função % (ela tem apps que você não usa).', f.nome; end if;
    end loop;
  end loop;

  delete from public.membro_funcoes where estabelecimento_id = p_estab and usuario_id = p_usuario and not (funcao_id = any (p_funcoes));
  insert into public.membro_funcoes (estabelecimento_id, usuario_id, funcao_id)
  select p_estab, p_usuario, x from unnest(p_funcoes) x on conflict do nothing;

  if p_extras is not null then
    delete from public.acessos a
     where a.estabelecimento_id = p_estab and a.usuario_id = p_usuario
       and not (a.codigo = any (p_extras)) and public.pode_liberar(p_estab, a.codigo);
    foreach c in array p_extras loop
      if not public.pode_liberar(p_estab, c) then
        if exists (select 1 from public.acessos where estabelecimento_id = p_estab and usuario_id = p_usuario and codigo = c) then continue; end if;
        raise exception 'Você não pode liberar o aplicativo %.', c;
      end if;
      insert into public.acessos (estabelecimento_id, usuario_id, codigo, concedido_por)
      values (p_estab, p_usuario, c, auth.uid()) on conflict do nothing;
    end loop;
  end if;

  delete from public.acessos_retirados where estabelecimento_id = p_estab and usuario_id = p_usuario;
  insert into public.acessos_retirados (estabelecimento_id, usuario_id, codigo)
  select distinct p_estab, p_usuario, x from unnest(coalesce(p_retirados, '{}')) x where x not like 'A%'
  on conflict do nothing;

  update public.membros
     set papel = case when v_ger then 'gestor' else 'equipe' end,
         cargo = (select string_agg(nome, ', ' order by case nivel when 'gerente' then 0 when 'lider' then 1 else 2 end, ordem)
                    from public.funcoes where id = any (p_funcoes)),
         ativo = coalesce(p_ativo, true)
   where estabelecimento_id = p_estab and usuario_id = p_usuario;

  update public.solicitacoes_acesso set situacao = 'aprovada', decidido_por = auth.uid(), decidido_em = now()
   where estabelecimento_id = p_estab and usuario_id = p_usuario and situacao = 'pendente' and public.tem_codigo(p_estab, p_usuario, codigo);
end $$;

-- O que eu posso fazer aqui (para o Business e o Job montarem as telas).
create or replace function public.meus_acessos(p_estab uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  with m as (select * from public.membros where estabelecimento_id = p_estab and usuario_id = auth.uid() and ativo),
  fs as (select f.* from public.membro_funcoes mf join public.funcoes f on f.id = mf.funcao_id
          where mf.estabelecimento_id = p_estab and mf.usuario_id = auth.uid() and f.ativa),
  cods as (
    select a.codigo from public.acessos a where a.estabelecimento_id = p_estab and a.usuario_id = auth.uid()
    union select unnest(fs.codigos) from fs
  )
  select jsonb_build_object(
    'papel', (select papel from m),
    'funcoes', coalesce((select jsonb_agg(jsonb_build_object('id', id, 'nome', nome, 'nivel', nivel, 'setor', setor) order by ordem) from fs), '[]'),
    'codigos', coalesce((select jsonb_agg(distinct c.codigo) from cods c
                          where exists (select 1 from m)
                            and not exists (select 1 from public.acessos_retirados r where r.estabelecimento_id = p_estab and r.usuario_id = auth.uid() and r.codigo = c.codigo)), '[]'),
    'acoes', coalesce((select jsonb_agg(a) from unnest(public.acoes_validas()) a where public.pode_acao(p_estab, a)), '[]'),
    'setores', to_jsonb(public.setores_preparo(p_estab)),
    'cancelar_setores', coalesce((select jsonb_agg(x) from unnest(array['cozinha', 'bar']) x where public.pode_acao(p_estab, 'cancelar_item', x)), '[]'),
    'suporte', public.suporte_ativo(p_estab) and public.papel_em(p_estab) is null,
    'desconto_max', public.desconto_maximo(p_estab)
  );
$$;

-- ============================================================
-- Desconto dado pela equipe
-- ============================================================
create or replace function public.dar_desconto(p_comanda uuid, p_valor numeric, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
declare c public.comandas; v_sub numeric; v_ja numeric; v_max numeric;
begin
  select * into c from public.comandas where id = p_comanda for update;
  if not found or c.situacao <> 'aberta' then raise exception 'Comanda não encontrada ou já fechada.'; end if;
  if not public.pode_usar(c.estabelecimento_id, 'T7001') then raise exception 'Sem acesso às comandas.'; end if;
  if not public.pode_acao(c.estabelecimento_id, 'desconto') then raise exception 'Sua função não dá desconto: peça autorização.'; end if;
  if p_valor is null or p_valor <= 0 then raise exception 'Informe o valor do desconto.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo do desconto.'; end if;
  select t.subtotal into v_sub from public.totais_calculo(c.id, null) t;
  select coalesce(sum(valor), 0) into v_ja from public.comanda_descontos where comanda_id = c.id and tipo = 'manual';
  v_max := round(coalesce(v_sub, 0) * public.desconto_maximo(c.estabelecimento_id) / 100, 2);
  if v_ja + p_valor > v_max + 0.009 then
    raise exception 'Seu limite de desconto nesta conta é R$ % (% do consumo). Peça autorização para um valor maior.',
      replace(to_char(greatest(v_max - v_ja, 0), 'FM999990.00'), '.', ','), rtrim(rtrim(to_char(public.desconto_maximo(c.estabelecimento_id), 'FM990.00'), '0'), '.') || '%';
  end if;
  insert into public.comanda_descontos (comanda_id, usuario_id, titulo, valor, tipo, motivo)
  values (c.id, auth.uid(), 'Desconto da casa', round(p_valor, 2), 'manual', btrim(p_motivo));
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'desconto', auth.uid(), 'R$ ' || replace(to_char(round(p_valor, 2), 'FM999990.00'), '.', ',') || ' · ' || btrim(p_motivo));
end $$;

create or replace function public.remover_desconto(p_desconto uuid)
returns void language plpgsql security definer set search_path = public as $$
declare d public.comanda_descontos; c public.comandas;
begin
  select * into d from public.comanda_descontos where id = p_desconto;
  if not found or d.tipo <> 'manual' then raise exception 'Desconto não encontrado.'; end if;
  select * into c from public.comandas where id = d.comanda_id;
  if c.situacao <> 'aberta' then raise exception 'A comanda já foi fechada.'; end if;
  if not public.pode_acao(c.estabelecimento_id, 'desconto') then raise exception 'Sua função não mexe em descontos.'; end if;
  delete from public.comanda_descontos where id = d.id;
  insert into public.pedido_eventos (estabelecimento_id, comanda_id, acao, usuario_id, detalhe)
  values (c.estabelecimento_id, c.id, 'desconto_removido', auth.uid(), 'R$ ' || replace(to_char(d.valor, 'FM999990.00'), '.', ','));
end $$;

-- ============================================================
-- Pedidos de autorização
-- ============================================================
create table if not exists public.autorizacoes (
  id uuid primary key default gen_random_uuid(),
  estabelecimento_id uuid not null references public.estabelecimentos(id) on delete cascade,
  operacao text not null check (operacao in ('estornar_item', 'cancelar_pagamento', 'reabrir_comanda', 'desconto', 'tirar_servico', 'fechar_em_aberto', 'assumir_comanda')),
  acao text not null,
  setor text,
  comanda_id uuid references public.comandas(id) on delete cascade,
  alvo_id uuid not null,
  valor numeric(10,2),
  motivo text not null check (length(btrim(motivo)) between 2 and 300),
  resumo text not null,
  situacao text not null default 'pendente' check (situacao in ('pendente', 'aprovada', 'recusada', 'cancelada', 'expirada')),
  pedida_por uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pedida_em timestamptz not null default now(),
  decidida_por uuid references auth.users(id) on delete set null,
  decidida_em timestamptz,
  resposta text
);
create index if not exists autorizacoes_estab_idx on public.autorizacoes (estabelecimento_id, situacao, pedida_em desc);
alter table public.autorizacoes enable row level security;
drop policy if exists autorizacoes_ler on public.autorizacoes;
create policy autorizacoes_ler on public.autorizacoes for select to authenticated
  using (pedida_por = auth.uid() or public.pode_supervisionar(estabelecimento_id));

create or replace function public.rotulo_comanda(p_comanda uuid)
returns text language sql stable security definer set search_path = public as $$
  select coalesce('Mesa ' || m.numero, c.nome, 'Comanda') from public.comandas c left join public.mesas m on m.id = c.mesa_id where c.id = p_comanda;
$$;

create or replace function public.pedir_autorizacao(p_operacao text, p_alvo uuid, p_valor numeric, p_motivo text)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_estab uuid; v_comanda uuid; v_acao text; v_setor text; v_resumo text; v_id uuid; r record;
begin
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Explique o motivo para quem vai autorizar.'; end if;
  case p_operacao
    when 'estornar_item' then
      select pi.estabelecimento_id, p.comanda_id, pi.destino, pi.quantidade || '× ' || pi.nome as nome into r
        from public.pedido_itens pi join public.pedidos p on p.id = pi.pedido_id where pi.id = p_alvo;
      if not found then raise exception 'Item não encontrado.'; end if;
      v_estab := r.estabelecimento_id; v_comanda := r.comanda_id; v_acao := 'estornar'; v_resumo := 'Estornar ' || r.nome;
    when 'cancelar_pagamento' then
      select estabelecimento_id, comanda_id, valor into r from public.pagamentos where id = p_alvo;
      if not found then raise exception 'Pagamento não encontrado.'; end if;
      v_estab := r.estabelecimento_id; v_comanda := r.comanda_id; v_acao := 'estornar';
      v_resumo := 'Cancelar pagamento de R$ ' || replace(to_char(r.valor, 'FM999990.00'), '.', ',');
    when 'reabrir_comanda', 'desconto', 'tirar_servico', 'fechar_em_aberto', 'assumir_comanda' then
      select estabelecimento_id, id, responsavel_id into r from public.comandas where id = p_alvo;
      if not found then raise exception 'Comanda não encontrada.'; end if;
      v_estab := r.estabelecimento_id; v_comanda := r.id;
      v_acao := case p_operacao when 'reabrir_comanda' then 'reabrir_comanda' when 'fechar_em_aberto' then 'fechar_em_aberto'
                                when 'assumir_comanda' then 'transferir' else 'desconto' end;
      v_resumo := case p_operacao
        when 'reabrir_comanda' then 'Reabrir a comanda'
        when 'desconto' then 'Desconto de R$ ' || replace(to_char(coalesce(p_valor, 0), 'FM999990.00'), '.', ',')
        when 'tirar_servico' then 'Tirar a taxa de serviço'
        when 'fechar_em_aberto' then 'Fechar a conta com valor em aberto'
        else 'Passar a mesa para quem pediu' || coalesce(' (hoje com ' || (select split_part(nome, ' ', 1) from public.perfis where id = r.responsavel_id) || ')', '') end;
      if p_operacao = 'desconto' and coalesce(p_valor, 0) <= 0 then raise exception 'Informe o valor do desconto.'; end if;
    else raise exception 'Pedido inválido.';
  end case;
  if not public.equipe_do_salao(v_estab) then raise exception 'Sem acesso a esta operação.'; end if;
  v_resumo := v_resumo || coalesce(' · ' || public.rotulo_comanda(v_comanda), '');

  select id into v_id from public.autorizacoes
   where operacao = p_operacao and alvo_id = p_alvo and pedida_por = auth.uid() and situacao = 'pendente' and pedida_em > now() - interval '30 minutes';
  if v_id is not null then
    -- Mesmo pedido ainda aberto: atualiza o valor e o motivo em vez de criar outro.
    update public.autorizacoes set valor = case when p_operacao = 'desconto' then round(p_valor, 2) end, motivo = btrim(p_motivo),
           resumo = v_resumo, pedida_em = now()
     where id = v_id;
    return v_id;
  end if;
  insert into public.autorizacoes (estabelecimento_id, operacao, acao, setor, comanda_id, alvo_id, valor, motivo, resumo)
  values (v_estab, p_operacao, v_acao, v_setor, v_comanda, p_alvo, case when p_operacao = 'desconto' then round(p_valor, 2) end, btrim(p_motivo), v_resumo)
  returning id into v_id;
  return v_id;
end $$;

create or replace function public.decidir_autorizacao(p_id uuid, p_aprovar boolean, p_resposta text default null)
returns void language plpgsql security definer set search_path = public as $$
declare a public.autorizacoes;
begin
  select * into a from public.autorizacoes where id = p_id for update;
  if not found then raise exception 'Pedido não encontrado.'; end if;
  if a.situacao <> 'pendente' then raise exception 'Este pedido já foi respondido.'; end if;
  if a.pedida_em < now() - interval '30 minutes' then
    update public.autorizacoes set situacao = 'expirada' where id = a.id;
    raise exception 'Este pedido passou de 30 minutos e expirou. Peça de novo se ainda precisar.';
  end if;
  if a.pedida_por = auth.uid() then raise exception 'Outra pessoa precisa responder o seu pedido.'; end if;
  if not public.pode_acao(a.estabelecimento_id, a.acao, a.setor) then raise exception 'Sua função não autoriza este pedido.'; end if;
  if p_aprovar then
    case a.operacao
      when 'estornar_item' then perform public.estornar_item(a.alvo_id, a.motivo);
      when 'cancelar_pagamento' then perform public.cancelar_pagamento(a.alvo_id, a.motivo);
      when 'reabrir_comanda' then perform public.reabrir_comanda(a.alvo_id, a.motivo);
      when 'desconto' then perform public.dar_desconto(a.alvo_id, a.valor, a.motivo);
      when 'tirar_servico' then perform public.tirar_servico(a.alvo_id, true);
      when 'fechar_em_aberto' then perform public.fechar_comanda(a.alvo_id, false, true);
      when 'assumir_comanda' then perform public.assumir_comanda(a.alvo_id, a.pedida_por);
    end case;
  end if;
  update public.autorizacoes set situacao = case when p_aprovar then 'aprovada' else 'recusada' end,
         decidida_por = auth.uid(), decidida_em = now(), resposta = nullif(btrim(coalesce(p_resposta, '')), '')
   where id = a.id;
end $$;

create or replace function public.cancelar_autorizacao(p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  update public.autorizacoes set situacao = 'cancelada' where id = p_id and pedida_por = auth.uid() and situacao = 'pendente';
  if not found then raise exception 'Pedido não encontrado ou já respondido.'; end if;
end $$;

-- Pedidos que eu posso responder e os meus das últimas 12 horas.
create or replace function public.autorizacoes_do_estab(p_estab uuid)
returns table (id uuid, operacao text, resumo text, motivo text, valor numeric, situacao text, comanda_id uuid,
               pedida_por text, pedida_em timestamptz, decidida_por text, resposta text, minha boolean, posso_decidir boolean)
language plpgsql security definer set search_path = public as $$
begin
  if not public.equipe_do_salao(p_estab) then return; end if;
  update public.autorizacoes x set situacao = 'expirada'
   where x.estabelecimento_id = p_estab and x.situacao = 'pendente' and x.pedida_em < now() - interval '30 minutes';
  return query
  select a.id, a.operacao, a.resumo, a.motivo, a.valor, a.situacao, a.comanda_id,
         coalesce(pp.nome, ''), a.pedida_em, pd.nome, a.resposta, a.pedida_por = auth.uid(),
         a.situacao = 'pendente' and a.pedida_por <> auth.uid() and public.pode_acao(p_estab, a.acao, a.setor)
    from public.autorizacoes a
    left join public.perfis pp on pp.id = a.pedida_por
    left join public.perfis pd on pd.id = a.decidida_por
   where a.estabelecimento_id = p_estab
     and ((a.pedida_por = auth.uid() and a.pedida_em > now() - interval '12 hours')
          or (a.situacao = 'pendente' and a.pedida_por <> auth.uid() and public.pode_acao(p_estab, a.acao, a.setor)))
   order by (a.situacao = 'pendente') desc, a.pedida_em desc
   limit 60;
end $$;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'autorizacoes') then
    alter publication supabase_realtime add table public.autorizacoes;
  end if;
end $$;

-- ============================================================
-- Permissões das funções
-- ============================================================
revoke execute on function public.tem_codigo(uuid, uuid, text), public.rotulo_comanda(uuid) from public, anon;
grant execute on function public.tem_codigo(uuid, uuid, text), public.rotulo_comanda(uuid) to authenticated;
revoke execute on function public.pode_acao(uuid, text, text), public.desconto_maximo(uuid), public.setores_preparo(uuid),
  public.equipe(uuid), public.funcoes_do_estab(uuid), public.salvar_funcao(uuid, uuid, jsonb), public.apagar_funcao(uuid),
  public.restaurar_funcoes(uuid), public.definir_membro(uuid, uuid, uuid[], text[], text[], boolean), public.meus_acessos(uuid),
  public.dar_desconto(uuid, numeric, text), public.remover_desconto(uuid), public.pedir_autorizacao(text, uuid, numeric, text),
  public.decidir_autorizacao(uuid, boolean, text), public.cancelar_autorizacao(uuid), public.autorizacoes_do_estab(uuid) from public, anon;
grant execute on function public.pode_acao(uuid, text, text), public.desconto_maximo(uuid), public.setores_preparo(uuid),
  public.equipe(uuid), public.funcoes_do_estab(uuid), public.salvar_funcao(uuid, uuid, jsonb), public.apagar_funcao(uuid),
  public.restaurar_funcoes(uuid), public.definir_membro(uuid, uuid, uuid[], text[], text[], boolean), public.meus_acessos(uuid),
  public.dar_desconto(uuid, numeric, text), public.remover_desconto(uuid), public.pedir_autorizacao(text, uuid, numeric, text),
  public.decidir_autorizacao(uuid, boolean, text), public.cancelar_autorizacao(uuid), public.autorizacoes_do_estab(uuid) to authenticated;
grant select on public.funcoes, public.membro_funcoes, public.acessos_retirados, public.autorizacoes to authenticated;

-- ============================================================
-- Cada nível da equipe RoVibes só altera o que é da área dele
-- ============================================================
create or replace function public.proteger_situacao()
returns trigger language plpgsql as $$
begin
  if new.situacao is distinct from old.situacao and not public.eh_equipe('comercial') then
    raise exception 'A situação do estabelecimento é decidida pela administração.';
  end if;
  return new;
end $$;

create or replace function public.decidir_estabelecimento(p_estab uuid, p_situacao text, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('comercial') then raise exception 'Somente a administração do RoVibes pode decidir.'; end if;
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
  update public.perfis set suspenso = false where id = p_pessoa;
end $$;


create or replace function public.suspender_evento_pessoa(p_evento uuid, p_suspender boolean, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('moderacao') then raise exception 'Só a equipe RoVibes.'; end if;
  update public.eventos_pessoa set suspenso = p_suspender, motivo_suspensao = case when p_suspender then nullif(btrim(coalesce(p_motivo, '')), '') end where id = p_evento;
  if p_suspender then
    update public.compras_anfitriao set situacao = 'reembolsar' where evento_id = p_evento and situacao = 'pago' and total > 0;
    update public.ingressos_anfitriao set situacao = 'cancelado' where evento_id = p_evento and situacao = 'valido';
  end if;
end $$;


create or replace function public.marcar_reembolso_anfitriao(p_evento uuid)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_equipe('moderacao') then raise exception 'Só a equipe RoVibes.'; end if;
  update public.compras_anfitriao set situacao = 'reembolsado' where evento_id = p_evento and situacao = 'reembolsar';
  get diagnostics n = row_count;
  return n;
end $$;


create or replace function public.salvar_biblioteca(p_id uuid, p_dados jsonb, p_aprovar boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_ean text := nullif(regexp_replace(coalesce(p_dados->>'ean', ''), '\D', '', 'g'), '');
        v_ind boolean := coalesce((p_dados->>'industrializado')::boolean, true);
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  if coalesce(btrim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome.'; end if;
  if v_ind and v_ean is null then raise exception 'Produto industrializado precisa do EAN.'; end if;
  if v_ean is not null and exists (select 1 from public.biblioteca_produtos where ean = v_ean and situacao in ('aprovado', 'pendente') and id is distinct from p_id) then
    raise exception 'Já existe outro produto com o EAN %. Use "Juntar".', v_ean;
  end if;
  if v_id is null then
    insert into public.biblioteca_produtos (ean, nome, situacao, industrializado) values (v_ean, btrim(p_dados->>'nome'), 'aprovado', v_ean is not null) returning id into v_id;
  end if;
  update public.biblioteca_produtos set
    ean = v_ean, nome = btrim(p_dados->>'nome'), descricao = nullif(btrim(p_dados->>'descricao'), ''), foto_url = nullif(p_dados->>'foto_url', ''),
    marca = nullif(btrim(p_dados->>'marca'), ''), grupo = nullif(btrim(p_dados->>'grupo'), ''), categoria = nullif(btrim(p_dados->>'categoria'), ''),
    unidade = coalesce(nullif(p_dados->>'unidade', ''), 'un'), embalagem_nome = nullif(btrim(p_dados->>'embalagem_nome'), ''),
    embalagem_fator = nullif(p_dados->>'embalagem_fator', '')::numeric, industrializado = v_ind and v_ean is not null,
    situacao = case when p_aprovar or p_id is null then 'aprovado' else situacao end,
    aprovado_por = case when p_aprovar or p_id is null then auth.uid() else aprovado_por end,
    aprovado_em = case when p_aprovar or p_id is null then now() else aprovado_em end,
    motivo = case when p_aprovar then null else motivo end
   where id = v_id;
  return v_id;
end $$;


create or replace function public.desativar_biblioteca(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b public.biblioteca_produtos;
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  select * into b from public.biblioteca_produtos where id = p_id;
  if p_ativo and b.ean is not null and exists (select 1 from public.biblioteca_produtos o where o.ean = b.ean and o.id <> b.id and o.situacao in ('aprovado', 'pendente')) then
    raise exception 'Já existe outro produto ativo com o EAN %.', b.ean;
  end if;
  update public.biblioteca_produtos set situacao = case when p_ativo then 'aprovado' else 'inativo' end,
         juntado_em = case when p_ativo then null else juntado_em end, atualizado_em = now() where id = p_id;
end $$;


create or replace function public.importar_biblioteca(p_linhas jsonb)
returns table (gravados int, erros text[])
language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0; e text[] := '{}'; i int := 0; v_id uuid; v_ean text;
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  for l in select * from jsonb_array_elements(p_linhas) loop
    i := i + 1;
    begin
      v_ean := nullif(regexp_replace(coalesce(l->>'ean', ''), '\D', '', 'g'), '');
      select id into v_id from public.biblioteca_produtos where v_ean is not null and ean = v_ean and situacao in ('aprovado', 'pendente') limit 1;
      perform public.salvar_biblioteca(v_id, l || jsonb_build_object('industrializado', v_ean is not null), true);
      n := n + 1;
    exception when others then
      e := e || ('Linha ' || (i + 1) || ' (' || coalesce(l->>'nome', 'sem nome') || '): ' || sqlerrm);
    end;
  end loop;
  return query select n, e;
end $$;


create or replace function public.juntar_biblioteca(p_origem uuid, p_destino uuid)
returns int language plpgsql security definer set search_path = public as $$
declare d public.biblioteca_produtos; r record; v_dest uuid; n int := 0;
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  if p_origem = p_destino then raise exception 'Escolha outro produto.'; end if;
  select * into d from public.biblioteca_produtos where id = p_destino and situacao in ('aprovado', 'pendente');
  if not found then raise exception 'Produto de destino não encontrado.'; end if;
  perform set_config('rovibes.sincronizando', '1', true);
  for r in select * from public.estoque_produtos where biblioteca_id = p_origem loop
    select id into v_dest from public.estoque_produtos where estabelecimento_id = r.estabelecimento_id and biblioteca_id = p_destino;
    if v_dest is null then
      update public.estoque_produtos set biblioteca_id = p_destino, nome = d.nome, ean = d.ean, marca = d.marca, grupo = d.grupo,
             categoria = d.categoria, foto_url = d.foto_url, descricao = d.descricao where id = r.id;
    else
      -- O estabelecimento tinha os dois: soma os saldos e move histórico, receitas e cardápio para um só.
      insert into public.estoque_saldos (produto_id, local_id, quantidade)
      select v_dest, local_id, quantidade from public.estoque_saldos where produto_id = r.id
      on conflict (produto_id, local_id) do update set quantidade = estoque_saldos.quantidade + excluded.quantidade;
      update public.estoque_movimentos set produto_id = v_dest where produto_id = r.id;
      insert into public.ficha_tecnica (item_id, produto_id, quantidade)
      select item_id, v_dest, quantidade from public.ficha_tecnica where produto_id = r.id on conflict (item_id, produto_id) do nothing;
      update public.cardapio_itens set produto_id = v_dest where produto_id = r.id;
      delete from public.estoque_produtos where id = r.id;
      update public.estoque_produtos set saldo = (select coalesce(sum(quantidade), 0) from public.estoque_saldos where produto_id = v_dest) where id = v_dest;
    end if;
    n := n + 1;
  end loop;
  perform set_config('rovibes.sincronizando', '', true);
  update public.biblioteca_produtos set situacao = 'inativo', juntado_em = p_destino, motivo = 'Juntado com outro cadastro', atualizado_em = now() where id = p_origem;
  return n;
end $$;


create or replace function public.recusar_biblioteca(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo para o estabelecimento.'; end if;
  update public.biblioteca_produtos set situacao = 'recusado', motivo = btrim(p_motivo), atualizado_em = now() where id = p_id;
  -- O estoque de quem enviou continua com o produto (agora sem vínculo com a biblioteca).
  update public.estoque_produtos set biblioteca_id = null where biblioteca_id = p_id;
end $$;


create or replace function public.excluir_biblioteca(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare n int; v_foto text;
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  select count(*) into n from public.estoque_produtos where biblioteca_id = p_id;
  if n > 0 then raise exception 'EM_USO:%', n; end if;
  update public.biblioteca_produtos set juntado_em = null where juntado_em = p_id;
  delete from public.biblioteca_produtos where id = p_id returning foto_url into v_foto;
  -- Devolve a foto para a tela apagar do armazenamento, se nenhum outro produto usa a mesma.
  if v_foto is not null and exists (select 1 from public.biblioteca_produtos where foto_url = v_foto) then v_foto := null; end if;
  return v_foto;
end $$;


create or replace function public.biblioteca_em_lote(p_ids uuid[], p_acao text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  if p_acao = 'aprovar' then
    update public.biblioteca_produtos set situacao = 'aprovado', motivo = null, aprovado_por = auth.uid(), aprovado_em = now(), atualizado_em = now()
     where id = any(p_ids) and situacao = 'pendente';
  elsif p_acao = 'desativar' then
    update public.biblioteca_produtos set situacao = 'inativo', atualizado_em = now() where id = any(p_ids) and situacao = 'aprovado';
  elsif p_acao = 'reativar' then
    update public.biblioteca_produtos b set situacao = 'aprovado', juntado_em = null, atualizado_em = now()
     where b.id = any(p_ids) and b.situacao = 'inativo'
       and (b.ean is null or not exists (select 1 from public.biblioteca_produtos o where o.ean = b.ean and o.id <> b.id and o.situacao in ('aprovado', 'pendente')));
  else
    raise exception 'Ação desconhecida.';
  end if;
  get diagnostics n = row_count;
  return n;
end $$;


create or replace function public.proteger_campos_biblioteca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.biblioteca_id is not null and coalesce(current_setting('rovibes.sincronizando', true), '') <> '1' then
    new.nome := old.nome; new.ean := old.ean; new.marca := old.marca; new.grupo := old.grupo; new.categoria := old.categoria;
    new.foto_url := old.foto_url; new.descricao := old.descricao;
    if not public.eh_equipe('catalogo') then new.biblioteca_id := old.biblioteca_id; end if;
  end if;
  return new;
end $$;

create or replace function public.salvar_imagem_gosto(p_gosto smallint, p_url text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_equipe('catalogo') then raise exception 'Só a equipe RoVibes pode mudar as fotos.'; end if;
  update public.gostos set imagem_url = nullif(btrim(coalesce(p_url, '')), '') where id = p_gosto;
end $$;

create or replace function public.salvar_regras_eventos(p jsonb)
returns void language plpgsql security definer set search_path = public as $$
declare v_termos text;
begin
  if not public.eh_equipe('financeiro') then raise exception 'Só a equipe RoVibes.'; end if;
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
  if not public.eh_equipe('financeiro') then raise exception 'Só a equipe RoVibes.'; end if;
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


create or replace function public.definir_entrega_pedidos(p_estab uuid, p_modo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.pode_usar(p_estab, 'T7004') or public.suporte_ativo(p_estab)) then
    raise exception 'Só o dono, a gestão ou a supervisão definem como os pedidos chegam.';
  end if;
  if p_modo not in ('mesa', 'retirada', 'cliente') then raise exception 'Opção inválida.'; end if;
  update public.estabelecimentos set entrega_pedidos = p_modo where id = p_estab;
end $$;


create or replace function public.definir_atendimento(p_estab uuid, p_tem_mesas boolean, p_exige_qr boolean, p_pagamento text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not (public.eh_proprietario(p_estab) or coalesce(public.papel_em(p_estab) = 'gestor', false) or public.pode_usar(p_estab, 'T7004') or public.suporte_ativo(p_estab)) then
    raise exception 'Só o dono, a gestão ou a supervisão definem o atendimento.';
  end if;
  if p_pagamento not in ('comanda', 'prepago') then raise exception 'Forma de pagamento inválida.'; end if;
  update public.estabelecimentos
     set tem_mesas = coalesce(p_tem_mesas, true),
         exige_qr_mesa = coalesce(p_exige_qr, true),
         pagamento_mesa = p_pagamento,
         -- Sem mesas, o pedido é sempre retirado no balcão.
         entrega_pedidos = case when coalesce(p_tem_mesas, true) then entrega_pedidos else 'retirada' end
   where id = p_estab;
end $$;


drop policy if exists categorias_admin on public.categorias;
create policy categorias_admin on public.categorias for all to authenticated using (public.eh_equipe('catalogo')) with check (public.eh_equipe('catalogo'));
drop policy if exists vibes_admin on public.vibes;
create policy vibes_admin on public.vibes for all to authenticated using (public.eh_equipe('catalogo')) with check (public.eh_equipe('catalogo'));
drop policy if exists biblioteca_admin on public.biblioteca_produtos;
create policy biblioteca_admin on public.biblioteca_produtos for all to authenticated using (public.eh_equipe('catalogo')) with check (public.eh_equipe('catalogo'));
drop policy if exists gostos_admin on public.gostos;
create policy gostos_admin on public.gostos for all to authenticated using (public.eh_equipe('catalogo')) with check (public.eh_equipe('catalogo'));
drop policy if exists musicas_admin on public.musicas;
create policy musicas_admin on public.musicas for all to authenticated using (public.eh_equipe('catalogo')) with check (public.eh_equipe('catalogo'));
-- Arquivos (só onde o armazenamento existe).
do $$ begin
  execute $q$drop policy if exists musicas_arquivos_admin on storage.objects$q$;
  execute $q$create policy musicas_arquivos_admin on storage.objects for all to authenticated
  using (bucket_id = 'musicas' and public.eh_equipe('catalogo')) with check (bucket_id = 'musicas' and public.eh_equipe('catalogo'))$q$;
  execute $q$drop policy if exists gostos_arquivos_admin on storage.objects$q$;
  execute $q$create policy gostos_arquivos_admin on storage.objects for all to authenticated
  using (bucket_id = 'gostos' and public.eh_equipe('catalogo')) with check (bucket_id = 'gostos' and public.eh_equipe('catalogo'))$q$;
  execute $q$drop policy if exists "biblioteca enviar" on storage.objects$q$;
  execute $q$create policy "biblioteca enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'biblioteca' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_equipe('catalogo')))$q$;
  execute $q$drop policy if exists "biblioteca apagar" on storage.objects$q$;
  execute $q$create policy "biblioteca apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'biblioteca' and public.eh_equipe('catalogo'))$q$;
exception when undefined_function or undefined_table or invalid_schema_name then null; end $$;

select 'Atualização 039 aplicada: funções da equipe, ações sensíveis, autorizações e níveis da equipe RoVibes.' as resultado;
