// Músicas livres para o RoVibes: busca no Openverse (Jamendo, Freesound, ccMixter...) só faixas
// com licença que permite uso comercial e edição (CC0, domínio público e CC BY), e importa para a biblioteca.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, URL_SUPABASE } from "../_compartilhado/mp.ts";

const API = "https://api.openverse.org/v1/audio/";
const LICENCAS = "cc0,pdm,by";
const NOME_LICENCA: Record<string, string> = { cc0: "CC0", pdm: "Domínio público", by: "CC BY" };
const MAX_BYTES = 15 * 1024 * 1024;
type Corpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

interface Faixa {
  id: string;
  title?: string;
  creator?: string;
  url?: string;
  filetype?: string;
  duration?: number;
  license?: string;
  license_version?: string;
  foreign_landing_url?: string;
  source?: string;
  provider?: string;
  genres?: string[];
  tags?: { name: string }[];
}

/** Quem chama precisa ter nível Decidir (3) em Produto na Gestão, com o código confirmado. */
async function exigirProduto(req: Request, minimo: number) {
  const auth = req.headers.get("Authorization") ?? "";
  const cliente = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  const { data, error } = await cliente.rpc("nivel_gestao", { p_area: "produto" });
  if (error || Number(data ?? 0) < minimo) throw new Error(minimo >= 3 ? "Adicionar músicas exige nível Decidir em Produto." : "Sem acesso a Produto.");
}

const resumo = (f: Faixa) => ({
  id: f.id,
  titulo: (f.title ?? "Sem título").slice(0, 80),
  artista: f.creator?.slice(0, 80) ?? null,
  duracao: f.duration ? Math.round(f.duration / 1000) : null,
  licenca: NOME_LICENCA[f.license ?? ""] ?? f.license ?? "",
  versao: f.license_version ?? null,
  fonte: f.source ?? f.provider ?? null,
  link: f.foreign_landing_url ?? null,
  arquivo: f.url ?? null,
  formato: f.filetype ?? null,
  estilos: [...(f.genres ?? []), ...(f.tags ?? []).map((t) => t.name)].slice(0, 6),
});

async function openverse(caminho: string) {
  const r = await fetch(caminho, { headers: { "User-Agent": "RoVibes/1.0 (rovibes.vercel.app)" } });
  if (r.status === 429) throw new Error("Muitas buscas seguidas. Espere um minuto e tente de novo.");
  if (!r.ok) throw new Error("A biblioteca livre não respondeu. Tente de novo.");
  return r.json();
}

const acoes: Record<string, (c: Corpo, req: Request) => Promise<unknown>> = {
  async buscar(c, req) {
    await exigirProduto(req, 1);
    const q = texto(c.termo) || "party";
    const pagina = Math.max(1, Math.min(12, Number(c.pagina ?? 1)));
    const p = new URLSearchParams({ q, license: LICENCAS, category: "music", page_size: "20", page: String(pagina), mature: "false" });
    const dados = (await openverse(`${API}?${p}`)) as { results?: Faixa[]; page_count?: number };
    // Já importadas aparecem marcadas.
    const ids = (dados.results ?? []).map((f) => f.id);
    const { data: ja } = ids.length ? await admin().from("musicas").select("fonte_id").eq("fonte", "openverse").in("fonte_id", ids) : { data: [] };
    const tem = new Set((ja ?? []).map((x) => x.fonte_id as string));
    return {
      faixas: (dados.results ?? []).filter((f) => f.url && NOME_LICENCA[f.license ?? ""]).map((f) => ({ ...resumo(f), importada: tem.has(f.id) })),
      paginas: dados.page_count ?? 1,
    };
  },

  async importar(c, req) {
    await exigirProduto(req, 3);
    const id = texto(c.id);
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("Faixa inválida.");
    const { data: ja } = await admin().from("musicas").select("id").eq("fonte", "openverse").eq("fonte_id", id).maybeSingle();
    if (ja) return { id: ja.id, ja: true };
    const f = (await openverse(`${API}${id}/`)) as Faixa;
    if (!f.url || !NOME_LICENCA[f.license ?? ""]) throw new Error("Esta faixa não tem licença livre para uso comercial.");
    const r = await fetch(f.url);
    if (!r.ok) throw new Error("Não foi possível baixar a faixa.");
    const tipo = r.headers.get("content-type")?.split(";")[0] || "audio/mpeg";
    if (!tipo.startsWith("audio/")) throw new Error("O arquivo não é de áudio.");
    const bytes = new Uint8Array(await r.arrayBuffer());
    if (bytes.byteLength > MAX_BYTES) throw new Error("Faixa grande demais (mais de 15 MB).");
    const ext = tipo.includes("ogg") ? "ogg" : tipo.includes("wav") ? "wav" : tipo.includes("flac") ? "flac" : "mp3";
    const caminho = `livres/${id}.${ext}`;
    const up = await admin().storage.from("musicas").upload(caminho, bytes, { contentType: tipo, upsert: true });
    if (up.error) throw new Error(up.error.message);
    const url = admin().storage.from("musicas").getPublicUrl(caminho).data.publicUrl;
    const s = resumo(f);
    const licenca = `${s.licenca}${s.versao && s.licenca !== "CC0" ? ` ${s.versao}` : ""} · ${s.artista ?? "autor desconhecido"} · ${s.fonte ?? "Openverse"}`.slice(0, 200);
    const { data: nova, error } = await admin()
      .from("musicas")
      .insert({
        titulo: s.titulo,
        artista: s.artista,
        estilo: texto(c.estilo).slice(0, 40) || null,
        arquivo_url: url,
        duracao: s.duracao,
        licenca,
        fonte: "openverse",
        fonte_id: id,
        link: s.link,
        creditos: `"${s.titulo}" de ${s.artista ?? "autor desconhecido"} (${s.licenca}${s.versao ? ` ${s.versao}` : ""})`,
      })
      .select("id")
      .single();
    if (error) {
      await admin().storage.from("musicas").remove([caminho]);
      throw new Error(error.message);
    }
    return { id: nova.id };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corpo = (await req.json().catch(() => ({}))) as Corpo;
    const acao = acoes[texto(corpo.acao)];
    if (!acao) return resposta({ erro: "Ação desconhecida." }, 400);
    return resposta(await acao(corpo, req));
  } catch (e) {
    return resposta({ erro: e instanceof Error ? e.message : "Erro." }, 400);
  }
});
