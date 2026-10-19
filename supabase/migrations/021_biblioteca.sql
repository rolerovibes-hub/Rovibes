-- RoVibes 021: Biblioteca de produtos (catálogo central gerenciado pela equipe RoVibes).
-- O estoque de cada estabelecimento fica ligado à biblioteca: nome, EAN, foto e descrição vêm dela.
-- Produto enviado por um estabelecimento fica "Em análise" e pode ser usado só no estoque de quem enviou.
-- Pode ser executado mais de uma vez.

create table if not exists public.biblioteca_produtos (
  id uuid primary key default gen_random_uuid(),
  ean text check (ean is null or ean ~ '^\d{8,14}$'),
  nome text not null check (length(btrim(nome)) between 2 and 160),
  descricao text check (descricao is null or length(descricao) <= 500),
  foto_url text,
  marca text,
  grupo text,
  categoria text,
  unidade text not null default 'un' check (unidade in ('un', 'kg', 'g', 'l', 'ml', 'cx', 'dose')),
  embalagem_nome text,
  embalagem_fator numeric(12,3) check (embalagem_fator is null or embalagem_fator > 0),
  industrializado boolean not null default true,
  situacao text not null default 'pendente' check (situacao in ('aprovado', 'pendente', 'recusado', 'inativo')),
  motivo text,
  juntado_em uuid references public.biblioteca_produtos(id),
  enviado_por uuid references auth.users(id) on delete set null,
  enviado_estab uuid references public.estabelecimentos(id) on delete set null,
  aprovado_por uuid references auth.users(id),
  aprovado_em timestamptz,
  criado_em timestamptz not null default now(),
  atualizado_em timestamptz not null default now(),
  check (not industrializado or ean is not null)
);
create unique index if not exists biblioteca_ean_unico on public.biblioteca_produtos (ean) where ean is not null and situacao in ('aprovado', 'pendente');
create index if not exists biblioteca_situacao_idx on public.biblioteca_produtos (situacao, criado_em desc);
create index if not exists biblioteca_nome_idx on public.biblioteca_produtos (lower(nome));

alter table public.biblioteca_produtos enable row level security;
drop policy if exists biblioteca_ler on public.biblioteca_produtos;
create policy biblioteca_ler on public.biblioteca_produtos for select to authenticated
  using (situacao = 'aprovado' or public.eh_admin() or (enviado_estab is not null and public.ve_estoque(enviado_estab)));
drop policy if exists biblioteca_admin on public.biblioteca_produtos;
create policy biblioteca_admin on public.biblioteca_produtos for all to authenticated using (public.eh_admin()) with check (public.eh_admin());

-- Estoque do estabelecimento ligado à biblioteca.
alter table public.estoque_produtos add column if not exists biblioteca_id uuid references public.biblioteca_produtos(id) on delete set null;
alter table public.estoque_produtos add column if not exists foto_url text;
alter table public.estoque_produtos add column if not exists descricao text;
create unique index if not exists estoque_produtos_biblioteca_unico on public.estoque_produtos (estabelecimento_id, biblioteca_id) where biblioteca_id is not null;
-- O nome deixa de ser único por estabelecimento (a identidade passa a ser o produto da biblioteca).
alter table public.estoque_produtos drop constraint if exists estoque_produtos_estabelecimento_id_nome_key;

-- Campos que vêm da biblioteca não podem ser mudados pelo estabelecimento.
create or replace function public.proteger_campos_biblioteca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.biblioteca_id is not null and coalesce(current_setting('rovibes.sincronizando', true), '') <> '1' then
    new.nome := old.nome; new.ean := old.ean; new.marca := old.marca; new.grupo := old.grupo; new.categoria := old.categoria;
    new.foto_url := old.foto_url; new.descricao := old.descricao;
    if not public.eh_admin() then new.biblioteca_id := old.biblioteca_id; end if;
  end if;
  return new;
end $$;
drop trigger if exists estoque_produtos_biblioteca on public.estoque_produtos;
create trigger estoque_produtos_biblioteca before update on public.estoque_produtos for each row execute function public.proteger_campos_biblioteca();

-- Correção na biblioteca atualiza todos os estoques ligados.
create or replace function public.sincronizar_biblioteca()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform set_config('rovibes.sincronizando', '1', true);
  update public.estoque_produtos
     set nome = new.nome, ean = new.ean, marca = new.marca, grupo = new.grupo, categoria = new.categoria,
         foto_url = new.foto_url, descricao = new.descricao
   where biblioteca_id = new.id;
  perform set_config('rovibes.sincronizando', '', true);
  new.atualizado_em := now();
  return new;
end $$;
drop trigger if exists biblioteca_sincronizar on public.biblioteca_produtos;
create trigger biblioteca_sincronizar before update of nome, ean, marca, grupo, categoria, foto_url, descricao on public.biblioteca_produtos
  for each row execute function public.sincronizar_biblioteca();

-- ============================================================
-- Estabelecimento: buscar, enviar e incluir no estoque
-- ============================================================
create or replace function public.pode_receber(p_estab uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.pode_usar(p_estab, 'G4002') or public.pode_usar(p_estab, 'G4003');
$$;

-- Busca na biblioteca: aprovados + os "Em análise" enviados por este estabelecimento.
create or replace function public.buscar_biblioteca(p_estab uuid, p_termo text)
returns table (id uuid, ean text, nome text, descricao text, foto_url text, marca text, categoria text, unidade text,
               embalagem_nome text, embalagem_fator numeric, situacao text, produto_id uuid)
language sql stable security definer set search_path = public as $$
  with t as (select btrim(coalesce(p_termo, '')) as termo)
  select b.id, b.ean, b.nome, b.descricao, b.foto_url, b.marca, b.categoria, b.unidade, b.embalagem_nome, b.embalagem_fator, b.situacao,
         (select p.id from public.estoque_produtos p where p.estabelecimento_id = p_estab and p.biblioteca_id = b.id)
    from public.biblioteca_produtos b, t
   where public.ve_estoque(p_estab)
     and (b.situacao = 'aprovado' or (b.situacao = 'pendente' and b.enviado_estab = p_estab))
     and length(t.termo) >= 2
     and (b.ean = t.termo or b.nome ilike '%' || t.termo || '%' or b.marca ilike '%' || t.termo || '%')
   order by (b.ean = t.termo) desc, b.nome
   limit 40;
$$;

-- Liga o produto da biblioteca ao estoque do estabelecimento (cria se ainda não existir) e devolve o produto do estoque.
create or replace function public.incluir_no_estoque(p_estab uuid, p_biblioteca uuid)
returns uuid language plpgsql security definer set search_path = public as $$
declare b public.biblioteca_produtos; v uuid;
begin
  if not public.pode_receber(p_estab) then raise exception 'Sem acesso para incluir produtos no estoque.'; end if;
  select * into b from public.biblioteca_produtos where id = p_biblioteca;
  if not found or not (b.situacao = 'aprovado' or (b.situacao = 'pendente' and b.enviado_estab = p_estab)) then
    raise exception 'Produto não disponível na biblioteca.';
  end if;
  select id into v from public.estoque_produtos where estabelecimento_id = p_estab and biblioteca_id = b.id;
  if v is not null then
    update public.estoque_produtos set ativo = true where id = v;
    return v;
  end if;
  insert into public.estoque_produtos (estabelecimento_id, biblioteca_id, nome, ean, marca, grupo, categoria, foto_url, descricao,
                                       unidade, embalagem_nome, embalagem_fator)
  values (p_estab, b.id, b.nome, b.ean, b.marca, b.grupo, b.categoria, b.foto_url, b.descricao, b.unidade, b.embalagem_nome, b.embalagem_fator)
  returning id into v;
  return v;
end $$;

-- Cadastro enviado pelo estabelecimento (vai para análise da equipe RoVibes).
create or replace function public.enviar_para_biblioteca(p_estab uuid, p_dados jsonb)
returns table (biblioteca_id uuid, produto_id uuid, ja_existia boolean)
language plpgsql security definer set search_path = public as $$
declare v_ean text := nullif(regexp_replace(coalesce(p_dados->>'ean', ''), '\D', '', 'g'), '');
        v_ind boolean := coalesce((p_dados->>'industrializado')::boolean, true);
        v_id uuid; v_existia boolean := false;
begin
  if not public.pode_receber(p_estab) then raise exception 'Sem acesso para cadastrar produtos.'; end if;
  if coalesce(btrim(p_dados->>'nome'), '') = '' then raise exception 'Informe o nome do produto conforme a nota fiscal.'; end if;
  if v_ind and v_ean is null then raise exception 'Produto industrializado precisa do código de barras (EAN).'; end if;
  if v_ean is not null and v_ean !~ '^\d{8,14}$' then raise exception 'O código de barras deve ter de 8 a 14 números.'; end if;
  if v_ean is not null then
    select id into v_id from public.biblioteca_produtos where ean = v_ean and situacao in ('aprovado', 'pendente') limit 1;
    if v_id is not null then
      v_existia := true;
      if not exists (select 1 from public.biblioteca_produtos where id = v_id and (situacao = 'aprovado' or enviado_estab = p_estab)) then
        raise exception 'Este código de barras já foi enviado por outro estabelecimento e está em análise pela equipe RoVibes. Tente de novo mais tarde.';
      end if;
    end if;
  end if;
  if v_id is null then
    insert into public.biblioteca_produtos (ean, nome, descricao, foto_url, marca, grupo, categoria, unidade, embalagem_nome, embalagem_fator,
                                            industrializado, situacao, enviado_por, enviado_estab)
    values (v_ean, btrim(p_dados->>'nome'), nullif(btrim(p_dados->>'descricao'), ''), nullif(p_dados->>'foto_url', ''),
            nullif(btrim(p_dados->>'marca'), ''), nullif(btrim(p_dados->>'grupo'), ''), nullif(btrim(p_dados->>'categoria'), ''),
            coalesce(nullif(p_dados->>'unidade', ''), 'un'), nullif(btrim(p_dados->>'embalagem_nome'), ''),
            nullif(p_dados->>'embalagem_fator', '')::numeric, v_ind and v_ean is not null, 'pendente', auth.uid(), p_estab)
    returning id into v_id;
  end if;
  return query select v_id, public.incluir_no_estoque(p_estab, v_id), v_existia;
end $$;

-- ============================================================
-- Equipe RoVibes (Administração · A1005)
-- ============================================================
create or replace function public.biblioteca_admin(p_situacao text, p_termo text)
returns table (id uuid, ean text, nome text, descricao text, foto_url text, marca text, grupo text, categoria text, unidade text,
               embalagem_nome text, embalagem_fator numeric, industrializado boolean, situacao text, motivo text,
               enviado_por text, enviado_estab text, criado_em timestamptz, estoques int)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  return query
  select b.id, b.ean, b.nome, b.descricao, b.foto_url, b.marca, b.grupo, b.categoria, b.unidade, b.embalagem_nome, b.embalagem_fator,
         b.industrializado, b.situacao, b.motivo, pf.nome, e.nome, b.criado_em,
         (select count(*) from public.estoque_produtos p where p.biblioteca_id = b.id)::int
    from public.biblioteca_produtos b
    left join public.perfis pf on pf.id = b.enviado_por
    left join public.estabelecimentos e on e.id = b.enviado_estab
   where (p_situacao is null or p_situacao = 'todos' or b.situacao = p_situacao)
     and (coalesce(btrim(p_termo), '') = '' or b.ean = btrim(p_termo) or b.nome ilike '%' || btrim(p_termo) || '%' or b.marca ilike '%' || btrim(p_termo) || '%')
   order by (b.situacao = 'pendente') desc, b.criado_em desc
   limit 300;
end $$;

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
    insert into public.biblioteca_produtos (ean, nome, situacao) values (v_ean, btrim(p_dados->>'nome'), 'aprovado') returning id into v_id;
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

create or replace function public.recusar_biblioteca(p_id uuid, p_motivo text)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  if coalesce(btrim(p_motivo), '') = '' then raise exception 'Informe o motivo para o estabelecimento.'; end if;
  update public.biblioteca_produtos set situacao = 'recusado', motivo = btrim(p_motivo), atualizado_em = now() where id = p_id;
  -- O estoque de quem enviou continua com o produto (agora sem vínculo com a biblioteca).
  update public.estoque_produtos set biblioteca_id = null where biblioteca_id = p_id;
end $$;

create or replace function public.desativar_biblioteca(p_id uuid, p_ativo boolean)
returns void language plpgsql security definer set search_path = public as $$
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
  update public.biblioteca_produtos set situacao = case when p_ativo then 'aprovado' else 'inativo' end, atualizado_em = now() where id = p_id;
end $$;

-- Junta um duplicado (origem) no produto certo (destino), inclusive nos estoques que tinham os dois.
create or replace function public.juntar_biblioteca(p_origem uuid, p_destino uuid)
returns int language plpgsql security definer set search_path = public as $$
declare d public.biblioteca_produtos; r record; v_dest uuid; n int := 0;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
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

-- Importação de planilha pela equipe RoVibes (aprovados direto; atualiza pelo EAN).
create or replace function public.importar_biblioteca(p_linhas jsonb)
returns table (gravados int, erros text[])
language plpgsql security definer set search_path = public as $$
declare l jsonb; n int := 0; e text[] := '{}'; i int := 0; v_id uuid; v_ean text;
begin
  if not public.eh_admin() then raise exception 'Só a equipe RoVibes gerencia a biblioteca.'; end if;
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

-- ============================================================
-- Fotos da biblioteca (públicas; cada pessoa envia na sua pasta)
-- ============================================================
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('biblioteca', 'biblioteca', true) on conflict (id) do update set public = true;
    execute 'drop policy if exists "biblioteca enviar" on storage.objects';
    execute $p$create policy "biblioteca enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'biblioteca' and ((storage.foldername(name))[1] = auth.uid()::text or public.eh_admin()))$p$;
    execute 'drop policy if exists "biblioteca apagar" on storage.objects';
    execute $p$create policy "biblioteca apagar" on storage.objects for delete to authenticated
      using (bucket_id = 'biblioteca' and public.eh_admin())$p$;
  end if;
end $$;

-- ============================================================
-- Produtos que já existiam nos estoques vão para a biblioteca "Em análise"
-- ============================================================
do $$
declare r record; v_id uuid; v_ean text;
begin
  perform set_config('rovibes.sincronizando', '1', true);
  for r in select * from public.estoque_produtos where biblioteca_id is null order by criado_em loop
    v_ean := case when r.ean ~ '^\d{8,14}$' then r.ean end;
    v_id := null;
    if v_ean is not null then
      select id into v_id from public.biblioteca_produtos where ean = v_ean and situacao in ('aprovado', 'pendente') limit 1;
    end if;
    if v_id is null then
      insert into public.biblioteca_produtos (ean, nome, marca, grupo, categoria, unidade, embalagem_nome, embalagem_fator, industrializado,
                                              situacao, enviado_estab, criado_em)
      values (v_ean, left(r.nome, 160), r.marca, r.grupo, r.categoria, r.unidade, r.embalagem_nome, r.embalagem_fator, v_ean is not null,
              'pendente', r.estabelecimento_id, r.criado_em)
      returning id into v_id;
    end if;
    if not exists (select 1 from public.estoque_produtos where estabelecimento_id = r.estabelecimento_id and biblioteca_id = v_id) then
      update public.estoque_produtos set biblioteca_id = v_id where id = r.id;
    end if;
  end loop;
  perform set_config('rovibes.sincronizando', '', true);
end $$;

revoke execute on function public.proteger_campos_biblioteca(), public.sincronizar_biblioteca() from public, anon, authenticated;
revoke execute on function public.buscar_biblioteca(uuid, text), public.incluir_no_estoque(uuid, uuid), public.enviar_para_biblioteca(uuid, jsonb),
  public.biblioteca_admin(text, text), public.salvar_biblioteca(uuid, jsonb, boolean), public.recusar_biblioteca(uuid, text),
  public.desativar_biblioteca(uuid, boolean), public.juntar_biblioteca(uuid, uuid), public.importar_biblioteca(jsonb), public.pode_receber(uuid) from public, anon;
grant execute on function public.buscar_biblioteca(uuid, text), public.incluir_no_estoque(uuid, uuid), public.enviar_para_biblioteca(uuid, jsonb),
  public.biblioteca_admin(text, text), public.salvar_biblioteca(uuid, jsonb, boolean), public.recusar_biblioteca(uuid, text),
  public.desativar_biblioteca(uuid, boolean), public.juntar_biblioteca(uuid, uuid), public.importar_biblioteca(jsonb), public.pode_receber(uuid) to authenticated;

select 'RoVibes 021 aplicado com sucesso' as resultado;
