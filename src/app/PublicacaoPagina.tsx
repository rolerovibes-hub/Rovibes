import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ImageOff } from "lucide-react";
import { VisorPublicacao } from "@/components/VisorPublicacao";
import { FolhaComentarios } from "@/components/Comentarios";
import { Carregando } from "@/components/Carregando";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { alternarCurtida, extrasDePosts } from "./conteudo";

interface Pub {
  id: string;
  tipo: "pessoa" | "lugar";
  foto_url: string | null;
  video_url: string | null;
  texto: string | null;
  criado_em: string;
  autor: { id: string; nome: string; usuario: string | null; foto_url: string | null; lugar?: boolean };
  local: { id: string; nome: string } | null;
  curtidas: number;
  curti: boolean;
  comentarios: number;
  fotos?: string[] | null;
  musica?: { titulo: string; artista: string | null; arquivo_url: string } | null;
  tags?: string[];
}

/**
 * Publicação aberta por um link (notificação de brinde ou comentário): /publicacao/pessoa/ID?comentario=ID.
 * Com ?comentario, já abre os comentários no comentário certo; ao fechar os comentários, a pessoa continua na publicação.
 */
export function PublicacaoPagina() {
  const { tipo = "pessoa", id = "" } = useParams();
  const [params] = useSearchParams();
  const destaque = params.get("comentario");
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const eu = sessao?.user.id ?? "";
  const [pub, setPub] = useState<Pub | null | undefined>(undefined);
  const [comentando, setComentando] = useState(!!destaque || params.get("comentarios") === "1");

  useEffect(() => {
    supabase.rpc("publicacao_para_abrir", { p_tipo: tipo, p_id: id }).then(async ({ data, error }) => {
      const p = error ? null : ((data as Pub | null) ?? null);
      // Carrossel, música e hashtags das publicações de pessoas.
      if (p && p.tipo === "pessoa") {
        const x = (await extrasDePosts([p.id])).get(p.id);
        if (x) Object.assign(p, { fotos: x.fotos, musica: x.musica, tags: x.tags });
      }
      setPub(p);
    });
  }, [tipo, id]);

  const sair = useCallback(() => {
    const idx = (window.history.state as { idx?: number } | null)?.idx ?? 0;
    if (idx > 0) navegar(-1);
    else navegar("/", { replace: true });
  }, [navegar]);

  if (pub === undefined) return <Carregando />;
  if (pub === null)
    return (
      <div className="px-6 py-20 text-center">
        <ImageOff className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-semibold">Esta publicação não está mais disponível</p>
        <p className="mt-1 text-sm text-suave">Ela pode ter sido apagada ou ficado privada.</p>
        <button className="botao mt-6" onClick={sair}>
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </button>
      </div>
    );

  const brindar = async () => {
    const antes = pub;
    setPub({ ...pub, curti: !pub.curti, curtidas: pub.curtidas + (pub.curti ? -1 : 1) });
    const { error } = await alternarCurtida(pub.id, eu, antes.curti, pub.tipo === "pessoa");
    if (error) setPub(antes);
  };

  const linkAutor = pub.autor.lugar ? `/lugar/${pub.autor.id}` : pub.autor.id === eu ? "/perfil" : pub.autor.usuario ? `/p/${pub.autor.usuario}` : undefined;

  return (
    <VisorPublicacao
      dados={{
        autor: { nome: pub.autor.lugar ? pub.autor.nome : pub.autor.usuario ?? pub.autor.nome, foto: pub.autor.foto_url, link: linkAutor },
        local: pub.local,
        foto: pub.foto_url,
        video: pub.video_url,
        fotos: pub.fotos ?? null,
        musica: pub.video_url ? null : pub.musica ?? null,
        tags: pub.tags,
        texto: pub.texto,
        criado_em: pub.criado_em,
        curtidas: pub.curtidas,
        curti: pub.curti,
        comentarios: pub.comentarios,
      }}
      fechar={sair}
      referencia={{ tipo: pub.tipo, id: pub.id }}
      aoCurtir={() => void brindar()}
      aoComentar={() => setComentando(true)}
    >
      {comentando && (
        <FolhaComentarios
          tipo={pub.tipo}
          id={pub.id}
          destaque={destaque}
          fechar={() => setComentando(false)}
          aoMudarTotal={(n) => setPub((p) => (p ? { ...p, comentarios: n } : p))}
        />
      )}
    </VisorPublicacao>
  );
}
