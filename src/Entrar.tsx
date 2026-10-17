import { FormEvent, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { Marca } from "@/components/Marca";
import { bancoConfigurado, mensagemDeErro, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";

function maiorDeIdade(data: string) {
  if (!data) return false;
  const nasc = new Date(`${data}T00:00:00`);
  const limite = new Date();
  limite.setFullYear(limite.getFullYear() - 18);
  return nasc <= limite;
}

export function Entrar() {
  const [params] = useSearchParams();
  const voltar = params.get("voltar") || "/";
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const [modo, setModo] = useState<"entrar" | "criar">(params.get("modo") === "criar" ? "criar" : "entrar");
  const [nome, setNome] = useState("");
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [nascimento, setNascimento] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");
  const [aviso, setAviso] = useState("");

  useEffect(() => {
    if (sessao) navegar(voltar, { replace: true });
  }, [sessao, voltar, navegar]);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setAviso("");
    if (modo === "criar" && !maiorDeIdade(nascimento)) {
      setErro("O RoVibes é para maiores de 18 anos.");
      return;
    }
    setEnviando(true);
    try {
      if (modo === "entrar") {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
      } else {
        const { data, error } = await supabase.auth.signUp({
          email,
          password: senha,
          options: {
            data: { nome: nome.trim(), data_nascimento: nascimento },
            emailRedirectTo: `${window.location.origin}${voltar}`,
          },
        });
        if (error) throw error;
        if (!data.session) {
          setAviso(`Enviamos um link de confirmação para ${email}. Abra o e-mail e toque no link para ativar a conta.`);
          setModo("entrar");
        }
      }
    } catch (err) {
      setErro(mensagemDeErro(err));
    } finally {
      setEnviando(false);
    }
  };

  const campo =
    "h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-[15px] placeholder:text-suave focus:border-marca focus:outline-none";

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Link to="/" aria-label="RoVibes, início">
            <Marca />
          </Link>
        </div>

        <div className="cartao p-6">
          <div role="tablist" className="mb-6 grid grid-cols-2 rounded-lg bg-elevado p-1">
            {(["entrar", "criar"] as const).map((m) => (
              <button
                key={m}
                role="tab"
                aria-selected={modo === m}
                onClick={() => {
                  setModo(m);
                  setErro("");
                }}
                className={clsx(
                  "rounded-md py-2 text-sm transition-colors",
                  modo === m ? "bg-superficie font-semibold shadow-sm" : "text-suave hover:text-texto",
                )}
              >
                {m === "entrar" ? "Entrar" : "Criar conta"}
              </button>
            ))}
          </div>

          {!bancoConfigurado && (
            <p className="mb-4 rounded-lg border border-alerta/40 bg-alerta/10 px-3 py-2 text-sm text-alerta">
              O banco de dados ainda não está ligado a este site.
            </p>
          )}

          <form onSubmit={enviar} className="space-y-4">
            {modo === "criar" && (
              <label className="block">
                <span className="rotulo mb-1 block">Nome</span>
                <input required value={nome} onChange={(e) => setNome(e.target.value)} autoComplete="name" className={campo} />
              </label>
            )}
            <label className="block">
              <span className="rotulo mb-1 block">E-mail</span>
              <input
                required
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                className={campo}
              />
            </label>
            {modo === "criar" && (
              <label className="block">
                <span className="rotulo mb-1 block">Data de nascimento</span>
                <input
                  required
                  type="date"
                  value={nascimento}
                  onChange={(e) => setNascimento(e.target.value)}
                  className={campo}
                />
              </label>
            )}
            <label className="block">
              <span className="rotulo mb-1 block">Senha</span>
              <input
                required
                type="password"
                minLength={6}
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                className={campo}
              />
            </label>

            {erro && (
              <p role="alert" className="text-sm text-perigo">
                {erro}
              </p>
            )}
            {aviso && (
              <p role="status" className="text-sm text-ok">
                {aviso}
              </p>
            )}

            <button type="submit" disabled={enviando || !bancoConfigurado} className="botao-principal h-11 w-full">
              {enviando ? "Aguarde…" : modo === "entrar" ? "Entrar" : "Criar conta"}
            </button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-suave">Ao criar a conta, você confirma ter 18 anos ou mais.</p>
      </div>
    </div>
  );
}
