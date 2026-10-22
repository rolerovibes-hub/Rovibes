import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronsDown } from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { FolhaComentarios } from "@/components/Comentarios";
import { QuemBrindou } from "@/components/QuemBrindou";
import { alternarCurtida } from "./conteudo";
import { Navegacao } from "./Navegacao";
import { Corte, FolhaTrilha, Video } from "./VibeCut";

/**
 * Vídeos do Feed em tela cheia, no jeito do VibeCut: rolar para cima vai para o próximo,
 * para baixo volta um. No primeiro vídeo, puxar para baixo (ou a seta) volta para o Feed.
 */
export function VideosEmSequencia({
  lista: inicial,
  inicio,
  fechar,
  aoMudar,
}: {
  lista: Corte[];
  inicio: number;
  fechar: () => void;
  /** Avisa o Feed quando muda brinde ou comentários, para ficar igual ao voltar. */
  aoMudar?: (id: string, mudanca: Partial<Pick<Corte, "curti" | "curtidas" | "comentarios">>) => void;
}) {
  const { sessao } = useSessao();
  const eu = sessao?.user.id ?? "";
  const navigate = useNavigate();
  const [lista, setLista] = useState(inicial);
  const [atual, setAtual] = useState(inicio);
  const [mudo, setMudo] = useState(false);
  const [pausado, setPausado] = useState(false);
  const [comentando, setComentando] = useState<Corte | null>(null);
  const [brindes, setBrindes] = useState<Corte | null>(null);
  const [trilha, setTrilha] = useState<Corte | null>(null);
  const [rota, setRota] = useState<Corte | null>(null);
  const [puxado, setPuxado] = useState(0);
  const [dica, setDica] = useState(inicial.length > 1);
  const caixa = useRef<HTMLDivElement>(null);
  const puxar = useRef<{ y: number } | null>(null);
  const puxadoRef = useRef(0);

  // Abre direto no vídeo tocado.
  useLayoutEffect(() => {
    const el = caixa.current;
    if (el) el.scrollTop = inicio * el.clientHeight;
  }, [inicio]);

  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    const t = window.setTimeout(() => setDica(false), 2600);
    return () => {
      document.body.style.overflow = antes;
      window.removeEventListener("keydown", tecla);
      window.clearTimeout(t);
    };
  }, [fechar]);

  const aoRolar = () => {
    const el = caixa.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== atual) {
      setAtual(i);
      setPausado(false);
      setDica(false);
    }
  };

  const mudar = (id: string, m: Partial<Corte>) => {
    setLista((l) => l.map((x) => (x.id === id ? { ...x, ...m } : x)));
    aoMudar?.(id, m);
  };

  const brindar = async (c: Corte) => {
    mudar(c.id, { curti: !c.curti, curtidas: c.curtidas + (c.curti ? -1 : 1) });
    const { error } = await alternarCurtida(c.id, eu, c.curti, c.tipo !== "lugar");
    if (error) mudar(c.id, { curti: c.curti, curtidas: c.curtidas });
  };

  const compartilhar = async (c: Corte) => {
    const url = `${window.location.origin}/publicacao/${c.tipo === "lugar" ? "lugar" : "pessoa"}/${c.id}`;
    try {
      if (navigator.share) await navigator.share({ title: "Vídeo no RoVibes", text: c.local ? `Olha o rolê no ${c.local.nome}` : "Olha esse rolê", url });
      else await navigator.clipboard.writeText(url);
    } catch {
      /* cancelou */
    }
  };

  // Puxar para baixo no primeiro vídeo (já no topo) fecha.
  const mudarPuxado = (v: number) => {
    puxadoRef.current = v;
    setPuxado(v);
  };
  const p = Math.min(1, puxado / 300);

  return createPortal(
    <div className="fixed inset-0 z-[70] text-white" style={{ backgroundColor: `rgba(0,0,0,${1 - p * 0.75})` }} role="dialog" aria-modal="true" aria-label="Vídeos">
      <div
        className="mx-auto h-full max-w-xl overflow-hidden bg-black"
        style={{
          transform: puxado ? `translateY(${puxado}px) scale(${1 - p * 0.2})` : undefined,
          transition: puxado ? "none" : "transform 220ms cubic-bezier(.2,.8,.2,1)",
          borderRadius: puxado ? 20 : 0,
        }}
      >
        <div
          ref={caixa}
          onScroll={aoRolar}
          onTouchStart={(e) => {
            puxar.current = (caixa.current?.scrollTop ?? 1) <= 0 ? { y: e.touches[0].clientY } : null;
          }}
          onTouchMove={(e) => {
            const s = puxar.current;
            if (!s) return;
            const dy = e.touches[0].clientY - s.y;
            if (dy > 0 && (caixa.current?.scrollTop ?? 1) <= 0) mudarPuxado(Math.min(dy * 0.7, 320));
            else {
              puxar.current = null;
              mudarPuxado(0);
            }
          }}
          onTouchEnd={() => {
            puxar.current = null;
            if (puxadoRef.current > 110) fechar();
            else mudarPuxado(0);
          }}
          className="h-full snap-y snap-mandatory overflow-y-auto overscroll-contain [scrollbar-width:none]"
        >
          {lista.map((c, i) => (
            <Video
              key={c.id}
              c={c}
              ativo={i === atual && !rota && !puxado}
              perto={Math.abs(i - atual) <= 1}
              mudo={mudo}
              pausado={pausado}
              alternarPausa={() => setPausado((x) => !x)}
              alternarSom={() => setMudo((m) => !m)}
              brindar={() => void brindar(c)}
              verBrindes={() => setBrindes(c)}
              comentar={() => setComentando(c)}
              compartilhar={() => void compartilhar(c)}
              abrirTrilha={() => setTrilha(c)}
              irParaLa={() => setRota(c)}
              eu={eu}
            />
          ))}
        </div>
      </div>

      {/* Topo: voltar para o Feed */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 mx-auto flex max-w-xl items-center gap-2 bg-gradient-to-b from-black/60 to-transparent px-3 pb-6 pt-[max(10px,env(safe-area-inset-top))]" style={{ opacity: 1 - p }}>
        <button className="pointer-events-auto rounded-full bg-black/40 p-2 backdrop-blur" onClick={fechar} aria-label="Voltar para o Feed">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <span className="text-[15px] font-semibold drop-shadow">Vídeos</span>
        {lista.length > 1 && (
          <span className="ml-auto rounded-full bg-black/35 px-2.5 py-1 text-[12px] font-medium backdrop-blur">
            {atual + 1} de {lista.length}
          </span>
        )}
      </div>
      {dica && (
        <p className="pointer-events-none absolute inset-x-0 top-1/2 z-20 mx-auto flex w-fit -translate-y-1/2 items-center gap-1.5 rounded-full bg-black/55 px-3.5 py-1.5 text-[13px] backdrop-blur">
          <ChevronsDown className="h-4 w-4 rotate-180" />
          Arraste para cima para o próximo
        </p>
      )}

      {comentando && (
        <FolhaComentarios
          tipo={comentando.tipo === "lugar" ? "lugar" : "pessoa"}
          id={comentando.id}
          fechar={() => setComentando(null)}
          aoMudarTotal={(n) => mudar(comentando.id, { comentarios: n })}
        />
      )}
      {brindes && <QuemBrindou tipo={brindes.tipo === "lugar" ? "lugar" : "pessoa"} id={brindes.id} fechar={() => setBrindes(null)} />}
      {trilha && (
        <FolhaTrilha
          c={trilha}
          fechar={() => setTrilha(null)}
          verDoLugar={() => {
            const l = trilha.local;
            setTrilha(null);
            fechar();
            if (l) navigate(`/lugar/${l.id}`);
          }}
        />
      )}
      {rota?.local?.latitude != null && rota.local.longitude != null && (
        <Navegacao destino={{ nome: rota.local.nome, lat: rota.local.latitude, lng: rota.local.longitude }} fechar={() => setRota(null)} />
      )}
    </div>,
    document.body,
  );
}
