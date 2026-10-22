import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { gravar, ler } from "@/lib/armazenamento";

export interface Notificacao {
  id: string;
  tipo: "pedido" | "cupom" | "ingresso" | "evento" | "publicacao" | "promoter" | "brinde" | "seguidor" | "role";
  titulo: string;
  texto: string;
  quando: string;
  link: string;
  agora?: boolean;
}

/** Novidades do App montadas a partir dos dados reais (pedidos, cupons, ingressos e lugares que a pessoa segue). */
export function useNotificacoes(usuario: string | undefined, pedido: { comanda: string; aviso: string | null; lugar: string } | null) {
  const [lista, setLista] = useState<Notificacao[]>([]);
  const [visto, setVisto] = useState(() => ler<string>("notificacoes_visto", "1970-01-01T00:00:00Z"));

  const carregar = useCallback(async () => {
    if (!usuario) return;
    const agora = new Date();
    const em3dias = new Date(Date.now() + 3 * 86400000).toISOString();
    const inicioDia = new Date(agora);
    inicioDia.setHours(0, 0, 0, 0);
    const fimDia = new Date(inicioDia.getTime() + 86400000);
    const { data: seg } = await supabase.from("seguidores").select("estabelecimento_id").eq("usuario_id", usuario);
    const ids = (seg ?? []).map((x) => x.estabelecimento_id as string);
    const semana = new Date(Date.now() - 7 * 86400000).toISOString();
    const [c, i, e, p] = await Promise.all([
      supabase
        .from("cupons")
        .select("id, titulo, validade, criado_em, estabelecimento:estabelecimentos(nome)")
        .eq("usuario_id", usuario)
        .eq("situacao", "disponivel")
        .gt("validade", agora.toISOString())
        .lt("validade", em3dias),
      supabase
        .from("ingressos")
        .select("id, criado_em, evento:eventos(id, nome, inicio, estabelecimento:estabelecimentos(nome))")
        .eq("usuario_id", usuario)
        .eq("situacao", "valido"),
      ids.length
        ? supabase
            .from("eventos")
            .select("id, nome, inicio, criado_em, estabelecimento:estabelecimentos(nome)")
            .in("estabelecimento_id", ids)
            .eq("situacao", "publicado")
            .gte("criado_em", semana)
            .gte("inicio", agora.toISOString())
            .limit(10)
        : Promise.resolve({ data: [] }),
      ids.length
        ? supabase
            .from("publicacoes")
            .select("id, texto, criado_em, estabelecimento:estabelecimentos(id, nome)")
            .in("estabelecimento_id", ids)
            .eq("situacao", "publicada")
            .gte("criado_em", new Date(Date.now() - 2 * 86400000).toISOString())
            .limit(10)
        : Promise.resolve({ data: [] }),
    ]);
    type Nome = { nome: string } | null;
    const itens: Notificacao[] = [];
    for (const x of (c.data ?? []) as unknown as { id: string; titulo: string; validade: string; criado_em: string; estabelecimento: Nome }[]) {
      itens.push({
        id: `cupom-${x.id}`,
        tipo: "cupom",
        titulo: "Cupom vencendo",
        texto: `${x.titulo} · ${x.estabelecimento?.nome ?? ""} vale até ${new Date(x.validade).toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}`,
        quando: new Date(Date.parse(x.validade) - 3 * 86400000).toISOString(),
        link: "/carteira?aba=cupons",
      });
    }
    for (const x of (i.data ?? []) as unknown as { id: string; criado_em: string; evento: { id: string; nome: string; inicio: string; estabelecimento: Nome } | null }[]) {
      if (!x.evento) continue;
      const ini = new Date(x.evento.inicio);
      if (ini < inicioDia || ini >= fimDia) continue;
      itens.push({
        id: `ingresso-${x.id}`,
        tipo: "ingresso",
        titulo: "Seu evento é hoje",
        texto: `${x.evento.nome} · ${x.evento.estabelecimento?.nome ?? ""} às ${ini.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`,
        quando: inicioDia.toISOString(),
        link: "/carteira?aba=ingressos",
      });
    }
    for (const x of (e.data ?? []) as unknown as { id: string; nome: string; inicio: string; criado_em: string; estabelecimento: Nome }[]) {
      itens.push({
        id: `evento-${x.id}`,
        tipo: "evento",
        titulo: `Novo evento · ${x.estabelecimento?.nome ?? ""}`,
        texto: `${x.nome} · ${new Date(x.inicio).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })}`,
        quando: x.criado_em,
        link: `/evento/${x.id}`,
      });
    }
    for (const x of (p.data ?? []) as unknown as { id: string; texto: string | null; criado_em: string; estabelecimento: { id: string; nome: string } | null }[]) {
      itens.push({
        id: `pub-${x.id}`,
        tipo: "publicacao",
        titulo: `${x.estabelecimento?.nome ?? ""} publicou`,
        texto: (x.texto ?? "Nova foto").slice(0, 90),
        quando: x.criado_em,
        link: x.estabelecimento ? `/lugar/${x.estabelecimento.id}` : "/",
      });
    }
    // Comentários nas minhas publicações e respostas aos meus comentários (atualização 034).
    const { data: inter } = await supabase.rpc("minhas_interacoes");
    for (const x of (inter ?? []) as { id: string; tipo: "comentario" | "resposta"; quem: string; texto: string; criado_em: string; pub_tipo: string; pub_id: string }[]) {
      itens.push({
        id: `coment-${x.id}`,
        tipo: "publicacao",
        titulo: x.tipo === "resposta" ? `${x.quem.split(" ")[0]} respondeu seu comentário` : `${x.quem.split(" ")[0]} comentou sua publicação`,
        texto: x.texto,
        quando: x.criado_em,
        link: `/publicacao/${x.pub_tipo}/${x.pub_id}?comentario=${x.id}`,
      });
    }
    // Convites para eventos de amigos (atualização 037).
    const { data: conviteEv } = await supabase
      .from("convites_evento_pessoa")
      .select("evento_id, convidado_em, situacao")
      .eq("usuario_id", usuario)
      .eq("situacao", "convidado")
      .limit(20);
    if (conviteEv?.length) {
      const evs = await supabase.rpc("eventos_pessoa_para_mim", { p_lat: null, p_lng: null });
      const porId = new Map(((evs.data ?? []) as { id: string; titulo: string; anfitriao: { nome: string } }[]).map((e) => [e.id, e]));
      for (const c of conviteEv as { evento_id: string; convidado_em: string }[]) {
        const e = porId.get(c.evento_id);
        if (!e) continue;
        itens.push({
          id: `convite-ev-${c.evento_id}`,
          tipo: "evento",
          titulo: `${e.anfitriao.nome.split(" ")[0]} convidou você`,
          texto: e.titulo,
          quando: c.convidado_em,
          link: `/evento-pessoa/${c.evento_id}`,
        });
      }
    }
    // Brindes, seguidores e rolês (atualização 040: notificações criadas pelo banco).
    const { data: doBanco } = await supabase.rpc("minhas_notificacoes", { p_limite: 50 });
    const TIPO: Record<string, Notificacao["tipo"]> = { brinde: "brinde", brinde_comentario: "brinde", seguidor: "seguidor", pedido_seguir: "seguidor", convite_role: "role" };
    for (const x of (doBanco ?? []) as { id: string; tipo: string; titulo: string; texto: string | null; link: string; criado_em: string }[]) {
      const tipo = TIPO[x.tipo];
      if (!tipo) continue;
      itens.push({ id: `n-${x.id}`, tipo, titulo: x.titulo, texto: x.texto ?? "", quando: x.criado_em, link: x.link });
    }
    // Convites para ser promoter.
    const { data: conv } = await supabase
      .from("promoters")
      .select("id, convidado_em, estabelecimento:estabelecimentos(nome)")
      .eq("usuario_id", usuario)
      .eq("situacao", "convidado");
    for (const x of (conv ?? []) as unknown as { id: string; convidado_em: string; estabelecimento: Nome }[]) {
      itens.push({
        id: `promoter-${x.id}`,
        tipo: "promoter",
        titulo: "Convite para ser promoter",
        texto: `${x.estabelecimento?.nome ?? "Um lugar"} convidou você. Toque para responder.`,
        quando: x.convidado_em,
        link: "/promoter",
      });
    }
    itens.sort((a, b) => b.quando.localeCompare(a.quando));
    setLista(itens);
  }, [usuario]);

  useEffect(() => {
    void carregar();
    const t = window.setInterval(() => void carregar(), 120000);
    return () => window.clearInterval(t);
  }, [carregar]);

  const todas: Notificacao[] = pedido?.aviso
    ? [{ id: `pedido-${pedido.comanda}`, tipo: "pedido", titulo: pedido.aviso, texto: `${pedido.lugar} · toque para ver o QR de retirada`, quando: new Date().toISOString(), link: "/retirada", agora: true }, ...lista]
    : lista;
  const naoLidas = todas.filter((n) => n.agora || n.quando > visto).length;
  const marcarLidas = () => {
    const v = new Date().toISOString();
    setVisto(v);
    gravar("notificacoes_visto", v);
  };
  return { notificacoes: todas, naoLidas, marcarLidas, visto, recarregar: carregar };
}
