import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";
import { reduzirImagem } from "./imagens";

export interface ConversaResumo {
  id: string;
  tipo: "direta" | "estabelecimento" | "role";
  titulo: string | null;
  foto: string | null;
  link: string | null;
  situacao: "ativo" | "pedido";
  ultima_texto: string | null;
  ultima_tipo: string | null;
  ultima_minha: boolean;
  ultima_em: string;
  nao_lidas: number;
  membros: number;
  quando: string | null;
  local_nome: string | null;
}

export interface DadosConversa {
  id: string;
  tipo: ConversaResumo["tipo"];
  titulo: string | null;
  foto: string | null;
  link: string | null;
  situacao: "ativo" | "pedido" | "recusado" | "saiu";
  quando: string | null;
  local_id: string | null;
  local_nome: string | null;
  local_lat: number | null;
  local_lng: number | null;
  local_endereco: string | null;
  como_estab: boolean;
  eu_admin: boolean;
  bloqueado: boolean;
}

export interface Mensagem {
  id: string;
  conversa_id: string;
  autor_id: string | null;
  tipo: "texto" | "foto" | "sistema";
  texto: string | null;
  foto: string | null;
  como_estab: boolean;
  apagada: boolean;
  criado_em: string;
}

export interface MembroConversa {
  id: string;
  nome: string;
  usuario: string;
  foto_url: string | null;
  situacao: "ativo" | "pedido";
  papel: "admin" | "membro";
  bora: boolean;
  lida_em: string;
}

const CAMPOS = "id, conversa_id, autor_id, tipo, texto, foto, como_estab, apagada, criado_em";
const PAGINA = 60;

export const faltaBanco = (msg: string) => /function|schema cache|does not exist|relation/i.test(msg);

/** Avisa quando algo muda nas mensagens/participantes (tempo real + reserva a cada 30 s). */
export function useAoVivoChat(nome: string, filtro: string | null, aoMudar: () => void, ativo = true) {
  const cb = useRef(aoMudar);
  cb.current = aoMudar;
  useEffect(() => {
    if (!ativo) return;
    let espera: number | undefined;
    const avisar = () => {
      window.clearTimeout(espera);
      espera = window.setTimeout(() => cb.current(), 200);
    };
    const f = filtro ?? undefined;
    const canal = supabase
      .channel(`${nome}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "mensagens", filter: f }, avisar)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversa_membros", filter: f }, avisar)
      .subscribe();
    const reserva = window.setInterval(() => cb.current(), 30000);
    return () => {
      window.clearTimeout(espera);
      window.clearInterval(reserva);
      void supabase.removeChannel(canal);
    };
  }, [nome, filtro, ativo]);
}

/** Total de conversas com mensagem nova e de pedidos (para o selo da aba Chat). */
export function useChatNaoLidas(ativo: boolean) {
  const [n, setN] = useState({ conversas: 0, pedidos: 0 });
  const carregar = useCallback(() => {
    supabase.rpc("chat_nao_lidas").then(({ data }) => {
      const r = ((data ?? []) as { conversas: number; pedidos: number }[])[0];
      if (r) setN(r);
    });
  }, []);
  useEffect(() => {
    if (ativo) carregar();
  }, [ativo, carregar]);
  useAoVivoChat("selo-chat", null, carregar, ativo);
  return { ...n, recarregar: carregar };
}

/** Mensagens de uma conversa, em ordem, com tempo real. */
export function useMensagens(conversa: string, ativo = true) {
  const [mensagens, setMensagens] = useState<Mensagem[] | null>(null);
  const [temMais, setTemMais] = useState(false);

  const carregar = useCallback(async () => {
    const { data } = await supabase.from("mensagens").select(CAMPOS).eq("conversa_id", conversa).order("criado_em", { ascending: false }).limit(PAGINA);
    const lista = ((data ?? []) as Mensagem[]).reverse();
    setMensagens((atual) => {
      // mantém as antigas já carregadas com "ver anteriores"
      if (!atual?.length || !lista.length) return lista;
      const primeiro = lista[0].criado_em;
      return [...atual.filter((m) => m.criado_em < primeiro), ...lista];
    });
    setTemMais((data ?? []).length === PAGINA);
  }, [conversa]);

  const anteriores = useCallback(async () => {
    const primeira = mensagens?.[0];
    if (!primeira) return;
    const { data } = await supabase
      .from("mensagens")
      .select(CAMPOS)
      .eq("conversa_id", conversa)
      .lt("criado_em", primeira.criado_em)
      .order("criado_em", { ascending: false })
      .limit(PAGINA);
    const lista = ((data ?? []) as Mensagem[]).reverse();
    setMensagens((m) => [...lista, ...(m ?? [])]);
    setTemMais(lista.length === PAGINA);
  }, [conversa, mensagens]);

  useEffect(() => {
    setMensagens(null);
    void carregar();
  }, [carregar]);
  useAoVivoChat(`conversa-${conversa}`, `conversa_id=eq.${conversa}`, () => void carregar(), ativo);

  return { mensagens, temMais, anteriores, recarregar: carregar };
}

// Fotos do chat ficam num espaço privado: o link é temporário (1 hora).
const linksFotos = new Map<string, { url: string; ate: number }>();

export async function linksDasFotos(caminhos: string[]): Promise<Record<string, string>> {
  const agora = Date.now();
  const faltam = [...new Set(caminhos)].filter((c) => (linksFotos.get(c)?.ate ?? 0) < agora + 60000);
  if (faltam.length) {
    const { data } = await supabase.storage.from("chat").createSignedUrls(faltam, 3600);
    for (const d of data ?? []) if (d.signedUrl && d.path) linksFotos.set(d.path, { url: d.signedUrl, ate: agora + 3600000 });
  }
  return Object.fromEntries(caminhos.map((c) => [c, linksFotos.get(c)?.url ?? ""]));
}

export async function enviarMensagem(conversa: string, texto: string, arquivo?: File | null) {
  let foto: string | null = null;
  if (arquivo) {
    const blob = await reduzirImagem(arquivo, 1600);
    foto = `${conversa}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from("chat").upload(foto, blob, { contentType: "image/jpeg" });
    if (error) throw error;
  }
  const { error } = await supabase.rpc("enviar_mensagem", { p_conversa: conversa, p_texto: texto, p_foto: foto });
  if (error) {
    if (foto) await supabase.storage.from("chat").remove([foto]);
    throw error;
  }
}

export async function apagarMensagem(id: string) {
  const { data, error } = await supabase.rpc("apagar_mensagem", { p_mensagem: id });
  if (error) throw error;
  if (data) await supabase.storage.from("chat").remove([data as string]);
}

export async function abrirConversa(pessoa: string): Promise<string> {
  const { data, error } = await supabase.rpc("abrir_conversa", { p_pessoa: pessoa });
  if (error) throw error;
  return data as string;
}

export async function abrirConversaEstab(estab: string): Promise<string> {
  const { data, error } = await supabase.rpc("abrir_conversa_estab", { p_estab: estab });
  if (error) throw error;
  return data as string;
}

export function horaMensagem(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (d.toDateString() === hoje.toDateString()) return hora;
  if (d.toDateString() === ontem.toDateString()) return `ontem`;
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function diaMensagem(iso: string) {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(Date.now() - 86400000);
  if (d.toDateString() === hoje.toDateString()) return "Hoje";
  if (d.toDateString() === ontem.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" });
}

export function quandoRole(iso: string | null) {
  if (!iso) return null;
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}
