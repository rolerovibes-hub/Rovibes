import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Heart, Newspaper, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { quando } from "./dados";
import { alternarCurtida, buscarPublicacoes, buscarStories, GrupoStories, PublicacaoApp, tempoAtras } from "./conteudo";
import { AnelStory, VisorStories } from "./VisorStories";

export function Feed() {
  const { sessao } = useSessao();
  const usuario = sessao!.user.id;
  const [modo, setModo] = useState<"seguindo" | "todos">("seguindo");
  const [grupos, setGrupos] = useState<GrupoStories[]>([]);
  const [pubs, setPubs] = useState<PublicacaoApp[] | null>(null);
  const [visor, setVisor] = useState<number | null>(null);

  const carregarStories = useCallback(() => buscarStories(usuario).then(setGrupos), [usuario]);

  useEffect(() => {
    void carregarStories();
  }, [carregarStories]);

  useEffect(() => {
    setPubs(null);
    buscarPublicacoes(usuario, modo).then(setPubs);
  }, [usuario, modo]);

  const curtir = async (p: PublicacaoApp) => {
    setPubs((l) => l?.map((x) => (x.id === p.id ? { ...x, curti: !p.curti, curtidas: x.curtidas + (p.curti ? -1 : 1) } : x)) ?? null);
    const { error } = await alternarCurtida(p.id, usuario, p.curti);
    if (error) setPubs((l) => l?.map((x) => (x.id === p.id ? p : x)) ?? null);
  };

  return (
    <div className="pb-4">
      {grupos.length > 0 && (
        <section aria-label="Stories" className="border-b border-borda">
          <ul className="flex gap-4 overflow-x-auto px-4 py-3 [scrollbar-width:none]">
            {grupos.map((gr, i) => (
              <li key={gr.autor.id} className="shrink-0">
                <button onClick={() => setVisor(i)} className="flex w-[68px] flex-col items-center gap-1.5">
                  <AnelStory visto={gr.vistos}>
                    {gr.autor.logo_url ? (
                      <img src={gr.autor.logo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
                    ) : (
                      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-elevado text-suave">
                        <Store className="h-5 w-5" />
                      </span>
                    )}
                  </AnelStory>
                  <span className="w-full truncate text-center text-[12px]">{gr.autor.nome}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="flex gap-2 px-4 pt-4" role="tablist" aria-label="O que mostrar">
        {(["seguindo", "todos"] as const).map((m) => (
          <button
            key={m}
            role="tab"
            aria-selected={modo === m}
            onClick={() => setModo(m)}
            className={clsx(
              "rounded-full border px-4 py-1.5 text-sm",
              modo === m ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie hover:bg-elevado",
            )}
          >
            {m === "seguindo" ? "Seguindo" : "Todos os lugares"}
          </button>
        ))}
      </div>

      {pubs === null ? (
        <Carregando />
      ) : pubs.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
            <Newspaper className="h-6 w-6" />
          </span>
          {modo === "seguindo" ? (
            <>
              <p className="mt-4 font-semibold">Siga lugares para ver as novidades aqui</p>
              <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Toque em Seguir na página de um lugar, ou veja o que todos estão publicando.</p>
              <button onClick={() => setModo("todos")} className="botao mt-5">
                Ver todos os lugares
              </button>
            </>
          ) : (
            <p className="mt-4 text-sm text-suave">Nenhuma publicação ainda.</p>
          )}
        </div>
      ) : (
        <ul className="space-y-4 px-4 pt-4">
          {pubs.map((p) => (
            <li key={p.id} className="cartao overflow-hidden">
              <Link to={`/lugar/${p.estabelecimento.id}`} className="flex items-center gap-2.5 px-3.5 py-3">
                {p.estabelecimento.logo_url ? (
                  <img src={p.estabelecimento.logo_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                ) : (
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-elevado text-suave">
                    <Store className="h-4 w-4" />
                  </span>
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
    </div>
  );
}
