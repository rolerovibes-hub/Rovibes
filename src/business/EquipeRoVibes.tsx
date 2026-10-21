import { FormEvent, useCallback, useEffect, useState } from "react";
import clsx from "clsx";
import { Trash2, UserPlus, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { Avatar } from "@/components/Avatar";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";
import { NIVEIS_ROVIBES } from "@/lib/funcoes";

interface Pessoa {
  usuario_id: string;
  nome: string;
  email: string;
  foto_url: string | null;
  niveis: string[];
  desde: string;
}

/** A1008 · Equipe RoVibes: quem trabalha no RoVibes e o que cada um pode fazer (só o nível geral). */
export function EquipeRoVibes() {
  const { sessao } = useSessao();
  const [lista, setLista] = useState<Pessoa[]>([]);
  const [edicao, setEdicao] = useState<{ email: string; niveis: string[]; novo: boolean } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc("equipe_rovibes");
    if (error) return setAviso({ tipo: "erro", texto: /function|schema cache/i.test(error.message) ? "Aplique a atualização 039 do banco." : mensagemDeErro(error) });
    setLista((data ?? []) as Pessoa[]);
  }, []);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    if (!edicao) return;
    setOcupado(true);
    setAviso(null);
    const { error } = await supabase.rpc("salvar_equipe_rovibes", { p_email: edicao.email, p_niveis: edicao.niveis });
    setOcupado(false);
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    setEdicao(null);
    setAviso({ tipo: "ok", texto: "Acesso salvo. Vale quando a pessoa abrir o Business de novo." });
    void carregar();
  };

  const remover = async (p: Pessoa) => {
    if (!window.confirm(`Tirar ${p.nome || p.email} da equipe RoVibes?`)) return;
    const { error } = await supabase.rpc("remover_equipe_rovibes", { p_usuario: p.usuario_id });
    if (error) return setAviso({ tipo: "erro", texto: mensagemDeErro(error) });
    void carregar();
  };

  return (
    <TelaUniversal
      acoes={
        <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setEdicao({ email: "", niveis: ["moderacao"], novo: true })}>
          <UserPlus className="h-4 w-4" />
          Adicionar pessoa
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      <p className="text-[13px] text-suave">
        A equipe RoVibes cuida da plataforma. Ela não opera os estabelecimentos: o nível Suporte só entra num estabelecimento quando o proprietário libera o modo suporte.
      </p>

      {edicao && (
        <Secao
          titulo={edicao.novo ? "Adicionar à equipe RoVibes" : `Níveis de ${edicao.email}`}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setEdicao(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvar} className="space-y-4">
            {edicao.novo && (
              <Campo rotulo="E-mail da conta RoVibes">
                <input required type="email" autoFocus className="entrada" value={edicao.email} onChange={(e) => setEdicao({ ...edicao, email: e.target.value })} />
              </Campo>
            )}
            <ul className="grid gap-2 sm:grid-cols-2">
              {NIVEIS_ROVIBES.map((n) => {
                const marcado = edicao.niveis.includes(n.id);
                return (
                  <li key={n.id}>
                    <label className={clsx("flex items-start gap-2.5 rounded-lg border p-3 text-sm", marcado ? "border-marca bg-destaque-suave" : "border-borda")}>
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-[rgb(var(--marca))]"
                        checked={marcado}
                        onChange={() => setEdicao({ ...edicao, niveis: marcado ? edicao.niveis.filter((x) => x !== n.id) : [...edicao.niveis, n.id] })}
                      />
                      <span>
                        <span className="block font-medium">{n.nome}</span>
                        <span className="block text-[12px] text-suave">{n.explica}</span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            <button type="submit" className="botao-principal" disabled={ocupado || edicao.niveis.length === 0}>
              Salvar
            </button>
          </form>
        </Secao>
      )}

      <section className="cartao overflow-hidden">
        <ul className="divide-y divide-borda">
          {lista.map((p) => (
            <li key={p.usuario_id} className="flex items-center gap-3 px-4 py-3">
              <Avatar nome={p.nome || "?"} foto={p.foto_url} />
              <button className="min-w-0 flex-1 text-left" onClick={() => setEdicao({ email: p.email, niveis: p.niveis, novo: false })}>
                <span className="block truncate font-medium">
                  {p.nome || p.email}
                  {p.usuario_id === sessao?.user.id && <span className="ml-1.5 text-[12px] font-normal text-suave">(você)</span>}
                </span>
                <span className="mt-1 flex flex-wrap gap-1">
                  {p.niveis.map((n) => (
                    <span key={n} className="rounded-full bg-elevado px-2 py-0.5 text-[11px] font-semibold">
                      {NIVEIS_ROVIBES.find((x) => x.id === n)?.nome ?? n}
                    </span>
                  ))}
                </span>
              </button>
              {p.usuario_id !== sessao?.user.id && (
                <button className="rounded-full p-2 text-suave hover:bg-elevado hover:text-perigo" onClick={() => void remover(p)} aria-label={`Tirar ${p.nome} da equipe`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
    </TelaUniversal>
  );
}
