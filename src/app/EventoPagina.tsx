import { useCallback, useEffect, useState } from "react";
import { IconeConvite } from "@/components/IconesRoVibes";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock, MapPin, Star, Store, Ticket } from "lucide-react";
import clsx from "clsx";
import { Avatar } from "@/components/Avatar";
import { alternarInteresse, InteresseEvento, interesseEvento, verEvento } from "@/lib/eventos";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { QrCode } from "@/components/Qr";
import { codigoLegivel, fimDoEvento, qrDoIngresso, ResumoIngresso, resumoIngressos } from "./carteira";
import { Carregando } from "@/components/Carregando";
import { buscarEvento, EventoResumo, quando } from "./dados";
import { ListasPresenca } from "@/components/ListasPresenca";
import { capturarRef, meuCodigoPromoter } from "@/lib/promoters";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { ComprarIngressos } from "./IngressosPagos";

export function EventoPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [evento, setEvento] = useState<EventoResumo | null | undefined>(undefined);
  const [compartilhar, setCompartilhar] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [aviso, setAviso] = useState("");
  // Evento com ingressos à venda (029): mostra "Comprar"; senão, o ingresso gratuito antigo.
  const [vendeIngressos, setVendeIngressos] = useState(true);
  const semIngressos = useCallback(() => setVendeIngressos(false), []);

  useEffect(() => {
    setEvento(undefined);
    buscarEvento(id).then(setEvento);
    capturarRef("evento", id);
    verEvento(id);
  }, [id]);

  useEffect(() => {
    if (evento) document.title = `${evento.nome} · RoVibes`;
    if (evento?.estabelecimento) void meuCodigoPromoter(evento.estabelecimento.id).then(setCodigo);
  }, [evento]);

  if (evento === undefined) return <Carregando />;
  if (!evento) {
    return (
      <div className="px-6 py-20 text-center">
        <CalendarDays className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-medium">Evento não encontrado</p>
        <Link to="/" className="botao mt-5">
          Voltar ao início
        </Link>
      </div>
    );
  }

  const cancelado = evento.situacao === "cancelado";
  const fim = evento.fim ? new Date(evento.fim).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }) : null;

  return (
    <article className="pb-6">
      <div className="relative">
        {evento.capa_url ? (
          <img src={evento.capa_url} alt="" className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-elevado text-suave">
            <CalendarDays className="h-8 w-8" />
          </div>
        )}
        <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/"))} className="absolute left-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setCompartilhar(true)} className="absolute right-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Compartilhar evento">
          <IconeConvite className="h-5 w-5" />
        </button>
      </div>
      {aviso && <p className="mx-4 mt-3 rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{aviso}</p>}
      {compartilhar && <CompartilharNoChat tipo="evento" id={evento.id} titulo={evento.nome} codigo={codigo} fechar={() => setCompartilhar(false)} enviado={setAviso} />}

      <div className="space-y-6 px-4 pt-4">
        <header>
          {cancelado && <p className="mb-1 text-sm font-semibold text-perigo">Evento cancelado</p>}
          {evento.categoria && <span className="mb-1.5 inline-block rounded-full bg-destaque-suave px-2.5 py-0.5 text-[12px] font-bold text-destaque">{evento.categoria}</span>}
          <h1 className="text-[22px] font-semibold leading-tight">{evento.nome}</h1>
          {evento.estabelecimento && (
            <Link to={`/lugar/${evento.estabelecimento.id}`} className="mt-1 inline-flex items-center gap-1.5 text-sm text-destaque">
              <Store className="h-4 w-4" />
              {evento.estabelecimento.nome}
              {evento.estabelecimento.bairro ? ` · ${evento.estabelecimento.bairro}` : ""}
            </Link>
          )}
        </header>

        <ul className="cartao divide-y divide-borda text-sm">
          <li className="flex items-center gap-3 px-4 py-3">
            <Clock className="h-4 w-4 text-destaque" />
            <span>
              {quando(evento.inicio)}
              {fim ? ` até ${fim}` : ""}
            </span>
          </li>
          {(evento.endereco || evento.local_nome) && (
            <li>
              <a
                href={
                  evento.latitude != null && evento.longitude != null
                    ? `https://www.google.com/maps/search/?api=1&query=${evento.latitude},${evento.longitude}`
                    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([evento.endereco, "Uberlândia"].filter(Boolean).join(", "))}`
                }
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-3 px-4 py-3"
              >
                <MapPin className="h-4 w-4 shrink-0 text-destaque" />
                <span className="min-w-0">
                  <span className="block">{evento.local_nome || evento.endereco}</span>
                  {evento.local_nome && evento.endereco && <span className="block text-[13px] text-suave">{evento.endereco}</span>}
                  <span className="block text-[12px] text-suave">Fora do estabelecimento · abrir no mapa</span>
                </span>
              </a>
            </li>
          )}
          {evento.entrada && (
            <li className="flex items-center gap-3 px-4 py-3">
              <Ticket className="h-4 w-4 text-destaque" />
              <span>{evento.entrada}</span>
            </li>
          )}
        </ul>

        {!cancelado && fimDoEvento(evento) > Date.now() && <Interesse evento={evento.id} />}

        {!cancelado && (vendeIngressos ? (
          <ComprarIngressos evento={evento.id} encerrado={fimDoEvento(evento) <= Date.now() || Date.parse(evento.inicio) <= Date.now()} semIngressos={semIngressos} />
        ) : (
          <IngressoDoEvento eventoId={evento.id} encerrado={fimDoEvento(evento) <= Date.now()} />
        ))}

        {!cancelado && evento.estabelecimento && fimDoEvento(evento) > Date.now() && <ListasPresenca estab={evento.estabelecimento.id} evento={evento.id} />}

        {evento.descricao && <p className="whitespace-pre-line text-[15px] leading-relaxed">{evento.descricao}</p>}
      </div>
    </article>
  );
}

/** "Tenho interesse" + amigos (gente que eu sigo) que também têm. Quem tem interesse é avisado se o evento mudar. */
function Interesse({ evento }: { evento: string }) {
  const [dados, setDados] = useState<InteresseEvento | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    void interesseEvento(evento).then(setDados);
  }, [evento]);

  if (!dados) return null; // banco sem a atualização 045

  const alternar = async () => {
    setOcupado(true);
    setErro("");
    const antes = dados;
    setDados({ ...dados, eu: !dados.eu, total: dados.total + (dados.eu ? -1 : 1) });
    try {
      navigator.vibrate?.(10);
    } catch {
      /* sem vibração */
    }
    try {
      await alternarInteresse(evento);
      setDados(await interesseEvento(evento));
    } catch (e) {
      setDados(antes);
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const nomes = dados.amigos.map((a) => a.nome.split(" ")[0]);
  const outros = dados.amigos_total - nomes.slice(0, 2).length;
  return (
    <section className="space-y-2">
      <button
        onClick={() => void alternar()}
        disabled={ocupado}
        aria-pressed={dados.eu}
        className={clsx("flex h-11 w-full items-center justify-center gap-2 rounded-lg border text-[15px] font-semibold transition-colors", dados.eu ? "border-marca bg-destaque-suave text-destaque" : "border-borda hover:bg-elevado")}
      >
        <Star className={clsx("h-[18px] w-[18px]", dados.eu && "fill-current")} />
        {dados.eu ? "Você tem interesse" : "Tenho interesse"}
        {dados.total > 0 && <span className="text-[13px] font-medium text-suave">· {dados.total}</span>}
      </button>
      {dados.eu && <p className="text-center text-[12px] text-suave">Se a data, o horário ou o local mudarem, você recebe um aviso.</p>}
      {dados.amigos_total > 0 && (
        <div className="flex items-center gap-2.5 rounded-lg bg-destaque-suave/60 px-3 py-2">
          <span className="flex">
            {dados.amigos.slice(0, 3).map((a, i) => (
              <span key={a.id} className={clsx("rounded-full ring-2 ring-fundo", i > 0 && "-ml-2")}>
                <Avatar nome={a.nome} foto={a.foto_url} tamanho="sm" />
              </span>
            ))}
          </span>
          <p className="text-[13px]">
            <strong>{nomes.slice(0, 2).join(" e ")}</strong>
            {outros > 0 ? ` e mais ${outros}` : ""} {dados.amigos_total === 1 ? "tem" : "têm"} interesse
          </p>
        </div>
      )}
      {erro && <p className="text-center text-sm text-perigo">{erro}</p>}
    </section>
  );
}

/** Ingresso gratuito pelo App: pegar, mostrar o QR na entrada e devolver. */
function IngressoDoEvento({ eventoId, encerrado }: { eventoId: string; encerrado: boolean }) {
  const [resumo, setResumo] = useState<ResumoIngresso | null>(null);
  const [codigo, setCodigo] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const r = (await resumoIngressos([eventoId])).get(eventoId) ?? null;
    setResumo(r);
    if (r?.meu_ingresso) {
      const { data } = await supabase.from("ingressos").select("codigo").eq("id", r.meu_ingresso).maybeSingle();
      setCodigo((data as { codigo: string } | null)?.codigo ?? null);
    } else setCodigo(null);
  }, [eventoId]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!resumo || resumo.vagas == null) return null;

  const chamar = async (rpc: "pegar_ingresso" | "devolver_ingresso", args: Record<string, string>) => {
    setOcupado(true);
    setErro("");
    const { error } = await supabase.rpc(rpc, args);
    setOcupado(false);
    if (error) setErro(mensagemDeErro(error));
    await carregar();
  };

  if (resumo.meu_ingresso && codigo) {
    const usado = resumo.meu_situacao === "usado";
    return (
      <section className="cartao p-5 text-center">
        <p className="flex items-center justify-center gap-2 font-semibold">
          <Ticket className="h-4 w-4 text-destaque" />
          {usado ? "Entrada confirmada" : "Seu ingresso"}
        </p>
        {usado ? (
          <p className="mt-1 text-sm text-suave">Este ingresso já foi usado na entrada.</p>
        ) : (
          <>
            <p className="mt-1 text-sm text-suave">Mostre este QR code na entrada.</p>
            <div className="mt-4">
              <QrCode texto={qrDoIngresso(codigo)} />
            </div>
            <p className="codigo mt-3 text-base tracking-widest">{codigoLegivel(codigo)}</p>
            {!encerrado && (
              <button
                className="mt-4 text-[13px] text-suave underline underline-offset-2"
                disabled={ocupado}
                onClick={() => window.confirm("Devolver o ingresso? A vaga fica livre para outra pessoa.") && void chamar("devolver_ingresso", { p_ingresso: resumo.meu_ingresso! })}
              >
                Não vou mais, devolver ingresso
              </button>
            )}
          </>
        )}
        {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
      </section>
    );
  }

  if (encerrado) return null;
  const restam = resumo.vagas - resumo.pegos;
  return (
    <div>
      <button className="botao-principal h-11 w-full" disabled={restam <= 0 || ocupado} onClick={() => void chamar("pegar_ingresso", { p_evento: eventoId })}>
        <Ticket className="h-4 w-4" />
        {restam <= 0 ? "Ingressos esgotados" : ocupado ? "Gerando ingresso..." : "Pegar ingresso grátis"}
      </button>
      {restam > 0 && restam <= 30 && <p className="mt-2 text-center text-[13px] text-suave">Restam {restam} {restam === 1 ? "ingresso" : "ingressos"}</p>}
      {erro && <p className="mt-2 text-center text-sm text-perigo">{erro}</p>}
    </div>
  );
}
