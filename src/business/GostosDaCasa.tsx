import { useEffect, useState } from "react";
import clsx from "clsx";
import { Save } from "lucide-react";
import { Aviso, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { Gosto, NOME_TIPO_GOSTO, ORDEM_TIPOS, TipoGosto, useGostos } from "@/lib/gostos";

function Chips({ gostos, marcados, alternar }: { gostos: Gosto[]; marcados: number[]; alternar: (id: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {gostos.map((g) => {
        const marcado = marcados.includes(g.id);
        return (
          <button
            key={g.id}
            type="button"
            aria-pressed={marcado}
            onClick={() => alternar(g.id)}
            className={clsx("rounded-full border px-3 py-1.5 text-[13px] transition-colors", marcado ? "border-marca bg-marca font-medium text-marca-texto" : "border-borda hover:bg-elevado")}
          >
            {g.emoji ? `${g.emoji} ` : ""}
            {g.nome}
          </button>
        );
      })}
    </div>
  );
}

/** Estilos de música, ambientes, bebidas, comidas e experiências da casa: usados na busca, no feed e no "Como está agora". */
export function GostosDaCasa({ estab }: { estab: string }) {
  const gostos = useGostos();
  const [marcados, setMarcados] = useState<number[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    supabase
      .from("estabelecimento_gostos")
      .select("gosto_id")
      .eq("estabelecimento_id", estab)
      .then(({ data }) => setMarcados(((data ?? []) as { gosto_id: number }[]).map((x) => x.gosto_id)));
  }, [estab]);

  if (gostos === null) return null; // banco ainda sem a atualização 031
  if (!gostos) return null;

  const salvar = async () => {
    setSalvando(true);
    setAviso(null);
    const { error } = await supabase.rpc("salvar_gostos_estab", { p_estab: estab, p_ids: marcados });
    setSalvando(false);
    setAviso(error ? { tipo: "erro", texto: mensagemDeErro(error) } : { tipo: "ok", texto: "Gostos da casa salvos." });
  };

  return (
    <Secao
      titulo="Estilos e gostos da casa"
      acao={
        <button type="button" className="botao h-8 text-[13px]" disabled={salvando} onClick={() => void salvar()}>
          <Save className="h-3.5 w-3.5" />
          {salvando ? "Salvando..." : "Salvar gostos"}
        </button>
      }
    >
      <p className="mb-3 text-[13px] text-suave">Marque o que combina com a casa. O RoVibes mostra o lugar para quem gosta disso e usa os estilos musicais como “música prevista” quando não há evento.</p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="space-y-4">
        {ORDEM_TIPOS.map((t: TipoGosto) => (
          <div key={t}>
            <p className="rotulo mb-1.5">{NOME_TIPO_GOSTO[t]}</p>
            <Chips
              gostos={gostos.filter((g) => g.tipo === t)}
              marcados={marcados}
              alternar={(id) => setMarcados((m) => (m.includes(id) ? m.filter((x) => x !== id) : [...m, id]))}
            />
          </div>
        ))}
      </div>
    </Secao>
  );
}

/** Estilos musicais do evento (aparecem como "música prevista" e ajudam a recomendar). */
export function EstilosEvento({ evento }: { evento: string }) {
  const gostos = useGostos();
  const [marcados, setMarcados] = useState<number[] | null>(null);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase
      .from("eventos")
      .select("gostos")
      .eq("id", evento)
      .maybeSingle()
      .then(({ data, error }) => setMarcados(error ? null : (((data as { gostos?: number[] } | null)?.gostos ?? []) as number[])));
  }, [evento]);

  if (!gostos || marcados === null) return null;

  const alternar = async (id: number) => {
    const novo = marcados.includes(id) ? marcados.filter((x) => x !== id) : [...marcados, id];
    setMarcados(novo);
    setErro("");
    const { error } = await supabase.from("eventos").update({ gostos: novo }).eq("id", evento);
    if (error) setErro(mensagemDeErro(error));
  };

  return (
    <section className="cartao space-y-2 p-4">
      <h2 className="font-semibold">Estilos musicais do evento</h2>
      <p className="text-[13px] text-suave">Salva na hora. Aparece no App como a música prevista do dia.</p>
      <Chips gostos={gostos.filter((g) => g.tipo === "musica")} marcados={marcados} alternar={(id) => void alternar(id)} />
      {erro && <p className="text-sm text-perigo">{erro}</p>}
    </section>
  );
}
