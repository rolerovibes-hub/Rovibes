import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Lock, Search, Users } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { deixarDeSeguir, PessoaResumo, seguirPessoa, textoSeguir } from "@/lib/pessoas";

/** Aba Pessoas do Pesquisar: busca por nome ou @usuário e sugestões de quem frequenta os mesmos lugares. */
export function BuscaPessoas() {
  const [termo, setTermo] = useState("");
  const [resultado, setResultado] = useState<PessoaResumo[] | null>(null);
  const [sugeridas, setSugeridas] = useState<PessoaResumo[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase.rpc("pessoas_sugeridas").then(({ data, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 013 do banco." : mensagemDeErro(error));
      setSugeridas((data ?? []) as PessoaResumo[]);
    });
  }, []);

  useEffect(() => {
    const t = termo.trim();
    if (t.replace(/^@/, "").length < 2) return setResultado(null);
    const id = window.setTimeout(() => {
      supabase.rpc("buscar_pessoas", { p_termo: t }).then(({ data }) => setResultado((data ?? []) as PessoaResumo[]));
    }, 300);
    return () => window.clearTimeout(id);
  }, [termo]);

  const atualizar = (id: string, eu_sigo: PessoaResumo["eu_sigo"]) => {
    const f = (l: PessoaResumo[] | null) => l?.map((x) => (x.id === id ? { ...x, eu_sigo } : x)) ?? null;
    setResultado(f);
    setSugeridas(f);
  };

  const alternar = async (p: PessoaResumo) => {
    try {
      if (p.eu_sigo) {
        await deixarDeSeguir(p.id);
        atualizar(p.id, null);
      } else atualizar(p.id, await seguirPessoa(p.id));
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  const lista = resultado ?? sugeridas;

  return (
    <div className="space-y-4">
      <label className="relative mx-4 block">
        <span className="sr-only">Buscar pessoas</span>
        <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-suave" />
        <input
          value={termo}
          onChange={(e) => setTermo(e.target.value)}
          placeholder="Nome ou @usuário"
          autoCapitalize="none"
          className="h-11 w-full rounded-cartao border border-borda bg-superficie pl-10 pr-3 placeholder:text-suave focus:border-marca focus:outline-none"
        />
      </label>
      {erro && <p className="px-4 text-sm text-perigo">{erro}</p>}

      <section className="px-4">
        <h2 className="mb-2 font-semibold">{resultado ? "Resultados" : "Quem frequenta os mesmos lugares"}</h2>
        {lista === null ? (
          <Carregando />
        ) : lista.length === 0 ? (
          <div className="cartao px-6 py-10 text-center">
            <Users className="mx-auto h-7 w-7 text-suave" />
            <p className="mt-3 text-sm text-suave">
              {resultado ? "Ninguém encontrado com esse nome." : "Faça check-in nos lugares para ver sugestões de pessoas que curtem os mesmos rolês."}
            </p>
          </div>
        ) : (
          <ul className="cartao divide-y divide-borda">
            {lista.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <Link to={`/p/${p.usuario}`} className="flex min-w-0 flex-1 items-center gap-3">
                  <Avatar nome={p.nome} foto={p.foto_url} />
                  <span className="min-w-0">
                    <span className="flex items-center gap-1 truncate text-sm font-semibold">
                      {p.usuario}
                      {p.privado && <Lock className="h-3 w-3 shrink-0 text-suave" aria-label="Privado" />}
                    </span>
                    <span className="block truncate text-[13px] text-suave">
                      {p.nome}
                      {p.em_comum ? ` · ${p.em_comum} ${p.em_comum === 1 ? "lugar" : "lugares"} em comum` : ""}
                    </span>
                  </span>
                </Link>
                <button
                  onClick={() => void alternar(p)}
                  className={clsx("h-8 shrink-0 rounded-lg px-3 text-[13px] font-semibold", p.eu_sigo ? "botao" : "botao-principal")}
                >
                  {textoSeguir(p.eu_sigo)}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
