// Preferências guardadas no aparelho. Nesta fase ainda não há banco;
// quando o Supabase entrar, favoritos e acessos passam a ser gravados lá.

export function ler<T>(chave: string, padrao: T): T {
  try {
    const bruto = localStorage.getItem(`rovibes:${chave}`);
    return bruto === null ? padrao : (JSON.parse(bruto) as T);
  } catch {
    return padrao;
  }
}

export function gravar<T>(chave: string, valor: T) {
  try {
    localStorage.setItem(`rovibes:${chave}`, JSON.stringify(valor));
  } catch {
    /* armazenamento indisponível: segue sem guardar */
  }
}
