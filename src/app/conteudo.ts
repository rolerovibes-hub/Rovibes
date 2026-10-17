import { supabase } from "@/lib/supabase";

export interface Autor {
  id: string;
  nome: string;
  logo_url: string | null;
}

export interface StoryApp {
  id: string;
  foto_url: string;
  legenda: string | null;
  criado_em: string;
  estabelecimento: Autor;
}

export interface GrupoStories {
  autor: Autor;
  stories: StoryApp[];
  vistos: boolean;
}

export interface PublicacaoApp {
  id: string;
  texto: string | null;
  foto_url: string | null;
  criado_em: string;
  estabelecimento: Autor;
  evento: { id: string; nome: string; inicio: string } | null;
  curtidas: number;
  curti: boolean;
}

/** Stories no ar, agrupados por lugar; quem ainda tem story não visto vem primeiro. */
export async function buscarStories(usuario: string, soDoLugar?: string): Promise<GrupoStories[]> {
  let q = supabase
    .from("stories")
    .select("id, foto_url, legenda, criado_em, estabelecimento:estabelecimentos(id, nome, logo_url)")
    .gt("expira_em", new Date().toISOString())
    .order("criado_em");
  if (soDoLugar) q = q.eq("estabelecimento_id", soDoLugar);
  const [s, v] = await Promise.all([q, supabase.from("visualizacoes_story").select("story_id").eq("usuario_id", usuario)]);
  const vistos = new Set((v.data ?? []).map((x) => x.story_id as string));
  const grupos = new Map<string, GrupoStories>();
  for (const st of (s.data ?? []) as unknown as StoryApp[]) {
    if (!st.estabelecimento) continue;
    const g = grupos.get(st.estabelecimento.id) ?? { autor: st.estabelecimento, stories: [], vistos: true };
    g.stories.push(st);
    if (!vistos.has(st.id)) g.vistos = false;
    grupos.set(st.estabelecimento.id, g);
  }
  return [...grupos.values()].sort((a, b) => Number(a.vistos) - Number(b.vistos));
}

export async function marcarVisto(storyId: string, usuario: string) {
  await supabase.from("visualizacoes_story").upsert({ story_id: storyId, usuario_id: usuario }, { onConflict: "story_id,usuario_id", ignoreDuplicates: true });
}

/** Publicações recentes: de quem a pessoa segue, ou de todos os lugares. */
export async function buscarPublicacoes(usuario: string, modo: "seguindo" | "todos"): Promise<PublicacaoApp[]> {
  let ids: string[] | null = null;
  if (modo === "seguindo") {
    const { data } = await supabase.from("seguidores").select("estabelecimento_id").eq("usuario_id", usuario);
    ids = (data ?? []).map((x) => x.estabelecimento_id as string);
    if (!ids.length) return [];
  }
  let q = supabase
    .from("publicacoes")
    .select("id, texto, foto_url, criado_em, estabelecimento:estabelecimentos(id, nome, logo_url), evento:eventos(id, nome, inicio)")
    .eq("situacao", "publicada")
    .order("criado_em", { ascending: false })
    .limit(40);
  if (ids) q = q.in("estabelecimento_id", ids);
  const { data } = await q;
  const lista = ((data ?? []) as unknown as Omit<PublicacaoApp, "curtidas" | "curti">[]).filter((p) => p.estabelecimento);
  if (!lista.length) return [];
  const { data: c } = await supabase.rpc("curtidas_de", { p_ids: lista.map((p) => p.id) });
  const mapa = new Map(((c ?? []) as { publicacao_id: string; total: number; eu: boolean }[]).map((x) => [x.publicacao_id, x]));
  return lista.map((p) => ({ ...p, curtidas: mapa.get(p.id)?.total ?? 0, curti: mapa.get(p.id)?.eu ?? false }));
}

export async function alternarCurtida(publicacaoId: string, usuario: string, curtiu: boolean) {
  return curtiu
    ? supabase.from("curtidas").delete().eq("publicacao_id", publicacaoId).eq("usuario_id", usuario)
    : supabase.from("curtidas").insert({ publicacao_id: publicacaoId });
}

export function tempoAtras(iso: string) {
  const min = Math.round((Date.now() - Date.parse(iso)) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.round(h / 24);
  return d < 7 ? `${d} d` : new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}
