import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import clsx from "clsx";
import { Camera, Hash, Image as IconeGaleria, MapPin, Music, Pause, Play, Plus, Volume2, VolumeX, X } from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { useEnvios } from "@/lib/envios";
import { AudioVideo, ehVideo, lerVideo, liberarMidia, MAX_VIDEO, Musica, podeIrDireto, tempoVideo } from "@/lib/midia";
import { CameraRoVibes } from "@/components/CameraRoVibes";
import { EscolherMusica, pararPrevia } from "@/components/Musicas";
import { Lugar, useVitrine } from "./dados";

const MAX_FOTOS = 10;
const MAX_TAGS = 10;

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** "#Happy Hour" → "happyhour" (o mesmo que o banco faz). */
export const tagNormal = (s: string) =>
  sem(s)
    .replace(/[^a-z0-9_]/g, "")
    .slice(0, 30);

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

interface Foto {
  arquivo: File;
  url: string;
}

/**
 * Nova publicação de pessoa: no feed (fica na grade do perfil) ou story (24 h).
 * Vídeo de até 3 min ou até 10 fotos (carrossel no feed), com música opcional e hashtags.
 * Tela cheia com rolagem e o botão de publicar sempre visível; o envio segue em segundo plano.
 */
export function NovoStory({
  lugares: lugaresProp,
  fechar,
  publicado,
  destinoInicial = "story",
}: {
  lugares?: Lugar[];
  fechar: () => void;
  publicado: (destino: "story" | "feed") => void;
  destinoInicial?: "story" | "feed";
}) {
  const { perfil } = useSessao();
  const { publicar } = useEnvios();
  const vitrine = useVitrine();
  const lugares = lugaresProp?.length ? lugaresProp : vitrine.lugares;
  const [destino, setDestino] = useState<"story" | "feed">(destinoInicial);
  const galeria = useRef<HTMLInputElement>(null);
  const [camera, setCamera] = useState(false);
  // Vídeo (um) ou fotos (até 10).
  const [video, setVideo] = useState<{ arquivo: File; url: string } | null>(null);
  const [fotos, setFotos] = useState<Foto[]>([]);
  const [fotoAtual, setFotoAtual] = useState(0);
  const [duracaoTotal, setDuracaoTotal] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [audio, setAudio] = useState<AudioVideo>("original");
  const [musica, setMusica] = useState<Musica | null>(null);
  const [tocando, setTocando] = useState(true);
  const [legenda, setLegenda] = useState("");
  const [local, setLocal] = useState<Lugar | null>(null);
  const [buscaLocal, setBuscaLocal] = useState("");
  const [escolhendoLocal, setEscolhendoLocal] = useState(false);
  const [tags, setTags] = useState<string[]>([]);
  const [sugestoes, setSugestoes] = useState<{ tag: string; origem: string }[]>([]);
  const [novaTag, setNovaTag] = useState("");
  const [erro, setErro] = useState("");
  const telaVideo = useRef<HTMLVideoElement>(null);
  const telaMusica = useRef<HTMLAudioElement>(null);
  const temMidia = !!video || fotos.length > 0;
  const duracao = Math.min(MAX_VIDEO, duracaoTotal || MAX_VIDEO);
  const comMusica = audio === "musica" || audio === "mistura";

  // A página de trás não rola enquanto esta tela está aberta.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
      pararPrevia();
    };
  }, []);

  const opcoes = useMemo(() => {
    const t = sem(buscaLocal.trim());
    return lugares.filter((l) => !t || sem(`${l.nome} ${l.bairro ?? ""}`).includes(t)).slice(0, 20);
  }, [lugares, buscaLocal]);

  // Hashtags sugeridas pela vibe do lugar (ou as em alta, sem lugar). As da vibe já vêm marcadas.
  useEffect(() => {
    let vivo = true;
    void supabase.rpc("sugerir_tags", { p_local: local?.id ?? null }).then(({ data }) => {
      if (!vivo) return;
      const lista = (data ?? []) as { tag: string; origem: string }[];
      setSugestoes(lista);
      if (local) {
        const daVibe = lista.filter((s) => s.origem === "vibe").slice(0, 3).map((s) => s.tag);
        setTags((t) => [...new Set([...t, ...daVibe])].slice(0, MAX_TAGS));
      }
    });
    return () => {
      vivo = false;
    };
  }, [local]);

  const limparMidia = () => {
    if (video) URL.revokeObjectURL(video.url);
    fotos.forEach((f) => URL.revokeObjectURL(f.url));
    setVideo(null);
    setFotos([]);
    setFotoAtual(0);
  };

  const escolher = async (lista: File[]) => {
    if (galeria.current) galeria.current.value = "";
    setCamera(false);
    if (!lista.length) return;
    setErro("");
    const validos = lista.filter((f) => f.type.startsWith("image/") || f.type.startsWith("video/"));
    if (!validos.length) return setErro("Escolha fotos ou um vídeo.");
    const videos = validos.filter(ehVideo);
    const imagens = validos.filter((f) => !ehVideo(f));
    if (videos.length && (videos.length > 1 || imagens.length)) {
      // Vídeo vai sozinho: com fotos junto, ficam só as fotos.
      setErro("Vídeo vai sozinho. Escolha um vídeo ou até 10 fotos.");
      if (!imagens.length) return;
    } else if (videos.length) {
      const f = videos[0];
      try {
        const info = await lerVideo(f);
        setDuracaoTotal(info.duracao);
      } catch (e) {
        return setErro((e as Error).message);
      }
      limparMidia();
      setInicio(0);
      setAudio("original");
      setTocando(true);
      setVideo({ arquivo: f, url: URL.createObjectURL(f) });
      return;
    }
    // Fotos: soma às que já estão (até 10).
    if (video) limparMidia();
    const base = video ? [] : fotos;
    const espaco = MAX_FOTOS - base.length;
    if (imagens.length > espaco) setErro(`Até ${MAX_FOTOS} fotos por publicação.`);
    const novas = imagens.slice(0, Math.max(0, espaco)).map((f) => ({ arquivo: f, url: URL.createObjectURL(f) }));
    if (!base.length && audio === "original") setAudio("mudo");
    setFotos([...base, ...novas]);
    setFotoAtual(base.length);
    setTocando(true);
  };

  const tirarFoto = (i: number) => {
    URL.revokeObjectURL(fotos[i].url);
    const l = fotos.filter((_, j) => j !== i);
    setFotos(l);
    setFotoAtual((a) => Math.max(0, Math.min(a, l.length - 1)));
  };

  // Prévia do vídeo: repete o trecho escolhido, com a música junto quando houver.
  useEffect(() => {
    const v = telaVideo.current;
    if (!v || !video) return;
    v.muted = !(audio === "original" || audio === "mistura");
    v.volume = audio === "mistura" ? 0.45 : 1;
    const voltar = () => {
      if (v.currentTime < inicio || v.currentTime >= inicio + duracao) {
        v.currentTime = inicio;
        if (telaMusica.current) telaMusica.current.currentTime = 0;
      }
    };
    v.addEventListener("timeupdate", voltar);
    v.currentTime = inicio;
    if (telaMusica.current) telaMusica.current.currentTime = 0;
    if (tocando) void v.play().catch(() => setTocando(false));
    else v.pause();
    return () => v.removeEventListener("timeupdate", voltar);
  }, [video, inicio, duracao, audio, tocando]);

  // Música da prévia (vídeo ou fotos).
  useEffect(() => {
    const a = telaMusica.current;
    if (!a) return;
    if (comMusica && musica && tocando && temMidia) {
      pararPrevia();
      void a.play().catch(() => undefined);
    } else a.pause();
  }, [comMusica, musica, tocando, temMidia]);

  const alternarTag = (t: string) =>
    setTags((l) => (l.includes(t) ? l.filter((x) => x !== t) : l.length >= MAX_TAGS ? l : [...l, t]));
  const adicionarTag = () => {
    const t = tagNormal(novaTag);
    if (t.length >= 2 && !tags.includes(t) && tags.length < MAX_TAGS) setTags([...tags, t]);
    setNovaTag("");
  };

  const enviar = () => {
    if (!temMidia) return;
    if (comMusica && !musica) return setErro("Escolha uma música (ou tire a música).");
    const comum = { destino, legenda: legenda.trim() || null, localId: local?.id ?? null, tags };
    const musicaId = comMusica ? musica?.id ?? null : null;
    if (video) {
      liberarMidia(); // dentro do toque: libera som e vídeo para preparar em segundo plano
      const op = { inicio, duracao, audio, musicaUrl: musica?.arquivo_url ?? null, musicaInicio: 0 };
      publicar({ ...comum, midia: { tipo: "video", arquivo: video.arquivo, opcoes: op, regravar: !podeIrDireto(video.arquivo, duracaoTotal, op), musicaId } }, video.url);
    } else if (destino === "feed") {
      publicar({ ...comum, midia: { tipo: "fotos", arquivos: fotos.map((f) => f.arquivo), musicaId } }, fotos[0].url);
    } else {
      // Story: cada foto vira um story, na ordem.
      for (const f of fotos) publicar({ ...comum, midia: { tipo: "fotos", arquivos: [f.arquivo], musicaId } }, f.url);
    }
    telaMusica.current?.pause();
    publicado(destino);
  };

  if (camera)
    return createPortal(
      <div className="fixed inset-0 z-[90]">
        <CameraRoVibes capturado={(f) => void escolher([f])} fechar={() => setCamera(false)} />
      </div>,
      document.body,
    );

  const marcadasFora = tags.filter((t) => !sugestoes.some((s) => s.tag === t));

  return createPortal(
    <div className="fixed inset-0 z-[90] flex justify-center bg-black/60 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="Nova publicação">
      <div className="flex h-[100dvh] w-full max-w-md flex-col bg-superficie sm:h-[min(92dvh,860px)] sm:rounded-2xl sm:shadow-2xl">
        {/* Topo */}
        <div className="flex shrink-0 items-center gap-2 border-b border-borda px-3 pb-2.5 pt-[max(10px,env(safe-area-inset-top))]">
          <button onClick={fechar} className="rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
          <h2 className="flex-1 font-semibold">Nova publicação</h2>
          <div className="grid grid-cols-2 rounded-full border border-borda p-0.5 text-[13px]" role="tablist" aria-label="Onde publicar">
            {(["feed", "story"] as const).map((d) => (
              <button
                key={d}
                role="tab"
                aria-selected={destino === d}
                onClick={() => setDestino(d)}
                className={clsx("rounded-full px-3 py-1", destino === d ? "bg-marca font-semibold text-marca-texto" : "text-suave")}
              >
                {d === "feed" ? "Feed" : "Story"}
              </button>
            ))}
          </div>
        </div>

        {perfil?.suspenso ? (
          <p className="px-5 py-10 text-center text-sm text-perigo">Sua conta está suspensa pela moderação e não pode publicar.</p>
        ) : (
          <>
            {/* Conteúdo com rolagem */}
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-4 py-3">
              <input ref={galeria} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => void escolher([...(e.target.files ?? [])])} />

              {!temMidia ? (
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => setCamera(true)} className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave hover:bg-elevado">
                    <Camera className="h-8 w-8" />
                    <span className="text-sm font-medium">Câmera</span>
                  </button>
                  <button onClick={() => galeria.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave hover:bg-elevado">
                    <IconeGaleria className="h-8 w-8" />
                    <span className="text-sm font-medium">Galeria</span>
                    <span className="text-[11px]">vídeo até {tempoVideo(MAX_VIDEO)} · até {MAX_FOTOS} fotos</span>
                  </button>
                </div>
              ) : video ? (
                <div className="space-y-3">
                  <div className="relative overflow-hidden rounded-xl bg-black">
                    <video ref={telaVideo} src={video.url} playsInline loop className="mx-auto max-h-[46dvh] object-contain" onClick={() => setTocando((t) => !t)} />
                    <button onClick={() => setTocando((t) => !t)} className="absolute bottom-2 left-2 rounded-full bg-black/55 p-2 text-white" aria-label={tocando ? "Pausar prévia" : "Tocar prévia"}>
                      {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button onClick={() => galeria.current?.click()} className="absolute right-2 top-2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-semibold text-white">
                      Trocar
                    </button>
                    <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">{tempoVideo(duracao)}</span>
                  </div>
                  {duracaoTotal > MAX_VIDEO + 0.3 && (
                    <label className="block">
                      <span className="rotulo mb-1 flex justify-between">
                        <span>Trecho</span>
                        <span className="codigo">
                          {mmss(inicio)} – {mmss(inicio + duracao)}
                        </span>
                      </span>
                      <input
                        type="range"
                        min={0}
                        max={Math.max(0, duracaoTotal - MAX_VIDEO)}
                        step={0.1}
                        value={inicio}
                        onChange={(e) => setInicio(Number(e.target.value))}
                        className="w-full accent-[rgb(var(--marca))]"
                      />
                    </label>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="relative overflow-hidden rounded-xl bg-black">
                    <img src={fotos[fotoAtual]?.url} alt="" className="mx-auto max-h-[46dvh] object-contain" />
                    {fotos.length > 1 && (
                      <span className="absolute right-2 top-2 rounded-full bg-black/55 px-2 py-0.5 text-[12px] font-semibold text-white">
                        {fotoAtual + 1}/{fotos.length}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
                    {fotos.map((f, i) => (
                      <div key={f.url} className="relative shrink-0">
                        <button onClick={() => setFotoAtual(i)} className={clsx("block h-16 w-16 overflow-hidden rounded-lg ring-2", i === fotoAtual ? "ring-marca" : "ring-transparent")}>
                          <img src={f.url} alt="" className="h-full w-full object-cover" />
                        </button>
                        <button onClick={() => tirarFoto(i)} className="absolute -right-1 -top-1 rounded-full bg-black/80 p-0.5 text-white" aria-label="Tirar foto">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    ))}
                    {fotos.length < MAX_FOTOS && (
                      <button onClick={() => galeria.current?.click()} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-borda text-suave" aria-label="Adicionar fotos">
                        <Plus className="h-5 w-5" />
                      </button>
                    )}
                    <button onClick={() => setCamera(true)} className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg border-2 border-dashed border-borda text-suave" aria-label="Tirar foto">
                      <Camera className="h-5 w-5" />
                    </button>
                  </div>
                  {destino === "story" && fotos.length > 1 && <p className="text-[12px] text-suave">{fotos.length} stories, na ordem</p>}
                </div>
              )}

              {/* Som */}
              {temMidia && (
                <div>
                  <div className={clsx("grid gap-1.5", video ? "grid-cols-3" : "grid-cols-2")}>
                    {[
                      ...(video ? [{ v: "original" as AudioVideo, t: "Original", i: Volume2 }] : []),
                      { v: "mudo" as AudioVideo, t: "Sem som", i: VolumeX },
                      { v: "musica" as AudioVideo, t: "Música", i: Music },
                    ].map((o) => {
                      const ativo = audio === o.v || (o.v === "musica" && audio === "mistura");
                      return (
                        <button
                          key={o.v}
                          onClick={() => setAudio(o.v === "musica" && audio === "mistura" ? "mistura" : o.v)}
                          aria-pressed={ativo}
                          className={clsx("flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[13px] font-medium", ativo ? "border-marca bg-destaque-suave text-destaque" : "border-borda")}
                        >
                          <o.i className="h-4 w-4" />
                          {o.t}
                        </button>
                      );
                    })}
                  </div>
                  {comMusica && (
                    <div className="mt-2 space-y-2">
                      {video && (
                        <label className="flex items-center gap-2 text-[13px]">
                          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={audio === "mistura"} onChange={(e) => setAudio(e.target.checked ? "mistura" : "musica")} />
                          Som original junto
                        </label>
                      )}
                      <EscolherMusica
                        valor={musica}
                        mudar={(m) => {
                          setMusica(m);
                          setTocando(true);
                        }}
                      />
                      {musica && <audio ref={telaMusica} src={musica.arquivo_url} loop preload="auto" />}
                    </div>
                  )}
                </div>
              )}

              <textarea
                rows={destino === "feed" ? 3 : 1}
                value={legenda}
                onChange={(e) => setLegenda(e.target.value.slice(0, destino === "feed" ? 2200 : 200))}
                placeholder="Legenda"
                aria-label="Legenda"
                className="w-full resize-none rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm focus:border-marca focus:outline-none"
              />

              {/* Lugar */}
              <div>
                {local ? (
                  <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
                    <MapPin className="h-4 w-4 text-destaque" />
                    <span className="min-w-0 flex-1 truncate font-medium">{local.nome}</span>
                    <button
                      onClick={() => {
                        setLocal(null);
                        setTags((t) => t.filter((x) => !sugestoes.some((s) => s.tag === x && s.origem !== "alta")));
                      }}
                      className="rounded-full p-1 hover:bg-elevado"
                      aria-label="Tirar o lugar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : escolhendoLocal ? (
                  <div className="rounded-lg border border-borda">
                    <input
                      autoFocus
                      value={buscaLocal}
                      onChange={(e) => setBuscaLocal(e.target.value)}
                      placeholder="Buscar lugar"
                      className="h-10 w-full rounded-t-lg border-b border-borda bg-fundo px-3 text-sm focus:outline-none"
                    />
                    <ul className="max-h-44 overflow-y-auto overscroll-contain">
                      {opcoes.map((l) => (
                        <li key={l.id}>
                          <button
                            onClick={() => {
                              setLocal(l);
                              setEscolhendoLocal(false);
                            }}
                            className="w-full px-3 py-2 text-left text-sm hover:bg-elevado"
                          >
                            <span className="font-medium">{l.nome}</span>
                            {l.bairro && <span className="text-suave"> · {l.bairro}</span>}
                          </button>
                        </li>
                      ))}
                      {opcoes.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nenhum lugar encontrado.</li>}
                    </ul>
                  </div>
                ) : (
                  <button onClick={() => setEscolhendoLocal(true)} className="botao w-full">
                    <MapPin className="h-4 w-4" />
                    Marcar o lugar
                  </button>
                )}
              </div>

              {/* Hashtags */}
              <div>
                <p className="rotulo mb-1.5 flex items-center gap-1">
                  <Hash className="h-3.5 w-3.5" />
                  Hashtags
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {[...sugestoes.map((s) => s.tag), ...marcadasFora].map((t) => (
                    <button
                      key={t}
                      onClick={() => alternarTag(t)}
                      aria-pressed={tags.includes(t)}
                      className={clsx("rounded-full border px-2.5 py-1 text-[13px]", tags.includes(t) ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda text-suave")}
                    >
                      #{t}
                    </button>
                  ))}
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      adicionarTag();
                    }}
                    className="flex"
                  >
                    <input
                      value={novaTag}
                      onChange={(e) => setNovaTag(e.target.value)}
                      onBlur={adicionarTag}
                      placeholder="#nova"
                      aria-label="Nova hashtag"
                      disabled={tags.length >= MAX_TAGS}
                      className="h-[30px] w-24 rounded-full border border-dashed border-borda bg-transparent px-2.5 text-[13px] focus:border-marca focus:outline-none"
                    />
                  </form>
                </div>
              </div>
              {erro && <p className="text-sm text-perigo">{erro}</p>}
            </div>

            {/* Rodapé fixo: publicar sempre visível */}
            <div className="shrink-0 border-t border-borda bg-superficie px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3">
              <button className="botao-principal h-11 w-full" disabled={!temMidia} onClick={enviar}>
                {destino === "feed" ? "Publicar no feed" : fotos.length > 1 ? `Publicar ${fotos.length} stories` : "Publicar story"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
