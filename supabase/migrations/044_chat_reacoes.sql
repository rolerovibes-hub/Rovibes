-- 044 · Chat: reações com emoji e responder uma mensagem (arrastar para o lado)
-- • Cada pessoa deixa uma reação por mensagem (tocar de novo no mesmo emoji tira).
-- • Mensagem pode responder outra da mesma conversa (aparece citada em cima).
-- Pode rodar de novo sem problema.

alter table public.mensagens add column if not exists resposta_a uuid references public.mensagens(id) on delete set null;

create table if not exists public.reacoes_mensagem (
  mensagem_id uuid not null references public.mensagens(id) on delete cascade,
  usuario_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversa_id uuid not null references public.conversas(id) on delete cascade,
  emoji text not null check (length(emoji) between 1 and 16),
  criado_em timestamptz not null default now(),
  primary key (mensagem_id, usuario_id)
);
create index if not exists reacoes_mensagem_conversa_idx on public.reacoes_mensagem (conversa_id);
alter table public.reacoes_mensagem enable row level security;
-- Para o tempo real avisar também quando alguém tira a reação.
alter table public.reacoes_mensagem replica identity full;
drop policy if exists reacoes_mensagem_ler on public.reacoes_mensagem;
create policy reacoes_mensagem_ler on public.reacoes_mensagem for select to authenticated using (public.pode_ver_conversa(conversa_id));
grant select on public.reacoes_mensagem to authenticated;

-- Reagir: mesmo emoji de novo tira; outro emoji troca.
create or replace function public.reagir_mensagem(p_mensagem uuid, p_emoji text)
returns text language plpgsql security definer set search_path = public as $$
declare m public.mensagens; v_atual text;
begin
  select * into m from public.mensagens where id = p_mensagem;
  if not found or m.apagada or m.tipo = 'sistema' then raise exception 'Mensagem não encontrada.'; end if;
  if not exists (select 1 from public.conversa_membros where conversa_id = m.conversa_id and usuario_id = auth.uid() and situacao = 'ativo')
     and not exists (select 1 from public.conversas c where c.id = m.conversa_id and c.tipo = 'estabelecimento' and public.atende_estab(c.estabelecimento_id)) then
    raise exception 'Você não participa desta conversa.';
  end if;
  select emoji into v_atual from public.reacoes_mensagem where mensagem_id = p_mensagem and usuario_id = auth.uid();
  if p_emoji is null or btrim(p_emoji) = '' or v_atual = p_emoji then
    delete from public.reacoes_mensagem where mensagem_id = p_mensagem and usuario_id = auth.uid();
    return null;
  end if;
  insert into public.reacoes_mensagem (mensagem_id, usuario_id, conversa_id, emoji) values (p_mensagem, auth.uid(), m.conversa_id, btrim(p_emoji))
  on conflict (mensagem_id, usuario_id) do update set emoji = excluded.emoji, criado_em = now();
  -- Avisa quem escreveu (se as notificações da atualização 040 estiverem ligadas).
  begin
    if v_atual is null and m.autor_id is not null and m.autor_id <> auth.uid() then
      perform public.notificar(m.autor_id, auth.uid(), 'mensagem', public.primeiro_nome(auth.uid()),
                               'Reagiu ' || btrim(p_emoji) || ' à sua mensagem' || coalesce(': "' || left(m.texto, 60) || '"', ''),
                               '/chat/' || m.conversa_id, 'reacao:' || p_mensagem || ':' || auth.uid(), 'chat:' || m.conversa_id);
    end if;
  exception when undefined_function then null;
  end;
  return btrim(p_emoji);
end $$;
revoke execute on function public.reagir_mensagem(uuid, text) from public, anon;
grant execute on function public.reagir_mensagem(uuid, text) to authenticated;

-- Enviar mensagem agora aceita responder outra (p_resposta).
drop function if exists public.enviar_mensagem(uuid, text, text, uuid);
create or replace function public.enviar_mensagem(p_conversa uuid, p_texto text, p_foto text default null, p_lugar uuid default null, p_resposta uuid default null)
returns uuid language plpgsql security definer set search_path = public as $$
declare c public.conversas; v_sit text; v_estab boolean := false; v_id uuid; v_texto text := nullif(btrim(coalesce(p_texto, '')), '');
begin
  perform public.exigir_conta_ativa();
  select * into c from public.conversas where id = p_conversa;
  if not found then raise exception 'Conversa não encontrada.'; end if;
  if v_texto is null and p_foto is null and p_lugar is null then raise exception 'Escreva uma mensagem.'; end if;
  if length(v_texto) > 2000 then raise exception 'Mensagem longa demais (máximo 2.000 caracteres).'; end if;
  if p_foto is not null and p_foto not like p_conversa::text || '/%' then raise exception 'Foto inválida.'; end if;
  if p_lugar is not null and not public.estab_visivel(p_lugar) then raise exception 'Lugar não encontrado.'; end if;
  if p_resposta is not null and not exists (select 1 from public.mensagens where id = p_resposta and conversa_id = p_conversa) then
    raise exception 'A mensagem respondida não está nesta conversa.';
  end if;

  select situacao into v_sit from public.conversa_membros where conversa_id = p_conversa and usuario_id = auth.uid();
  if v_sit in ('ativo', 'pedido') then
    if v_sit = 'pedido' then update public.conversa_membros set situacao = 'ativo' where conversa_id = p_conversa and usuario_id = auth.uid(); end if;
  elsif c.tipo = 'estabelecimento' and public.atende_estab(c.estabelecimento_id) then
    v_estab := true;
  else
    raise exception 'Você não participa desta conversa.';
  end if;

  if c.tipo = 'direta' and exists (
       select 1 from public.conversa_membros m where m.conversa_id = p_conversa and m.usuario_id <> auth.uid()
          and (public.bloqueado_entre(m.usuario_id, auth.uid()) or exists (select 1 from public.perfis where id = m.usuario_id and suspenso))) then
    raise exception 'Não é possível enviar mensagens para esta pessoa.';
  end if;

  insert into public.mensagens (conversa_id, autor_id, tipo, texto, foto, estabelecimento_id, como_estab, resposta_a)
  values (p_conversa, auth.uid(), case when p_lugar is not null then 'lugar' when p_foto is not null then 'foto' else 'texto' end,
          v_texto, p_foto, p_lugar, v_estab, p_resposta)
  returning id into v_id;
  update public.conversas set ultima_em = now(), lida_estab_em = case when v_estab then now() else lida_estab_em end where id = p_conversa;
  update public.conversa_membros set lida_em = now() where conversa_id = p_conversa and usuario_id = auth.uid();
  if c.tipo in ('direta', 'estabelecimento') then
    update public.conversa_membros set situacao = 'ativo' where conversa_id = p_conversa and usuario_id <> auth.uid() and situacao = 'saiu';
  end if;
  return v_id;
end $$;


revoke execute on function public.enviar_mensagem(uuid, text, text, uuid, uuid) from public, anon;
grant execute on function public.enviar_mensagem(uuid, text, text, uuid, uuid) to authenticated;

do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'reacoes_mensagem') then
    alter publication supabase_realtime add table public.reacoes_mensagem;
  end if;
end $$;

notify pgrst, 'reload schema';

select 'Atualização 044 aplicada: reações e respostas no chat.' as resultado;
