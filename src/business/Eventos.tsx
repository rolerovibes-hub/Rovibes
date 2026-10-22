import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Check,
  Copy,
  ExternalLink,
  ImagePlus,
  LocateFixed,
  MapPin,
  Moon,
  Pencil,
  Plus,
  Rocket,
  Save,
  Search,
  Star,
  Ticket,
  Trash2,
  X,
} from "lucide-react";
import { EditorIngressos } from "./EditorIngressos";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, reais } from "@/components/Formulario";
import { IconePapo } from "@/components/IconesRoVibes";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { MapaBase, PinMapa, Recentralizar, UBERLANDIA } from "@/components/MapaBase";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";
import { useGostos } from "@/lib/gostos";
import { CATEGORIAS_EVENTO, EstadoEvento, estadoEvento, falta, fimEfetivo, NOME_ESTADO, textoData } from "@/lib/eventos";

type Situacao = "rascunho" | "publicado" | "cancelado";

interface Evento {
  id: string;
  nome: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  entrada: string | null;
  capa_url: string | null;
  situacao: Situacao;
  ingressos_vagas: number | null;
  gostos?: number[] | null;
  categoria?: string | null;
  local_nome?: string | null;
  endereco?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  avisar_seguidores?: boolean;
  avisado_em?: string | null;
}

interface Numeros {
  evento_id: string;
  visualizacoes: number;
  interessados: number;
  no_chat: number;
  vendidos: number;
  vagas: number | null;
  receita: number;
  vende_ingressos: boolean;
}

interface Rascunho {
  id?: string;
  nome: string;
  descricao: string;
  categoria: string;
  gostos: number[];
  data: string;
  hora: string;
  dataFim: string;
  horaFim: string;
  capa_url: string | null;
  situacao: Situacao;
  outroLocal: boolean;
  local_nome: string;
  endereco: string;
  latitude: number | null;
  longitude: number | null;
  acesso: "gratis" | "pago";
  entrada: string;
  limitar: boolean;
  vagas: string;
  vendeApp: boolean;
  avisar: boolean;
  avisado: boolean;
}

type Aba = "proximos" | "rascunhos" | "encerrados" | "cancelados";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "proximos", nome: "Próximos" },
  { id: "rascunhos", nome: "Rascunhos" },
  { id: "encerrados", nome: "Encerrados" },
  { id: "cancelados", nome: "Cancelados" },
];

const COR_ESTADO: Record<EstadoEvento, string> = {
  rascunho: "bg-elevado text-suave",
  agendado: "bg-destaque-suave text-destaque",
  andamento: "bg-perigo/10 text-perigo",
  esgotado: "bg-alerta/15 text-alerta",
  encerrado: "bg-elevado text-suave",
  cancelado: "bg-perigo/10 text-perigo",
};

const CAMPOS_BASE = "id, nome, descricao, inicio, fim, entrada, capa_url, situacao, ingressos_vagas, gostos";
const CAMPOS_NOVOS = `${CAMPOS_BASE}, categoria, local_nome, endereco, latitude, longitude, avisar_seguidores, avisado_em`;

// Data e hora locais (horário do aparelho, Brasília) <-> ISO do banco.
const partes = (iso: string | null | undefined) => {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const juntar = (data: string, hora: string) => (data ? new Date(`${data}T${hora || "00:00"}`).toISOString() : null);

/** Início e término a partir do formulário. Término antes do início = vira a noite (dia seguinte). */
function datasDoRascunho(r: Rascunho) {
  const inicio = juntar(r.data, r.hora);
  if (!inicio) return { inicio: null, fim: null, virou: false };
  let fim = r.horaFim ? juntar(r.dataFim || r.data, r.horaFim) : null;
  let virou = false;
  if (fim && fim <= inicio) {
    fim = new Date(Date.parse(fim) + 86400000).toISOString();
    virou = true;
  }
  if (fim && new Date(fim).toDateString() !== new Date(inicio).toDateString()) virou = true;
  return { inicio, fim, virou };
}

export const quandoEvento = (inicio: string) =>
  new Date(inicio).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const curto = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "numeric", month: "short" }).replace(/\./g, "");
const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

const vazio = (): Rascunho => ({
  nome: "",
  descricao: "",
  categoria: "",
  gostos: [],
  data: "",
  hora: "21:00",
  dataFim: "",
  horaFim: "",
  capa_url: null,
  situacao: "rascunho",
  outroLocal: false,
  local_nome: "",
  endereco: "",
  latitude: null,
  longitude: null,
  acesso: "gratis",
  entrada: "",
  limitar: false,
  vagas: "",
  vendeApp: true,
  avisar: true,
  avisado: false,
});

function paraRascunho(e: Evento, n?: Numeros, copia = false): Rascunho {
  const i = partes(e.inicio);
  const f = partes(e.fim);
  const pago = !!n?.vende_ingressos || /r\$|\d/i.test(e.entrada ?? "");
  return {
    id: copia ? undefined : e.id,
    nome: e.nome,
    descricao: e.descricao ?? "",
    categoria: e.categoria ?? "",
    gostos: e.gostos ?? [],
    data: copia ? "" : i.data,
    hora: i.hora,
    dataFim: copia || f.data === i.data ? "" : f.data,
    horaFim: f.hora,
    capa_url: e.capa_url,
    situacao: copia ? "rascunho" : e.situacao,
    outroLocal: !!(e.endereco || e.local_nome),
    local_nome: e.local_nome ?? "",
    endereco: e.endereco ?? "",
    latitude: e.latitude ?? null,
    longitude: e.longitude ?? null,
    acesso: pago ? "pago" : "gratis",
    entrada: e.entrada ?? "",
    limitar: e.ingressos_vagas != null,
    vagas: e.ingressos_vagas != null ? String(e.ingressos_vagas) : "",
    vendeApp: copia ? false : !!n?.vende_ingressos || !e.entrada,
    avisar: e.avisar_seguidores ?? true,
    avisado: copia ? false : !!e.avisado_em,
  };
}

export function Eventos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [eventos, setEventos] = useState<Evento[] | null>(null);
  const [numeros, setNumeros] = useState<Map<string, Numeros>>(new Map());
  const [lugar, setLugar] = useState<{ nome: string; endereco: string | null; bairro: string | null } | null>(null);
  const [novos, setNovos] = useState(true);
  const [aba, setAba] = useState<Aba>("proximos");
  const [busca, setBusca] = useState("");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [divulgar, setDivulgar] = useState<Evento | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const consulta = (campos: string) => supabase.from("eventos").select(campos).eq("estabelecimento_id", id).order("inicio", { ascending: false }).limit(500);
    let r = await consulta(CAMPOS_NOVOS);
    if (r.error) {
      setNovos(false);
      r = await consulta(CAMPOS_BASE);
    } else setNovos(true);
    setEventos(((r.data ?? []) as unknown as Evento[]) ?? []);
    const p = await supabase.rpc("painel_eventos", { p_estab: id });
    if (!p.error) setNumeros(new Map(((p.data ?? []) as Numeros[]).map((x) => [x.evento_id, { ...x, receita: Number(x.receita) }])));
  }, [id]);

  useEffect(() => {
    setEventos(null);
    void carregar();
    if (id)
      supabase
        .from("estabelecimentos")
        .select("nome, endereco, bairro")
        .eq("id", id)
        .maybeSingle()
        .then(({ data }) => setLugar((data as typeof lugar) ?? null));
  }, [carregar, id]);

  const agora = Date.now();
  const porAba = useMemo(() => {
    const grupos: Record<Aba, Evento[]> = { proximos: [], rascunhos: [], encerrados: [], cancelados: [] };
    for (const e of eventos ?? []) {
      if (e.situacao === "rascunho") grupos.rascunhos.push(e);
      else if (e.situacao === "cancelado") grupos.cancelados.push(e);
      else if (fimEfetivo(e) > agora) grupos.proximos.push(e);
      else grupos.encerrados.push(e);
    }
    grupos.proximos.reverse(); // o mais perto primeiro
    grupos.rascunhos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    return grupos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventos]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const termo = busca.trim().toLowerCase();
  const lista = porAba[aba].filter((e) => !termo || e.nome.toLowerCase().includes(termo) || (e.categoria ?? "").toLowerCase().includes(termo));
  const evento = (eventos ?? []).find((e) => e.id === selecionado) ?? null;

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const cancelar = () =>
    evento &&
    void executar(async () => {
      const n = numeros.get(evento.id);
      const quem = n && (n.interessados || n.vendidos) ? ` ${n.interessados} interessados e ${n.vendidos} com ingresso serão avisados.` : "";
      if (!window.confirm(`Cancelar "${evento.nome}"? Ele continua visível como cancelado.${quem}`)) return;
      const { error } = await supabase.from("eventos").update({ situacao: "cancelado" }).eq("id", evento.id);
      if (error) throw error;
      await carregar();
    }, "Evento cancelado.");

  const excluir = () =>
    evento &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${evento.nome}"? Esta ação não pode ser desfeita.`)) return;
      const { error } = await supabase.from("eventos").delete().eq("id", evento.id);
      if (error) throw error;
      // A capa pode estar sendo usada por um evento duplicado: só apaga se ninguém mais usa.
      const caminho = caminhoDaUrl(evento.capa_url);
      if (caminho && !(eventos ?? []).some((e) => e.id !== evento.id && e.capa_url === evento.capa_url)) await apagarFoto(caminho);
      setSelecionado(null);
      await carregar();
    }, "Evento excluído.");

  if (rascunho) {
    return (
      <EditorEvento
        estab={id}
        lugar={lugar}
        novos={novos}
        inicial={rascunho}
        fechar={(salvou) => {
          setRascunho(null);
          if (salvou) {
            setAviso({ tipo: "ok", texto: salvou });
            void carregar();
          }
        }}
      />
    );
  }

  const n = evento ? numeros.get(evento.id) : undefined;
  const estado = evento ? estadoEvento(evento, n, agora) : null;

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho(vazio())}>
            <Plus className="h-4 w-4" />
            Criar evento
          </button>
          <button className="botao" disabled={!evento} onClick={() => evento && setRascunho(paraRascunho(evento, n))}>
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <button className="botao" disabled={!evento} onClick={() => evento && setRascunho(paraRascunho(evento, n, true))}>
            <Copy className="h-4 w-4" />
            Duplicar com nova data
          </button>
          <button className="botao" disabled={!evento || evento.situacao !== "publicado"} onClick={() => evento && setDivulgar(evento)}>
            <IconePapo className="h-4 w-4" />
            Divulgar no chat
          </button>
          {evento ? (
            <Link to={`/evento/${evento.id}`} className="botao">
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </Link>
          ) : (
            <button className="botao" disabled>
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </button>
          )}
          <button className="botao" disabled={!evento || evento.situacao === "cancelado" || estado === "encerrado" || ocupado} onClick={cancelar}>
            <Ban className="h-4 w-4" />
            Cancelar evento
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!evento || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {!novos && (
        <Aviso tipo="erro">Para categoria, endereço próprio, “Tenho interesse” e os números dos eventos, aplique a atualização 045 do banco.</Aviso>
      )}

      <section className="cartao flex flex-wrap items-center gap-1.5 p-2.5" role="tablist" aria-label="Eventos">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => {
              setAba(a.id);
              setSelecionado(null);
            }}
            className={clsx("rounded-lg px-3 py-1.5 text-sm", aba === a.id ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")}
          >
            {a.nome}
            {porAba[a.id].length > 0 && <span className="ml-1.5 text-[12px] font-semibold">{porAba[a.id].length}</span>}
          </button>
        ))}
        <label className="relative ml-auto w-full sm:w-60">
          <span className="sr-only">Buscar evento</span>
          <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-suave" />
          <input className="entrada h-9 pl-9" placeholder="Buscar evento..." value={busca} onChange={(e) => setBusca(e.target.value)} />
        </label>
      </section>

      <section className="cartao overflow-hidden">
        {eventos === null ? (
          <p className="px-6 py-14 text-center text-sm text-suave">Carregando eventos...</p>
        ) : lista.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">
              {termo ? "Nenhum evento com esse nome" : aba === "proximos" ? "Nenhum evento marcado" : aba === "rascunhos" ? "Nenhum rascunho" : aba === "encerrados" ? "Nenhum evento encerrado" : "Nenhum evento cancelado"}
            </p>
            {aba === "proximos" && !termo && (
              <button className="botao-principal mt-4" onClick={() => setRascunho(vazio())}>
                <Plus className="h-4 w-4" />
                Criar evento
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Evento", "Quando", "Situação", "Ingressos", "Interessados", "No chat", "Vendas"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lista.map((e) => {
                  const num = numeros.get(e.id);
                  const est = estadoEvento(e, num, agora);
                  const pago = !!num?.vende_ingressos || /r\$|\d/i.test(e.entrada ?? "");
                  return (
                    <tr
                      key={e.id}
                      onClick={() => setSelecionado(e.id)}
                      onDoubleClick={() => setRascunho(paraRascunho(e, num))}
                      aria-selected={selecionado === e.id}
                      className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === e.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                    >
                      <td className="px-4 py-2.5">
                        <span className="flex items-center gap-3">
                          {e.capa_url ? (
                            <img src={e.capa_url} alt="" className="h-11 w-[76px] shrink-0 rounded-md object-cover" loading="lazy" />
                          ) : (
                            <span className="flex h-11 w-[76px] shrink-0 items-center justify-center rounded-md bg-elevado text-suave">
                              <ImagePlus className="h-4 w-4" />
                            </span>
                          )}
                          <span className="min-w-0">
                            <span className="block max-w-[220px] truncate font-semibold">{e.nome}</span>
                            <span className="block text-[12px] text-suave">{[e.categoria, pago ? "Pago" : "Gratuito"].filter(Boolean).join(" · ")}</span>
                          </span>
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {fimEfetivo(e) > agora && new Date(e.inicio).toDateString() === new Date().toDateString() ? "Hoje" : curto(e.inicio)} · {hora(e.inicio)}
                        {e.fim && ` → ${hora(e.fim)}`}
                        {e.fim && new Date(e.fim).toDateString() !== new Date(e.inicio).toDateString() && <span className="text-[12px] text-suave"> (dia seguinte)</span>}
                      </td>
                      <td className="px-4 py-2.5">
                        <Selo estado={est} extra={est === "agendado" ? falta(e.inicio, agora) : undefined} />
                      </td>
                      <td className="whitespace-nowrap px-4 py-2.5">
                        {num && num.vagas != null ? (
                          <>
                            <span className="font-semibold">{num.vendidos}</span> <span className="text-[12px] text-suave">de {num.vagas}</span>
                            <span className="mt-1 block h-1.5 w-28 overflow-hidden rounded-full bg-elevado">
                              <span className="block h-full rounded-full bg-marca" style={{ width: `${Math.min(100, (num.vendidos / Math.max(1, num.vagas)) * 100)}%` }} />
                            </span>
                          </>
                        ) : (
                          <span className="text-[13px] text-suave">{pago ? e.entrada || "Na porta" : "Entrada livre"}</span>
                        )}
                      </td>
                      <td className="px-4 py-2.5 font-semibold">{num ? num.interessados : "—"}</td>
                      <td className="px-4 py-2.5 font-semibold">{num ? num.no_chat : "—"}</td>
                      <td className="whitespace-nowrap px-4 py-2.5 font-semibold">{num && num.receita > 0 ? reais(num.receita) : <span className="font-normal text-suave">—</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {evento && estado && (
        <section className="cartao grid gap-5 p-4 md:grid-cols-[240px_1fr]">
          {evento.capa_url ? (
            <img src={evento.capa_url} alt="" className="aspect-[16/10] w-full rounded-lg object-cover" />
          ) : (
            <span className="flex aspect-[16/10] w-full items-center justify-center rounded-lg bg-elevado text-suave">
              <ImagePlus className="h-6 w-6" />
            </span>
          )}
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold">{evento.nome}</h2>
              <Selo estado={estado} />
            </div>
            <p className="text-[13px] text-suave">
              {(() => {
                const t = textoData(evento.inicio, evento.fim);
                return `${t.dia} · ${t.horario} · ${evento.local_nome || evento.endereco || lugar?.nome || ""}`;
              })()}
            </p>
            {n ? (
              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
                <Numero valor={n.visualizacoes} nome="visualizações" />
                <Numero valor={n.interessados} nome="interessados" />
                <Numero valor={n.no_chat} nome="divulgado no chat" />
                <Numero valor={n.vagas != null ? `${n.vendidos}/${n.vagas}` : n.vendidos} nome={n.vende_ingressos ? "ingressos vendidos" : "ingressos pegos"} />
                <Numero valor={reais(n.receita) || "R$ 0,00"} nome="em vendas" />
              </div>
            ) : (
              novos && <p className="mt-3 text-sm text-suave">Os números aparecem assim que o evento for visto no App.</p>
            )}
            {n && n.vagas != null && estado === "agendado" && n.vagas - n.vendidos > 0 && n.vagas - n.vendidos <= Math.max(10, n.vagas * 0.15) && (
              <p className="mt-3 flex items-center gap-2 rounded-lg bg-alerta/10 px-3 py-2 text-[13px] text-alerta">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Restam só {n.vagas - n.vendidos} {n.vagas - n.vendidos === 1 ? "ingresso" : "ingressos"}.
              </p>
            )}
            {estado === "rascunho" && (
              <p className="mt-3 text-[13px] text-suave">
                Rascunho: só a equipe vê.{" "}
                <button className="font-semibold text-destaque" onClick={() => setRascunho(paraRascunho(evento, n))}>
                  Continuar editando
                </button>
              </p>
            )}
          </div>
        </section>
      )}

      {divulgar && <CompartilharNoChat tipo="evento" id={divulgar.id} titulo={divulgar.nome} fechar={() => setDivulgar(null)} enviado={(t) => setAviso({ tipo: "ok", texto: t })} />}
    </TelaUniversal>
  );
}

function Selo({ estado, extra }: { estado: EstadoEvento; extra?: string }) {
  return (
    <span className={clsx("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wide", COR_ESTADO[estado])}>
      {estado === "andamento" && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" />}
      {NOME_ESTADO[estado]}
      {extra && ` · ${extra}`}
    </span>
  );
}

function Numero({ valor, nome }: { valor: ReactNode; nome: string }) {
  return (
    <span className="rounded-lg bg-elevado/70 px-3 py-2">
      <span className="block text-lg font-semibold leading-tight">{valor}</span>
      <span className="text-[12px] text-suave">{nome}</span>
    </span>
  );
}

// ============================================================
// Criar / editar evento
// ============================================================

function EditorEvento({
  estab,
  lugar,
  novos,
  inicial,
  fechar,
}: {
  estab: string;
  lugar: { nome: string; endereco: string | null; bairro: string | null } | null;
  novos: boolean;
  inicial: Rascunho;
  fechar: (salvou?: string) => void;
}) {
  const [r, setR] = useState<Rascunho>(inicial);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const gostos = useGostos();
  const musicas = (gostos ?? []).filter((g) => g.tipo === "musica");
  const mudar = (p: Partial<Rascunho>) => setR((x) => ({ ...x, ...p }));
  const { inicio, fim, virou } = datasDoRascunho(r);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === "Escape" && !ocupado && fechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [fechar, ocupado]);

  const pendencias = [
    { ok: !!r.capa_url, nome: "Capa" },
    { ok: r.nome.trim().length >= 2 && r.descricao.trim().length >= 5, nome: "Nome e descrição" },
    { ok: !!r.categoria || !novos, nome: "Categoria" },
    { ok: !!inicio, nome: "Data e horário" },
    { ok: !r.outroLocal || !!r.endereco.trim(), nome: "Local" },
    { ok: r.acesso === "gratis" ? !r.limitar || Number(r.vagas) > 0 : r.vendeApp ? !!r.id : !!r.entrada.trim(), nome: r.acesso === "pago" ? "Ingressos" : "Entrada" },
  ];
  const podePublicar = pendencias.every((p) => p.ok);

  const trocarCapa = async (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (seletorFoto.current) seletorFoto.current.value = "";
    if (!arquivo) return;
    setOcupado(true);
    try {
      const { url } = await enviarFoto(estab, arquivo, "evento");
      mudar({ capa_url: url });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  const localizar = async () => {
    const consulta = [r.endereco, "Uberlândia", "MG", "Brasil"].filter(Boolean).join(", ");
    try {
      const resp = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(consulta)}`);
      const l = (await resp.json()) as { lat: string; lon: string }[];
      if (!l.length) return setAviso({ tipo: "erro", texto: "Endereço não encontrado no mapa. Clique no mapa para marcar o local." });
      const lat = Number(l[0].lat);
      const lng = Number(l[0].lon);
      mudar({ latitude: lat, longitude: lng });
      setCentro([lat, lng]);
    } catch {
      setAviso({ tipo: "erro", texto: "Não foi possível consultar o mapa agora." });
    }
  };

  /** Salva. "publicar" exige tudo preenchido; "rascunho" só nome e data. `continuar` mantém o editor aberto. */
  const salvar = async (alvo: Situacao, continuar = false) => {
    setAviso(null);
    if (r.nome.trim().length < 2) return setAviso({ tipo: "erro", texto: "Dê um nome ao evento." });
    if (!inicio) return setAviso({ tipo: "erro", texto: "Informe a data e o horário de início." });
    if (alvo === "publicado" && !podePublicar)
      return setAviso({ tipo: "erro", texto: `Para publicar, falta: ${pendencias.filter((p) => !p.ok).map((p) => p.nome.toLowerCase()).join(", ")}.` });
    if (alvo === "publicado" && fim && Date.parse(fim) <= Date.now()) return setAviso({ tipo: "erro", texto: "Esse horário já passou. Confira a data do evento." });

    const vagas = r.acesso === "gratis" && r.limitar ? Math.max(1, Math.round(Number(r.vagas))) : null;
    const valores: Record<string, unknown> = {
      nome: r.nome.trim(),
      descricao: r.descricao.trim() || null,
      inicio,
      fim,
      entrada: r.acesso === "gratis" ? r.entrada.trim() || "Gratuita" : r.vendeApp ? r.entrada.trim() || null : r.entrada.trim(),
      capa_url: r.capa_url,
      situacao: alvo,
      ingressos_vagas: vagas,
      gostos: r.gostos,
    };
    if (novos) {
      Object.assign(valores, {
        categoria: r.categoria || null,
        local_nome: r.outroLocal ? r.local_nome.trim() || null : null,
        endereco: r.outroLocal ? r.endereco.trim() || null : null,
        latitude: r.outroLocal ? r.latitude : null,
        longitude: r.outroLocal ? r.longitude : null,
        avisar_seguidores: r.avisar,
      });
    }
    setOcupado(true);
    try {
      if (r.id) {
        const { error } = await supabase.from("eventos").update(valores).eq("id", r.id);
        if (error) throw error;
        mudar({ situacao: alvo, avisado: r.avisado || alvo === "publicado" });
      } else {
        const { data, error } = await supabase.from("eventos").insert({ ...valores, estabelecimento_id: estab }).select("id").single();
        if (error) throw error;
        mudar({ id: (data as { id: string }).id, situacao: alvo, avisado: alvo === "publicado" });
      }
      if (continuar) setAviso({ tipo: "ok", texto: "Rascunho salvo. Agora configure os ingressos." });
      else fechar(alvo === "publicado" ? (r.situacao === "publicado" ? "Evento atualizado." : "Evento publicado! Já aparece no App.") : alvo === "cancelado" ? "Evento salvo." : "Rascunho salvo.");
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };

  // Enter num campo não publica sem querer: publicar só pelo botão.
  const enviar = (e: FormEvent) => e.preventDefault();
  const pin: [number, number] | null = r.latitude != null && r.longitude != null ? [r.latitude, r.longitude] : null;
  const jaPublicado = inicial.situacao === "publicado";

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={ocupado} onClick={() => void salvar("publicado")}>
            <Rocket className="h-4 w-4" />
            {jaPublicado ? "Salvar alterações" : "Publicar evento"}
          </button>
          {!jaPublicado && inicial.situacao !== "cancelado" && (
            <button className="botao" disabled={ocupado} onClick={() => void salvar("rascunho")}>
              <Save className="h-4 w-4" />
              Salvar rascunho
            </button>
          )}
          <button className="botao" disabled={ocupado} onClick={() => fechar()}>
            <X className="h-4 w-4" />
            {r.id && !inicial.id ? "Fechar" : "Descartar"}
          </button>
        </>
      }
      rodape={
        <div>
          <p className="rotulo mb-1.5 px-1">Para publicar</p>
          <ul className="space-y-1 px-1 text-[13px]">
            {pendencias.map((p) => (
              <li key={p.nome} className={clsx("flex items-center gap-2", !p.ok && "text-suave")}>
                <span className={clsx("flex h-4 w-4 items-center justify-center rounded-full", p.ok ? "bg-ok text-white" : "border border-borda")}>{p.ok && <Check className="h-3 w-3" />}</span>
                {p.nome}
              </li>
            ))}
          </ul>
        </div>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <form onSubmit={enviar} className="grid items-start gap-4 2xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold">{inicial.id ? "Editar evento" : "Criar evento"}</h2>
            {inicial.id && <Selo estado={estadoEvento({ inicio: inicio ?? new Date().toISOString(), fim, situacao: r.situacao })} />}
          </div>

          <Parte numero="01" titulo="Apresentação">
            <div className="grid gap-4 md:grid-cols-[300px_1fr]">
              <div>
                <span className="rotulo mb-1 block">Capa do evento *</span>
                <button
                  type="button"
                  onClick={() => seletorFoto.current?.click()}
                  className="relative flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
                >
                  {r.capa_url ? (
                    <>
                      <img src={r.capa_url} alt="" className="h-full w-full object-cover" />
                      <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-2.5 py-1 text-[12px] font-semibold text-white">Trocar capa</span>
                    </>
                  ) : (
                    <span className="flex flex-col items-center gap-1 text-[13px]">
                      <ImagePlus className="h-6 w-6" />
                      Imagem ou arte · horizontal
                    </span>
                  )}
                </button>
                <input ref={seletorFoto} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarCapa(e.target.files)} />
              </div>
              <div className="space-y-3">
                <label className="block">
                  <span className="rotulo mb-1 block">Nome do evento *</span>
                  <input required minLength={2} maxLength={80} autoFocus={!inicial.id} className="entrada" placeholder="Ex.: Noite de Pagode" value={r.nome} onChange={(e) => mudar({ nome: e.target.value })} />
                </label>
                <label className="block">
                  <span className="rotulo mb-1 block">Descrição *</span>
                  <textarea
                    rows={4}
                    maxLength={600}
                    className="entrada"
                    placeholder="O que vai rolar: atração, promoções, dress code..."
                    value={r.descricao}
                    onChange={(e) => mudar({ descricao: e.target.value })}
                  />
                </label>
              </div>
            </div>
            {novos && (
              <>
                <p className="rotulo mb-1.5 mt-4">Categoria *</p>
                <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Categoria">
                  {CATEGORIAS_EVENTO.map((c) => (
                    <Chip key={c} ativo={r.categoria === c} onClick={() => mudar({ categoria: r.categoria === c ? "" : c })} papel="radio">
                      {c}
                    </Chip>
                  ))}
                </div>
              </>
            )}
            {musicas.length > 0 && (
              <>
                <p className="rotulo mb-1.5 mt-4">
                  Estilos musicais <span className="font-normal normal-case">(ajudam a achar quem curte · opcional)</span>
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {musicas.map((g) => (
                    <Chip key={g.id} ativo={r.gostos.includes(g.id)} onClick={() => mudar({ gostos: r.gostos.includes(g.id) ? r.gostos.filter((x) => x !== g.id) : [...r.gostos, g.id] })}>
                      {g.emoji ? `${g.emoji} ` : ""}
                      {g.nome}
                    </Chip>
                  ))}
                </div>
              </>
            )}
          </Parte>

          <Parte numero="02" titulo="Data e local">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <label className="block">
                <span className="rotulo mb-1 block">Data de início *</span>
                <input required type="date" className="entrada" value={r.data} onChange={(e) => mudar({ data: e.target.value })} />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Horário *</span>
                <input required type="time" className="entrada" value={r.hora} onChange={(e) => mudar({ hora: e.target.value })} />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Data de término</span>
                <input type="date" className="entrada" min={r.data || undefined} value={r.dataFim} onChange={(e) => mudar({ dataFim: e.target.value })} />
              </label>
              <label className="block">
                <span className="rotulo mb-1 block">Horário de término</span>
                <input type="time" className="entrada" value={r.horaFim} onChange={(e) => mudar({ horaFim: e.target.value })} />
              </label>
            </div>
            {inicio && fim && virou && (
              <p className="mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-destaque">
                <Moon className="h-4 w-4" />
                Vira a noite: termina {new Date(fim).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}, às {hora(fim)} (horário de Brasília).
              </p>
            )}
            {!r.horaFim && <p className="mt-2 text-[12px] text-suave">Sem horário de término, o evento sai de “Próximos” 6 horas depois do início.</p>}

            <div className="mt-4 grid items-center gap-3 lg:grid-cols-2">
              <div className={clsx("flex items-center gap-3 rounded-lg border border-borda px-3.5 py-2.5", r.outroLocal && "opacity-50")}>
                <MapPin className="h-5 w-5 shrink-0 text-destaque" />
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold">{lugar?.nome ?? "Seu estabelecimento"}</span>
                  <span className="block truncate text-[13px] text-suave">{[lugar?.endereco, lugar?.bairro].filter(Boolean).join(" · ") || "Endereço do perfil do estabelecimento"}</span>
                </span>
                {!r.outroLocal && <Check className="h-4 w-4 shrink-0 text-ok" />}
              </div>
              {novos && <Alternar ligado={r.outroLocal} mudar={(v) => mudar({ outroLocal: v })} titulo="Acontece em outro endereço" texto="O estabelecimento continua sendo o responsável pela publicação" />}
            </div>
            {r.outroLocal && (
              <div className="mt-4 space-y-3 rounded-lg bg-elevado/50 p-3">
                <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                  <label className="block">
                    <span className="rotulo mb-1 block">Nome do local</span>
                    <input className="entrada" maxLength={80} placeholder="Ex.: Center Convention" value={r.local_nome} onChange={(e) => mudar({ local_nome: e.target.value })} />
                  </label>
                  <label className="block">
                    <span className="rotulo mb-1 block">Endereço *</span>
                    <span className="flex gap-2">
                      <input className="entrada" maxLength={200} placeholder="Rua, número, bairro" value={r.endereco} onChange={(e) => mudar({ endereco: e.target.value })} />
                      <button type="button" className="botao shrink-0" onClick={() => void localizar()} disabled={!r.endereco.trim()}>
                        <LocateFixed className="h-4 w-4" />
                        Localizar
                      </button>
                    </span>
                  </label>
                </div>
                <p className="text-[12px] text-suave">{pin ? "Local marcado. Clique no mapa para ajustar." : "Localize pelo endereço ou clique no mapa para marcar o ponto."}</p>
                <div className="h-60 overflow-hidden rounded-lg border border-borda">
                  <MapaBase centro={pin ?? UBERLANDIA} zoom={pin ? 16 : 13} className="h-full w-full" aoClicar={(lat, lng) => mudar({ latitude: lat, longitude: lng })}>
                    <Recentralizar centro={centro} zoom={16} />
                    {pin && <PinMapa posicao={pin} tamanho="grande" />}
                  </MapaBase>
                </div>
              </div>
            )}
          </Parte>

          <Parte numero="03" titulo="Acesso e ingressos">
            <div className="grid gap-3 sm:grid-cols-2">
              <Opcao ativo={r.acesso === "gratis"} onClick={() => mudar({ acesso: "gratis" })} titulo="Entrada gratuita" texto="Sem cobrança de ingresso" />
              <Opcao ativo={r.acesso === "pago"} onClick={() => mudar({ acesso: "pago", limitar: false })} titulo="Evento pago" texto="Ingressos, lotes, preços e disponibilidade" />
            </div>
            {r.acesso === "gratis" ? (
              <div className="mt-4 space-y-3">
                <label className="block">
                  <span className="rotulo mb-1 block">Observação da entrada (opcional)</span>
                  <input className="entrada" maxLength={80} placeholder="Ex.: Grátis até 22h, nome na lista" value={r.entrada === "Gratuita" ? "" : r.entrada} onChange={(e) => mudar({ entrada: e.target.value })} />
                </label>
                <div className="flex flex-wrap items-center gap-3">
                  <Alternar
                    ligado={r.limitar}
                    mudar={(v) => mudar({ limitar: v, vagas: v && !r.vagas ? "100" : r.vagas })}
                    titulo="Limitar vagas"
                    texto="A pessoa pega o ingresso grátis no App (QR na entrada) e aparece “Esgotado” quando acabar"
                  />
                  {r.limitar && (
                    <label className="flex items-center gap-2 text-sm">
                      <input type="number" min={1} max={100000} className="entrada w-28" value={r.vagas} onChange={(e) => mudar({ vagas: e.target.value })} aria-label="Quantidade de vagas" />
                      pessoas
                    </label>
                  )}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Opcao pequeno ativo={r.vendeApp} onClick={() => mudar({ vendeApp: true })} titulo="Vender pelo RoVibes" texto="Lotes, QR na entrada e repasse automático" />
                  <Opcao pequeno ativo={!r.vendeApp} onClick={() => mudar({ vendeApp: false })} titulo="Cobrar na porta" texto="Só informa o valor no App" />
                </div>
                {!r.vendeApp ? (
                  <label className="block">
                    <span className="rotulo mb-1 block">Valor da entrada *</span>
                    <input className="entrada" maxLength={80} placeholder="Ex.: R$ 30 na porta, R$ 20 até 22h" value={r.entrada} onChange={(e) => mudar({ entrada: e.target.value })} />
                  </label>
                ) : r.id ? (
                  <EditorIngressos evento={r.id} />
                ) : (
                  <div className="rounded-lg border border-dashed border-borda p-4 text-sm">
                    <p className="text-suave">Para configurar os tipos e lotes (preço, quantidade e até quando vende), salve primeiro como rascunho. Nada aparece para o público ainda.</p>
                    <button type="button" className="botao mt-3" disabled={ocupado} onClick={() => void salvar("rascunho", true)}>
                      <Ticket className="h-4 w-4" />
                      Salvar rascunho e configurar ingressos
                    </button>
                  </div>
                )}
              </div>
            )}
          </Parte>

          {novos && (
            <Parte numero="04" titulo="Publicação">
              {r.avisado ? (
                <p className="text-sm text-suave">Os seguidores já foram avisados quando o evento foi publicado. Se mudar data, horário ou local, ou cancelar, quem tem interesse ou ingresso recebe um aviso.</p>
              ) : (
                <Alternar ligado={r.avisar} mudar={(v) => mudar({ avisar: v })} titulo={`Avisar quem segue ${lugar?.nome ?? "o lugar"}`} texto="Notificação no celular quando publicar" />
              )}
              <p className="mt-3 text-[12px] text-suave">Ao publicar, o evento aparece para todos do RoVibes: no perfil do lugar, no Feed e no Descobrir.</p>
            </Parte>
          )}
        </div>

        <Previa r={r} inicio={inicio} fim={fim} lugar={lugar} />
      </form>
    </TelaUniversal>
  );
}

function Parte({ numero, titulo, children }: { numero: string; titulo: string; children: ReactNode }) {
  return (
    <section className="cartao p-5">
      <h3 className="mb-3 text-[12px] font-extrabold uppercase tracking-[0.08em] text-destaque">
        {numero} — {titulo}
      </h3>
      {children}
    </section>
  );
}

function Chip({ ativo, onClick, children, papel }: { ativo: boolean; onClick: () => void; children: ReactNode; papel?: "radio" }) {
  return (
    <button
      type="button"
      role={papel}
      aria-checked={papel ? ativo : undefined}
      aria-pressed={papel ? undefined : ativo}
      onClick={onClick}
      className={clsx("rounded-full border px-3 py-1.5 text-[13px] transition-colors", ativo ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda hover:bg-elevado")}
    >
      {children}
    </button>
  );
}

function Opcao({ ativo, onClick, titulo, texto, pequeno }: { ativo: boolean; onClick: () => void; titulo: string; texto: string; pequeno?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={clsx("rounded-lg border-[1.5px] text-left transition-colors", pequeno ? "px-3 py-2" : "px-3.5 py-3", ativo ? "border-marca bg-destaque-suave" : "border-borda hover:bg-elevado")}
    >
      <span className={clsx("block font-semibold", pequeno && "text-sm")}>{titulo}</span>
      <span className="block text-[12px] text-suave">{texto}</span>
    </button>
  );
}

function Alternar({ ligado, mudar, titulo, texto }: { ligado: boolean; mudar: (v: boolean) => void; titulo: string; texto: string }) {
  return (
    <button type="button" role="switch" aria-checked={ligado} onClick={() => mudar(!ligado)} className="flex items-center gap-3 text-left">
      <span className={clsx("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors", ligado ? "bg-marca" : "bg-borda")}>
        <span className={clsx("absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-all", ligado ? "left-[18px]" : "left-[2px]")} />
      </span>
      <span>
        <span className="block text-sm font-medium">{titulo}</span>
        <span className="block text-[12px] text-suave">{texto}</span>
      </span>
    </button>
  );
}

/** Como o público vai ver no App (atualiza enquanto digita). */
function Previa({ r, inicio, fim, lugar }: { r: Rascunho; inicio: string | null; fim: string | null; lugar: { nome: string; bairro: string | null } | null }) {
  const t = inicio ? textoData(inicio, fim) : null;
  const local = r.outroLocal ? r.local_nome || r.endereco || "Outro endereço" : lugar?.nome ?? "Seu estabelecimento";
  const sub = r.outroLocal ? (r.local_nome ? r.endereco : "") : lugar?.bairro ?? "";
  const preco = r.acesso === "gratis" ? (r.entrada && r.entrada !== "Gratuita" ? r.entrada : "Entrada gratuita") : r.vendeApp ? "Ingressos no App" : r.entrada || "Valor a informar";
  return (
    <aside className="cartao overflow-hidden 2xl:sticky 2xl:top-24" aria-label="Pré-visualização">
      <p className="flex items-center justify-between border-b border-borda px-4 py-2.5 text-[12px] font-bold uppercase tracking-wide text-suave">
        Como o público vai ver
        <span className="font-semibold normal-case">📱 App</span>
      </p>
      <div className="relative">
        {r.capa_url ? (
          <img src={r.capa_url} alt="" className="aspect-[16/10] w-full object-cover" />
        ) : (
          <span className="flex aspect-[16/10] w-full items-center justify-center bg-elevado text-suave">
            <CalendarDays className="h-7 w-7" />
          </span>
        )}
        {r.categoria && <span className="absolute bottom-2.5 left-3 rounded-full bg-white/95 px-2.5 py-0.5 text-[12px] font-bold text-[#6D28D9]">{r.categoria}</span>}
      </div>
      <div className="space-y-2.5 p-4">
        <h4 className="text-lg font-semibold leading-tight">{r.nome.trim() || "Nome do evento"}</h4>
        <LinhaPrevia icone={<CalendarDays className="h-4 w-4" />} titulo={t?.dia ?? "Data a definir"} texto={t?.horario} />
        <LinhaPrevia icone={<MapPin className="h-4 w-4" />} titulo={local} texto={sub || undefined} />
        <LinhaPrevia icone={<Ticket className="h-4 w-4" />} titulo={preco} texto={r.acesso === "gratis" && r.limitar && Number(r.vagas) > 0 ? `${r.vagas} vagas` : undefined} />
        {r.descricao.trim() && <p className="line-clamp-4 whitespace-pre-line text-[13px] text-suave">{r.descricao}</p>}
        <div className="grid grid-cols-2 gap-2 pt-1">
          <span className="flex items-center justify-center gap-1.5 rounded-lg border border-borda py-2 text-[13px] font-semibold">
            <Star className="h-4 w-4" />
            Tenho interesse
          </span>
          {r.acesso === "pago" && r.vendeApp ? (
            <span className="flex items-center justify-center rounded-lg bg-marca py-2 text-[13px] font-semibold text-marca-texto">Comprar ingresso</span>
          ) : r.acesso === "gratis" && r.limitar ? (
            <span className="flex items-center justify-center rounded-lg bg-marca py-2 text-[13px] font-semibold text-marca-texto">Pegar ingresso</span>
          ) : (
            <span className="flex items-center justify-center rounded-lg bg-marca py-2 text-[13px] font-semibold text-marca-texto">Marcar rolê</span>
          )}
        </div>
        <p className="text-center text-[12px] text-suave">💬 Chamar a galera · compartilhar no chat</p>
      </div>
    </aside>
  );
}

function LinhaPrevia({ icone, titulo, texto }: { icone: ReactNode; titulo: string; texto?: string }) {
  return (
    <p className="flex items-center gap-2.5 text-sm">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-elevado text-destaque">{icone}</span>
      <span className="min-w-0">
        <span className="block truncate font-semibold">{titulo}</span>
        {texto && <span className="block truncate text-[12px] text-suave">{texto}</span>}
      </span>
    </p>
  );
}
