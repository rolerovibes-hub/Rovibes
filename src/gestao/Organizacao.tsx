import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Crown, KeyRound, Plus, ShieldOff, Trash2, UserMinus, UserPlus, X } from "lucide-react";
import { TelaUniversal } from "@/business/TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { AREAS_OPERACAO, contasGestao, NIVEIS_ACAO, nomeArea } from "@/lib/gestao";
import { NIVEIS_ROVIBES } from "@/lib/funcoes";
import { useSessao } from "@/lib/sessao";

interface Pessoa {
  usuario_id: string;
  login: string;
  nome: string;
  ceo: boolean;
  ativo: boolean;
  cargo_id: string | null;
  cargo: string | null;
  niveis: string[];
}

interface Cargo {
  id: string;
  nome: string;
  niveis: string[];
  permissoes?: Record<string, number>;
}

const nomeNivel = (n: string) => NIVEIS_ROVIBES.find((x) => x.id === n)?.nome ?? n;
const resumoPermissoes = (p?: Record<string, number>) => {
  const itens = Object.entries(p ?? {}).filter(([, n]) => n > 0);
  return itens.length ? itens.map(([a, n]) => `${nomeArea(a)}: ${NIVEIS_ACAO[n].toLowerCase()}`).join(" · ") : "Sem acesso";
};

/** Organização da Gestão RoVibes: o CEO cria os cargos (com níveis) e os usuários. */
export function Organizacao() {
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const [aba, setAba] = useState<"pessoas" | "cargos">("pessoas");
  const [pessoas, setPessoas] = useState<Pessoa[]>([]);
  const [cargos, setCargos] = useState<Cargo[]>([]);
  const [novo, setNovo] = useState<{ nome: string; login: string; senha: string; cargo_id: string } | null>(null);
  const [aberta, setAberta] = useState<string | null>(null);
  const [cargo, setCargo] = useState<{ id: string | null; nome: string; permissoes: Record<string, number> } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const [p, c] = await Promise.all([supabase.rpc("organizacao_gestao"), supabase.from("gestao_cargos").select("id, nome, niveis, permissoes").order("nome")]);
    if (p.error) setAviso({ tipo: "erro", texto: /function|schema cache/i.test(p.error.message) ? "Aplique a atualização 048 do banco." : mensagemDeErro(p.error) });
    setPessoas((p.data ?? []) as Pessoa[]);
    setCargos((c.data ?? []) as Cargo[]);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const executar = async (acao: () => Promise<unknown>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
      await carregar();
    } catch (e) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(e) });
    } finally {
      setOcupado(false);
    }
  };
  const rpc = async (nome: string, args: Record<string, unknown>) => {
    const { error } = await supabase.rpc(nome, args);
    if (error) throw error;
  };

  const criar = (e: FormEvent) => {
    e.preventDefault();
    if (!novo) return;
    void executar(async () => {
      await contasGestao("criar_usuario", novo);
      setNovo(null);
    }, `Usuário ${novo.login} criado. No primeiro acesso ele cadastra o código no celular.`);
  };

  const salvarCargo = (e: FormEvent) => {
    e.preventDefault();
    if (!cargo) return;
    void executar(async () => {
      await rpc("salvar_cargo_gestao", { p_id: cargo.id, p_nome: cargo.nome, p_permissoes: cargo.permissoes });
      setCargo(null);
    }, "Cargo salvo.");
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => (setAba("pessoas"), setNovo({ nome: "", login: "", senha: "", cargo_id: cargos[0]?.id ?? "" }))}>
            <UserPlus className="h-4 w-4" />
            Novo usuário
          </button>
          <button className="botao" onClick={() => (setAba("cargos"), setCargo({ id: null, nome: "", permissoes: {} }))}>
            <Plus className="h-4 w-4" />
            Novo cargo
          </button>
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <div className="grid grid-cols-2 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Organização">
        {(
          [
            ["pessoas", `Pessoas · ${pessoas.filter((p) => p.ativo).length}`],
            ["cargos", `Cargos · ${cargos.length}`],
          ] as const
        ).map(([a, nome]) => (
          <button key={a} role="tab" aria-selected={aba === a} onClick={() => setAba(a)} className={clsx("rounded-md py-2 text-sm", aba === a ? "bg-destaque-suave font-semibold text-destaque" : "text-suave")}>
            {nome}
          </button>
        ))}
      </div>

      {aba === "pessoas" && (
        <>
          {novo && (
            <Secao
              titulo="Novo usuário"
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setNovo(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={criar} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
                    value={novo.login}
                    onChange={(e) => setNovo({ ...novo, login: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30) })}
                  />
                </Campo>
                <Campo rotulo="Senha inicial (mín. 10)">
                  <input required minLength={10} autoComplete="new-password" className="entrada" value={novo.senha} onChange={(e) => setNovo({ ...novo, senha: e.target.value })} />
                </Campo>
                <Campo rotulo="Cargo">
                  <select required className="entrada" value={novo.cargo_id} onChange={(e) => setNovo({ ...novo, cargo_id: e.target.value })}>
                    <option value="">Escolha</option>
                    {cargos.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <button type="submit" className="botao-principal h-10 sm:col-span-2 xl:col-span-4 xl:w-fit xl:px-6" disabled={ocupado}>
                  Criar usuário
                </button>
              </form>
            </Secao>
          )}

          <section className="cartao overflow-hidden">
            <ul className="divide-y divide-borda">
              {pessoas.map((p) => (
                <li key={p.usuario_id} className={clsx(!p.ativo && "opacity-60")}>
                  <button
                    className={clsx("flex w-full items-center gap-3 px-4 py-3 text-left", !p.ceo && "hover:bg-elevado", aberta === p.usuario_id && "bg-destaque-suave")}
                    disabled={p.ceo}
                    onClick={() => setAberta(aberta === p.usuario_id ? null : p.usuario_id)}
                  >
                    <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-bold", p.ceo ? "bg-marca text-marca-texto" : "bg-elevado text-suave")}>
                      {p.ceo ? <Crown className="h-4 w-4" /> : p.nome.charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">
                        {p.nome}
                        {p.usuario_id === eu && <span className="ml-1.5 text-[12px] font-normal text-suave">(você)</span>}
                        <span className="codigo ml-2 text-[12px] font-normal text-suave">{p.login}</span>
                      </span>
                      <span className="block text-[12px] text-suave">
                        {p.ceo ? "CEO" : p.cargo ?? "Sem cargo"}
                        {!p.ativo && " · desativado"}
                      </span>
                    </span>
                  </button>
                  {aberta === p.usuario_id && !p.ceo && (
                    <AcoesPessoa
                      p={p}
                      cargos={cargos}
                      ocupado={ocupado}
                      mudarCargo={(c) => void executar(() => rpc("definir_cargo_gestao", { p_usuario: p.usuario_id, p_cargo: c }), "Cargo alterado.")}
                      novaSenha={(s) => void executar(() => contasGestao("senha_usuario", { usuario_id: p.usuario_id, senha: s }), "Senha alterada.")}
                      zerarCodigo={() =>
                        window.confirm(`Zerar o código do autenticador de ${p.nome}? No próximo acesso ele cadastra de novo.`) &&
                        void executar(() => contasGestao("zerar_codigo", { usuario_id: p.usuario_id }), "Código zerado.")
                      }
                      alternarAtivo={() => void executar(() => rpc("situacao_gestao", { p_usuario: p.usuario_id, p_ativo: !p.ativo }), p.ativo ? "Usuário desativado." : "Usuário reativado.")}
                    />
                  )}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}

      {aba === "cargos" && (
        <>
          {cargo && (
            <Secao
              titulo={cargo.id ? "Editar cargo" : "Novo cargo"}
              acao={
                <button className="botao h-8 w-8 px-0" onClick={() => setCargo(null)} aria-label="Fechar">
                  <X className="h-4 w-4" />
                </button>
              }
            >
              <form onSubmit={salvarCargo} className="space-y-4">
                <Campo rotulo="Nome do cargo">
                  <input required minLength={2} maxLength={40} autoFocus className="entrada max-w-sm" value={cargo.nome} onChange={(e) => setCargo({ ...cargo, nome: e.target.value })} />
                </Campo>
                <div className="overflow-x-auto rounded-lg border border-borda">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-borda text-left text-[12px] text-suave">
                        <th className="px-3 py-2 font-semibold">Área</th>
                        {NIVEIS_ACAO.map((n) => (
                          <th key={n} className="px-1 py-2 text-center font-semibold">
                            {n}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {AREAS_OPERACAO.map((a) => {
                        const atual = cargo.permissoes[a.id] ?? 0;
                        return (
                          <tr key={a.id} className="border-b border-borda last:border-0">
                            <td className="px-3 py-1.5">{a.nome}</td>
                            {NIVEIS_ACAO.map((n, i) => (
                              <td key={n} className="px-1 py-1.5 text-center">
                                <button
                                  type="button"
                                  onClick={() => setCargo({ ...cargo, permissoes: { ...cargo.permissoes, [a.id]: i } })}
                                  aria-label={`${a.nome}: ${n}`}
                                  aria-pressed={atual === i}
                                  className={clsx("h-6 w-6 rounded-md border", atual === i ? "border-marca bg-marca" : i > 0 && i < atual ? "border-marca/40 bg-marca/30" : "border-borda")}
                                />
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="botao-principal h-10 px-6" disabled={ocupado}>
                    Salvar cargo
                  </button>
                  {cargo.id && (
                    <button
                      type="button"
                      className="botao h-10 text-perigo"
                      disabled={ocupado}
                      onClick={() =>
                        window.confirm(`Apagar o cargo ${cargo.nome}?`) &&
                        void executar(async () => {
                          await rpc("apagar_cargo_gestao", { p_id: cargo.id });
                          setCargo(null);
                        }, "Cargo apagado.")
                      }
                    >
                      <Trash2 className="h-4 w-4" />
                      Apagar
                    </button>
                  )}
                </div>
              </form>
            </Secao>
          )}
          <section className="cartao overflow-hidden">
            <ul className="divide-y divide-borda">
              {cargos.map((c) => (
                <li key={c.id}>
                  <button className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-elevado" onClick={() => setCargo({ id: c.id, nome: c.nome, permissoes: c.permissoes ?? {} })}>
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{c.nome}</span>
                      <span className="block text-[12px] text-suave">{resumoPermissoes(c.permissoes)}</span>
                    </span>
                    <span className="text-[12px] text-suave">{pessoas.filter((p) => p.cargo_id === c.id).length} pessoas</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </TelaUniversal>
  );
}

function AcoesPessoa({
  p,
  cargos,
  ocupado,
  mudarCargo,
  novaSenha,
  zerarCodigo,
  alternarAtivo,
}: {
  p: Pessoa;
  cargos: Cargo[];
  ocupado: boolean;
  mudarCargo: (c: string) => void;
  novaSenha: (s: string) => void;
  zerarCodigo: () => void;
  alternarAtivo: () => void;
}) {
  const [senha, setSenha] = useState<string | null>(null);
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-borda bg-fundo/60 px-4 py-3">
      <select className="entrada h-10 w-48" value={p.cargo_id ?? ""} disabled={ocupado} onChange={(e) => e.target.value && mudarCargo(e.target.value)} aria-label="Cargo">
        <option value="">Sem cargo</option>
        {cargos.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nome}
          </option>
        ))}
      </select>
      {senha === null ? (
        <button className="botao" onClick={() => setSenha("")}>
          <KeyRound className="h-4 w-4" />
          Nova senha
        </button>
      ) : (
        <span className="flex items-center gap-2">
          <input autoFocus minLength={10} autoComplete="new-password" className="entrada h-10 w-44" placeholder="mín. 10" value={senha} onChange={(e) => setSenha(e.target.value)} aria-label="Nova senha" />
          <button
            className="botao"
            disabled={ocupado || senha.length < 10}
            onClick={() => {
              novaSenha(senha);
              setSenha(null);
            }}
          >
            Salvar
          </button>
        </span>
      )}
      <button className="botao" onClick={zerarCodigo} disabled={ocupado}>
        <ShieldOff className="h-4 w-4" />
        Zerar código
      </button>
      <button className="botao ml-auto text-perigo" onClick={alternarAtivo} disabled={ocupado}>
        <UserMinus className="h-4 w-4" />
        {p.ativo ? "Desativar" : "Reativar"}
      </button>
    </div>
  );
}
