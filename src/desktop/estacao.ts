import { useCallback, useState } from "react";
import { gravar, ler } from "@/lib/armazenamento";

export type Funcao = "caixa" | "cozinha" | "escritorio";

/** O que este computador é (fica salvo nele). */
export interface Estacao {
  funcao: Funcao;
  nome: string;
  impressora: string | null;
  papel: 58 | 80;
  /** Cozinha/Bar: qual setor mostra e se imprime cada pedido novo. */
  setor: "todos" | "cozinha" | "bar";
  imprimirPedidos: boolean;
  som: boolean;
}

const CHAVE = "desktop_estacao";

export function useEstacao() {
  const [estacao, setEstacao] = useState<Estacao | null>(() => ler<Estacao | null>(CHAVE, null));
  const salvar = useCallback((e: Estacao | null) => {
    gravar(CHAVE, e);
    setEstacao(e);
  }, []);
  return { estacao, salvar };
}

export const NOME_FUNCAO: Record<Funcao, string> = { caixa: "Caixa", cozinha: "Cozinha / Bar", escritorio: "Escritório" };
