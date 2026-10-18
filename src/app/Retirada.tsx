import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronRight, Clock, QrCode as IconeQr, Store, Ticket } from "lucide-react";
import { QrCode } from "@/components/Qr";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { useAoVivo } from "@/lib/salao";
import { useAcessoRapido } from "./estadoAcesso";
import { buscarCarteira, codigoLegivel, fimDoEvento, Ingresso, qrDoIngresso } from "./carteira";

interface Pronto {
  numero: number;
  nome: string;
  quantidade: number;
  situacao: string;
  modalidade: string;
}

interface InfoComanda {
  estabelecimento: { id: string; nome: string; logo_url: string | null; categoria: { nome: string } | null } | null;
}

/** QR Code de retirada: o QR dinâmico da comanda e os itens prontos; sem pedido, os ingressos de hoje. */
export function Retirada() {
  const { mesa } = useAcessoRapido();
  const { sessao } = useSessao();
  const navegar = useNavigate();
  const [codigo, setCodigo] = useState<string | null>(null);
  const [erro, setErro] = useState("");
  const [prontos, setProntos] = useState<Pronto[] | null>(null);
  const [info, setInfo] = useState<InfoComanda | null>(null);
  const [ingressos, setIngressos] = useState<Ingresso[] | null>(null);

  const carregar = useCallback(async () => {
    if (!mesa) {
      setProntos([]);
      return;
    }
    const [c, p] = await Promise.all([
      supabase.from("comandas").select("estabelecimento:estabelecimentos(id, nome, logo_url, categoria:categorias(nome))").eq("id", mesa.id).maybeSingle(),
      supabase.from("pedidos").select("numero, modalidade, itens:pedido_itens(nome, quantidade, situacao)").eq("comanda_id", mesa.id).order("criado_em"),
    ]);
    setInfo((c.data as unknown as InfoComanda | null) ?? null);
    type P = { numero: number; modalidade: string; itens: { nome: string; quantidade: number; situacao: string }[] };
    setProntos(
      ((p.data ?? []) as P[]).flatMap((x) =>
        x.itens.filter((i) => i.situacao === "pronto" || i.situacao === "saiu").map((i) => ({ ...i, numero: x.numero, modalidade: x.modalidade })),
      ),
    );
  }, [mesa]);

  useEffect(() => {
    document.title = "QR Code de Retirada · RoVibes";
    void carregar();
  }, [carregar]);
  useAoVivo("retirada", { pedidos: mesa ? `comanda_id=eq.${mesa.id}` : undefined }, () => void carregar(), !!mesa);

  // QR dinâmico (muda a cada 30 s) enquanto houver comanda.
  useEffect(() => {
    if (!mesa) return;
    let ativo = true;
    const gerar = async () => {
      const { data, error } = await supabase.rpc("gerar_codigo_entrega", { p_comanda: mesa.id });
      if (!ativo) return;
      if (error) setErro(mensagemDeErro(error));
      else {
        setErro("");
        setCodigo(data as string);
      }
    };
    void gerar();
    const t = window.setInterval(() => void gerar(), 30000);
    return () => {
      ativo = false;
      window.clearInterval(t);
    };
  }, [mesa]);

  // Sem comanda: ingressos válidos de hoje.
  useEffect(() => {
    if (mesa || !sessao) return;
    buscarCarteira(sessao.user.id).then((c) => {
      const hoje = new Date().toDateString();
      setIngressos(
        c.ingressos.filter((i) => i.situacao === "valido" && i.evento && i.evento.situacao !== "cancelado" && fimDoEvento(i.evento) > Date.now() && new Date(i.evento.inicio).toDateString() === hoje),
      );
    });
  }, [mesa, sessao]);

  const cabecalho = (
    <div className="flex items-center gap-2 px-2 pt-3">
      <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <h1 className="text-lg font-semibold">QR Code de Retirada</h1>
    </div>
  );

  if (!mesa) {
    if (ingressos === null) return <Carregando />;
    return (
      <div className="pb-6">
        {cabecalho}
        {ingressos.length === 0 ? (
          <div className="px-6 py-16 text-center">
            <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
              <IconeQr className="h-6 w-6" />
            </span>
            <p className="mt-4 font-semibold">Nenhum pedido para retirar</p>
            <p className="mx-auto mt-1 max-w-xs text-sm text-suave">Quando você pedir pelo App numa mesa, o QR para receber o pedido aparece aqui.</p>
            <Link to="/carteira" className="botao mt-5">
              Ver minha carteira
            </Link>
          </div>
        ) : (
          <div className="space-y-4 px-4 pt-4">
            {ingressos.map((i) => (
              <div key={i.id} className="space-y-3">
                <div className="mx-auto max-w-[300px] rounded-2xl bg-white p-5 text-center text-[#111318]">
                  <p className="text-[13px] font-medium">Ingresso · {i.evento!.nome}</p>
                  <div className="mt-3 flex justify-center">
                    <QrCode texto={qrDoIngresso(i.codigo)} tamanho={210} />
                  </div>
                  <p className="codigo mt-2 tracking-widest">{codigoLegivel(i.codigo)}</p>
                </div>
                <p className="flex items-center justify-center gap-1.5 text-sm text-suave">
                  <Ticket className="h-4 w-4" />
                  {i.evento!.estabelecimento?.nome} · {new Date(i.evento!.inicio).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  const numero = prontos?.[0]?.numero;
  const resumo = (prontos ?? []).map((p) => `${p.quantidade}x ${p.nome}`).join(" + ");

  return (
    <div className="pb-6">
      {cabecalho}
      <div className="space-y-4 px-4 pt-4">
        <div className="mx-auto max-w-[320px] rounded-2xl bg-white p-5 text-center text-[#111318] shadow-sm">
          <p className="text-[13px] font-medium">{numero ? `Pedido #${numero}` : mesa.rotulo}</p>
          <div className="mt-3 flex min-h-[230px] justify-center">{codigo ? <QrCode texto={codigo} tamanho={220} /> : <p className="py-20 text-sm text-[#5D667A]">Gerando...</p>}</div>
          <p className="mt-3 flex items-center justify-center gap-1.5 text-[12px] text-[#5D667A]">
            <Clock className="h-3.5 w-3.5" />
            Atualiza sozinho a cada 30 segundos
          </p>
        </div>
        {erro && <p className="text-center text-sm text-perigo">{erro}</p>}

        <Link to={`/comanda/${mesa.id}`} className="cartao flex items-center gap-3 p-3 hover:bg-elevado">
          {info?.estabelecimento?.logo_url ? (
            <img src={info.estabelecimento.logo_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
              <Store className="h-5 w-5" />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{info?.estabelecimento?.nome ?? mesa.lugar}</span>
            <span className="block truncate text-[13px] text-suave">{info?.estabelecimento?.categoria?.nome ?? mesa.rotulo}</span>
            <span className="mt-1 block text-[13px]">
              {prontos === null ? "..." : prontos.length ? `Pronto: ${resumo}` : "Nenhum item pronto ainda. Mostre o QR quando o pedido chegar."}
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
        </Link>

        <button onClick={() => navegar(-1)} className="botao-principal h-12 w-full rounded-full text-[15px]">
          Voltar
        </button>
      </div>
    </div>
  );
}
