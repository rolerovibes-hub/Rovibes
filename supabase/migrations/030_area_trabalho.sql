-- 030 · Área de Trabalho personalizável
-- Cada pessoa escolhe a cor e o ícone dos apps da sua tela inicial do Business
-- (a ordem já ficava em favoritos.ordem). Pode rodar de novo sem problema.

alter table public.favoritos add column if not exists cor text;
alter table public.favoritos add column if not exists icone text;

alter table public.favoritos drop constraint if exists favoritos_cor_ok;
alter table public.favoritos add constraint favoritos_cor_ok check (cor is null or cor ~ '^#[0-9A-Fa-f]{6}$');
alter table public.favoritos drop constraint if exists favoritos_icone_ok;
alter table public.favoritos add constraint favoritos_icone_ok check (icone is null or icone ~ '^[A-Za-z0-9]{1,40}$');

-- Reordena a tela inicial de uma vez (arrastar e soltar).
create or replace function public.ordenar_favoritos(p_codigos text[])
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Entre na sua conta.'; end if;
  update public.favoritos f
     set ordem = x.i - 1
    from unnest(p_codigos) with ordinality as x(codigo, i)
   where f.usuario_id = auth.uid() and f.codigo = x.codigo;
end $$;
revoke all on function public.ordenar_favoritos(text[]) from public, anon;
grant execute on function public.ordenar_favoritos(text[]) to authenticated;

select 'Atualização 030 aplicada: Área de Trabalho com cor, ícone e arrastar.' as resultado;
