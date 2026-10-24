import { FormEvent, ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Check, ChevronRight, Headset, KeyRound, Plus, RotateCcw, Trash2, UserMinus, UserPlus, Users, X } from "lucide-react";
import { contasSistema } from "@/lib/sistema";
import { PromotersEstab } from "./Promoters";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { Avatar } from "@/components/Avatar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_PAPEL, Papel, tempoRelativo, useBusiness } from "@/lib/acessos";
import { AREAS, CATALOGO, porCodigo } from "@/lib/catalogo";
import { ACOES, EXPLICA_NIVEL, Funcao, Nivel, NOME_ACAO, NOME_NIVEL, NOME_SETOR } from "@/lib/funcoes";
import { useSessao } from "@/lib/sessao";

interface Membro {
  usuario_id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  papel: Papel;
  cargo: string | null;
  ativo: boolean;
  codigos: string[];
  funcoes: string[];
  retirados: string[];
  desde: string;
}

interface Solicitacao {
  id: string;
  usuario_id: string;
  nome: string;
  codigo: string;
  criado_em: string;
}

interface EdicaoMembro {
  usuario_id: string;
  nome: string;
  funcoes: string[];
  extras: string[];
  retirados: string[];
}

type EdicaoFuncao = Omit<Funcao, "id" | "pessoas" | "ordem" | "modelo"> & { id: string | null };

// Aplicativos que entram nas funções (os padrão e os da Administração ficam fora).
const LIBERAVEIS = CATALOGO.filter((a) => !a.padrao && a.area !== "Administração");
const ORDEM_NIVEL: Nivel[] = ["gerente", "lider", "equipe"];

type Aba = "pessoas" | "funcoes" | "suporte";

/** Equipe e permissões (G3001): funções prontas e editáveis, várias por pessoa, ajustes só daquela pessoa. */
export function Equipe() {
  const { atual, temAcesso } = useBusiness();
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const id = atual?.estabelecimento_id;
  const souDono = atual?.papel === "proprietario" || atual?.papel === "suporte";
  const [aba, setAba] = useState<Aba>("pessoas");
  const [membros, setMembros] = useState<Membro[]>([]);
  const [funcoes, setFuncoes] = useState<Funcao[] | null>(null);
  const [semAtualizacao, setSemAtualizacao] = useState(false);
  const [pendentes, setPendentes] = useState<Solicitacao[]>([]);
  const [novo, setNovo] = useState<{ nome: string; login: string; senha: string; funcoes: string[] } | null>(null);
  const [logins, setLogins] = useState<Map<string, string>>(new Map());
  const [edicao, setEdicao] = useState<EdicaoMembro | null>(null);
  const [funcaoAberta, setFuncaoAberta] = useState<EdicaoFuncao | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    void supabase
      .from("contas_sistema")
      .select("usuario_id, login")
      .eq("estabelecimento_id", id)
      .then(({ data }) => setLogins(new Map(((data ?? []) as { usuario_id: string; login: string }[]).map((x) => [x.usuario_id, x.login]))));
    const [m, s, f] = await Promise.all([
      supabase.rpc("equipe", { p_estab: id }),
      supabase.rpc("solicitacoes_pendentes", { p_estab: id }),
      supabase.rpc("funcoes_do_estab", { p_estab: id }),
    ]);
    if (f.error) {
      setSemAtualizacao(/function|schema cache/i.test(f.error.message));
      setFuncoes([]);
    } else {
      setSemAtualizacao(false);
      setFuncoes(((f.data ?? []) as Funcao[]).map((x) => ({ ...x, desconto_max: Number(x.desconto_max) })));
    }
    setMembros(((m.data ?? []) as Membro[]).map((x) => ({ ...x, funcoes: x.funcoes ?? [], retirados: x.retirados ?? [] })));
    setPendentes((s.data ?? []) as Solicitacao[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  const porId = useMemo(() => new Map((funcoes ?? []).map((f) => [f.id, f])), [funcoes]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const editavel = (m: Membro) => m.papel !== "proprietario" && m.usuario_id !== eu && (souDono || m.papel !== "gestor");

  const abrirMembro = (m: Membro) => {
    setFuncaoAberta(null);
    setEdicao({ usuario_id: m.usuario_id, nome: m.nome, funcoes: m.funcoes, extras: m.codigos, retirados: m.retirados });
  };

  const salvarMembro = (e: FormEvent) => {
    e.preventDefault();
    if (!edicao) return;
    const m = membros.find((x) => x.usuario_id === edicao.usuario_id);
    void executar(async () => {
      const { error } = await supabase.rpc("definir_membro", {
        p_estab: id,
        p_usuario: edicao.usuario_id,
        p_funcoes: edicao.funcoes,
        p_extras: edicao.extras,
        p_retirados: edicao.retirados,
        p_ativo: m?.ativo ?? true,
      });
      if (error) throw error;
      setEdicao(null);
      await carregar();
    }, "Acesso atualizado. Vale a partir da próxima vez que a pessoa abrir o app.");
  };

  const alternarAtivo = (m: Membro) =>
    void executar(async () => {
      if (m.ativo && !window.confirm(`Desativar ${m.nome}? A pessoa perde o acesso a este estabelecimento, mas o histórico fica guardado.`)) return;
      const { error } = await supabase.rpc("definir_membro", {
        p_estab: id,
        p_usuario: m.usuario_id,
        p_funcoes: m.funcoes,
        p_extras: m.codigos,
        p_retirados: m.retirados,
        p_ativo: !m.ativo,
      });
      if (error) throw error;
      setEdicao(null);
      await carregar();
    }, m.ativo ? "Pessoa desativada." : "Pessoa reativada.");

  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    if (!novo) return;
    void executar(async () => {
      const criado = await contasSistema<{ usuario_id: string; login: string; codigo: string }>("criar_usuario", { nome: novo.nome, login: novo.login, senha: novo.senha });
      if (novo.funcoes.length) {
        const r = await supabase.rpc("definir_membro", { p_estab: id, p_usuario: criado.usuario_id, p_funcoes: novo.funcoes, p_extras: [], p_retirados: [], p_ativo: true });
        if (r.error) throw r.error;
      }
      setNovo(null);
      await carregar();
    }, "Usuário criado.");
  };

  const decidir = (s: Solicitacao, aprovar: boolean) =>
    void executar(async () => {
      const { error } = await supabase.rpc("decidir_solicitacao", { p_id: s.id, p_aprovar: aprovar });
      if (error) throw error;
      await carregar();
    }, aprovar ? `${s.nome} agora usa ${porCodigo(s.codigo)?.nome ?? s.codigo}.` : "Pedido recusado.");

  const novaFuncao = () => {
    setEdicao(null);
    setFuncaoAberta({ id: null, nome: "", descricao: "", nivel: "equipe", setor: null, codigos: [], acoes: [], desconto_max: 0, ativa: true });
  };

  const salvarFuncao = (e: FormEvent) => {
    e.preventDefault();
    if (!funcaoAberta) return;
    void executar(async () => {
      const { id: fid, ...dados } = funcaoAberta;
      const { error } = await supabase.rpc("salvar_funcao", { p_estab: id, p_id: fid, p_dados: dados });
      if (error) throw error;
      setFuncaoAberta(null);
      await carregar();
    }, "Função salva. Todo mundo com essa função já recebe a mudança.");
  };

  const apagarFuncao = (f: EdicaoFuncao) => {
    if (!f.id) return;
    const n = funcoes?.find((x) => x.id === f.id)?.pessoas ?? 0;
    if (!window.confirm(n ? `Apagar a função ${f.nome}? ${n} ${n === 1 ? "pessoa perde" : "pessoas perdem"} os acessos que vinham dela.` : `Apagar a função ${f.nome}?`)) return;
    void executar(async () => {
      const { error } = await supabase.rpc("apagar_funcao", { p_id: f.id });
      if (error) throw error;
      setFuncaoAberta(null);
      await carregar();
    }, "Função apagada.");
  };

  const restaurar = () =>
    void executar(async () => {
      const { data, error } = await supabase.rpc("restaurar_funcoes", { p_estab: id });
      if (error) throw error;
      await carregar();
      setAviso({ tipo: "ok", texto: data ? `${data} ${data === 1 ? "função pronta voltou" : "funções prontas voltaram"}.` : "Todas as funções prontas já estão aqui." });
    });

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => (setAba("pessoas"), setEdicao(null), setNovo({ nome: "", login: "", senha: "", funcoes: [] }))}>
            <UserPlus className="h-4 w-4" />
            Adicionar pessoa
          </button>
          <button className="botao" onClick={() => (setAba("funcoes"), novaFuncao())} disabled={semAtualizacao}>
            <Plus className="h-4 w-4" />
            Nova função
          </button>
          <button className="botao" onClick={restaurar} disabled={ocupado || semAtualizacao}>
            <RotateCcw className="h-4 w-4" />
            Funções prontas
          </button>
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {semAtualizacao && <Aviso tipo="erro">Aplique a atualização 039 do banco para usar as funções da equipe.</Aviso>}

      <div className="grid grid-cols-3 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Equipe">
        {(
          [
            ["pessoas", `Pessoas · ${membros.filter((m) => m.ativo).length}`],
            ["funcoes", `Funções · ${funcoes?.filter((f) => f.ativa).length ?? 0}`],
            ["suporte", "Suporte RoVibes"],
          ] as const
        ).map(([a, nome]) => (
          <button
            key={a}
            role="tab"
            aria-selected={aba === a}
            onClick={() => setAba(a)}
            className={clsx("rounded-md py-2 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}
          >
            {nome}
          </button>
        ))}
      </div>

      {aba === "pessoas" && (
        <>
          {pendentes.length > 0 && (
            <Secao titulo={`Pedidos de acesso (${pendentes.length})`}>
              <ul className="divide-y divide-borda">
                {pendentes.map((s) => (
                  <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="font-medium">{s.nome}</span> pediu <span className="font-medium">{porCodigo(s.codigo)?.nome ?? s.codigo}</span>
                      <span className="block text-[12px] text-suave">{tempoRelativo(Date.parse(s.criado_em))}</span>
                    </span>
                    <button className="botao h-8 px-3 text-ok" disabled={ocupado || !temAcesso(porCodigo(s.codigo)!)} onClick={() => decidir(s, true)}>
                      <Check className="h-4 w-4" />
                      Aprovar
                    </button>
                    <button className="botao h-8 px-3" disabled={ocupado} onClick={() => decidir(s, false)}>
                      Recusar
                    </button>
                  </li>
                ))}
              </ul>
            </Secao>
          )}

          {novo && (
            <Secao
              titulo="Novo usuário"
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setNovo(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={adicionar} className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Nome">
                    <input required minLength={2} autoFocus className="entrada" value={novo.nome} onChange={(e) => setNovo({ ...novo, nome: e.target.value })} />
                  </Campo>
                  <Campo rotulo="Usuário">
                    <input
                      required
                      minLength={3}
                      autoCapitalize="none"
                      autoComplete="off"
                      className="entrada codigo"
                      placeholder="ex.: joao.bar"
                      value={novo.login}
                      onChange={(e) => setNovo({ ...novo, login: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30) })}
                    />
                  </Campo>
                  <Campo rotulo="Senha inicial">
                    <input required minLength={8} autoComplete="new-password" className="entrada" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
                  </Campo>
                </div>
                <EscolherFuncoes funcoes={funcoes ?? []} marcadas={novo.funcoes} souDono={souDono} mudar={(f) => setNovo({ ...novo, funcoes: f })} />
                <button type="submit" className="botao-principal h-10 w-full sm:w-auto sm:px-6" disabled={ocupado}>
                  Criar usuário
                </button>
              </form>
            </Secao>
          )}

          {edicao && (
            <EditorMembro
              edicao={edicao}
              setEdicao={setEdicao}
              funcoes={funcoes ?? []}
              porId={porId}
              souDono={souDono}
              ocupado={ocupado}
              salvar={salvarMembro}
              membro={membros.find((m) => m.usuario_id === edicao.usuario_id) ?? null}
              alternarAtivo={alternarAtivo}
              trocarSenha={(senha) =>
                executar(async () => {
                  await contasSistema("senha_usuario", { usuario_id: edicao.usuario_id, senha });
                }, "Senha alterada.")
              }
            />
          )}

          <section className="cartao overflow-hidden">
            {membros.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <Users className="mx-auto h-8 w-8 text-suave" />
                <p className="mt-3 font-medium">Só você por aqui</p>
              </div>
            ) : (
              <ul className="divide-y divide-borda">
                {membros.map((m) => {
                  const pode = editavel(m);
                  return (
                    <li key={m.usuario_id}>
                      <button
                        className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left", pode && "hover:bg-elevado", !m.ativo && "opacity-60", edicao?.usuario_id === m.usuario_id && "bg-destaque-suave")}
                        disabled={!pode}
                        onClick={() => abrirMembro(m)}
                      >
                        <Avatar nome={m.nome || "?"} foto={m.foto_url} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">
                            {m.nome || "Sem nome"}
                            {m.usuario_id === eu && <span className="ml-1.5 text-[12px] font-normal text-suave">(você)</span>}
                            {!m.ativo && <span className="ml-1.5 text-[12px] font-normal text-suave">· desativado</span>}
                            {logins.get(m.usuario_id) && <span className="codigo ml-2 text-[12px] font-normal text-suave">{logins.get(m.usuario_id)}</span>}
                          </span>
                          <span className="mt-1 flex flex-wrap gap-1">
                            {m.papel === "proprietario" ? (
                              <Etiqueta nivel="gerente">{NOME_PAPEL.proprietario}</Etiqueta>
                            ) : m.funcoes.length ? (
                              m.funcoes.map((f) => porId.get(f)).filter((f): f is Funcao => !!f).map((f) => (
                                <Etiqueta key={f.id} nivel={f.nivel}>
                                  {f.nome}
                                </Etiqueta>
                              ))
                            ) : (
                              <span className="text-[12px] text-suave">{m.cargo || "Sem função"}</span>
                            )}
                            {m.codigos.length > 0 && <span className="text-[12px] text-suave">+{m.codigos.length} app{m.codigos.length > 1 ? "s" : ""} só dela</span>}
                          </span>
                        </span>
                        {pode && <ChevronRight className="h-4 w-4 shrink-0 text-suave" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>

          <PromotersEstab estab={id} />
        </>
      )}

      {aba === "funcoes" && (
        <>
          {funcaoAberta && (
            <EditorFuncao f={funcaoAberta} setF={setFuncaoAberta} souDono={souDono} ocupado={ocupado} salvar={salvarFuncao} apagar={apagarFuncao} />
          )}
          {ORDEM_NIVEL.map((n) => {
            const lista = (funcoes ?? []).filter((f) => f.nivel === n);
            if (!lista.length) return null;
            return (
              <section key={n} className="cartao overflow-hidden">
                <h2 className="border-b border-borda px-4 py-3">
                  <span className="font-semibold">{NOME_NIVEL[n]}</span>
                  <span className="block text-[12px] text-suave">{EXPLICA_NIVEL[n]}</span>
                </h2>
                <ul className="divide-y divide-borda">
                  {lista.map((f) => (
                    <li key={f.id}>
                      <button
                        className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado", !f.ativa && "opacity-60", funcaoAberta?.id === f.id && "bg-destaque-suave")}
                        disabled={f.nivel === "gerente" && !souDono}
                        onClick={() => {
                          setEdicao(null);
                          setFuncaoAberta({ id: f.id, nome: f.nome, descricao: f.descricao ?? "", nivel: f.nivel, setor: f.setor, codigos: f.codigos, acoes: f.acoes, desconto_max: f.desconto_max, ativa: f.ativa });
                        }}
                      >
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">
                            {f.nome}
                            {f.setor && <span className="ml-1.5 rounded bg-elevado px-1.5 py-0.5 text-[11px] font-normal">{NOME_SETOR[f.setor]}</span>}
                            {!f.ativa && <span className="ml-1.5 text-[12px] font-normal text-suave">· desligada</span>}
                          </span>
                          {f.descricao && <span className="block truncate text-[13px] text-suave">{f.descricao}</span>}
                          <span className="mt-1 block text-[12px] text-suave">
                            {f.codigos.length} app{f.codigos.length === 1 ? "" : "s"}
                            {f.acoes.length > 0 && ` · ${f.acoes.map((a) => NOME_ACAO[a] ?? a).join(", ")}`}
                            {f.acoes.includes("desconto") && f.desconto_max < 100 && ` (até ${f.desconto_max}%)`}
                          </span>
                        </span>
                        <span className="shrink-0 text-[12px] text-suave">
                          {f.pessoas} {f.pessoas === 1 ? "pessoa" : "pessoas"}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}

      {aba === "suporte" && <SuporteRoVibes estab={id} souDono={atual.papel === "proprietario"} />}
    </TelaUniversal>
  );
}

function Etiqueta({ nivel, children }: { nivel: Nivel; children: ReactNode }) {
  return (
    <span
      className={clsx(
        "rounded-full px-2 py-0.5 text-[11px] font-semibold",
        nivel === "gerente" ? "bg-marca/15 text-magenta" : nivel === "lider" ? "bg-azul/15 text-azul" : "bg-elevado text-texto",
      )}
    >
      {children}
    </span>
  );
}

function EscolherFuncoes({ funcoes, marcadas, souDono, mudar }: { funcoes: Funcao[]; marcadas: string[]; souDono: boolean; mudar: (f: string[]) => void }) {
  return (
    <div>
      <p className="rotulo mb-2">Funções (pode marcar mais de uma)</p>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {funcoes
          .filter((f) => f.ativa)
          .map((f) => {
            const marcada = marcadas.includes(f.id);
            const bloqueada = f.nivel === "gerente" && !souDono;
            return (
              <label
                key={f.id}
                className={clsx(
                  "flex cursor-pointer items-start gap-2.5 rounded-lg border p-3 text-sm",
                  marcada ? "border-marca bg-destaque-suave" : "border-borda hover:bg-elevado",
                  bloqueada && "cursor-not-allowed opacity-50",
                )}
              >
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-[rgb(var(--marca))]"
                  checked={marcada}
                  disabled={bloqueada}
                  onChange={() => mudar(marcada ? marcadas.filter((x) => x !== f.id) : [...marcadas, f.id])}
                />
                <span className="min-w-0">
                  <span className="block font-medium">
                    {f.nome}
                    {f.setor && <span className="ml-1 text-[11px] font-normal text-suave">· {NOME_SETOR[f.setor]}</span>}
                  </span>
                  {f.descricao && <span className="block text-[12px] leading-snug text-suave">{f.descricao}</span>}
                  {bloqueada && <span className="block text-[12px] text-suave">Só o proprietário define gerentes.</span>}
                </span>
              </label>
            );
          })}
      </div>
    </div>
  );
}

function EditorMembro({
  edicao,
  setEdicao,
  funcoes,
  porId,
  souDono,
  ocupado,
  salvar,
  membro,
  alternarAtivo,
  trocarSenha,
}: {
  edicao: EdicaoMembro;
  setEdicao: (e: EdicaoMembro | null) => void;
  funcoes: Funcao[];
  porId: Map<string, Funcao>;
  souDono: boolean;
  ocupado: boolean;
  salvar: (e: FormEvent) => void;
  membro: Membro | null;
  alternarAtivo: (m: Membro) => void;
  trocarSenha: (senha: string) => void;
}) {
  const { temAcesso } = useBusiness();
  const [novaSenha, setNovaSenha] = useState<string | null>(null);
  const dasFuncoes = new Set(edicao.funcoes.flatMap((f) => porId.get(f)?.codigos ?? []));
  const acoes = new Set(edicao.funcoes.flatMap((f) => porId.get(f)?.acoes ?? []));
  const alternar = (lista: "extras" | "retirados", c: string) =>
    setEdicao({ ...edicao, [lista]: edicao[lista].includes(c) ? edicao[lista].filter((x) => x !== c) : [...edicao[lista], c] });

  return (
    <Secao
      titulo={`Acesso de ${edicao.nome}`}
      acao={
        <button className="botao h-8 w-8 px-0" onClick={() => setEdicao(null)} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={salvar} className="space-y-5">
        <EscolherFuncoes funcoes={funcoes} marcadas={edicao.funcoes} souDono={souDono} mudar={(f) => setEdicao({ ...edicao, funcoes: f })} />

        <div>
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="rotulo">Aplicativos</span>
            <span className="text-[12px] text-suave">Os das funções vêm marcados. Desmarque para tirar só desta pessoa; marque outros para dar só a ela.</span>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AREAS.filter((a) => LIBERAVEIS.some((x) => x.area === a)).map((area) => (
              <fieldset key={area} className="rounded-lg border border-borda p-3">
                <legend className="px-1 text-[13px] font-semibold">{area}</legend>
                <ul className="space-y-1.5">
                  {LIBERAVEIS.filter((x) => x.area === area).map((a) => {
                    const daFuncao = dasFuncoes.has(a.codigo);
                    const tirado = edicao.retirados.includes(a.codigo);
                    const extra = edicao.extras.includes(a.codigo);
                    const marcado = daFuncao ? !tirado : extra;
                    const pode = daFuncao || temAcesso(a) || extra;
                    return (
                      <li key={a.codigo}>
                        <label className={clsx("flex items-center gap-2.5 text-sm", !pode && "opacity-50")}>
                          <input
                            type="checkbox"
                            className="h-4 w-4 accent-[rgb(var(--marca))]"
                            checked={marcado}
                            disabled={!pode}
                            onChange={() => (daFuncao ? alternar("retirados", a.codigo) : alternar("extras", a.codigo))}
                          />
                          <a.icone className="h-4 w-4 text-suave" />
                          <span className={clsx("flex-1", daFuncao && tirado && "line-through text-suave")}>{a.nome}</span>
                          <span className="text-[11px] text-suave">{daFuncao ? (tirado ? "tirado" : "função") : extra ? "só dela" : ""}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        </div>

        {acoes.size > 0 && (
          <p className="rounded-lg bg-elevado/60 px-3 py-2 text-[13px]">
            <span className="font-semibold">Ações liberadas pelas funções:</span> {[...acoes].map((a) => NOME_ACAO[a] ?? a).join(", ")}.
            <span className="block text-suave">O que não estiver aqui vira pedido de autorização para o gerente ou o líder do setor.</span>
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="botao-principal" disabled={ocupado}>
            Salvar acesso
          </button>
          <button type="button" className="botao" onClick={() => setEdicao(null)}>
            Cancelar
          </button>
          {novaSenha === null ? (
            <button type="button" className="botao" onClick={() => setNovaSenha("")}>
              <KeyRound className="h-4 w-4" />
              Nova senha
            </button>
          ) : (
            <span className="flex items-center gap-2">
              <input
                autoFocus
                minLength={8}
                autoComplete="new-password"
                className="entrada h-10 w-44"
                placeholder="mín. 8 caracteres"
                value={novaSenha}
                onChange={(e) => setNovaSenha(e.target.value)}
                aria-label="Nova senha"
              />
              <button
                type="button"
                className="botao"
                disabled={ocupado || novaSenha.length < 8}
                onClick={() => {
                  trocarSenha(novaSenha);
                  setNovaSenha(null);
                }}
              >
                Salvar
              </button>
            </span>
          )}
          {membro && (
            <button type="button" className="botao ml-auto text-perigo" disabled={ocupado} onClick={() => alternarAtivo(membro)}>
              <UserMinus className="h-4 w-4" />
              {membro.ativo ? "Desativar" : "Reativar"}
            </button>
          )}
        </div>
      </form>
    </Secao>
  );
}

function EditorFuncao({
  f,
  setF,
  souDono,
  ocupado,
  salvar,
  apagar,
}: {
  f: EdicaoFuncao;
  setF: (f: EdicaoFuncao | null) => void;
  souDono: boolean;
  ocupado: boolean;
  salvar: (e: FormEvent) => void;
  apagar: (f: EdicaoFuncao) => void;
}) {
  const { temAcesso, pode, meus, atual } = useBusiness();
  const maxDesconto = atual?.papel === "proprietario" || atual?.papel === "suporte" || atual?.papel === "gestor" ? 100 : meus.descontoMax;
  const alternar = (campo: "codigos" | "acoes", v: string) => setF({ ...f, [campo]: f[campo].includes(v) ? f[campo].filter((x) => x !== v) : [...f[campo], v] });

  return (
    <Secao
      titulo={f.id ? `Função: ${f.nome || "sem nome"}` : "Nova função"}
      acao={
        <button className="botao h-8 w-8 px-0" onClick={() => setF(null)} aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
      }
    >
      <form onSubmit={salvar} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Nome" className="sm:col-span-2">
            <input required minLength={2} maxLength={40} className="entrada" value={f.nome} onChange={(e) => setF({ ...f, nome: e.target.value })} placeholder="Ex.: Maître, Sommelier, Hostess" />
          </Campo>
          <Campo rotulo="Nível">
            <select className="entrada" value={f.nivel} onChange={(e) => setF({ ...f, nivel: e.target.value as Nivel })}>
              <option value="equipe">{NOME_NIVEL.equipe}</option>
              <option value="lider">{NOME_NIVEL.lider}</option>
              {(souDono || f.nivel === "gerente") && <option value="gerente">{NOME_NIVEL.gerente}</option>}
            </select>
          </Campo>
          <Campo rotulo="O que essa função faz" className="sm:col-span-2">
            <input maxLength={160} className="entrada" value={f.descricao ?? ""} onChange={(e) => setF({ ...f, descricao: e.target.value })} />
          </Campo>
          <Campo rotulo="Setor de preparo">
            <select className="entrada" value={f.setor ?? ""} onChange={(e) => setF({ ...f, setor: (e.target.value || null) as EdicaoFuncao["setor"] })}>
              <option value="">Todos</option>
              <option value="cozinha">Só cozinha</option>
              <option value="bar">Só bar</option>
            </select>
          </Campo>
        </div>
        <p className="-mt-2 text-[12px] text-suave">{EXPLICA_NIVEL[f.nivel]} O setor limita o Preparo e o cancelamento de itens ao setor escolhido.</p>

        <div>
          <p className="rotulo mb-2">Aplicativos da função</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {AREAS.filter((a) => LIBERAVEIS.some((x) => x.area === a)).map((area) => (
              <fieldset key={area} className="rounded-lg border border-borda p-3">
                <legend className="px-1 text-[13px] font-semibold">{area}</legend>
                <ul className="space-y-1.5">
                  {LIBERAVEIS.filter((x) => x.area === area).map((a) => {
                    const marcado = f.codigos.includes(a.codigo);
                    const ok = temAcesso(a) || marcado;
                    return (
                      <li key={a.codigo}>
                        <label className={clsx("flex items-center gap-2.5 text-sm", !ok && "opacity-50")}>
                          <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={marcado} disabled={!ok} onChange={() => alternar("codigos", a.codigo)} />
                          <a.icone className="h-4 w-4 text-suave" />
                          <span className="flex-1">{a.nome}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            ))}
          </div>
        </div>

        <div>
          <p className="rotulo mb-2">Ações sensíveis que a função faz sozinha</p>
          <ul className="grid gap-2 md:grid-cols-2">
            {ACOES.map((a) => {
              const marcado = f.acoes.includes(a.id);
              const ok = pode(a.id) || marcado;
              return (
                <li key={a.id}>
                  <label className={clsx("flex items-start gap-2.5 rounded-lg border p-3 text-sm", marcado ? "border-marca bg-destaque-suave" : "border-borda", !ok && "opacity-50")}>
                    <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--marca))]" checked={marcado} disabled={!ok} onChange={() => alternar("acoes", a.id)} />
                    <span>
                      <span className="block font-medium">{a.nome}</span>
                      <span className="block text-[12px] leading-snug text-suave">{a.explica}</span>
                      {a.id === "desconto" && marcado && (
                        <span className="mt-2 flex items-center gap-2 text-[13px]">
                          Até
                          <input
                            type="number"
                            min={0}
                            max={maxDesconto}
                            step={1}
                            className="entrada h-8 w-20"
                            value={f.desconto_max}
                            onChange={(e) => setF({ ...f, desconto_max: Math.min(maxDesconto, Math.max(0, Number(e.target.value) || 0)) })}
                            onClick={(e) => e.preventDefault()}
                          />
                          % do consumo
                        </span>
                      )}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] text-suave">Sem a ação, a pessoa ainda consegue pedir: o pedido vai para quem pode autorizar.</p>
        </div>

        {f.id && (
          <label className="flex items-center gap-2.5 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={f.ativa} onChange={() => setF({ ...f, ativa: !f.ativa })} />
            Função ligada (desligada, ninguém recebe os acessos dela)
          </label>
        )}

        <div className="flex flex-wrap gap-2">
          <button type="submit" className="botao-principal" disabled={ocupado || f.nome.trim().length < 2}>
            Salvar função
          </button>
          <button type="button" className="botao" onClick={() => setF(null)}>
            Cancelar
          </button>
          {f.id && (
            <button type="button" className="botao ml-auto text-perigo" disabled={ocupado} onClick={() => apagar(f)}>
              <Trash2 className="h-4 w-4" />
              Apagar
            </button>
          )}
        </div>
      </form>
    </Secao>
  );
}

interface Suporte {
  id: string;
  liberado_em: string;
  expira_em: string;
  motivo: string | null;
  encerrado_em: string | null;
  ativo: boolean;
}

/** Modo suporte: o proprietário deixa a equipe RoVibes entrar no estabelecimento por algumas horas. */
function SuporteRoVibes({ estab, souDono }: { estab: string; souDono: boolean }) {
  const [lista, setLista] = useState<Suporte[] | null>(null);
  const [horas, setHoras] = useState(8);
  const [motivo, setMotivo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("suportes_do_estab", { p_estab: estab });
    if (error) {
      setErro(/function|schema cache/i.test(error.message) ? "Aplique a atualização 039 do banco para usar o modo suporte." : mensagemDeErro(error));
      setLista([]);
      return;
    }
    setLista((data ?? []) as Suporte[]);
  }, [estab]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const ativo = lista?.find((s) => s.ativo) ?? null;
  const agir = async (fn: () => PromiseLike<{ error: unknown }>) => {
    setOcupado(true);
    setErro("");
    const { error } = await fn();
    setOcupado(false);
    if (error) setErro(mensagemDeErro(error));
    setMotivo("");
    void carregar();
  };

  return (
    <Secao titulo="Suporte RoVibes">
      <div className="space-y-4 text-sm">
        <p className="text-suave">
          A equipe RoVibes não entra na operação do seu estabelecimento. Se precisar de ajuda, libere o modo suporte por algumas horas: o suporte vê e mexe como o
          proprietário, e tudo fica registrado no histórico. Você pode encerrar quando quiser.
        </p>
        {erro && <Aviso tipo="erro">{erro}</Aviso>}
        {ativo ? (
          <div className="rounded-lg border border-ok/40 bg-ok/10 p-3">
            <p className="flex items-center gap-2 font-semibold text-ok">
              <Headset className="h-4 w-4" />
              Suporte liberado até {new Date(ativo.expira_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
            </p>
            {ativo.motivo && <p className="mt-0.5 text-suave">{ativo.motivo}</p>}
            {souDono && (
              <button className="botao mt-3 h-9" disabled={ocupado} onClick={() => void agir(() => supabase.rpc("encerrar_suporte", { p_estab: estab }))}>
                Encerrar agora
              </button>
            )}
          </div>
        ) : souDono ? (
          <div className="grid gap-3 sm:grid-cols-[160px_1fr_auto] sm:items-end">
            <Campo rotulo="Por quanto tempo">
              <select className="entrada" value={horas} onChange={(e) => setHoras(Number(e.target.value))}>
                {[2, 8, 24, 72].map((h) => (
                  <option key={h} value={h}>
                    {h} horas
                  </option>
                ))}
              </select>
            </Campo>
            <Campo rotulo="Para quê (opcional)">
              <input className="entrada" maxLength={300} value={motivo} onChange={(e) => setMotivo(e.target.value)} placeholder="Ex.: ajuda para montar o cardápio" />
            </Campo>
            <button className="botao-principal h-10" disabled={ocupado} onClick={() => void agir(() => supabase.rpc("liberar_suporte", { p_estab: estab, p_horas: horas, p_motivo: motivo }))}>
              <Headset className="h-4 w-4" />
              Liberar suporte
            </button>
          </div>
        ) : (
          <p className="text-suave">Só o proprietário libera o modo suporte.</p>
        )}
        {lista && lista.filter((s) => !s.ativo).length > 0 && (
          <div>
            <p className="rotulo mb-1">Histórico</p>
            <ul className="divide-y divide-borda text-[13px]">
              {lista
                .filter((s) => !s.ativo)
                .map((s) => (
                  <li key={s.id} className="flex justify-between gap-3 py-1.5">
                    <span>{new Date(s.liberado_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="truncate text-suave">{s.motivo ?? ""}</span>
                    <span className="shrink-0 text-suave">{s.encerrado_em ? "encerrado" : "expirou"}</span>
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>
    </Secao>
  );
}
