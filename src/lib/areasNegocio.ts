import { Boxes, Building2, CalendarDays, Library, LucideIcon, Megaphone, Music, Network, ReceiptText, ShieldCheck, Store, Users, UtensilsCrossed, Wallet } from "lucide-react";
import { Aplicativo, porCodigo } from "./catalogo";

/**
 * Business organizado por áreas de negócio: cada área junta os apps (agora "partes") da mesma responsabilidade.
 * As permissões continuam pelos códigos dos apps: a pessoa vê a área se puder usar alguma parte dela.
 */
export interface GrupoArea {
  nome: string;
  itens: { codigo: string; nome?: string }[];
}

export interface AreaNegocio {
  id: string;
  nome: string;
  icone: LucideIcon;
  /** Cor sólida do bloco na Área de Trabalho. */
  cor: string;
  grupos: GrupoArea[];
  /** Só para a equipe RoVibes. */
  plataforma?: boolean;
}

export const AREAS_NEGOCIO: AreaNegocio[] = [
  {
    id: "produtos-estoque",
    nome: "Produtos e Estoque",
    icone: Boxes,
    cor: "#0F766E",
    grupos: [
      { nome: "Produtos", itens: [{ codigo: "G4003", nome: "Meus produtos" }] },
      { nome: "Estoque", itens: [{ codigo: "G4002", nome: "Estoque e locais" }, { codigo: "T4004", nome: "Movimentações" }] },
    ],
  },
  {
    id: "vendas-pedidos",
    nome: "Vendas e Pedidos",
    icone: ReceiptText,
    cor: "#B45309",
    grupos: [
      { nome: "Venda", itens: [{ codigo: "G4001", nome: "Cardápio" }] },
      { nome: "Pedidos", itens: [{ codigo: "T7002", nome: "Fila de pedidos" }, { codigo: "T7003", nome: "Entregas" }] },
    ],
  },
  {
    id: "atendimento-operacao",
    nome: "Atendimento e Operação",
    icone: UtensilsCrossed,
    cor: "#BE123C",
    grupos: [
      { nome: "Agora", itens: [{ codigo: "T7004", nome: "Supervisão" }, { codigo: "T5002", nome: "Status ao vivo" }] },
      { nome: "Salão", itens: [{ codigo: "T7001", nome: "Mesas e comandas" }, { codigo: "T7005", nome: "Caixa" }] },
    ],
  },
  {
    id: "marketing-vitrine",
    nome: "Marketing e Vitrine",
    icone: Megaphone,
    cor: "#7C3AED",
    grupos: [
      { nome: "Conteúdo", itens: [{ codigo: "G6001", nome: "Publicações" }, { codigo: "G6002", nome: "Stories" }] },
      { nome: "Campanhas", itens: [{ codigo: "G5003", nome: "Promoções e cupons" }] },
      { nome: "Fidelidade", itens: [{ codigo: "G9001", nome: "Programa de pontos" }] },
    ],
  },
  {
    id: "eventos",
    nome: "Eventos",
    icone: CalendarDays,
    cor: "#9333EA",
    grupos: [{ nome: "Eventos", itens: [{ codigo: "G5001", nome: "Eventos" }, { codigo: "G5004", nome: "Ingressos" }, { codigo: "T5005", nome: "Listas e portaria" }] }],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    icone: Wallet,
    cor: "#15803D",
    grupos: [{ nome: "Recebimentos", itens: [{ codigo: "G1003", nome: "Pagamentos" }] }],
  },
  {
    id: "pessoas-equipe",
    nome: "Pessoas e Equipe",
    icone: Users,
    cor: "#1D4ED8",
    grupos: [
      { nome: "Equipe", itens: [{ codigo: "G3001", nome: "Equipe e funções" }] },
      { nome: "Comunicação", itens: [{ codigo: "T2001", nome: "Mensagens" }, { codigo: "T2002", nome: "Chat ao vivo" }] },
      { nome: "Minha conta", itens: [{ codigo: "G1002", nome: "Meu perfil" }] },
    ],
  },
  {
    id: "gestao",
    nome: "Gestão do Estabelecimento",
    icone: Building2,
    cor: "#334155",
    grupos: [{ nome: "Meu negócio", itens: [{ codigo: "G1001", nome: "Perfil do estabelecimento" }, { codigo: "C8001", nome: "Indicadores" }] }],
  },
];

/** Gestão RoVibes (sistema da equipe da plataforma, em /gestao). */
export const AREAS_GESTAO: AreaNegocio[] = [
  {
    id: "estabelecimentos",
    nome: "Estabelecimentos",
    icone: Store,
    cor: "#1D4ED8",
    plataforma: true,
    grupos: [{ nome: "Estabelecimentos", itens: [{ codigo: "A1001", nome: "Aprovação" }, { codigo: "A1002", nome: "Todos" }] }],
  },
  {
    id: "moderacao",
    nome: "Moderação",
    icone: ShieldCheck,
    cor: "#B4234A",
    plataforma: true,
    grupos: [{ nome: "Moderação", itens: [{ codigo: "A1003", nome: "Denúncias" }, { codigo: "A1007", nome: "Eventos de pessoas" }] }],
  },
  {
    id: "catalogo",
    nome: "Catálogo global",
    icone: Library,
    cor: "#0F766E",
    plataforma: true,
    grupos: [{ nome: "Catálogo", itens: [{ codigo: "A1005", nome: "Biblioteca de produtos" }, { codigo: "A1004", nome: "Vibes e categorias" }] }],
  },
  {
    id: "conteudo",
    nome: "Conteúdo da plataforma",
    icone: Music,
    cor: "#7C3AED",
    plataforma: true,
    grupos: [{ nome: "Conteúdo", itens: [{ codigo: "A1006", nome: "Músicas dos vídeos" }] }],
  },
  {
    id: "organizacao",
    nome: "Organização",
    icone: Network,
    cor: "#334155",
    plataforma: true,
    grupos: [{ nome: "Organização", itens: [{ codigo: "A1008", nome: "Cargos e usuários" }] }],
  },
];

export const areaPorId = (id: string, lista: AreaNegocio[] = AREAS_NEGOCIO) => lista.find((a) => a.id === id);

/** Área e nome da parte para um código de app. */
export function ondeFica(codigo: string, lista: AreaNegocio[] = AREAS_NEGOCIO): { area: AreaNegocio; nome: string } | null {
  for (const area of lista)
    for (const g of area.grupos)
      for (const i of g.itens) if (i.codigo === codigo) return { area, nome: i.nome ?? porCodigo(codigo)?.nome ?? codigo };
  return null;
}

export const linkDoApp = (codigo: string) => {
  const o = ondeFica(codigo);
  return o ? `/business/area/${o.area.id}/${codigo}` : `/business`;
};

/** Partes da área que a pessoa pode usar. */
export function partesLiberadas(area: AreaNegocio, temAcesso: (a: Aplicativo) => boolean) {
  return area.grupos
    .map((g) => ({ ...g, itens: g.itens.filter((i) => { const app = porCodigo(i.codigo); return !!app && temAcesso(app); }) }))
    .filter((g) => g.itens.length > 0);
}
