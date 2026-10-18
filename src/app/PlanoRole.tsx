import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import L from "leaflet";
import { Marker } from "react-leaflet";
import { CalendarClock, ChevronRight, LocateFixed, MapPin, Navigation, Radio, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { EscolherLugar } from "@/components/EscolherLugar";
import { MapaBase, PinMapa } from "@/components/MapaBase";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_RESPOSTA, Plano, quandoPlano, RespostaPlano, rpcPlano } from "@/lib/chat";
import { pedirLocalizacao, useVitrine } from "./dados";
import { tempoAtras } from "./conteudo";
import { Navegacao } from "./Navegacao";

export interface LocalPessoa {
  usuario_id: string;
  nome: string;
  foto_url: string | null;
  latitude: number;
  longitude: number;
  atualizado_em: string;
  ate: string | null;
}

/** Localização compartilhada na conversa (só existe enquanto há plano). Atualiza a sua posição enquanto a conversa está aberta. */
export function useLocalizacao(conversa: string, eu: string, ativo: boolean) {
  const [locais, setLocais] = useState<LocalPessoa[]>([]);
  const ultimoEnvio = useRef(0);
  const carregar = useCallback(() => {
    supabase.rpc("locais_do_role", { p_conversa: conversa }).then(({ data }) => setLocais((data ?? []) as LocalPessoa[]));
  }, [conversa]);

  useEffect(() => {
    if (!ativo) return;
    carregar();
    const canal = supabase
      .channel(`locais-${conversa}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "localizacoes_role", filter: `conversa_id=eq.${conversa}` }, () => carregar())
      .subscribe();
    const t = window.setInterval(carregar, 30000);
    return () => {
      window.clearInterval(t);
      void supabase.removeChannel(canal);
    };
  }, [conversa, ativo, carregar]);

  const meu = locais.find((l) => l.usuario_id === eu) ?? null;
  useEffect(() => {
    if (!meu || !navigator.geolocation) return;
    const id = navigator.geolocation.watchPosition(
      (p) => {
        if (Date.now() - ultimoEnvio.current < 20000) return;
        ultimoEnvio.current = Date.now();
        void supabase.rpc("atualizar_local", { p_conversa: conversa, p_lat: p.coords.latitude, p_lng: p.coords.longitude });
      },
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 15000 },
    );
    return () => navigator.geolocation.clearWatch(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!meu, conversa]);

  const compartilhar = async (minutos: number | null) => {
    const [lat, lng] = await pedirLocalizacao();
    await rpcPlano("compartilhar_local", { p_conversa: conversa, p_lat: lat, p_lng: lng, p_minutos: minutos });
    ultimoEnvio.current = Date.now();
    carregar();
  };
  const parar = async () => {
    await supabase.rpc("parar_local", { p_conversa: conversa });
    carregar();
  };
  return { locais, meu, compartilhar, parar };
}

const esc = (t: string) => t.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const iconePessoa = (nome: string, foto: string | null) =>
  L.divIcon({
    className: "",
    html: foto
      ? `<img src="${esc(foto)}" alt="" style="width:36px;height:36px;border-radius:9999px;border:3px solid white;object-fit:cover;box-shadow:0 2px 6px rgba(0,0,0,.35)" />`
      : `<span style="display:flex;width:36px;height:36px;border-radius:9999px;border:3px solid white;background:#6D28D9;color:white;font:600 14px sans-serif;align-items:center;justify-content:center;box-shadow:0 2px 6px rgba(0,0,0,.35)">${esc((nome[0] ?? "?").toUpperCase())}</span>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const ROTULO = { aberto: "Ideia de rolê", confirmado: "Plano confirmado", cancelado: "Plano cancelado" } as const;

/** Faixa fixada no topo da conversa com o plano em andamento. */
export function PlanoFixado({ plano, compartilhando, abrir }: { plano: Plano; compartilhando: boolean; abrir: () => void }) {
  return (
    <button onClick={abrir} className="flex w-full items-center gap-3 bg-superficie px-3 py-2 text-left transition-colors hover:bg-elevado">
      {plano.local_foto ? (
        <img src={plano.local_foto} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
          <MapPin className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide">
          <span className={plano.situacao === "confirmado" ? "text-ok" : "text-destaque"}>{ROTULO[plano.situacao]}</span>
          {compartilhando && (
            <span className="inline-flex items-center gap-0.5 font-semibold normal-case tracking-normal text-ok">
              <Radio className="h-3 w-3" aria-hidden /> localização ligada
            </span>
          )}
        </span>
        <span className="block truncate text-sm font-semibold">
          {plano.local_nome ?? "Lugar a definir"} <span className="font-normal text-suave">· {quandoPlano(plano.quando)}</span>
        </span>
      </span>
      <span className="shrink-0 text-right text-[12px] text-suave">
        {plano.vao} {plano.vao === 1 ? "vai" : "vão"}
        {plano.minha && <span className="block font-semibold text-destaque">{plano.minha === "vou" ? "Você vai" : plano.minha === "interesse" ? "Interesse" : "Você não vai"}</span>}
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
    </button>
  );
}

const paraCampo = (iso: string | null) => {
  const d = iso ? new Date(iso) : new Date(Date.now() + 3600000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(Math.floor(d.getMinutes() / 15) * 15)}`;
};

/** O plano completo: lugar, dia e horário, quem vai, respostas e ações. */
export function FolhaPlano({
  plano,
  eu,
  localizacao,
  fechar,
  aoMudar,
}: {
  plano: Plano;
  eu: string;
  localizacao: ReturnType<typeof useLocalizacao>;
  fechar: () => void;
  aoMudar: () => void;
}) {
  const { lugares } = useVitrine();
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [horario, setHorario] = useState<null | "sugerir" | "definir" | "fechar">(null);
  const [valor, setValor] = useState(paraCampo(plano.quando));
  const [trocarLugar, setTrocarLugar] = useState(false);
  const [escolhendoTempo, setEscolhendoTempo] = useState(false);
  const [navegando, setNavegando] = useState(false);
  const [verMapa, setVerMapa] = useState(false);
  const aberto = plano.situacao === "aberto";
  const cancelado = plano.situacao === "cancelado";
  const ponto: [number, number] | null = plano.local_lat != null && plano.local_lng != null ? [plano.local_lat, plano.local_lng] : null;
  const { locais, meu } = localizacao;

  const agir = async (f: () => Promise<unknown>) => {
    setOcupado(true);
    setErro("");
    try {
      await f();
      aoMudar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };

  const responder = (r: RespostaPlano) => agir(() => rpcPlano("responder_plano", { p_plano: plano.id, p_resposta: plano.minha === r ? null : r }));

  const salvarHorario = () => {
    const iso = new Date(valor).toISOString();
    const modo = horario;
    setHorario(null);
    void agir(() =>
      modo === "sugerir"
        ? rpcPlano("sugerir_horario", { p_plano: plano.id, p_quando: iso })
        : modo === "fechar"
          ? rpcPlano("fechar_plano", { p_plano: plano.id, p_quando: iso })
          : rpcPlano("editar_plano", { p_plano: plano.id, p_local: plano.local_id, p_quando: iso }),
    );
  };

  const grupos: { r: RespostaPlano; titulo: string }[] = [
    { r: "vou", titulo: "Vão" },
    { r: "interesse", titulo: "Têm interesse" },
    { r: "nao_vou", titulo: "Não vão" },
  ];

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Plano de rolê" onClick={fechar}>
      <div className="folha max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="relative">
          {plano.local_foto ? (
            <img src={plano.local_foto} alt="" className="aspect-[16/9] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/9] w-full items-center justify-center bg-elevado text-suave">
              <MapPin className="h-10 w-10" />
            </div>
          )}
          <button onClick={fechar} className="absolute right-3 top-3 rounded-full bg-black/50 p-2 text-white hover:bg-black/70" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 px-5 pt-4">
          <div>
            <p className={clsx("text-[12px] font-bold uppercase tracking-wide", plano.situacao === "confirmado" ? "text-ok" : cancelado ? "text-suave" : "text-destaque")}>{ROTULO[plano.situacao]}</p>
            {plano.local_id ? (
              <Link to={`/lugar/${plano.local_id}`} className="mt-0.5 block text-xl font-semibold hover:underline">
                {aberto ? `Vamos no ${plano.local_nome}?` : plano.local_nome}
              </Link>
            ) : (
              <p className="mt-0.5 text-xl font-semibold">Lugar a definir</p>
            )}
            {plano.local_bairro && <p className="text-sm text-suave">{plano.local_bairro}</p>}
          </div>

          {/* 1. Dia e horário */}
          <section>
            <h3 className="rotulo mb-1.5">Dia e horário</h3>
            <p className="flex items-center gap-2 text-[15px] font-medium">
              <CalendarClock className="h-4 w-4 text-suave" aria-hidden />
              {quandoPlano(plano.quando)}
            </p>
            {aberto && plano.sugestoes.length > 0 && (
              <ul className="mt-2 space-y-1">
                {plano.sugestoes.map((s) => (
                  <li key={`${s.quando}-${s.nome}`} className="flex items-center justify-between gap-2 rounded-lg bg-elevado px-3 py-1.5 text-[13px]">
                    <span>
                      <strong>{quandoPlano(s.quando)}</strong> <span className="text-suave">· sugestão de {s.meu ? "você" : s.nome}</span>
                    </span>
                    {plano.pode_editar && (
                      <button className="font-semibold text-destaque" disabled={ocupado} onClick={() => void agir(() => rpcPlano("editar_plano", { p_plano: plano.id, p_local: plano.local_id, p_quando: s.quando }))}>
                        Usar
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {!cancelado && (
              <div className="mt-2 flex flex-wrap gap-2">
                {aberto && (
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => setHorario("sugerir")}>
                    Sugerir horário
                  </button>
                )}
                {plano.pode_editar && (
                  <button className="botao h-8 px-3 text-[13px]" onClick={() => setHorario("definir")}>
                    {plano.quando ? "Mudar horário" : "Definir horário"}
                  </button>
                )}
              </div>
            )}
            {horario && (
              <div className="mt-2 flex gap-2">
                <input
                  type="datetime-local"
                  value={valor}
                  onChange={(e) => setValor(e.target.value)}
                  aria-label="Dia e horário"
                  className="h-10 min-w-0 flex-1 rounded-lg bg-elevado px-3 text-sm focus:outline-none focus:ring-2 focus:ring-marca"
                />
                <button className="botao-principal h-10 px-4 text-sm" disabled={!valor} onClick={salvarHorario}>
                  {horario === "sugerir" ? "Sugerir" : horario === "fechar" ? "Fechar plano" : "Salvar"}
                </button>
                <button className="botao h-10 px-3" onClick={() => setHorario(null)} aria-label="Cancelar">
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </section>

          {/* 2. Quem vai */}
          <section>
            <h3 className="rotulo mb-1.5">Quem vai?</h3>
            {plano.respostas.length === 0 ? (
              <p className="text-sm text-suave">Ninguém respondeu ainda.</p>
            ) : (
              <div className="space-y-2">
                {grupos.map(({ r, titulo }) => {
                  const lista = plano.respostas.filter((x) => x.resposta === r);
                  if (!lista.length) return null;
                  return (
                    <div key={r}>
                      <p className="mb-1 text-[12px] font-medium text-suave">
                        {titulo} ({lista.length})
                      </p>
                      <ul className="flex flex-wrap gap-x-3 gap-y-2">
                        {lista.map((x) => (
                          <li key={x.id} className="flex items-center gap-1.5 text-[13px]">
                            <Avatar nome={x.nome} foto={x.foto} tamanho="sm" />
                            {x.id === eu ? "Você" : x.nome.split(" ")[0]}
                          </li>
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          {/* 3. Sua resposta (interesse ≠ presença confirmada) */}
          {!cancelado && (
            <section>
              <div className="grid grid-cols-3 gap-1 rounded-xl bg-elevado p-1" role="group" aria-label="Sua resposta">
                {(["interesse", "vou", "nao_vou"] as RespostaPlano[]).map((r) => (
                  <button
                    key={r}
                    disabled={ocupado}
                    aria-pressed={plano.minha === r}
                    onClick={() => void responder(r)}
                    className={clsx(
                      "h-10 rounded-lg text-[13px] font-semibold transition-colors",
                      plano.minha === r ? (r === "vou" ? "bg-ok text-white" : r === "interesse" ? "bg-marca text-marca-texto" : "bg-superficie text-texto shadow-sm") : "text-suave hover:text-texto",
                    )}
                  >
                    {plano.minha === r && r === "vou" ? "Vou ✓" : NOME_RESPOSTA[r]}
                  </button>
                ))}
              </div>
              <p className="mt-1.5 text-[12px] text-suave">"Tenho interesse" não confirma presença. Toque de novo para tirar sua resposta.</p>
            </section>
          )}

          {/* Chegar e localização */}
          {!cancelado && (
            <section className="flex flex-wrap gap-2">
              {ponto && (
                <button className="botao h-9 px-3 text-[13px]" onClick={() => setNavegando(true)}>
                  <Navigation className="h-4 w-4" />
                  Como chegar
                </button>
              )}
              {meu ? (
                <button className="botao h-9 px-3 text-[13px] text-ok" onClick={() => void agir(localizacao.parar)}>
                  <Radio className="h-4 w-4" />
                  Parar localização{meu.ate ? ` (até ${new Date(meu.ate).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })})` : ""}
                </button>
              ) : (
                <button className="botao h-9 px-3 text-[13px]" onClick={() => setEscolhendoTempo(true)}>
                  <LocateFixed className="h-4 w-4" />
                  Compartilhar localização
                </button>
              )}
              {(locais.length > 0 || ponto) && (
                <button className={clsx("botao h-9 px-3 text-[13px]", verMapa && "text-destaque")} onClick={() => setVerMapa((v) => !v)}>
                  <MapPin className="h-4 w-4" />
                  {verMapa ? "Fechar mapa" : `Mapa${locais.length ? ` (${locais.length})` : ""}`}
                </button>
              )}
            </section>
          )}
          {verMapa && (ponto || locais[0]) && (
            <div className="overflow-hidden rounded-xl">
              <MapaBase centro={ponto ?? [locais[0].latitude, locais[0].longitude]} zoom={14} className="h-56 w-full">
                {ponto && <PinMapa posicao={ponto} tamanho="grande" titulo={plano.local_nome ?? undefined} />}
                {locais.map((l) => (
                  <Marker key={l.usuario_id} position={[l.latitude, l.longitude]} icon={iconePessoa(l.nome, l.foto_url)} title={l.nome} />
                ))}
              </MapaBase>
              {locais.length > 0 && (
                <ul className="bg-elevado text-[13px]">
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

          {/* Ações de quem organiza (dependem do estado real do plano) */}
          {plano.pode_editar && !cancelado && (
            <section className="space-y-2 pt-1">
              {aberto && (
                <button
                  className="botao-principal h-11 w-full"
                  disabled={ocupado}
                  onClick={() => (plano.quando ? void agir(() => rpcPlano("fechar_plano", { p_plano: plano.id, p_quando: null })) : setHorario("fechar"))}
                >
                  Fechar plano{plano.quando ? ` para ${quandoPlano(plano.quando).toLowerCase()}` : ""}
                </button>
              )}
              <div className="flex flex-wrap gap-2">
                <button className="botao h-9 px-3 text-[13px]" onClick={() => setTrocarLugar(true)}>
                  Mudar lugar
                </button>
                {!aberto && (
                  <button className="botao h-9 px-3 text-[13px]" onClick={() => void agir(() => rpcPlano("reabrir_plano", { p_plano: plano.id }))}>
                    Reabrir para combinar
                  </button>
                )}
                <button
                  className="botao h-9 px-3 text-[13px] text-perigo"
                  onClick={() => window.confirm("Cancelar este plano? A conversa continua normalmente.") && void agir(() => rpcPlano("cancelar_plano", { p_plano: plano.id }))}
                >
                  Cancelar plano
                </button>
              </div>
            </section>
          )}
          {erro && <p className="text-sm text-perigo">{erro}</p>}
        </div>
      </div>
    </div>

      {trocarLugar && (
        <EscolherLugar
          titulo="Mudar o lugar do plano"
          lugares={lugares}
          fechar={() => setTrocarLugar(false)}
          escolher={(l) => {
            setTrocarLugar(false);
            void agir(() => rpcPlano("editar_plano", { p_plano: plano.id, p_local: l.id, p_quando: plano.quando }));
          }}
        />
      )}
      {escolhendoTempo && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Compartilhar localização" onClick={() => setEscolhendoTempo(false)}>
          <div className="folha w-full max-w-sm rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold">Compartilhar localização</h2>
              <button onClick={() => setEscolhendoTempo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mt-1 text-sm text-suave">Só quem está nesta conversa vê. A posição é atualizada enquanto a conversa estiver aberta no seu celular.</p>
            <div className="mt-4 grid gap-2">
              {([30, 60, null] as (number | null)[]).map((m) => (
                <button
                  key={String(m)}
                  className="botao h-11"
                  onClick={() => {
                    setEscolhendoTempo(false);
                    void agir(() => localizacao.compartilhar(m)).then(() => setVerMapa(true));
                  }}
                >
                  {m === 30 ? "Por 30 minutos" : m === 60 ? "Por 1 hora" : "Até eu desligar"}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      {navegando && ponto && <Navegacao destino={{ nome: plano.local_nome ?? "Rolê", lat: ponto[0], lng: ponto[1] }} fechar={() => setNavegando(false)} />}
    </>
  );
}
