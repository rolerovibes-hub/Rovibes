import { useCallback, useEffect, useState } from "react";
import { IconePapo } from "@/components/IconesRoVibes";
import { Camera, Flag, Layers, Lock, Play, Trash2 } from "lucide-react";
import { IconeTaca } from "./Brindar";
import { VisorPublicacao } from "./VisorPublicacao";
import { contarComentarios, FolhaComentarios } from "./Comentarios";
import { JanelaDenuncia } from "./Denunciar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { extrasDePosts } from "@/app/conteudo";

export interface Post {
  id: string;
  foto_url: string;
  texto: string | null;
  criado_em: string;
  local: { id: string; nome: string } | null;
  curtidas: number;
  curti: boolean;
  video_url?: string | null;
  fotos?: string[] | null;
  musica?: { id: string; titulo: string; artista: string | null; arquivo_url: string } | null;
  tags?: string[];
}

/** Grade de publicações de uma pessoa (perfil). Toque abre a publicação. */
export function GradePublicacoes({ pessoa, autor, privado = false }: { pessoa: string; autor: { nome: string; usuario: string | null; foto_url: string | null }; privado?: boolean }) {
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [aberto, setAberto] = useState<Post | null>(null);
  const [erro, setErro] = useState("");
  const [comentarios, setComentarios] = useState<Map<string, number>>(new Map());

  const carregar = useCallback(() => {
    supabase.rpc("publicacoes_da_pessoa", { p_pessoa: pessoa, p_antes: null }).then(async ({ data, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 027 do banco." : "");
      const lista = (data ?? []) as Post[];
      // Vídeo, carrossel, música e hashtags.
      if (lista.length) {
        const mapa = await extrasDePosts(lista.map((p) => p.id));
        for (const p of lista) {
          const x = mapa.get(p.id);
          p.video_url = x?.video_url ?? null;
          p.fotos = x?.fotos ?? null;
          p.musica = x?.musica ?? null;
          p.tags = x?.tags ?? [];
        }
      }
      setPosts(lista);
      if (lista.length) contarComentarios("pessoa", lista.map((p) => p.id)).then(setComentarios).catch(() => undefined);
    });
  }, [pessoa]);
  useEffect(() => {
    carregar();
    window.addEventListener("rovibes:publicou", carregar);
    return () => window.removeEventListener("rovibes:publicou", carregar);
  }, [carregar]);

  if (privado && pessoa !== eu && posts?.length === 0)
    return (
      <div className="px-6 py-12 text-center">
        <Lock className="mx-auto h-7 w-7 text-suave" />
        <p className="mt-3 font-medium">Perfil privado</p>
        <p className="mt-1 text-sm text-suave">Siga para ver as publicações.</p>
      </div>
    );
  if (posts === null) return <p className="px-4 py-8 text-center text-sm text-suave">Carregando...</p>;
  if (posts.length === 0)
    return (
      <div className="px-6 py-12 text-center">
        <Camera className="mx-auto h-7 w-7 text-suave" />
        <p className="mt-3 text-sm text-suave">{erro || (pessoa === eu ? "Suas publicações aparecem aqui. Use o + no topo para publicar." : "Nenhuma publicação ainda.")}</p>
      </div>
    );

  return (
    <>
      <ul className="grid grid-cols-3 gap-0.5">
        {posts.map((p) => (
          <li key={p.id}>
            <button onClick={() => setAberto(p)} className="relative block aspect-square w-full overflow-hidden bg-elevado" aria-label={p.texto ?? "Publicação"}>
              <img src={p.foto_url} alt="" className="h-full w-full object-cover" loading="lazy" />
              {p.video_url && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white">
                  <Play className="h-3 w-3 fill-current" />
                </span>
              )}
              {!p.video_url && (p.fotos?.length ?? 0) > 1 && (
                <span className="absolute right-1.5 top-1.5 rounded-full bg-black/55 p-1 text-white">
                  <Layers className="h-3 w-3" />
                </span>
              )}
              {/* Brindes e comentários na parte de baixo da miniatura */}
              <span className="absolute inset-x-0 bottom-0 flex items-center gap-2.5 bg-gradient-to-t from-black/70 to-transparent px-1.5 pb-1 pt-5 text-[11px] font-semibold text-white">
                <span className="inline-flex items-center gap-0.5">
                  <IconeTaca cheia={p.curti} sobreFoto className="h-3.5 w-3.5" />
                  {p.curtidas}
                </span>
                <span className="inline-flex items-center gap-0.5">
                  <IconePapo className="h-3.5 w-3.5" />
                  {comentarios.get(p.id) ?? 0}
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {aberto && (
        <VisorPost
          post={aberto}
          autor={autor}
          minha={pessoa === eu}
          fechar={() => setAberto(null)}
          mudou={(p) => {
            setPosts((l) => (p ? (l ?? []).map((x) => (x.id === p.id ? p : x)) : (l ?? []).filter((x) => x.id !== aberto.id)));
            setAberto(p);
          }}
        />
      )}
    </>
  );
}

function VisorPost({
  post,
  autor,
  minha,
  fechar,
  mudou,
}: {
  post: Post;
  autor: { nome: string; usuario: string | null; foto_url: string | null };
  minha: boolean;
  fechar: () => void;
  mudou: (p: Post | null) => void;
}) {
  const { sessao } = useSessao();
  const [denunciando, setDenunciando] = useState(false);
  const [erro, setErro] = useState("");
  const [comentando, setComentando] = useState(false);
  const [totalComentarios, setTotalComentarios] = useState(0);
  useEffect(() => {
    contarComentarios("pessoa", [post.id]).then((m) => setTotalComentarios(m.get(post.id) ?? 0));
  }, [post.id]);

  const curtir = async () => {
    if (!sessao) return;
    const novo = { ...post, curti: !post.curti, curtidas: post.curtidas + (post.curti ? -1 : 1) };
    mudou(novo);
    const r = post.curti
      ? await supabase.from("curtidas_pessoas").delete().eq("publicacao_id", post.id).eq("usuario_id", sessao.user.id)
      : await supabase.from("curtidas_pessoas").insert({ publicacao_id: post.id });
    if (r.error) mudou(post);
  };
  const apagar = async () => {
    if (!window.confirm("Apagar esta publicação?")) return;
    const { error } = await supabase.from("publicacoes_pessoas").delete().eq("id", post.id);
    if (error) return setErro(mensagemDeErro(error));
    const caminhos = [post.foto_url, post.video_url, ...(post.fotos ?? [])].map((u) => u?.split("/avatares/")[1]).filter((c): c is string => !!c).map(decodeURIComponent);
    if (caminhos.length) await supabase.storage.from("avatares").remove(caminhos);
    mudou(null);
  };

  return (
    <VisorPublicacao
      dados={{
        autor: { nome: autor.usuario ?? autor.nome, foto: autor.foto_url, link: minha ? "/perfil" : autor.usuario ? `/p/${autor.usuario}` : undefined },
        local: post.local,
        foto: post.foto_url,
        video: post.video_url,
        fotos: post.fotos ?? null,
        musica: post.video_url ? null : post.musica ?? null,
        tags: post.tags,
        texto: post.texto,
        criado_em: post.criado_em,
        curtidas: post.curtidas,
        curti: post.curti,
        comentarios: totalComentarios,
      }}
      fechar={fechar}
      referencia={{ tipo: "pessoa", id: post.id }}
      aoCurtir={() => void curtir()}
      aoComentar={() => setComentando(true)}
      acoes={
        minha ? (
          <button onClick={() => void apagar()} className="rounded-full p-2 hover:bg-white/10" aria-label="Apagar publicação">
            <Trash2 className="h-5 w-5" />
          </button>
        ) : (
          <button onClick={() => setDenunciando(true)} className="rounded-full p-2 hover:bg-white/10" aria-label="Denunciar publicação">
            <Flag className="h-5 w-5" />
          </button>
        )
      }
      extra={erro ? <p className="text-sm text-red-300">{erro}</p> : undefined}
    >
      {denunciando && <JanelaDenuncia tipo="post" alvo={post.id} titulo="Denunciar publicação" fechar={() => setDenunciando(false)} />}
      {comentando && <FolhaComentarios tipo="pessoa" id={post.id} fechar={() => setComentando(false)} aoMudarTotal={setTotalComentarios} />}
    </VisorPublicacao>
  );
}
