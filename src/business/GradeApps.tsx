import { useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Check, ChevronLeft, ChevronRight, Folder, FolderInput, FolderMinus, FolderPlus, GripVertical, ImageIcon, MoreVertical, Palette, RotateCcw, StarOff } from "lucide-react";
import { BlocoPasta, EditorPasta, FolhaPasta } from "./PastasArea";
import { Aplicativo, Area } from "@/lib/catalogo";
import { EstiloApp, ItemArea, useBusiness } from "@/lib/acessos";
import { CORES_APP, ICONES_APP } from "@/lib/estiloApps";

type Modo = "antes" | "depois" | "trocar";

interface Arrasto {
  codigo: string;
  x: number;
  y: number;
  dx: number;
  dy: number;
  w: number;
  h: number;
}

/** Cor e ícone de um app, respeitando o que a pessoa escolheu. */
export function visualApp(app: Aplicativo, estilo: EstiloApp, corArea: Record<Area, string>) {
  return {
    Icone: (estilo.icone && ICONES_APP[estilo.icone]) || app.icone,
    classe: estilo.cor ? "" : corArea[app.area],
    estilo: estilo.cor ? { backgroundColor: estilo.cor } : undefined,
  };
}

/**
 * Grade "Meus Aplicativos": clicar abre; clicar e arrastar muda o app de lugar
 * (solte na borda de outro app para pôr antes/depois, ou no meio para trocar os dois de lugar).
 * No celular, segure o dedo meio segundo para começar a arrastar.
 */
export function GradeApps({ itens, corArea, onAbrir }: { itens: ItemArea[]; corArea: Record<Area, string>; onAbrir: (a: Aplicativo) => void }) {
  const acessos = useBusiness();
  const [pastaAberta, setPastaAberta] = useState<string | null>(null);
  const [editandoPasta, setEditandoPasta] = useState<string | null>(null);
  const grade = useRef<HTMLDivElement>(null);
  const [arrasto, setArrasto] = useState<Arrasto | null>(null);
  const [alvo, setAlvo] = useState<{ codigo: string; modo: Modo } | null>(null);
  const arrastando = useRef(false);
  const alvoRef = useRef<{ codigo: string; modo: Modo } | null>(null);
  const engolirClique = useRef(false);

  // Enquanto arrasta com o dedo, a tela não rola (o ouvinte precisa existir antes do toque começar).
  useEffect(() => {
    const el = grade.current;
    if (!el) return;
    const travar = (e: TouchEvent) => arrastando.current && e.cancelable && e.preventDefault();
    el.addEventListener("touchmove", travar, { passive: false });
    return () => el.removeEventListener("touchmove", travar);
  }, []);

  const ordem = itens.map((a) => a.codigo);
  const mover = (codigo: string, d: -1 | 1) => {
    const i = ordem.indexOf(codigo);
    const j = i + d;
    if (i < 0 || j < 0 || j >= ordem.length) return;
    const novo = [...ordem];
    [novo[i], novo[j]] = [novo[j], novo[i]];
    void acessos.ordenarFavoritos(novo);
  };
  const pastaAbertaItem = itens.find((i) => i.pasta?.id === pastaAberta)?.pasta ?? null;
  const pastaEditando = itens.find((i) => i.pasta?.id === editandoPasta)?.pasta ?? null;

  const soltar = (codigo: string, destino: { codigo: string; modo: Modo } | null) => {
    if (!destino || destino.codigo === codigo) return;
    const novo = [...ordem];
    const i = novo.indexOf(codigo);
    const j = novo.indexOf(destino.codigo);
    if (i < 0 || j < 0) return;
    if (destino.modo === "trocar") {
      [novo[i], novo[j]] = [novo[j], novo[i]];
    } else {
      novo.splice(i, 1);
      const k = novo.indexOf(destino.codigo) + (destino.modo === "depois" ? 1 : 0);
      novo.splice(k, 0, codigo);
    }
    if (novo.join() !== ordem.join()) void acessos.ordenarFavoritos(novo);
  };

  const comecar = (e: React.PointerEvent<HTMLDivElement>, codigo: string) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("[data-sem-arrasto]")) return;
    const bloco = e.currentTarget;
    const inicio = { x: e.clientX, y: e.clientY };
    const toque = e.pointerType !== "mouse";
    let ativo = false;
    let pos = { ...inicio };
    let espera: number | undefined;

    const ativar = () => {
      const r = bloco.getBoundingClientRect();
      ativo = true;
      arrastando.current = true;
      if (toque) navigator.vibrate?.(15);
      setArrasto({ codigo, x: pos.x, y: pos.y, dx: inicio.x - r.left, dy: inicio.y - r.top, w: r.width, h: r.height });
    };

    const mover = (ev: PointerEvent) => {
      pos = { x: ev.clientX, y: ev.clientY };
      const andou = Math.hypot(pos.x - inicio.x, pos.y - inicio.y);
      if (!ativo) {
        if (toque) {
          if (andou > 10) terminar(); // estava rolando a tela, não arrastando
        } else if (andou > 6) ativar();
        return;
      }
      setArrasto((a) => (a ? { ...a, x: pos.x, y: pos.y } : a));
      const sob = document.elementFromPoint(pos.x, pos.y)?.closest<HTMLElement>("[data-app]");
      const outro = sob?.dataset.app;
      let novoAlvo: { codigo: string; modo: Modo } | null = null;
      if (sob && outro && outro !== codigo) {
        const r = sob.getBoundingClientRect();
        const f = (pos.x - r.left) / r.width;
        novoAlvo = { codigo: outro, modo: f < 0.28 ? "antes" : f > 0.72 ? "depois" : "trocar" };
      }
      alvoRef.current = novoAlvo;
      setAlvo(novoAlvo);
    };

    const terminar = (ev?: PointerEvent) => {
      window.clearTimeout(espera);
      window.removeEventListener("pointermove", mover);
      window.removeEventListener("pointerup", terminar);
      window.removeEventListener("pointercancel", terminar);
      if (ativo) {
        if (ev?.type === "pointerup") soltar(codigo, alvoRef.current);
        engolirClique.current = true;
        window.setTimeout(() => (engolirClique.current = false), 50);
      }
      arrastando.current = false;
      alvoRef.current = null;
      setArrasto(null);
      setAlvo(null);
    };

    if (toque) espera = window.setTimeout(ativar, 450);
    window.addEventListener("pointermove", mover);
    window.addEventListener("pointerup", terminar);
    window.addEventListener("pointercancel", terminar);
  };

  const arrastado = arrasto ? itens.find((a) => a.codigo === arrasto.codigo) : null;

  return (
    <>
      <div ref={grade} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
        {itens.map((a, i) => (
          <div
            key={a.codigo}
            data-app={a.codigo}
            onPointerDown={(e) => comecar(e, a.codigo)}
            onContextMenu={(e) => e.preventDefault()}
            onClickCapture={(e) => {
              if (engolirClique.current) {
                e.stopPropagation();
                e.preventDefault();
              }
            }}
            className={clsx(
              "relative select-none [-webkit-touch-callout:none]",
              arrasto?.codigo === a.codigo && "opacity-30",
              arrasto && "cursor-grabbing",
            )}
          >
            {alvo?.codigo === a.codigo && alvo.modo !== "trocar" && (
              <span className={clsx("pointer-events-none absolute -bottom-1 -top-1 z-10 w-1 rounded-full bg-marca", alvo.modo === "antes" ? "-left-2" : "-right-2")} />
            )}
            {a.pasta ? (
              <BlocoPasta pasta={a.pasta} corArea={corArea} trocar={alvo?.codigo === a.codigo && alvo.modo === "trocar"} onAbrir={() => setPastaAberta(a.pasta.id)} />
            ) : (
              <Bloco
                app={a.app}
                corArea={corArea}
                trocar={alvo?.codigo === a.codigo && alvo.modo === "trocar"}
                primeiro={i === 0}
                ultimo={i === itens.length - 1}
                onAbrir={() => onAbrir(a.app)}
                onMover={(d) => mover(a.codigo, d)}
                onRemover={() => acessos.alternarFavorito(a.codigo)}
              />
            )}
          </div>
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-suave">
        <GripVertical className="h-3.5 w-3.5" />
        Arraste um app ou pasta para mudar de lugar (no celular, segure antes). Solte no meio de outro para trocar os dois. Nos três pontinhos você muda a cor, o ícone ou põe o app numa pasta.
      </p>
      {arrasto && arrastado && (
        <div
          className="pointer-events-none fixed z-[90] rotate-2 scale-105 shadow-2xl"
          style={{ left: arrasto.x - arrasto.dx, top: arrasto.y - arrasto.dy, width: arrasto.w, height: arrasto.h }}
          aria-hidden
        >
          {arrastado.pasta ? (
            <BlocoPasta pasta={arrastado.pasta} corArea={corArea} onAbrir={() => {}} />
          ) : (
            <Bloco app={arrastado.app} corArea={corArea} fantasma primeiro ultimo onAbrir={() => {}} onMover={() => {}} onRemover={() => {}} />
          )}
        </div>
      )}
      {pastaAbertaItem && (
        <FolhaPasta
          pasta={pastaAbertaItem}
          corArea={corArea}
          fechar={() => setPastaAberta(null)}
          onAbrirApp={onAbrir}
          editar={() => {
            setEditandoPasta(pastaAbertaItem.id);
            setPastaAberta(null);
          }}
        />
      )}
      {pastaEditando && <EditorPasta pasta={pastaEditando} fechar={() => setEditandoPasta(null)} />}
    </>
  );
}

function Bloco({
  app,
  corArea,
  primeiro,
  ultimo,
  trocar,
  fantasma,
  onAbrir,
  onMover,
  onRemover,
}: {
  app: Aplicativo;
  corArea: Record<Area, string>;
  primeiro: boolean;
  ultimo: boolean;
  trocar?: boolean;
  fantasma?: boolean;
  onAbrir: () => void;
  onMover: (d: -1 | 1) => void;
  onRemover: () => void;
}) {
  const { estiloDe, definirEstilo } = useBusiness();
  const estilo = estiloDe(app.codigo);
  const { Icone, classe, estilo: fundo } = visualApp(app, estilo, corArea);
  const [menu, setMenu] = useState<null | "inicio" | "cor" | "icone" | "pasta">(null);
  const { pastas, pastaDoApp, moverParaPasta } = useBusiness();
  const [novaPasta, setNovaPasta] = useState(false);
  const minhaPasta = pastaDoApp(app.codigo);
  const [aEsquerda, setAEsquerda] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const personalizado = !!(estilo.cor || estilo.icone);

  useEffect(() => {
    if (!menu) return;
    const fora = (e: PointerEvent) => !caixa.current?.contains(e.target as Node) && setMenu(null);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setMenu(null);
    document.addEventListener("pointerdown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("pointerdown", fora);
      document.removeEventListener("keydown", esc);
    };
  }, [menu]);

  const item = "flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-elevado disabled:opacity-40";

  return (
    <div ref={caixa} className={clsx("relative rounded-cartao text-white shadow-sm transition-shadow", classe, trocar && "ring-4 ring-marca ring-offset-2 ring-offset-superficie")} style={fundo}>
      <button onClick={onAbrir} tabIndex={fantasma ? -1 : 0} className="flex h-[108px] w-full flex-col justify-between rounded-cartao p-3.5 text-left transition-[filter] hover:brightness-110">
        <span>
          <Icone className="h-5 w-5 opacity-90" />
          <span className="mt-2 block text-[15px] font-semibold leading-snug">{app.nome}</span>
        </span>
        <span className="codigo truncate text-[12px] opacity-80">
          {trocar ? "Soltar para trocar" : `${app.codigo} · ${app.area}`}
        </span>
      </button>
      {!fantasma && (
        <button
          data-sem-arrasto
          onClick={() => {
            const r = caixa.current?.getBoundingClientRect();
            setAEsquerda(!!r && r.left + r.width / 2 < window.innerWidth / 2);
            setMenu((m) => (m ? null : "inicio"));
          }}
          className="absolute right-1.5 top-1.5 rounded p-1 opacity-80 hover:bg-white/15 hover:opacity-100"
          aria-label={`Opções de ${app.nome}`}
          aria-expanded={!!menu}
        >
          <MoreVertical className="h-4 w-4" />
        </button>
      )}
      {menu && (
        <div data-sem-arrasto className={clsx("absolute top-8 z-30", aEsquerda ? "left-1.5" : "right-1.5", " overflow-hidden rounded-lg border border-borda bg-superficie py-1 text-sm text-texto shadow-lg", menu === "inicio" ? "w-52" : "w-[232px]")}>
          {menu === "inicio" && (
            <>
              <button className={item} onClick={() => setMenu("cor")}>
                <Palette className="h-4 w-4" />
                <span className="flex-1">Mudar a cor</span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </button>
              <button className={item} onClick={() => setMenu("icone")}>
                <ImageIcon className="h-4 w-4" />
                <span className="flex-1">Mudar o ícone</span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </button>
              {personalizado && (
                <button className={item} onClick={() => { void definirEstilo(app.codigo, null); setMenu(null); }}>
                  <RotateCcw className="h-4 w-4" />
                  Voltar cor e ícone padrão
                </button>
              )}
              <button className={item} onClick={() => setMenu("pasta")}>
                <FolderInput className="h-4 w-4" />
                <span className="flex-1">Pôr numa pasta</span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </button>
              <div className="my-1 border-t border-borda" />
              <button className={item} disabled={primeiro} onClick={() => { onMover(-1); setMenu(null); }}>
                <ChevronLeft className="h-4 w-4" />
                Mover para trás
              </button>
              <button className={item} disabled={ultimo} onClick={() => { onMover(1); setMenu(null); }}>
                <ChevronRight className="h-4 w-4" />
                Mover para frente
              </button>
              <button className={clsx(item, "text-perigo")} onClick={() => { onRemover(); setMenu(null); }}>
                <StarOff className="h-4 w-4" />
                Tirar da tela inicial
              </button>
            </>
          )}
          {menu === "pasta" && (
            <div className="py-1">
              <button className="mb-1 flex items-center gap-1 px-2 text-[13px] font-semibold text-suave" onClick={() => setMenu("inicio")}>
                <ChevronLeft className="h-4 w-4" />
                Pôr numa pasta
              </button>
              {pastas.map((p) => (
                <button
                  key={p.id}
                  className={item}
                  onClick={() => {
                    void moverParaPasta(app.codigo, p.id);
                    setMenu(null);
                  }}
                >
                  <Folder className="h-4 w-4" style={{ color: p.cor ?? undefined }} />
                  <span className="min-w-0 flex-1 truncate">{p.nome}</span>
                  {minhaPasta === p.id && <Check className="h-4 w-4 text-destaque" />}
                </button>
              ))}
              {minhaPasta && (
                <button className={item} onClick={() => { void moverParaPasta(app.codigo, null); setMenu(null); }}>
                  <FolderMinus className="h-4 w-4" />
                  Tirar da pasta
                </button>
              )}
              <button className={item} onClick={() => { setNovaPasta(true); setMenu(null); }}>
                <FolderPlus className="h-4 w-4" />
                Nova pasta com este app
              </button>
            </div>
          )}
          {menu === "cor" && (
            <div className="p-2">
              <button className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-suave" onClick={() => setMenu("inicio")}>
                <ChevronLeft className="h-4 w-4" />
                Cor do app
              </button>
              <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label="Cor do app">
                <button
                  role="radio"
                  aria-checked={!estilo.cor}
                  aria-label="Cor padrão da área"
                  title="Padrão da área"
                  onClick={() => void definirEstilo(app.codigo, { cor: null })}
                  className={clsx("flex h-8 w-8 items-center justify-center rounded-md text-white", corArea[app.area], !estilo.cor && "ring-2 ring-marca ring-offset-1 ring-offset-superficie")}
                >
                  {!estilo.cor ? <Check className="h-4 w-4" /> : <RotateCcw className="h-3.5 w-3.5" />}
                </button>
                {CORES_APP.map((c) => (
                  <button
                    key={c.cor}
                    role="radio"
                    aria-checked={estilo.cor === c.cor}
                    aria-label={c.nome}
                    title={c.nome}
                    onClick={() => void definirEstilo(app.codigo, { cor: c.cor })}
                    className={clsx("flex h-8 w-8 items-center justify-center rounded-md text-white", estilo.cor === c.cor && "ring-2 ring-marca ring-offset-1 ring-offset-superficie")}
                    style={{ backgroundColor: c.cor }}
                  >
                    {estilo.cor === c.cor && <Check className="h-4 w-4" />}
                  </button>
                ))}
              </div>
            </div>
          )}
          {menu === "icone" && (
            <div className="p-2">
              <button className="mb-2 flex items-center gap-1 text-[13px] font-semibold text-suave" onClick={() => setMenu("inicio")}>
                <ChevronLeft className="h-4 w-4" />
                Ícone do app
              </button>
              <div className="grid max-h-56 grid-cols-6 gap-1 overflow-y-auto" role="radiogroup" aria-label="Ícone do app">
                <button
                  role="radio"
                  aria-checked={!estilo.icone}
                  aria-label="Ícone padrão"
                  title="Padrão"
                  onClick={() => void definirEstilo(app.codigo, { icone: null })}
                  className={clsx("flex h-8 w-8 items-center justify-center rounded-md hover:bg-elevado", !estilo.icone && "bg-destaque-suave text-destaque ring-1 ring-marca")}
                >
                  <app.icone className="h-4 w-4" />
                </button>
                {Object.entries(ICONES_APP).map(([nome, I]) => (
                  <button
                    key={nome}
                    role="radio"
                    aria-checked={estilo.icone === nome}
                    aria-label={nome}
                    title={nome}
                    onClick={() => void definirEstilo(app.codigo, { icone: nome })}
                    className={clsx("flex h-8 w-8 items-center justify-center rounded-md hover:bg-elevado", estilo.icone === nome && "bg-destaque-suave text-destaque ring-1 ring-marca")}
                  >
                    <I className="h-4 w-4" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
      {novaPasta && <NovaPastaCom codigo={app.codigo} fechar={() => setNovaPasta(false)} />}
    </div>
  );
}

/** "Nova pasta com este app": abre o editor já com o app marcado. */
function NovaPastaCom({ codigo, fechar }: { codigo: string; fechar: () => void }) {
  return <EditorPasta pasta={null} appsIniciais={[codigo]} fechar={fechar} />;
}
