import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import L from "leaflet";
import { Marker } from "react-leaflet";
import { CalendarClock, LocateFixed, MapPin, Navigation, PartyPopper, Radio, X } from "lucide-react";
import { MapaBase, PinMapa } from "@/components/MapaBase";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { DadosConversa, MembroConversa, quandoRole } from "@/lib/chat";
import { pedirLocalizacao } from "./dados";
import { tempoAtras } from "./conteudo";
import { Navegacao } from "./Navegacao";

interface Local {
  usuario_id: string;
  nome: string;
  foto_url: string | null;
  latitude: number;
  longitude: number;
  atualizado_em: string;
  ate: string | null;
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const iconePessoa = (nome: string, foto: string | null) =>
  L.divIcon({
    className: "",
    html: foto
      ? `<img src="${esc(foto)}" alt="" style="width:36px;height:36px;border-radius:9999px;border:3px solid white;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,.35)" />`
      : `<span style="display:flex;width:36px;height:36px;border-radius:9999px;border:3px solid white;background:#7C3AED;color:white;font:600 14px sans-serif;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc((nome[0] ?? "?").toUpperCase())}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

/** Topo do grupo do rolê: lugar fixado, "Bora!", como chegar e localização compartilhada. */
export function PainelRole({ dados, membros, eu, aoMudar }: { dados: DadosConversa; membros: MembroConversa[]; eu: string; aoMudar: () => void }) {
  const [locais, setLocais] = useState<Local[]>([]);
  const [verMapa, setVerMapa] = useState(false);
  const [escolhendo, setEscolhendo] = useState(false);
  const [navegando, setNavegando] = useState(false);
  const [erro, setErro] = useState("");
  const ativos = membros.filter((m) => m.situacao === "ativo");
  const eu_ = membros.find((m) => m.id === eu);
  const vao = ativos.filter((m) => m.bora);
  const meu = locais.find((l) => l.usuario_id === eu);
  const ultimoEnvio = useRef(0);

  const carregarLocais = useCallback(() => {
    supabase.rpc("locais_do_role", { p_conversa: dados.id }).then(({ data }) => setLocais((data ?? []) as Local[]));
  }, [dados.id]);

  useEffect(() => {
    carregarLocais();
    const canal = supabase
      .channel(`locais-${dados.id}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "localizacoes_role", filter: `conversa_id=eq.${dados.id}` }, () => carregarLocais())
      .subscribe();
    const t = window.setInterval(carregarLocais, 30000);
    return () => {
      window.clearInterval(t);
      void supabase.removeChannel(canal);
    };
  }, [dados.id, carregarLocais]);

  // Enquanto compartilha e a conversa está aberta, atualiza a posição (no máximo a cada 20 s).
  useEffect(() => {
    if (!meu || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - ultimoEnvio.current < 20000) return;
        ultimoEnvio.current = Date.now();
        void supabase.rpc("atualizar_local", { p_conversa: dados.id, p_lat: p.coords.latitude, p_lng: p.coords.longitude });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!meu, dados.id]);

  const bora = async () => {
    setErro("");
    const { error } = await supabase.rpc("bora", { p_conversa: dados.id, p_vou: !eu_?.bora });
    if (error) setErro(mensagemDeErro(error));
    aoMudar();
  };

  const compartilhar = async (minutos: number | null) => {
    setEscolhendo(false);
    setErro("");
    try {
      const [lat, lng] = await pedirLocalizacao();
      const { error } = await supabase.rpc("compartilhar_local", { p_conversa: dados.id, p_lat: lat, p_lng: lng, p_minutos: minutos });
      if (error) throw error;
      ultimoEnvio.current = Date.now();
      carregarLocais();
      setVerMapa(true);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const parar = async () => {
    await supabase.rpc("parar_local", { p_conversa: dados.id });
    carregarLocais();
  };

  const ponto: [number, number] | null = dados.local_lat != null && dados.local_lng != null ? [dados.local_lat, dados.local_lng] : null;
  const centro: [number, number] | undefined = ponto ?? (locais[0] ? [locais[0].latitude, locais[0].longitude] : undefined);
  const ativo = eu_?.situacao === "ativo";

  return (
    <div className="border-b border-borda bg-superficie px-3 py-2.5">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-magenta/15 text-magenta">
          <MapPin className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          {dados.local_id ? (
            <Link to={`/lugar/${dados.local_id}`} className="block truncate text-sm font-semibold hover:underline">
              {dados.local_nome}
            </Link>
          ) : (
            <p className="truncate text-sm font-semibold">Lugar a definir</p>
          )}
          <p className="flex items-center gap-1 truncate text-[12px] text-suave">
            {dados.quando && (
              <>
                <CalendarClock className="h-3.5 w-3.5" />
                <span className="capitalize">{quandoRole(dados.quando)}</span> ·
              </>
            )}
            {vao.length} de {ativos.length} {vao.length === 1 ? "topou" : "toparam"}
          </p>
        </div>
        {ativo && (
          <button
            onClick={() => void bora()}
            aria-pressed={!!eu_?.bora}
            className={clsx(
              "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-bold",
              eu_?.bora ? "bg-magenta text-white" : "border border-magenta text-magenta",
            )}
          >
            <PartyPopper className="h-4 w-4" />
            {eu_?.bora ? "Tô dentro!" : "Bora!"}
          </button>
        )}
      </div>

      {ativo && (
        <div className="mt-2 flex gap-2 overflow-x-auto [scrollbar-width:none]">
          {ponto && (
            <button className="botao h-8 shrink-0 px-3 text-[13px]" onClick={() => setNavegando(true)}>
              <Navigation className="h-3.5 w-3.5" />
              Como chegar
            </button>
          )}
          {meu ? (
            <button className="botao h-8 shrink-0 border-ok px-3 text-[13px] text-ok" onClick={() => void parar()}>
              <Radio className="h-3.5 w-3.5" />
              Parar localização{meu.ate ? ` (até ${new Date(meu.ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}
            </button>
          ) : (
            <button className="botao h-8 shrink-0 px-3 text-[13px]" onClick={() => setEscolhendo(true)}>
              <LocateFixed className="h-3.5 w-3.5" />
              Compartilhar localização
            </button>
          )}
          {(locais.length > 0 || ponto) && (
            <button className={clsx("botao h-8 shrink-0 px-3 text-[13px]", verMapa && "border-marca text-destaque")} onClick={() => setVerMapa((v) => !v)}>
              <MapPin className="h-3.5 w-3.5" />
              {verMapa ? "Fechar mapa" : `Mapa${locais.length ? ` (${locais.length})` : ""}`}
            </button>
          )}
        </div>
      )}
      {erro && <p className="mt-1.5 text-[13px] text-perigo">{erro}</p>}

      {verMapa && centro && (
        <div className="mt-2 overflow-hidden rounded-xl border border-borda">
          <MapaBase centro={centro} zoom={14} className="h-56 w-full">
            {ponto && <PinMapa posicao={ponto} tamanho="grande" titulo={dados.local_nome ?? undefined} />}
            {locais.map((l) => (
              <Marker key={l.usuario_id} position={[l.latitude, l.longitude]} icon={iconePessoa(l.nome, l.foto_url)} title={`${l.nome} · ${tempoAtras(l.atualizado_em)}`} />
            ))}
          </MapaBase>
          {locais.length > 0 && (
            <ul className="divide-y divide-borda text-[13px]">
              {locais.map((l) => (
                <li key={l.usuario_id} className="flex justify-between px-3 py-1.5">
                  <span className="font-medium">{l.usuario_id === eu ? "Você" : l.nome.split(" ")[0]}</span>
                  <span className="text-suave">atualizado {tempoAtras(l.atualizado_em) === "agora" ? "agora" : `há ${tempoAtras(l.atualizado_em)}`}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {escolhendo && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" onClick={() => setEscolhendo(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Compartilhar localização</h2>
              <button onClick={() => setEscolhendo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-suave">Só quem está neste rolê vê. A posição é atualizada enquanto esta conversa estiver aberta no seu celular.</p>
            <div className="mt-4 grid gap-2">
              <button className="botao h-11" onClick={() => void compartilhar(30)}>
                Por 30 minutos
              </button>
              <button className="botao h-11" onClick={() => void compartilhar(60)}>
                Por 1 hora
              </button>
              <button className="botao h-11" onClick={() => void compartilhar(null)}>
                Até eu desligar
              </button>
            </div>
          </div>
        </div>
      )}
      {navegando && ponto && <Navegacao destino={{ nome: dados.local_nome ?? "Rolê", lat: ponto[0], lng: ponto[1] }} fechar={() => setNavegando(false)} />}
    </div>
  );
}
