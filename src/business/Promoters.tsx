import { useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { ClipboardList, Gift, Megaphone, Plus, Trash2, UserMinus, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { Beneficio, ListaGerir, nomeTipoBeneficio, PromoterEstab, rpc, textoBeneficio, TIPOS_BENEFICIO } from "@/lib/promoters";
import { NomesLista, NovaLista } from "@/app/AreaPromoter";

interface Rascunho {
  id: string | null;
  tipo: Beneficio["tipo"];
  descricao: string;
  valor: string;
  unidade: string;
  condicao: string;
}
const vazio = (): Rascunho => ({ id: null, tipo: "comissao", descricao: "", valor: "", unidade: "%", condicao: "" });

/** Promoters do estabelecimento (na tela de Equipe): convite, benefícios, resultados e listas de presença. */
export function PromotersEstab({ estab }: { estab: string }) {
  const [lista, setLista] = useState<PromoterEstab[] | null>(null);
  const [listas, setListas] = useState<ListaGerir[]>([]);
  const [eventos, setEventos] = useState<{ id: string; nome: string; inicio: string }[]>([]);
  const [convite, setConvite] = useState<{ usuario: string; mensagem: string } | null>(null);
  const [beneficio, setBeneficio] = useState<{ promoter: string; r: Rascunho } | null>(null);
  const [novaLista, setNovaLista] = useState(false);
  const [vendo, setVendo] = useState<ListaGerir | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);

  const carregar = useCallback(async () => {
    try {
      const [p, l, e] = await Promise.all([
        rpc<PromoterEstab[]>("promoters_do_estab", { p_estab: estab }),
        rpc<ListaGerir[]>("listas_para_gerir", { p_estab: estab }).catch(() => []),
        supabase.from("eventos").select("id, nome, inicio").eq("estabelecimento_id", estab).eq("situacao", "publicado").gte("inicio", new Date(Date.now() - 8 * 3600000).toISOString()).order("inicio"),
      ]);
      setLista(p ?? []);
      setListas(l ?? []);
      setEventos((e.data ?? []) as { id: string; nome: string; inicio: string }[]);
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
      setLista([]);
    }
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (f: () => Promise<unknown>, ok: string) => {
    setAviso(null);
    try {
      await f();
      setAviso({ tipo: "ok", texto: ok });
      await carregar();
      return true;
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
      return false;
    }
  };

  const salvarBeneficio = async () => {
    if (!beneficio) return;
    const { promoter, r } = beneficio;
    const ok = await executar(
      () =>
        rpc("salvar_beneficio_promoter", {
          p_promoter: promoter,
          p_id: r.id,
          p_dados: { tipo: r.tipo, descricao: r.descricao, valor: r.valor.replace(",", "."), unidade: r.unidade, condicao: r.condicao },
        }),
      "Benefício salvo.",
    );
    if (ok) setBeneficio(null);
  };

  return (
    <section className="cartao overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-borda px-4 py-3">
        <Megaphone className="h-4 w-4 text-destaque" />
        <h2 className="flex-1 font-semibold">Promoters</h2>
        <button className="botao h-9" onClick={() => setNovaLista(true)}>
          <ClipboardList className="h-4 w-4" />
          Nova lista
        </button>
        <button className="botao-principal h-9" onClick={() => setConvite({ usuario: "", mensagem: "" })}>
          <Plus className="h-4 w-4" />
          Convidar promoter
        </button>
      </div>
      <p className="px-4 pt-3 text-[13px] text-suave">
        Qualquer pessoa do RoVibes pode ser promoter. Ao aceitar o convite, ela modera o chat ao vivo, cria listas de presença e divulga o lugar e os eventos com link próprio. Você define os benefícios de cada um.
      </p>
      {aviso && <p className={clsx("mx-4 mt-3 rounded-lg border px-3 py-2 text-sm", aviso.tipo === "ok" ? "border-ok/40 bg-ok/10 text-ok" : "border-perigo/40 bg-perigo/10 text-perigo")}>{aviso.texto}</p>}

      {convite && (
        <div className="mx-4 mt-3 space-y-2 rounded-lg border border-borda p-3">
          <label className="block">
            <span className="rotulo mb-1 block">Usuário (@) da pessoa</span>
            <input value={convite.usuario} onChange={(e) => setConvite({ ...convite, usuario: e.target.value.trim() })} placeholder="@usuario" autoCapitalize="none" className="entrada" />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Mensagem do convite (opcional)</span>
            <input value={convite.mensagem} onChange={(e) => setConvite({ ...convite, mensagem: e.target.value.slice(0, 200) })} placeholder="Ex.: Bora divulgar as sextas com a gente?" className="entrada" />
          </label>
          <div className="flex justify-end gap-2">
            <button className="botao h-9" onClick={() => setConvite(null)}>
              Cancelar
            </button>
            <button
              className="botao-principal h-9"
              disabled={convite.usuario.replace("@", "").length < 2}
              onClick={async () => {
                if (await executar(() => rpc("convidar_promoter", { p_estab: estab, p_usuario: convite.usuario, p_mensagem: convite.mensagem }), `Convite enviado para ${convite.usuario}. A pessoa responde pelo app.`))
                  setConvite(null);
              }}
            >
              Enviar convite
            </button>
          </div>
        </div>
      )}

      {lista === null ? (
        <p className="px-4 py-6 text-sm text-suave">Carregando...</p>
      ) : lista.length === 0 ? (
        <p className="px-4 py-6 text-sm text-suave">Nenhum promoter ainda.</p>
      ) : (
        <ul className="mt-3 divide-y divide-borda border-t border-borda">
          {lista.map((p) => (
            <li key={p.id} className="px-4 py-3">
              <div className="flex flex-wrap items-center gap-3">
                <Avatar nome={p.nome} foto={p.foto_url} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{p.nome}</span>
                  <span className="block text-[12px] text-suave">
                    {p.usuario ? `@${p.usuario} · ` : ""}
                    {p.situacao === "convidado" ? <span className="font-semibold text-alerta">Convite enviado</span> : <span className="font-semibold text-ok">Ativo</span>} · código <span className="codigo">{p.codigo}</span>
                  </span>
                </span>
                {p.situacao === "ativo" && (
                  <span className="flex gap-3 text-center text-[11px] text-suave">
                    {[
                      ["abriram link", p.resultados.pessoas],
                      ["na lista", p.resultados.na_lista],
                      ["chegaram", p.resultados.chegaram],
                      ["check-ins", p.resultados.checkins],
                    ].map(([r, v]) => (
                      <span key={r as string}>
                        <span className="codigo block text-base font-semibold text-texto">{v}</span>
                        {r}
                      </span>
                    ))}
                  </span>
                )}
                <button
                  className="botao h-9 text-perigo"
                  onClick={() =>
                    window.confirm(p.situacao === "convidado" ? `Cancelar o convite de ${p.nome}?` : `Remover ${p.nome} dos promoters? As listas dele serão encerradas.`) &&
                    void executar(() => rpc("encerrar_promoter", { p_id: p.id }), p.situacao === "convidado" ? "Convite cancelado." : "Promoter removido.")
                  }
                >
                  <UserMinus className="h-4 w-4" />
                  {p.situacao === "convidado" ? "Cancelar" : "Remover"}
                </button>
              </div>

              <div className="mt-2 pl-[52px]">
                <p className="rotulo mb-1">Benefícios</p>
                {p.beneficios.length === 0 && <p className="text-[13px] text-suave">Nenhum benefício definido.</p>}
                <ul className="space-y-1">
                  {p.beneficios.map((b) => (
                    <li key={b.id} className={clsx("flex items-start gap-2 text-sm", !b.ativo && "text-suave line-through")}>
                      <Gift className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
                      <button
                        className="min-w-0 flex-1 text-left hover:underline"
                        onClick={() =>
                          setBeneficio({
                            promoter: p.id,
                            r: { id: b.id, tipo: b.tipo, descricao: b.descricao, valor: b.valor == null ? "" : String(b.valor).replace(".", ","), unidade: b.unidade ?? "", condicao: b.condicao ?? "" },
                          })
                        }
                      >
                        <span className="text-[12px] text-suave">{nomeTipoBeneficio(b.tipo)}: </span>
                        {textoBeneficio(b)}
                        {b.condicao && <span className="block text-[12px] text-suave">{b.condicao}</span>}
                      </button>
                      <button className="text-suave hover:text-perigo" aria-label="Remover benefício" onClick={() => void executar(() => rpc("remover_beneficio_promoter", { p_id: b.id }), "Benefício removido.")}>
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
                <button className="mt-1 text-[13px] font-semibold text-destaque" onClick={() => setBeneficio({ promoter: p.id, r: vazio() })}>
                  + Adicionar benefício
                </button>

                {beneficio?.promoter === p.id && (
                  <div className="mt-2 grid gap-2 rounded-lg border border-borda p-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="rotulo mb-1 block">Tipo</span>
                      <select
                        className="entrada"
                        value={beneficio.r.tipo}
                        onChange={(e) => {
                          const t = TIPOS_BENEFICIO.find((x) => x.id === e.target.value)!;
                          setBeneficio({ ...beneficio, r: { ...beneficio.r, tipo: t.id, unidade: t.unidade ?? "" } });
                        }}
                      >
                        {TIPOS_BENEFICIO.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.nome}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="rotulo mb-1 block">Descrição</span>
                      <input
                        className="entrada"
                        value={beneficio.r.descricao}
                        onChange={(e) => setBeneficio({ ...beneficio, r: { ...beneficio.r, descricao: e.target.value.slice(0, 200) } })}
                        placeholder={beneficio.r.tipo === "comissao" ? "Dos ingressos vendidos pelo link" : beneficio.r.tipo === "consumacao" ? "Drinks por noite" : "Ex.: Camarote nas sextas"}
                      />
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="rotulo mb-1 block">Valor</span>
                        <input className="entrada" inputMode="decimal" value={beneficio.r.valor} onChange={(e) => setBeneficio({ ...beneficio, r: { ...beneficio.r, valor: e.target.value.replace(/[^\d,.]/g, "") } })} />
                      </label>
                      <label className="block">
                        <span className="rotulo mb-1 block">Unidade</span>
                        <select className="entrada" value={beneficio.r.unidade} onChange={(e) => setBeneficio({ ...beneficio, r: { ...beneficio.r, unidade: e.target.value } })}>
                          <option value="">—</option>
                          <option value="%">%</option>
                          <option value="R$">R$</option>
                          <option value="itens">itens</option>
                          <option value="pessoas">pessoas</option>
                        </select>
                      </label>
                    </div>
                    <label className="block">
                      <span className="rotulo mb-1 block">Condição (opcional)</span>
                      <input className="entrada" value={beneficio.r.condicao} onChange={(e) => setBeneficio({ ...beneficio, r: { ...beneficio.r, condicao: e.target.value.slice(0, 200) } })} placeholder="Ex.: a cada 20 nomes que chegarem" />
                    </label>
                    <div className="flex justify-end gap-2 sm:col-span-2">
                      <button className="botao h-9" onClick={() => setBeneficio(null)}>
                        <X className="h-4 w-4" />
                        Cancelar
                      </button>
                      <button className="botao-principal h-9" disabled={beneficio.r.descricao.trim().length < 2} onClick={() => void salvarBeneficio()}>
                        Salvar benefício
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {listas.length > 0 && (
        <div className="border-t border-borda px-4 py-3">
          <p className="rotulo mb-2">Listas de presença</p>
          <ul className="divide-y divide-borda rounded-lg border border-borda">
            {listas.map((l) => (
              <li key={l.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                <ClipboardList className={clsx("h-4 w-4", l.ativa ? "text-destaque" : "text-suave")} />
                <button className="min-w-0 flex-1 text-left" onClick={() => setVendo(l)}>
                  <span className="block truncate font-medium">{l.nome}</span>
                  <span className="block truncate text-[12px] text-suave">
                    {l.promoter ? `${l.promoter} · ` : "Lista da casa · "}
                    {l.evento ? `${l.evento.nome} · ` : ""}
                    {l.inscritos}
                    {l.limite ? `/${l.limite}` : ""} nomes · {l.chegaram} chegaram{l.ativa ? "" : " · encerrada"}
                  </span>
                </button>
                <button className="botao h-8 px-2.5 text-[12px]" onClick={() => void executar(() => rpc("encerrar_lista_presenca", { p_lista: l.id, p_ativa: !l.ativa }), l.ativa ? "Lista encerrada." : "Lista reaberta.")}>
                  {l.ativa ? "Encerrar" : "Reabrir"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {novaLista && (
        <NovaLista
          estab={estab}
          eventos={eventos}
          fechar={() => setNovaLista(false)}
          criada={() => {
            setNovaLista(false);
            void carregar();
          }}
        />
      )}
      {vendo && <NomesLista lista={vendo} fechar={() => setVendo(null)} portaria />}
    </section>
  );
}
