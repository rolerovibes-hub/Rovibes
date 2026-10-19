-- RoVibes 022: Central da Biblioteca de produtos (equipe RoVibes).
-- Histórico de alterações, painel, lista com filtros, onde o produto é usado, ações em lote e exclusão protegida.
-- A foto da biblioteca também passa para os itens do cardápio ligados ao produto.
-- Requer a 021. Pode ser executado mais de uma vez.

-- ============================================================
-- Histórico de alterações
-- ============================================================
create table if not exists public.biblioteca_historico (
  id bigint generated always as identity primary key,
  biblioteca_id uuid not null,
  acao text not null,
  por uuid references auth.users(id) on delete set null,
  mudancas jsonb,
  em timestamptz not null default now()
);
create index if not exists biblioteca_historico_idx on public.biblioteca_historico (biblioteca_id, em desc);
alter table public.biblioteca_historico enable row level security;
drop policy if exists biblioteca_historico_ler on public.biblioteca_historico;
create policy biblioteca_historico_ler on public.biblioteca_historico for select to authenticated using (public.eh_admin());

create or replace function public.registrar_historico_biblioteca()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_antes jsonb; v_depois jsonb; v_mud jsonb := '{}'; k text; v_acao text;
begin
  if tg_op = 'INSERT' then
    insert into public.biblioteca_historico (biblioteca_id, acao, por, mudancas)
    values (new.id, case when new.situacao = 'pendente' then 'enviado' else 'criado' end, auth.uid(),
            jsonb_build_object('nome', jsonb_build_array(null, new.nome), 'ean', jsonb_build_array(null, new.ean)));
    return new;
  elsif tg_op = 'DELETE' then
    insert into public.biblioteca_historico (biblioteca_id, acao, por, mudancas)
    values (old.id, 'excluido', auth.uid(), jsonb_build_object('nome', jsonb_build_array(old.nome, null)));
    return old;
  end if;
  v_antes := to_jsonb(old) - 'atualizado_em' - 'aprovado_em' - 'aprovado_por';
  v_depois := to_jsonb(new) - 'atualizado_em' - 'aprovado_em' - 'aprovado_por';
  for k in select jsonb_object_keys(v_depois) loop
    if v_antes->k is distinct from v_depois->k then
      v_mud := v_mud || jsonb_build_object(k, jsonb_build_array(v_antes->k, v_depois->k));
    end if;
  end loop;
  if v_mud = '{}'::jsonb then return new; end if;
  v_acao := case
    when old.situacao <> new.situacao and new.situacao = 'aprovado' and old.situacao = 'inativo' then 'reativado'
    when old.situacao <> new.situacao and new.situacao = 'aprovado' then 'aprovado'
    when old.situacao <> new.situacao and new.situacao = 'recusado' then 'recusado'
    when old.situacao <> new.situacao and new.situacao = 'inativo' and new.juntado_em is not null then 'juntado'
    when old.situacao <> new.situacao and new.situacao = 'inativo' then 'desativado'
    when old.foto_url is distinct from new.foto_url and (v_mud - 'foto_url') = '{}'::jsonb then 'foto'
    else 'editado' end;
  insert into public.biblioteca_historico (biblioteca_id, acao, por, mudancas) values (new.id, v_acao, auth.uid(), v_mud);
  return new;
end $$;
drop trigger if exists biblioteca_historico_trg on public.biblioteca_produtos;
create trigger biblioteca_historico_trg after insert or update or delete on public.biblioteca_produtos
  for each row execute function public.registrar_historico_biblioteca();

-- ============================================================
-- Correção na biblioteca atualiza os estoques e a foto dos itens do cardápio ligados
-- (só itens sem foto própria ou com a foto antiga da biblioteca).
-- ============================================================
create or replace function public.sincronizar_biblioteca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('rovibes.sincronizando', '1', true);
  update public.estoque_produtos
     set nome = new.nome, ean = new.ean, marca = new.marca, grupo = new.grupo, categoria = new.categoria,
         foto_url = new.foto_url, descricao = new.descricao
   where biblioteca_id = new.id;
  if old.foto_url is distinct from new.foto_url then
    update public.cardapio_itens ci set foto_url = new.foto_url
     where ci.produto_id in (select id from public.estoque_produtos where biblioteca_id = new.id)
       and (ci.foto_url is null or ci.foto_url = old.foto_url);
  end if;
  perform set_config('rovibes.sincronizando', '', true);
  new.atualizado_em := now();
  return new;
end $$;

-- ============================================================
-- Painel (contadores)
-- ============================================================
create or replace function public.biblioteca_painel()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare r jsonb;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  select jsonb_build_object(
    'total', count(*) filter (where situacao in ('aprovado', 'pendente')),
    'aprovado', count(*) filter (where situacao = 'aprovado'),
    'pendente', count(*) filter (where situacao = 'pendente'),
    'recusado', count(*) filter (where situacao = 'recusado'),
    'inativo', count(*) filter (where situacao = 'inativo'),
    'sem_foto', count(*) filter (where situacao in ('aprovado', 'pendente') and foto_url is null),
    'sem_descricao', count(*) filter (where situacao in ('aprovado', 'pendente') and coalesce(btrim(descricao), '') = ''),
    'sem_categoria', count(*) filter (where situacao in ('aprovado', 'pendente') and coalesce(btrim(categoria), '') = ''),
    'duplicado', (select count(*) from public.biblioteca_produtos b
                   where b.situacao in ('aprovado', 'pendente')
                     and exists (select 1 from public.biblioteca_produtos o where o.id <> b.id and o.situacao in ('aprovado', 'pendente')
                                   and lower(regexp_replace(o.nome, '\s+', ' ', 'g')) = lower(regexp_replace(b.nome, '\s+', ' ', 'g')))),
    'em_uso', (select count(distinct biblioteca_id) from public.estoque_produtos where biblioteca_id is not null)
  ) into r from public.biblioteca_produtos;
  return r;
end $$;

-- ============================================================
-- Lista com filtros, ordem e páginas
-- ============================================================
create or replace function public.biblioteca_lista(p_situacao text, p_termo text, p_problema text, p_categoria text,
                                                    p_ordem text, p_limite int, p_inicio int)
returns table (id uuid, ean text, nome text, descricao text, foto_url text, marca text, grupo text, categoria text, unidade text,
               embalagem_nome text, embalagem_fator numeric, industrializado boolean, situacao text, motivo text,
               enviado_por text, enviado_estab text, criado_em timestamptz, atualizado_em timestamptz, estoques int, total bigint)
language plpgsql stable security definer set search_path = public as $$
declare t text := nullif(btrim(coalesce(p_termo, '')), '');
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  return query
  with base as (
    select b.*, (select count(*) from public.estoque_produtos p where p.biblioteca_id = b.id)::int as n_estoques
      from public.biblioteca_produtos b
     where (coalesce(p_situacao, 'todos') = 'todos' or b.situacao = p_situacao
            or (p_situacao = 'ativos' and b.situacao in ('aprovado', 'pendente')))
       and (t is null or b.ean = t or b.nome ilike '%' || t || '%' or b.marca ilike '%' || t || '%' or b.descricao ilike '%' || t || '%')
       and (coalesce(p_categoria, '') = '' or b.categoria = p_categoria or (p_categoria = '-' and coalesce(btrim(b.categoria), '') = ''))
       and (coalesce(p_problema, '') = ''
            or (p_problema = 'sem_foto' and b.foto_url is null)
            or (p_problema = 'sem_descricao' and coalesce(btrim(b.descricao), '') = '')
            or (p_problema = 'sem_categoria' and coalesce(btrim(b.categoria), '') = '')
            or (p_problema = 'sem_ean' and b.ean is null)
            or (p_problema = 'duplicado' and exists (select 1 from public.biblioteca_produtos o where o.id <> b.id and o.situacao in ('aprovado', 'pendente')
                                                       and lower(regexp_replace(o.nome, '\s+', ' ', 'g')) = lower(regexp_replace(b.nome, '\s+', ' ', 'g'))))
            or (p_problema = 'sem_uso' and not exists (select 1 from public.estoque_produtos p where p.biblioteca_id = b.id)))
  )
  select x.id, x.ean, x.nome, x.descricao, x.foto_url, x.marca, x.grupo, x.categoria, x.unidade, x.embalagem_nome, x.embalagem_fator,
         x.industrializado, x.situacao, x.motivo, pf.nome, e.nome, x.criado_em, x.atualizado_em, x.n_estoques, count(*) over ()
    from base x
    left join public.perfis pf on pf.id = x.enviado_por
    left join public.estabelecimentos e on e.id = x.enviado_estab
   order by
     case when coalesce(p_ordem, 'recentes') = 'recentes' then (x.situacao = 'pendente')::int end desc,
     case when coalesce(p_ordem, 'recentes') = 'recentes' then x.criado_em end desc,
     case when p_ordem = 'alterados' then x.atualizado_em end desc,
     case when p_ordem = 'nome' then lower(x.nome) end asc,
     case when p_ordem = 'uso' then x.n_estoques end desc,
     x.id
   limit least(greatest(coalesce(p_limite, 50), 1), 500) offset greatest(coalesce(p_inicio, 0), 0);
end $$;

create or replace function public.biblioteca_categorias()
returns table (grupo text, categoria text, produtos int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  return query
  select min(b.grupo), b.categoria, count(*)::int from public.biblioteca_produtos b
   where coalesce(btrim(b.categoria), '') <> '' and b.situacao in ('aprovado', 'pendente')
   group by b.categoria order by b.categoria;
end $$;

-- Onde o produto está: estabelecimentos, saldo e itens do cardápio.
create or replace function public.biblioteca_usos(p_id uuid)
returns table (estabelecimento text, produto text, saldo numeric, unidade text, ativo boolean, itens_cardapio int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  return query
  select e.nome, p.nome, p.saldo, p.unidade, p.ativo,
         (select count(*) from public.cardapio_itens ci where ci.produto_id = p.id)::int
    from public.estoque_produtos p join public.estabelecimentos e on e.id = p.estabelecimento_id
   where p.biblioteca_id = p_id order by e.nome;
end $$;

create or replace function public.biblioteca_historico_de(p_id uuid)
returns table (acao text, por text, mudancas jsonb, em timestamptz)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  return query
  select h.acao, pf.nome, h.mudancas, h.em from public.biblioteca_historico h left join public.perfis pf on pf.id = h.por
   where h.biblioteca_id = p_id order by h.em desc, h.id desc limit 200;
end $$;

-- ============================================================
-- Ações em lote e exclusão protegida
-- ============================================================
create or replace function public.biblioteca_em_lote(p_ids uuid[], p_acao text)
returns int language plpgsql security definer set search_path = public as $$
declare n int;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
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

-- Só exclui de vez se nenhum estoque usa o produto. Se usa, a tela oferece Juntar ou Desativar.
create or replace function public.excluir_biblioteca(p_id uuid)
returns text language plpgsql security definer set search_path = public as $$
declare n int; v_foto text;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  select count(*) into n from public.estoque_produtos where biblioteca_id = p_id;
  if n > 0 then raise exception 'EM_USO:%', n; end if;
  update public.biblioteca_produtos set juntado_em = null where juntado_em = p_id;
  delete from public.biblioteca_produtos where id = p_id returning foto_url into v_foto;
  -- Devolve a foto para a tela apagar do armazenamento, se nenhum outro produto usa a mesma.
  if v_foto is not null and exists (select 1 from public.biblioteca_produtos where foto_url = v_foto) then v_foto := null; end if;
  return v_foto;
end $$;

-- Correção: produto novo sem código de barras (insumo a granel) podia falhar ao ser criado pela equipe.
create or replace function public.salvar_biblioteca(p_id uuid, p_dados jsonb, p_aprovar boolean)
returns uuid language plpgsql security definer set search_path = public as $$
declare v_id uuid := p_id; v_ean text := nullif(regexp_replace(coalesce(p_dados->>'ean', ''), '\D', '', 'g'), '');
        v_ind boolean := coalesce((p_dados->>'industrializado')::boolean, true);
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
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

-- Desativar volta a valer como reativar sem perder o vínculo de quem juntou.
create or replace function public.desativar_biblioteca(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
declare b public.biblioteca_produtos;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  select * into b from public.biblioteca_produtos where id = p_id;
  if p_ativo and b.ean is not null and exists (select 1 from public.biblioteca_produtos o where o.ean = b.ean and o.id <> b.id and o.situacao in ('aprovado', 'pendente')) then
    raise exception 'Já existe outro produto ativo com o EAN %.', b.ean;
  end if;
  update public.biblioteca_produtos set situacao = case when p_ativo then 'aprovado' else 'inativo' end,
         juntado_em = case when p_ativo then null else juntado_em end, atualizado_em = now() where id = p_id;
end $$;

revoke execute on function public.registrar_historico_biblioteca() from public, anon, authenticated;
revoke execute on function public.biblioteca_painel(), public.biblioteca_lista(text, text, text, text, text, int, int), public.biblioteca_categorias(),
  public.biblioteca_usos(uuid), public.biblioteca_historico_de(uuid), public.biblioteca_em_lote(uuid[], text), public.excluir_biblioteca(uuid),
  public.desativar_biblioteca(uuid, boolean) from public, anon;
grant execute on function public.biblioteca_painel(), public.biblioteca_lista(text, text, text, text, text, int, int), public.biblioteca_categorias(),
  public.biblioteca_usos(uuid), public.biblioteca_historico_de(uuid), public.biblioteca_em_lote(uuid[], text), public.excluir_biblioteca(uuid),
  public.desativar_biblioteca(uuid, boolean) to authenticated;

select 'RoVibes 022 aplicado com sucesso' as resultado;
