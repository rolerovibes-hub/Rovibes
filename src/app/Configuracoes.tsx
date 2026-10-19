import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ChevronRight, Lock, LogOut, Shield, Sparkles, UserX, X } from "lucide-react";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { desbloquearPessoa } from "@/lib/pessoas";

interface Bloqueado {
  id: string;
  nome: string;
  usuario: string;
}

/** Configurações (três pontinhos do perfil): tema, privacidade, bloqueados, política de privacidade e sair. */
export function Configuracoes({ fechar }: { fechar: () => void }) {
  const { sessao, perfil, email, recarregar, sair } = useSessao();
  const navegar = useNavigate();
  const [privado, setPrivado] = useState(!!perfil?.privado);
  const [bloqueados, setBloqueados] = useState<Bloqueado[] | null>(null);
  const [verBloqueados, setVerBloqueados] = useState(false);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  const carregarBloqueados = () => supabase.rpc("meus_bloqueados").then(({ data }) => setBloqueados((data ?? []) as Bloqueado[]));
  useEffect(() => {
    void carregarBloqueados();
  }, []);

  const mudarPrivado = async (v: boolean) => {
    if (!sessao) return;
    setPrivado(v);
    setSalvando(true);
    setErro("");
    const { error } = await supabase.from("perfis").update({ privado: v }).eq("id", sessao.user.id);
    setSalvando(false);
    if (error) {
      setPrivado(!v);
      return setErro(mensagemDeErro(error));
    }
    await recarregar();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Configurações" onClick={fechar}>
      <div className="folha max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-2 pt-4">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <section className="px-5 pb-4">
          <h3 className="rotulo mb-2">Tema</h3>
          <SeletorTema />
        </section>

        <section className="border-t border-borda">
          <Link to="/primeira-vibe?editar=1" onClick={fechar} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
            <Sparkles className="h-4 w-4 text-destaque" />
            <span className="flex-1">
              <span className="block">Meus gostos</span>
              <span className="block text-[13px] text-suave">Músicas, ambientes, bebidas... o feed usa para recomendar</span>
            </span>
            <ChevronRight className="h-4 w-4 text-suave" />
          </Link>
        </section>

        <section className="border-t border-borda">
          <h3 className="rotulo px-5 pb-1 pt-4">Privacidade</h3>
          <label className="flex cursor-pointer items-start gap-3 px-5 py-3">
            <span className="flex-1">
              <span className="flex items-center gap-1.5 font-medium">
                <Lock className="h-4 w-4 text-destaque" />
                Perfil privado
              </span>
              <span className="block text-[13px] text-suave">
                {privado ? "Só quem você aprovar vê suas publicações e stories." : "Qualquer pessoa vê suas publicações; seus stories ficam para quem segue você."}
              </span>
            </span>
            <input type="checkbox" role="switch" checked={privado} disabled={salvando} onChange={(e) => void mudarPrivado(e.target.checked)} className="mt-1 h-5 w-5 accent-[rgb(var(--marca))]" />
          </label>
          <button className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado" onClick={() => setVerBloqueados(!verBloqueados)} aria-expanded={verBloqueados}>
            <UserX className="h-4 w-4 text-destaque" />
            <span className="flex-1">Contas bloqueadas</span>
            <span className="text-sm text-suave">{bloqueados?.length ?? ""}</span>
            <ChevronRight className="h-4 w-4 text-suave" />
          </button>
          {verBloqueados && (
            <ul className="divide-y divide-borda border-y border-borda bg-fundo">
              {(bloqueados ?? []).map((b) => (
                <li key={b.id} className="flex items-center gap-3 px-5 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.usuario}</span>
                    <span className="block truncate text-[12px] text-suave">{b.nome}</span>
                  </span>
                  <button
                    className="botao h-8 px-3 text-[13px]"
                    onClick={() =>
                      void desbloquearPessoa(b.id)
                        .then(carregarBloqueados)
                        .catch((e) => setErro(mensagemDeErro(e)))
                    }
                  >
                    Desbloquear
                  </button>
                </li>
              ))}
              {bloqueados?.length === 0 && <li className="px-5 py-3 text-sm text-suave">Você não bloqueou ninguém.</li>}
            </ul>
          )}
          <Link to="/privacidade" onClick={fechar} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
            <Shield className="h-4 w-4 text-destaque" />
            <span className="flex-1">Política de privacidade</span>
            <ChevronRight className="h-4 w-4 text-suave" />
          </Link>
        </section>

        {erro && <p className="px-5 py-2 text-sm text-perigo">{erro}</p>}

        <section className="border-t border-borda pt-2">
          <p className="px-5 py-2 text-[13px] text-suave">Conectado como {email}</p>
          <button
            className="flex w-full items-center gap-3 px-5 py-3.5 text-left text-perigo hover:bg-elevado"
            onClick={async () => {
              await sair();
              navegar("/entrar");
            }}
          >
            <LogOut className="h-4 w-4" />
            Sair da conta
          </button>
        </section>
      </div>
    </div>
  );
}
