import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import clsx from "clsx";
import { Bell, Compass, Map, MessageCircle, Newspaper, UserRound } from "lucide-react";
import { Marca } from "@/components/Marca";

const ABAS = [
  { para: "/", nome: "Descobrir", icone: Compass, fim: true },
  { para: "/mapa", nome: "Mapa", icone: Map },
  { para: "/feed", nome: "Feed", icone: Newspaper },
  { para: "/chats", nome: "Chats", icone: MessageCircle },
  { para: "/perfil", nome: "Perfil", icone: UserRound },
];

export function AppLayout() {
  useEffect(() => {
    document.title = "RoVibes";
  }, []);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col border-borda sm:border-x">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-fundo/95 px-4 backdrop-blur">
        <Marca />
        <button className="relative rounded-full p-2 text-suave hover:bg-elevado hover:text-texto" aria-label="Notificações">
          <Bell className="h-5 w-5" />
        </button>
      </header>

      <main className="flex-1 pb-24">
        <Outlet />
      </main>

      <nav
        aria-label="Navegação principal"
        className="pb-seguro fixed inset-x-0 bottom-0 z-30 mx-auto max-w-xl border-t border-borda bg-superficie sm:border-x"
      >
        <ul className="grid grid-cols-5">
          {ABAS.map(({ para, nome, icone: Icone, fim }) => (
            <li key={para}>
              <NavLink
                to={para}
                end={fim}
                className={({ isActive }) =>
                  clsx(
                    "flex flex-col items-center gap-1 py-2.5 text-[12px] transition-colors",
                    isActive ? "font-semibold text-destaque" : "text-suave hover:text-texto",
                  )
                }
              >
                <Icone className="h-[22px] w-[22px]" />
                {nome}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}

/** Estado vazio padrão das abas que entram em fases seguintes. */
export function EmBreve({ icone: Icone, titulo, texto }: { icone: typeof Bell; titulo: string; texto: string }) {
  return (
    <div className="px-6 py-20 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Icone className="h-6 w-6" />
      </span>
      <h1 className="mt-4 text-lg font-semibold">{titulo}</h1>
      <p className="mx-auto mt-1 max-w-xs text-sm text-suave">{texto}</p>
    </div>
  );
}
