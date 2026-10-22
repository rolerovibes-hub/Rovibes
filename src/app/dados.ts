import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Horario } from "@/lib/horarios";

export interface Lugar {
  id: string;
  nome: string;
  bairro: string | null;
  endereco: string | null;
  descricao: string | null;
  capa_url: string | null;
  logo_url: string | null;
  latitude: number | null;
  longitude: number | null;
  faixa_preco: number | null;
  telefone: string | null;
  instagram: string | null;
  categoria: { nome: string } | null;
  vibes: { vibe: { nome: string } | null }[];
  horarios: Horario[];
}

export interface ItemCardapio {
  id: string;
  categoria_id: string | null;
  nome: string;
  descricao: string | null;
  preco: number | null;
  foto_url: string | null;
  destaque: boolean;
  esgotado?: boolean;
}

export interface EventoResumo {
  id: string;
  nome: string;
  inicio: string;
  fim: string | null;
  entrada: string | null;
  capa_url: string | null;
  situacao: string;
  descricao: string | null;
  estabelecimento: { id: string; nome: string; bairro: string | null } | null;
  /** Atualização 045: categoria e endereço próprio (quando não é no estabelecimento). */
  categoria?: string | null;
  local_nome?: string | null;
  endereco?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

const CAMPOS_LUGAR =
  "id, nome, bairro, endereco, descricao, capa_url, logo_url, latitude, longitude, faixa_preco, telefone, instagram, categoria:categorias(nome), vibes:estabelecimento_vibes(vibe:vibes(nome)), horarios(dia_semana, abre, fecha)";

const CAMPOS_EVENTO =
  "id, nome, inicio, fim, entrada, capa_url, situacao, descricao, estabelecimento:estabelecimentos(id, nome, bairro)";

export const nomesVibes = (l: Lugar) => l.vibes.map((v) => v.vibe?.nome).filter((n): n is string => !!n);

/** Lugares aprovados e eventos publicados a partir de agora (com folga de 6 h para os que já começaram). */
export function useVitrine() {
  const [lugares, setLugares] = useState<Lugar[]>([]);
  const [eventos, setEventos] = useState<EventoResumo[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(false);

  useEffect(() => {
    let ativo = true;
    const desde = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    Promise.all([
      supabase.from("estabelecimentos").select(CAMPOS_LUGAR).eq("situacao", "aprovado").order("nome").limit(300),
      supabase
        .from("eventos")
        .select(CAMPOS_EVENTO)
        .eq("situacao", "publicado")
        .gte("inicio", desde)
        .order("inicio")
        .limit(60),
    ]).then(([l, e]) => {
      if (!ativo) return;
      setErro(!!(l.error || e.error));
      setLugares((l.data ?? []) as unknown as Lugar[]);
      setEventos(((e.data ?? []) as unknown as EventoResumo[]).filter((x) => x.estabelecimento));
      setCarregando(false);
    });
    return () => {
      ativo = false;
    };
  }, []);

  return { lugares, eventos, carregando, erro };
}

export async function buscarLugar(id: string) {
  const [l, e, f, c, i] = await Promise.all([
    supabase.from("estabelecimentos").select(CAMPOS_LUGAR).eq("id", id).maybeSingle(),
    supabase
      .from("eventos")
      .select(CAMPOS_EVENTO)
      .eq("estabelecimento_id", id)
      .eq("situacao", "publicado")
      .gte("inicio", new Date(Date.now() - 6 * 3600 * 1000).toISOString())
      .order("inicio")
      .limit(10),
    supabase.from("fotos").select("id, url").eq("estabelecimento_id", id).order("ordem"),
    supabase.from("cardapio_categorias").select("id, nome").eq("estabelecimento_id", id).order("ordem"),
    buscarItensCardapio(id),
  ]);
  return {
    lugar: (l.data as unknown as Lugar | null) ?? null,
    eventos: (e.data ?? []) as unknown as EventoResumo[],
    fotos: (f.data ?? []) as { id: string; url: string }[],
    categorias: (c.data ?? []) as { id: string; nome: string }[],
    itens: ((i.data ?? []) as ItemCardapio[]).map(
      (x) => ({ ...x, preco: x.preco == null ? null : Number(x.preco) }),
    ),
  };
}

/** Itens do cardápio publicados. Se o banco ainda não tiver o campo "esgotado" (atualização 011), busca sem ele. */
async function buscarItensCardapio(id: string) {
  const campos = "id, categoria_id, nome, descricao, preco, foto_url, destaque";
  const r = await supabase.from("cardapio_itens").select(`${campos}, esgotado`).eq("estabelecimento_id", id).eq("disponivel", true).order("ordem");
  if (!r.error) return r;
  return supabase.from("cardapio_itens").select(campos).eq("estabelecimento_id", id).eq("disponivel", true).order("ordem");
}

export async function buscarEvento(id: string) {
  const r = await supabase.from("eventos").select(`${CAMPOS_EVENTO}, categoria, local_nome, endereco, latitude, longitude`).eq("id", id).maybeSingle();
  if (!r.error) return (r.data as unknown as EventoResumo | null) ?? null;
  const { data } = await supabase.from("eventos").select(CAMPOS_EVENTO).eq("id", id).maybeSingle();
  return (data as unknown as EventoResumo | null) ?? null;
}

/** Distância em km entre dois pontos. */
export function distanciaKm(a: [number, number], b: [number, number]) {
  const r = (g: number) => (g * Math.PI) / 180;
  const dLat = r(b[0] - a[0]);
  const dLng = r(b[1] - a[1]);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a[0])) * Math.cos(r(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(h));
}

export const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${d.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} km`);

/** Localização do aparelho, pedida só quando a pessoa toca em "Perto de mim". */
export function pedirLocalizacao(precisa = false): Promise<[number, number]> {
  return new Promise((ok, falha) => {
    if (!navigator.geolocation) return falha(new Error("Este aparelho não informa a localização."));
    navigator.geolocation.getCurrentPosition(
      (p) => ok([p.coords.latitude, p.coords.longitude]),
      (e) => {
        if (e.code === e.PERMISSION_DENIED)
          return falha(
            new Error("A localização está bloqueada para o RoVibes. Libere nas configurações do celular (Apps → RoVibes → Permissões → Localização) ou do navegador."),
          );
        if (e.code === e.TIMEOUT) return falha(new Error("A localização demorou para responder. Verifique se o GPS está ligado e tente de novo."));
        falha(new Error("Não foi possível obter sua localização. Verifique se o GPS está ligado."));
      },
      precisa ? { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 } : { enableHighAccuracy: false, timeout: 15000, maximumAge: 300000 },
    );
  });
}

export const ehHoje = (iso: string) => new Date(iso).toDateString() === new Date().toDateString();

export const quando = (iso: string) => {
  const d = new Date(iso);
  const hora = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  if (ehHoje(iso)) return `Hoje, ${hora}`;
  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  if (d.toDateString() === amanha.toDateString()) return `Amanhã, ${hora}`;
  return `${d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}, ${hora}`;
};

/** Itens agrupados por categoria, na ordem do cardápio; itens sem categoria vão para "Outros". */
export function agruparCardapio(categorias: { id: string; nome: string }[], itens: ItemCardapio[]) {
  return [
    ...categorias.map((c) => ({ id: c.id, nome: c.nome, itens: itens.filter((i) => i.categoria_id === c.id) })),
    {
      id: "outros",
      nome: categorias.length ? "Outros" : "Cardápio",
      itens: itens.filter((i) => !i.categoria_id || !categorias.some((c) => c.id === i.categoria_id)),
    },
  ].filter((g) => g.itens.length);
}

/** Filtros rápidos usados no Descobrir e no Mapa. */
export const FILTROS_FIXOS = ["Tudo", "Aberto agora", "Eventos hoje"];

export function atendeFiltro(l: Lugar, filtro: string, eventos: EventoResumo[], aberto: (l: Lugar) => boolean) {
  if (filtro === "Tudo") return true;
  if (filtro === "Aberto agora") return aberto(l);
  if (filtro === "Eventos hoje") return eventos.some((e) => e.estabelecimento?.id === l.id && ehHoje(e.inicio));
  return nomesVibes(l).includes(filtro);
}
