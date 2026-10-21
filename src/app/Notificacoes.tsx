import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, BadgePercent, Bell, CalendarDays, Newspaper, Ticket, Truck, Megaphone, PartyPopper, UserPlus, Wine } from "lucide-react";
import { tempoAtras } from "./conteudo";
import { useAcessoRapido } from "./estadoAcesso";
import { Notificacao } from "./dadosNotificacoes";
import { PedirNotificacoes } from "@/components/PedirNotificacoes";

const ICONE: Record<Notificacao["tipo"], typeof Bell> = {
  pedido: Truck,
  cupom: BadgePercent,
  ingresso: Ticket,
  evento: CalendarDays,
  publicacao: Newspaper,
  promoter: Megaphone,
  brinde: Wine,
  seguidor: UserPlus,
  role: PartyPopper,
};

export function Notificacoes() {
  const { notificacoes, marcarLidas, visto } = useAcessoRapido();
  const navegar = useNavigate();
  const [vistoAntes] = useState(visto);

  useEffect(() => {
    document.title = "Notificações · RoVibes";
    const t = window.setTimeout(marcarLidas, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-2 pt-3">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Notificações</h1>
      </div>
      {notificacoes.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
            <Bell className="h-6 w-6" />
          </span>
          <p className="mt-4 font-semibold">Nada novo por aqui</p>
          <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Avisos de pedidos, cupons, ingressos e novidades dos lugares que você segue aparecem aqui.</p>
        </div>
      ) : (
        <ul className="mt-2 divide-y divide-borda border-y border-borda">
          {notificacoes.map((n) => {
            const Icone = ICONE[n.tipo];
            const nova = n.agora || n.quando > vistoAntes;
            return (
              <li key={n.id}>
                <Link to={n.link} className={clsx("flex items-start gap-3 px-4 py-3.5 hover:bg-elevado", nova && "bg-destaque-suave/50")}>
                  <span className={clsx("mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-full", n.tipo === "pedido" ? "bg-magenta/15 text-magenta" : "bg-destaque-suave text-destaque")}>
                    <Icone className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[15px] font-medium">{n.titulo}</span>
                    <span className="block text-[13px] text-suave">{n.texto}</span>
                  </span>
                  <span className="shrink-0 text-[12px] text-suave">{n.agora ? "agora" : tempoAtras(n.quando)}</span>
                  {nova && <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-magenta" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <PedirNotificacoes />
    </div>
  );
}
