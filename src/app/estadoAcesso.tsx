import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { useAoVivo } from "@/lib/salao";
import { useSessao } from "@/lib/sessao";
import { Notificacao, useNotificacoes } from "./dadosNotificacoes";

export interface MesaAberta {
  id: string;
  rotulo: string;
  lugar: string;
  estabelecimento_id: string | null;
  aviso: string | null;
  /** Itens da pessoa prontos ou a caminho (QR de retirada). */
  prontos: number;
}

interface Contexto {
  mesa: MesaAberta | null;
  notificacoes: Notificacao[];
  naoLidas: number;
  marcarLidas: () => void;
  visto: string;
  lendo: boolean;
  setLendo: (v: boolean) => void;
  equipe: boolean;
  /** Lugares onde a pessoa é promoter (ou tem convite). */
  promoter: number;
  convitesPromoter: number;
  /** Lugar do check-in ativo (para o hub "no rolê"). */
  ondeEstou: { id: string; nome: string; logo_url: string | null } | null;
}

const Ctx = createContext<Contexto | null>(null);

/** Estado do acesso rápido (menu flutuante, ⋯ e notificações), compartilhado pelas telas do App. */
export function AcessoRapidoProvider({ children }: { children: ReactNode }) {
  const { sessao } = useSessao();
  const usuario = sessao?.user.id;
  const local = useLocation();
  const [mesa, setMesa] = useState<MesaAberta | null>(null);
  const [versao, setVersao] = useState(0);
  const [lendo, setLendo] = useState(false);
  const [equipe, setEquipe] = useState(false);
  const [promoter, setPromoter] = useState(0);
  const [convitesPromoter, setConvitesPromoter] = useState(0);
  const [ondeEstou, setOndeEstou] = useState<Contexto["ondeEstou"]>(null);

  // Check-in ativo: só muda quando a pessoa faz check-in ou toca em "Saí" (não pelo GPS).
  useEffect(() => {
    if (!usuario) return;
    supabase.rpc("onde_estou").then(({ data, error }) => {
      if (error) return;
      const r = ((data ?? []) as { estabelecimento_id: string; nome: string; logo_url: string | null }[])[0];
      setOndeEstou(r ? { id: r.estabelecimento_id, nome: r.nome, logo_url: r.logo_url } : null);
    });
  }, [usuario, local.pathname]);

  useAoVivo("barra-mesa", { pedidos: mesa ? `comanda_id=eq.${mesa.id}` : undefined }, () => setVersao((v) => v + 1), !!mesa);

  useEffect(() => {
    if (!usuario) return;
    supabase
      .from("membros")
      .select("estabelecimento_id")
      .eq("usuario_id", usuario)
      .eq("ativo", true)
      .limit(1)
      .then(({ data }) => setEquipe(!!data?.length));
    supabase
      .from("promoters")
      .select("situacao")
      .eq("usuario_id", usuario)
      .in("situacao", ["convidado", "ativo"])
      .then(({ data }) => {
        setPromoter(data?.length ?? 0);
        setConvitesPromoter((data ?? []).filter((x) => x.situacao === "convidado").length);
      });
  }, [usuario, local.pathname === "/promoter"]);

  useEffect(() => {
    if (!usuario) return;
    supabase
      .from("comanda_pessoas")
      .select("entrou_em, comanda:comandas(id, situacao, nome, mesa:mesas(numero), estabelecimento:estabelecimentos(id, nome), pedidos(modalidade, usuario_id, itens:pedido_itens(situacao)))")
      .eq("usuario_id", usuario)
      .order("entrou_em", { ascending: false })
      .limit(5)
      .then(({ data }) => {
        type Linha = {
          comanda: {
            id: string;
            situacao: string;
            nome: string | null;
            mesa: { numero: string } | null;
            estabelecimento: { id: string; nome: string } | null;
            pedidos: { modalidade: string; usuario_id: string | null; itens: { situacao: string }[] }[];
          } | null;
        };
        const c = ((data ?? []) as unknown as Linha[]).map((x) => x.comanda).find((x) => x?.situacao === "aberta");
        if (!c) return setMesa(null);
        const meus = c.pedidos.filter((p) => p.usuario_id === usuario);
        const aCaminho = meus.some((p) => p.itens.some((i) => i.situacao === "saiu"));
        const retirar = meus.some((p) => p.modalidade === "retirada" && p.itens.some((i) => i.situacao === "pronto"));
        const prontos = c.pedidos.flatMap((p) => p.itens).filter((i) => i.situacao === "pronto" || i.situacao === "saiu").length;
        setMesa({
          id: c.id,
          rotulo: c.mesa ? `Mesa ${c.mesa.numero}` : c.nome ?? "comanda",
          lugar: c.estabelecimento?.nome ?? "",
          estabelecimento_id: c.estabelecimento?.id ?? null,
          aviso: aCaminho ? "Seu pedido saiu para entrega" : retirar ? "Seu pedido está pronto para retirar" : null,
          prontos,
        });
      });
  }, [usuario, local.pathname, versao]);

  const n = useNotificacoes(usuario, mesa ? { comanda: mesa.id, aviso: mesa.aviso, lugar: mesa.lugar } : null);

  return (
    <Ctx.Provider value={{ mesa, notificacoes: n.notificacoes, naoLidas: n.naoLidas, marcarLidas: n.marcarLidas, visto: n.visto, lendo, setLendo, equipe, promoter, convitesPromoter, ondeEstou }}>
      {children}
    </Ctx.Provider>
  );
}

export function useAcessoRapido() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAcessoRapido fora do provedor");
  return c;
}
