import { useCallback, useEffect, useRef, useState } from "react";
import { IconeConvite, IconePapo } from "@/components/IconesRoVibes";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, ChevronRight, Clapperboard, MapPin, Music2, Navigation, Pause, Plus, Radio, Volume2, VolumeX, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { posicaoSeLiberada } from "@/lib/agora";
import { Avatar } from "@/components/Avatar";
import { BotaoBrindar } from "@/components/Brindar";
import { FolhaComentarios } from "@/components/Comentarios";
import { QuemBrindou } from "@/components/QuemBrindou";
import { alternarCurtida, tempoAtras } from "./conteudo";
import { Navegacao } from "./Navegacao";
import { NovoStory } from "./NovoStory";

type Modo = "ao_vivo" | "para_voce";

export interface Corte {
  id: string;
  /** Publicação de pessoa (padrão) ou de lugar (vídeos do Feed). */
  tipo?: "pessoa" | "lugar";
  video_url: string;
  foto_url: string | null;
  texto: string | null;
  criado_em: string;
  autor: { id: string; nome: string; usuario: string | null; foto_url: string | null; link?: string };
  local: { id: string; nome: string; logo_url: string | null; latitude: number | null; longitude: number | null } | null;
  musica: { id: string; titulo: string; artista: string | null } | null;
  tocando_agora: string | null;
  curtidas: number;
  curti: boolean;
  comentarios: number;
  ao_vivo: boolean;
  distancia_km: number | null;
}

const POR_VEZ = 8;
const ALTURA_NAV = "calc(64px + env(safe-area-inset-bottom))";
export const km = (d: number) => (d < 1 ? `${Math.round(d * 1000)} m` : `${String(d).replace(".", ",")} km`);

/**
 * VibeCut: vídeos verticais dos rolês em tela cheia.
 * "Ao vivo agora" mostra só o que foi gravado num lugar nas últimas 2 horas, com o botão "Ir para lá".
 */
export function VibeCut() {
  const { sessao } = useSessao();
  const eu = sessao?.user.id ?? "";
  const [modo, setModo] = useState<Modo>("ao_vivo");
  const [doLugar, setDoLugar] = useState<{ id: string; nome: string } | null>(null);
  const [lista, setLista] = useState<Corte[] | null>(null);
  const [fim, setFim] = useState(false);
  const [erro, setErro] = useState("");
  const [atual, setAtual] = useState(0);
  const [mudo, setMudo] = useState(true);
  const [pausado, setPausado] = useState(false);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const [comentando, setComentando] = useState<string | null>(null);
  const [brindes, setBrindes] = useState<string | null>(null);
  const [trilha, setTrilha] = useState<Corte | null>(null);
  const [rota, setRota] = useState<Corte | null>(null);
  const [gravar, setGravar] = useState(false);
  const [semAoVivo, setSemAoVivo] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const carregando = useRef(false);
  const primeiraVez = useRef(true);

  useEffect(() => {
    document.title = "VibeCut · RoVibes";
    void posicaoSeLiberada().then(setPos);
  }, []);

  const buscar = useCallback(
    async (inicio: number) => {
      const { data, error } = await supabase.rpc("vibecuts", {
        p_modo: doLugar ? "para_voce" : modo,
        p_lat: pos?.[0] ?? null,
        p_lng: pos?.[1] ?? null,
        p_inicio: inicio,
        p_limite: POR_VEZ,
        p_local: doLugar?.id ?? null,
      });
      if (error) {
        setErro(/function|schema cache/i.test(error.message) ? "O VibeCut aparece depois que a atualização 043 do banco for aplicada." : "Não foi possível carregar os vídeos.");
        return [] as Corte[];
      }
      return ((data ?? []) as Corte[]).map((c) => ({ ...c, distancia_km: c.distancia_km == null ? null : Number(c.distancia_km) }));
    },
    [modo, pos, doLugar],
  );

  // Recarrega ao trocar de aba (Ao vivo / Para você) ou ao abrir "do mesmo lugar".
  useEffect(() => {
    let vivo = true;
    setLista(null);
    setFim(false);
    setErro("");
    setAtual(0);
    caixa.current?.scrollTo({ top: 0 });
    void buscar(0).then((l) => {
      if (!vivo) return;
      // Ninguém postou ao vivo agora: na primeira abertura vai direto para "Para você".
      if (!l.length && modo === "ao_vivo" && !doLugar && primeiraVez.current) {
        primeiraVez.current = false;
        setSemAoVivo(true);
        setModo("para_voce");
        return;
      }
      primeiraVez.current = false;
      setLista(l);
      setFim(l.length < POR_VEZ);
    });
    return () => {
      vivo = false;
    };
  }, [buscar, modo, doLugar]);

  const maisVideos = useCallback(async () => {
    if (!lista || fim || carregando.current) return;
    carregando.current = true;
    const l = await buscar(lista.length);
    carregando.current = false;
    setLista((x) => [...(x ?? []), ...l.filter((n) => !(x ?? []).some((v) => v.id === n.id))]);
    if (l.length < POR_VEZ) setFim(true);
  }, [lista, fim, buscar]);

  const aoRolar = () => {
    const el = caixa.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== atual) {
      setAtual(i);
      setPausado(false);
    }
    if (lista && i >= lista.length - 3) void maisVideos();
  };

  const brindar = async (c: Corte) => {
    setLista((l) => l?.map((x) => (x.id === c.id ? { ...x, curti: !c.curti, curtidas: x.curtidas + (c.curti ? -1 : 1) } : x)) ?? null);
    const { error } = await alternarCurtida(c.id, eu, c.curti, true);
    if (error) setLista((l) => l?.map((x) => (x.id === c.id ? c : x)) ?? null);
  };

  const compartilhar = async (c: Corte) => {
    const url = `${window.location.origin}/publicacao/pessoa/${c.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "VibeCut no RoVibes", text: c.local ? `Olha o rolê no ${c.local.nome}` : "Olha esse rolê", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelou */
    }
  };

  return (
    <div className="fixed inset-x-0 top-0 z-20 mx-auto max-w-xl bg-black text-white" style={{ bottom: ALTURA_NAV }}>
      {/* Topo: abas Para você / Ao vivo agora, sobre o vídeo */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[max(10px,env(safe-area-inset-top))]">
        {doLugar ? (
          <button className="pointer-events-auto flex min-w-0 items-center gap-1.5 rounded-full bg-black/40 px-3 py-1.5 text-sm font-semibold backdrop-blur" onClick={() => setDoLugar(null)}>
            <ArrowLeft className="h-4 w-4 shrink-0" />
            <span className="truncate">{doLugar.nome}</span>
          </button>
        ) : (
          <div className="pointer-events-auto mx-auto flex items-center gap-1 rounded-full bg-black/35 p-1 text-[13px] font-semibold backdrop-blur" role="tablist" aria-label="VibeCut">
            {(
              [
                ["para_voce", "🔥 Para você"],
                ["ao_vivo", "⚡ Ao vivo agora"],
              ] as const
            ).map(([m, nome]) => (
              <button
                key={m}
                role="tab"
                aria-selected={modo === m}
                onClick={() => {
                  setSemAoVivo(false);
                  setModo(m);
                }}
                className={clsx("rounded-full px-3 py-1.5 transition-colors", modo === m ? "bg-white text-black" : "text-white/80")}
              >
                {nome}
              </button>
            ))}
          </div>
        )}
        <button
          className="pointer-events-auto absolute right-3 top-[max(10px,env(safe-area-inset-top))] rounded-full bg-black/40 p-2 backdrop-blur"
          onClick={() => setGravar(true)}
          aria-label="Gravar um VibeCut"
        >
          <Plus className="h-5 w-5" />
        </button>
      </div>

      {lista === null ? (
        <div className="flex h-full items-center justify-center">
          <Clapperboard className="h-8 w-8 animate-pulse text-white/50" />
        </div>
      ) : lista.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-8 text-center">
          <Radio className="h-10 w-10 text-white/60" />
          <p className="mt-4 text-lg font-semibold">{erro || (modo === "ao_vivo" ? "Nada ao vivo nas últimas 2 horas" : "Ainda não tem VibeCut por aqui")}</p>
          {!erro && <p className="mt-1 text-sm text-white/70">Grave o rolê de agora (até 3 min), marque o lugar e mostre para a galera como está.</p>}
          {!erro && (
            <button className="mt-6 rounded-full bg-white px-5 py-2.5 font-semibold text-black" onClick={() => setGravar(true)}>
              Gravar um VibeCut
            </button>
          )}
          {modo === "ao_vivo" && !erro && (
            <button className="mt-3 text-sm font-medium text-white/80 underline" onClick={() => setModo("para_voce")}>
              Ver os melhores momentos
            </button>
          )}
        </div>
      ) : (
        <div ref={caixa} onScroll={aoRolar} className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]">
          {semAoVivo && atual === 0 && (
            <p className="pointer-events-none absolute inset-x-0 top-16 z-20 mx-auto w-fit rounded-full bg-black/55 px-3 py-1 text-[12px] backdrop-blur">
              Ninguém postou ao vivo nas últimas 2 h · mostrando os melhores momentos
            </p>
          )}
          {lista.map((c, i) => (
            <Video
              key={c.id}
              c={c}
              ativo={i === atual && !rota && !gravar}
              perto={Math.abs(i - atual) <= 1}
              mudo={mudo}
              pausado={pausado}
              alternarPausa={() => setPausado((p) => !p)}
              alternarSom={() => setMudo((m) => !m)}
              brindar={() => void brindar(c)}
              verBrindes={() => setBrindes(c.id)}
              comentar={() => setComentando(c.id)}
              compartilhar={() => void compartilhar(c)}
              abrirTrilha={() => setTrilha(c)}
              irParaLa={() => setRota(c)}
              eu={eu}
            />
          ))}
          {!fim && (
            <div className="flex h-24 snap-start items-center justify-center text-sm text-white/60">Carregando mais...</div>
          )}
        </div>
      )}

      {comentando && <FolhaComentarios tipo="pessoa" id={comentando} fechar={() => setComentando(null)} aoMudarTotal={(n) => setLista((l) => l?.map((x) => (x.id === comentando ? { ...x, comentarios: n } : x)) ?? null)} />}
      {brindes && <QuemBrindou tipo="pessoa" id={brindes} fechar={() => setBrindes(null)} />}
      {trilha && (
        <FolhaTrilha
          c={trilha}
          fechar={() => setTrilha(null)}
          verDoLugar={() => {
            if (trilha.local) setDoLugar({ id: trilha.local.id, nome: trilha.local.nome });
            setTrilha(null);
          }}
        />
      )}
      {rota?.local?.latitude != null && rota.local.longitude != null && (
        <Navegacao destino={{ nome: rota.local.nome, lat: rota.local.latitude, lng: rota.local.longitude }} fechar={() => setRota(null)} />
      )}
      {gravar && <NovoStory destinoInicial="feed" fechar={() => setGravar(false)} publicado={() => setGravar(false)} />}
    </div>
  );
}

export function Video({
  c,
  ativo,
  perto,
  mudo,
  pausado,
  alternarPausa,
  alternarSom,
  brindar,
  verBrindes,
  comentar,
  compartilhar,
  abrirTrilha,
  irParaLa,
  eu,
}: {
  c: Corte;
  ativo: boolean;
  perto: boolean;
  mudo: boolean;
  pausado: boolean;
  alternarPausa: () => void;
  alternarSom: () => void;
  brindar: () => void;
  verBrindes: () => void;
  comentar: () => void;
  compartilhar: () => void;
  abrirTrilha: () => void;
  irParaLa: () => void;
  eu: string;
}) {
  const v = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const el = v.current;
    if (!el) return;
    if (ativo && !pausado)
      void el.play().catch(() => {
        // O aparelho não deixou tocar com som: toca mudo (o botão de som liga depois).
        el.muted = true;
        void el.play().catch(() => undefined);
      });
    else el.pause();
  }, [ativo, pausado]);

  const trilha = c.musica ? `${c.musica.titulo}${c.musica.artista ? ` · ${c.musica.artista}` : ""}` : c.tocando_agora ? `Tocando agora: ${c.tocando_agora}` : "Som original";
  const temRota = c.ao_vivo && c.local?.latitude != null && c.local?.longitude != null;
  const perfil = c.autor.link ?? (c.autor.id === eu ? "/perfil" : c.autor.usuario ? `/p/${c.autor.usuario}` : "/");
  const sombra = "drop-shadow-[0_1px_3px_rgba(0,0,0,0.7)]";

  return (
    <section className="relative h-full snap-start snap-always overflow-hidden" aria-label={`VibeCut de ${c.autor.nome}`}>
      {perto ? (
        <video
          ref={v}
          src={c.video_url}
          poster={c.foto_url ?? undefined}
          loop
          playsInline
          muted={mudo}
          preload={ativo ? "auto" : "metadata"}
          onClick={alternarPausa}
          className="h-full w-full object-cover"
        />
      ) : (
        c.foto_url && <img src={c.foto_url} alt="" className="h-full w-full object-cover" loading="lazy" />
      )}
      {ativo && pausado && (
        <span className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/40 p-4">
          <Pause className="h-8 w-8" />
        </span>
      )}

      {/* Selo AO VIVO */}
      {c.ao_vivo && (
        <span className="absolute left-3 top-[calc(max(10px,env(safe-area-inset-top))+48px)] z-10 inline-flex items-center gap-1.5 rounded-full bg-perigo/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-white/80" />
            <span className="relative inline-flex h-2 w-2 rounded-full bg-white" />
          </span>
          Ao vivo · há {tempoAtras(c.criado_em)}
        </span>
      )}

      {/* Ações na lateral direita */}
      <div className={clsx("absolute bottom-24 right-2 z-10 flex flex-col items-center gap-4", sombra)}>
        <Link to={perfil} className="relative" aria-label={`Perfil de ${c.autor.nome}`}>
          <span className="block rounded-full ring-2 ring-white">
            <Avatar nome={c.autor.nome} foto={c.autor.foto_url} />
          </span>
        </Link>
        <span className="flex flex-col items-center">
          <BotaoBrindar ativo={c.curti} aoBrindar={brindar} tamanho="xl" sobreFoto />
          <button className="text-[12px] font-semibold" onClick={verBrindes} disabled={!c.curtidas} aria-label="Ver quem brindou">
            {c.curtidas}
          </button>
        </span>
        <button className="flex flex-col items-center text-[12px] font-semibold" onClick={comentar} aria-label="Comentários">
          <IconePapo className="h-8 w-8" />
          {c.comentarios}
        </button>
        <button className="flex flex-col items-center text-[12px] font-semibold" onClick={compartilhar} aria-label="Convidar (compartilhar)">
          <IconeConvite className="h-7 w-7" />
          Convidar
        </button>
        <button className="rounded-full bg-black/30 p-2" onClick={alternarSom} aria-label={mudo ? "Ligar o som" : "Tirar o som"}>
          {mudo ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
        </button>
      </div>

      {/* Legenda, lugar e trilha na parte de baixo */}
      <div className={clsx("absolute inset-x-0 bottom-0 z-[5] bg-gradient-to-t from-black/80 via-black/30 to-transparent px-3 pt-16", temRota ? "pb-20" : "pb-4")}>
        <div className={clsx("max-w-[78%] space-y-1.5", sombra)}>
          <Link to={perfil} className="block text-[15px] font-semibold">
            {c.autor.usuario ? `@${c.autor.usuario}` : c.autor.nome}
            {!c.ao_vivo && <span className="ml-2 text-[12px] font-normal text-white/75">{tempoAtras(c.criado_em)}</span>}
          </Link>
          {c.texto && <p className="line-clamp-2 text-[14px] leading-snug">{c.texto}</p>}
          {c.local && (
            <Link to={`/lugar/${c.local.id}`} className="inline-flex max-w-full items-center gap-1 text-[13px] font-medium text-white/90">
              <MapPin className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate">{c.local.nome}</span>
              {c.distancia_km != null && <span className="shrink-0 text-white/70">· {km(c.distancia_km)}</span>}
            </Link>
          )}
          <button onClick={abrirTrilha} className="flex max-w-full items-center gap-2 text-[13px]">
            <span className={clsx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[#2a2a2a] to-black ring-1 ring-white/40", ativo && !pausado && "animate-[spin_4s_linear_infinite]")}>
              <Music2 className="h-3 w-3" />
            </span>
            <span className="truncate">{trilha}</span>
          </button>
        </div>
      </div>

      {/* Ir para lá (só nos vídeos ao vivo) */}
      {temRota && (
        <button
          onClick={irParaLa}
          className="absolute inset-x-3 bottom-3 z-10 mx-auto flex max-w-sm items-center gap-2 rounded-full bg-white/95 px-4 py-2.5 text-left text-[14px] font-semibold text-black shadow-xl"
        >
          <MapPin className="h-4 w-4 shrink-0 text-magenta" />
          <span className="min-w-0 flex-1 truncate">
            {c.local!.nome}
            {c.distancia_km != null && <span className="font-normal text-black/60"> · {km(c.distancia_km)}</span>}
          </span>
          <span className="inline-flex shrink-0 items-center gap-1 text-marca">
            Ir para lá
            <Navigation className="h-4 w-4" />
          </span>
        </button>
      )}
    </section>
  );
}

/** Toque na trilha: o que está tocando no lugar agora e outros VibeCuts gravados lá. */
export function FolhaTrilha({ c, fechar, verDoLugar }: { c: Corte; fechar: () => void; verDoLugar: () => void }) {
  const [outros, setOutros] = useState<Corte[] | null>(null);
  useEffect(() => {
    if (!c.local) return setOutros([]);
    supabase.rpc("vibecuts", { p_modo: "para_voce", p_local: c.local.id, p_limite: 12 }).then(({ data }) => {
      const l = ((data ?? []) as Corte[]).filter((x) => x.id !== c.id);
      // Primeiro os que usam a mesma música.
      setOutros(c.musica ? [...l.filter((x) => x.musica?.id === c.musica?.id), ...l.filter((x) => x.musica?.id !== c.musica?.id)] : l);
    });
  }, [c]);

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50" role="dialog" aria-modal="true" aria-label="Trilha sonora" onClick={fechar}>
      <div className="folha max-h-[75vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 text-texto pb-[max(16px,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Music2 className="h-5 w-5 text-magenta" />
          <h2 className="flex-1 font-semibold">Trilha sonora</h2>
          <button className="-mr-2 rounded-full p-2 hover:bg-elevado" onClick={fechar} aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <ul className="space-y-2 text-sm">
          <li className="rounded-lg bg-elevado/70 px-3 py-2">
            <span className="block text-[12px] text-suave">No vídeo</span>
            <span className="font-medium">{c.musica ? `${c.musica.titulo}${c.musica.artista ? ` · ${c.musica.artista}` : ""}` : "Som original do ambiente"}</span>
          </li>
          {c.local && (
            <li className="rounded-lg bg-elevado/70 px-3 py-2">
              <span className="block text-[12px] text-suave">Tocando agora no {c.local.nome}</span>
              <span className="font-medium">{c.tocando_agora ?? "O lugar ainda não informou o que está tocando."}</span>
            </li>
          )}
        </ul>
        {c.local && (
          <>
            <div className="mb-2 mt-4 flex items-center justify-between">
              <h3 className="text-sm font-semibold">Outros VibeCuts no {c.local.nome}</h3>
              {outros && outros.length > 0 && (
                <button className="inline-flex items-center text-[13px] font-medium text-destaque" onClick={verDoLugar}>
                  Ver todos
                  <ChevronRight className="h-4 w-4" />
                </button>
              )}
            </div>
            {outros === null ? (
              <p className="text-sm text-suave">Carregando...</p>
            ) : outros.length === 0 ? (
              <p className="text-sm text-suave">Só este por enquanto.</p>
            ) : (
              <ul className="grid grid-cols-3 gap-1.5">
                {outros.slice(0, 9).map((o) => (
                  <li key={o.id}>
                    <button onClick={verDoLugar} className="relative block aspect-[9/16] w-full overflow-hidden rounded-lg bg-elevado">
                      {o.foto_url && <img src={o.foto_url} alt="" className="h-full w-full object-cover" loading="lazy" />}
                      {o.musica?.id && o.musica.id === c.musica?.id && (
                        <span className="absolute left-1 top-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">mesmo som</span>
                      )}
                      {o.ao_vivo && <span className="absolute bottom-1 left-1 rounded bg-perigo px-1 text-[10px] font-bold text-white">AO VIVO</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
