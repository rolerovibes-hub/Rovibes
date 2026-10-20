-- 033 · Quem está no lugar agora (lista ao tocar nos amigos do pin ou em "Ver quem está aqui")
-- Aparece com nome e perfil:
--   • quem marcou "Público" no check-in — para qualquer pessoa;
--   • quem marcou "Amigos" — só para quem se segue mutuamente com ela;
--   • "Privado" nunca aparece com nome (entra só no número "e mais N pessoas", quando o lugar tem 3+ presenças).
-- Requer a 031. Pode rodar de novo sem problema.

create or replace function public.presentes_no_lugar(p_estab uuid)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare v_pessoas jsonb; v_total int; v_listados int;
begin
  if auth.uid() is null or not public.estab_visivel(p_estab) then return jsonb_build_object('pessoas', '[]'::jsonb, 'outros', 0); end if;
  with ult as (
    select distinct on (c.usuario_id) c.usuario_id, c.visibilidade, c.criado_em
      from public.checkins c
     where c.estabelecimento_id = p_estab and c.saiu_em is null and c.criado_em > now() - interval '4 hours'
     order by c.usuario_id, c.criado_em desc
  ), marc as (
    select u.*, p.nome, p.usuario, p.foto_url,
           public.segue(auth.uid(), u.usuario_id) sigo,
           public.segue(u.usuario_id, auth.uid()) me_segue
      from ult u join public.perfis p on p.id = u.usuario_id and not p.suspenso
     where not public.bloqueado_entre(u.usuario_id, auth.uid())
  ), vis as (
    select m.*,
           case when m.usuario_id = auth.uid() then 'voce'
                when m.sigo and m.me_segue then 'amigo'
                when m.sigo then 'sigo'
                else 'publico' end relacao
      from marc m
     where m.usuario_id = auth.uid()
        or m.visibilidade = 'publico'
        or (m.visibilidade = 'amigos' and m.sigo and m.me_segue)
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', v.usuario_id, 'nome', v.nome, 'usuario', v.usuario, 'foto_url', v.foto_url,
                                               'relacao', v.relacao, 'desde', v.criado_em)
                            order by case v.relacao when 'voce' then 0 when 'amigo' then 1 when 'sigo' then 2 else 3 end, v.criado_em desc), '[]'::jsonb),
         count(*)::int
    into v_pessoas, v_listados
    from (select * from vis limit 200) v;
  select count(distinct c.usuario_id)::int into v_total
    from public.checkins c
   where c.estabelecimento_id = p_estab and c.saiu_em is null and c.criado_em > now() - interval '4 hours';
  return jsonb_build_object('pessoas', v_pessoas, 'outros', case when v_total >= 3 then greatest(v_total - v_listados, 0) else 0 end, 'total', v_total);
end $$;
grant execute on function public.presentes_no_lugar(uuid) to authenticated;

select 'Atualização 033 aplicada: quem está no lugar agora.' as resultado;
