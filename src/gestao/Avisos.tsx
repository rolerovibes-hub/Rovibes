import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import clsx from "clsx";
import { AlarmClock, Bell, BellRing, MessageSquare, Siren, UserRound, Inbox } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { tempoCurto } from "@/lib/gestao";

interface Aviso {
  id: number;
  tipo: "atribuida" | "critica" | "prazo" | "resposta" | "pedido";
  texto: string;
  numero: number | null;
  lido: boolean;
  criado_em: string;
}
const TIPO: Record<Aviso["tipo"], { nome: string; icone: typeof Bell; cor: string }> = {
  atribuida: { nome: "Passada para você", icone: UserRound, cor: "text-destaque" },
  critica: { nome: "Situação crítica", icone: Siren, cor: "text-perigo" },
  prazo: { nome: "Prazo vencido", icone: AlarmClock, cor: "text-alerta" },
  resposta: { nome: "Estabelecimento respondeu", icone: MessageSquare, cor: "text-azul" },
  pedido: { nome: "Novo pedido de ajuda", icone: Inbox, cor: "text-azul" },
};

const permissaoNavegador = () => (typeof Notification === "undefined" ? "indisponivel" : Notification.permission);

/** Sino da Gestão: avisos em tempo real e, com permissão, também no navegador. */
export function SinoAvisos({ usuario }: { usuario: string }) {
  const navegar = useNavigate();
  const [lista, setLista] = useState<Aviso[]>([]);
  const [aberto, setAberto] = useState(false);
  const [permissao, setPermissao] = useState(permissaoNavegador());
  const caixa = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc("meus_avisos_gestao", { p_limite: 30 });
    setLista((data ?? []) as Aviso[]);
  }, []);

  useEffect(() => {
    void carregar();
    const canal = supabase
      .channel(`gestao-avisos-${usuario}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "gestao_avisos", filter: `usuario_id=eq.${usuario}` }, (p) => {
        void carregar();
        const novo = p.new as { tipo: Aviso["tipo"]; texto: string };
        if (permissaoNavegador() === "granted" && document.visibilityState !== "visible") {
          try {
            new Notification(TIPO[novo.tipo]?.nome ?? "Gestão RoVibes", { body: novo.texto, tag: `gestao-${novo.tipo}-${novo.texto}` });
          } catch {
            /* navegador sem suporte */
          }
        }
      })
      .subscribe();
    // Reserva: se o tempo real cair, atualiza a cada minuto.
    const t = window.setInterval(() => void carregar(), 60000);
    return () => {
      window.clearInterval(t);
      void supabase.removeChannel(canal);
    };
  }, [carregar, usuario]);

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => caixa.current && !caixa.current.contains(e.target as Node) && setAberto(false);
    document.addEventListener("mousedown", fora);
    return () => document.removeEventListener("mousedown", fora);
  }, [aberto]);

  const naoLidos = lista.filter((a) => !a.lido).length;
  useEffect(() => {
    document.title = naoLidos ? `(${naoLidos}) Gestão RoVibes` : "Gestão RoVibes";
  }, [naoLidos]);

  const abrir = async (a: Aviso) => {
    setAberto(false);
    if (!a.lido) await supabase.rpc("ler_avisos_gestao", { p_id: a.id });
    void carregar();
    if (a.numero) navegar(`/gestao/situacao/${a.numero}`);
  };

  return (
    <div className="relative" ref={caixa}>
      <button onClick={() => setAberto(!aberto)} className="botao relative h-9 w-9 px-0" aria-label="Avisos" title="Avisos">
        {naoLidos ? <BellRing className="h-4 w-4" /> : <Bell className="h-4 w-4" />}
        {naoLidos > 0 && <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-perigo px-1 text-center text-[10.5px] font-bold leading-[18px] text-white">{naoLidos > 99 ? "99+" : naoLidos}</span>}
      </button>
      {aberto && (
        <div className="cartao absolute right-0 top-11 z-40 w-[min(92vw,360px)] overflow-hidden shadow-xl">
          <div className="flex items-center justify-between border-b border-borda px-4 py-2.5">
            <span className="font-semibold">Avisos</span>
            {naoLidos > 0 && (
              <button className="text-[12px] text-suave hover:text-texto" onClick={() => void supabase.rpc("ler_avisos_gestao", { p_id: null }).then(() => carregar())}>
                Marcar como lidos
              </button>
            )}
          </div>
          {permissao === "default" && (
            <button
              className="block w-full border-b border-borda bg-marca/10 px-4 py-2 text-left text-[13px] text-destaque"
              onClick={() => void Notification.requestPermission().then((r) => setPermissao(r))}
            >
              Avisar também no navegador
            </button>
          )}
          {lista.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-suave">Nenhum aviso.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-borda overflow-y-auto">
              {lista.map((a) => {
                const t = TIPO[a.tipo] ?? TIPO.atribuida;
                return (
                  <li key={a.id}>
                    <button onClick={() => void abrir(a)} className={clsx("grid w-full grid-cols-[20px_1fr] gap-2.5 px-4 py-2.5 text-left hover:bg-elevado", a.lido && "opacity-55")}>
                      <t.icone className={clsx("mt-0.5 h-4 w-4", t.cor)} />
                      <span className="min-w-0">
                        <span className="flex items-center gap-2 text-[12px]">
                          <span className={clsx("font-semibold", t.cor)}>{t.nome}</span>
                          <span className="text-suave">{tempoCurto(a.criado_em)}</span>
                          {!a.lido && <span className="ml-auto h-2 w-2 rounded-full bg-marca" />}
                        </span>
                        <span className="block truncate text-[13px]">{a.texto}</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
