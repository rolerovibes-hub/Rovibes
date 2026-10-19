import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, ChevronRight, Heart, LocateFixed, MapPin, Newspaper, Plus, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { Avatar } from "@/components/Avatar";
import { useSessao } from "@/lib/sessao";
import { distanciaKm, km, Lugar, pedirLocalizacao, quando, useVitrine } from "./dados";
import { useResumos } from "./presenca";
import { alternarCurtida, buscarFeed, buscarStories, seguirLugar, buscarStoriesPessoas, GrupoStories, PublicacaoApp, tempoAtras } from "./conteudo";
import { NovoStory } from "./NovoStory";
import { AnelStory, VisorStories } from "./VisorStories";

/** Posição já liberada (não pede permissão sozinho ao abrir o Feed). */
function usePosicaoSilenciosa() {
  const [pos, setPos] = useState<[number, number] | null>(null);
  useEffect(() => {
    const p = navigator.permissions?.query({ name: "geolocation" as PermissionName });
    p?.then((s) => {
      if (s.state === "granted") pedirLocalizacao().then(setPos).catch(() => undefined);
    }).catch(() => undefined);
  }, []);
  const pedir = () => pedirLocalizacao().then(setPos).catch(() => undefined);
  return { pos, pedir };
}

export function Feed() {
  const { sessao, perfil } = useSessao();
  const usuario = sessao!.user.id;
  const { lugares, carregando } = useVitrine();
  const { resumos } = useResumos(null);
  const { pos, pedir } = usePosicaoSilenciosa();
  const [grupos, setGrupos] = useState<GrupoStories[]>([]);
  const [gruposLugares, setGruposLugares] = useState<GrupoStories[]>([]);
  const [pubs, setPubs] = useState<PublicacaoApp[] | null>(null);
  const [visor, setVisor] = useState<{ lista: "pessoas" | "lugares"; inicio: number } | null>(null);
  const [meuStory, setMeuStory] = useState(false);

  // Bolinhas do topo: só pessoas (o seu primeiro). Stories dos lugares vão para o "Em alta".
  const carregarStories = useCallback(
    () =>
      Promise.all([buscarStoriesPessoas(usuario), buscarStories(usuario)]).then(([pessoas, lugares]) => {
        const meu = pessoas.filter((x) => x.meu);
        const outros = pessoas.filter((x) => !x.meu).sort((a, b) => Number(a.vistos) - Number(b.vistos));
        setGrupos([...meu, ...outros]);
        setGruposLugares(lugares);
      }),
    [usuario],
  );
  const temMeu = grupos[0]?.meu === true;
  const outrosGrupos = temMeu ? grupos.slice(1) : grupos;
  useEffect(() => {
    void carregarStories();
  }, [carregarStories]);
  useEffect(() => {
    buscarFeed(usuario).then(setPubs);
    // Nova publicação ou story feitos pelo "+" do topo.
    const atualizar = () => {
      buscarFeed(usuario).then(setPubs);
      void carregarStories();
    };
    window.addEventListener("rovibes:publicou", atualizar);
    return () => window.removeEventListener("rovibes:publicou", atualizar);
  }, [usuario, carregarStories]);

  const dist = useCallback((l: Lugar) => (pos && l.latitude != null && l.longitude != null ? distanciaKm(pos, [l.latitude, l.longitude]) : null), [pos]);

  // Em alta: movimento agora, check-ins recentes, seguidores e nota — e, com a localização liberada, o que está perto pesa mais.
  const emAlta = useMemo(() => {
    const peso = (l: Lugar) => {
      const r = resumos.get(l.id);
      const mov = r?.movimento === "cheio" ? 6 : r?.movimento === "moderado" ? 3 : r?.movimento ? 1 : 0;
      const d = dist(l);
      return (r ? r.pessoas_2h * 4 + mov + r.seguidores * 0.5 + (r.nota ?? 0) * 0.8 : 0) + (d != null ? 8 / (1 + d) : 0);
    };
    return { peso, lista: [...lugares].sort((a, b) => peso(b) - peso(a)).slice(0, 12) };
  }, [lugares, resumos, dist]);

  // Em alta com stories: não vistos primeiro, depois pela força do lugar agora.
  const storiesEmAlta = useMemo(() => {
    const porId = new Map(lugares.map((l) => [l.id, l]));
    return [...gruposLugares].sort((a, b) => {
      if (a.vistos !== b.vistos) return Number(a.vistos) - Number(b.vistos);
      const la = porId.get(a.autor.id);
      const lb = porId.get(b.autor.id);
      return (lb ? emAlta.peso(lb) : 0) - (la ? emAlta.peso(la) : 0);
    });
  }, [gruposLugares, lugares, emAlta]);

  const seguir = async (estab: string) => {
    setPubs((l) => l?.map((x) => (x.estabelecimento.id === estab ? { ...x, sigo: true, motivo: null } : x)) ?? null);
    try {
      await seguirLugar(estab);
    } catch {
      setPubs((l) => l?.map((x) => (x.estabelecimento.id === estab ? { ...x, sigo: false } : x)) ?? null);
    }
  };

  const curtir = async (p: PublicacaoApp) => {
    setPubs((l) => l?.map((x) => (x.id === p.id ? { ...x, curti: !p.curti, curtidas: x.curtidas + (p.curti ? -1 : 1) } : x)) ?? null);
    const { error } = await alternarCurtida(p.id, usuario, p.curti, p.tipo === "pessoa");
    if (error) setPubs((l) => l?.map((x) => (x.id === p.id ? p : x)) ?? null);
  };

  return (
    <div className="pb-4">
      {/* Stories: o seu primeiro, depois de quem você segue */}
      <section aria-label="Stories">
        <ul className="flex gap-3.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          <li className="shrink-0">
            <div className="relative flex w-[70px] flex-col items-center gap-1.5">
              <button onClick={() => (temMeu ? setVisor({ lista: "pessoas", inicio: 0 }) : setMeuStory(true))} aria-label={temMeu ? "Ver seu story" : "Criar story"}>
                {temMeu ? (
                  <AnelStory visto={false}>
                    <Avatar nome={perfil?.nome || "?"} foto={perfil?.foto_url} tamanho="story" />
                  </AnelStory>
                ) : (
                  <span className="relative inline-flex rounded-full border-2 border-dashed border-borda p-[2px]">
                    <Avatar nome={perfil?.nome || "?"} foto={perfil?.foto_url} tamanho="story" />
                  </span>
                )}
              </button>
              <button
                onClick={() => setMeuStory(true)}
                className="absolute right-0.5 top-[44px] flex h-5 w-5 items-center justify-center rounded-full border-2 border-fundo bg-marca text-marca-texto"
                aria-label="Novo story"
              >
                <Plus className="h-3 w-3" />
              </button>
              <span className="w-full truncate text-center text-[12px]">Seu story</span>
            </div>
          </li>
          {outrosGrupos.map((gr, i) => (
            <li key={`${gr.tipo}-${gr.autor.id}`} className="shrink-0">
              <button onClick={() => setVisor({ lista: "pessoas", inicio: temMeu ? i + 1 : i })} className="flex w-[70px] flex-col items-center gap-1.5">
                <AnelStory visto={gr.vistos}>
                  {gr.tipo === "pessoa" && !gr.autor.logo_url ? (
                    <Avatar nome={gr.autor.nome} tamanho="story" />
                  ) : gr.autor.logo_url ? (
                    <img src={gr.autor.logo_url} alt="" className="h-[58px] w-[58px] rounded-full object-cover" />
                  ) : (
                    <span className="flex h-[58px] w-[58px] items-center justify-center rounded-full bg-elevado text-suave">
                      <Store className="h-5 w-5" />
                    </span>
                  )}
                </AnelStory>
                <span className="w-full truncate text-center text-[12px]">{gr.tipo === "pessoa" ? gr.autor.usuario : gr.autor.nome}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {carregando ? (
        <Carregando />
      ) : (
        <>
          {storiesEmAlta.length > 0 ? (
            <StoriesEmAlta
              grupos={storiesEmAlta}
              lugares={lugares}
              resumos={resumos}
              distancia={dist}
              abrir={(i) => setVisor({ lista: "lugares", inicio: i })}
              acao={
                !pos && (
                  <button onClick={() => void pedir()} className="inline-flex items-center gap-1 text-[12px] font-medium text-destaque">
                    <LocateFixed className="h-3.5 w-3.5" />
                    Perto de mim
                  </button>
                )
              }
            />
          ) : (
            <Carrossel
              titulo="Em alta"
              acao={
                !pos && (
                  <button onClick={() => void pedir()} className="inline-flex items-center gap-1 text-[12px] font-medium text-destaque">
                    <LocateFixed className="h-3.5 w-3.5" />
                    Perto de mim
                  </button>
                )
              }
              lugares={emAlta.lista}
              distancia={dist}
            />
          )}
        </>
      )}

      {/* Publicações */}
      <section className="mt-5">
        <h2 className="px-4 text-[17px] font-semibold">Publicações</h2>

        {pubs === null ? (
          <Carregando />
        ) : pubs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destaque-suave text-destaque">
              <Newspaper className="h-5 w-5" />
            </span>
            <p className="mt-3 text-sm text-suave">Nenhuma publicação ainda. Publique pelo + no topo ou siga lugares e pessoas.</p>
          </div>
        ) : (
          <ul className="space-y-4 px-4 pt-3">
            {pubs.map((p) => (
              <li key={p.id} className="cartao overflow-hidden">
                {p.tipo === "pessoa" && p.pessoa ? (
                  <div className="flex items-center gap-2.5 px-3.5 py-3">
                    <Link to={p.pessoa.id === usuario ? "/perfil" : `/p/${p.pessoa.usuario}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      <Avatar nome={p.pessoa.nome} foto={p.pessoa.foto_url} />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.pessoa.nome}</span>
                        <span className="block truncate text-[12px] text-suave">
                          {p.local ? (
                            <>
                              <MapPin className="mr-0.5 inline h-3 w-3" />
                              {p.local.nome} ·{" "}
                            </>
                          ) : null}
                          {tempoAtras(p.criado_em)}
                        </span>
                      </span>
                    </Link>
                  </div>
                ) : (
                <div className="flex items-center gap-2.5 px-3.5 py-3">
                    <Link to={`/lugar/${p.estabelecimento.id}`} className="flex min-w-0 flex-1 items-center gap-2.5">
                      {p.estabelecimento.logo_url ? (
                        <img src={p.estabelecimento.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                      ) : (
                        <Avatar nome={p.estabelecimento.nome} />
                      )}
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.estabelecimento.nome}</span>
                        <span className="block truncate text-[12px] text-suave">
                          {p.motivo && !p.sigo ? `${p.motivo} · ` : ""}
                          {tempoAtras(p.criado_em)}
                        </span>
                      </span>
                    </Link>
                    {p.sigo === false && (
                      <button onClick={() => void seguir(p.estabelecimento.id)} className="shrink-0 rounded-full bg-marca px-3.5 py-1.5 text-[13px] font-semibold text-marca-texto">
                        Seguir
                      </button>
                    )}
                  </div>
                )}
                {p.foto_url && <img src={p.foto_url} alt="" className="max-h-[520px] w-full object-cover" loading="lazy" />}
                <div className="space-y-2.5 px-3.5 py-3">
                  {p.texto && <p className="whitespace-pre-line text-[15px] leading-relaxed">{p.texto}</p>}
                  {p.evento && (
                    <Link to={`/evento/${p.evento.id}`} className="flex items-center gap-2.5 rounded-lg border border-borda px-3 py-2 hover:bg-elevado">
                      <CalendarDays className="h-4 w-4 shrink-0 text-destaque" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{p.evento.nome}</span>
                        <span className="block text-[12px] text-suave">{quando(p.evento.inicio)}</span>
                      </span>
                    </Link>
                  )}
                  <button onClick={() => void curtir(p)} aria-pressed={p.curti} className="-ml-1 inline-flex items-center gap-1.5 rounded-lg px-1 py-1 text-sm">
                    <Heart className={clsx("h-5 w-5", p.curti ? "fill-current text-magenta" : "text-suave")} />
                    <span className={p.curti ? "font-medium" : "text-suave"}>{p.curtidas}</span>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {visor !== null && (
        <VisorStories
          grupos={visor.lista === "pessoas" ? grupos : storiesEmAlta}
          inicio={visor.inicio}
          usuario={usuario}
          fechar={() => {
            setVisor(null);
            void carregarStories();
          }}
        />
      )}

      {meuStory && (
        <NovoStory
          lugares={lugares}
          fechar={() => setMeuStory(false)}
          publicado={() => {
            setMeuStory(false);
            void carregarStories();
          }}
        />
      )}
    </div>
  );
}

function Carrossel({ titulo, acao, lugares, distancia }: { titulo: string; acao?: ReactNode; lugares: Lugar[]; distancia: (l: Lugar) => number | null }) {
  if (!lugares.length) return null;
  return (
    <section className="mt-4">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-4">
        <Link to="/pesquisar" className="inline-flex items-center gap-1 text-[17px] font-semibold">
          {titulo}
          <ChevronRight className="h-4 w-4" />
        </Link>
        {acao}
      </div>
      <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {lugares.map((l) => {
          const d = distancia(l);
          const img = l.capa_url ?? l.logo_url;
          return (
            <li key={l.id} className="w-[128px] shrink-0">
              <Link to={`/lugar/${l.id}`} className="cartao block overflow-hidden">
                {img ? (
                  <img src={img} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex aspect-[4/3] w-full items-center justify-center bg-elevado text-suave">
                    <Store className="h-7 w-7" />
                  </span>
                )}
                <span className="block px-2.5 py-2">
                  <span className="block truncate text-[14px] font-semibold">{l.nome}</span>
                  <span className="block truncate text-[12px] text-suave">{l.categoria?.nome ?? l.bairro ?? ""}</span>
                  <span className="codigo mt-1 block text-[12px] text-suave">{d != null ? km(d) : l.bairro ?? " "}</span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const NOME_MOVIMENTO: Record<string, string> = { cheio: "Cheio", moderado: "Moderado", tranquilo: "Tranquilo" };

/** "Em alta": stories dos estabelecimentos em cards verticais; toque abre em tela cheia. */
function StoriesEmAlta({
  grupos,
  lugares,
  resumos,
  distancia,
  abrir,
  acao,
}: {
  grupos: GrupoStories[];
  lugares: Lugar[];
  resumos: ReturnType<typeof useResumos>["resumos"];
  distancia: (l: Lugar) => number | null;
  abrir: (i: number) => void;
  acao?: ReactNode;
}) {
  const porId = new Map(lugares.map((l) => [l.id, l]));
  return (
    <section className="mt-4" aria-label="Em alta">
      <div className="mb-2.5 flex items-center justify-between gap-2 px-4">
        <Link to="/pesquisar" className="inline-flex items-center gap-1 text-[17px] font-semibold">
          Em alta
          <ChevronRight className="h-4 w-4" />
        </Link>
        {acao}
      </div>
      <ul className="flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {grupos.map((g, i) => {
          const l = porId.get(g.autor.id);
          const d = l ? distancia(l) : null;
          const mov = resumos.get(g.autor.id)?.movimento;
          const capa = g.stories[g.stories.length - 1]?.foto_url;
          return (
            <li key={g.autor.id} className="shrink-0">
              <button
                onClick={() => abrir(i)}
                className={clsx("relative block h-[196px] w-[116px] overflow-hidden rounded-2xl bg-elevado text-left", !g.vistos && "ring-2 ring-magenta ring-offset-2 ring-offset-fundo")}
                aria-label={`Stories de ${g.autor.nome}`}
              >
                {capa && <img src={capa} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />}
                <span className="absolute inset-0 bg-gradient-to-b from-black/45 via-transparent to-black/75" />
                {g.autor.logo_url ? (
                  <img src={g.autor.logo_url} alt="" className="absolute left-2 top-2 h-9 w-9 rounded-full border-2 border-white object-cover" />
                ) : (
                  <span className="absolute left-2 top-2 flex h-9 w-9 items-center justify-center rounded-full border-2 border-white bg-elevado text-suave">
                    <Store className="h-4 w-4" />
                  </span>
                )}
                {mov && <span className="absolute right-2 top-2.5 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white backdrop-blur">{NOME_MOVIMENTO[mov] ?? mov}</span>}
                <span className="absolute inset-x-2 bottom-2 text-white">
                  <span className="block truncate text-[13px] font-semibold leading-tight">{g.autor.nome}</span>
                  <span className="block truncate text-[11px] opacity-85">{d != null ? km(d) : l?.bairro ?? ""}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
