import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarPlus, Rocket } from "lucide-react";
import { reais } from "@/components/Formulario";
import { Avatar } from "@/components/Avatar";
import { dataEvento, EventoParaMim, eventosParaMim, NOME_TIPO } from "@/lib/eventosPessoa";
import { supabase } from "@/lib/supabase";

/** Feed: eventos de amigos, convites e eventos impulsionados perto. */
export function EventosDaGalera({ pos }: { pos: [number, number] | null }) {
  const [lista, setLista] = useState<EventoParaMim[]>([]);
  useEffect(() => {
    eventosParaMim(pos).then(setLista);
  }, [pos]);
  if (!lista.length) return null;
  return (
    <section className="mt-5" aria-label="Eventos da galera">
      <div className="mb-2.5 flex items-center justify-between px-4">
        <h2 className="text-[17px] font-semibold">Rolês da galera</h2>
        <Link to="/eventos/novo" className="inline-flex items-center gap-1 text-[13px] font-semibold text-destaque">
          <CalendarPlus className="h-4 w-4" />
          Criar o seu
        </Link>
      </div>
      <ul className="flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {lista.map((e) => (
          <li key={e.id} className="w-[240px] shrink-0 snap-start">
            <Link to={`/evento-pessoa/${e.id}`} className="cartao block overflow-hidden hover:bg-elevado">
              <span className="relative block">
                {e.capa_url ? (
                  <img src={e.capa_url} alt="" className="aspect-[16/10] w-full object-cover" loading="lazy" />
                ) : (
                  <span className="flex aspect-[16/10] w-full items-center justify-center bg-gradient-to-br from-[#6D28D9] to-[#DB2777] text-4xl">{NOME_TIPO[e.tipo]?.emoji}</span>
                )}
                {e.impulsionado && (
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/55 px-2 py-0.5 text-[10px] font-semibold text-white">
                    <Rocket className="h-3 w-3" />
                    Impulsionado
                  </span>
                )}
              </span>
              <span className="block space-y-1 p-3">
                <span className="block truncate font-semibold">{e.titulo}</span>
                <span className="block truncate text-[12px] text-suave">
                  {dataEvento(e.inicio)}
                  {e.bairro ? ` · ${e.bairro}` : ""}
                </span>
                <span className="flex items-center gap-1.5 text-[12px]">
                  <Avatar nome={e.anfitriao.nome} foto={e.anfitriao.foto_url} tamanho="sm" />
                  <span className="min-w-0 flex-1 truncate text-suave">{e.motivo}</span>
                  <span className="codigo shrink-0 font-semibold text-destaque">{e.menor_preco ? `a partir de ${reais(e.menor_preco)}` : "grátis"}</span>
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Carteira: ingressos de eventos de anfitriões. */
export function IngressosDeAnfitrioes() {
  const [lista, setLista] = useState<{ id: string; codigo: string; situacao: string; cota: string | null; evento: { id: string; titulo: string; inicio: string } }[]>([]);
  useEffect(() => {
    supabase.rpc("meus_ingressos_anfitriao").then(({ data }) => setLista((data ?? []) as typeof lista));
  }, []);
  const validos = lista.filter((i) => i.situacao !== "cancelado");
  if (!validos.length) return null;
  return (
    <section className="px-4 pt-5">
      <h2 className="rotulo mb-2">Eventos de amigos</h2>
      <ul className="space-y-2">
        {validos.map((i) => (
          <li key={i.id}>
            <Link to={`/evento-pessoa/${i.evento.id}`} className="cartao flex items-center gap-3 px-4 py-3 hover:bg-elevado">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.evento.titulo}</span>
                <span className="block text-[12px] text-suave">
                  {dataEvento(i.evento.inicio)} · {i.cota ?? "Ingresso"} {i.situacao === "usado" ? "· usado" : ""}
                </span>
              </span>
              <span className="text-[13px] font-semibold text-destaque">Ver QR</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
