import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Check, MapPin, Sparkles } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { gravar } from "@/lib/armazenamento";
import { CapaGosto, Gosto, NOME_TIPO_GOSTO, ORDEM_TIPOS, TipoGosto, useCapasGostos, useGostos, vibrarLeve } from "@/lib/gostos";

const MINIMO = 3;

/** Degradês da marca para os cards que ainda não têm foto. */
const FUNDO: Record<TipoGosto, string> = {
  musica: "from-[#4C1D95] via-[#6D28D9] to-[#A21CAF]",
  ambiente: "from-[#1E1B4B] via-[#3730A3] to-[#0E7490]",
  bebida: "from-[#3B0764] via-[#7C2D12] to-[#D97706]",
  comida: "from-[#4A044E] via-[#9F1239] to-[#EA580C]",
  experiencia: "from-[#172554] via-[#4338CA] to-[#7C3AED]",
};

/** Nome curto para as abas do topo. */
const ABA: Record<TipoGosto, string> = {
  musica: "Música",
  ambiente: "Ambientes",
  bebida: "Bebidas",
  comida: "Comidas",
  experiencia: "Experiências",
};

function textoEnergia(n: number) {
  if (n === 0) return "Toque no que combina com você";
  if (n < MINIMO) return MINIMO - n === 1 ? "Boa! Falta só 1" : `Boa! Mais ${MINIMO - n} e seu rolê fica calibrado`;
  return `Vibe calibrada · ${n} ${n === 1 ? "escolha" : "escolhas"}`;
}

/**
 * Primeira vibe (estilo Netflix): trilhos que deslizam para o lado, com fotos de lugares da cidade.
 * Mínimo de 3, sem máximo. Dá para pular; depois o feed aprende com o uso. Também serve para editar em "Meus gostos".
 */
export function PrimeiraVibe() {
  const gostos = useGostos();
  const { perfil, recarregar } = useSessao();
  const navegar = useNavigate();
  const [params] = useSearchParams();
  const editar = params.get("editar") === "1";
  const voltar = params.get("voltar");
  const destino = voltar && voltar.startsWith("/") && !voltar.startsWith("//") ? voltar : editar ? "/perfil" : "/";
  const [marcados, setMarcados] = useState<Set<number>>(new Set());
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [abaAtiva, setAbaAtiva] = useState<TipoGosto>("musica");
  const secoes = useRef<Partial<Record<TipoGosto, HTMLElement | null>>>({});

  const tipos = useMemo(() => ORDEM_TIPOS.filter((t) => gostos?.some((g) => g.tipo === t)), [gostos]);
  const ordem = useMemo(() => (gostos ? tipos.flatMap((t) => gostos.filter((g) => g.tipo === t).map((g) => g.id)) : undefined), [gostos, tipos]);
  const capas = useCapasGostos(ordem);

  useEffect(() => {
    supabase.rpc("meus_gostos").then(({ data }) => {
      const meus = ((data ?? []) as { gosto_id: number; origem: string }[]).filter((g) => g.origem === "escolha").map((g) => g.gosto_id);
      if (meus.length) setMarcados(new Set(meus));
    });
  }, []);

  // A aba do topo acompanha o trilho que está na tela.
  useEffect(() => {
    if (!tipos.length || typeof IntersectionObserver === "undefined") return;
    const obs = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        const tipo = visivel?.target.getAttribute("data-tipo") as TipoGosto | null;
        if (tipo) setAbaAtiva(tipo);
      },
      { rootMargin: "-190px 0px -55% 0px" },
    );
    tipos.forEach((t) => secoes.current[t] && obs.observe(secoes.current[t]!));
    return () => obs.disconnect();
  }, [tipos]);

  if (gostos === undefined) return <Carregando />;
  if (gostos === null) {
    return (
      <div className="px-6 py-20 text-center">
        <p className="text-sm text-suave">Esta etapa aparece depois que a atualização 031 do banco for aplicada.</p>
        <button className="botao mt-5" onClick={() => navegar(destino, { replace: true })}>
          Continuar
        </button>
      </div>
    );
  }

  const alternar = (id: number) => {
    vibrarLeve();
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const salvar = async (ids: number[]) => {
    setSalvando(true);
    setErro("");
    const { error } = await supabase.rpc("salvar_meus_gostos", { p_ids: ids });
    if (error) {
      setErro(mensagemDeErro(error));
      setSalvando(false);
      return;
    }
    gravar("vibe_inicial_feita", true);
    await recarregar();
    navegar(destino, { replace: true });
  };

  const irPara = (t: TipoGosto) => {
    setAbaAtiva(t);
    secoes.current[t]?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const total = marcados.size;
  const faltam = Math.max(0, MINIMO - total);
  const pronto = faltam === 0;
  const primeiroNome = perfil?.nome?.split(" ")[0];

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-40">
      <header className="sticky top-14 z-20 bg-fundo/95 pb-2 pt-3 backdrop-blur">
        <div className="flex items-start gap-3 px-4">
          <div className="min-w-0 flex-1">
            <h1 className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
              <Sparkles className="h-5 w-5 shrink-0 text-magenta" />
              {editar ? "Meus gostos" : `Qual é a sua${primeiroNome ? `, ${primeiroNome}` : ""}?`}
            </h1>
            <p className="mt-0.5 text-[13px] text-suave">Toque nas suas paradas favoritas. A gente aprende o seu ritmo rapidinho.</p>
          </div>
          {!editar && (
            <button className="-mr-2 shrink-0 rounded-full px-3 py-1.5 text-[13px] font-medium text-suave hover:bg-elevado" disabled={salvando} onClick={() => void salvar([])}>
              Pular
            </button>
          )}
        </div>

        {/* Energia da vibe: enche até o mínimo e brilha quando completa. */}
        <div className="mt-3 px-4" aria-live="polite">
          <div className="relative h-1.5 overflow-hidden rounded-full bg-elevado">
            <div
              className={clsx("h-full rounded-full bg-gradient-to-r from-marca to-magenta transition-[width] duration-300 ease-out", pronto && "shadow-[0_0_10px_rgb(var(--marca)/0.7)]")}
              style={{ width: `${Math.min(total / MINIMO, 1) * 100}%` }}
            />
            {pronto && <span className="vibe-brilho absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/60 to-transparent" aria-hidden />}
          </div>
          <p className={clsx("mt-1.5 text-[12px] font-medium", pronto ? "text-magenta" : "text-suave")}>{textoEnergia(total)}</p>
        </div>

        <nav aria-label="Tipos de gosto" className="trilho-vibe mt-2 flex gap-2 overflow-x-auto px-4">
          {tipos.map((t) => {
            const n = gostos.filter((g) => g.tipo === t && marcados.has(g.id)).length;
            return (
              <button
                key={t}
                onClick={() => irPara(t)}
                className={clsx(
                  "flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1 text-[13px] font-medium transition-colors",
                  abaAtiva === t ? "border-marca bg-marca text-marca-texto" : "border-borda bg-superficie text-texto hover:bg-elevado",
                )}
              >
                {ABA[t]}
                {n > 0 && <span className={clsx("rounded-full px-1.5 text-[11px] font-semibold", abaAtiva === t ? "bg-white/25" : "bg-marca/15 text-magenta")}>{n}</span>}
              </button>
            );
          })}
        </nav>
      </header>

      <div className="space-y-5 pt-3">
        {tipos.map((t) => {
          const lista = gostos.filter((g) => g.tipo === t);
          const n = lista.filter((g) => marcados.has(g.id)).length;
          return (
            <section key={t} data-tipo={t} ref={(el) => (secoes.current[t] = el)} className="scroll-mt-[200px]">
              <h2 className="mb-1 flex items-baseline justify-between px-4">
                <span className="font-semibold">{NOME_TIPO_GOSTO[t]}</span>
                {n > 0 && <span className="text-[12px] font-medium text-magenta">{n} escolhido{n > 1 ? "s" : ""}</span>}
              </h2>
              <ul className="trilho-vibe flex gap-2.5 overflow-x-auto px-4 py-2">
                {lista.map((g) => (
                  <li key={g.id} className="w-[36%] max-w-[150px] shrink-0">
                    <CardVibe gosto={g} capa={capas.get(g.id)} marcado={marcados.has(g.id)} alternar={() => alternar(g.id)} />
                  </li>
                ))}
                <li className="w-1 shrink-0" aria-hidden />
              </ul>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-fundo/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {erro && <p className="mb-2 text-sm text-perigo">{erro}</p>}
          {pronto ? (
            <button key="pronto" className="botao-principal vibe-pulso h-12 w-full rounded-full text-[15px]" disabled={salvando} onClick={() => void salvar([...marcados])}>
              {salvando ? "Salvando..." : editar ? `Salvar meus gostos · ${total}` : "Começar a curtir 🚀"}
            </button>
          ) : (
            <button className="h-12 w-full cursor-default rounded-full bg-elevado text-[14px] font-medium text-suave" disabled>
              Falta pouco para calibrar seu rolê · mais {faltam}
            </button>
          )}
          <p className="mt-1.5 text-center text-[12px] text-suave">Não se preocupe: o RoVibes se ajusta conforme você usa.</p>
        </div>
      </div>
    </div>
  );
}

function CardVibe({ gosto, capa, marcado, alternar }: { gosto: Gosto; capa: CapaGosto | undefined; marcado: boolean; alternar: () => void }) {
  const [falhou, setFalhou] = useState(false);
  const foto = falhou ? undefined : capa;
  const comFoto = !!foto;
  return (
    <button
      onClick={alternar}
      aria-pressed={marcado}
      aria-label={gosto.nome}
      className={clsx(
        "relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br p-2.5 text-left text-white transition-[transform,box-shadow] duration-200 ease-out",
        FUNDO[gosto.tipo],
        marcado ? "scale-[1.03] ring-2 ring-marca shadow-[0_0_20px_rgb(var(--marca)/0.55)]" : "active:scale-[0.97]",
      )}
    >
      {foto ? (
        <img src={foto.url} alt="" loading="lazy" onError={() => setFalhou(true)} className="absolute inset-0 h-full w-full object-cover" />
      ) : (
        <>
          <span className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[64px] leading-none opacity-60 blur-xl" aria-hidden>
            {gosto.emoji}
          </span>
          <span className="absolute left-1/2 top-[38%] -translate-x-1/2 -translate-y-1/2 text-[44px] leading-none drop-shadow-lg" aria-hidden>
            {gosto.emoji}
          </span>
        </>
      )}
      <span className={clsx("absolute inset-0 bg-gradient-to-t", comFoto ? "from-black/85 via-black/15 to-black/10" : "from-black/50 via-transparent to-transparent")} aria-hidden />

      {foto?.lugar && (
        <span className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-36px)] items-center gap-0.5 truncate rounded-full bg-black/45 px-1.5 py-0.5 text-[10px] font-medium backdrop-blur-sm">
          <MapPin className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{foto.lugar}</span>
        </span>
      )}
      {marcado && (
        <span className="vibe-check absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-marca text-marca-texto shadow-md">
          <Check className="h-4 w-4" strokeWidth={3} />
        </span>
      )}
      <span className="relative flex items-end justify-between gap-1">
        <span className="text-[13px] font-semibold leading-tight drop-shadow">{gosto.nome}</span>
        {comFoto && gosto.emoji && (
          <span className="text-[16px] leading-none" aria-hidden>
            {gosto.emoji}
          </span>
        )}
      </span>
    </button>
  );
}
