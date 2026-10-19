import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, ClipboardList, Store } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { listaPublica } from "@/lib/promoters";

interface Info {
  titulo: string;
  sub: string;
  imagem: string | null;
  extra: string | null;
}

const cache = new Map<string, Info | null>();
const dataEvento = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Cartão de evento ou lista de presença compartilhado no chat (abre direto, com o código do promoter). */
export function CartaoDivulgacao({ tipo, id, codigo, minha = false }: { tipo: "evento" | "lista"; id: string; codigo?: string | null; minha?: boolean }) {
  const chave = `${tipo}:${id}`;
  const [info, setInfo] = useState<Info | null | undefined>(cache.get(chave));

  useEffect(() => {
    if (cache.has(chave)) return setInfo(cache.get(chave));
    let vivo = true;
    (async () => {
      let r: Info | null = null;
      if (tipo === "evento") {
        const { data } = await supabase.from("eventos").select("nome, inicio, capa_url, estabelecimento:estabelecimentos(nome, logo_url)").eq("id", id).maybeSingle();
        const e = data as unknown as { nome: string; inicio: string; capa_url: string | null; estabelecimento: { nome: string; logo_url: string | null } | null } | null;
        if (e) r = { titulo: e.nome, sub: e.estabelecimento?.nome ?? "", imagem: e.capa_url ?? e.estabelecimento?.logo_url ?? null, extra: dataEvento(e.inicio) };
      } else {
        const l = await listaPublica(id).catch(() => null);
        if (l)
          r = {
            titulo: l.nome,
            sub: [l.evento?.nome, l.estab.nome].filter(Boolean).join(" · "),
            imagem: l.evento?.capa_url ?? l.estab.logo_url,
            extra: l.beneficio ?? (l.aberta ? "Lista aberta" : "Lista encerrada"),
          };
      }
      cache.set(chave, r);
      if (vivo) setInfo(r);
    })();
    return () => {
      vivo = false;
    };
  }, [chave, tipo, id]);

  const destino = `/${tipo}/${id}${codigo ? `?ref=${codigo}` : ""}`;
  return (
    <Link to={destino} className={clsx("block w-64 overflow-hidden rounded-2xl border text-left", minha ? "border-white/25 bg-white/10" : "border-borda bg-superficie")}>
      {info?.imagem ? (
        <img src={info.imagem} alt="" className="h-28 w-full object-cover" loading="lazy" />
      ) : (
        <span className={clsx("flex h-20 w-full items-center justify-center", minha ? "bg-white/10" : "bg-elevado text-suave")}>
          {tipo === "evento" ? <CalendarDays className="h-6 w-6" /> : <ClipboardList className="h-6 w-6" />}
        </span>
      )}
      <span className="block px-3 py-2.5">
        <span className={clsx("block text-[11px] font-semibold uppercase tracking-wide", minha ? "opacity-80" : "text-destaque")}>{tipo === "evento" ? "Evento" : "Lista de presença"}</span>
        <span className="block truncate font-semibold">{info === undefined ? "Carregando..." : info?.titulo ?? "Não disponível"}</span>
        {info && (
          <span className={clsx("flex items-center gap-1 truncate text-[12px]", minha ? "opacity-80" : "text-suave")}>
            <Store className="h-3 w-3 shrink-0" />
            {info.sub}
          </span>
        )}
        {info?.extra && <span className={clsx("mt-0.5 block truncate text-[12px] font-medium capitalize", minha ? "" : "text-destaque")}>{info.extra}</span>}
      </span>
    </Link>
  );
}
