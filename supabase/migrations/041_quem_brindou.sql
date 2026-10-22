-- 041 · Quem brindou uma publicação (lista ao tocar no número de brindes).
-- Vê quem pode ver a publicação; contas bloqueadas (de um lado ou do outro) não aparecem.
-- Pode rodar de novo sem problema.

create or replace function public.quem_brindou(p_tipo text, p_id uuid)
returns table (id uuid, nome text, usuario text, foto_url text, quando timestamptz, sou_eu boolean)
language plpgsql stable security definer set search_path = public as $$
begin
  if p_tipo = 'pessoa' then
    if not exists (select 1 from public.publicacoes_pessoas p
                    where p.id = p_id and (p.usuario_id = auth.uid() or (not p.oculto and public.ve_publicacoes_de(p.usuario_id)))) then
      return;
    end if;
    return query
    select pf.id, pf.nome, pf.usuario, pf.foto_url, c.criado_em, pf.id = auth.uid()
      from public.curtidas_pessoas c join public.perfis pf on pf.id = c.usuario_id
     where c.publicacao_id = p_id and not coalesce(pf.suspenso, false)
       and not exists (select 1 from public.bloqueios b where (b.bloqueador_id = auth.uid() and b.bloqueado_id = pf.id)
                                                        or (b.bloqueador_id = pf.id and b.bloqueado_id = auth.uid()))
     order by c.criado_em desc
     limit 300;
  elsif p_tipo = 'lugar' then
    if not exists (select 1 from public.publicacoes p where p.id = p_id and (p.situacao = 'publicada' or public.eh_membro(p.estabelecimento_id))) then
      return;
    end if;
    return query
    select pf.id, pf.nome, pf.usuario, pf.foto_url, c.criado_em, pf.id = auth.uid()
      from public.curtidas c join public.perfis pf on pf.id = c.usuario_id
     where c.publicacao_id = p_id and not coalesce(pf.suspenso, false)
       and not exists (select 1 from public.bloqueios b where (b.bloqueador_id = auth.uid() and b.bloqueado_id = pf.id)
                                                        or (b.bloqueador_id = pf.id and b.bloqueado_id = auth.uid()))
     order by c.criado_em desc
     limit 300;
  end if;
end $$;
revoke execute on function public.quem_brindou(text, uuid) from public, anon;
grant execute on function public.quem_brindou(text, uuid) to authenticated;

select 'Atualização 041 aplicada: quem brindou.' as resultado;
