import { PointerEvent as EventoPonteiro, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { AlertTriangle, CheckCircle2, Crop, Eraser, Eye, Grid3x3, RotateCcw, RotateCw, Undo2, X, XCircle } from "lucide-react";
import {
  abrirImagem,
  AJUSTES_INICIAIS,
  AjustesImagem,
  AlertaQualidade,
  analisarQualidade,
  enquadrar,
  mascaraDoProduto,
  paraArquivo,
  recortar,
  renderizar,
} from "@/lib/imagemProduto";

const PREVIA = 520;

function Controle({ rotulo, valor, children }: { rotulo: string; valor: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="flex items-center justify-between text-[13px]">
        <span className="font-medium">{rotulo}</span>
        <span className="codigo text-suave">{valor}</span>
      </span>
      {children}
    </label>
  );
}

const faixa = "mt-1 w-full accent-[rgb(var(--marca))]";

/**
 * Editor da foto do produto: enquadra em quadrado com fundo branco, zoom, giro, brilho, contraste,
 * nitidez, remoção de fundo e alertas de qualidade. Devolve um JPEG 1000×1000.
 */
export function EditorImagem({ origem, fechar, usar }: { origem: File | Blob | string; fechar: () => void; usar: (foto: Blob) => void | Promise<void> }) {
  const [imagem, setImagem] = useState<Awaited<ReturnType<typeof abrirImagem>> | null>(null);
  const [mascara, setMascara] = useState<Uint8ClampedArray | null>(null);
  const [aj, setAj] = useState<AjustesImagem>(AJUSTES_INICIAIS);
  const [historico, setHistorico] = useState<AjustesImagem[]>([]);
  const [alertas, setAlertas] = useState<AlertaQualidade[]>([]);
  const [status, setStatus] = useState("Abrindo a foto...");
  const [erro, setErro] = useState("");
  const [grade, setGrade] = useState(true);
  const [original, setOriginal] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const tela = useRef<HTMLCanvasElement>(null);
  const arraste = useRef<{ ponteiros: Map<number, { x: number; y: number }>; distancia?: number }>({ ponteiros: new Map() });

  useEffect(() => {
    let vivo = true;
    abrirImagem(origem)
      .then((i) => {
        if (!vivo) return;
        setImagem(i);
        setStatus("");
      })
      .catch((e: Error) => vivo && (setErro(e.message), setStatus("")));
    return () => {
      vivo = false;
    };
  }, [origem]);

  const recorte = useMemo(() => (imagem && mascara ? recortar(imagem.fonte, mascara, aj.limiar) : null), [imagem, mascara, aj.limiar]);

  // Desenha a prévia a cada ajuste.
  useEffect(() => {
    if (!imagem || !tela.current) return;
    const id = requestAnimationFrame(() => {
      const c = tela.current;
      if (!c) return;
      const r = original ? renderizar(imagem.fonte, null, { ...AJUSTES_INICIAIS }, PREVIA) : renderizar(imagem.fonte, recorte, aj, PREVIA);
      c.getContext("2d")!.drawImage(r, 0, 0);
    });
    return () => cancelAnimationFrame(id);
  }, [imagem, recorte, aj, original]);

  // Alertas de qualidade (com pequena espera para não pesar enquanto arrasta).
  useEffect(() => {
    if (!imagem) return;
    const t = window.setTimeout(() => setAlertas(analisarQualidade(imagem, renderizar(imagem.fonte, recorte, aj, 400))), 350);
    return () => window.clearTimeout(t);
  }, [imagem, recorte, aj]);

  const mudar = (novo: Partial<AjustesImagem>, guardar = true) => {
    if (guardar) setHistorico((h) => [...h.slice(-30), aj]);
    setAj((a) => ({ ...a, ...novo }));
  };
  const desfazer = () => {
    const ultimo = historico[historico.length - 1];
    if (!ultimo) return;
    setHistorico((h) => h.slice(0, -1));
    setAj(ultimo);
  };

  const removerFundo = async () => {
    if (!imagem) return;
    if (mascara) return mudar({ semFundo: !aj.semFundo });
    setOcupado(true);
    setErro("");
    try {
      const m = await mascaraDoProduto(imagem.fonte, setStatus);
      setMascara(m);
      setHistorico((h) => [...h, aj]);
      setAj((a) => enquadrar(imagem.fonte, m, { ...a, semFundo: true }));
    } catch (e) {
      setErro(`Não foi possível remover o fundo: ${(e as Error).message}. Verifique a internet e tente de novo.`);
    }
    setStatus("");
    setOcupado(false);
  };

  const concluir = async () => {
    if (!imagem) return;
    setOcupado(true);
    try {
      await usar(await paraArquivo(renderizar(imagem.fonte, recorte, aj)));
    } catch (e) {
      setErro((e as Error).message);
      setOcupado(false);
    }
  };

  // Arrastar para mover; pinça (dois dedos) ou roda do mouse para zoom.
  const tamanhoTela = () => tela.current?.getBoundingClientRect().width ?? PREVIA;
  const aoApertar = (e: EventoPonteiro<HTMLCanvasElement>) => {
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    if (arraste.current.ponteiros.size === 0) setHistorico((h) => [...h.slice(-30), aj]);
    arraste.current.ponteiros.set(e.pointerId, { x: e.clientX, y: e.clientY });
    arraste.current.distancia = undefined;
  };
  const aoMover = (e: EventoPonteiro<HTMLCanvasElement>) => {
    const p = arraste.current.ponteiros;
    const antes = p.get(e.pointerId);
    if (!antes) return;
    if (p.size === 1) {
      const t = tamanhoTela();
      setAj((a) => ({ ...a, x: a.x + (e.clientX - antes.x) / t, y: a.y + (e.clientY - antes.y) / t }));
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
    } else if (p.size === 2) {
      p.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const [a, b] = [...p.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const anterior = arraste.current.distancia;
      if (anterior) setAj((x) => ({ ...x, zoom: Math.min(8, Math.max(0.3, (x.zoom * dist) / anterior)) }));
      arraste.current.distancia = dist;
    }
  };
  const aoSoltar = (e: EventoPonteiro<HTMLCanvasElement>) => {
    arraste.current.ponteiros.delete(e.pointerId);
    arraste.current.distancia = undefined;
  };

  const graves = alertas.filter((a) => a.nivel === "grave").length;

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-black/70 sm:items-center" role="dialog" aria-modal="true" aria-label="Editar foto do produto">
      <div className="folha flex max-h-[96vh] w-full max-w-4xl flex-col overflow-hidden rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-center gap-2 border-b border-borda px-5 py-3">
          <h2 className="flex-1 text-lg font-semibold">Tratar foto do produto</h2>
          <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar sem salvar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 md:grid-cols-[minmax(0,1fr)_300px]">
          <div>
            <div className="relative mx-auto aspect-square w-full max-w-[520px] overflow-hidden rounded-xl border border-borda bg-white">
              <canvas
                ref={tela}
                width={PREVIA}
                height={PREVIA}
                className="h-full w-full cursor-grab touch-none active:cursor-grabbing"
                onPointerDown={aoApertar}
                onPointerMove={aoMover}
                onPointerUp={aoSoltar}
                onPointerCancel={aoSoltar}
                onWheel={(e) => mudar({ zoom: Math.min(8, Math.max(0.3, aj.zoom * (e.deltaY < 0 ? 1.06 : 0.94))) }, false)}
                aria-label="Prévia da foto. Arraste para mover; use dois dedos ou a roda do mouse para zoom."
              />
              {grade && !original && (
                <div aria-hidden className="pointer-events-none absolute inset-[7.5%] rounded-md border border-dashed border-sky-500/70">
                  <div className="absolute inset-y-0 left-1/2 border-l border-dashed border-sky-500/40" />
                  <div className="absolute inset-x-0 top-1/2 border-t border-dashed border-sky-500/40" />
                </div>
              )}
              {(status || !imagem) && <div className="absolute inset-0 flex items-center justify-center bg-white/80 px-6 text-center text-sm font-medium text-neutral-700">{status || (erro ? "" : "Abrindo...")}</div>}
            </div>
            <p className="mt-2 text-center text-[12px] text-suave">Arraste para posicionar. A linha tracejada é a área segura (o produto deve ficar dentro dela).</p>
            <div className="mt-3 flex flex-wrap justify-center gap-2">
              <button type="button" className={clsx("botao h-9", aj.semFundo && "border-marca text-destaque")} disabled={!imagem || ocupado} onClick={() => void removerFundo()} aria-pressed={aj.semFundo}>
                <Eraser className="h-4 w-4" />
                {mascara ? (aj.semFundo ? "Fundo removido" : "Remover fundo") : "Remover fundo"}
              </button>
              <button type="button" className="botao h-9" disabled={!imagem || ocupado} onClick={() => imagem && mudar(enquadrar(imagem.fonte, mascara, aj))}>
                <Crop className="h-4 w-4" />
                Enquadrar
              </button>
              <button type="button" className="botao h-9 w-9 px-0" disabled={!imagem} onClick={() => mudar({ rotacao: aj.rotacao - 90 })} aria-label="Girar para a esquerda">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button type="button" className="botao h-9 w-9 px-0" disabled={!imagem} onClick={() => mudar({ rotacao: aj.rotacao + 90 })} aria-label="Girar para a direita">
                <RotateCw className="h-4 w-4" />
              </button>
              <button type="button" className={clsx("botao h-9 w-9 px-0", grade && "border-marca text-destaque")} onClick={() => setGrade(!grade)} aria-pressed={grade} aria-label="Mostrar área segura">
                <Grid3x3 className="h-4 w-4" />
              </button>
              <button
                type="button"
                className="botao h-9"
                disabled={!imagem}
                onPointerDown={() => setOriginal(true)}
                onPointerUp={() => setOriginal(false)}
                onPointerLeave={() => setOriginal(false)}
                onKeyDown={(e) => e.key === " " && setOriginal(true)}
                onKeyUp={() => setOriginal(false)}
              >
                <Eye className="h-4 w-4" />
                Segure: original
              </button>
            </div>
          </div>

          <div className="space-y-4">
            <Controle rotulo="Zoom" valor={`${Math.round(aj.zoom * 100)}%`}>
              <input type="range" className={faixa} min={0.3} max={4} step={0.01} value={aj.zoom} onPointerDown={() => mudar({})} onChange={(e) => mudar({ zoom: Number(e.target.value) }, false)} />
            </Controle>
            <Controle rotulo="Giro fino" valor={`${(aj.rotacao - Math.round(aj.rotacao / 90) * 90).toLocaleString("pt-BR")}°`}>
              <input type="range" className={faixa} min={-44} max={44} step={0.5} value={aj.rotacao - Math.round(aj.rotacao / 90) * 90} onPointerDown={() => mudar({})} onChange={(e) => mudar({ rotacao: Math.round(aj.rotacao / 90) * 90 + Number(e.target.value) }, false)} />
            </Controle>
            <Controle rotulo="Brilho" valor={`${aj.brilho}%`}>
              <input type="range" className={faixa} min={50} max={160} value={aj.brilho} onPointerDown={() => mudar({})} onChange={(e) => mudar({ brilho: Number(e.target.value) }, false)} />
            </Controle>
            <Controle rotulo="Contraste" valor={`${aj.contraste}%`}>
              <input type="range" className={faixa} min={50} max={160} value={aj.contraste} onPointerDown={() => mudar({})} onChange={(e) => mudar({ contraste: Number(e.target.value) }, false)} />
            </Controle>
            <Controle rotulo="Nitidez" valor={`${aj.nitidez}`}>
              <input type="range" className={faixa} min={0} max={100} value={aj.nitidez} onPointerDown={() => mudar({})} onChange={(e) => mudar({ nitidez: Number(e.target.value) }, false)} />
            </Controle>
            {aj.semFundo && (
              <Controle rotulo="Recorte do contorno" valor={aj.limiar < 0.45 ? "mais solto" : aj.limiar > 0.55 ? "mais justo" : "padrão"}>
                <input type="range" className={faixa} min={0.2} max={0.8} step={0.01} value={aj.limiar} onPointerDown={() => mudar({})} onChange={(e) => mudar({ limiar: Number(e.target.value) }, false)} />
              </Controle>
            )}
            <div className="flex gap-2">
              <button type="button" className="botao h-9 flex-1" disabled={!historico.length} onClick={desfazer}>
                <Undo2 className="h-4 w-4" />
                Desfazer
              </button>
              <button type="button" className="botao h-9 flex-1" onClick={() => mudar({ ...AJUSTES_INICIAIS, semFundo: false })}>
                Restaurar
              </button>
            </div>

            <section aria-label="Qualidade da foto" className="rounded-lg border border-borda p-3">
              <h3 className="rotulo mb-2">Qualidade da foto</h3>
              <ul className="space-y-1.5 text-[13px]">
                {alertas.map((a) => (
                  <li key={a.texto} className="flex gap-2">
                    {a.nivel === "ok" ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : a.nivel === "grave" ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-perigo" /> : <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-alerta" />}
                    <span>{a.texto}</span>
                  </li>
                ))}
                {!alertas.length && <li className="text-suave">Analisando...</li>}
              </ul>
            </section>
            {erro && <p className="text-sm text-perigo">{erro}</p>}
          </div>
        </div>

        <div className="flex gap-2 border-t border-borda px-5 pt-3">
          <button type="button" className="botao h-11 flex-1" onClick={fechar}>
            Cancelar
          </button>
          <button type="button" className="botao-principal h-11 flex-[2]" disabled={!imagem || ocupado} onClick={() => void concluir()}>
            {ocupado && !status ? "Salvando..." : graves ? "Usar mesmo assim" : "Usar esta foto"}
          </button>
        </div>
      </div>
    </div>
  );
}
