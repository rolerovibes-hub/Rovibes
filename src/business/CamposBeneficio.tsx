import { useEffect, useState } from "react";
import { Campo } from "@/components/Formulario";
import { supabase } from "@/lib/supabase";
import { TipoBeneficio } from "@/lib/beneficio";

export interface ValoresBeneficio {
  tipo: TipoBeneficio;
  valor: string;
  item_id: string;
  pedido_minimo: string;
}

export const beneficioVazio = (): ValoresBeneficio => ({ tipo: "percentual", valor: "", item_id: "", pedido_minimo: "" });

const numero = (t: string) => {
  const limpo = t.trim().replace(/^R\$\s*/, "");
  const v = Number(limpo.includes(",") ? limpo.replace(/\./g, "").replace(",", ".") : limpo);
  return t.trim() && Number.isFinite(v) ? v : null;
};

/** Converte o formulário para as colunas do banco, conferindo os campos obrigatórios. */
export function beneficioParaBanco(b: ValoresBeneficio) {
  const valor = numero(b.valor);
  if (b.tipo !== "item_gratis" && (valor == null || valor <= 0)) throw new Error("Informe o valor do desconto.");
  if (b.tipo === "percentual" && valor! > 100) throw new Error("O desconto em % vai até 100.");
  if (b.tipo === "item_gratis" && !b.item_id) throw new Error("Escolha o item grátis do cardápio.");
  const minimo = numero(b.pedido_minimo);
  return {
    tipo: b.tipo,
    valor: b.tipo === "item_gratis" ? null : valor,
    item_id: b.tipo === "item_gratis" ? b.item_id : null,
    pedido_minimo: minimo && minimo > 0 ? minimo : null,
  };
}

export const beneficioDoBanco = (r: { tipo: TipoBeneficio; valor: number | null; item_id: string | null; pedido_minimo: number | null }): ValoresBeneficio => ({
  tipo: r.tipo,
  valor: r.valor == null ? "" : String(r.valor).replace(".", ","),
  item_id: r.item_id ?? "",
  pedido_minimo: r.pedido_minimo == null ? "" : String(r.pedido_minimo).replace(".", ","),
});

/** Itens do cardápio para o "item grátis". */
export function useItensCardapio(estab: string | undefined) {
  const [itens, setItens] = useState<{ id: string; nome: string }[]>([]);
  useEffect(() => {
    if (!estab) return;
    supabase
      .from("cardapio_itens")
      .select("id, nome")
      .eq("estabelecimento_id", estab)
      .order("nome")
      .then(({ data }) => setItens((data ?? []) as { id: string; nome: string }[]));
  }, [estab]);
  return itens;
}

export function CamposBeneficio({
  valores,
  mudar,
  itens,
}: {
  valores: ValoresBeneficio;
  mudar: (v: ValoresBeneficio) => void;
  itens: { id: string; nome: string }[];
}) {
  return (
    <>
      <Campo rotulo="Benefício">
        <select className="entrada" value={valores.tipo} onChange={(e) => mudar({ ...valores, tipo: e.target.value as TipoBeneficio })}>
          <option value="percentual">Desconto em %</option>
          <option value="valor">Desconto em R$</option>
          <option value="item_gratis">Item grátis do cardápio</option>
        </select>
      </Campo>
      {valores.tipo === "item_gratis" ? (
        <Campo rotulo="Item grátis">
          <select className="entrada" value={valores.item_id} onChange={(e) => mudar({ ...valores, item_id: e.target.value })}>
            <option value="">Escolha um item</option>
            {itens.map((i) => (
              <option key={i.id} value={i.id}>
                {i.nome}
              </option>
            ))}
          </select>
        </Campo>
      ) : (
        <Campo rotulo={valores.tipo === "percentual" ? "Desconto (%)" : "Desconto (R$)"}>
          <input
            inputMode="decimal"
            className="entrada"
            placeholder={valores.tipo === "percentual" ? "20" : "10,00"}
            value={valores.valor}
            onChange={(e) => mudar({ ...valores, valor: e.target.value })}
          />
        </Campo>
      )}
      <Campo rotulo="Pedido mínimo (R$, opcional)">
        <input inputMode="decimal" className="entrada" placeholder="Sem mínimo" value={valores.pedido_minimo} onChange={(e) => mudar({ ...valores, pedido_minimo: e.target.value })} />
      </Campo>
    </>
  );
}
