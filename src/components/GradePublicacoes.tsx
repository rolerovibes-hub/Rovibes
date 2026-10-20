import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Camera, Flag, Heart, Lock, MapPin, MessageCircle, Trash2, X } from "lucide-react";
import { contarComentarios, FolhaComentarios } from "./Comentarios";
import { Avatar } from "./Avatar";
import { JanelaDenuncia } from "./Denunciar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";

export interface Post {
  id: string;
  foto_url: string;
  texto: string | null;
  criado_em: string;
  local: { id: string; nome: string } | null;
  curtidas: number;
  curti: boolean;
}

/** Grade de publicações de uma pessoa (perfil). Toque abre a publicação. */
export function GradePublicacoes({ pessoa, autor, privado = false }: { pessoa: string; autor: { nome: string; usuario: string | null; foto_url: string | null }; privado?: boolean }) {
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [aberto, setAberto] = useState<Post | null>(null);
  const [erro, setErro] = useState("");

  const carregar = useCallback(() => {
    supabase.rpc("publicacoes_da_pessoa", { p_pessoa: pessoa, p_antes: null }).then(({ data, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 027 do banco." : "");
      setPosts((data ?? []) as Post[]);
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
            <button onClick={() => setAberto(p)} className="block aspect-square w-full overflow-hidden bg-elevado" aria-label={p.texto ?? "Publicação"}>
              <img src={p.foto_url} alt="" className="h-full w-full object-cover" loading="lazy" />
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
    const caminho = post.foto_url.split("/avatares/")[1];
    if (caminho) await supabase.storage.from("avatares").remove([decodeURIComponent(caminho)]);
    mudou(null);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="Publicação" onClick={fechar}>
      <div className="folha max-h-[94vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2.5 px-4 py-3">
          <Avatar nome={autor.nome} foto={autor.foto_url} tamanho="sm" />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{autor.usuario ?? autor.nome}</span>
            {post.local && (
              <Link to={`/lugar/${post.local.id}`} className="flex items-center gap-1 truncate text-[12px] text-suave hover:text-texto">
                <MapPin className="h-3 w-3" />
                {post.local.nome}
              </Link>
            )}
          </span>
          {minha ? (
            <button onClick={() => void apagar()} className="rounded-full p-2 text-suave hover:bg-elevado hover:text-perigo" aria-label="Apagar publicação">
              <Trash2 className="h-5 w-5" />
            </button>
          ) : (
            <button onClick={() => setDenunciando(true)} className="rounded-full p-2 text-suave hover:bg-elevado" aria-label="Denunciar publicação">
              <Flag className="h-5 w-5" />
            </button>
          )}
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <img src={post.foto_url} alt={post.texto ?? ""} className="max-h-[70vh] w-full bg-black object-contain" />
        <div className="space-y-2 px-4 py-3">
          <span className="-ml-1 inline-flex items-center gap-2">
            <button onClick={() => void curtir()} aria-pressed={post.curti} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm">
              <Heart className={clsx("h-5 w-5", post.curti ? "fill-current text-magenta" : "text-suave")} />
              <span className={post.curti ? "font-medium" : "text-suave"}>{post.curtidas}</span>
            </button>
            <button onClick={() => setComentando(true)} className="inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm text-suave" aria-label="Comentários">
              <MessageCircle className="h-5 w-5" />
              {totalComentarios}
            </button>
          </span>
          {post.texto && <p className="whitespace-pre-line text-[15px]">{post.texto}</p>}
          <p className="text-[12px] text-suave">{new Date(post.criado_em).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
          {erro && <p className="text-sm text-perigo">{erro}</p>}
        </div>
      </div>
      {denunciando && <JanelaDenuncia tipo="post" alvo={post.id} titulo="Denunciar publicação" fechar={() => setDenunciando(false)} />}
      {comentando && <FolhaComentarios tipo="pessoa" id={post.id} fechar={() => setComentando(false)} aoMudarTotal={setTotalComentarios} />}
    </div>
  );
}
