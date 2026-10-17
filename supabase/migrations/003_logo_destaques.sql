-- RoVibes · 003 · Logo do estabelecimento e itens em destaque no cardápio.
-- Pode ser executado mais de uma vez.

alter table public.estabelecimentos add column if not exists logo_url text;

-- "Os mais pedidos": por enquanto o estabelecimento escolhe os destaques.
-- Quando houver pedidos (fase 5), a lista passa a considerar as vendas.
alter table public.cardapio_itens add column if not exists destaque boolean not null default false;
create index if not exists cardapio_itens_destaque_idx on public.cardapio_itens (estabelecimento_id) where destaque;

select 'RoVibes 003 aplicado com sucesso' as resultado;
