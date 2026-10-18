import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bell, Briefcase, ChevronRight, LayoutGrid, LogOut, MessageCircle, QrCode, ReceiptText, ScanLine, Settings2, Store, Wallet, X } from "lucide-react";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { useAcessoRapido } from "./estadoAcesso";

/** Logo "RoV" do menu flutuante. */
export function LogoRov({ className }: { className?: string }) {
  return (
    <span className={clsx("bg-gradient-to-br from-[#8B5CF6] to-[#EC4899] bg-clip-text font-semibold italic tracking-tight text-transparent", className)}>RoV</span>
  );
}

function Selo({ n }: { n: number }) {
  if (!n) return null;
  return (
    <span className="absolute right-2.5 top-2.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#F43F5E] px-1 text-[11px] font-semibold text-white">{n > 9 ? "9+" : n}</span>
  );
}

/** Menu flutuante: recolhido é só a logo, discreta; aberto mostra os atalhos. */
export function MenuFlutuante() {
  const { mesa, naoLidas } = useAcessoRapido();
  const [aberto, setAberto] = useState(false);
  const [outros, setOutros] = useState(false);
  const navegar = useNavigate();
  const local = useLocation();

  useEffect(() => setAberto(false), [local.pathname]);

  const ir = (para: string) => {
    setAberto(false);
    navegar(para);
  };

  const atalhos = [
    { nome: "QR Code", sub: "Retiradas", icone: QrCode, cor: "text-[#8B5CF6]", selo: mesa?.prontos ?? 0, acao: () => ir("/retirada") },
    { nome: "Chat", sub: "Conversas", icone: MessageCircle, cor: "text-[#60A5FA]", selo: 0, acao: () => ir("/chats") },
    { nome: "Carteira", sub: "Pagamentos", icone: Wallet, cor: "text-[#A78BFA]", selo: 0, acao: () => ir("/carteira") },
    { nome: "Notificações", sub: "Novidades", icone: Bell, cor: "text-[#A78BFA]", selo: naoLidas, acao: () => ir("/notificacoes") },
    { nome: "Outros", sub: "Mais opções", icone: LayoutGrid, cor: "text-[#A78BFA]", selo: 0, acao: () => { setAberto(false); setOutros(true); } },
  ];
  const total = (mesa?.prontos ?? 0) + naoLidas;

  return (
    <>
      {aberto && <div className="fixed inset-0 z-[45] bg-black/50 backdrop-blur-[2px]" onClick={() => setAberto(false)} />}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[46] mx-auto flex max-w-xl justify-end px-4">
        {aberto ? (
          <div className="pointer-events-auto w-full max-w-[340px] rounded-[22px] border border-borda bg-superficie/95 p-4 shadow-2xl backdrop-blur" role="dialog" aria-label="Acesso rápido">
            <p className="mb-3 px-1 font-semibold">Acesso rápido</p>
            <div className="grid grid-cols-2 gap-2.5">
              {atalhos.map((a) => (
                <button key={a.nome} onClick={a.acao} className="relative flex flex-col items-start gap-2 rounded-2xl border border-borda bg-fundo/70 p-3.5 text-left hover:bg-elevado">
                  <a.icone className={clsx("h-7 w-7", a.cor)} strokeWidth={1.6} />
                  <span>
                    <span className="block text-[15px] font-medium">{a.nome}</span>
                    <span className="block text-[12px] text-suave">{a.sub}</span>
                  </span>
                  <Selo n={a.selo} />
                </button>
              ))}
            </div>
            <div className="mt-3 flex justify-center border-t border-borda pt-3">
              <button onClick={() => setAberto(false)} className="flex h-12 w-12 items-center justify-center rounded-full border-2 border-[#8B5CF6]/70 bg-fundo" aria-label="Fechar acesso rápido">
                <LogoRov className="text-[17px]" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setAberto(true)}
            className="pointer-events-auto relative flex h-12 w-12 items-center justify-center rounded-full border border-borda bg-superficie/60 opacity-75 shadow-md backdrop-blur transition-opacity hover:opacity-100"
            aria-label="Abrir acesso rápido"
          >
            <LogoRov className="text-[16px]" />
            {total > 0 && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-fundo bg-[#F43F5E]" />}
          </button>
        )}
      </div>
      {outros && <MenuMais fechar={() => setOutros(false)} />}
    </>
  );
}

/** "Mais opções": usado no ⋯ do topo e no atalho Outros. */
export function MenuMais({ fechar }: { fechar: () => void }) {
  const { mesa, naoLidas, setLendo, equipe } = useAcessoRapido();
  const { sair } = useSessao();
  const navegar = useNavigate();
  const linha = "flex w-full items-center gap-3 px-4 py-3 text-left text-[15px] hover:bg-elevado";

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Mais opções" onClick={fechar}>
      <div className="max-h-[85vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-semibold">Mais opções</p>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="divide-y divide-borda border-y border-borda">
          <button
            className={linha}
            onClick={() => {
              fechar();
              setLendo(true);
            }}
          >
            <ScanLine className="h-5 w-5 text-destaque" />
            <span className="flex-1">Ler QR code da mesa</span>
          </button>
          {mesa && (
            <Link to={`/comanda/${mesa.id}`} onClick={fechar} className={linha}>
              <ReceiptText className="h-5 w-5 text-destaque" />
              <span className="flex-1">Minha comanda · {mesa.rotulo}</span>
              <ChevronRight className="h-4 w-4 text-suave" />
            </Link>
          )}
          <Link to="/notificacoes" onClick={fechar} className={linha}>
            <Bell className="h-5 w-5 text-destaque" />
            <span className="flex-1">Notificações</span>
            {naoLidas > 0 && <span className="rounded-full bg-[#F43F5E] px-2 text-[12px] font-semibold text-white">{naoLidas}</span>}
          </Link>
          <Link to="/carteira" onClick={fechar} className={linha}>
            <Wallet className="h-5 w-5 text-destaque" />
            <span className="flex-1">Carteira</span>
          </Link>
          {equipe && (
            <Link to="/job" onClick={fechar} className={linha}>
              <Briefcase className="h-5 w-5 text-destaque" />
              <span className="flex-1">Modo trabalho (RoVibes Job)</span>
            </Link>
          )}
          <Link to="/business" onClick={fechar} className={linha}>
            <Store className="h-5 w-5 text-destaque" />
            <span className="flex-1">RoVibes Business</span>
          </Link>
          <Link to="/perfil" onClick={fechar} className={linha}>
            <Settings2 className="h-5 w-5 text-destaque" />
            <span className="flex-1">Meu perfil</span>
          </Link>
        </div>
        <div className="px-4 py-4">
          <p className="rotulo mb-2">Tema</p>
          <SeletorTema />
        </div>
        <button
          className={clsx(linha, "border-t border-borda text-perigo")}
          onClick={async () => {
            await sair();
            navegar("/entrar");
          }}
        >
          <LogOut className="h-5 w-5" />
          Sair
        </button>
      </div>
    </div>
  );
}
