import {
  Award,
  Building2,
  CalendarDays,
  Armchair,
  BadgePercent,
  Boxes,
  Film,
  Flag,
  ListOrdered,
  PackageCheck,
  ShieldAlert,
  LucideIcon,
  MessagesSquare,
  Newspaper,
  Radio,
  ShieldCheck,
  Store,
  Tags,
  Ticket,
  TrendingUp,
  UserRound,
  Users,
  UtensilsCrossed,
} from "lucide-react";

// Catálogo único de aplicativos do Business e da Administração.
// A primeira letra do código é a natureza: C consulta, G gestão, T transação, A administração.
export type Area = "Estabelecimento" | "Vitrine" | "Conteúdo" | "Operação" | "Equipe" | "Administração";

export interface Aplicativo {
  codigo: string;
  nome: string;
  area: Area;
  icone: LucideIcon;
  fase: number;
  /** Aplicativos que todo usuário tem, fora da matriz de permissões. */
  padrao?: boolean;
}

export const CATALOGO: Aplicativo[] = [
  { codigo: "G1001", nome: "Perfil do estabelecimento", area: "Estabelecimento", icone: Store, fase: 2 },
  { codigo: "G1002", nome: "Meu perfil", area: "Equipe", icone: UserRound, fase: 1, padrao: true },
  { codigo: "T2001", nome: "Mensagens", area: "Equipe", icone: MessagesSquare, fase: 6, padrao: true },
  { codigo: "G3001", nome: "Equipe e permissões", area: "Equipe", icone: Users, fase: 5 },
  { codigo: "G4001", nome: "Cardápio e produtos", area: "Vitrine", icone: UtensilsCrossed, fase: 2 },
  { codigo: "G4002", nome: "Estoque", area: "Operação", icone: Boxes, fase: 5 },
  { codigo: "G5001", nome: "Eventos", area: "Vitrine", icone: CalendarDays, fase: 2 },
  { codigo: "T5002", nome: "Status ao vivo", area: "Operação", icone: Radio, fase: 3 },
  { codigo: "G5003", nome: "Promoções e cupons", area: "Vitrine", icone: BadgePercent, fase: 4 },
  { codigo: "G5004", nome: "Ingressos", area: "Vitrine", icone: Ticket, fase: 4 },
  { codigo: "G6001", nome: "Publicações", area: "Conteúdo", icone: Newspaper, fase: 3 },
  { codigo: "G6002", nome: "Stories", area: "Conteúdo", icone: Film, fase: 3 },
  { codigo: "T7001", nome: "Mesas e comandas", area: "Operação", icone: Armchair, fase: 5 },
  { codigo: "T7002", nome: "Fila de pedidos", area: "Operação", icone: ListOrdered, fase: 5 },
  { codigo: "T7003", nome: "Entregas", area: "Operação", icone: PackageCheck, fase: 5 },
  { codigo: "T7004", nome: "Supervisão da operação", area: "Operação", icone: ShieldAlert, fase: 5 },
  { codigo: "C8001", nome: "Indicadores", area: "Estabelecimento", icone: TrendingUp, fase: 3 },
  { codigo: "G9001", nome: "Programa de pontos", area: "Vitrine", icone: Award, fase: 4 },
  { codigo: "A1001", nome: "Aprovação de estabelecimentos", area: "Administração", icone: ShieldCheck, fase: 1 },
  { codigo: "A1002", nome: "Estabelecimentos", area: "Administração", icone: Building2, fase: 2 },
  { codigo: "A1003", nome: "Denúncias", area: "Administração", icone: Flag, fase: 6 },
  { codigo: "A1004", nome: "Vibes e categorias", area: "Administração", icone: Tags, fase: 2 },
];

export const AREAS: Area[] = ["Estabelecimento", "Vitrine", "Conteúdo", "Operação", "Equipe", "Administração"];

export const porCodigo = (codigo: string) => CATALOGO.find((a) => a.codigo === codigo);

const normalizar = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

export function buscar(lista: Aplicativo[], termo: string) {
  const t = normalizar(termo.trim());
  if (!t) return [];
  return lista.filter((a) => normalizar(a.codigo).includes(t) || normalizar(a.nome).includes(t) || normalizar(a.area).includes(t));
}
