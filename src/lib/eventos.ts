import { supabase } from "./supabase";

/** Categorias de evento (a mesma lista no Business e no App). */
export const CATEGORIAS_EVENTO = [
  "Show ao vivo",
  "Festa",
  "Pagode/Samba",
  "Sertanejo",
  "Eletrônica",
  "Funk",
  "Rock",
  "Stand-up",
  "Telão/Jogo",
  "Karaokê",
  "Gastronomia",
  "Happy hour",
  "Outro",
];

/** Situação que aparece para o gestor: as de data e vagas são calculadas sozinhas. */
export type EstadoEvento = "rascunho" | "agendado" | "andamento" | "esgotado" | "encerrado" | "cancelado";

export const NOME_ESTADO: Record<EstadoEvento, string> = {
  rascunho: "Rascunho",
  agendado: "Agendado",
  andamento: "Acontecendo agora",
  esgotado: "Esgotado",
  encerrado: "Encerrado",
  cancelado: "Cancelado",
};

/** Sem horário de término, considera 6 horas de evento. */
export const fimEfetivo = (e: { inicio: string; fim: string | null }) => (e.fim ? Date.parse(e.fim) : Date.parse(e.inicio) + 6 * 3600 * 1000);

export function estadoEvento(e: { inicio: string; fim: string | null; situacao: string }, n?: { vendidos: number; vagas: number | null }, agora = Date.now()): EstadoEvento {
  if (e.situacao === "rascunho") return "rascunho";
  if (e.situacao === "cancelado") return "cancelado";
  if (fimEfetivo(e) <= agora) return "encerrado";
  if (Date.parse(e.inicio) <= agora) return "andamento";
  if (n && n.vagas != null && n.vendidos >= n.vagas) return "esgotado";
  return "agendado";
}

/** "em 9 dias", "amanhã", "hoje". */
export function falta(inicio: string, agora = Date.now()) {
  const dia = (t: number) => {
    const d = new Date(t);
    return Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000;
  };
  const n = dia(Date.parse(inicio)) - dia(agora);
  return n <= 0 ? "hoje" : n === 1 ? "amanhã" : `em ${n} dias`;
}

/** "Sábado, 31 de outubro" e "21:00 até 03:00 de domingo". */
export function textoData(inicio: string, fim: string | null) {
  const i = new Date(inicio);
  const dia = i.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
  const hora = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  let horario = hora(i);
  if (fim) {
    const f = new Date(fim);
    const outroDia = f.toDateString() !== i.toDateString();
    horario += ` até ${hora(f)}${outroDia ? ` de ${f.toLocaleDateString("pt-BR", { weekday: "long" })}` : ""}`;
  }
  return { dia: dia.charAt(0).toUpperCase() + dia.slice(1), horario };
}

export interface InteresseEvento {
  total: number;
  eu: boolean;
  amigos_total: number;
  amigos: { id: string; nome: string; foto_url: string | null }[];
}

export async function interesseEvento(evento: string): Promise<InteresseEvento | null> {
  const { data, error } = await supabase.rpc("interesse_evento", { p_evento: evento });
  return error ? null : (data as InteresseEvento);
}

export async function alternarInteresse(evento: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("alternar_interesse_evento", { p_evento: evento });
  if (error) throw error;
  return data as boolean;
}

/** Conta uma visualização (uma por pessoa por dia; a equipe do lugar não conta). */
export const verEvento = (evento: string) => void supabase.rpc("ver_evento", { p_evento: evento }).then(() => undefined);
