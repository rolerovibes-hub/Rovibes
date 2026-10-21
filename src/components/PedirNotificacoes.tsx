import { useEffect, useState } from "react";
import { BellRing, Share, X } from "lucide-react";
import { IconeTaca } from "./Brindar";
import { adiarPergunta, ativarPush, estadoPush, EstadoPush, podePerguntar } from "@/lib/push";
import { mensagemDeErro } from "@/lib/supabase";

/** Cartão no feed pedindo para ligar as notificações (some por 7 dias com "Agora não"). */
export function PedirNotificacoes() {
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (!podePerguntar()) return;
    estadoPush()
      .then(setEstado)
      .catch(() => setEstado(null));
  }, []);

  if (estado !== "pendente" && estado !== "instalar") return null;

  const fechar = () => {
    adiarPergunta();
    setEstado(null);
  };

  const ativar = async () => {
    setOcupado(true);
    setAviso("");
    try {
      const r = await ativarPush();
      if (r === "ativo") {
        setEstado(null);
        return;
      }
      setAviso(r === "negado" ? "As notificações estão bloqueadas. Libere nas configurações do celular para o RoVibes." : "Não deu para ligar agora. Tente de novo pelas Configurações.");
    } catch (e) {
      setAviso(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section className="mx-4 mt-3 rounded-cartao border border-marca/30 bg-destaque-suave/60 p-4" aria-label="Ativar notificações">
      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-superficie">
          {estado === "instalar" ? <BellRing className="h-5 w-5 text-destaque" /> : <IconeTaca cheia className="h-5 w-5" />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Saiba na hora quando rolar algo</p>
          {estado === "instalar" ? (
            <p className="mt-0.5 text-[13px] text-suave">
              No iPhone, as notificações chegam com o RoVibes na Tela de Início: toque em <Share className="inline h-3.5 w-3.5" /> Compartilhar e depois em “Adicionar à Tela de
              Início”. Abra o RoVibes por lá e ative aqui.
            </p>
          ) : (
            <p className="mt-0.5 text-[13px] text-suave">Brindes, comentários, convites para rolês e eventos, mensagens e seu pedido pronto.</p>
          )}
          {aviso && <p className="mt-1.5 text-[13px] text-perigo">{aviso}</p>}
          {estado === "pendente" && (
            <div className="mt-3 flex gap-2">
              <button className="botao-principal h-9 px-4" disabled={ocupado} onClick={() => void ativar()}>
                {ocupado ? "Ativando..." : "Ativar notificações"}
              </button>
              <button className="botao h-9 px-3" onClick={fechar}>
                Agora não
              </button>
            </div>
          )}
        </div>
        <button className="-mr-1 -mt-1 rounded-full p-1.5 text-suave hover:bg-elevado" onClick={fechar} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      </div>
    </section>
  );
}

/** Aviso que aparece no topo quando chega uma notificação com o App aberto. */
export function AvisoNotificacao({ n, abrir, fechar }: { n: { titulo: string; texto: string; link: string }; abrir: () => void; fechar: () => void }) {
  useEffect(() => {
    const t = window.setTimeout(fechar, 6000);
    return () => window.clearTimeout(t);
  }, [n, fechar]);
  return (
    <button
      onClick={abrir}
      className="surgir fixed inset-x-3 top-[max(10px,env(safe-area-inset-top))] z-[85] mx-auto flex max-w-md items-center gap-3 rounded-2xl border border-borda bg-superficie/95 px-4 py-3 text-left shadow-xl backdrop-blur"
    >
      <IconeTaca cheia className="h-6 w-6 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold">{n.titulo}</span>
        {n.texto && <span className="block truncate text-[13px] text-suave">{n.texto}</span>}
      </span>
    </button>
  );
}
