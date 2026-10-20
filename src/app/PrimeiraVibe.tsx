import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Check, Sparkles } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { gravar } from "@/lib/armazenamento";
import { NOME_TIPO_GOSTO, ORDEM_TIPOS, TipoGosto, useGostos } from "@/lib/gostos";

const MINIMO = 3;

const FUNDO: Record<TipoGosto, string> = {
  musica: "from-[#6D28D9] to-[#DB2777]",
  ambiente: "from-[#0E7490] to-[#2563EB]",
  bebida: "from-[#B45309] to-[#E06A1B]",
  comida: "from-[#B4234A] to-[#E06A1B]",
  experiencia: "from-[#4338CA] to-[#7C3AED]",
};

/**
 * Primeira vibe (estilo Netflix): a pessoa toca no que curte — músicas, ambientes, bebidas, comidas, experiências.
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

  useEffect(() => {
    supabase.rpc("meus_gostos").then(({ data }) => {
      const meus = ((data ?? []) as { gosto_id: number; origem: string }[]).filter((g) => g.origem === "escolha").map((g) => g.gosto_id);
      if (meus.length) setMarcados(new Set(meus));
    });
  }, []);

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

  const alternar = (id: number) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

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

  const faltam = Math.max(0, MINIMO - marcados.size);

  return (
    <div className="mx-auto min-h-screen max-w-xl pb-32">
      <header className="sticky top-14 z-20 flex items-center gap-3 bg-fundo/95 px-4 py-3 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h1 className="flex items-center gap-2 text-[20px] font-semibold leading-tight">
            <Sparkles className="h-5 w-5 text-magenta" />
            {editar ? "Meus gostos" : `Qual é a sua${perfil?.nome ? `, ${perfil.nome.split(" ")[0]}` : ""}?`}
          </h1>
          <p className="text-[13px] text-suave">Toque no que você curte. Escolha pelo menos {MINIMO}; quantos quiser.</p>
        </div>
        {!editar && (
          <button className="shrink-0 rounded-full px-3 py-1.5 text-sm font-semibold text-suave hover:bg-elevado" disabled={salvando} onClick={() => void salvar([])}>
            Pular
          </button>
        )}
      </header>

      <div className="space-y-6 px-4 pt-2">
        {ORDEM_TIPOS.map((t) => {
          const lista = gostos.filter((g) => g.tipo === t);
          if (!lista.length) return null;
          return (
            <section key={t}>
              <h2 className="mb-2.5 font-semibold">{NOME_TIPO_GOSTO[t]}</h2>
              <ul className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
                {lista.map((g) => {
                  const marcado = marcados.has(g.id);
                  return (
                    <li key={g.id}>
                      <button
                        onClick={() => alternar(g.id)}
                        aria-pressed={marcado}
                        className={clsx(
                          "relative flex aspect-[3/4] w-full flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br p-2.5 text-left text-white transition-transform duration-150",
                          FUNDO[t],
                          marcado ? "scale-[0.97] ring-[3px] ring-marca ring-offset-2 ring-offset-fundo" : "opacity-90 hover:opacity-100",
                        )}
                      >
                        <span className="absolute left-2.5 top-2 text-[34px] leading-none" aria-hidden>
                          {g.emoji}
                        </span>
                        <span className="relative text-[13px] font-semibold leading-tight drop-shadow">{g.nome}</span>
                        {marcado && (
                          <span className="absolute right-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-white text-[#6D28D9]">
                            <Check className="h-4 w-4" strokeWidth={3} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-borda bg-fundo/95 px-4 pb-[max(14px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <div className="mx-auto max-w-xl">
          {erro && <p className="mb-2 text-sm text-perigo">{erro}</p>}
          <button className="botao-principal h-12 w-full rounded-full text-[15px]" disabled={faltam > 0 || salvando} onClick={() => void salvar([...marcados])}>
            {salvando ? "Salvando..." : faltam > 0 ? `Escolha mais ${faltam}` : `Continuar · ${marcados.size} escolhidos`}
          </button>
          <p className="mt-1.5 text-center text-[12px] text-suave">Isso não prende você: o RoVibes ajusta com o que você abre, salva e combina.</p>
        </div>
      </div>
    </div>
  );
}
