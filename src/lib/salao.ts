import { useEffect, useRef } from "react";
import { supabase } from "./supabase";

export type SituacaoPedido = "novo" | "preparo" | "pronto" | "entregue" | "cancelado";
export type Setor = "cozinha" | "bar";

export const NOME_SITUACAO_PEDIDO: Record<SituacaoPedido, string> = {
  novo: "Recebido",
  preparo: "Em preparo",
  pronto: "Pronto",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const COR_SITUACAO_PEDIDO: Record<SituacaoPedido, string> = {
  novo: "text-azul",
  preparo: "text-alerta",
  pronto: "text-ok",
  entregue: "text-suave",
  cancelado: "text-perigo",
};

export const NOME_SETOR: Record<Setor, string> = { cozinha: "Cozinha", bar: "Bar" };

export type Destino = Setor | "sem_preparo";
export type SituacaoItem = "recebido" | "preparo" | "pronto" | "saiu" | "entregue" | "cancelado";
export type Modalidade = "mesa" | "retirada";

export const NOME_DESTINO: Record<Destino, string> = { cozinha: "Cozinha", bar: "Bar", sem_preparo: "Sem preparo" };

export const NOME_SITUACAO_ITEM: Record<SituacaoItem, string> = {
  recebido: "Recebido",
  preparo: "Em preparo",
  pronto: "Pronto",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const COR_SITUACAO_ITEM: Record<SituacaoItem, string> = {
  recebido: "text-azul",
  preparo: "text-alerta",
  pronto: "text-ok",
  saiu: "text-magenta",
  entregue: "text-suave",
  cancelado: "text-perigo",
};

export const NOME_MODALIDADE: Record<Modalidade, string> = { mesa: "Entrega na mesa", retirada: "Retirada no balcão" };

/** Item ainda precisa de alguma ação da equipe. */
export const itemPendente = (s: SituacaoItem) => s !== "entregue" && s !== "cancelado";

export interface ItemPedido {
  id: string;
  nome: string;
  preco: number;
  quantidade: number;
  observacao: string | null;
  destino: Destino;
  situacao: SituacaoItem;
  pronto_em: string | null;
  saiu_em: string | null;
  entregue_em: string | null;
  entrega_por_qr: boolean | null;
  motivo_cancelamento: string | null;
}

export interface Pedido {
  id: string;
  envio_id: string;
  numero: number;
  setor: Setor | null;
  modalidade: Modalidade;
  usuario_id: string | null;
  lancado_por: string | null;
  observacao: string | null;
  situacao: SituacaoPedido;
  motivo_cancelamento: string | null;
  criado_em: string;
  atualizado_em: string;
  itens: ItemPedido[];
}

export interface Totais {
  subtotal: number;
  desconto: number;
  total: number;
  meu_subtotal: number;
}

export const CAMPOS_PEDIDO =
  "id, envio_id, numero, setor, modalidade, usuario_id, lancado_por, observacao, situacao, motivo_cancelamento, criado_em, atualizado_em, itens:pedido_itens(id, nome, preco, quantidade, observacao, destino, situacao, pronto_em, saiu_em, entregue_em, entrega_por_qr, motivo_cancelamento)";

export const normalizarPedidos = (dados: unknown[] | null): Pedido[] =>
  ((dados ?? []) as Pedido[]).map((p) => ({ ...p, itens: (p.itens ?? []).map((i) => ({ ...i, preco: Number(i.preco) })) }));

export const totalDoPedido = (p: Pedido) => p.itens.reduce((s, i) => s + (i.situacao === "cancelado" ? 0 : i.preco * i.quantidade), 0);

export async function buscarTotais(comanda: string): Promise<Totais> {
  const { data } = await supabase.rpc("totais_comanda", { p_comanda: comanda });
  const t = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  return { subtotal: Number(t.subtotal ?? 0), desconto: Number(t.desconto ?? 0), total: Number(t.total ?? 0), meu_subtotal: Number(t.meu_subtotal ?? 0) };
}

/** Recarrega quando pedidos ou comandas mudam no banco (tempo real), com um recarregamento periódico de reserva. */
export function useAoVivo(nome: string, filtro: { pedidos?: string; comandas?: string; itens?: string }, recarregar: () => void, ativo = true) {
  const callback = useRef(recarregar);
  callback.current = recarregar;
  useEffect(() => {
    if (!ativo) return;
    let espera: number | undefined;
    const avisar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => callback.current(), 250);
    };
    let canal = supabase.channel(`${nome}-${Math.random().toString(36).slice(2)}`);
    if (filtro.pedidos) canal = canal.on("postgres_changes", { event: "*", schema: "public", table: "pedidos", filter: filtro.pedidos }, avisar);
    if (filtro.itens) canal = canal.on("postgres_changes", { event: "*", schema: "public", table: "pedido_itens", filter: filtro.itens }, avisar);
    if (filtro.comandas) canal = canal.on("postgres_changes", { event: "*", schema: "public", table: "comandas", filter: filtro.comandas }, avisar);
    canal.subscribe();
    const reserva = window.setInterval(() => callback.current(), 30000);
    return () => {
      window.clearTimeout(espera);
      window.clearInterval(reserva);
      void supabase.removeChannel(canal);
    };
  }, [nome, filtro.pedidos, filtro.comandas, filtro.itens, ativo]);
}

/** Link impresso no QR da mesa: abre direto o RoVibes ao ser lido pela câmera do celular. */
export const linkDaMesa = (codigo: string) => `${window.location.origin}/mesa/${codigo}`;

/** Extrai o código da mesa de um QR (link completo ou só o código). */
export const codigoDaMesa = (texto: string) => {
  const t = texto.trim();
  const m = t.match(/\/mesa\/([A-Za-z0-9]+)/);
  return (m ? m[1] : t).toUpperCase();
};

export const minutosDesde = (iso: string) => Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60000));

/** Pedido com a origem (mesa ou nome da comanda), usado nas filas do Job. */
export interface ItemFila extends ItemPedido {
  atualizado_em: string;
  pedido: {
    id: string;
    numero: number;
    modalidade: Modalidade;
    usuario_id: string | null;
    observacao: string | null;
    criado_em: string;
    comanda: { id: string; nome: string | null; mesa: { numero: string } | null } | null;
  } | null;
}

export const CAMPOS_ITEM_FILA =
  "id, nome, preco, quantidade, observacao, destino, situacao, pronto_em, saiu_em, entregue_em, entrega_por_qr, motivo_cancelamento, atualizado_em, pedido:pedidos(id, numero, modalidade, usuario_id, observacao, criado_em, comanda:comandas(id, nome, mesa:mesas(numero)))";

export const normalizarItensFila = (dados: unknown[] | null): ItemFila[] =>
  ((dados ?? []) as ItemFila[]).filter((i) => i.pedido).map((i) => ({ ...i, preco: Number(i.preco) }));

export const origemDoItem = (i: ItemFila) =>
  i.pedido?.comanda?.mesa ? `Mesa ${i.pedido.comanda.mesa.numero}` : i.pedido?.comanda?.nome ?? "Balcão";

export async function mudarItens(itens: string[], acao: "iniciar" | "liberar" | "saiu" | "voltar" | "entregar" | "cancelar", motivo?: string) {
  return supabase.rpc("mudar_itens", { p_itens: itens, p_acao: acao, p_motivo: motivo ?? null });
}
