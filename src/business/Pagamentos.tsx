import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { CreditCard, Percent, RefreshCw, Smartphone, Wallet } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { reais } from "@/components/Formulario";
import { useBusiness } from "@/lib/acessos";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_MEIO } from "@/lib/salao";

interface Linha {
  id: string;
  origem: "app" | "caixa";
  meio: string | null;
  valor: number;
  comissao: number;
  situacao: string;
  criado_em: string;
  aprovado_em: string | null;
  comanda: { nome: string | null; mesa: { numero: string } | null } | null;
}

const PERIODOS = [
  { v: 1, nome: "Hoje" },
  { v: 7, nome: "7 dias" },
  { v: 30, nome: "30 dias" },
];

/** G1003 — Pagamentos: taxa de serviço, conta do Mercado Pago e o que entrou. */
export function Pagamentos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [taxa, setTaxa] = useState("");
  const [periodo, setPeriodo] = useState(1);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const desde = new Date();
    desde.setHours(0, 0, 0, 0);
    desde.setDate(desde.getDate() - (periodo - 1));
    const [e, p] = await Promise.all([
      supabase.from("estabelecimentos").select("taxa_servico").eq("id", id).maybeSingle(),
      supabase
        .from("pagamentos")
        .select("id, origem, meio, valor, comissao, situacao, criado_em, aprovado_em, comanda:comandas(nome, mesa:mesas(numero))")
        .eq("estabelecimento_id", id)
        .gte("criado_em", desde.toISOString())
        .order("criado_em", { ascending: false })
        .limit(500),
    ]);
    if (e.data) setTaxa(String((e.data as { taxa_servico: number }).taxa_servico ?? 0).replace(".", ","));
    if (p.error && /relation|does not exist|schema cache/i.test(p.error.message)) setAviso({ tipo: "erro", texto: "Falta aplicar a atualização 017 do banco." });
    setLinhas(((p.data ?? []) as unknown as Linha[]).map((x) => ({ ...x, valor: Number(x.valor), comissao: Number(x.comissao) })));
  }, [id, periodo]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const aprovados = linhas.filter((l) => l.situacao === "aprovado");
  const total = aprovados.reduce((s, l) => s + l.valor, 0);
  const porMeio = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of aprovados) {
      const k = l.origem === "app" ? "App" : NOME_MEIO[l.meio ?? "outro"];
      m.set(k, (m.get(k) ?? 0) + l.valor);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [aprovados]);

  const salvarTaxa = async (e: FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const v = Number(taxa.replace(",", "."));
    const { error } = await supabase.rpc("definir_taxa_servico", { p_estab: id, p_taxa: v });
    setAviso(error ? { tipo: "erro", texto: mensagemDeErro(error) } : { tipo: "ok", texto: "Taxa de serviço salva. Vale para as próximas comandas abertas." });
  };

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  return (
    <TelaUniversal
      acoes={
        <button className="botao" onClick={() => void carregar()}>
          <RefreshCw className="h-4 w-4" />
          Atualizar
        </button>
      }
    >
      {aviso && (
        <p role="status" className={clsx("cartao px-4 py-3 text-sm", aviso.tipo === "ok" ? "border-ok/40 text-ok" : "border-perigo/40 text-perigo")}>
          {aviso.texto}
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cartao space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <Percent className="h-4 w-4 text-destaque" />
            Taxa de serviço
          </h2>
          <form onSubmit={(e) => void salvarTaxa(e)} className="flex items-end gap-2">
            <label className="w-32">
              <span className="rotulo mb-1 block">Percentual</span>
              <span className="relative block">
                <input value={taxa} onChange={(e) => setTaxa(e.target.value.replace(/[^\d,]/g, ""))} inputMode="decimal" className="entrada pr-8" />
                <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-suave">%</span>
              </span>
            </label>
            <button type="submit" className="botao-principal h-10">
              Salvar
            </button>
          </form>
          <p className="text-[13px] text-suave">Opcional (0 a 20%). Aparece separado na conta do cliente, e o garçom pode tirar a pedido do cliente.</p>
        </section>

        <section className="cartao space-y-3 p-4">
          <h2 className="flex items-center gap-2 font-semibold">
            <CreditCard className="h-4 w-4 text-destaque" />
            Mercado Pago
          </h2>
          <p className="text-sm">Receba pelo App (Pix e cartão) direto na conta do Mercado Pago do seu estabelecimento.</p>
          <button className="botao w-full" disabled title="Disponível na próxima etapa">
            Conectar Mercado Pago (em breve)
          </button>
          <p className="text-[13px] text-suave">O RoVibes fica com 3% de cada pagamento feito pelo App. Pagamentos no caixa não têm comissão.</p>
        </section>
      </div>

      <section className="cartao p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="font-semibold">Recebido</h2>
          <div className="flex gap-1 rounded-lg bg-elevado p-0.5" role="tablist">
            {PERIODOS.map((p) => (
              <button key={p.v} role="tab" aria-selected={periodo === p.v} onClick={() => setPeriodo(p.v)} className={clsx("rounded-md px-3 py-1 text-[13px]", periodo === p.v ? "bg-superficie font-semibold shadow-sm" : "text-suave")}>
                {p.nome}
              </button>
            ))}
          </div>
        </div>
        <p className="codigo mt-3 text-3xl font-semibold">{reais(total)}</p>
        <p className="text-[13px] text-suave">{aprovados.length} {aprovados.length === 1 ? "pagamento" : "pagamentos"}</p>
        {porMeio.length > 0 && (
          <ul className="mt-3 flex flex-wrap gap-2">
            {porMeio.map(([k, v]) => (
              <li key={k} className="rounded-lg bg-elevado px-3 py-1.5 text-[13px]">
                {k}: <strong className="codigo">{reais(v)}</strong>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borda bg-elevado/60">
              <tr>
                {["Quando", "Comanda", "Origem", "Forma", "Valor", "Situação"].map((c) => (
                  <th key={c} className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.id} className="border-b border-borda last:border-0">
                  <td className="codigo whitespace-nowrap px-4 py-2.5 text-[13px]">{new Date(l.aprovado_em ?? l.criado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}</td>
                  <td className="px-4 py-2.5">{l.comanda?.mesa ? `Mesa ${l.comanda.mesa.numero}` : l.comanda?.nome ?? "—"}</td>
                  <td className="px-4 py-2.5">
                    <span className="inline-flex items-center gap-1">
                      {l.origem === "app" ? <Smartphone className="h-3.5 w-3.5" /> : <Wallet className="h-3.5 w-3.5" />}
                      {l.origem === "app" ? "App" : "Caixa"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">{NOME_MEIO[l.meio ?? ""] ?? "—"}</td>
                  <td className="codigo px-4 py-2.5 font-medium">{reais(l.valor)}</td>
                  <td className={clsx("px-4 py-2.5 text-[13px] font-medium", l.situacao === "aprovado" ? "text-ok" : l.situacao === "pendente" ? "text-alerta" : "text-suave")}>
                    {{ aprovado: "Aprovado", pendente: "Pendente", recusado: "Recusado", cancelado: "Cancelado", estornado: "Estornado" }[l.situacao] ?? l.situacao}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {linhas.length === 0 && <p className="px-6 py-10 text-center text-sm text-suave">Nenhum pagamento no período.</p>}
      </section>
    </TelaUniversal>
  );
}
