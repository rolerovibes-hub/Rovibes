import { ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, ChevronRight, Heart, LocateFixed, Newspaper, Plus, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { Avatar } from "@/components/Avatar";
import { useSessao } from "@/lib/sessao";
import { distanciaKm, km, Lugar, pedirLocalizacao, quando, useVitrine } from "./dados";
import { useResumos } from "./presenca";
import { alternarCurtida, buscarPublicacoes, buscarStories, buscarStoriesPessoas, GrupoStories, PublicacaoApp, tempoAtras } from "./conteudo";
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
  const [modo, setModo] = useState<"seguindo" | "todos">("seguindo");
  const [grupos, setGrupos] = useState<GrupoStories[]>([]);
  const [pubs, setPubs] = useState<PublicacaoApp[] | null>(null);
  const [visor, setVisor] = useState<number | null>(null);
  const [meuStory, setMeuStory] = useState(false);

  const carregarStories = useCallback(
    () =>
      Promise.all([buscarStoriesPessoas(usuario), buscarStories(usuario)]).then(([pessoas, lugares]) => {
        const meu = pessoas.filter((x) => x.meu);
        const outros = [...pessoas.filter((x) => !x.meu), ...lugares].sort((a, b) => Number(a.vistos) - Number(b.vistos));
        setGrupos([...meu, ...outros]);
      }),
    [usuario],
  );
  const temMeu = grupos[0]?.meu === true;
  const outrosGrupos = temMeu ? grupos.slice(1) : grupos;
  useEffect(() => {
    void carregarStories();
  }, [carregarStories]);
  useEffect(() => {
    setPubs(null);
    buscarPublicacoes(usuario, modo).then(setPubs);
  }, [usuario, modo]);

  const dist = useCallback((l: Lugar) => (pos && l.latitude != null && l.longitude != null ? distanciaKm(pos, [l.latitude, l.longitude]) : null), [pos]);

  const perto = useMemo(() => {
    const lista = [...lugares];
    if (pos) lista.sort((a, b) => (dist(a) ?? 1e9) - (dist(b) ?? 1e9));
    else lista.sort((a, b) => (resumos.get(b.id)?.nota ?? 0) - (resumos.get(a.id)?.nota ?? 0));
    return lista.slice(0, 10);
  }, [lugares, pos, dist, resumos]);

  // Em alta: movimento agora, check-ins recentes, seguidores e nota.
  const emAlta = useMemo(() => {
    const peso = (l: Lugar) => {
      const r = resumos.get(l.id);
      if (!r) return 0;
      const mov = r.movimento === "cheio" ? 6 : r.movimento === "moderado" ? 3 : r.movimento ? 1 : 0;
      return r.pessoas_2h * 4 + mov + r.seguidores * 0.5 + (r.nota ?? 0) * 0.8;
    };
    return [...lugares].filter((l) => peso(l) > 0).sort((a, b) => peso(b) - peso(a)).slice(0, 10);
  }, [lugares, resumos]);

  const curtir = async (p: PublicacaoApp) => {
    setPubs((l) => l?.map((x) => (x.id === p.id ? { ...x, curti: !p.curti, curtidas: x.curtidas + (p.curti ? -1 : 1) } : x)) ?? null);
    const { error } = await alternarCurtida(p.id, usuario, p.curti);
    if (error) setPubs((l) => l?.map((x) => (x.id === p.id ? p : x)) ?? null);
  };

  return (
    <div className="pb-4">
      {/* Stories: o seu primeiro, depois de quem você segue */}
      <section aria-label="Stories">
        <ul className="flex gap-3.5 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
          <li className="shrink-0">
            <div className="relative flex w-[70px] flex-col items-center gap-1.5">
              <button onClick={() => (temMeu ? setVisor(0) : setMeuStory(true))} aria-label={temMeu ? "Ver seu story" : "Criar story"}>
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
              <button onClick={() => setVisor(temMeu ? i + 1 : i)} className="flex w-[70px] flex-col items-center gap-1.5">
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
          <Carrossel
            titulo="Destaques perto de você"
            acao={
              !pos && (
                <button onClick={() => void pedir()} className="inline-flex items-center gap-1 text-[12px] font-medium text-destaque">
                  <LocateFixed className="h-3.5 w-3.5" />
                  Usar minha localização
                </button>
              )
            }
            lugares={perto}
            distancia={dist}
          />
          {emAlta.length > 0 && <Carrossel titulo="Em alta" lugares={emAlta} distancia={dist} />}
        </>
      )}

      {/* Publicações */}
      <section className="mt-6">
        <div className="flex items-center justify-between px-4">
          <h2 className="text-[17px] font-semibold">Publicações</h2>
          <div className="flex gap-1 rounded-full border border-borda bg-superficie p-0.5" role="tablist" aria-label="O que mostrar">
            {(["seguindo", "todos"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={modo === m}
                onClick={() => setModo(m)}
                className={clsx("rounded-full px-3 py-1 text-[13px]", modo === m ? "bg-marca font-medium text-marca-texto" : "text-suave")}
              >
                {m === "seguindo" ? "Seguindo" : "Todos"}
              </button>
            ))}
          </div>
        </div>

        {pubs === null ? (
          <Carregando />
        ) : pubs.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destaque-suave text-destaque">
              <Newspaper className="h-5 w-5" />
            </span>
            {modo === "seguindo" ? (
              <>
                <p className="mt-3 font-semibold">Siga lugares para ver as novidades aqui</p>
                <button onClick={() => setModo("todos")} className="botao mt-4">
                  Ver todos os lugares
                </button>
              </>
            ) : (
              <p className="mt-3 text-sm text-suave">Nenhuma publicação ainda.</p>
            )}
          </div>
        ) : (
          <ul className="space-y-4 px-4 pt-3">
            {pubs.map((p) => (
              <li key={p.id} className="cartao overflow-hidden">
                <Link to={`/lugar/${p.estabelecimento.id}`} className="flex items-center gap-2.5 px-3.5 py-3">
                  {p.estabelecimento.logo_url ? (
                    <img src={p.estabelecimento.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                  ) : (
                    <Avatar nome={p.estabelecimento.nome} />
                  )}
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{p.estabelecimento.nome}</span>
                  <span className="text-[12px] text-suave">{tempoAtras(p.criado_em)}</span>
                </Link>
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
          grupos={grupos}
          inicio={visor}
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
            <li key={l.id} className="w-[150px] shrink-0">
              <Link to={`/lugar/${l.id}`} className="cartao block overflow-hidden">
                {img ? (
                  <img src={img} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex aspect-square w-full items-center justify-center bg-elevado text-suave">
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
