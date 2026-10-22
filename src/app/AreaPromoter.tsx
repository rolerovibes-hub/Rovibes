import { useCallback, useEffect, useState } from "react";
import { IconeConvite } from "@/components/IconesRoVibes";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Check, ClipboardList, Copy, Gift, LogOut, Megaphone, Plus, Radio, Store, Users, X } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro } from "@/lib/supabase";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { compartilhar, linkDivulgacao, ListaGerir, MinhaArea, NomeLista, nomeTipoBeneficio, rpc, textoBeneficio } from "@/lib/promoters";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

function Numero({ rotulo, valor }: { rotulo: string; valor: number }) {
  return (
    <div className="rounded-lg bg-elevado px-3 py-2 text-center">
      <span className="codigo block text-lg font-semibold">{valor}</span>
      <span className="block text-[11px] text-suave">{rotulo}</span>
    </div>
  );
}

/** Área do Promoter (no app): convites, links de divulgação, listas de presença, benefícios e resultados. */
export function AreaPromoter() {
  const navegar = useNavigate();
  const [itens, setItens] = useState<MinhaArea[] | null>(null);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  const carregar = useCallback(() => {
    rpc<MinhaArea[]>("minha_area_promoter")
      .then((l) => setItens(l ?? []))
      .catch((e) => {
        setErro(mensagemDeErro(e));
        setItens([]);
      });
  }, []);
  useEffect(() => {
    carregar();
  }, [carregar]);

  const acao = async (f: () => Promise<unknown>, ok?: string) => {
    setErro("");
    try {
      await f();
      if (ok) setAviso(ok);
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  if (!itens) return <Carregando />;

  return (
    <div className="space-y-4 px-4 py-4">
      <div className="flex items-center gap-2">
        <button onClick={() => navegar(-1)} className="-ml-2 rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-semibold">Área do Promoter</h1>
      </div>
      {erro && <p className="text-sm text-perigo">{erro}</p>}
      {aviso && <p className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{aviso}</p>}
      {itens.length === 0 && (
        <div className="cartao px-6 py-12 text-center">
          <Megaphone className="mx-auto h-7 w-7 text-suave" />
          <p className="mt-3 font-medium">Você ainda não é promoter de nenhum lugar</p>
          <p className="mt-1 text-sm text-suave">Quando um estabelecimento convidar você, o convite aparece aqui.</p>
        </div>
      )}
      {itens.map((p) =>
        p.situacao === "convidado" ? (
          <section key={p.id} className="cartao border-marca p-4">
            <div className="flex items-center gap-3">
              <Logo url={p.estab.logo_url} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{p.estab.nome}</p>
                <p className="text-sm text-suave">convidou você para ser promoter</p>
              </div>
            </div>
            {p.mensagem && <p className="mt-3 rounded-lg bg-elevado px-3 py-2 text-sm">“{p.mensagem}”</p>}
            {p.beneficios.length > 0 && (
              <ul className="mt-3 space-y-1 text-sm">
                {p.beneficios.map((b) => (
                  <li key={b.id} className="flex gap-2">
                    <Gift className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
                    {textoBeneficio(b)}
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 text-[13px] text-suave">Como promoter você modera o chat ao vivo do lugar, cria listas de presença e divulga o lugar e os eventos com seu link.</p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button className="botao" onClick={() => void acao(() => rpc("responder_convite_promoter", { p_id: p.id, p_aceitar: false }), "Convite recusado.")}>
                Recusar
              </button>
              <button className="botao-principal" onClick={() => void acao(() => rpc("responder_convite_promoter", { p_id: p.id, p_aceitar: true }), `Agora você é promoter do ${p.estab.nome}!`)}>
                <Check className="h-4 w-4" />
                Aceitar
              </button>
            </div>
          </section>
        ) : (
          <CartaoPromoter key={p.id} p={p} acao={acao} avisar={setAviso} />
        ),
      )}
    </div>
  );
}

function Logo({ url }: { url: string | null }) {
  return url ? (
    <img src={url} alt="" className="h-11 w-11 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-elevado text-suave">
      <Store className="h-5 w-5" />
    </span>
  );
}

function CartaoPromoter({ p, acao, avisar }: { p: MinhaArea; acao: (f: () => Promise<unknown>, ok?: string) => Promise<void>; avisar: (t: string) => void }) {
  const [listas, setListas] = useState<ListaGerir[] | null>(null);
  const [nova, setNova] = useState(false);
  const [vendo, setVendo] = useState<ListaGerir | null>(null);
  const [enviar, setEnviar] = useState<{ tipo: "evento" | "lista"; id: string; titulo: string } | null>(null);

  const carregarListas = useCallback(() => {
    rpc<ListaGerir[]>("listas_para_gerir", { p_estab: p.estab.id }).then((l) => setListas(l ?? [])).catch(() => setListas([]));
  }, [p.estab.id]);
  useEffect(() => {
    carregarListas();
  }, [carregarListas]);

  const divulgar = async (alvo: "lugar" | "evento", id: string, titulo: string) => {
    if (alvo === "evento") return setEnviar({ tipo: "evento", id, titulo });
    const r = await compartilhar(titulo, linkDivulgacao(alvo, id, p.codigo));
    avisar(r === "copiado" ? "Link copiado. Cole onde quiser divulgar." : "Link compartilhado.");
  };

  return (
    <section className="cartao overflow-hidden">
      <div className="flex items-center gap-3 p-4">
        <Logo url={p.estab.logo_url} />
        <div className="min-w-0 flex-1">
          <Link to={`/lugar/${p.estab.id}`} className="block truncate font-semibold">
            {p.estab.nome}
          </Link>
          <p className="text-[12px] text-suave">
            Promoter · código <span className="codigo font-semibold text-texto">{p.codigo}</span>
          </p>
        </div>
        {p.ao_vivo && (
          <Link to={`/ao-vivo/${p.estab.id}`} className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-perigo/10 px-3 py-1.5 text-[12px] font-semibold text-perigo">
            <Radio className="h-3.5 w-3.5" />
            Moderar ao vivo
          </Link>
        )}
      </div>

      {p.resultados && (
        <div className="grid grid-cols-4 gap-2 px-4">
          <Numero rotulo="abriram o link" valor={p.resultados.pessoas} />
          <Numero rotulo="na lista" valor={p.resultados.na_lista} />
          <Numero rotulo="chegaram" valor={p.resultados.chegaram} />
          <Numero rotulo="check-ins" valor={p.resultados.checkins} />
        </div>
      )}
      <p className="px-4 pt-1 text-[11px] text-suave">Últimos 30 dias</p>

      <div className="space-y-4 p-4">
        <div>
          <h3 className="rotulo mb-2">Divulgar com seu link</h3>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            <li className="flex items-center gap-2 px-3 py-2 text-sm">
              <Store className="h-4 w-4 text-suave" />
              <span className="min-w-0 flex-1 truncate">Perfil do lugar</span>
              <button className="botao h-8 px-2.5 text-[13px]" onClick={() => void divulgar("lugar", p.estab.id, p.estab.nome)}>
                <IconeConvite className="h-3.5 w-3.5" />
                Divulgar
              </button>
            </li>
            {(p.eventos ?? []).map((e) => (
              <li key={e.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <Megaphone className="h-4 w-4 text-suave" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{e.nome}</span>
                  <span className="block text-[12px] capitalize text-suave">{dataHora(e.inicio)}</span>
                </span>
                <button className="botao h-8 px-2.5 text-[13px]" onClick={() => void divulgar("evento", e.id, e.nome)}>
                  <IconeConvite className="h-3.5 w-3.5" />
                  Divulgar
                </button>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <h3 className="rotulo">Minhas listas de presença</h3>
            <button className="text-[13px] font-semibold text-destaque" onClick={() => setNova(true)}>
              <Plus className="mr-0.5 inline h-3.5 w-3.5" />
              Nova lista
            </button>
          </div>
          {!listas ? (
            <p className="text-sm text-suave">Carregando...</p>
          ) : listas.filter((l) => l.minha).length === 0 ? (
            <p className="text-sm text-suave">Nenhuma lista ainda. Crie uma para um evento e divulgue com seu link.</p>
          ) : (
            <ul className="divide-y divide-borda rounded-lg border border-borda">
              {listas
                .filter((l) => l.minha)
                .map((l) => (
                  <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <ClipboardList className={clsx("h-4 w-4", l.ativa ? "text-destaque" : "text-suave")} />
                    <button className="min-w-0 flex-1 text-left" onClick={() => setVendo(l)}>
                      <span className="block truncate font-medium">{l.nome}</span>
                      <span className="block truncate text-[12px] text-suave">
                        {l.evento ? `${l.evento.nome} · ` : ""}
                        {l.inscritos}
                        {l.limite ? `/${l.limite}` : ""} nomes · {l.chegaram} chegaram {l.ativa ? "" : "· encerrada"}
                      </span>
                    </button>
                    {l.ativa && (
                      <button className="botao h-8 px-2.5 text-[12px]" onClick={() => setEnviar({ tipo: "lista", id: l.id, titulo: l.nome })} aria-label={`Divulgar ${l.nome}`}>
                        <IconeConvite className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button
                      className="botao h-8 px-2.5 text-[12px]"
                      onClick={() => void acao(() => rpc("encerrar_lista_presenca", { p_lista: l.id, p_ativa: !l.ativa }).then(carregarListas))}
                    >
                      {l.ativa ? "Encerrar" : "Reabrir"}
                    </button>
                  </li>
                ))}
            </ul>
          )}
        </div>

        {p.beneficios.length > 0 && (
          <div>
            <h3 className="rotulo mb-2">Seus benefícios</h3>
            <ul className="space-y-1.5 text-sm">
              {p.beneficios.map((b) => (
                <li key={b.id} className="flex gap-2">
                  <Gift className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
                  <span>
                    <span className="text-[12px] text-suave">{nomeTipoBeneficio(b.tipo)}: </span>
                    {textoBeneficio(b)}
                    {b.condicao && <span className="block text-[12px] text-suave">{b.condicao}</span>}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <button
          className="flex items-center gap-1.5 text-[13px] text-suave hover:text-perigo"
          onClick={() => window.confirm(`Deixar de ser promoter do ${p.estab.nome}? Suas listas serão encerradas.`) && void acao(() => rpc("encerrar_promoter", { p_id: p.id }), "Você saiu.")}
        >
          <LogOut className="h-3.5 w-3.5" />
          Deixar de ser promoter
        </button>
      </div>

      {nova && (
        <NovaLista
          estab={p.estab.id}
          eventos={p.eventos ?? []}
          fechar={() => setNova(false)}
          criada={() => {
            setNova(false);
            carregarListas();
            avisar("Lista criada. Divulgue o evento com seu link para as pessoas entrarem.");
          }}
        />
      )}
      {vendo && <NomesLista lista={vendo} fechar={() => setVendo(null)} />}
      {enviar && <CompartilharNoChat tipo={enviar.tipo} id={enviar.id} titulo={enviar.titulo} codigo={p.codigo} fechar={() => setEnviar(null)} enviado={avisar} />}
    </section>
  );
}

export function NovaLista({ estab, eventos, fechar, criada }: { estab: string; eventos: { id: string; nome: string; inicio: string }[]; fechar: () => void; criada: () => void }) {
  const [evento, setEvento] = useState(eventos[0]?.id ?? "");
  const [nome, setNome] = useState("");
  const [beneficio, setBeneficio] = useState("");
  const [limite, setLimite] = useState("");
  const [encerra, setEncerra] = useState("");
  const [erro, setErro] = useState("");
  const criar = async () => {
    setErro("");
    try {
      await rpc("criar_lista_presenca", {
        p_estab: estab,
        p_evento: evento || null,
        p_nome: nome.trim(),
        p_beneficio: beneficio.trim() || null,
        p_limite: Number(limite) || null,
        p_encerra: encerra ? new Date(encerra).toISOString() : null,
      });
      criada();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Nova lista" onClick={fechar}>
      <div className="folha w-full max-w-md space-y-3 rounded-t-2xl bg-superficie p-5 pb-[max(20px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Nova lista de presença</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <label className="block">
          <span className="rotulo mb-1 block">Evento</span>
          <select className="entrada" value={evento} onChange={(e) => setEvento(e.target.value)}>
            <option value="">Sem evento (vale para o lugar)</option>
            {eventos.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome} · {dataHora(e.inicio)}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Nome da lista</span>
          <input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 80))} placeholder="Ex.: Lista da Duda" className="entrada" />
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Benefício para quem entrar (opcional)</span>
          <input value={beneficio} onChange={(e) => setBeneficio(e.target.value.slice(0, 160))} placeholder="Ex.: VIP até 0h, entrada com desconto" className="entrada" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="rotulo mb-1 block">Limite de nomes</span>
            <input value={limite} onChange={(e) => setLimite(e.target.value.replace(/\D/g, "").slice(0, 4))} inputMode="numeric" placeholder="Sem limite" className="entrada" />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Encerra em</span>
            <input type="datetime-local" value={encerra} onChange={(e) => setEncerra(e.target.value)} className="entrada" />
          </label>
        </div>
        {erro && <p className="text-sm text-perigo">{erro}</p>}
        <button className="botao-principal h-11 w-full" disabled={nome.trim().length < 2} onClick={() => void criar()}>
          Criar lista
        </button>
      </div>
    </div>
  );
}

export function NomesLista({ lista, fechar, portaria = false }: { lista: ListaGerir; fechar: () => void; portaria?: boolean }) {
  const [nomes, setNomes] = useState<NomeLista[] | null>(null);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState("");
  const carregar = useCallback(() => {
    rpc<NomeLista[]>("nomes_da_lista", { p_lista: lista.id })
      .then((l) => setNomes(l ?? []))
      .catch((e) => setErro(mensagemDeErro(e)));
  }, [lista.id]);
  useEffect(() => {
    carregar();
  }, [carregar]);
  const visiveis = (nomes ?? []).filter((n) => `${n.nome} ${n.usuario ?? ""}`.toLowerCase().includes(busca.trim().toLowerCase()));
  const total = (nomes ?? []).reduce((s, n) => s + 1 + n.acompanhantes, 0);
  const chegaram = (nomes ?? []).filter((n) => n.chegou_em).reduce((s, n) => s + 1 + n.acompanhantes, 0);
  const conferir = async (n: NomeLista) => {
    try {
      await rpc("conferir_nome_lista", { p_nome: n.id, p_chegou: !n.chegou_em });
      carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={lista.nome} onClick={fechar}>
      <div className="folha flex max-h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-borda px-5 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-semibold">{lista.nome}</h2>
            <p className="flex items-center gap-1 text-[12px] text-suave">
              <Users className="h-3.5 w-3.5" /> {total} nomes · {chegaram} chegaram
            </p>
          </div>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-5 pt-3">
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar nome" className="entrada" />
        </div>
        <ul className="min-h-0 flex-1 divide-y divide-borda overflow-y-auto px-2 py-2">
          {visiveis.map((n) => (
            <li key={n.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className={clsx("block truncate font-medium", n.chegou_em && "text-ok")}>{n.nome}</span>
                <span className="block text-[12px] text-suave">
                  {n.usuario ? `@${n.usuario}` : ""}
                  {n.acompanhantes ? ` · +${n.acompanhantes}` : ""}
                  {n.chegou_em ? ` · chegou ${new Date(n.chegou_em).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}` : ""}
                </span>
              </span>
              {portaria ? (
                <button className={clsx("h-9 shrink-0 rounded-lg px-3 text-[13px] font-semibold", n.chegou_em ? "bg-ok/15 text-ok" : "bg-marca text-marca-texto")} onClick={() => void conferir(n)}>
                  {n.chegou_em ? "Chegou ✓" : "Confirmar"}
                </button>
              ) : (
                n.chegou_em && <Check className="h-4 w-4 text-ok" />
              )}
            </li>
          ))}
          {nomes && visiveis.length === 0 && <li className="px-3 py-6 text-center text-sm text-suave">Ninguém na lista.</li>}
          {!nomes && !erro && <li className="px-3 py-6 text-center text-sm text-suave">Carregando...</li>}
        </ul>
        {erro && <p className="px-5 text-sm text-perigo">{erro}</p>}
        {!portaria && (
          <p className="px-5 pt-2 text-[12px] text-suave">
            <Copy className="mr-1 inline h-3 w-3" />A portaria confere os nomes no RoVibes Job.
          </p>
        )}
      </div>
    </div>
  );
}
