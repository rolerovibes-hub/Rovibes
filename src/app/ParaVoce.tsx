import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bookmark, CalendarDays, EyeOff, MoreHorizontal, PartyPopper, Share2, Sparkles, Store, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { usePresencaAmigos } from "@/lib/agora";
import { registrarSinal } from "@/lib/sinais";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { km, Lugar, nomesVibes } from "./dados";
import { AmigosAqui } from "./AgoraLugar";

interface Recomendado {
  estabelecimento_id: string;
  pontos: number;
  motivos: string[];
  evento_id: string | null;
  evento_nome: string | null;
  evento_inicio: string | null;
  aberto: boolean;
  distancia_m: number | null;
}

const horaEvento = (iso: string) => {
  const d = new Date(iso);
  const h = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":00", "h").replace(":", "h");
  return d.getTime() < Date.now() ? "Rolando agora" : `Hoje, ${h}`;
};

/**
 * "Para você agora": lugares que combinam com a pessoa neste momento (gostos, amigos lá, evento hoje, aberto, perto).
 * Cada cartão tem uma ação principal (Marcar rolê) e ações discretas, sem sair do feed.
 */
export function ParaVoceAgora({ lugares, pos, usuario }: { lugares: Lugar[]; pos: [number, number] | null; usuario: string }) {
  const navegar = useNavigate();
  const [lista, setLista] = useState<Recomendado[] | null>(null);
  const [salvos, setSalvos] = useState<Set<string>>(new Set());
  const [menu, setMenu] = useState<string | null>(null);
  const [compartilhar, setCompartilhar] = useState<Lugar | null>(null);
  const [oculto, setOculto] = useState<{ id: string; nome: string } | null>(null);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    supabase.rpc("recomendados", { p_lat: pos?.[0] ?? null, p_lng: pos?.[1] ?? null, p_limite: 10 }).then(({ data, error }) => setLista(error ? null : ((data ?? []) as Recomendado[])));
  }, [pos]);
  useEffect(() => {
    supabase
      .from("salvos")
      .select("estabelecimento_id")
      .eq("usuario_id", usuario)
      .then(({ data }) => setSalvos(new Set(((data ?? []) as { estabelecimento_id: string }[]).map((x) => x.estabelecimento_id))));
  }, [usuario]);
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 3000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  const porId = useMemo(() => new Map(lugares.map((l) => [l.id, l])), [lugares]);
  const itens = (lista ?? []).filter((r) => porId.has(r.estabelecimento_id));
  const amigos = usePresencaAmigos(
    itens.map((r) => r.estabelecimento_id),
    usuario,
  );

  if (!itens.length) return null;

  const salvar = async (id: string) => {
    const tinha = salvos.has(id);
    setSalvos((s) => {
      const n = new Set(s);
      if (tinha) n.delete(id);
      else n.add(id);
      return n;
    });
    const { error } = tinha ? await supabase.from("salvos").delete().eq("usuario_id", usuario).eq("estabelecimento_id", id) : await supabase.from("salvos").insert({ estabelecimento_id: id });
    if (error) return setAviso("Não foi possível salvar agora.");
    if (!tinha) {
      registrarSinal(id, "salvou");
      setAviso("Salvo. Está no seu perfil, em Salvos.");
    }
  };

  const ocultar = (r: Recomendado, nome: string) => {
    setMenu(null);
    registrarSinal(r.estabelecimento_id, "ocultou");
    setLista((l) => l?.filter((x) => x.estabelecimento_id !== r.estabelecimento_id) ?? null);
    setOculto({ id: r.estabelecimento_id, nome });
  };

  return (
    <section className="mt-5" aria-label="Para você agora">
      <div className="mb-2.5 flex items-center gap-1.5 px-4">
        <Sparkles className="h-4 w-4 text-magenta" />
        <h2 className="text-[17px] font-semibold">Para você agora</h2>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {itens.map((r) => {
          const l = porId.get(r.estabelecimento_id)!;
          const titulo = r.evento_nome ? `${r.evento_nome} · ${l.nome}` : l.nome;
          const linha = [
            l.categoria?.nome,
            nomesVibes(l)[0],
            r.evento_inicio ? horaEvento(r.evento_inicio) : r.aberto ? "Aberto agora" : null,
            r.distancia_m != null ? km(r.distancia_m / 1000) : l.bairro,
          ].filter(Boolean);
          const img = l.capa_url ?? l.logo_url;
          return (
            <li key={r.estabelecimento_id} className="relative w-[280px] shrink-0 snap-start">
              <div className="cartao overflow-hidden">
                <Link to={`/lugar/${l.id}`} className="relative block">
                  {img ? (
                    <img src={img} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
                  ) : (
                    <span className="flex aspect-[16/10] w-full items-center justify-center bg-elevado text-suave">
                      <Store className="h-7 w-7" />
                    </span>
                  )}
                  {r.evento_nome && (
                    <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-semibold text-white backdrop-blur">
                      <CalendarDays className="h-3 w-3" />
                      Evento hoje
                    </span>
                  )}
                </Link>
                <div className="space-y-2 p-3">
                  <Link to={`/lugar/${l.id}`} className="block">
                    <span className="block truncate font-semibold">{titulo}</span>
                    <span className="block truncate text-[13px] text-suave">{linha.join(" · ")}</span>
                  </Link>
                  {r.motivos[0] && (
                    <p className="flex items-center gap-1 truncate text-[12px] font-medium text-destaque">
                      <Sparkles className="h-3 w-3 shrink-0" />
                      {r.motivos.slice(0, 2).join(" · ")}
                    </p>
                  )}
                  <AmigosAqui amigos={amigos.get(l.id)} compacto />
                  <div className="flex items-center gap-1 pt-0.5">
                    <button onClick={() => navegar(`/lugar/${l.id}/role`)} className="botao-principal h-9 flex-1 rounded-full text-[13px]">
                      <PartyPopper className="h-4 w-4" />
                      Marcar rolê
                    </button>
                    <button onClick={() => void salvar(l.id)} aria-pressed={salvos.has(l.id)} className="rounded-full p-2 text-suave hover:bg-elevado" aria-label={salvos.has(l.id) ? "Tirar dos salvos" : "Salvar"}>
                      <Bookmark className={clsx("h-5 w-5", salvos.has(l.id) && "fill-current text-destaque")} />
                    </button>
                    <button onClick={() => setCompartilhar(l)} className="rounded-full p-2 text-suave hover:bg-elevado" aria-label="Compartilhar">
                      <Share2 className="h-5 w-5" />
                    </button>
                    <button onClick={() => setMenu(menu === l.id ? null : l.id)} className="rounded-full p-2 text-suave hover:bg-elevado" aria-label="Mais opções" aria-expanded={menu === l.id}>
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </div>
                </div>
              </div>
              {menu === l.id && (
                <div className="absolute bottom-14 right-2 z-20 w-56 overflow-hidden rounded-lg border border-borda bg-superficie py-1 text-sm shadow-lg">
                  <Link to={`/lugar/${l.id}`} className="flex items-center gap-2 px-3 py-2.5 hover:bg-elevado">
                    <Store className="h-4 w-4" />
                    Ver estabelecimento
                  </Link>
                  <button onClick={() => ocultar(r, l.nome)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-elevado">
                    <EyeOff className="h-4 w-4" />
                    Não mostrar este lugar
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {oculto && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto flex max-w-sm items-center gap-3 rounded-xl bg-texto px-4 py-3 text-sm text-fundo shadow-lg">
          <span className="min-w-0 flex-1">Não vamos sugerir {oculto.nome} por 30 dias.</span>
          <button
            className="font-semibold underline"
            onClick={() => {
              void supabase.rpc("desfazer_ocultar", { p_estab: oculto.id });
              setOculto(null);
              supabase.rpc("recomendados", { p_lat: pos?.[0] ?? null, p_lng: pos?.[1] ?? null, p_limite: 10 }).then(({ data }) => data && setLista(data as Recomendado[]));
            }}
          >
            Desfazer
          </button>
          <button onClick={() => setOculto(null)} aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}
      {aviso && !oculto && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-xl bg-texto px-4 py-3 text-center text-sm text-fundo shadow-lg">
          {aviso}
        </div>
      )}
      {compartilhar && (
        <CompartilharNoChat
          tipo="lugar"
          id={compartilhar.id}
          titulo={compartilhar.nome}
          fechar={() => setCompartilhar(null)}
          enviado={(t) => {
            registrarSinal(compartilhar.id, "compartilhou");
            setAviso(t);
          }}
        />
      )}
    </section>
  );
}
