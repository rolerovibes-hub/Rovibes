-- 056 · Reestruturação (parte 1): resumo do momento para Operar/Acompanhar e registro de uso das telas.

-- "22 min", "3 h"
create or replace function public.tempo_curto(p interval)
returns text language sql immutable set search_path = public as $$
  select case when extract(epoch from p) < 7200 then floor(extract(epoch from p) / 60)::int || ' min'
              else floor(extract(epoch from p) / 3600)::int || ' h' end;
$$;

-- ============================================================
-- Resumo do momento: só traz o que a pessoa pode usar.
-- ============================================================
create or replace function public.painel_agora(p_estab uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_salao boolean := public.pode_usar(p_estab, 'T7001') or public.pode_usar(p_estab, 'T7002') or public.pode_usar(p_estab, 'T7004') or public.pode_usar(p_estab, 'T7005');
  v_fila boolean := public.pode_usar(p_estab, 'T7002') or public.pode_usar(p_estab, 'T7003') or public.pode_usar(p_estab, 'T7004');
  v_caixa boolean := public.pode_usar(p_estab, 'T7005') or public.pode_usar(p_estab, 'T7004');
  v_estoque boolean := public.pode_usar(p_estab, 'T4004') or public.pode_usar(p_estab, 'G4002');
  v_hoje timestamptz := date_trunc('day', now() at time zone 'America/Sao_Paulo') at time zone 'America/Sao_Paulo';
  r jsonb := '{}'::jsonb;
  v_atencao jsonb := '[]'::jsonb;
begin
  if not (v_salao or v_fila or v_caixa or v_estoque or public.pode_usar(p_estab, 'T5002')) then
    return r;
  end if;

  if v_salao then
    r := r || jsonb_build_object(
      'mesas_total', (select count(*) from mesas where estabelecimento_id = p_estab and ativa),
      'mesas_ocupadas', (select count(distinct c.mesa_id) from comandas c where c.estabelecimento_id = p_estab and c.situacao = 'aberta' and c.mesa_id is not null),
      'comandas_abertas', (select count(*) from comandas where estabelecimento_id = p_estab and situacao = 'aberta'));
  end if;

  if v_fila then
    -- Situação de cada item (o pedido anda por item: recebido → preparo → pronto → saiu).
    r := r || jsonb_build_object(
      'pedidos_fila', (select count(distinct i.pedido_id) from pedido_itens i join pedidos p on p.id = i.pedido_id
                        where i.estabelecimento_id = p_estab and i.situacao in ('aguardando', 'recebido', 'preparo') and p.criado_em > now() - interval '12 hours'),
      'pedidos_prontos', (select count(distinct i.pedido_id) from pedido_itens i join pedidos p on p.id = i.pedido_id
                           where i.estabelecimento_id = p_estab and i.situacao = 'pronto' and p.criado_em > now() - interval '12 hours'),
      'pedidos_atrasados', (select count(distinct i.pedido_id) from pedido_itens i join pedidos p on p.id = i.pedido_id
                             where i.estabelecimento_id = p_estab and i.situacao in ('recebido', 'preparo')
                               and p.criado_em < now() - interval '20 minutes' and p.criado_em > now() - interval '12 hours'));
    v_atencao := v_atencao || coalesce((
      select jsonb_agg(jsonb_build_object('nivel', 'alto', 'titulo', 'Pedido ' || x.numero || ' atrasado',
               'detalhe', coalesce('Mesa ' || m.numero, c.nome, 'Comanda') || ' · ' || public.tempo_curto(now() - x.criado_em) || ' · ' || initcap(x.setor),
               'codigo', 'T7002', 'acao', 'Ver pedidos'))
        from (select p.* from pedidos p
               where p.estabelecimento_id = p_estab and p.criado_em < now() - interval '20 minutes' and p.criado_em > now() - interval '12 hours'
                 and exists (select 1 from pedido_itens i where i.pedido_id = p.id and i.situacao in ('recebido', 'preparo'))
               order by p.criado_em limit 3) x
        join comandas c on c.id = x.comanda_id left join mesas m on m.id = c.mesa_id), '[]'::jsonb);
    v_atencao := v_atencao || coalesce((
      select jsonb_agg(jsonb_build_object('nivel', 'medio', 'titulo', 'Ocorrência aberta',
               'detalhe', replace(o.tipo, '_', ' ') || coalesce(' · ' || o.descricao, ''), 'codigo', 'T7004', 'acao', 'Resolver'))
        from (select * from ocorrencias where estabelecimento_id = p_estab and situacao = 'aberta' order by aberta_em limit 3) o), '[]'::jsonb);
  end if;

  if v_caixa then
    r := r || jsonb_build_object(
      'vendido_hoje', (select coalesce(sum(i.preco * i.quantidade), 0) from pedido_itens i join pedidos p on p.id = i.pedido_id
                        where i.estabelecimento_id = p_estab and p.criado_em >= v_hoje and i.situacao <> 'cancelado'),
      'comandas_fechadas_hoje', (select count(*) from comandas where estabelecimento_id = p_estab and situacao = 'fechada' and fechada_em >= v_hoje));
  end if;

  if v_estoque then
    r := r || jsonb_build_object(
      'estoque_criticos', (select count(*) from estoque_produtos where estabelecimento_id = p_estab and ativo and minimo is not null and saldo <= minimo),
      'estoque_ultimo', (select max(criado_em) from estoque_movimentos where estabelecimento_id = p_estab));
    v_atencao := v_atencao || coalesce((
      select jsonb_agg(jsonb_build_object('nivel', 'medio', 'titulo', e.nome || ' acabando',
               'detalhe', 'Restam ' || trim(to_char(e.saldo, 'FM999999990.###')) || ' ' || e.unidade || ' · mínimo ' || trim(to_char(e.minimo, 'FM999999990.###')),
               'codigo', 'G4002', 'acao', 'Ver estoque'))
        from (select * from estoque_produtos where estabelecimento_id = p_estab and ativo and minimo is not null and saldo <= minimo
               order by saldo / nullif(minimo, 0) nulls first limit 3) e), '[]'::jsonb);
  end if;

  r := r || jsonb_build_object('movimento',
    (select nivel from movimento_informado where estabelecimento_id = p_estab and informado_em > now() - interval '3 hours'));
  return r || jsonb_build_object('atencao', v_atencao);
end $$;

revoke execute on function public.painel_agora(uuid) from public, anon;
grant execute on function public.painel_agora(uuid) to authenticated;

-- ============================================================
-- Registro de uso das telas (instrumento de UX; sem dados de venda)
-- ============================================================
create table if not exists public.uso_telas (
  id bigint generated always as identity primary key,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  estabelecimento_id uuid references public.estabelecimentos(id) on delete cascade,
  codigo text not null check (length(codigo) between 2 and 40),
  origem text check (origem is null or length(origem) <= 40),
  aberto_em timestamptz not null default now()
);
create index if not exists uso_telas_codigo_idx on public.uso_telas (codigo, aberto_em desc);
create index if not exists uso_telas_estab_idx on public.uso_telas (estabelecimento_id, aberto_em desc);
alter table public.uso_telas enable row level security;
revoke all on public.uso_telas from anon, authenticated;

create or replace function public.registrar_uso(p_codigo text, p_estab uuid default null, p_origem text default null)
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_codigo is null then return; end if;
  -- Evita repetir a mesma tela em sequência (ex.: recarregar a página).
  if exists (select 1 from uso_telas where usuario_id = auth.uid() and codigo = p_codigo
               and estabelecimento_id is not distinct from p_estab and aberto_em > now() - interval '30 seconds') then
    return;
  end if;
  insert into uso_telas (usuario_id, estabelecimento_id, codigo, origem) values (auth.uid(), p_estab, left(p_codigo, 40), left(p_origem, 40));
end $$;

revoke execute on function public.registrar_uso(text, uuid, text) from public, anon;
grant execute on function public.registrar_uso(text, uuid, text) to authenticated;

notify pgrst, 'reload schema';

select 'Atualização 056 aplicada: Operar/Acompanhar e registro de uso das telas.' as resultado;
