import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { BadgePercent, Banknote, CreditCard, QrCode, Smartphone, Wallet, X } from "lucide-react";
import { reais } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { buscarPagamentos, buscarTotais, NOME_MEIO, PagamentoComanda, Totais, useAoVivo } from "@/lib/salao";
import { Desconto } from "./DetalheComanda";

const MEIOS: { v: string; nome: string; icone: typeof Banknote }[] = [
  { v: "dinheiro", nome: "Dinheiro", icone: Banknote },
  { v: "pix", nome: "Pix", icone: QrCode },
  { v: "debito", nome: "Débito", icone: CreditCard },
  { v: "credito", nome: "Crédito", icone: CreditCard },
];

const paraNumero = (t: string) => Number(t.replace(/\./g, "").replace(",", ".")) || 0;
const paraTexto = (v: number) => v.toFixed(2).replace(".", ",");

/** Conta da comanda para a equipe: serviço, pago, quanto falta e registro de pagamento no caixa. */
export function PagamentosComanda({
  comanda,
  descontos,
  supervisor,
  aoMudar,
  aoErro,
}: {
  comanda: string;
  descontos: Desconto[];
  supervisor: boolean;
  aoMudar: () => void;
  aoErro: (t: string) => void;
}) {
  const [t, setT] = useState<Totais | null>(null);
  const [pagos, setPagos] = useState<PagamentoComanda[]>([]);
  const [registrando, setRegistrando] = useState(false);
  const [valor, setValor] = useState("");
  const [meio, setMeio] = useState("dinheiro");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [a, b] = await Promise.all([buscarTotais(comanda), buscarPagamentos(comanda)]);
    setT(a);
    setPagos(b);
  }, [comanda]);
  useEffect(() => {
    void carregar();
  }, [carregar]);
  useAoVivo(`pag-${comanda}`, { pagamentos: `comanda_id=eq.${comanda}` }, () => void carregar());

  if (!t) return null;

  const registrar = async (e: FormEvent) => {
    e.preventDefault();
    const v = paraNumero(valor);
    if (v <= 0) return aoErro("Informe o valor recebido.");
    setOcupado(true);
    const { data, error } = await supabase.rpc("registrar_pagamento_caixa", { p_comanda: comanda, p_valor: v, p_meio: meio, p_observacao: null });
    setOcupado(false);
    if (error) return aoErro(mensagemDeErro(error));
    setRegistrando(false);
    await carregar();
    aoMudar();
    if (data) window.alert("Conta quitada. A comanda foi fechada.");
  };

  const servico = async (tirar: boolean) => {
    const { error } = await supabase.rpc("tirar_servico", { p_comanda: comanda, p_tirar: tirar });
    if (error) return aoErro(mensagemDeErro(error));
    await carregar();
    aoMudar();
  };

  const cancelar = async (p: PagamentoComanda) => {
    const motivo = window.prompt(`Motivo para cancelar o pagamento de ${reais(p.valor)}:`);
    if (!motivo?.trim()) return;
    const { error } = await supabase.rpc("cancelar_pagamento", { p_pagamento: p.id, p_motivo: motivo });
    if (error) return aoErro(mensagemDeErro(error));
    await carregar();
    aoMudar();
  };

  return (
    <div className="ml-auto w-full max-w-sm space-y-3 text-sm">
      <div className="space-y-1">
        <p className="flex justify-between">
          <span className="text-suave">Itens</span>
          <span className="codigo">{reais(t.subtotal)}</span>
        </p>
        {descontos.map((d, i) => (
          <p key={i} className="flex justify-between text-ok">
            <span className="flex items-center gap-1">
              <BadgePercent className="h-3.5 w-3.5" />
              {d.titulo}
            </span>
            <span className="codigo">−{reais(d.valor)}</span>
          </p>
        ))}
        <p className="flex items-center justify-between">
          <span className="text-suave">
            Serviço {t.taxa_servico > 0 ? `(${String(t.taxa_servico).replace(".", ",")}%)` : ""}
            <button className="ml-2 text-[12px] font-medium text-destaque" onClick={() => void servico(t.taxa_servico > 0)}>
              {t.taxa_servico > 0 ? "Tirar" : "Incluir"}
            </button>
          </span>
          <span className="codigo">{reais(t.servico)}</span>
        </p>
        <p className="flex justify-between border-t border-borda pt-1 text-base font-semibold">
          <span>Total</span>
          <span className="codigo">{reais(t.total)}</span>
        </p>
        {t.pago > 0 && (
          <p className="flex justify-between text-ok">
            <span>Pago</span>
            <span className="codigo">−{reais(t.pago)}</span>
          </p>
        )}
        <p className={clsx("flex justify-between text-base font-bold", t.falta > 0 ? "text-texto" : "text-ok")}>
          <span>{t.falta > 0 ? "Falta pagar" : "Conta quitada"}</span>
          <span className="codigo">{reais(t.falta)}</span>
        </p>
        {t.pendente > 0 && <p className="text-[12px] text-alerta">{reais(t.pendente)} sendo pago pelo App agora.</p>}
      </div>

      {pagos.length > 0 && (
        <ul className="divide-y divide-borda rounded-lg bg-elevado/60">
          {pagos.map((p) => (
            <li key={p.id} className={clsx("flex items-center gap-2 px-3 py-2 text-[13px]", p.situacao !== "aprovado" && "line-through opacity-60")}>
              {p.origem === "app" ? <Smartphone className="h-3.5 w-3.5 text-destaque" /> : <Wallet className="h-3.5 w-3.5 text-suave" />}
              <span className="min-w-0 flex-1 truncate">
                {p.origem === "app" ? `${p.quem ?? "Cliente"} pelo App` : `Caixa · ${NOME_MEIO[p.meio ?? "outro"]}`}
                <span className="text-suave"> · {new Date(p.criado_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</span>
              </span>
              <span className="codigo font-semibold">{reais(p.valor)}</span>
              {supervisor && p.origem === "caixa" && p.situacao === "aprovado" && (
                <button className="rounded p-0.5 text-suave hover:text-perigo" onClick={() => void cancelar(p)} aria-label="Cancelar pagamento">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {t.falta > 0 &&
        (registrando ? (
          <form onSubmit={(e) => void registrar(e)} className="space-y-2 rounded-lg border border-borda p-3">
            <p className="font-semibold">Receber no caixa</p>
            <div className="grid grid-cols-4 gap-1.5">
              {MEIOS.map((m) => (
                <button
                  key={m.v}
                  type="button"
                  onClick={() => setMeio(m.v)}
                  aria-pressed={meio === m.v}
                  className={clsx("flex flex-col items-center gap-1 rounded-lg border py-2 text-[12px]", meio === m.v ? "border-marca bg-destaque-suave font-semibold text-destaque" : "border-borda")}
                >
                  <m.icone className="h-4 w-4" />
                  {m.nome}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <label className="relative min-w-0 flex-1">
                <span className="sr-only">Valor recebido</span>
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-suave">R$</span>
                <input value={valor} onChange={(e) => setValor(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" className="entrada pl-9" />
              </label>
              <button type="submit" className="botao-principal h-10 px-4" disabled={ocupado}>
                Registrar
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5 text-[12px]">
              <button type="button" className="rounded-full bg-elevado px-2.5 py-1" onClick={() => setValor(paraTexto(t.falta))}>
                Tudo ({reais(t.falta)})
              </button>
              {t.pessoas > 1 && (
                <button type="button" className="rounded-full bg-elevado px-2.5 py-1" onClick={() => setValor(paraTexto(Math.min(t.falta, Math.round((t.total / t.pessoas) * 100) / 100)))}>
                  1/{t.pessoas} ({reais(Math.min(t.falta, t.total / t.pessoas))})
                </button>
              )}
              <button type="button" className="ml-auto text-suave" onClick={() => setRegistrando(false)}>
                Cancelar
              </button>
            </div>
          </form>
        ) : (
          <button
            className="botao w-full"
            onClick={() => {
              setValor(paraTexto(t.falta));
              setRegistrando(true);
            }}
          >
            <Wallet className="h-4 w-4" />
            Receber no caixa
          </button>
        ))}
    </div>
  );
}
