-- RoVibes 012: foto e telefone no perfil da pessoa.
-- Pode ser executado mais de uma vez.

alter table public.perfis add column if not exists telefone text check (telefone is null or length(telefone) <= 30);

-- Fotos de perfil (Supabase Storage): pasta = id da pessoa.
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'storage') then
    insert into storage.buckets (id, name, public) values ('avatares', 'avatares', true)
    on conflict (id) do update set public = true;

    execute 'drop policy if exists "avatar enviar" on storage.objects';
    execute $p$create policy "avatar enviar" on storage.objects for insert to authenticated
      with check (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)$p$;

    execute 'drop policy if exists "avatar apagar" on storage.objects';
    execute $p$create policy "avatar apagar" on storage.objects for delete to authenticated
      using (bucket_id = 'avatares' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
  end if;
end $$;

select 'RoVibes 012 aplicado com sucesso' as resultado;
