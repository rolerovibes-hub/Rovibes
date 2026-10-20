import { useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Camera, Check, Image as IconeGaleria, MapPin, Music, Pause, Play, Volume2, VolumeX, X } from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { useEnvios } from "@/lib/envios";
import { AudioVideo, ehVideo, lerVideo, liberarMidia, listarMusicas, MAX_VIDEO, Musica, podeIrDireto } from "@/lib/midia";
import { CameraRoVibes } from "@/components/CameraRoVibes";
import { Lugar, useVitrine } from "./dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

/**
 * Nova publicação de pessoa: no feed (fica na grade do perfil) ou story (24 h).
 * Foto ou vídeo de até 15 s, da câmera ou da galeria; no vídeo, som original, sem som ou música.
 * Ao tocar em "Publicar" a janela fecha e o envio segue em segundo plano.
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
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [duracaoTotal, setDuracaoTotal] = useState(0);
  const [inicio, setInicio] = useState(0);
  const [audio, setAudio] = useState<AudioVideo>("original");
  const [musicas, setMusicas] = useState<Musica[] | null | undefined>(undefined);
  const [musica, setMusica] = useState<Musica | null>(null);
  const [tocando, setTocando] = useState(true);
  const [legenda, setLegenda] = useState("");
  const [local, setLocal] = useState<Lugar | null>(null);
  const [buscaLocal, setBuscaLocal] = useState("");
  const [escolhendoLocal, setEscolhendoLocal] = useState(false);
  const [erro, setErro] = useState("");
  const telaVideo = useRef<HTMLVideoElement>(null);
  const telaMusica = useRef<HTMLAudioElement>(null);
  const video = !!arquivo && ehVideo(arquivo);
  const duracao = Math.min(MAX_VIDEO, duracaoTotal || MAX_VIDEO);
  const comMusica = audio === "musica" || audio === "mistura";

  const opcoes = useMemo(() => {
    const t = sem(buscaLocal.trim());
    return lugares.filter((l) => !t || sem(`${l.nome} ${l.bairro ?? ""}`).includes(t)).slice(0, 20);
  }, [lugares, buscaLocal]);

  const escolher = async (f: File | null | undefined) => {
    if (galeria.current) galeria.current.value = "";
    setCamera(false);
    if (!f) return;
    setErro("");
    if (!f.type.startsWith("image/") && !f.type.startsWith("video/")) return setErro("Escolha uma foto ou um vídeo.");
    if (ehVideo(f)) {
      try {
        const info = await lerVideo(f);
        setDuracaoTotal(info.duracao);
      } catch (e) {
        return setErro((e as Error).message);
      }
    }
    if (previa) URL.revokeObjectURL(previa);
    setInicio(0);
    setAudio("original");
    setMusica(null);
    setTocando(true);
    setArquivo(f);
    setPrevia(URL.createObjectURL(f));
  };

  // Músicas só quando é vídeo.
  useEffect(() => {
    if (video && musicas === undefined) listarMusicas().then(setMusicas);
  }, [video, musicas]);

  // Prévia: repete o trecho escolhido, com a música junto quando houver.
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
    if (tocando) {
      void v.play().catch(() => setTocando(false));
      if (comMusica && telaMusica.current) void telaMusica.current.play().catch(() => undefined);
    } else {
      v.pause();
      telaMusica.current?.pause();
    }
    if (!comMusica) telaMusica.current?.pause();
    return () => v.removeEventListener("timeupdate", voltar);
  }, [video, inicio, duracao, audio, musica, tocando, comMusica, previa]);

  useEffect(
    () => () => {
      telaMusica.current?.pause();
    },
    [],
  );

  const enviar = () => {
    if (!arquivo) return;
    if (comMusica && !musica) return setErro("Escolha uma música (ou volte para o som original).");
    if (video) liberarMidia(); // dentro do toque: libera som e vídeo para preparar em segundo plano
    const op = { inicio, duracao, audio, musicaUrl: musica?.arquivo_url ?? null, musicaInicio: 0 };
    publicar(
      {
        destino,
        legenda: legenda.trim() || null,
        localId: local?.id ?? null,
        midia: video ? { tipo: "video", arquivo, opcoes: op, regravar: !podeIrDireto(arquivo, duracaoTotal, op), musicaId: comMusica ? musica?.id ?? null : null } : { tipo: "foto", arquivo },
      },
      previa,
    );
    telaMusica.current?.pause();
    publicado(destino);
  };

  if (camera) return <CameraRoVibes capturado={(f) => void escolher(f)} fechar={() => setCamera(false)} />;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Nova publicação" onClick={fechar}>
      <div className="max-h-[96vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Nova publicação</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {perfil?.suspenso ? (
          <p className="py-6 text-center text-sm text-perigo">Sua conta está suspensa pela moderação e não pode publicar.</p>
        ) : (
          <>
            <div className="mt-3 grid grid-cols-2 rounded-full border border-borda p-0.5" role="tablist" aria-label="Onde publicar">
              {(["feed", "story"] as const).map((d) => (
                <button
                  key={d}
                  role="tab"
                  aria-selected={destino === d}
                  onClick={() => setDestino(d)}
                  className={clsx("rounded-full py-1.5 text-sm", destino === d ? "bg-marca font-semibold text-marca-texto" : "text-suave")}
                >
                  {d === "feed" ? "Feed" : "Story (24 h)"}
                </button>
              ))}
            </div>
            <input ref={galeria} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => void escolher(e.target.files?.[0])} />

            {!arquivo || !previa ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button onClick={() => setCamera(true)} className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave hover:bg-elevado">
                  <Camera className="h-8 w-8" />
                  <span className="text-sm font-medium">Câmera</span>
                  <span className="px-2 text-center text-[11px]">Foto ou vídeo de até {MAX_VIDEO} s</span>
                </button>
                <button onClick={() => galeria.current?.click()} className="flex aspect-[4/5] flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-borda text-suave hover:bg-elevado">
                  <IconeGaleria className="h-8 w-8" />
                  <span className="text-sm font-medium">Galeria</span>
                  <span className="px-2 text-center text-[11px]">Fotos e vídeos do celular</span>
                </button>
              </div>
            ) : video ? (
              <div className="mt-3 space-y-3">
                <div className="relative overflow-hidden rounded-xl bg-black">
                  <video ref={telaVideo} src={previa} playsInline loop className="mx-auto max-h-[42vh] object-contain" onClick={() => setTocando((t) => !t)} />
                  <button onClick={() => setTocando((t) => !t)} className="absolute bottom-2 left-2 rounded-full bg-black/55 p-2 text-white" aria-label={tocando ? "Pausar prévia" : "Tocar prévia"}>
                    {tocando ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                  </button>
                  <button onClick={() => galeria.current?.click()} className="absolute right-2 top-2 rounded-full bg-black/55 px-3 py-1 text-[12px] font-semibold text-white">
                    Trocar
                  </button>
                  <span className="absolute bottom-2 right-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">{Math.round(duracao)} s</span>
                </div>
                {duracaoTotal > MAX_VIDEO + 0.3 && (
                  <label className="block">
                    <span className="rotulo mb-1 flex justify-between">
                      <span>Trecho de {MAX_VIDEO} s</span>
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
                    <span className="text-[12px] text-suave">O vídeo tem {Math.round(duracaoTotal)} s: arraste para escolher a parte que vai ser publicada.</span>
                  </label>
                )}
                <div>
                  <p className="rotulo mb-1.5">Som</p>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { v: "original" as AudioVideo, t: "Original", i: Volume2 },
                      { v: "mudo" as AudioVideo, t: "Sem som", i: VolumeX },
                      { v: "musica" as AudioVideo, t: "Música", i: Music },
                    ].map((o) => (
                      <button
                        key={o.v}
                        onClick={() => setAudio(o.v === "musica" && audio === "mistura" ? "mistura" : o.v)}
                        aria-pressed={audio === o.v || (o.v === "musica" && audio === "mistura")}
                        className={clsx(
                          "flex items-center justify-center gap-1.5 rounded-lg border py-2 text-[13px] font-medium",
                          audio === o.v || (o.v === "musica" && audio === "mistura") ? "border-marca bg-destaque-suave text-destaque" : "border-borda",
                        )}
                      >
                        <o.i className="h-4 w-4" />
                        {o.t}
                      </button>
                    ))}
                  </div>
                  {comMusica && (
                    <div className="mt-2 space-y-2">
                      <label className="flex items-center gap-2 text-[13px]">
                        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={audio === "mistura"} onChange={(e) => setAudio(e.target.checked ? "mistura" : "musica")} />
                        Manter o som original junto, mais baixo
                      </label>
                      {musicas === undefined ? (
                        <p className="text-[13px] text-suave">Carregando músicas...</p>
                      ) : musicas === null ? (
                        <p className="text-[13px] text-suave">As músicas aparecem depois que a atualização 036 do banco for aplicada.</p>
                      ) : musicas.length === 0 ? (
                        <p className="text-[13px] text-suave">Nenhuma música disponível ainda.</p>
                      ) : (
                        <ul className="max-h-40 divide-y divide-borda overflow-y-auto rounded-lg border border-borda">
                          {musicas.map((m) => (
                            <li key={m.id}>
                              <button onClick={() => setMusica(m)} className={clsx("flex w-full items-center gap-2.5 px-3 py-2 text-left", musica?.id === m.id && "bg-destaque-suave")}>
                                <span className={clsx("flex h-8 w-8 shrink-0 items-center justify-center rounded-full", musica?.id === m.id ? "bg-marca text-marca-texto" : "bg-elevado text-suave")}>
                                  {musica?.id === m.id ? <Check className="h-4 w-4" /> : <Music className="h-4 w-4" />}
                                </span>
                                <span className="min-w-0 flex-1">
                                  <span className="block truncate text-sm font-medium">{m.titulo}</span>
                                  <span className="block truncate text-[12px] text-suave">{[m.artista, m.estilo].filter(Boolean).join(" · ")}</span>
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {musica && <audio ref={telaMusica} src={musica.arquivo_url} loop preload="auto" />}
                      <p className="text-[11px] text-suave">Só músicas com licença de uso no RoVibes.</p>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <button onClick={() => galeria.current?.click()} className="mt-3 block w-full overflow-hidden rounded-xl bg-black" aria-label="Trocar foto">
                <img src={previa} alt="Prévia" className="mx-auto max-h-[46vh] object-contain" />
              </button>
            )}

            <label className="mt-3 block">
              <span className="sr-only">Legenda</span>
              <textarea
                rows={destino === "feed" ? 3 : 1}
                value={legenda}
                onChange={(e) => setLegenda(e.target.value.slice(0, destino === "feed" ? 2200 : 200))}
                placeholder="Escreva uma legenda (opcional)"
                className="w-full resize-none rounded-lg border border-borda bg-fundo px-3 py-2.5 text-sm focus:border-marca focus:outline-none"
              />
            </label>

            <div className="mt-3">
              {local ? (
                <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
                  <MapPin className="h-4 w-4 text-destaque" />
                  <span className="min-w-0 flex-1 truncate font-medium">{local.nome}</span>
                  <button onClick={() => setLocal(null)} className="rounded-full p-1 hover:bg-elevado" aria-label="Tirar o lugar">
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
                  <ul className="max-h-44 overflow-y-auto">
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

            <p className="mt-3 text-[12px] text-suave">
              {destino === "feed"
                ? perfil?.privado
                  ? "Seu perfil é privado: só seus seguidores veem. Fica na grade do seu perfil."
                  : "Aparece no feed de quem segue você e na grade do seu perfil."
                : perfil?.privado
                  ? "Seu perfil é privado: só seus seguidores veem por 24 horas."
                  : "Seus seguidores veem por 24 horas."}{" "}
              O envio continua enquanto você usa o app.
            </p>
            {erro && <p className="mt-2 text-sm text-perigo">{erro}</p>}
            <button className="botao-principal mt-3 h-11 w-full" disabled={!arquivo} onClick={enviar}>
              {destino === "feed" ? "Publicar no feed" : "Publicar story"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
