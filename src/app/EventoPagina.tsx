import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Clock, Store, Ticket, UserCheck } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { buscarEvento, EventoResumo, quando } from "./dados";

export function EventoPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [evento, setEvento] = useState<EventoResumo | null | undefined>(undefined);

  useEffect(() => {
    setEvento(undefined);
    buscarEvento(id).then(setEvento);
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
          Voltar ao Descobrir
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

        <button className="botao-principal h-11 w-full" disabled title="Chega na fase 3">
          <UserCheck className="h-4 w-4" />
          Confirmar presença
        </button>

        {evento.descricao && <p className="whitespace-pre-line text-[15px] leading-relaxed">{evento.descricao}</p>}
      </div>
    </article>
  );
}
