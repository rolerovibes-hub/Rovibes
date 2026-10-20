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
export type SituacaoItem = "aguardando" | "recebido" | "preparo" | "pronto" | "saiu" | "entregue" | "cancelado";
export type Modalidade = "mesa" | "retirada";

export const NOME_DESTINO: Record<Destino, string> = { cozinha: "Cozinha", bar: "Bar", sem_preparo: "Sem preparo" };

export const NOME_SITUACAO_ITEM: Record<SituacaoItem, string> = {
  aguardando: "Aguardando pagamento",
  recebido: "Recebido",
  preparo: "Em preparo",
  pronto: "Pronto",
  saiu: "Saiu para entrega",
  entregue: "Entregue",
  cancelado: "Cancelado",
};

export const COR_SITUACAO_ITEM: Record<SituacaoItem, string> = {
  aguardando: "text-alerta",
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
  bloqueado: boolean;
  entregador_id: string | null;
  estornado: boolean;
  refeito: number;
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
  servico: number;
  taxa_servico: number;
  total: number;
  pago: number;
  falta: number;
  pessoas: number;
  meu_subtotal: number;
  minha_parte_itens: number;
  minha_parte_igual: number;
  pendente: number;
}

export interface PagamentoComanda {
  id: string;
  origem: "app" | "caixa";
  meio: "pix" | "credito" | "debito" | "dinheiro" | "outro" | null;
  modo: string | null;
  valor: number;
  situacao: "aprovado" | "cancelado" | "estornado";
  criado_em: string;
  quem: string | null;
  minha: boolean;
  observacao: string | null;
}

export const NOME_MEIO: Record<string, string> = { pix: "Pix", credito: "Crédito", debito: "Débito", dinheiro: "Dinheiro", outro: "Outro" };

export async function buscarPagamentos(comanda: string): Promise<PagamentoComanda[]> {
  const { data } = await supabase.rpc("pagamentos_comanda", { p_comanda: comanda });
  return ((data ?? []) as PagamentoComanda[]).map((p) => ({ ...p, valor: Number(p.valor) }));
}

/** "FALTA_PAGAR:12,34" vindo do banco ao fechar uma comanda com saldo. */
export const faltaAoFechar = (msg: string) => msg.match(/FALTA_PAGAR:([\d.,]+)/)?.[1] ?? null;

export const CAMPOS_PEDIDO =
  "id, envio_id, numero, setor, modalidade, usuario_id, lancado_por, observacao, situacao, motivo_cancelamento, criado_em, atualizado_em, itens:pedido_itens(id, nome, preco, quantidade, observacao, destino, situacao, pronto_em, saiu_em, entregue_em, entrega_por_qr, motivo_cancelamento, bloqueado, entregador_id, estornado, refeito)";

export const normalizarPedidos = (dados: unknown[] | null): Pedido[] =>
  ((dados ?? []) as Pedido[]).map((p) => ({ ...p, itens: (p.itens ?? []).map((i) => ({ ...i, preco: Number(i.preco) })) }));

export const totalDoPedido = (p: Pedido) => p.itens.reduce((s, i) => s + (i.situacao === "cancelado" ? 0 : i.preco * i.quantidade), 0);

export async function buscarTotais(comanda: string): Promise<Totais> {
  const { data } = await supabase.rpc("totais_comanda", { p_comanda: comanda });
  const t = ((data ?? []) as Record<string, unknown>[])[0] ?? {};
  const n = (k: string) => Number(t[k] ?? 0);
  // Antes da atualização 017 não há serviço/pagamentos: falta = total.
  return {
    subtotal: n("subtotal"),
    desconto: n("desconto"),
    servico: n("servico"),
    taxa_servico: n("taxa_servico"),
    total: n("total"),
    pago: n("pago"),
    falta: t.falta === undefined ? n("total") : n("falta"),
    pessoas: n("pessoas") || 1,
    meu_subtotal: n("meu_subtotal"),
    minha_parte_itens: t.minha_parte_itens === undefined ? n("meu_subtotal") : n("minha_parte_itens"),
    minha_parte_igual: n("minha_parte_igual"),
    pendente: n("pendente"),
  };
}

/** Recarrega quando pedidos ou comandas mudam no banco (tempo real), com um recarregamento periódico de reserva. */
export function useAoVivo(nome: string, filtro: { pedidos?: string; comandas?: string; itens?: string; pagamentos?: string }, recarregar: () => void, ativo = true) {
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
    if (filtro.pagamentos) canal = canal.on("postgres_changes", { event: "*", schema: "public", table: "pagamentos", filter: filtro.pagamentos }, avisar);
    canal.subscribe();
    const reserva = window.setInterval(() => callback.current(), 30000);
    return () => {
      window.clearTimeout(espera);
      window.clearInterval(reserva);
      void supabase.removeChannel(canal);
    };
  }, [nome, filtro.pedidos, filtro.comandas, filtro.itens, filtro.pagamentos, ativo]);
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
  "id, nome, preco, quantidade, observacao, destino, situacao, pronto_em, saiu_em, entregue_em, entrega_por_qr, motivo_cancelamento, bloqueado, entregador_id, estornado, refeito, atualizado_em, pedido:pedidos(id, numero, modalidade, usuario_id, observacao, criado_em, comanda:comandas(id, nome, mesa:mesas(numero)))";

export const normalizarItensFila = (dados: unknown[] | null): ItemFila[] =>
  ((dados ?? []) as ItemFila[]).filter((i) => i.pedido).map((i) => ({ ...i, preco: Number(i.preco) }));

export const origemDoItem = (i: ItemFila) =>
  i.pedido?.comanda?.mesa ? `Mesa ${i.pedido.comanda.mesa.numero}` : i.pedido?.comanda?.nome ?? "Balcão";

export async function mudarItens(itens: string[], acao: "iniciar" | "liberar" | "saiu" | "voltar" | "entregar" | "cancelar", motivo?: string) {
  return supabase.rpc("mudar_itens", { p_itens: itens, p_acao: acao, p_motivo: motivo ?? null });
}

export type TipoOcorrencia = "cancelamento" | "nao_localizado" | "cliente_nao_encontrado" | "item_errado" | "qr_falhou" | "outro";

export const NOME_OCORRENCIA: Record<TipoOcorrencia, string> = {
  cancelamento: "Pedido de cancelamento",
  nao_localizado: "Item não localizado",
  cliente_nao_encontrado: "Cliente não encontrado",
  item_errado: "Item errado",
  qr_falhou: "QR não funciona",
  outro: "Outro problema",
};

export async function abrirOcorrencia(itens: string[], tipo: TipoOcorrencia, descricao?: string) {
  return supabase.rpc("abrir_ocorrencia", { p_itens: itens, p_tipo: tipo, p_descricao: descricao ?? null });
}

/** Cancela direto quando pode; depois do preparo (sem supervisão) vira pedido de cancelamento. */
export async function cancelarOuPedir(item: ItemPedido, supervisor: boolean) {
  const motivo = window.prompt(item.situacao === "recebido" || supervisor ? "Motivo do cancelamento:" : "O item já está em preparo. Motivo do pedido de cancelamento (vai para a supervisão):");
  if (!motivo?.trim()) return { error: null, pedido: false };
  const direto = supervisor || item.situacao === "recebido" || (item.situacao === "pronto" && item.destino === "sem_preparo");
  const { error } = direto ? await mudarItens([item.id], "cancelar", motivo) : await abrirOcorrencia([item.id], "cancelamento", motivo);
  return { error, pedido: !direto };
}

/** Como o estabelecimento entrega os pedidos: na mesa, no balcão ou o cliente escolhe (atualização 028). */
export type RegraEntrega = "mesa" | "retirada" | "cliente";
export const NOME_REGRA_ENTREGA: Record<RegraEntrega, { nome: string; texto: string }> = {
  mesa: { nome: "Entrega na mesa", texto: "A equipe leva os pedidos até a mesa." },
  retirada: { nome: "Retirada no balcão", texto: "O cliente retira no balcão com o QR code do pedido." },
  cliente: { nome: "O cliente escolhe", texto: "No pedido, o cliente escolhe entre mesa e balcão." },
};
export async function buscarRegraEntrega(estab: string): Promise<RegraEntrega> {
  const { data, error } = await supabase.from("estabelecimentos").select("entrega_pedidos").eq("id", estab).maybeSingle();
  // Antes da atualização 028 o cliente escolhia.
  if (error || !data) return "cliente";
  return ((data as { entrega_pedidos: RegraEntrega }).entrega_pedidos ?? "mesa") as RegraEntrega;
}

// ------------------------------------------------------------
// Modelo de atendimento do lugar (atualização 035)
// ------------------------------------------------------------
export interface ModeloAtendimento {
  tem_mesas: boolean;
  exige_qr: boolean;
  /** comanda = paga no fim; prepago = paga cada pedido na hora (sem mesas é sempre pré-pago). */
  pagamento: "comanda" | "prepago";
  entrega: RegraEntrega;
  mesas: { id: string; numero: string; area: string | null }[] | null;
  minha_comanda: string | null;
}

/** null = banco sem a 035 (vale o jeito antigo: mesa com QR e comanda). */
export async function buscarModelo(estab: string): Promise<ModeloAtendimento | null> {
  const { data, error } = await supabase.rpc("modelo_atendimento", { p_estab: estab });
  if (error || !data) return null;
  return data as ModeloAtendimento;
}

/** Paga um pedido pré-pago no Mercado Pago. Devolve o link de pagamento, ou liberado=true se o cupom cobriu tudo. */
export async function pagarPedido(pedido: string): Promise<{ url?: string; liberado?: boolean; comanda?: string }> {
  const { data, error } = await supabase.functions.invoke("mp-pagar", { body: { pedido } });
  if (error || !(data as { url?: string; liberado?: boolean })?.url && !(data as { liberado?: boolean })?.liberado) {
    let msg = (data as { erro?: string } | null)?.erro;
    if (!msg && error && "context" in error) {
      try {
        msg = ((await (error as { context: Response }).context.json()) as { erro?: string }).erro;
      } catch {
        /* sem detalhe */
      }
    }
    throw new Error(msg ?? "Não foi possível iniciar o pagamento agora.");
  }
  return data as { url?: string; liberado?: boolean; comanda?: string };
}

/** Pedido montado no cardápio, guardado até a pessoa entrar na comanda (mesa, balcão ou QR). */
export function guardarCarrinho(estab: string, itens: Record<string, number>) {
  try {
    sessionStorage.setItem(`rovibes:carrinho:${estab}`, JSON.stringify({ itens, em: Date.now() }));
  } catch {
    /* sem armazenamento */
  }
}
export function pegarCarrinho(estab: string): Record<string, number> | null {
  try {
    const bruto = sessionStorage.getItem(`rovibes:carrinho:${estab}`);
    if (!bruto) return null;
    sessionStorage.removeItem(`rovibes:carrinho:${estab}`);
    const d = JSON.parse(bruto) as { itens: Record<string, number>; em: number };
    return Date.now() - d.em < 2 * 3600 * 1000 ? d.itens : null;
  } catch {
    return null;
  }
}
