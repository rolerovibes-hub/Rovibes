import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Armchair, ArrowLeft, Minus, Plus, ReceiptText, ScanLine, ShoppingBag, UtensilsCrossed, X } from "lucide-react";
import { reais } from "@/components/Formulario";
import { guardarCarrinho } from "@/lib/salao";
import { buscarModelo, ModeloAtendimento } from "@/lib/salao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useAcessoRapido } from "./estadoAcesso";
import { Carregando } from "@/components/Carregando";
import { DetalheItemCardapio, ItemVisual, LinhaItemCardapio } from "@/components/VisualCardapio";
import { agruparCardapio } from "./dados";
import { LugarNaoEncontrado, useLugar } from "./LugarPagina";

export function CardapioPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const dados = useLugar(id);
  const [aberto, setAberto] = useState<ItemVisual | null>(null);
  const [modelo, setModelo] = useState<ModeloAtendimento | null | undefined>(undefined);
  const [escolhendoMesa, setEscolhendoMesa] = useState(false);
  const [abrindo, setAbrindo] = useState(false);
  const [erro, setErro] = useState("");
  const [carrinho, setCarrinho] = useState<Record<string, number>>({});
  const [revisando, setRevisando] = useState(false);
  const { setLendo } = useAcessoRapido();

  useEffect(() => {
    buscarModelo(id).then(setModelo);
  }, [id]);

  // Entra na comanda (mesa da lista ou balcão) e já abre a escolha dos itens.
  const abrirComanda = async (rpc: "entrar_na_mesa_id" | "abrir_pedido_balcao", args: Record<string, string>) => {
    setAbrindo(true);
    setErro("");
    const { data, error } = await supabase.rpc(rpc, args);
    setAbrindo(false);
    if (error) return setErro(mensagemDeErro(error));
    guardarCarrinho(id, carrinho);
    navegar(`/comanda/${data as string}?pedir=1`);
  };

  // Finalizar: segue o jeito de pedir que o lugar escolheu (balcão, mesa da lista, comanda aberta ou QR).
  const finalizar = () => {
    setRevisando(false);
    if (modelo?.minha_comanda) {
      guardarCarrinho(id, carrinho);
      return navegar(`/comanda/${modelo.minha_comanda}?pedir=1`);
    }
    if (modelo && !modelo.tem_mesas) return void abrirComanda("abrir_pedido_balcao", { p_estab: id });
    if (modelo && !modelo.exige_qr) return setEscolhendoMesa(true);
    // QR obrigatório: guarda o pedido e abre o leitor; depois de ler a mesa, ele já aparece para revisar.
    guardarCarrinho(id, carrinho);
    setLendo(true);
  };
  const mudarQtd = (item: string, d: number) =>
    setCarrinho((c) => {
      const n = Math.max(0, Math.min(50, (c[item] ?? 0) + d));
      const novo = { ...c };
      if (n === 0) delete novo[item];
      else novo[item] = n;
      return novo;
    });

  if (!dados) return <Carregando />;
  if (!dados.lugar) return <LugarNaoEncontrado />;
  const grupos = agruparCardapio(dados.categorias, dados.itens);
  // Sem a atualização 035 (modelo null) vale o jeito antigo: QR da mesa.
  const podePedir = modelo !== undefined && grupos.length > 0;
  const qtdTotal = Object.values(carrinho).reduce((s, n) => s + n, 0);
  const valorTotal = dados.itens.reduce((s, i) => s + (i.preco ?? 0) * (carrinho[i.id] ?? 0), 0);

  const irPara = (grupo: string) => document.getElementById(`grupo-${grupo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="pb-32">
      <div className="sticky top-14 z-20 border-b border-borda bg-fundo/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navegar(-1)} className="botao h-9 w-9 shrink-0 px-0" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-semibold leading-tight">Cardápio</h1>
            <p className="truncate text-[13px] text-suave">{dados.lugar.nome}</p>
          </div>
        </div>
        {grupos.length > 1 && (
          <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {grupos.map((g) => (
              <button key={g.id} onClick={() => irPara(g.id)} className="shrink-0 rounded-full border border-borda bg-superficie px-3.5 py-1.5 text-sm hover:bg-elevado">
                {g.nome}
              </button>
            ))}
          </nav>
        )}
      </div>

      {grupos.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Cardápio ainda não publicado</p>
        </div>
      ) : (
        <div className="space-y-6 px-4 pt-5">
          {grupos.map((g) => (
            <section key={g.id} id={`grupo-${g.id}`} className="scroll-mt-32">
              <h2 className="mb-2.5 text-[17px] font-semibold">{g.nome}</h2>
              <ul className="cartao divide-y divide-borda">
                {g.itens.map((i) => (
                  <li key={i.id}>
                    <LinhaItemCardapio
                      item={i}
                      aoAbrir={() => setAberto(i)}
                      extra={podePedir && i.preco != null && !i.esgotado ? <Quantidade n={carrinho[i.id] ?? 0} mudar={(d) => mudarQtd(i.id, d)} /> : undefined}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {aberto && (
        <DetalheItemCardapio
          item={aberto}
          lugar={dados.lugar.nome}
          fechar={() => setAberto(null)}
          rodape={
            podePedir && aberto.preco != null && !aberto.esgotado ? (
              <div className="flex items-center gap-3 pt-3">
                <Quantidade n={carrinho[aberto.id] ?? 0} mudar={(d) => mudarQtd(aberto.id, d)} grande />
                <button
                  className="botao-principal h-11 flex-1 rounded-full"
                  onClick={() => {
                    if (!carrinho[aberto.id]) mudarQtd(aberto.id, 1);
                    setAberto(null);
                  }}
                >
                  {carrinho[aberto.id] ? "Pronto" : "Adicionar ao pedido"}
                </button>
              </div>
            ) : undefined
          }
        />
      )}

      {/* Como pedir: o lugar decide (mesa com QR, mesa escolhida na lista ou balcão com pagamento na hora). */}
      {podePedir && qtdTotal > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl px-4 pb-3">
          {erro && <p className="mb-2 rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
          <button className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg" disabled={abrindo} onClick={() => setRevisando(true)}>
            <ShoppingBag className="h-5 w-5" />
            {abrindo ? "Abrindo..." : `Ver pedido · ${qtdTotal} ${qtdTotal === 1 ? "item" : "itens"} · ${reais(valorTotal)}`}
          </button>
        </div>
      )}

      {revisando && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Seu pedido" onClick={() => setRevisando(false)}>
          <div className="folha max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Seu pedido</h2>
              <button onClick={() => setRevisando(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <ul className="divide-y divide-borda">
              {dados.itens
                .filter((i) => carrinho[i.id])
                .map((i) => (
                  <li key={i.id} className="flex items-center gap-3 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{i.nome}</span>
                      <span className="codigo block text-[13px] text-suave">{reais((i.preco ?? 0) * carrinho[i.id])}</span>
                    </span>
                    <Quantidade n={carrinho[i.id]} mudar={(d) => mudarQtd(i.id, d)} />
                  </li>
                ))}
            </ul>
            <p className="mt-2 flex justify-between border-t border-borda pt-3 font-semibold">
              <span>Total</span>
              <span className="codigo">{reais(valorTotal)}</span>
            </p>
            <p className="mt-2 text-[12px] text-suave">
              {modelo?.minha_comanda
                ? "Vai para a sua comanda; você confirma (e escolhe cupom) na próxima tela."
                : !modelo || modelo.exige_qr
                  ? "Próximo passo: ler o QR code da mesa. Seu pedido fica guardado."
                  : !modelo.tem_mesas
                    ? "Próximo passo: confirmar e pagar (Pix ou cartão). Você retira no balcão."
                    : "Próximo passo: escolher a sua mesa."}
            </p>
            <button className="botao-principal mt-3 h-12 w-full rounded-full text-[15px]" disabled={qtdTotal === 0 || abrindo} onClick={finalizar}>
              {modelo?.minha_comanda ? "Continuar na comanda" : !modelo || modelo.exige_qr ? "Ler o QR da mesa" : !modelo.tem_mesas ? "Continuar para o pagamento" : "Escolher a mesa"}
            </button>
          </div>
        </div>
      )}

      {podePedir && qtdTotal === 0 && modelo && (
        <div className="fixed inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] z-30 mx-auto max-w-xl px-4 pb-3">
          {erro && <p className="mb-2 rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
          {modelo.minha_comanda ? (
            <button className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg" onClick={() => navegar(`/comanda/${modelo.minha_comanda}?pedir=1`)}>
              <ReceiptText className="h-5 w-5" />
              Pedir na sua comanda
            </button>
          ) : !modelo.tem_mesas ? (
            <button
              className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg"
              disabled={abrindo}
              onClick={() => void abrirComanda("abrir_pedido_balcao", { p_estab: id })}
            >
              <ShoppingBag className="h-5 w-5" />
              {abrindo ? "Abrindo..." : "Pedir e retirar no balcão"}
            </button>
          ) : modelo.exige_qr ? (
            <button className="botao h-12 w-full rounded-full bg-superficie text-[15px] shadow-lg" onClick={() => setLendo(true)}>
              <ScanLine className="h-5 w-5 text-destaque" />
              Para pedir, leia o QR code da mesa
            </button>
          ) : (
            <button className="botao-principal h-12 w-full rounded-full text-[15px] shadow-lg" onClick={() => setEscolhendoMesa(true)}>
              <Armchair className="h-5 w-5" />
              Pedir · escolher a mesa
            </button>
          )}
          {!modelo.minha_comanda && (
            <p className="mt-1.5 text-center text-[12px] text-suave">
              {!modelo.tem_mesas || modelo.pagamento === "prepago" ? "Pagamento na hora pelo App (Pix ou cartão)." : "Pague a conta no fim, pelo App ou no caixa."}
            </p>
          )}
        </div>
      )}

      {escolhendoMesa && modelo?.mesas && (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Escolher a mesa" onClick={() => setEscolhendoMesa(false)}>
          <div className="folha max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Em qual mesa você está?</h2>
              <button onClick={() => setEscolhendoMesa(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            {modelo.mesas.length === 0 ? (
              <p className="py-6 text-center text-sm text-suave">Este lugar ainda não cadastrou as mesas.</p>
            ) : (
              <ul className="grid grid-cols-4 gap-2">
                {modelo.mesas.map((m) => (
                  <li key={m.id}>
                    <button
                      disabled={abrindo}
                      onClick={() => void abrirComanda("entrar_na_mesa_id", { p_mesa: m.id })}
                      className="flex h-16 w-full flex-col items-center justify-center rounded-xl border border-borda hover:border-marca hover:bg-destaque-suave"
                    >
                      <span className="text-lg font-semibold">{m.numero}</span>
                      {m.area && <span className="max-w-full truncate px-1 text-[10px] text-suave">{m.area}</span>}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function Quantidade({ n, mudar, grande }: { n: number; mudar: (d: number) => void; grande?: boolean }) {
  const t = grande ? "h-11 w-11" : "h-8 w-8";
  if (n === 0)
    return (
      <button
        onClick={(e) => {
          e.stopPropagation();
          mudar(1);
        }}
        className={`flex ${t} items-center justify-center rounded-full bg-marca text-marca-texto shadow`}
        aria-label="Adicionar"
      >
        <Plus className="h-4 w-4" />
      </button>
    );
  return (
    <span className="flex items-center gap-1 rounded-full bg-superficie shadow" onClick={(e) => e.stopPropagation()}>
      <button onClick={() => mudar(-1)} className={`flex ${t} items-center justify-center rounded-full border border-borda`} aria-label="Menos">
        <Minus className="h-4 w-4" />
      </button>
      <span className="codigo w-6 text-center font-semibold">{n}</span>
      <button onClick={() => mudar(1)} className={`flex ${t} items-center justify-center rounded-full bg-marca text-marca-texto`} aria-label="Mais">
        <Plus className="h-4 w-4" />
      </button>
    </span>
  );
}
