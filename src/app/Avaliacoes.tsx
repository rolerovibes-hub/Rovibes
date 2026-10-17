import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Star } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";

interface Avaliacao {
  id: string;
  nota: number;
  comentario: string | null;
  atualizado_em: string;
  autor: string;
  minha: boolean | null;
}

export function Estrelas({ nota, tamanho = "h-4 w-4" }: { nota: number; tamanho?: string }) {
  return (
    <span className="inline-flex gap-0.5" aria-label={`${nota} de 5`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} className={clsx(tamanho, i <= Math.round(nota) ? "fill-current text-alerta" : "text-borda")} />
      ))}
    </span>
  );
}

/** "★ 4,8 (12)" compacto para cartões. */
export function NotaCompacta({ nota, total }: { nota: number | null; total: number }) {
  if (!nota || !total) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[13px]">
      <Star className="h-3.5 w-3.5 fill-current text-alerta" />
      <span className="font-medium">{nota.toLocaleString("pt-BR", { minimumFractionDigits: 1 })}</span>
      <span className="text-suave">({total})</span>
    </span>
  );
}

export function SecaoAvaliacoes({ estabelecimentoId, versao, aoMudar }: { estabelecimentoId: string; versao: number; aoMudar: () => void }) {
  const { sessao } = useSessao();
  const [lista, setLista] = useState<Avaliacao[]>([]);
  const [podeAvaliar, setPodeAvaliar] = useState(false);
  const [editando, setEditando] = useState(false);
  const [nota, setNota] = useState(0);
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [enviando, setEnviando] = useState(false);

  const carregar = useCallback(async () => {
    const [a, p] = await Promise.all([
      supabase.rpc("avaliacoes_do_lugar", { p_estab: estabelecimentoId, p_limite: 20 }),
      sessao ? supabase.rpc("pode_avaliar", { p_estab: estabelecimentoId }) : Promise.resolve({ data: false }),
    ]);
    setLista((a.data ?? []) as Avaliacao[]);
    setPodeAvaliar(!!p.data);
  }, [estabelecimentoId, sessao]);

  useEffect(() => {
    void carregar();
  }, [carregar, versao]);

  const minha = lista.find((a) => a.minha);

  const abrir = () => {
    setNota(minha?.nota ?? 0);
    setComentario(minha?.comentario ?? "");
    setErro("");
    setEditando(true);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    if (!nota) {
      setErro("Escolha de 1 a 5 estrelas.");
      return;
    }
    setEnviando(true);
    setErro("");
    const { error } = await supabase
      .from("avaliacoes")
      .upsert(
        { estabelecimento_id: estabelecimentoId, usuario_id: sessao!.user.id, nota, comentario: comentario.trim() || null, atualizado_em: new Date().toISOString() },
        { onConflict: "usuario_id,estabelecimento_id" },
      );
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    setEditando(false);
    await carregar();
    aoMudar();
  };

  return (
    <section className="px-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-[17px] font-semibold">Avaliações</h2>
        {podeAvaliar && !editando && (
          <button onClick={abrir} className="botao h-8 text-[13px]">
            {minha ? "Editar minha avaliação" : "Avaliar"}
          </button>
        )}
      </div>

      {editando && (
        <form onSubmit={enviar} className="cartao mb-3 space-y-3 p-4">
          <div className="flex gap-1" role="radiogroup" aria-label="Nota">
            {[1, 2, 3, 4, 5].map((i) => (
              <button key={i} type="button" role="radio" aria-checked={nota === i} aria-label={`${i} estrela${i > 1 ? "s" : ""}`} onClick={() => setNota(i)} className="p-1">
                <Star className={clsx("h-7 w-7", i <= nota ? "fill-current text-alerta" : "text-borda")} />
              </button>
            ))}
          </div>
          <textarea
            rows={3}
            maxLength={500}
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            placeholder="Conte como foi (opcional)"
            className="entrada"
          />
          {erro && (
            <p role="alert" className="text-sm text-perigo">
              {erro}
            </p>
          )}
          <div className="flex gap-2">
            <button type="submit" disabled={enviando} className="botao-principal">
              {enviando ? "Enviando…" : "Publicar avaliação"}
            </button>
            <button type="button" onClick={() => setEditando(false)} className="botao">
              Cancelar
            </button>
          </div>
        </form>
      )}

      {lista.length === 0 ? (
        <p className="cartao px-4 py-6 text-center text-sm text-suave">
          Ainda sem avaliações. Quem faz check-in aqui pode avaliar.
        </p>
      ) : (
        <ul className="cartao divide-y divide-borda">
          {lista.map((a) => (
            <li key={a.id} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">
                  {a.autor}
                  {a.minha ? <span className="ml-1.5 text-[12px] font-normal text-suave">(você)</span> : null}
                </span>
                <span className="text-[12px] text-suave">{new Date(a.atualizado_em).toLocaleDateString("pt-BR")}</span>
              </div>
              <Estrelas nota={a.nota} tamanho="h-3.5 w-3.5" />
              {a.comentario && <p className="mt-1 text-sm">{a.comentario}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
