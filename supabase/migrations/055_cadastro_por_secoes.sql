-- 055 · Cadastro por seções: endereço em campos separados e WhatsApp no perfil do estabelecimento.
-- O App continua lendo "endereco" (uma linha), que o Business monta a partir destes campos.

alter table public.estabelecimentos add column if not exists cep text;
alter table public.estabelecimentos add column if not exists logradouro text;
alter table public.estabelecimentos add column if not exists numero text;
alter table public.estabelecimentos add column if not exists complemento text;
alter table public.estabelecimentos add column if not exists whatsapp text;

do $$ begin
  alter table public.estabelecimentos add constraint estabelecimentos_cep_check check (cep is null or cep ~ '^[0-9]{8}$');
exception when duplicate_object then null; end $$;

notify pgrst, 'reload schema';

select 'Atualização 055 aplicada: cadastro por seções (CEP, rua, número, complemento e WhatsApp).' as resultado;
