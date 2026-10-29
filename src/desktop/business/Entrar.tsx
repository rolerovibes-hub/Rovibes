import { FormEvent, useState } from "react";
import { Simbolo } from "@/components/Marca";
import { entrarNoSistema, ultimoCodigo } from "@/lib/sistema";
import { mensagemDeErro } from "@/lib/supabase";
import { abrirNoNavegador } from "../nativo";

/** Entrada do RoVibes Business no computador: código do estabelecimento, usuário e senha. */
export function EntrarDesktop() {
  const [codigo, setCodigo] = useState(() => ultimoCodigo() ?? "");
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const entrar = async (e: FormEvent) => {
    e.preventDefault();
    setOcupado(true);
    setErro("");
    try {
      await entrarNoSistema(codigo, login, senha);
    } catch (err) {
      setErro(mensagemDeErro(err));
    }
    setOcupado(false);
  };

  return (
    <div className="grid h-screen grid-cols-[minmax(0,1fr)_480px] bg-fundo text-texto">
      <div className="relative hidden overflow-hidden bg-[radial-gradient(circle_at_25%_25%,#7c3aed,#1d1035_55%,#0b0d14)] md:block">
        <div className="absolute bottom-12 left-12 max-w-md text-white">
          <Simbolo className="h-14" />
          <p className="mt-6 text-3xl font-semibold leading-tight">RoVibes Business</p>
          <p className="mt-2 text-white/75">Caixa, cozinha e gestão do seu estabelecimento.</p>
        </div>
      </div>
      <div className="flex items-center justify-center px-10">
        <form onSubmit={(e) => void entrar(e)} className="w-full max-w-sm space-y-4">
          <div>
            <h1 className="text-2xl font-semibold">Entrar</h1>
            <p className="mt-1 text-sm text-suave">Usuário do sistema do estabelecimento</p>
          </div>
          <label className="block">
            <span className="rotulo mb-1 block">Código do estabelecimento</span>
            <input required autoFocus={!codigo} className="entrada h-11" value={codigo} onChange={(e) => setCodigo(e.target.value)} placeholder="ex.: paradiseclub" />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Usuário</span>
            <input required autoFocus={!!codigo} className="entrada h-11" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Senha</span>
            <input required type="password" className="entrada h-11" value={senha} onChange={(e) => setSenha(e.target.value)} autoComplete="current-password" />
          </label>
          {erro && <p className="text-sm text-perigo">{erro}</p>}
          <button className="botao-principal h-11 w-full" disabled={ocupado}>
            {ocupado ? "Entrando..." : "Entrar"}
          </button>
          <button type="button" className="w-full text-center text-[13px] text-suave hover:text-texto" onClick={() => abrirNoNavegador("https://rovibes.vercel.app/business")}>
            Primeiro acesso ou esqueci a senha
          </button>
        </form>
      </div>
    </div>
  );
}
