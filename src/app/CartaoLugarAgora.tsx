import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, Navigation, PartyPopper, Store, X } from "lucide-react";
import { abertoAgora, resumoHorario } from "@/lib/horarios";
import { Amigos, useAgora } from "@/lib/agora";
import { km, Lugar, nomesVibes } from "./dados";
import { AmigosAqui, ResumoMovimento } from "./AgoraLugar";

const hora = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }).replace(":00", "h").replace(":", "h");

/**
 * Cartão do lugar selecionado no mapa: o que ajuda a decidir sem abrir o perfil
 * (situação agora, música, amigos lá, evento de hoje) e as ações Marcar rolê / Ver lugar / Como chegar.
 */
export function CartaoLugarAgora({
  lugar,
  distanciaKm,
  amigos,
  fechar,
  comoChegar,
}: {
  lugar: Lugar;
  distanciaKm: number | null;
  amigos?: Amigos;
  fechar: () => void;
  comoChegar: () => void;
}) {
  const navegar = useNavigate();
  const { agora } = useAgora(lugar.id);
  const aberto = abertoAgora(lugar.horarios);
  const evento = agora?.hoje[0];
  const musica = agora?.musica_agora ? `Tocando: ${agora.musica_agora.texto}` : agora?.musica_prevista.length ? agora.musica_prevista.slice(0, 2).join(" / ") : null;
  const img = lugar.capa_url;
  const quem = amigos ?? agora?.amigos;
  const temAmigos = !!quem && (quem.identificados > 0 || quem.anonimos > 0);

  return (
    <div className="cartao folha overflow-hidden shadow-lg">
      <div className="flex gap-3 p-3.5">
        <Link to={`/lugar/${lugar.id}`} className="shrink-0">
          {img ? (
            <img src={img} alt="" className="h-[72px] w-[72px] rounded-xl object-cover" />
          ) : lugar.logo_url ? (
            <img src={lugar.logo_url} alt="" className="h-[72px] w-[72px] rounded-xl object-cover" />
          ) : (
            <span className="flex h-[72px] w-[72px] items-center justify-center rounded-xl bg-elevado text-suave">
              <Store className="h-6 w-6" />
            </span>
          )}
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <Link to={`/lugar/${lugar.id}`} className="min-w-0 flex-1">
              <h2 className="truncate font-semibold">{lugar.nome}</h2>
              <p className="truncate text-[13px] text-suave">
                {[lugar.categoria?.nome, nomesVibes(lugar)[0], distanciaKm != null ? km(distanciaKm) : lugar.bairro].filter(Boolean).join(" · ")}
              </p>
            </Link>
            <button onClick={fechar} className="-mr-1 -mt-1 rounded-full p-1.5 text-suave hover:bg-elevado" aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          </div>
          {lugar.horarios.length > 0 && <p className={clsx("mt-0.5 text-[13px]", aberto ? "font-medium text-ok" : "text-suave")}>{resumoHorario(lugar.horarios)}</p>}
          {agora && (
            <p className="mt-0.5 truncate text-[13px]">
              <ResumoMovimento agora={agora} />
              {musica && <span className="text-suave"> · {musica}</span>}
            </p>
          )}
        </div>
      </div>

      {(!!evento || temAmigos) && (
        <div className="space-y-2 border-t border-borda px-3.5 py-2.5">
          {evento && (
            <Link to={`/evento/${evento.id}`} className="flex items-center gap-2 text-[13px]">
              <CalendarDays className="h-4 w-4 shrink-0 text-magenta" />
              <span className="truncate">
                <span className="font-medium">{evento.nome}</span>
                <span className="text-suave"> · {Date.parse(evento.inicio) < Date.now() ? "rolando agora" : `hoje, ${hora(evento.inicio)}`}</span>
              </span>
            </Link>
          )}
          <AmigosAqui amigos={quem} compacto />
        </div>
      )}

      <div className="flex gap-2 border-t border-borda p-3">
        <button onClick={() => navegar(`/lugar/${lugar.id}/role`)} className="botao-principal h-10 flex-1 rounded-full">
          <PartyPopper className="h-4 w-4" />
          Marcar rolê
        </button>
        <Link to={`/lugar/${lugar.id}`} className="botao h-10 rounded-full px-4">
          Ver lugar
        </Link>
        <button onClick={comoChegar} className="botao h-10 w-10 rounded-full px-0" aria-label="Como chegar">
          <Navigation className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
