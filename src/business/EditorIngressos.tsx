import { useEffect, useState } from "react";
import clsx from "clsx";
import { Plus, Save, Ticket, Trash2 } from "lucide-react";
import { Aviso } from "@/components/Formulario";
import { mensagemDeErro } from "@/lib/supabase";
import { carregarEditor, MODELOS_CANCELAMENTO, RegrasIngresso, salvarEditor, TipoEditor } from "@/lib/ingressos";

const novoTipo = (n: number): TipoEditor => ({
  nome: n === 0 ? "Pista" : "",
  descricao: "",
  meia_entrada: true,
  lotes: [{ nome: "Lote 1", preco: "", quantidade: "", vende_ate: "" }],
});

/** Ingressos à venda no cadastro do evento: tipos, lotes, cancelamento, transferência e limite por compra. */
export function EditorIngressos({ evento }: { evento: string }) {
  const [tipos, setTipos] = useState<TipoEditor[] | null>(null);
  const [regras, setRegras] = useState<RegrasIngresso | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [salvando, setSalvando] = useState(false);

  useEffect(() => {
    carregarEditor(evento)
      .then((r) => {
        setTipos(r.tipos);
        setRegras(r.regras);
      })
      .catch((e) => {
        setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
        setTipos([]);
      });
  }, [evento]);

  if (!tipos) return <p className="text-sm text-suave">Carregando ingressos...</p>;

  const mudarTipo = (i: number, t: Partial<TipoEditor>) => setTipos((l) => (l ?? []).map((x, n) => (n === i ? { ...x, ...t } : x)));
  const mudarLote = (i: number, j: number, campo: string, valor: string) =>
    setTipos((l) => (l ?? []).map((x, n) => (n === i ? { ...x, lotes: x.lotes.map((y, m) => (m === j ? { ...y, [campo]: valor } : y)) } : x)));

  const salvar = async () => {
    if (!regras) return;
    for (const t of tipos) {
      if (t.nome.trim().length < 2) return setAviso({ tipo: "erro", texto: "Dê um nome a cada tipo de ingresso (ex.: Pista, VIP)." });
      if (!t.lotes.length) return setAviso({ tipo: "erro", texto: `"${t.nome}" precisa de pelo menos um lote.` });
      for (const l of t.lotes) if (!Number(l.quantidade)) return setAviso({ tipo: "erro", texto: `Informe a quantidade de "${t.nome} · ${l.nome}".` });
    }
    setSalvando(true);
    setAviso(null);
    try {
      await salvarEditor(evento, tipos, regras);
      const r = await carregarEditor(evento);
      setTipos(r.tipos);
      setRegras(r.regras);
      setAviso({ tipo: "ok", texto: tipos.length ? "Ingressos salvos. Já aparecem no App como “Comprar”." : "Salvo. O evento está sem ingressos à venda." });
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    }
    setSalvando(false);
  };

  return (
    <section className="cartao space-y-4 p-4">
      <div className="flex items-center gap-2">
        <Ticket className="h-5 w-5 text-destaque" />
        <h2 className="flex-1 font-semibold">Ingressos à venda</h2>
        <button type="button" className="botao-principal h-9" disabled={salvando} onClick={() => void salvar()}>
          <Save className="h-4 w-4" />
          {salvando ? "Salvando..." : "Salvar ingressos"}
        </button>
      </div>
      <p className="text-[13px] text-suave">
        Cada tipo (Pista, VIP, Camarote...) tem lotes. Quando um lote esgota ou passa da data, o próximo abre sozinho. A taxa do RoVibes sai do seu repasse; o cliente paga só o preço anunciado.
      </p>
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {tipos.map((t, i) => (
        <div key={t.id ?? `novo-${i}`} className="rounded-lg border border-borda p-3">
          <div className="grid gap-2 sm:grid-cols-[1fr_1.5fr_auto]">
            <label className="block">
              <span className="rotulo mb-1 block">Tipo</span>
              <input className="entrada" value={t.nome} placeholder="Pista, VIP, Camarote" onChange={(e) => mudarTipo(i, { nome: e.target.value.slice(0, 60) })} />
            </label>
            <label className="block">
              <span className="rotulo mb-1 block">Descrição (opcional)</span>
              <input className="entrada" value={t.descricao} placeholder="Ex.: acesso ao mezanino e open bar até 0h" onChange={(e) => mudarTipo(i, { descricao: e.target.value.slice(0, 300) })} />
            </label>
            <button type="button" className="botao mt-5 h-10 text-perigo" onClick={() => setTipos((l) => (l ?? []).filter((_, n) => n !== i))} aria-label={`Tirar ${t.nome}`}>
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
          <label className="mt-2 flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={t.meia_entrada} onChange={(e) => mudarTipo(i, { meia_entrada: e.target.checked })} />
            Meia-entrada (metade do preço, até 40% de cada lote — obrigatória por lei em eventos pagos)
          </label>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead>
                <tr className="text-left text-[12px] text-suave">
                  <th className="pb-1 font-medium">Lote</th>
                  <th className="pb-1 font-medium">Preço (R$)</th>
                  <th className="pb-1 font-medium">Quantidade</th>
                  <th className="pb-1 font-medium">Vende até (opcional)</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {t.lotes.map((l, j) => (
                  <tr key={l.id ?? `l-${j}`}>
                    <td className="py-1 pr-2">
                      <input className="entrada h-9" value={l.nome} onChange={(e) => mudarLote(i, j, "nome", e.target.value.slice(0, 40))} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="entrada h-9" inputMode="decimal" placeholder="0 = grátis" value={l.preco} onChange={(e) => mudarLote(i, j, "preco", e.target.value.replace(/[^\d,.]/g, ""))} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="entrada h-9" inputMode="numeric" value={l.quantidade} onChange={(e) => mudarLote(i, j, "quantidade", e.target.value.replace(/\D/g, "").slice(0, 6))} />
                    </td>
                    <td className="py-1 pr-2">
                      <input className="entrada h-9" type="datetime-local" value={l.vende_ate} onChange={(e) => mudarLote(i, j, "vende_ate", e.target.value)} />
                    </td>
                    <td className="py-1">
                      <button
                        type="button"
                        className="rounded p-1.5 text-suave hover:text-perigo disabled:opacity-30"
                        disabled={t.lotes.length === 1}
                        onClick={() => setTipos((x) => (x ?? []).map((y, n) => (n === i ? { ...y, lotes: y.lotes.filter((_, m) => m !== j) } : y)))}
                        aria-label="Tirar lote"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button
            type="button"
            className="mt-1 text-[13px] font-semibold text-destaque"
            onClick={() => mudarTipo(i, { lotes: [...t.lotes, { nome: `Lote ${t.lotes.length + 1}`, preco: "", quantidade: "", vende_ate: "" }] })}
          >
            + Adicionar lote
          </button>
        </div>
      ))}
      <button type="button" className="botao" onClick={() => setTipos((l) => [...(l ?? []), novoTipo(l?.length ?? 0)])}>
        <Plus className="h-4 w-4" />
        Adicionar tipo de ingresso
      </button>

      {regras && (
        <div className="space-y-3 border-t border-borda pt-4">
          <div>
            <h3 className="font-semibold">Cancelamento</h3>
            <p className="text-[12px] text-suave">Sempre vale o direito de arrependimento: reembolso integral em até 7 dias da compra, se for antes do evento. Se você cancelar o evento, todos recebem 100%.</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Modelo de cancelamento">
              {(Object.keys(MODELOS_CANCELAMENTO) as RegrasIngresso["modelo"][]).map((m) => (
                <button
                  key={m}
                  type="button"
                  role="radio"
                  aria-checked={regras.modelo === m}
                  onClick={() => setRegras({ ...regras, modelo: m, prazo_horas: MODELOS_CANCELAMENTO[m].prazo_horas, percentual: MODELOS_CANCELAMENTO[m].percentual })}
                  className={clsx("rounded-lg border p-3 text-left", regras.modelo === m ? "border-marca bg-destaque-suave" : "border-borda hover:bg-elevado")}
                >
                  <span className={clsx("block text-sm font-semibold", regras.modelo === m && "text-destaque")}>{MODELOS_CANCELAMENTO[m].nome}</span>
                  <span className="block text-[12px] text-suave">{MODELOS_CANCELAMENTO[m].texto}</span>
                </button>
              ))}
            </div>
            {regras.modelo !== "rigida" && (
              <div className="mt-2 grid grid-cols-2 gap-2 sm:max-w-sm">
                <label className="block">
                  <span className="rotulo mb-1 block">Devolve (%)</span>
                  <input className="entrada" inputMode="numeric" value={regras.percentual} onChange={(e) => setRegras({ ...regras, percentual: Math.min(100, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                </label>
                <label className="block">
                  <span className="rotulo mb-1 block">Até quantas horas antes</span>
                  <input className="entrada" inputMode="numeric" value={regras.prazo_horas} onChange={(e) => setRegras({ ...regras, prazo_horas: Math.min(720, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                </label>
              </div>
            )}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <h3 className="font-semibold">Transferência</h3>
              <label className="mt-1 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-[rgb(var(--marca))]"
                  checked={regras.transferencia_horas != null}
                  onChange={(e) => setRegras({ ...regras, transferencia_horas: e.target.checked ? 2 : null })}
                />
                Permitir transferir para outra pessoa
              </label>
              {regras.transferencia_horas != null && (
                <label className="mt-2 block sm:max-w-[200px]">
                  <span className="rotulo mb-1 block">Até quantas horas antes</span>
                  <input className="entrada" inputMode="numeric" value={regras.transferencia_horas} onChange={(e) => setRegras({ ...regras, transferencia_horas: Math.min(720, Number(e.target.value.replace(/\D/g, "")) || 0) })} />
                </label>
              )}
              <p className="mt-1 text-[12px] text-suave">Quem compra vários sempre pode enviar os ingressos para os amigos. O ingresso é nominal: a portaria vê o nome e a foto do titular.</p>
            </div>
            <label className="block">
              <span className="font-semibold">Limite por compra</span>
              <input className="entrada mt-1 sm:max-w-[120px]" inputMode="numeric" value={regras.limite_por_compra} onChange={(e) => setRegras({ ...regras, limite_por_compra: Math.max(1, Math.min(50, Number(e.target.value.replace(/\D/g, "")) || 1)) })} />
            </label>
          </div>
        </div>
      )}
    </section>
  );
}
