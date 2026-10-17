import { Movimento } from "@/components/Marca";

// Dados de exemplo apenas para avaliar o visual. Somem quando o banco entrar.
export interface LugarExemplo {
  id: string;
  nome: string;
  categoria: string;
  bairro: string;
  distancia: string;
  movimento: Movimento;
  vibes: string[];
  aberto: string;
  x: number;
  y: number;
}

export const LUGARES: LugarExemplo[] = [
  { id: "1", nome: "Casa Aurora", categoria: "Bar", bairro: "Centro", distancia: "1,2 km", movimento: "cheio", vibes: ["Animado", "Música ao vivo"], aberto: "até 2h", x: 38, y: 42 },
  { id: "2", nome: "Varanda 38", categoria: "Restaurante", bairro: "Fundinho", distancia: "2,0 km", movimento: "moderado", vibes: ["Tranquilo", "Romântico"], aberto: "até 0h", x: 62, y: 30 },
  { id: "3", nome: "Galpão Norte", categoria: "Casa de shows", bairro: "Brasil", distancia: "3,4 km", movimento: "tranquilo", vibes: ["Balada"], aberto: "abre às 22h", x: 52, y: 64 },
  { id: "4", nome: "Quintal do Bosque", categoria: "Bar", bairro: "Santa Mônica", distancia: "4,1 km", movimento: "moderado", vibes: ["Happy hour", "Ao ar livre"], aberto: "até 1h", x: 74, y: 56 },
];

export interface EventoExemplo {
  id: string;
  nome: string;
  lugar: string;
  quando: string;
  confirmados: number;
}

export const EVENTOS: EventoExemplo[] = [
  { id: "e1", nome: "Samba de roda", lugar: "Casa Aurora", quando: "Hoje, 20h", confirmados: 84 },
  { id: "e2", nome: "Noite eletrônica", lugar: "Galpão Norte", quando: "Hoje, 23h", confirmados: 212 },
  { id: "e3", nome: "Jazz no quintal", lugar: "Quintal do Bosque", quando: "Amanhã, 19h", confirmados: 47 },
];

export const FILTROS = ["Hoje", "Perto de mim", "Aberto agora", "Música ao vivo", "Happy hour", "Tranquilo", "Balada"];
