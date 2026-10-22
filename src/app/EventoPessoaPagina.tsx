import { useCallback, useEffect, useState } from "react";
import { IconeConvite } from "@/components/IconesRoVibes";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, CalendarDays, Check, Lock, MapPin, Minus, Navigation, Pencil, Plus, Rocket, ScanLine, Ticket, UserPlus, Users, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { LeitorQr, QrCode } from "@/components/Qr";
import { MapaBase, PinMapa } from "@/components/MapaBase";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { compartilhar, URL_PUBLICA } from "@/lib/promoters";
import {
  buscarEventoPessoa,
  buscarRegras,
  conferirVolta,
  dataEvento,
  EventoPessoa,
  NOME_TIPO,
  Pacote,
  pagarCompraAnfitriao,
  pagarImpulso,
  reservarAnfitriao,
  VISIBILIDADES_EVENTO,
} from "@/lib/eventosPessoa";
import { EscolherPessoas } from "./NovoRole";

function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="folha max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{titulo}</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

/** Página do evento de um anfitrião: comprar/confirmar, ingressos com QR e, para o anfitrião, convites, impulso, vendas e portaria. */
export function EventoPessoaPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const [ev, setEv] = useState<EventoPessoa | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState(busca.get("novo") ? "Evento criado! Agora convide os amigos." : "");
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [comprando, setComprando] = useState(false);
  const [folha, setFolha] = useState<null | "convidar" | "impulsionar" | "portaria" | "ingresso" | "convidados">(null);
  const [ingressoAberto, setIngressoAberto] = useState<string | null>(null);
  const [pacotes, setPacotes] = useState<Pacote[]>([]);
  const [leitura, setLeitura] = useState<{ ok: boolean; motivo?: string; nome?: string; foto_url?: string | null; cota?: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      setEv(await buscarEventoPessoa(id));
    } catch (e) {
      setErro(mensagemDeErro(e));
      setEv(null);
    }
  }, [id]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  // Voltou do Mercado Pago (ingresso ou impulso).
  useEffect(() => {
    const compra = busca.get("compra");
    const impulso = busca.get("impulso");
    const mpId = busca.get("payment_id") ?? busca.get("collection_id");
    if (!compra && !impulso && !busca.get("novo")) return;
    if (compra || impulso) {
      setAviso("Conferindo o pagamento...");
      let n = 0;
      const tentar = async () => {
        n++;
        const sit = await conferirVolta(compra ? "anfitriao" : "impulso", (compra ?? impulso)!, mpId);
        if (sit === "aprovado" || sit === "ja_aprovado") {
          setAviso(compra ? "Pagamento aprovado! Seu ingresso está aqui embaixo." : "Pronto! O evento está sendo impulsionado.");
          void carregar();
        } else if (sit === "recusado" || busca.get("status") === "rejected") setAviso("O pagamento não foi aprovado. Tente de novo.");
        else if (n < 6) window.setTimeout(() => void tentar(), 3000);
        else setAviso("O pagamento ainda está em análise. Ele aparece aqui quando for aprovado.");
      };
      void tentar();
    }
    setBusca({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (ev === undefined) return <Carregando />;
  if (!ev)
    return (
      <div className="px-6 py-20 text-center">
        <Lock className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-medium">{erro || "Evento não encontrado ou só para convidados"}</p>
        <Link to="/" className="botao mt-5">
          Voltar ao início
        </Link>
      </div>
    );

  const tipo = NOME_TIPO[ev.tipo];
  const total = ev.cotas.reduce((s, c) => s + (qtd[c.id] ?? 0) * c.preco, 0);
  const itens = Object.values(qtd).reduce((s, n) => s + n, 0);
  const ponto: [number, number] | null = ev.latitude != null && ev.longitude != null ? [ev.latitude, ev.longitude] : null;
  const validos = ev.meus_ingressos.filter((i) => i.situacao !== "cancelado");
  const encerrado = ev.situacao === "cancelado" || ev.suspenso;

  const comprar = async () => {
    setErro("");
    setComprando(true);
    try {
      const r = await reservarAnfitriao(
        ev.id,
        Object.entries(qtd)
          .filter(([, n]) => n > 0)
          .map(([cota_id, quantidade]) => ({ cota_id, quantidade })),
      );
      if (r.gratis) {
        setQtd({});
        setAviso("Presença confirmada! Seu ingresso está aqui embaixo.");
        await carregar();
      } else {
        const p = await pagarCompraAnfitriao(r.compra_id);
        window.location.href = p.url;
        return;
      }
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setComprando(false);
  };

  const responder = async (r: "vou" | "talvez" | "nao_vou") => {
    const { error } = await supabase.rpc("responder_convite_evento", { p_evento: ev.id, p_resposta: r });
    if (error) return setErro(mensagemDeErro(error));
    void carregar();
  };

  const abrirImpulso = async () => {
    const r = await buscarRegras();
    setPacotes(r?.pacotes ?? []);
    setFolha("impulsionar");
  };

  const impulsionar = async (p: Pacote) => {
    setErro("");
    try {
      const r = await pagarImpulso(ev.id, p.id);
      window.location.href = r.url;
    } catch (e) {
      setErro(mensagemDeErro(e));
      setFolha(null);
    }
  };

  const cancelar = async () => {
    if (!window.confirm("Cancelar o evento? Quem pagou recebe o reembolso e os ingressos deixam de valer.")) return;
    const { data, error } = await supabase.rpc("cancelar_evento_pessoa", { p_evento: ev.id });
    if (error) return setErro(mensagemDeErro(error));
    setAviso(Number(data) > 0 ? `Evento cancelado. ${data} compra(s) entram para reembolso.` : "Evento cancelado.");
    void carregar();
  };

  const ler = async (texto: string) => {
    const { data, error } = await supabase.rpc("validar_ingresso_anfitriao", { p_evento: ev.id, p_codigo: texto });
    if (error) return setLeitura({ ok: false, motivo: mensagemDeErro(error) });
    setLeitura(data as typeof leitura);
    navigator.vibrate?.(data && (data as { ok: boolean }).ok ? 120 : [80, 60, 80]);
    void carregar();
  };

  const link = `${URL_PUBLICA}/evento-pessoa/${ev.id}`;

  return (
    <article className="pb-28">
      <div className="relative">
        {ev.capa_url ? (
          <img src={ev.capa_url} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center bg-gradient-to-br from-[#6D28D9] to-[#DB2777] text-6xl">{tipo?.emoji}</div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
          <button onClick={() => navegar(-1)} className="rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex-1" />
          <button
            onClick={() => void compartilhar(ev.titulo, link).then((r) => setAviso(r === "copiado" ? "Link copiado." : "Link compartilhado."))}
            className="rounded-full bg-black/45 p-2 text-white backdrop-blur"
            aria-label="Compartilhar"
          >
            <IconeConvite className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="space-y-5 px-4 pt-4">
        {aviso && <p className="rounded-xl bg-destaque-suave px-4 py-3 text-sm text-destaque">{aviso}</p>}
        {encerrado && (
          <p className="rounded-xl bg-perigo/10 px-4 py-3 text-sm text-perigo">{ev.suspenso ? "Evento suspenso pela equipe RoVibes." : "Evento cancelado pelo anfitrião."}</p>
        )}

        <header>
          <p className="text-[13px] font-medium text-magenta">
            {tipo?.emoji} {tipo?.nome}
            {ev.impulso && <span className="ml-2 rounded-full bg-magenta/10 px-2 py-0.5 text-[11px]">Impulsionado</span>}
          </p>
          <h1 className="mt-0.5 text-[24px] font-semibold leading-tight">{ev.titulo}</h1>
          <Link to={ev.sou_anfitriao ? "/perfil" : `/p/${ev.anfitriao.usuario}`} className="mt-2 flex items-center gap-2">
            <Avatar nome={ev.anfitriao.nome} foto={ev.anfitriao.foto_url} tamanho="sm" />
            <span className="text-sm">
              Anfitrião: <strong>{ev.sou_anfitriao ? "você" : ev.anfitriao.nome}</strong>
            </span>
          </Link>
        </header>

        <ul className="cartao divide-y divide-borda text-sm">
          <li className="flex items-center gap-3 px-4 py-3">
            <CalendarDays className="h-4 w-4 shrink-0 text-suave" />
            <span>
              {dataEvento(ev.inicio)}
              {ev.fim && ` até ${new Date(ev.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
            </span>
          </li>
          <li className="flex items-start gap-3 px-4 py-3">
            <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
            <span className="min-w-0 flex-1">
              {ev.local_nome && <span className="block font-medium">{ev.local_nome}</span>}
              {ev.endereco_liberado ? (
                <span className="block">{[ev.endereco, ev.bairro].filter(Boolean).join(" · ") || "Endereço não informado"}</span>
              ) : (
                <span className="block text-suave">
                  {ev.bairro ? `${ev.bairro} · ` : ""}o endereço completo aparece para quem tem ingresso
                </span>
              )}
            </span>
            {ev.endereco_liberado && ponto && (
              <a href={`https://www.google.com/maps/dir/?api=1&destination=${ponto[0]},${ponto[1]}`} target="_blank" rel="noreferrer" className="botao h-8 px-2.5 text-[12px]">
                <Navigation className="h-3.5 w-3.5" />
                Rota
              </a>
            )}
          </li>
          <li className="flex items-center gap-3 px-4 py-3">
            <Users className="h-4 w-4 shrink-0 text-suave" />
            <span>
              {ev.confirmados} {ev.confirmados === 1 ? "confirmado" : "confirmados"} · {VISIBILIDADES_EVENTO.find((v) => v.valor === ev.visibilidade)?.nome}
            </span>
          </li>
        </ul>
        {ponto && (
          <div className="h-36 overflow-hidden rounded-xl border border-borda">
            <MapaBase centro={ponto} zoom={ev.endereco_liberado ? 16 : 14} className="h-full w-full">
              <PinMapa posicao={ponto} tamanho="grande" />
            </MapaBase>
          </div>
        )}

        {ev.descricao && <p className="whitespace-pre-line text-[15px] leading-relaxed">{ev.descricao}</p>}

        {/* Meus ingressos */}
        {validos.length > 0 && (
          <section>
            <h2 className="mb-2 font-semibold">Seus ingressos</h2>
            <ul className="space-y-2">
              {validos.map((i) => (
                <li key={i.id}>
                  <button
                    onClick={() => {
                      setIngressoAberto(i.codigo);
                      setFolha("ingresso");
                    }}
                    className="cartao flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado"
                  >
                    <Ticket className="h-5 w-5 text-magenta" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{i.cota ?? "Ingresso"}</span>
                      <span className="codigo block text-[12px] text-suave">
                        {i.codigo} · {i.situacao === "usado" ? "já usado" : i.preco > 0 ? reais(i.preco) : "grátis"}
                      </span>
                    </span>
                    <span className="text-[13px] font-semibold text-destaque">Mostrar QR</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Convite */}
        {!ev.sou_anfitriao && ev.meu_convite && !validos.length && !encerrado && (
          <section className="cartao p-4">
            <p className="font-semibold">{ev.anfitriao.nome.split(" ")[0]} convidou você</p>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {(["vou", "talvez", "nao_vou"] as const).map((r) => (
                <button key={r} onClick={() => void responder(r)} aria-pressed={ev.meu_convite === r} className={clsx("botao h-9 text-[13px]", ev.meu_convite === r && "border-marca text-destaque")}>
                  {ev.meu_convite === r && <Check className="h-3.5 w-3.5" />}
                  {r === "vou" ? "Vou" : r === "talvez" ? "Talvez" : "Não vou"}
                </button>
              ))}
            </div>
            {ev.cotas.some((c) => c.preco > 0) && <p className="mt-2 text-[12px] text-suave">Para garantir o lugar, compre o ingresso abaixo.</p>}
          </section>
        )}

        {/* Comprar */}
        {!ev.sou_anfitriao && !encerrado && (
          <section>
            <h2 className="mb-2 font-semibold">Ingressos</h2>
            {!ev.vendas_abertas ? (
              <p className="cartao px-4 py-3 text-sm text-suave">As vendas deste evento já encerraram.</p>
            ) : (
              <ul className="space-y-2">
                {ev.cotas.map((c) => {
                  const n = qtd[c.id] ?? 0;
                  const max = Math.min(c.disponiveis, ev.max_por_compra);
                  return (
                    <li key={c.id} className={clsx("cartao flex items-center gap-3 px-4 py-3", c.disponiveis === 0 && "opacity-60")}>
                      <span className="min-w-0 flex-1">
                        <span className="block font-medium">{c.nome}</span>
                        {c.descricao && <span className="block text-[12px] text-suave">{c.descricao}</span>}
                        <span className="codigo block text-sm text-destaque">{c.preco > 0 ? reais(c.preco) : "Grátis"}</span>
                        <span className="block text-[11px] text-suave">{c.disponiveis === 0 ? "Esgotado" : `${c.disponiveis} disponíveis`}</span>
                      </span>
                      {c.disponiveis > 0 && (
                        <span className="flex items-center gap-1">
                          <button className="botao h-8 w-8 px-0" disabled={n === 0} onClick={() => setQtd({ ...qtd, [c.id]: n - 1 })} aria-label="Menos">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="codigo w-6 text-center font-semibold">{n}</span>
                          <button className="botao h-8 w-8 px-0" disabled={n >= max || itens >= ev.max_por_compra} onClick={() => setQtd({ ...qtd, [c.id]: n + 1 })} aria-label="Mais">
                            <Plus className="h-4 w-4" />
                          </button>
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
            {ev.vendas_abertas && <p className="mt-2 text-[12px] text-suave">Pagamento pelo Mercado Pago (Pix ou cartão), direto para o anfitrião. Você pode desistir em até 7 dias da compra, antes do evento.</p>}
          </section>
        )}

        {/* Painel do anfitrião */}
        {ev.sou_anfitriao && ev.painel && (
          <section className="space-y-3">
            <h2 className="font-semibold">Seu evento</h2>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="cartao p-3">
                <p className="text-[11px] text-suave">Ingressos</p>
                <p className="codigo text-lg font-semibold">{ev.painel.vendidos}</p>
              </div>
              <div className="cartao p-3">
                <p className="text-[11px] text-suave">Arrecadado</p>
                <p className="codigo text-lg font-semibold">{reais(Number(ev.painel.arrecadado))}</p>
              </div>
              <div className="cartao p-3">
                <p className="text-[11px] text-suave">Você recebe</p>
                <p className="codigo text-lg font-semibold text-ok">{reais(Number(ev.painel.arrecadado) - Number(ev.painel.taxas))}</p>
              </div>
            </div>
            {!ev.painel.mp_conectado && Number(ev.painel.arrecadado) > 0 && (
              <p className="rounded-lg bg-alerta/10 px-3 py-2 text-[12px] text-alerta">Modo de teste: os pagamentos ainda não caem numa conta Mercado Pago sua.</p>
            )}
            {!encerrado && (
              <div className="grid grid-cols-2 gap-2">
                <button className="botao-principal h-11" onClick={() => setFolha("convidar")}>
                  <UserPlus className="h-4 w-4" />
                  Convidar amigos
                </button>
                <button className="botao h-11" onClick={() => void abrirImpulso()}>
                  <Rocket className="h-4 w-4 text-magenta" />
                  {ev.impulso ? "Impulsionar mais" : "Impulsionar"}
                </button>
                <button className="botao h-11" onClick={() => setFolha("portaria")}>
                  <ScanLine className="h-4 w-4" />
                  Conferir ingressos
                </button>
                <button className="botao h-11" onClick={() => setFolha("convidados")}>
                  <Users className="h-4 w-4" />
                  Convidados ({ev.painel.convidados.length})
                </button>
                <Link to={`/eventos/${ev.id}/editar`} className="botao h-11">
                  <Pencil className="h-4 w-4" />
                  Editar
                </Link>
                <button className="botao h-11 text-perigo" onClick={() => void cancelar()}>
                  <X className="h-4 w-4" />
                  Cancelar evento
                </button>
              </div>
            )}
            {ev.impulso && <p className="text-[12px] text-suave">Impulsionado até {dataEvento(ev.impulso.fim)}, para quem está a até {ev.impulso.raio_km} km.</p>}
          </section>
        )}

        {erro && <p className="rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
      </div>

      {!ev.sou_anfitriao && !encerrado && ev.vendas_abertas && itens > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl px-4 pb-3">
          <button className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg" disabled={comprando} onClick={() => void comprar()}>
            {comprando ? "Abrindo..." : total > 0 ? `Comprar ${itens} · ${reais(total)}` : `Confirmar presença (${itens})`}
          </button>
        </div>
      )}

      {folha === "ingresso" && ingressoAberto && (
        <Folha titulo="Seu ingresso" fechar={() => setFolha(null)}>
          <div className="flex flex-col items-center gap-3 py-2">
            <QrCode texto={ingressoAberto} tamanho={240} />
            <p className="codigo text-lg font-semibold tracking-widest">{ingressoAberto}</p>
            <p className="text-center text-sm text-suave">Mostre para o anfitrião na entrada. O ingresso é seu (nominal).</p>
          </div>
        </Folha>
      )}

      {folha === "convidar" && (
        <Folha titulo="Convidar amigos" fechar={() => setFolha(null)}>
          <EscolherPessoas
            jaNoRole={ev.painel?.convidados.map((c) => c.id) ?? []}
            textoBotao="Convidar"
            cancelar={() => setFolha(null)}
            confirmar={async (ids) => {
              const { data, error } = await supabase.rpc("convidar_evento_pessoa", { p_evento: ev.id, p_pessoas: ids });
              if (error) throw error;
              setFolha(null);
              setAviso(`${data} ${Number(data) === 1 ? "convite enviado" : "convites enviados"}. Eles veem nas notificações.`);
              void carregar();
            }}
          />
        </Folha>
      )}

      {folha === "convidados" && ev.painel && (
        <Folha titulo="Convidados" fechar={() => setFolha(null)}>
          {ev.painel.convidados.length === 0 ? (
            <p className="py-6 text-center text-sm text-suave">Nenhum convidado ainda.</p>
          ) : (
            <ul className="divide-y divide-borda">
              {ev.painel.convidados.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2.5">
                  <Avatar nome={c.nome} foto={c.foto_url} tamanho="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.nome}</span>
                    <span className="block text-[12px] text-suave">{c.ingressos > 0 ? `${c.ingressos} ingresso(s)` : "sem ingresso"}</span>
                  </span>
                  <span className={clsx("text-[12px] font-semibold", c.situacao === "vou" ? "text-ok" : c.situacao === "nao_vou" ? "text-perigo" : "text-suave")}>
                    {c.situacao === "vou" ? "Vai" : c.situacao === "nao_vou" ? "Não vai" : c.situacao === "talvez" ? "Talvez" : "Convidado"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Folha>
      )}

      {folha === "impulsionar" && (
        <Folha titulo="Impulsionar o evento" fechar={() => setFolha(null)}>
          <p className="mb-3 text-sm text-suave">O evento aparece no feed de mais pessoas perto do local, com o selo “Impulsionado”. O endereço continua escondido até a compra.</p>
          {pacotes.length === 0 ? (
            <p className="py-4 text-center text-sm text-suave">Nenhum pacote disponível agora.</p>
          ) : (
            <ul className="space-y-2">
              {pacotes.map((p) => (
                <li key={p.id}>
                  <button onClick={() => void impulsionar(p)} className="cartao flex w-full items-center gap-3 px-4 py-3 text-left hover:border-marca">
                    <Rocket className="h-5 w-5 shrink-0 text-magenta" />
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{p.nome}</span>
                      <span className="block text-[12px] text-suave">{p.descricao ?? `Até ${p.raio_km} km do local`}</span>
                    </span>
                    <span className="codigo font-semibold">{reais(p.preco)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-3 text-[11px] text-suave">Pagamento ao RoVibes pelo Mercado Pago. Não garante vendas. Não é reembolsado depois de iniciado.</p>
        </Folha>
      )}

      {folha === "portaria" && (
        <Folha
          titulo="Conferir ingressos"
          fechar={() => {
            setFolha(null);
            setLeitura(null);
          }}
        >
          <div className="overflow-hidden rounded-xl bg-black">
            <LeitorQr aoLer={(t) => void ler(t)} />
          </div>
          {leitura && (
            <div className={clsx("mt-3 flex items-center gap-3 rounded-xl px-4 py-3", leitura.ok ? "bg-ok/15" : "bg-perigo/10")}>
              {leitura.nome && <Avatar nome={leitura.nome} foto={leitura.foto_url} tamanho="lg" />}
              <span>
                <span className={clsx("block font-semibold", leitura.ok ? "text-ok" : "text-perigo")}>{leitura.ok ? "Pode entrar" : "Não liberado"}</span>
                {leitura.nome && <span className="block text-sm">{leitura.nome}</span>}
                <span className="block text-[13px] text-suave">{leitura.ok ? leitura.cota : leitura.motivo}</span>
              </span>
            </div>
          )}
          <p className="mt-3 text-center text-[12px] text-suave">
            {ev.painel?.usados ?? 0} de {ev.painel?.vendidos ?? 0} já entraram. Confira se a foto bate com a pessoa.
          </p>
        </Folha>
      )}
    </article>
  );
}
