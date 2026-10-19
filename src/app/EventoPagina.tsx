import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock, Store, Ticket } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { QrCode } from "@/components/Qr";
import { codigoLegivel, fimDoEvento, qrDoIngresso, ResumoIngresso, resumoIngressos } from "./carteira";
import { Carregando } from "@/components/Carregando";
import { buscarEvento, EventoResumo, quando } from "./dados";
import { ListasPresenca } from "@/components/ListasPresenca";
import { capturarRef } from "@/lib/promoters";

export function EventoPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [evento, setEvento] = useState<EventoResumo | null | undefined>(undefined);

  useEffect(() => {
    setEvento(undefined);
    buscarEvento(id).then(setEvento);
    capturarRef("evento", id);
  }, [id]);

  useEffect(() => {
    if (evento) document.title = `${evento.nome} · RoVibes`;
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
        <button onClick={() => navegar(-1)} className="absolute left-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-6 px-4 pt-4">
        <header>
          {cancelado && <p className="mb-1 text-sm font-semibold text-perigo">Evento cancelado</p>}
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
          {evento.entrada && (
            <li className="flex items-center gap-3 px-4 py-3">
              <Ticket className="h-4 w-4 text-destaque" />
              <span>{evento.entrada}</span>
            </li>
          )}
        </ul>

        {!cancelado && <IngressoDoEvento eventoId={evento.id} encerrado={fimDoEvento(evento) <= Date.now()} />}

        {!cancelado && evento.estabelecimento && fimDoEvento(evento) > Date.now() && <ListasPresenca estab={evento.estabelecimento.id} evento={evento.id} />}

        {evento.descricao && <p className="whitespace-pre-line text-[15px] leading-relaxed">{evento.descricao}</p>}
      </div>
    </article>
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
