import { FormEvent, useMemo, useState } from "react";
import clsx from "clsx";
import { ArrowDownToLine, ArrowRightLeft, BookOpen, ClipboardCheck, PackageX, X } from "lucide-react";
import { mensagemDeErro } from "@/lib/supabase";
import { CAMPOS_PRODUTO, formatarQtd, lerNumero, LocalEstoque, movimentar, normalizarProduto, ProdutoEstoque, TipoMovimento } from "@/lib/estoque";
import { supabase } from "@/lib/supabase";
import { BuscaBiblioteca } from "./BuscaBiblioteca";

const TIPOS: { id: TipoMovimento; nome: string; icone: typeof ArrowRightLeft; gestao?: boolean }[] = [
  { id: "transferencia", nome: "Transferir", icone: ArrowRightLeft },
  { id: "perda", nome: "Perda / quebra", icone: PackageX },
  { id: "entrada", nome: "Entrada", icone: ArrowDownToLine, gestao: true },
  { id: "ajuste", nome: "Ajuste", icone: ClipboardCheck, gestao: true },
];

/** Janela de movimentação de estoque: transferir entre locais, perda, entrada e ajuste (estes dois só para a gestão). */
export function MovimentarEstoque({
  estab,
  produtos: produtosIniciais,
  locais,
  saldos,
  gestao,
  inicial,
  fechar,
  concluido,
}: {
  estab: string;
  produtos: ProdutoEstoque[];
  locais: LocalEstoque[];
  saldos: Map<string, number>;
  gestao: boolean;
  inicial?: { produto?: string; tipo?: TipoMovimento; local?: string };
  fechar: () => void;
  concluido: (texto: string) => void;
}) {
  const ativos = locais.filter((l) => l.ativo);
  const [extras, setExtras] = useState<ProdutoEstoque[]>([]);
  const [biblioteca, setBiblioteca] = useState(false);
  const produtos = useMemo(() => [...produtosIniciais, ...extras.filter((x) => !produtosIniciais.some((p) => p.id === x.id))], [produtosIniciais, extras]);
  const [tipo, setTipo] = useState<TipoMovimento>(inicial?.tipo ?? "transferencia");
  const [produtoId, setProdutoId] = useState(inicial?.produto ?? "");
  const [busca, setBusca] = useState("");
  const [local, setLocal] = useState(inicial?.local ?? "");
  const [destino, setDestino] = useState("");
  const [quantidade, setQuantidade] = useState("");
  const [emEmbalagem, setEmEmbalagem] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [validade, setValidade] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const produto = produtos.find((p) => p.id === produtoId) ?? null;

  // Produto escolhido na biblioteca: já entrou no estoque; busca os dados dele para continuar a entrada.
  const daBiblioteca = async (id: string) => {
    setBiblioteca(false);
    const { data } = await supabase.from("estoque_produtos").select(CAMPOS_PRODUTO).eq("id", id).maybeSingle();
    if (data) setExtras((l) => [...l, normalizarProduto(data as unknown as Record<string, unknown>)]);
    setProdutoId(id);
  };
  const saldoEm = (l: string) => (produto ? saldos.get(`${produto.id}:${l}`) ?? 0 : 0);
  const localEfetivo = local || produto?.local_padrao_id || ativos[0]?.id || "";
  const opcoes = useMemo(() => {
    const t = busca.trim().toLowerCase();
    return produtos.filter((p) => p.ativo && (!t || `${p.nome} ${p.codigo ?? ""} ${p.ean ?? ""}`.toLowerCase().includes(t))).slice(0, 30);
  }, [produtos, busca]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    const q = lerNumero(quantidade);
    if (!produto) return setErro("Escolha o produto.");
    if (q == null || q < 0 || (tipo !== "ajuste" && q === 0)) return setErro("Informe a quantidade.");
    setOcupado(true);
    try {
      await movimentar({
        produto: produto.id,
        tipo,
        quantidade: q,
        motivo: motivo || null,
        local: localEfetivo || null,
        destino: tipo === "transferencia" ? destino : null,
        emEmbalagem: tipo === "entrada" && emEmbalagem,
        validade: validade || null,
      });
      const nomeLocal = (id: string) => locais.find((l) => l.id === id)?.nome ?? "";
      const qtdTxt = `${formatarQtd(tipo === "entrada" && emEmbalagem ? q * (produto.embalagem_fator ?? 1) : q)} ${produto.unidade}`;
      concluido(
        tipo === "transferencia"
          ? `${qtdTxt} de ${produto.nome}: ${nomeLocal(localEfetivo)} → ${nomeLocal(destino)}.`
          : tipo === "ajuste"
            ? `${produto.nome} em ${nomeLocal(localEfetivo)} ajustado para ${qtdTxt}.`
            : `${tipo === "entrada" ? "Entrada" : "Perda"} de ${qtdTxt} de ${produto.nome} em ${nomeLocal(localEfetivo)}.`,
      );
    } catch (er) {
      setErro(mensagemDeErro(er));
    }
    setOcupado(false);
  };

  return (
    <>
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Movimentar estoque" onClick={fechar}>
      <form onSubmit={(e) => void enviar(e)} onClick={(e) => e.stopPropagation()} className="folha max-h-[94vh] w-full max-w-md space-y-4 overflow-y-auto rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Movimentar estoque</h2>
          <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={clsx("grid gap-1.5", gestao ? "grid-cols-4" : "grid-cols-2")} role="group" aria-label="Tipo">
          {TIPOS.filter((t) => gestao || !t.gestao).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTipo(t.id)}
              aria-pressed={tipo === t.id}
              className={clsx("flex flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[12px]", tipo === t.id ? "border-marca bg-destaque-suave font-semibold text-destaque" : "border-borda")}
            >
              <t.icone className="h-4 w-4" />
              {t.nome}
            </button>
          ))}
        </div>

        <div>
          <span className="rotulo mb-1 block">Produto</span>
          {produto ? (
            <div className="flex items-center gap-2 rounded-lg border border-marca bg-destaque-suave px-3 py-2 text-sm">
              <span className="min-w-0 flex-1 truncate font-medium">{produto.nome}</span>
              <button type="button" className="text-[13px] font-semibold text-destaque" onClick={() => setProdutoId("")}>
                Trocar
              </button>
            </div>
          ) : (
            <div className="rounded-lg border border-borda">
              <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome, código ou código de barras" className="h-10 w-full rounded-t-lg border-b border-borda bg-fundo px-3 text-sm focus:outline-none" />
              <ul className="max-h-48 overflow-y-auto">
                {opcoes.map((p) => (
                  <li key={p.id}>
                    <button type="button" onClick={() => setProdutoId(p.id)} className="flex w-full justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-elevado">
                      <span className="truncate">{p.nome}</span>
                      <span className="codigo shrink-0 text-suave">
                        {formatarQtd(p.saldo)} {p.unidade}
                      </span>
                    </button>
                  </li>
                ))}
                {opcoes.length === 0 && <li className="px-3 py-3 text-sm text-suave">Nenhum produto do seu estoque com esse nome.</li>}
              </ul>
              {tipo === "entrada" && gestao && (
                <button type="button" onClick={() => setBiblioteca(true)} className="flex w-full items-center gap-2 border-t border-borda px-3 py-2.5 text-left text-sm font-semibold text-destaque hover:bg-elevado">
                  <BookOpen className="h-4 w-4" />
                  Incluir produto da Biblioteca RoVibes (ler código de barras)
                </button>
              )}
            </div>
          )}
        </div>

        {produto && (
          <>
            <div className={clsx("grid gap-2", tipo === "transferencia" && "grid-cols-2")}>
              <label className="block">
                <span className="rotulo mb-1 block">{tipo === "transferencia" ? "De" : "Local"}</span>
                <select className="entrada" value={localEfetivo} onChange={(e) => setLocal(e.target.value)}>
                  {ativos.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.nome} ({formatarQtd(saldoEm(l.id))})
                    </option>
                  ))}
                </select>
              </label>
              {tipo === "transferencia" && (
                <label className="block">
                  <span className="rotulo mb-1 block">Para</span>
                  <select className="entrada" value={destino} onChange={(e) => setDestino(e.target.value)}>
                    <option value="">Escolha...</option>
                    {ativos
                      .filter((l) => l.id !== localEfetivo)
                      .map((l) => (
                        <option key={l.id} value={l.id}>
                          {l.nome} ({formatarQtd(saldoEm(l.id))})
                        </option>
                      ))}
                  </select>
                </label>
              )}
            </div>

            <div className="flex items-end gap-2">
              <label className="min-w-0 flex-1">
                <span className="rotulo mb-1 block">{tipo === "ajuste" ? "Quantidade contada" : "Quantidade"}</span>
                <span className="relative block">
                  <input value={quantidade} onChange={(e) => setQuantidade(e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" className="entrada pr-16" />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-suave">
                    {tipo === "entrada" && emEmbalagem ? (produto.embalagem_nome ?? "emb.").toLowerCase() : produto.unidade}
                  </span>
                </span>
              </label>
              {tipo === "entrada" && produto.embalagem_fator && produto.embalagem_fator > 1 && (
                <button type="button" onClick={() => setEmEmbalagem(!emEmbalagem)} aria-pressed={emEmbalagem} className={clsx("botao h-10 px-3 text-[13px]", emEmbalagem && "border-marca text-destaque")}>
                  Em {(produto.embalagem_nome ?? "embalagem").toLowerCase()} ({formatarQtd(produto.embalagem_fator)})
                </button>
              )}
            </div>
            {tipo === "transferencia" && (
              <button type="button" className="-mt-2 text-[13px] font-medium text-destaque" onClick={() => setQuantidade(String(saldoEm(localEfetivo)).replace(".", ","))}>
                Transferir tudo ({formatarQtd(saldoEm(localEfetivo))} {produto.unidade})
              </button>
            )}
            {(tipo === "perda" || tipo === "ajuste" || tipo === "transferencia") && (
              <label className="block">
                <span className="rotulo mb-1 block">{tipo === "perda" ? "Motivo (obrigatório)" : "Observação (opcional)"}</span>
                <input value={motivo} onChange={(e) => setMotivo(e.target.value.slice(0, 120))} placeholder={tipo === "perda" ? "Quebra, vencido, uso interno..." : ""} className="entrada" />
              </label>
            )}
            {tipo === "entrada" && produto.controla_validade && (
              <label className="block">
                <span className="rotulo mb-1 block">Validade do lote</span>
                <input type="date" value={validade} onChange={(e) => setValidade(e.target.value)} className="entrada" />
              </label>
            )}
          </>
        )}

        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button type="submit" className="botao-principal h-11 w-full" disabled={ocupado || !produto}>
          {ocupado ? "Salvando..." : "Confirmar"}
        </button>
      </form>
    </div>
    {biblioteca && <BuscaBiblioteca estab={estab} escolhido={(id) => void daBiblioteca(id)} fechar={() => setBiblioteca(false)} />}
    </>
  );
}
