-- 053 · Vídeos de até 3 minutos (antes 15 s) em posts e stories de pessoas.

do $$
declare r record;
begin
  for r in select c.conrelid::regclass::text tabela, c.conname
             from pg_constraint c
            where c.contype = 'c'
              and c.conrelid in ('public.publicacoes_pessoas'::regclass, 'public.stories_pessoas'::regclass)
              and pg_get_constraintdef(c.oid) ilike '%duracao%' loop
    execute format('alter table %s drop constraint %I', r.tabela, r.conname);
  end loop;
end $$;

alter table public.publicacoes_pessoas add constraint publicacoes_pessoas_duracao_check check (duracao is null or duracao between 0 and 181);
alter table public.stories_pessoas add constraint stories_pessoas_duracao_check check (duracao is null or duracao between 0 and 181);

-- Arquivos de vídeo até 50 MB (3 min no formato do app cabem nesse limite).
do $$ begin
  update storage.buckets set file_size_limit = 52428800 where id = 'avatares' and (file_size_limit is null or file_size_limit < 52428800);
exception when undefined_column then null; end $$;

select 'Atualização 053 aplicada: vídeos de até 3 minutos.' as resultado;
