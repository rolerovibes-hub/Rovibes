import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Clock, Lock, MapPin, Search, Store, User, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { supabase } from "@/lib/supabase";
import { PessoaResumo } from "@/lib/pessoas";
import { Carregando } from "@/components/Carregando";
import { MedidorMovimento } from "@/components/Marca";
import { useResumos } from "./presenca";
import { NotaCompacta } from "./Avaliacoes";
import { abertoAgora, resumoHorario } from "@/lib/horarios";
import { distanciaKm, ehHoje, km, Lugar, nomesVibes, pedirLocalizacao, quando, useVitrine } from "./dados";

const sem = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Sugestões e filtros quando o campo de busca está vazio. */
function Explorar() {
  const { lugares, eventos, carregando, erro } = useVitrine();
  const { resumos } = useResumos(null);
  const [filtro, setFiltro] = useState("Tudo");
  const busca = "";
  const [eu, setEu] = useState<[number, number] | null>(null);
  const [avisoLocal, setAvisoLocal] = useState("");

  // Filtros: fixos + as vibes que existem nos lugares.
  const filtros = useMemo(() => {
    const vibes = new Set(lugares.flatMap(nomesVibes));
    return ["Tudo", "Perto de mim", "Aberto agora", "Eventos hoje", ...[...vibes].sort()];
  }, [lugares]);

  const escolher = async (f: string) => {
    setFiltro(f);
    setAvisoLocal("");
    if (f === "Perto de mim" && !eu) {
      try {
        setEu(await pedirLocalizacao());
      } catch (e) {
        setAvisoLocal((e as Error).message);
      }
    }
  };

  const distancia = (l: Lugar) => (eu && l.latitude != null && l.longitude != null ? distanciaKm(eu, [l.latitude, l.longitude]) : null);

  const visiveis = useMemo(() => {
    const t = sem(busca.trim());
    let lista = lugares.filter(
      (l) => !t || sem(`${l.nome} ${l.bairro ?? ""} ${l.categoria?.nome ?? ""} ${nomesVibes(l).join(" ")}`).includes(t),
    );
    if (filtro === "Aberto agora") lista = lista.filter((l) => abertoAgora(l.horarios));
    else if (filtro === "Eventos hoje") {
      const comEvento = new Set(eventos.filter((e) => ehHoje(e.inicio)).map((e) => e.estabelecimento?.id));
      lista = lista.filter((l) => comEvento.has(l.id));
    } else if (!["Tudo", "Perto de mim"].includes(filtro)) lista = lista.filter((l) => nomesVibes(l).includes(filtro));
    if (filtro === "Perto de mim" && eu) {
      lista = [...lista].sort((a, b) => (distancia(a) ?? 9e9) - (distancia(b) ?? 9e9));
    }
    return lista;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lugares, eventos, filtro, busca, eu]);

  const eventosVisiveis = useMemo(() => {
    const t = sem(busca.trim());
    return eventos
      .filter((e) => !t || sem(`${e.nome} ${e.estabelecimento?.nome ?? ""}`).includes(t))
      .filter((e) => filtro !== "Eventos hoje" || ehHoje(e.inicio));
  }, [eventos, busca, filtro]);

  return (
    <div className="space-y-7">
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]" role="tablist" aria-label="Filtros">
        {filtros.map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={filtro === f}
            onClick={() => void escolher(f)}
            className={clsx(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition-colors",
              filtro === f ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda bg-superficie hover:bg-elevado",
            )}
          >
            {f}
          </button>
        ))}
      </div>
      {avisoLocal && <p className="px-4 text-sm text-alerta">{avisoLocal}</p>}

      {carregando ? (
        <Carregando />
      ) : erro ? (
        <p className="px-4 text-sm text-perigo">Não foi possível carregar agora. Verifique a conexão e tente de novo.</p>
      ) : (
        <>
          {eventosVisiveis.length > 0 && (
            <section>
              <h2 className="mb-3 px-4 font-semibold">Próximos eventos</h2>
              <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {eventosVisiveis.map((e) => (
                  <li key={e.id} className="w-60 shrink-0">
                    <Link to={`/evento/${e.id}`} className="cartao block overflow-hidden hover:bg-elevado">
                      {e.capa_url ? (
                        <img src={e.capa_url} alt="" className="h-28 w-full object-cover" loading="lazy" />
                      ) : (
                        <div className="flex h-28 items-center justify-center bg-elevado text-suave" aria-hidden="true">
                          <CalendarDays className="h-6 w-6" />
                        </div>
                      )}
                      <div className="p-3.5">
                        <p className={clsx("text-[13px] font-medium", ehHoje(e.inicio) ? "text-magenta" : "text-destaque")}>{quando(e.inicio)}</p>
                        <h3 className="mt-0.5 truncate font-semibold">{e.nome}</h3>
                        <p className="truncate text-[13px] text-suave">{e.estabelecimento?.nome}</p>
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="px-4">
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-semibold">Lugares</h2>
              <span className="text-[13px] text-suave">Uberlândia</span>
            </div>
            {visiveis.length === 0 ? (
              <div className="cartao px-6 py-12 text-center">
                <Store className="mx-auto h-7 w-7 text-suave" />
                <p className="mt-3 font-medium">{lugares.length === 0 ? "Os primeiros lugares estão chegando" : "Nada com esse filtro"}</p>
                <p className="mt-1 text-sm text-suave">
                  {lugares.length === 0 ? "Assim que os estabelecimentos forem aprovados, eles aparecem aqui." : "Tente outro filtro ou outra busca."}
                </p>
              </div>
            ) : (
              <ul className="space-y-3">
                {visiveis.map((l) => {
                  const d = distancia(l);
                  const horario = resumoHorario(l.horarios);
                  return (
                    <li key={l.id}>
                      <Link to={`/lugar/${l.id}`} className="cartao flex gap-3.5 p-3.5 hover:bg-elevado">
                        {l.capa_url ? (
                          <img src={l.capa_url} alt="" className="h-[76px] w-[76px] shrink-0 rounded-lg object-cover" loading="lazy" />
                        ) : (
                          <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-lg bg-elevado text-suave" aria-hidden="true">
                            <Store className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0 flex-1">
                          <h3 className="truncate font-semibold">{l.nome}</h3>
                          <p className="truncate text-[13px] text-suave">
                            {[l.categoria?.nome, l.bairro, l.faixa_preco ? "$".repeat(l.faixa_preco) : null].filter(Boolean).join(" · ")}
                          </p>
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px]">
                            {horario && <span className={abertoAgora(l.horarios) ? "font-medium text-ok" : "text-suave"}>{horario}</span>}
                            <NotaCompacta nota={resumos.get(l.id)?.nota ?? null} total={resumos.get(l.id)?.avaliacoes ?? 0} />
                            {resumos.get(l.id)?.movimento && <MedidorMovimento nivel={resumos.get(l.id)!.movimento!} />}
                            {d != null && (
                              <span className="inline-flex items-center gap-1 text-suave">
                                <MapPin className="h-3.5 w-3.5" />
                                {km(d)}
                              </span>
                            )}
                          </div>
                          {nomesVibes(l).length > 0 && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {nomesVibes(l).map((v) => (
                                <span key={v} className="rounded-md bg-destaque-suave px-2 py-0.5 text-[12px] font-medium text-destaque">
                                  {v}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}

interface Resultado {
  tipo: "lugar" | "evento" | "pessoa";
  id: string;
  titulo: string;
  subtitulo: string | null;
  imagem: string | null;
  chave: string;
  distancia_m: number | null;
  pontos: number;
  extra: { inicio?: string; privado?: boolean; sigo?: string | null };
}

const TIPOS: { id: Resultado["tipo"]; nome: string }[] = [
  { id: "lugar", nome: "Lugares" },
  { id: "evento", nome: "Eventos" },
  { id: "pessoa", nome: "Pessoas" },
];
const CHAVE_RECENTES = "rovibes:buscas";
const lerRecentes = (): string[] => {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_RECENTES) ?? "[]") as string[];
  } catch {
    return [];
  }
};
const guardarRecentes = (l: string[]) => {
  try {
    localStorage.setItem(CHAVE_RECENTES, JSON.stringify(l.slice(0, 8)));
  } catch {
    /* sem armazenamento: segue sem recentes */
  }
};
const linkDe = (r: Resultado) => (r.tipo === "lugar" ? `/lugar/${r.id}` : r.tipo === "evento" ? `/evento/${r.id}` : `/p/${r.chave}`);

function LinhaResultado({ r, aoAbrir }: { r: Resultado; aoAbrir: () => void }) {
  const redondo = r.tipo === "pessoa";
  return (
    <Link to={linkDe(r)} onClick={aoAbrir} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevado">
      {r.tipo === "pessoa" ? (
        <Avatar nome={r.titulo} foto={r.imagem} />
      ) : r.imagem ? (
        <img src={r.imagem} alt="" className={clsx("h-11 w-11 shrink-0 object-cover", redondo ? "rounded-full" : "rounded-lg")} loading="lazy" />
      ) : (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
          {r.tipo === "evento" ? <CalendarDays className="h-5 w-5" /> : <Store className="h-5 w-5" />}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 truncate font-medium">
          {r.titulo}
          {r.extra.privado && <Lock className="h-3.5 w-3.5 shrink-0 text-suave" aria-label="Perfil privado" />}
        </span>
        <span className="block truncate text-[13px] text-suave">
          {r.tipo === "evento" && r.extra.inicio ? `${quando(r.extra.inicio)} · ` : ""}
          {r.subtitulo}
        </span>
      </span>
      <span className="shrink-0 text-right text-[12px] text-suave">
        {r.distancia_m != null ? km(r.distancia_m / 1000) : r.tipo === "pessoa" && r.extra.sigo === "ativo" ? "Seguindo" : ""}
      </span>
    </Link>
  );
}

/** Pesquisar: um único campo. Os resultados vêm misturados por tipo (lugares, eventos, pessoas) enquanto digita. */
export function Descobrir() {
  const [termo, setTermo] = useState("");
  const [resultados, setResultados] = useState<Resultado[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState("");
  const [recentes, setRecentes] = useState<string[]>(lerRecentes);
  const [sugeridas, setSugeridas] = useState<PessoaResumo[]>([]);
  const [pos, setPos] = useState<[number, number] | null>(null);
  const ultima = useRef("");

  // Posição só se já liberada (não pede permissão sozinho).
  useEffect(() => {
    navigator.permissions
      ?.query({ name: "geolocation" as PermissionName })
      .then((s) => {
        if (s.state === "granted") pedirLocalizacao().then(setPos).catch(() => undefined);
      })
      .catch(() => undefined);
    supabase.rpc("pessoas_sugeridas").then(({ data }) => setSugeridas(((data ?? []) as PessoaResumo[]).slice(0, 10)));
  }, []);

  useEffect(() => {
    const t = termo.trim();
    ultima.current = t;
    if (t.replace(/^@/, "").length < 2) {
      setResultados(null);
      setBuscando(false);
      return;
    }
    setBuscando(true);
    const id = window.setTimeout(async () => {
      const { data, error } = await supabase.rpc("buscar_tudo", { p_termo: t, p_lat: pos?.[0] ?? null, p_lng: pos?.[1] ?? null });
      if (ultima.current !== t) return;
      setErro(error ? (/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 023 do banco (busca)." : "Não foi possível buscar agora.") : "");
      setResultados(((data ?? []) as Resultado[]).map((r) => ({ ...r, pontos: Number(r.pontos), extra: r.extra ?? {} })));
      setBuscando(false);
    }, 250);
    return () => window.clearTimeout(id);
  }, [termo, pos]);

  const lembrar = () => {
    const t = termo.trim();
    if (t.length < 2) return;
    const l = [t, ...recentes.filter((x) => x.toLowerCase() !== t.toLowerCase())];
    setRecentes(l.slice(0, 8));
    guardarRecentes(l);
  };

  const melhores = useMemo(() => [...(resultados ?? [])].sort((a, b) => b.pontos - a.pontos).slice(0, 4), [resultados]);
  const porTipo = (tipo: Resultado["tipo"]) => (resultados ?? []).filter((r) => r.tipo === tipo && !melhores.includes(r));

  return (
    <div className="space-y-5 py-4">
      <div className="space-y-3 px-4">
        <h1 className="text-[22px] font-semibold leading-tight">Para onde hoje?</h1>
        <label className="relative block">
          <span className="sr-only">Buscar lugares, eventos e pessoas</span>
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-suave" />
          <input
            type="search"
            value={termo}
            onChange={(e) => setTermo(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && lembrar()}
            placeholder="Lugares, eventos, pessoas, vibes"
            autoCapitalize="none"
            enterKeyHint="search"
            className="h-11 w-full rounded-cartao border border-borda bg-superficie pl-10 pr-10 placeholder:text-suave focus:border-marca focus:outline-none [&::-webkit-search-cancel-button]:hidden"
          />
          {termo && (
            <button onClick={() => setTermo("")} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-suave hover:bg-elevado" aria-label="Limpar busca">
              <X className="h-4 w-4" />
            </button>
          )}
        </label>
      </div>

      {erro && <p className="px-4 text-sm text-perigo">{erro}</p>}

      {resultados === null && !buscando ? (
        <>
          {recentes.length > 0 && (
            <section className="px-4">
              <div className="mb-2 flex items-center justify-between">
                <h2 className="font-semibold">Buscas recentes</h2>
                <button
                  className="text-[13px] text-suave hover:text-texto"
                  onClick={() => {
                    setRecentes([]);
                    guardarRecentes([]);
                  }}
                >
                  Limpar
                </button>
              </div>
              <div className="flex flex-wrap gap-2">
                {recentes.map((r) => (
                  <button key={r} onClick={() => setTermo(r)} className="inline-flex items-center gap-1.5 rounded-full border border-borda bg-superficie px-3 py-1.5 text-sm hover:bg-elevado">
                    <Clock className="h-3.5 w-3.5 text-suave" />
                    {r}
                  </button>
                ))}
              </div>
            </section>
          )}
          {sugeridas.length > 0 && (
            <section>
              <h2 className="mb-2 px-4 font-semibold">Pessoas que talvez você conheça</h2>
              <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
                {sugeridas.map((p) => (
                  <li key={p.id} className="w-[84px] shrink-0">
                    <Link to={`/p/${p.usuario}`} className="flex flex-col items-center gap-1.5 text-center">
                      <Avatar nome={p.nome} foto={p.foto_url} tamanho="story" />
                      <span className="w-full truncate text-[12px] font-medium">{p.nome}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Explorar />
        </>
      ) : buscando && !resultados ? (
        <Carregando />
      ) : resultados && resultados.length === 0 ? (
        <div className="px-6 py-14 text-center">
          <Search className="mx-auto h-7 w-7 text-suave" />
          <p className="mt-3 font-medium">Nada encontrado para “{termo.trim()}”</p>
          <p className="mt-1 text-sm text-suave">Tente outro nome, um bairro ou uma vibe.</p>
        </div>
      ) : (
        <div className={clsx("space-y-5 transition-opacity", buscando && "opacity-60")}>
          {melhores.length > 0 && (
            <section>
              <h2 className="mb-1 px-4 font-semibold">Melhores resultados</h2>
              <ul className="divide-y divide-borda">
                {melhores.map((r) => (
                  <li key={`${r.tipo}-${r.id}`}>
                    <LinhaResultado r={r} aoAbrir={lembrar} />
                  </li>
                ))}
              </ul>
            </section>
          )}
          {TIPOS.map((t) => {
            const lista = porTipo(t.id);
            if (!lista.length) return null;
            return (
              <section key={t.id}>
                <h2 className="mb-1 flex items-center gap-2 px-4 font-semibold">
                  {t.id === "pessoa" ? <User className="h-4 w-4 text-suave" /> : t.id === "evento" ? <CalendarDays className="h-4 w-4 text-suave" /> : <Store className="h-4 w-4 text-suave" />}
                  {t.nome}
                </h2>
                <ul className="divide-y divide-borda">
                  {lista.map((r) => (
                    <li key={`${r.tipo}-${r.id}`}>
                      <LinhaResultado r={r} aoAbrir={lembrar} />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
