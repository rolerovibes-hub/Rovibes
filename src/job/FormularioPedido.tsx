import { useEffect, useState } from "react";
import clsx from "clsx";
import { Send } from "lucide-react";
import { reais } from "@/components/Formulario";
import { Carrinho, carrinhoParaBanco, carregarItensParaPedido, ItemParaPedido, MontarPedido, qtdNoCarrinho, totalDoCarrinho } from "@/components/MontarPedido";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { buscarRegraEntrega, Modalidade, NOME_MODALIDADE, RegraEntrega } from "@/lib/salao";

/** Venda direta pela equipe: monta o pedido e envia para os setores. */
export function FormularioPedido({ estab, comanda, comMesa, enviado, lateral = true }: { estab: string; comanda: string; comMesa: boolean; enviado: () => void; lateral?: boolean }) {
  const [itens, setItens] = useState<ItemParaPedido[]>([]);
  const [carrinho, setCarrinho] = useState<Carrinho>({});
  const [obs, setObs] = useState("");
  const [modalidade, setModalidade] = useState<Modalidade>(comMesa ? "mesa" : "retirada");
  const [regra, setRegra] = useState<RegraEntrega>("cliente");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    carregarItensParaPedido(estab).then(setItens);
    // Começa pela regra do lugar; a equipe pode abrir exceção.
    buscarRegraEntrega(estab).then((r) => {
      setRegra(r);
      if (comMesa && r !== "cliente") setModalidade(r);
    });
  }, [estab, comMesa]);

  const qtd = qtdNoCarrinho(carrinho);
  const enviar = async () => {
    setEnviando(true);
    setErro("");
    const { error } = await supabase.rpc("fazer_pedido", {
      p_comanda: comanda,
      p_itens: carrinhoParaBanco(carrinho),
      p_observacao: obs.trim() || null,
      p_cupom: null,
      p_modalidade: modalidade,
    });
    setEnviando(false);
    if (error) return setErro(mensagemDeErro(error));
    setCarrinho({});
    setObs("");
    enviado();
  };

  return (
    <div className={clsx("grid gap-5", lateral && "lg:grid-cols-[minmax(0,1fr)_260px]")}>
      <div className={clsx(lateral && "max-h-[560px] overflow-y-auto pr-1")}>
        <MontarPedido itens={itens} carrinho={carrinho} mudar={setCarrinho} compacto />
      </div>
      <div className="space-y-3">
        {comMesa && (
          <>
          <div className="grid grid-cols-2 gap-1 rounded-lg border border-borda p-1" role="radiogroup" aria-label="Atendimento">
            {(["mesa", "retirada"] as Modalidade[]).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={modalidade === m}
                onClick={() => setModalidade(m)}
                className={clsx("rounded-md py-1.5 text-[13px]", modalidade === m ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
              >
                {NOME_MODALIDADE[m]}
              </button>
            ))}
          </div>
          {regra !== "cliente" && modalidade !== regra && <p className="text-[12px] text-alerta">Exceção: a regra do lugar é {NOME_MODALIDADE[regra].toLowerCase()}.</p>}
          </>
        )}
        <label className="block">
          <span className="rotulo mb-1 block">Observação</span>
          <textarea rows={2} maxLength={300} className="entrada" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        <p className="flex justify-between text-sm font-semibold">
          <span>
            {qtd} {qtd === 1 ? "item" : "itens"}
          </span>
          <span className="codigo">{reais(totalDoCarrinho(carrinho, itens))}</span>
        </p>
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button className="botao-principal h-11 w-full" disabled={!qtd || enviando} onClick={() => void enviar()}>
          <Send className="h-4 w-4" />
          {enviando ? "Enviando..." : "Enviar pedido"}
        </button>
        <p className="text-[12px] text-suave">Cupons só valem quando o próprio cliente pede pelo App.</p>
      </div>
    </div>
  );
}
