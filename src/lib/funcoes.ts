/** Funções da equipe (Gerente, Caixa, Garçom, Barman, Chef...) e ações sensíveis. */

export type Nivel = "gerente" | "lider" | "equipe";
export type SetorFuncao = "cozinha" | "bar" | null;

export interface Funcao {
  id: string;
  modelo: string | null;
  nome: string;
  descricao: string | null;
  nivel: Nivel;
  setor: SetorFuncao;
  codigos: string[];
  acoes: string[];
  desconto_max: number;
  ordem: number;
  ativa: boolean;
  pessoas: number;
}

export const NOME_NIVEL: Record<Nivel, string> = { gerente: "Gerência", lider: "Líder de setor", equipe: "Equipe" };

export const EXPLICA_NIVEL: Record<Nivel, string> = {
  gerente: "Monta a equipe e faz todas as ações sensíveis. Só o proprietário define gerentes.",
  lider: "Autoriza as ações do setor dele (ex.: cancelar um item da cozinha).",
  equipe: "Faz o trabalho da função e pede autorização quando precisa.",
};

export const ACOES: { id: string; nome: string; explica: string }[] = [
  { id: "cancelar_item", nome: "Cancelar item em preparo", explica: "Cancela item que já começou e decide os pedidos de cancelamento. Com setor, vale só para o setor da função." },
  { id: "resolver_ocorrencias", nome: "Resolver ocorrências", explica: "Entregar sem QR, refazer item, recusar ocorrência." },
  { id: "desconto", nome: "Dar desconto", explica: "Desconto na conta (até o limite) e tirar a taxa de serviço." },
  { id: "estornar", nome: "Estornar", explica: "Estornar item entregue e cancelar pagamento registrado no caixa." },
  { id: "reabrir_comanda", nome: "Reabrir conta", explica: "Reabrir uma conta fechada hoje." },
  { id: "fechar_em_aberto", nome: "Fechar conta em aberto", explica: "Fechar a conta faltando pagamento (cortesia ou pago por fora)." },
  { id: "transferir", nome: "Transferir mesas e entregas", explica: "Assumir ou passar a mesa ou a entrega de outra pessoa." },
];

export const NOME_ACAO: Record<string, string> = Object.fromEntries(ACOES.map((a) => [a.id, a.nome]));

export const NOME_SETOR: Record<string, string> = { cozinha: "Cozinha", bar: "Bar" };

/** Níveis da equipe RoVibes. */
export const NIVEIS_ROVIBES: { id: string; nome: string; explica: string }[] = [
  { id: "geral", nome: "Geral", explica: "Tudo, inclusive dar acesso à equipe RoVibes." },
  { id: "comercial", nome: "Comercial", explica: "Aprovar, recusar e suspender estabelecimentos." },
  { id: "moderacao", nome: "Moderação", explica: "Denúncias e eventos de pessoas." },
  { id: "catalogo", nome: "Catálogo", explica: "Vibes, categorias, gostos, biblioteca de produtos e músicas." },
  { id: "financeiro", nome: "Financeiro", explica: "Regras, taxas e preços (eventos de pessoas e impulsionamento)." },
  { id: "suporte", nome: "Suporte", explica: "Entrar num estabelecimento quando o proprietário libera o modo suporte." },
];
