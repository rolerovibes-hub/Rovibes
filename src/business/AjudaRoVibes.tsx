import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Aviso } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";

interface Pedido {
  numero: number;
  titulo: string;
  estado: string;
  criado_em: string;
  resultado: string | null;
}
const ESTADO: Record<string, { nome: string; cor: string }> = {
  nova: { nome: "Recebido", cor: "bg-elevado text-suave" },
  em_analise: { nome: "Em análise", cor: "bg-azul/15 text-azul" },
  aguardando: { nome: "Aguardando", cor: "bg-alerta/15 text-alerta" },
  resolvida: { nome: "Resolvido", cor: "bg-ok/15 text-ok" },
  encerrada: { nome: "Encerrado", cor: "bg-elevado text-suave" },
};

/** G1004 · Ajuda RoVibes: o estabelecimento pede ajuda e acompanha (vira situação no Atendimento da Gestão). */
export function AjudaRoVibes() {
  const { atual } = useBusiness();
  const estab = atual?.estabelecimento_id;
  const [lista, setLista] = useState<Pedido[] | null>(null);
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const carregar = useCallback(async () => {
    if (!estab) return;
    const { data, error } = await supabase.rpc("minhas_solicitacoes_rovibes", { p_estab: estab });
    if (error && /function|schema cache/i.test(error.message)) setAviso({ tipo: "erro", texto: "Disponível depois da atualização 049 do banco." });
    setLista((data ?? []) as Pedido[]);
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!estab) return <p className="cartao p-6 text-sm text-suave">Escolha um estabelecimento.</p>;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setAviso(null);
    const { error } = await supabase.rpc("pedir_ajuda_rovibes", { p_estab: estab, p_titulo: titulo, p_descricao: descricao });
    setOcupado(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setTitulo("");
    setDescricao("");
    setAviso({ tipo: "ok", texto: "Pedido enviado." });
    await carregar();
  };

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <form onSubmit={(e) => void enviar(e)} className="cartao space-y-3 p-5">
        <input required minLength={3} maxLength={160} className="entrada" placeholder="Assunto" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <textarea rows={4} className="entrada" placeholder="O que está acontecendo?" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        <button type="submit" className="botao-principal h-10 px-6" disabled={ocupado}>
          Enviar
        </button>
      </form>
      <section className="cartao overflow-hidden">
        {lista === null ? (
          <p className="p-6 text-center text-sm text-suave">Carregando...</p>
        ) : lista.length === 0 ? (
          <p className="p-8 text-center text-sm text-suave">Nenhum pedido.</p>
        ) : (
          <ul className="divide-y divide-borda">
            {lista.map((p) => (
              <li key={p.numero} className="px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">{p.titulo}</span>
                  <span className={clsx("rounded-full px-2 py-0.5 text-[11px] font-bold", ESTADO[p.estado]?.cor)}>{ESTADO[p.estado]?.nome ?? p.estado}</span>
                </div>
                <p className="text-[12px] text-suave">{new Date(p.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</p>
                {p.resultado && <p className="mt-1 text-sm">{p.resultado}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
