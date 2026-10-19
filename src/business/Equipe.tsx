import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Check, Pencil, UserMinus, UserPlus, Users, X } from "lucide-react";
import { PromotersEstab } from "./Promoters";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { Avatar } from "@/components/Avatar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NOME_PAPEL, Papel, tempoRelativo, useBusiness } from "@/lib/acessos";
import { AREAS, CATALOGO, porCodigo } from "@/lib/catalogo";
import { useSessao } from "@/lib/sessao";

interface Membro {
  usuario_id: string;
  nome: string;
  email: string;
  papel: Papel;
  cargo: string | null;
  ativo: boolean;
  codigos: string[];
  desde: string;
}

interface Solicitacao {
  id: string;
  usuario_id: string;
  nome: string;
  codigo: string;
  criado_em: string;
}

interface Edicao {
  usuario_id: string;
  nome: string;
  papel: "gestor" | "equipe";
  cargo: string;
  ativo: boolean;
  codigos: string[];
}

// Aplicativos que entram na matriz de permissões (os padrão e os da Administração ficam fora).
const LIBERAVEIS = CATALOGO.filter((a) => !a.padrao && a.area !== "Administração");

const CARGOS = ["Gerente", "Garçom", "Bar", "Cozinha", "Caixa", "Recepção", "Marketing"];

export function Equipe() {
  const { atual, temAcesso } = useBusiness();
  const { sessao } = useSessao();
  const eu = sessao?.user.id;
  const id = atual?.estabelecimento_id;
  const souDono = atual?.papel === "proprietario";
  const [membros, setMembros] = useState<Membro[]>([]);
  const [pendentes, setPendentes] = useState<Solicitacao[]>([]);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ email: string; papel: "gestor" | "equipe"; cargo: string } | null>(null);
  const [edicao, setEdicao] = useState<Edicao | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [m, s] = await Promise.all([supabase.rpc("equipe", { p_estab: id }), supabase.rpc("solicitacoes_pendentes", { p_estab: id })]);
    setMembros((m.data ?? []) as Membro[]);
    setPendentes((s.data ?? []) as Solicitacao[]);
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const membro = membros.find((m) => m.usuario_id === selecionado) ?? null;
  const editavel = (m: Membro | null) => !!m && m.papel !== "proprietario" && m.usuario_id !== eu && (souDono || m.papel !== "gestor");

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

  const adicionar = (e: FormEvent) => {
    e.preventDefault();
    if (!novo) return;
    void executar(async () => {
      const { data, error } = await supabase.rpc("adicionar_membro", { p_estab: id, p_email: novo.email, p_papel: novo.papel, p_cargo: novo.cargo });
      if (error) throw error;
      setNovo(null);
      await carregar();
      setSelecionado(data as string);
      const m = (await supabase.rpc("equipe", { p_estab: id })).data as Membro[] | null;
      const criado = m?.find((x) => x.usuario_id === data);
      if (criado) abrirEdicao(criado);
    }, "Pessoa adicionada. Agora marque os aplicativos que ela pode usar.");
  };

  const abrirEdicao = (m: Membro) =>
    setEdicao({ usuario_id: m.usuario_id, nome: m.nome, papel: m.papel === "gestor" ? "gestor" : "equipe", cargo: m.cargo ?? "", ativo: m.ativo, codigos: m.codigos });

  const salvarEdicao = (e: FormEvent) => {
    e.preventDefault();
    if (!edicao) return;
    void executar(async () => {
      const { error } = await supabase.rpc("atualizar_membro", {
        p_estab: id,
        p_usuario: edicao.usuario_id,
        p_papel: edicao.papel,
        p_cargo: edicao.cargo,
        p_ativo: edicao.ativo,
        p_codigos: edicao.codigos,
      });
      if (error) throw error;
      setEdicao(null);
      await carregar();
    }, "Acesso atualizado.");
  };

  const alternarAtivo = () =>
    membro &&
    void executar(async () => {
      if (membro.ativo && !window.confirm(`Desativar ${membro.nome}? A pessoa perde o acesso a este estabelecimento, mas o histórico fica guardado.`)) return;
      const { error } = await supabase.rpc("atualizar_membro", {
        p_estab: id,
        p_usuario: membro.usuario_id,
        p_papel: membro.papel,
        p_cargo: membro.cargo ?? "",
        p_ativo: !membro.ativo,
        p_codigos: null,
      });
      if (error) throw error;
      await carregar();
    }, membro.ativo ? "Pessoa desativada." : "Pessoa reativada.");

  const decidir = (s: Solicitacao, aprovar: boolean) =>
    void executar(async () => {
      const { error } = await supabase.rpc("decidir_solicitacao", { p_id: s.id, p_aprovar: aprovar });
      if (error) throw error;
      await carregar();
    }, aprovar ? `${s.nome} agora usa ${porCodigo(s.codigo)?.nome ?? s.codigo}.` : "Pedido recusado.");

  const alternarCodigo = (c: string) =>
    edicao && setEdicao({ ...edicao, codigos: edicao.codigos.includes(c) ? edicao.codigos.filter((x) => x !== c) : [...edicao.codigos, c] });

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setNovo({ email: "", papel: "equipe", cargo: "" })}>
            <UserPlus className="h-4 w-4" />
            Adicionar pessoa
          </button>
          <button className="botao" disabled={!editavel(membro)} onClick={() => membro && abrirEdicao(membro)}>
            <Pencil className="h-4 w-4" />
            Editar acesso
          </button>
          <button className="botao" disabled={!editavel(membro) || ocupado} onClick={alternarAtivo}>
            <UserMinus className="h-4 w-4" />
            {membro && !membro.ativo ? "Reativar" : "Desativar"}
          </button>
        </>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {pendentes.length > 0 && (
        <Secao titulo={`Pedidos de acesso (${pendentes.length})`}>
          <ul className="divide-y divide-borda">
            {pendentes.map((s) => (
              <li key={s.id} className="flex flex-wrap items-center gap-3 py-2.5 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-medium">{s.nome}</span> pediu <span className="font-medium">{porCodigo(s.codigo)?.nome ?? s.codigo}</span>
                  <span className="codigo ml-1.5 text-suave">{s.codigo}</span>
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
          titulo="Adicionar pessoa"
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setNovo(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={adicionar} className="grid gap-4 sm:grid-cols-3">
            <Campo rotulo="E-mail da conta RoVibes" className="sm:col-span-3">
              <input required type="email" autoFocus className="entrada" value={novo.email} onChange={(e) => setNovo({ ...novo, email: e.target.value })} />
            </Campo>
            <Campo rotulo="Papel">
              <select className="entrada" value={novo.papel} onChange={(e) => setNovo({ ...novo, papel: e.target.value as "gestor" | "equipe" })}>
                <option value="equipe">Equipe</option>
                {souDono && <option value="gestor">Gestor</option>}
              </select>
            </Campo>
            <Campo rotulo="Cargo">
              <input className="entrada" list="cargos" placeholder="Garçom, Bar, Caixa..." value={novo.cargo} onChange={(e) => setNovo({ ...novo, cargo: e.target.value })} />
            </Campo>
            <div className="flex items-end">
              <button type="submit" className="botao-principal h-10 w-full" disabled={ocupado}>
                Adicionar
              </button>
            </div>
            <p className="text-[13px] text-suave sm:col-span-3">A pessoa precisa ter criado a conta no RoVibes com este e-mail. Ela verá o estabelecimento no Business ao entrar.</p>
          </form>
        </Secao>
      )}
      <datalist id="cargos">
        {CARGOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      {edicao && (
        <Secao
          titulo={`Acesso de ${edicao.nome}`}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setEdicao(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvarEdicao} className="space-y-5">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Papel">
                <select className="entrada" value={edicao.papel} disabled={!souDono} onChange={(e) => setEdicao({ ...edicao, papel: e.target.value as "gestor" | "equipe" })}>
                  <option value="equipe">Equipe</option>
                  <option value="gestor">Gestor</option>
                </select>
              </Campo>
              <Campo rotulo="Cargo">
                <input className="entrada" list="cargos" value={edicao.cargo} onChange={(e) => setEdicao({ ...edicao, cargo: e.target.value })} />
              </Campo>
            </div>
            <div>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <span className="rotulo">Aplicativos liberados</span>
                <span className="text-[12px] text-suave">Você só pode liberar aplicativos que você mesmo usa.</span>
              </div>
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {AREAS.filter((a) => LIBERAVEIS.some((x) => x.area === a)).map((area) => (
                  <fieldset key={area} className="rounded-lg border border-borda p-3">
                    <legend className="px-1 text-[13px] font-semibold">{area}</legend>
                    <ul className="space-y-1.5">
                      {LIBERAVEIS.filter((x) => x.area === area).map((a) => {
                        const pode = temAcesso(a);
                        const marcado = edicao.codigos.includes(a.codigo);
                        return (
                          <li key={a.codigo}>
                            <label className={clsx("flex items-center gap-2.5 text-sm", !pode && "opacity-50")}>
                              <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--marca))]" checked={marcado} disabled={!pode} onChange={() => alternarCodigo(a.codigo)} />
                              <a.icone className="h-4 w-4 text-suave" />
                              <span className="flex-1">{a.nome}</span>
                              <span className="codigo text-suave">{a.codigo}</span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </fieldset>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Salvar acesso
              </button>
              <button type="button" className="botao" onClick={() => setEdicao(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Secao>
      )}

      <section className="cartao overflow-hidden">
        {membros.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <Users className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">Só você por aqui</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Pessoa", "Papel", "Aplicativos", "Situação"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {membros.map((m) => (
                  <tr
                    key={m.usuario_id}
                    onClick={() => setSelecionado(m.usuario_id)}
                    onDoubleClick={() => editavel(m) && abrirEdicao(m)}
                    aria-selected={selecionado === m.usuario_id}
                    className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === m.usuario_id ? "bg-destaque-suave" : "hover:bg-elevado", !m.ativo && "text-suave")}
                  >
                    <td className="px-4 py-2.5">
                      <span className="flex items-center gap-3">
                        <Avatar nome={m.nome || "?"} />
                        <span className="min-w-0">
                          <span className="block font-medium">
                            {m.nome || "Sem nome"}
                            {m.usuario_id === eu && <span className="ml-1.5 text-[12px] font-normal text-suave">(você)</span>}
                          </span>
                          <span className="block text-[12px] text-suave">{m.email}</span>
                        </span>
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-2.5">
                      {NOME_PAPEL[m.papel]}
                      {m.cargo && <span className="text-suave"> · {m.cargo}</span>}
                    </td>
                    <td className="px-4 py-2.5">
                      {m.papel === "proprietario" ? (
                        <span className="text-suave">Todos</span>
                      ) : m.codigos.length ? (
                        <span className="flex flex-wrap gap-1">
                          {m.codigos.map((c) => (
                            <span key={c} title={porCodigo(c)?.nome} className="codigo rounded border border-borda px-1.5 py-0.5">
                              {c}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-suave">Nenhum</span>
                      )}
                    </td>
                    <td className={clsx("whitespace-nowrap px-4 py-2.5 font-medium", m.ativo ? "text-ok" : "text-suave")}>{m.ativo ? "Ativo" : "Desativado"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {id && <PromotersEstab estab={id} />}
    </TelaUniversal>
  );
}
