import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Plus } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { FotosGostos } from "./FotosGostos";
import { Aviso, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";

type Tabela = "vibes" | "categorias";

interface Linha {
  id: number;
  nome: string;
  ativa: boolean;
}

export function VibesCategorias() {
  const [dados, setDados] = useState<Record<Tabela, Linha[]>>({ vibes: [], categorias: [] });
  const [erro, setErro] = useState("");

  const carregar = useCallback(async () => {
    const [v, c] = await Promise.all([
      supabase.from("vibes").select("id, nome, ativa").order("nome"),
      supabase.from("categorias").select("id, nome, ativa").order("nome"),
    ]);
    setDados({ vibes: (v.data ?? []) as Linha[], categorias: (c.data ?? []) as Linha[] });
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (acao: PromiseLike<{ error: unknown }>) => {
    setErro("");
    const { error } = await acao;
    if (error) setErro(mensagemDeErro(error));
    await carregar();
  };

  return (
    <TelaUniversal>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      <div className="grid gap-4 lg:grid-cols-2">
        <Lista
          titulo="Vibes"
          linhas={dados.vibes}
          aoCriar={(nome) => executar(supabase.from("vibes").insert({ nome }))}
          aoAlternar={(l) => executar(supabase.from("vibes").update({ ativa: !l.ativa }).eq("id", l.id))}
          aoRenomear={(l, nome) => executar(supabase.from("vibes").update({ nome }).eq("id", l.id))}
        />
        <Lista
          titulo="Categorias"
          linhas={dados.categorias}
          aoCriar={(nome) => executar(supabase.from("categorias").insert({ nome }))}
          aoAlternar={(l) => executar(supabase.from("categorias").update({ ativa: !l.ativa }).eq("id", l.id))}
          aoRenomear={(l, nome) => executar(supabase.from("categorias").update({ nome }).eq("id", l.id))}
        />
      </div>
      <div className="mt-4">
        <FotosGostos />
      </div>
    </TelaUniversal>
  );
}

function Lista({
  titulo,
  linhas,
  aoCriar,
  aoAlternar,
  aoRenomear,
}: {
  titulo: string;
  linhas: Linha[];
  aoCriar: (nome: string) => Promise<void>;
  aoAlternar: (l: Linha) => Promise<void>;
  aoRenomear: (l: Linha, nome: string) => Promise<void>;
}) {
  const [novo, setNovo] = useState("");
  const [editando, setEditando] = useState<number | null>(null);
  const [nome, setNome] = useState("");

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!novo.trim()) return;
    await aoCriar(novo.trim());
    setNovo("");
  };

  return (
    <Secao titulo={titulo}>
      <form onSubmit={criar} className="mb-3 flex gap-2">
        <input className="entrada" placeholder={`Nova ${titulo === "Vibes" ? "vibe" : "categoria"}`} value={novo} onChange={(e) => setNovo(e.target.value)} />
        <button type="submit" className="botao-principal h-10 shrink-0" disabled={!novo.trim()}>
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </form>
      <ul className="divide-y divide-borda">
        {linhas.map((l) => (
          <li key={l.id} className="flex items-center gap-3 py-2">
            {editando === l.id ? (
              <form
                className="flex flex-1 gap-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (nome.trim()) await aoRenomear(l, nome.trim());
                  setEditando(null);
                }}
              >
                <input autoFocus className="entrada h-9" value={nome} onChange={(e) => setNome(e.target.value)} />
                <button type="submit" className="botao h-9">
                  Salvar
                </button>
              </form>
            ) : (
              <button
                className={clsx("flex-1 text-left text-sm hover:underline", !l.ativa && "text-suave line-through")}
                onClick={() => {
                  setEditando(l.id);
                  setNome(l.nome);
                }}
              >
                {l.nome}
              </button>
            )}
            <button
              onClick={() => void aoAlternar(l)}
              className={clsx("rounded-md px-2 py-1 text-[13px] font-medium hover:bg-elevado", l.ativa ? "text-ok" : "text-suave")}
            >
              {l.ativa ? "Ativa" : "Inativa"}
            </button>
          </li>
        ))}
      </ul>
    </Secao>
  );
}
