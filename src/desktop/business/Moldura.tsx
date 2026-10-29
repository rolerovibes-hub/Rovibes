import { ReactNode, useEffect, useState } from "react";
import clsx from "clsx";
import { LogOut, Printer, Settings, Wifi, WifiOff } from "lucide-react";
import { useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { Estacao, NOME_FUNCAO } from "../estacao";

/** Barra de cima (título e ações) e barra de estado de baixo, comuns às telas do app de computador. */
export function Moldura({
  titulo,
  extra,
  estacao,
  configurar,
  escuro,
  atalhos,
  children,
}: {
  titulo: string;
  extra?: ReactNode;
  estacao: Estacao;
  configurar?: () => void;
  escuro?: boolean;
  atalhos?: [string, string][];
  children: ReactNode;
}) {
  const { perfil, sair } = useSessao();
  const { atual } = useBusiness();
  const online = useOnline();
  return (
    <div className={clsx("flex h-screen flex-col overflow-hidden bg-fundo text-texto", escuro && "dark")}>
      <header className="flex h-14 shrink-0 items-center gap-3 border-b border-borda bg-superficie px-5">
        <h1 className="text-[17px] font-semibold">{titulo}</h1>
        {extra}
        <div className="ml-auto flex items-center gap-2">
          {configurar && (
            <button className="botao h-9 w-9 px-0" onClick={configurar} title="Configurar este computador" aria-label="Configurar este computador">
              <Settings className="h-4 w-4" />
            </button>
          )}
          <button className="botao h-9 px-3 text-[13px]" onClick={() => void sair()} title="Trocar usuário (Ctrl+U)">
            <LogOut className="h-4 w-4" />
            {perfil?.nome?.split(" ")[0] ?? "Sair"}
          </button>
        </div>
      </header>
      <main className="min-h-0 flex-1">{children}</main>
      {atalhos && (
        <div className="flex shrink-0 gap-4 border-t border-borda bg-superficie px-4 py-1.5 text-[12px] text-suave">
          {atalhos.map(([k, t]) => (
            <span key={k} className="inline-flex items-center gap-1.5">
              <kbd className="rounded border border-borda bg-fundo px-1.5 font-sans text-[11px]">{k}</kbd>
              {t}
            </span>
          ))}
        </div>
      )}
      <footer className="flex h-7 shrink-0 items-center gap-5 border-t border-borda bg-elevado px-4 text-[11.5px] text-suave">
        <span className={clsx("inline-flex items-center gap-1.5", online ? "text-ok" : "text-perigo")}>
          {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
          {online ? "Online" : "Sem internet"}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Printer className="h-3.5 w-3.5" />
          {estacao.impressora ?? "Sem impressora"}
        </span>
        <span className="ml-auto">
          {atual?.estabelecimento.nome} · {estacao.nome || NOME_FUNCAO[estacao.funcao]}
        </span>
      </footer>
    </div>
  );
}

function useOnline() {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const a = () => setOnline(true);
    const b = () => setOnline(false);
    window.addEventListener("online", a);
    window.addEventListener("offline", b);
    return () => {
      window.removeEventListener("online", a);
      window.removeEventListener("offline", b);
    };
  }, []);
  return online;
}

/** Atalhos de teclado da tela (ignora quando a pessoa está digitando, exceto teclas F e Ctrl). */
export function useAtalhos(mapa: Record<string, () => void>, ativo = true) {
  useEffect(() => {
    if (!ativo) return;
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement | null;
      const digitando = !!alvo && (alvo.tagName === "INPUT" || alvo.tagName === "TEXTAREA" || alvo.tagName === "SELECT" || alvo.isContentEditable);
      const nome = `${e.ctrlKey ? "Ctrl+" : ""}${e.key.length === 1 ? e.key.toUpperCase() : e.key}`;
      const especial = /^F\d+$/.test(e.key) || e.ctrlKey || e.key === "Escape";
      if (digitando && !especial) return;
      const f = mapa[nome];
      if (f) {
        e.preventDefault();
        f();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [mapa, ativo]);
}
