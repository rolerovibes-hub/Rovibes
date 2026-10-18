import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Armchair, Bell, ChevronRight, Compass, Map, MessageCircle, Newspaper, ScanLine, UserRound, X } from "lucide-react";
import { LeitorQr } from "@/components/Qr";
import { supabase } from "@/lib/supabase";
import { codigoDaMesa, useAoVivo } from "@/lib/salao";
import { Marca } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";

const ABAS = [
  { para: "/", nome: "Descobrir", icone: Compass, fim: true },
  { para: "/mapa", nome: "Mapa", icone: Map },
  { para: "/feed", nome: "Feed", icone: Newspaper },
  { para: "/chats", nome: "Chats", icone: MessageCircle },
  { para: "/perfil", nome: "Perfil", icone: UserRound },
];

export function AppLayout() {
  const { carregando, sessao } = useSessao();
  const local = useLocation();
  const navegar = useNavigate();
  const [lendo, setLendo] = useState(false);
  const [mesaAberta, setMesaAberta] = useState<{ id: string; rotulo: string; lugar: string; aviso: string | null } | null>(null);
  const [versao, setVersao] = useState(0);
  useAoVivo("barra-mesa", { pedidos: mesaAberta ? `comanda_id=eq.${mesaAberta.id}` : undefined }, () => setVersao((v) => v + 1), !!mesaAberta);
  const usuario = sessao?.user.id;
  useEffect(() => {
    document.title = "RoVibes";
  }, []);

  // Comanda aberta em que a pessoa está (aviso no topo de todas as telas).
  useEffect(() => {
    if (!usuario) return;
    supabase
      .from("comanda_pessoas")
      .select("entrou_em, comanda:comandas(id, situacao, nome, mesa:mesas(numero), estabelecimento:estabelecimentos(nome), pedidos(modalidade, usuario_id, itens:pedido_itens(situacao)))")
      .eq("usuario_id", usuario)
      .order("entrou_em", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        type Linha = {
          comanda: {
            id: string;
            situacao: string;
            nome: string | null;
            mesa: { numero: string } | null;
            estabelecimento: { nome: string } | null;
            pedidos: { modalidade: string; usuario_id: string | null; itens: { situacao: string }[] }[];
          } | null;
        };
        const c = ((data ?? []) as unknown as Linha[]).map((x) => x.comanda).find((x) => x?.situacao === "aberta");
        const meus = (c?.pedidos ?? []).filter((p) => p.usuario_id === usuario);
        const aCaminho = meus.some((p) => p.itens.some((i) => i.situacao === "saiu"));
        const retirar = meus.some((p) => p.modalidade === "retirada" && p.itens.some((i) => i.situacao === "pronto"));
        setMesaAberta(
          c
            ? {
                id: c.id,
                rotulo: c.mesa ? `Mesa ${c.mesa.numero}` : c.nome ?? "comanda",
                lugar: c.estabelecimento?.nome ?? "",
                aviso: aCaminho ? "Seu pedido saiu para entrega" : retirar ? "Seu pedido está pronto para retirar" : null,
              }
            : null,
        );
      });
  }, [usuario, local.pathname, versao]);

  // O App é só para quem tem conta: sem login, vai para a tela de entrar e volta depois.
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to={`/entrar?voltar=${encodeURIComponent(local.pathname)}`} replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col border-borda sm:border-x">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-borda bg-fundo/95 px-4 backdrop-blur">
        <Marca />
        <div className="flex items-center gap-1">
          <button onClick={() => setLendo(true)} className="rounded-full p-2 text-suave hover:bg-elevado hover:text-texto" aria-label="Ler QR code da mesa">
            <ScanLine className="h-5 w-5" />
          </button>
          <button className="relative rounded-full p-2 text-suave hover:bg-elevado hover:text-texto" aria-label="Notificações">
            <Bell className="h-5 w-5" />
          </button>
        </div>
      </header>

      {mesaAberta && !local.pathname.startsWith("/comanda") && (
        <Link
          to={`/comanda/${mesaAberta.id}`}
          className={clsx("flex items-center gap-3 border-b px-4 py-2.5 text-sm", mesaAberta.aviso ? "border-magenta/40 bg-magenta/10" : "border-borda bg-destaque-suave")}
        >
          <Armchair className="h-4 w-4 text-destaque" />
          <span className="min-w-0 flex-1 truncate">
            {mesaAberta.aviso ? (
              <strong>{mesaAberta.aviso}</strong>
            ) : (
              <>
                Você está na <strong>{mesaAberta.rotulo}</strong> · {mesaAberta.lugar}
              </>
            )}
          </span>
          <span className="font-semibold text-destaque">Comanda</span>
          <ChevronRight className="h-4 w-4 text-destaque" />
        </Link>
      )}

      {lendo && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Ler QR code da mesa" onClick={() => setLendo(false)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-5 sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Ler QR code da mesa</h2>
              <button onClick={() => setLendo(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <LeitorQr
              aoLer={(t) => {
                setLendo(false);
                navegar(`/mesa/${codigoDaMesa(t)}`);
              }}
            />
            <p className="mt-3 text-center text-[13px] text-suave">Aponte para o QR code que está na mesa para pedir pelo cardápio.</p>
          </div>
        </div>
      )}

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
