import { supabase } from "@/lib/supabase";

export interface Autor {
  id: string;
  nome: string;
  logo_url: string | null;
  /** Só em stories de pessoas: o @usuário. */
  usuario?: string;
}

export interface StoryApp {
  id: string;
  foto_url: string;
  legenda: string | null;
  criado_em: string;
  estabelecimento: Autor;
  /** Story de pessoa: lugar marcado. */
  local?: { id: string; nome: string } | null;
  /** Story em vídeo (até 15 s); foto_url é a capa. */
  video_url?: string | null;
  duracao?: number | null;
}

export interface GrupoStories {
  autor: Autor;
  stories: StoryApp[];
  vistos: boolean;
  tipo?: "lugar" | "pessoa";
  meu?: boolean;
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
  /** Se a pessoa já segue o lugar (feed único). */
  sigo?: boolean;
  /** Por que apareceu (lugares que ainda não segue). */
  motivo?: string | null;
  /** Publicação de pessoa (feed misto): quem publicou e o lugar marcado. */
  tipo?: "lugar" | "pessoa";
  pessoa?: { id: string; nome: string; usuario: string; foto_url: string | null } | null;
  local?: { id: string; nome: string } | null;
  /** Publicação em vídeo (até 15 s); foto_url é a capa. */
  video_url?: string | null;
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
    const g = grupos.get(st.estabelecimento.id) ?? { autor: st.estabelecimento, stories: [], vistos: true, tipo: "lugar" as const };
    g.stories.push(st);
    if (!vistos.has(st.id)) g.vistos = false;
    grupos.set(st.estabelecimento.id, g);
  }
  return [...grupos.values()].sort((a, b) => Number(a.vistos) - Number(b.vistos));
}

export async function marcarVisto(storyId: string, usuario: string, tipo: "lugar" | "pessoa" = "lugar") {
  await supabase
    .from(tipo === "pessoa" ? "visualizacoes_story_pessoa" : "visualizacoes_story")
    .upsert({ story_id: storyId, usuario_id: usuario }, { onConflict: "story_id,usuario_id", ignoreDuplicates: true });
}

/** Stories de pessoas (os seus e de quem você segue), agrupados por pessoa; o seu vem primeiro. */
export async function buscarStoriesPessoas(usuario: string, soDe?: string): Promise<GrupoStories[]> {
  const consulta = (campos: string) => {
    let q = supabase.from("stories_pessoas").select(campos).eq("oculto", false).gt("expira_em", new Date().toISOString()).order("criado_em");
    if (soDe) q = q.eq("usuario_id", soDe);
    return q;
  };
  const base = "id, usuario_id, foto_url, legenda, criado_em, local:estabelecimentos(id, nome)";
  // Com vídeo (atualização 036); sem ela, busca só as fotos.
  let { data, error } = await consulta(`${base}, video_url, duracao`);
  if (error) ({ data, error } = await consulta(base));
  if (error || !data?.length) return [];
  type Linha = {
    id: string;
    usuario_id: string;
    foto_url: string;
    legenda: string | null;
    criado_em: string;
    local: { id: string; nome: string } | null;
    video_url?: string | null;
    duracao?: number | null;
  };
  const linhas = data as unknown as Linha[];
  const ids = [...new Set(linhas.map((l) => l.usuario_id))];
  const [p, v] = await Promise.all([
    supabase.from("perfis_publicos").select("id, nome, usuario, foto_url").in("id", ids),
    supabase.from("visualizacoes_story_pessoa").select("story_id").eq("usuario_id", usuario),
  ]);
  const pessoas = new Map(((p.data ?? []) as { id: string; nome: string; usuario: string; foto_url: string | null }[]).map((x) => [x.id, x]));
  const vistos = new Set((v.data ?? []).map((x) => x.story_id as string));
  const grupos = new Map<string, GrupoStories>();
  for (const l of linhas) {
    const pe = pessoas.get(l.usuario_id);
    if (!pe) continue;
    const autor: Autor = { id: pe.id, nome: pe.nome, logo_url: pe.foto_url, usuario: pe.usuario };
    const g = grupos.get(pe.id) ?? { autor, stories: [], vistos: true, tipo: "pessoa" as const, meu: pe.id === usuario };
    g.stories.push({
      id: l.id,
      foto_url: l.foto_url,
      legenda: l.legenda,
      criado_em: l.criado_em,
      estabelecimento: autor,
      local: l.local,
      video_url: l.video_url ?? null,
      duracao: l.duracao == null ? null : Number(l.duracao),
    });
    if (!vistos.has(l.id) && !g.meu) g.vistos = false;
    grupos.set(pe.id, g);
  }
  return [...grupos.values()].sort((a, b) => Number(b.meu ?? false) - Number(a.meu ?? false) || Number(a.vistos) - Number(b.vistos));
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

export async function alternarCurtida(publicacaoId: string, usuario: string, curtiu: boolean, dePessoa = false) {
  const tabela = dePessoa ? "curtidas_pessoas" : "curtidas";
  return curtiu
    ? supabase.from(tabela).delete().eq("publicacao_id", publicacaoId).eq("usuario_id", usuario)
    : supabase.from(tabela).insert({ publicacao_id: publicacaoId });
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

/** Feed único: publicações ordenadas pela interação da pessoa, misturando lugares que ainda não segue. */
export async function buscarFeed(usuario: string): Promise<PublicacaoApp[]> {
  // Feed misto (lugares + pessoas que você segue), da atualização 027.
  const misto = await supabase.rpc("feed_geral", { p_limite: 50 });
  if (!misto.error) {
    type Linha = Omit<PublicacaoApp, "estabelecimento" | "pessoa"> & { tipo: "lugar" | "pessoa"; autor: Record<string, string | null> };
    const linhas = (misto.data ?? []) as Linha[];
    // Vídeos das publicações de pessoas (atualização 036).
    const idsPessoa = linhas.filter((x) => x.tipo === "pessoa").map((x) => x.id);
    const videos = new Map<string, string>();
    if (idsPessoa.length) {
      const { data: v } = await supabase.from("publicacoes_pessoas").select("id, video_url").in("id", idsPessoa).not("video_url", "is", null);
      for (const x of (v ?? []) as { id: string; video_url: string }[]) videos.set(x.id, x.video_url);
    }
    return linhas.map((x) => ({
      video_url: videos.get(x.id) ?? null,
      ...x,
      estabelecimento: x.tipo === "lugar" ? (x.autor as unknown as PublicacaoApp["estabelecimento"]) : { id: x.local?.id ?? "", nome: x.local?.nome ?? "", logo_url: null },
      pessoa: x.tipo === "pessoa" ? (x.autor as unknown as PublicacaoApp["pessoa"]) : null,
    }));
  }
  const { data, error } = await supabase.rpc("feed_publicacoes", { p_limite: 40 });
  if (!error) return (data ?? []) as PublicacaoApp[];
  // Antes da atualização 016 do banco: todas as publicações, marcando quais lugares a pessoa segue.
  const [lista, seg] = await Promise.all([
    buscarPublicacoes(usuario, "todos"),
    supabase.from("seguidores").select("estabelecimento_id").eq("usuario_id", usuario),
  ]);
  const sigo = new Set((seg.data ?? []).map((x) => x.estabelecimento_id as string));
  return lista.map((p) => ({ ...p, sigo: sigo.has(p.estabelecimento.id), motivo: null }));
}

export async function seguirLugar(estab: string) {
  const { error } = await supabase.from("seguidores").insert({ estabelecimento_id: estab });
  if (error && !/duplicate/i.test(error.message)) throw error;
}
