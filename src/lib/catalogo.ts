import {
  ArrowRightLeft,
  Music,
  PartyPopper,
  Award,
  Building2,
  CalendarDays,
  CreditCard,
  Armchair,
  BadgePercent,
  Boxes,
  Film,
  Flag,
  ListOrdered,
  PackageCheck,
  PackagePlus,
  ShieldAlert,
  LucideIcon,
  MessagesSquare,
  Newspaper,
  Radio,
  ClipboardList,
  ShieldCheck,
  Store,
  Tags,
  Library,
  Ticket,
  TrendingUp,
  UserRound,
  Users,
  UtensilsCrossed,
  Wallet,
  UserCog,
  LifeBuoy,
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
  { codigo: "G1003", nome: "Pagamentos", area: "Estabelecimento", icone: CreditCard, fase: 7 },
  { codigo: "G1004", nome: "Ajuda RoVibes", area: "Estabelecimento", icone: LifeBuoy, fase: 9, padrao: true },
  { codigo: "G1002", nome: "Meu perfil", area: "Equipe", icone: UserRound, fase: 1, padrao: true },
  { codigo: "T2001", nome: "Mensagens", area: "Equipe", icone: MessagesSquare, fase: 6 },
  { codigo: "T2002", nome: "Chat ao vivo", area: "Equipe", icone: Radio, fase: 6 },
  { codigo: "T5005", nome: "Listas de presença", area: "Operação", icone: ClipboardList, fase: 6 },
  { codigo: "G3001", nome: "Equipe e permissões", area: "Equipe", icone: Users, fase: 5 },
  { codigo: "G4001", nome: "Cardápio e produtos", area: "Vitrine", icone: UtensilsCrossed, fase: 2 },
  { codigo: "G4002", nome: "Estoque", area: "Operação", icone: Boxes, fase: 5 },
  { codigo: "G4003", nome: "Meus produtos", area: "Operação", icone: PackagePlus, fase: 5 },
  { codigo: "T4004", nome: "Movimentação de estoque", area: "Operação", icone: ArrowRightLeft, fase: 5 },
  { codigo: "G5001", nome: "Eventos", area: "Vitrine", icone: CalendarDays, fase: 2 },
  { codigo: "T5002", nome: "Status ao vivo", area: "Operação", icone: Radio, fase: 3 },
  { codigo: "G5003", nome: "Promoções e cupons", area: "Vitrine", icone: BadgePercent, fase: 4 },
  { codigo: "G5004", nome: "Ingressos", area: "Vitrine", icone: Ticket, fase: 4 },
  { codigo: "G6001", nome: "Publicações", area: "Conteúdo", icone: Newspaper, fase: 3 },
  { codigo: "G6002", nome: "Stories", area: "Conteúdo", icone: Film, fase: 3 },
  { codigo: "T7001", nome: "Mesas e comandas", area: "Operação", icone: Armchair, fase: 5 },
  { codigo: "T7002", nome: "Fila de pedidos", area: "Operação", icone: ListOrdered, fase: 5 },
  { codigo: "T7003", nome: "Entregas", area: "Operação", icone: PackageCheck, fase: 5 },
  { codigo: "T7004", nome: "Supervisão (todas as ações)", area: "Operação", icone: ShieldAlert, fase: 5 },
  { codigo: "T7005", nome: "Caixa", area: "Operação", icone: Wallet, fase: 7 },
  { codigo: "C8001", nome: "Indicadores", area: "Estabelecimento", icone: TrendingUp, fase: 3 },
  { codigo: "G9001", nome: "Programa de pontos", area: "Vitrine", icone: Award, fase: 4 },
  { codigo: "A1001", nome: "Aprovação de estabelecimentos", area: "Administração", icone: ShieldCheck, fase: 1 },
  { codigo: "A1002", nome: "Estabelecimentos", area: "Administração", icone: Building2, fase: 2 },
  { codigo: "A1003", nome: "Denúncias", area: "Administração", icone: Flag, fase: 6 },
  { codigo: "A1004", nome: "Vibes e categorias", area: "Administração", icone: Tags, fase: 2 },
  { codigo: "A1005", nome: "Biblioteca de produtos", area: "Administração", icone: Library, fase: 5 },
  { codigo: "A1006", nome: "Músicas dos vídeos", area: "Administração", icone: Music, fase: 6 },
  { codigo: "A1007", nome: "Eventos de pessoas", area: "Administração", icone: PartyPopper, fase: 7 },
  { codigo: "A1008", nome: "Organização", area: "Administração", icone: UserCog, fase: 8 },
  // Gestão RoVibes · Central de operação (as permissões vêm do nível do cargo em cada área)
  { codigo: "S2101", nome: "Situações · Atendimento", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2102", nome: "Situações · Suporte", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2103", nome: "Situações · Operação", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2104", nome: "Situações · Estabelecimentos", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2105", nome: "Situações · Usuários", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2106", nome: "Situações · Produto", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2107", nome: "Situações · Financeiro", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2108", nome: "Situações · Segurança", area: "Administração", icone: ClipboardList, fase: 9 },
  { codigo: "S2201", nome: "Saúde da plataforma", area: "Administração", icone: TrendingUp, fase: 9 },
  { codigo: "S2202", nome: "Modo suporte ativo", area: "Administração", icone: ShieldCheck, fase: 9 },
  { codigo: "S2203", nome: "Fichas dos estabelecimentos", area: "Administração", icone: Building2, fase: 9 },
  { codigo: "S2204", nome: "Contas dos estabelecimentos", area: "Administração", icone: Users, fase: 9 },
  { codigo: "S2205", nome: "Base de conhecimento", area: "Administração", icone: Library, fase: 9 },
  { codigo: "S2206", nome: "Inteligência", area: "Administração", icone: TrendingUp, fase: 9 },
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
