import { Activity, BookOpen, Boxes, Building2, CalendarDays, Headset, Library, LifeBuoy, LucideIcon, Megaphone, ReceiptText, Settings, ShieldCheck, Store, Users, UtensilsCrossed, Wallet } from "lucide-react";
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
    grupos: [
      { nome: "Meu negócio", itens: [{ codigo: "G1001", nome: "Perfil do estabelecimento" }, { codigo: "C8001", nome: "Indicadores" }] },
      { nome: "RoVibes", itens: [{ codigo: "G1004", nome: "Ajuda RoVibes" }] },
    ],
  },
];

/** Gestão RoVibes (/gestao): áreas da operação da plataforma. O id é a área de permissão do cargo. */
const sit = (codigo: string) => ({ codigo, nome: "Situações" });
export const AREAS_GESTAO: AreaNegocio[] = [
  { id: "atendimento", nome: "Atendimento", icone: Headset, cor: "#0EA5E9", plataforma: true, grupos: [{ nome: "Atendimento", itens: [sit("S2101")] }] },
  {
    id: "suporte",
    nome: "Suporte",
    icone: LifeBuoy,
    cor: "#7C3AED",
    plataforma: true,
    grupos: [{ nome: "Suporte", itens: [sit("S2102"), { codigo: "S2202", nome: "Modo suporte ativo" }] }],
  },
  { id: "operacao", nome: "Operação", icone: Activity, cor: "#15803D", plataforma: true, grupos: [{ nome: "Operação", itens: [{ codigo: "S2201", nome: "Saúde" }, sit("S2103")] }] },
  {
    id: "estabelecimentos",
    nome: "Estabelecimentos",
    icone: Store,
    cor: "#1D4ED8",
    plataforma: true,
    grupos: [{ nome: "Estabelecimentos", itens: [{ codigo: "S2203", nome: "Fichas" }, { codigo: "A1001", nome: "Aprovação" }, { codigo: "A1002", nome: "Todos" }, sit("S2104")] }],
  },
  {
    id: "usuarios",
    nome: "Usuários e acessos",
    icone: Users,
    cor: "#0891B2",
    plataforma: true,
    grupos: [{ nome: "Usuários", itens: [{ codigo: "S2204", nome: "Contas dos estabelecimentos" }, sit("S2105")] }],
  },
  {
    id: "produto",
    nome: "Produto",
    icone: Library,
    cor: "#0F766E",
    plataforma: true,
    grupos: [{ nome: "Produto", itens: [{ codigo: "A1005", nome: "Biblioteca de produtos" }, { codigo: "A1004", nome: "Vibes e categorias" }, { codigo: "A1006", nome: "Músicas" }, sit("S2106")] }],
  },
  { id: "financeiro", nome: "Financeiro", icone: Wallet, cor: "#B45309", plataforma: true, grupos: [{ nome: "Financeiro", itens: [sit("S2107"), { codigo: "A1007", nome: "Eventos de pessoas" }] }] },
  { id: "seguranca", nome: "Segurança", icone: ShieldCheck, cor: "#B4234A", plataforma: true, grupos: [{ nome: "Segurança", itens: [{ codigo: "A1003", nome: "Denúncias" }, sit("S2108")] }] },
  { id: "conhecimento", nome: "Conhecimento", icone: BookOpen, cor: "#9333EA", plataforma: true, grupos: [{ nome: "Conhecimento", itens: [{ codigo: "S2205", nome: "Base de conhecimento" }] }] },
  {
    id: "configuracoes",
    nome: "Configurações",
    icone: Settings,
    cor: "#334155",
    plataforma: true,
    grupos: [{ nome: "Configurações", itens: [{ codigo: "A1008", nome: "Organização" }, { codigo: "S2206", nome: "Inteligência" }] }],
  },
];

/** Área de situações de cada código "Situações" (S21xx). */
export const AREA_DAS_SITUACOES: Record<string, string> = {
  S2101: "atendimento",
  S2102: "suporte",
  S2103: "operacao",
  S2104: "estabelecimentos",
  S2105: "usuarios",
  S2106: "produto",
  S2107: "financeiro",
  S2108: "seguranca",
};

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
