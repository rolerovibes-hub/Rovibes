import { supabase } from "./supabase";
import { reduzirImagem } from "./imagens";

export type PapelAoVivo = "moderador" | "participante" | "previa" | "previa_encerrada" | "expulso" | "fechado" | "equipe_fechado";

export interface EntradaAoVivo {
  sala: string | null;
  papel: PapelAoVivo;
  previa_ate?: string | null;
  silenciado_ate?: string | null;
  abriu_em?: string;
  fecha_previsto?: string;
  fixada_id?: string | null;
  estab: { id: string; nome: string; logo_url: string | null };
}

export interface MensagemAoVivo {
  id: string;
  usuario_id: string | null;
  nome: string | null;
  usuario: string | null;
  foto_url: string | null;
  moderador: boolean;
  tipo: "texto" | "foto" | "musica" | "ambiente" | "enquete" | "sistema";
  texto: string | null;
  foto_path: string | null;
  dados: { voto?: number; musica?: string | null; movimento?: string; vibe?: number; enquete_id?: string };
  criado_em: string;
  apagada: boolean;
}

export interface EnqueteAoVivo {
  id: string;
  pergunta: string;
  opcoes: string[];
  votos: number[];
  total: number;
  meu_voto: number | null;
  aberta: boolean;
  fecha_em: string | null;
}

export interface ResumoAoVivo {
  musica_positivos: number;
  musica_negativos: number;
  musica_agora: string | null;
  tranquilo: number;
  moderado: number;
  cheio: number;
  vibe_media: number | null;
  mensagens: number;
  presentes: number;
}

export interface SalaAgora {
  estabelecimento_id: string;
  nome: string;
  logo_url: string | null;
  sala_id: string;
  presentes: number;
  ultima: string | null;
  ultima_em: string | null;
  participo: boolean;
  sigo: boolean;
  distancia_m: number | null;
  fecha_previsto: string;
}

export const PREVIA_MENSAGENS = 25;

const erroDe = (e: { message: string } | null) => {
  if (!e) return null;
  return /function|schema cache|does not exist/i.test(e.message) ? new Error("Falta aplicar a atualização 024 do banco (chat ao vivo).") : new Error(e.message);
};

export async function entrarAoVivo(estab: string): Promise<EntradaAoVivo> {
  const { data, error } = await supabase.rpc("entrar_ao_vivo", { p_estab: estab });
  if (error) throw erroDe(error);
  return data as EntradaAoVivo;
}

export async function mensagensAoVivo(sala: string, limite = 80, antes: string | null = null): Promise<MensagemAoVivo[]> {
  const { data, error } = await supabase.rpc("mensagens_ao_vivo_lista", { p_sala: sala, p_antes: antes, p_limite: limite });
  if (error) throw erroDe(error);
  return (data ?? []) as MensagemAoVivo[];
}

export async function enviarAoVivo(sala: string, tipo: "texto" | "foto" | "musica" | "ambiente", texto: string | null, dados: Record<string, unknown> = {}, arquivo?: File | null) {
  let foto: string | null = null;
  if (arquivo) {
    const blob = await reduzirImagem(arquivo, 1600);
    foto = `${sala}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("ao-vivo").upload(foto, blob, { contentType: "image/jpeg" });
    if (error) throw error;
  }
  const { error } = await supabase.rpc("enviar_ao_vivo", { p_sala: sala, p_tipo: tipo, p_texto: texto, p_foto: foto, p_dados: dados });
  if (error) throw erroDe(error);
}

export async function enquetesAoVivo(sala: string): Promise<EnqueteAoVivo[]> {
  const { data, error } = await supabase.rpc("enquetes_ao_vivo_lista", { p_sala: sala });
  if (error) throw erroDe(error);
  return (data ?? []) as EnqueteAoVivo[];
}

export async function resumoAoVivo(sala: string): Promise<ResumoAoVivo | null> {
  const { data } = await supabase.rpc("resumo_ao_vivo", { p_sala: sala });
  return (data as ResumoAoVivo) ?? null;
}

export async function salasAgora(pos: [number, number] | null): Promise<SalaAgora[]> {
  const { data, error } = await supabase.rpc("salas_ao_vivo_agora", { p_lat: pos?.[0] ?? null, p_lng: pos?.[1] ?? null });
  if (error) return [];
  return (data ?? []) as SalaAgora[];
}

export async function rpcAoVivo(nome: string, args: Record<string, unknown>) {
  const { data, error } = await supabase.rpc(nome, args);
  if (error) throw erroDe(error);
  return data;
}

// Endereços temporários das fotos (bucket privado), guardados por 50 minutos.
const urls = new Map<string, { url: string; ate: number }>();
export async function urlFotoAoVivo(caminho: string): Promise<string | null> {
  const c = urls.get(caminho);
  if (c && c.ate > Date.now()) return c.url;
  const { data } = await supabase.storage.from("ao-vivo").createSignedUrl(caminho, 3600);
  if (!data?.signedUrl) return null;
  urls.set(caminho, { url: data.signedUrl, ate: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

export const NOME_MOVIMENTO_AO_VIVO: Record<string, string> = { tranquilo: "Tranquilo", moderado: "Moderado", cheio: "Cheio" };

export function movimentoPredominante(r: ResumoAoVivo | null) {
  if (!r) return null;
  const l = [
    ["tranquilo", r.tranquilo],
    ["moderado", r.moderado],
    ["cheio", r.cheio],
  ] as const;
  const max = l.reduce((a, b) => (b[1] > a[1] ? b : a));
  return max[1] > 0 ? max[0] : null;
}

export const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
