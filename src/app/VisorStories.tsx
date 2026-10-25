import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Eye, Flag, MapPin, MoreHorizontal, Send, Store, Trash2, Volume2, VolumeX, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { JanelaDenuncia } from "@/components/Denunciar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { GrupoStories, marcarVisto, tempoAtras } from "./conteudo";

const DURACAO = 5000;
const REACOES = ["🔥", "😍", "😂", "😮", "👏", "🍻", "💜"];

interface Visualizacao {
  nome: string;
  usuario: string;
  foto_url: string | null;
  visto_em: string;
  reacao?: string | null;
}

/** Visualizador de stories em tela cheia: toque à direita avança, à esquerda volta. */
export function VisorStories({
  grupos,
  inicio,
  usuario,
  fechar,
}: {
  grupos: GrupoStories[];
  inicio: number;
  usuario: string;
  fechar: () => void;
}) {
  const [g, setG] = useState(inicio);
  const [s, setS] = useState(0);
  const [pausado, setPausado] = useState(false);
  const [menu, setMenu] = useState(false);
  const [denunciando, setDenunciando] = useState(false);
  const [vistos, setVistos] = useState<Visualizacao[] | null>(null);
  const [apagados, setApagados] = useState<Set<string>>(new Set());
  const [resposta, setResposta] = useState("");
  const [escrevendo, setEscrevendo] = useState(false);
  const [enviandoResposta, setEnviandoResposta] = useState(false);
  const [aviso, setAviso] = useState("");
  const [voando, setVoando] = useState<{ emoji: string; n: number } | null>(null);
  const [mudo, setMudo] = useState(false);
  const telaVideo = useRef<HTMLVideoElement>(null);
  const grupo = grupos[g];
  const lista = grupo?.stories.filter((x) => !apagados.has(x.id)) ?? [];
  const story = lista[s];
  const pessoa = grupo?.tipo === "pessoa";
  const parado = pausado || menu || denunciando || vistos !== null || escrevendo || enviandoResposta;

  const avancar = () => {
    if (!grupo) return fechar();
    if (s < lista.length - 1) setS(s + 1);
    else if (g < grupos.length - 1) {
      setG(g + 1);
      setS(0);
    } else fechar();
  };
  const voltar = () => {
    if (s > 0) setS(s - 1);
    else if (g > 0) {
      setG(g - 1);
      setS(Math.max(0, grupos[g - 1].stories.length - 1));
    }
  };

  useEffect(() => {
    if (story && !grupo?.meu) void marcarVisto(story.id, usuario, grupo?.tipo ?? "lugar");
  }, [story, usuario, grupo]);

  // Vídeo: toca, pausa junto com o story e avança quando termina.
  const ehVideo = !!story?.video_url;
  // Foto com música fica mais tempo na tela.
  const musicaFoto = !ehVideo ? story?.musica ?? null : null;
  const tempoFoto = musicaFoto ? 10000 : DURACAO;
  const duracaoStory = ehVideo ? Math.max(1, Number(story?.duracao ?? 15)) * 1000 : tempoFoto;
  const telaMusica = useRef<HTMLAudioElement>(null);
  useEffect(() => {
    const a = telaMusica.current;
    if (!a) return;
    if (parado) a.pause();
    else void a.play().catch(() => undefined);
  }, [parado, story?.id]);
  useEffect(() => {
    const v = telaVideo.current;
    if (!v) return;
    if (parado) v.pause();
    else void v.play().catch((e: DOMException) => {
      // Troca rápida de story interrompe o play (AbortError): não desliga o som por isso.
      if (e?.name !== "NotAllowedError") return;
      // Sem permissão para tocar com som: toca mudo.
      v.muted = true;
      setMudo(true);
      void v.play().catch(() => undefined);
    });
  }, [parado, story?.id]);

  useEffect(() => {
    if (parado || !story || ehVideo) return;
    const t = window.setTimeout(avancar, tempoFoto);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [g, s, parado, story]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 2200);
    return () => window.clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (denunciando || vistos || escrevendo) return;
      if (e.key === "Escape") fechar();
      if (e.key === "ArrowRight") avancar();
      if (e.key === "ArrowLeft") voltar();
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  });

  // Todos os stories do grupo apagados: segue para o próximo.
  useEffect(() => {
    if (grupo && lista.length === 0) {
      if (g < grupos.length - 1) {
        setG(g + 1);
        setS(0);
      } else fechar();
    } else if (s >= lista.length && lista.length) setS(lista.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apagados]);

  if (!grupo || !story) return null;

  const abrirVistos = async () => {
    setMenu(false);
    setVistos([]);
    const { data } = await supabase.rpc("quem_viu_story", { p_story: story.id });
    setVistos((data ?? []) as Visualizacao[]);
  };

  const apagar = async () => {
    setMenu(false);
    if (!window.confirm("Apagar este story?")) return;
    const { error } = await supabase.from("stories_pessoas").delete().eq("id", story.id);
    if (!error) {
      const caminhos = [story.foto_url, story.video_url].map((u) => u?.split("/avatares/")[1]).filter((c): c is string => !!c).map(decodeURIComponent);
      if (caminhos.length) await supabase.storage.from("avatares").remove(caminhos);
      setApagados((a) => new Set(a).add(story.id));
    }
  };

  // Responder ou reagir: vai para o chat direto com a pessoa (ou para a conversa com o lugar).
  const interagir = async (emoji: string | null, texto: string | null) => {
    if (!story || !grupo) return;
    setEnviandoResposta(true);
    if (emoji) setVoando({ emoji, n: Date.now() });
    const { error } = await supabase.rpc("interagir_story", { p_tipo: grupo.tipo ?? "lugar", p_story: story.id, p_emoji: emoji, p_texto: texto });
    setEnviandoResposta(false);
    if (error) {
      setAviso(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 034 do banco." : mensagemDeErro(error));
      return;
    }
    setAviso(emoji && !texto ? "Reação enviada" : `Resposta enviada para ${pessoa ? grupo.autor.usuario ?? grupo.autor.nome : grupo.autor.nome}`);
    if (texto) setResposta("");
  };
  const enviarResposta = (e: FormEvent) => {
    e.preventDefault();
    const t = resposta.trim();
    if (t) void interagir(null, t);
    (document.activeElement as HTMLElement | null)?.blur();
  };
  const podeInteragir = !grupo.meu;

  const linkAutor = pessoa ? (grupo.meu ? "/perfil" : `/p/${grupo.autor.usuario}`) : `/lugar/${grupo.autor.id}`;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black" role="dialog" aria-modal="true" aria-label={`Stories de ${grupo.autor.nome}`}>
      <div className="relative h-full w-full max-w-md">
        {ehVideo ? (
          <video
            key={story.id}
            ref={telaVideo}
            src={story.video_url!}
            poster={story.foto_url}
            playsInline
            autoPlay
            muted={mudo}
            onEnded={avancar}
            className="absolute inset-0 h-full w-full object-contain"
          />
        ) : (
          <img src={story.foto_url} alt={story.legenda ?? ""} className="absolute inset-0 h-full w-full object-contain" />
        )}
        {musicaFoto && <audio key={story.id} ref={telaMusica} src={musicaFoto.arquivo_url} autoPlay loop muted={mudo} />}
        {(ehVideo || musicaFoto) && (
          <button onClick={() => setMudo((m) => !m)} className="absolute right-3 top-20 z-20 rounded-full bg-black/45 p-2 text-white" aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
            {mudo ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
          </button>
        )}

        <div className="absolute inset-x-0 top-0 z-10 space-y-3 bg-gradient-to-b from-black/60 to-transparent p-3 pt-[max(12px,env(safe-area-inset-top))]">
          <div key={`${g}-${lista.length}`} className="flex gap-1">
            {lista.map((x, i) => (
              <span key={x.id} className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/30">
                <span
                  className="block h-full bg-white"
                  style={{
                    width: i < s ? "100%" : i > s ? "0%" : parado ? "50%" : undefined,
                    animation: i === s && !parado ? `progresso-story ${duracaoStory}ms linear forwards` : undefined,
                  }}
                />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2.5 text-white">
            <Link to={linkAutor} onClick={fechar} className="flex min-w-0 flex-1 items-center gap-2.5">
              {grupo.autor.logo_url ? (
                <img src={grupo.autor.logo_url} alt="" className="h-8 w-8 rounded-full object-cover" />
              ) : pessoa ? (
                <Avatar nome={grupo.autor.nome} tamanho="sm" />
              ) : (
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-white/20">
                  <Store className="h-4 w-4" />
                </span>
              )}
              <span className="truncate text-sm font-semibold">{grupo.meu ? "Seu story" : pessoa ? grupo.autor.usuario : grupo.autor.nome}</span>
              <span className="text-[13px] text-white/70">{tempoAtras(story.criado_em)}</span>
            </Link>
            {pessoa && (
              <div className="relative">
                <button onClick={() => setMenu((m) => !m)} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Mais opções" aria-expanded={menu}>
                  <MoreHorizontal className="h-5 w-5" />
                </button>
                {menu && (
                  <div className="absolute right-0 top-9 w-48 overflow-hidden rounded-xl bg-superficie text-sm text-texto shadow-lg">
                    {grupo.meu ? (
                      <>
                        <button onClick={() => void abrirVistos()} className="flex w-full items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                          <Eye className="h-4 w-4" />
                          Quem viu
                        </button>
                        <button onClick={() => void apagar()} className="flex w-full items-center gap-2 px-3 py-2.5 text-perigo hover:bg-elevado">
                          <Trash2 className="h-4 w-4" />
                          Apagar story
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => {
                          setMenu(false);
                          setDenunciando(true);
                        }}
                        className="flex w-full items-center gap-2 px-3 py-2.5 text-perigo hover:bg-elevado"
                      >
                        <Flag className="h-4 w-4" />
                        Denunciar story
                      </button>
                    )}
                  </div>
                )}
              </div>
            )}
            <button onClick={fechar} className="rounded-full p-1.5 hover:bg-white/10" aria-label="Fechar">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <button className="absolute bottom-24 left-0 top-24 w-1/3" aria-label="Story anterior" onClick={voltar} />
        <button
          className="absolute bottom-24 right-0 top-24 w-2/3"
          aria-label="Próximo story"
          onClick={avancar}
          onPointerDown={() => setPausado(true)}
          onPointerUp={() => setPausado(false)}
          onPointerLeave={() => setPausado(false)}
        />

        {(story.legenda || story.local || podeInteragir) && (
          <div className="absolute inset-x-0 bottom-0 space-y-3 bg-gradient-to-t from-black/75 to-transparent px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-10 text-center">
            {story.legenda && <p className="text-[15px] text-white">{story.legenda}</p>}
            {story.local && (
              <Link
                to={`/lugar/${story.local.id}`}
                onClick={fechar}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3 py-1.5 text-[13px] font-semibold text-black"
              >
                <MapPin className="h-3.5 w-3.5" />
                {story.local.nome}
              </Link>
            )}
            {podeInteragir && (
              <div className="space-y-2.5 text-left">
                <div className="flex justify-center gap-2.5" role="group" aria-label="Reagir ao story">
                  {REACOES.map((r) => (
                    <button
                      key={r}
                      onClick={() => void interagir(r, null)}
                      disabled={enviandoResposta}
                      className="text-[26px] leading-none transition-transform active:scale-125"
                      aria-label={`Reagir com ${r}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
                <form onSubmit={enviarResposta} className="flex items-center gap-2">
                  <input
                    value={resposta}
                    onChange={(e) => setResposta(e.target.value.slice(0, 500))}
                    onFocus={() => setEscrevendo(true)}
                    onBlur={() => setEscrevendo(false)}
                    placeholder={`Responder a ${pessoa ? grupo.autor.usuario ?? grupo.autor.nome : grupo.autor.nome}...`}
                    className="h-11 min-w-0 flex-1 rounded-full border border-white/60 bg-black/30 px-4 text-[15px] text-white placeholder:text-white/70 focus:border-white focus:outline-none"
                    enterKeyHint="send"
                  />
                  {resposta.trim() && (
                    <button type="submit" disabled={enviandoResposta} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-black" aria-label="Enviar resposta">
                      <Send className="h-5 w-5" />
                    </button>
                  )}
                </form>
              </div>
            )}
          </div>
        )}
        {voando && (
          <span key={voando.n} className="pointer-events-none absolute bottom-40 left-1/2 z-20 -translate-x-1/2 animate-[reacao-story_900ms_ease-out_forwards] text-[64px]" onAnimationEnd={() => setVoando(null)}>
            {voando.emoji}
          </span>
        )}
        {aviso && (
          <p role="status" className="absolute inset-x-0 top-24 z-20 mx-auto w-max max-w-[90%] rounded-full bg-black/70 px-4 py-2 text-center text-sm text-white">
            {aviso}
          </p>
        )}
      </div>

      {vistos !== null && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50" onClick={() => setVistos(null)}>
          <div className="max-h-[60vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 text-texto" onClick={(e) => e.stopPropagation()}>
            <h2 className="mb-2 flex items-center gap-2 font-semibold">
              <Eye className="h-4 w-4" />
              Visto por {vistos.length}
            </h2>
            {vistos.length === 0 ? (
              <p className="py-4 text-sm text-suave">Ninguém viu ainda.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {vistos.map((v) => (
                  <li key={v.usuario} className="flex items-center gap-3 py-2.5">
                    <Avatar nome={v.nome} foto={v.foto_url} tamanho="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{v.usuario}</span>
                      <span className="block truncate text-[12px] text-suave">{v.nome}</span>
                    </span>
                    {v.reacao && <span className="text-[20px] leading-none">{v.reacao}</span>}
                    <span className="text-[12px] text-suave">{tempoAtras(v.visto_em)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
      {denunciando && <JanelaDenuncia tipo="story" alvo={story.id} titulo="Denunciar story" fechar={() => setDenunciando(false)} />}
    </div>
  );
}

/** Círculo na barra de stories: anel magenta enquanto houver story não visto. */
export function AnelStory({ visto, children }: { visto: boolean; children: ReactNode }) {
  return (
    <span className={`inline-flex rounded-full p-[2.5px] ${visto ? "bg-borda" : "bg-magenta"}`}>
      <span className="inline-flex rounded-full bg-fundo p-[2px]">{children}</span>
    </span>
  );
}
