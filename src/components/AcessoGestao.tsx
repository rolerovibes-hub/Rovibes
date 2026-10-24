import { FormEvent, ReactNode, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { confirmarContaPessoal } from "@/lib/sistema";
import { contasGestao, emailGestao, etapaDoCodigo } from "@/lib/gestao";

const campo = "h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-[15px] placeholder:text-suave focus:border-marca focus:outline-none";
const paraLogin = (s: string) => s.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);

function Senha({ valor, mudar, nova = false }: { valor: string; mudar: (v: string) => void; nova?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="relative block">
      <input
        required
        type={ver ? "text" : "password"}
        minLength={nova ? 10 : undefined}
        autoComplete={nova ? "new-password" : "current-password"}
        className={clsx(campo, "pr-11")}
        value={valor}
        onChange={(e) => mudar(e.target.value)}
      />
      <button type="button" onClick={() => setVer((v) => !v)} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-suave" aria-label={ver ? "Esconder senha" : "Mostrar senha"}>
        {ver ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </span>
  );
}

function Rotulo({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="rotulo mb-1 block">{nome}</span>
      {children}
    </label>
  );
}

const Erro = ({ texto }: { texto: string }) =>
  texto ? (
    <p role="alert" className="text-sm text-perigo">
      {texto}
    </p>
  ) : null;

/**
 * Entrada da Gestão RoVibes: usuário + senha e depois o código do app autenticador.
 * `soCodigo`: já entrou com usuário e senha, falta o código.
 */
export function AcessoGestao({ soCodigo = false, aoConfirmar }: { soCodigo?: boolean; aoConfirmar?: () => void }) {
  const [etapa, setEtapa] = useState<"entrar" | "codigo" | "ceo">(soCodigo ? "codigo" : "entrar");
  const [temCeo, setTemCeo] = useState(true);

  useEffect(() => {
    if (soCodigo) return;
    supabase.rpc("gestao_tem_ceo").then(({ data, error }) => setTemCeo(error ? true : data !== false));
  }, [soCodigo]);

  if (etapa === "codigo") return <Codigo aoConfirmar={aoConfirmar} />;
  if (etapa === "ceo") return <ConfigurarCeo voltar={() => setEtapa("entrar")} pronto={() => setEtapa("codigo")} />;
  return <Entrar pronto={() => setEtapa("codigo")} configurarCeo={temCeo ? undefined : () => setEtapa("ceo")} />;
}

function Entrar({ pronto, configurarCeo }: { pronto: () => void; configurarCeo?: () => void }) {
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    const { error } = await supabase.auth.signInWithPassword({ email: emailGestao(login), password: senha });
    setOcupado(false);
    if (error) return setErro(/Invalid login/i.test(error.message) ? "Usuário ou senha incorretos." : mensagemDeErro(error));
    pronto();
  };
  return (
    <>
      <h1 className="mb-4 text-xl font-semibold">Gestão RoVibes</h1>
      <form onSubmit={enviar} className="space-y-3.5">
        <Rotulo nome="Usuário">
          <input required autoFocus autoCapitalize="none" autoComplete="username" className={clsx(campo, "codigo")} value={login} onChange={(e) => setLogin(paraLogin(e.target.value))} />
        </Rotulo>
        <Rotulo nome="Senha">
          <Senha valor={senha} mudar={setSenha} />
        </Rotulo>
        <Erro texto={erro} />
        <button type="submit" disabled={ocupado} className="botao-principal h-11 w-full">
          {ocupado ? "Entrando..." : "Continuar"}
        </button>
      </form>
      {configurarCeo && (
        <button className="mt-5 block w-full text-center text-[13px] font-semibold text-destaque" onClick={configurarCeo}>
          Configurar CEO
        </button>
      )}
    </>
  );
}

/** Código do autenticador: cadastra no primeiro acesso (QR code) e confirma nos seguintes. */
function Codigo({ aoConfirmar }: { aoConfirmar?: () => void }) {
  const [fase, setFase] = useState<"carregando" | "cadastrar" | "digitar">("carregando");
  const [fator, setFator] = useState<{ id: string; qr?: string; segredo?: string } | null>(null);
  const [codigo, setCodigo] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const confirmado = useRef(aoConfirmar);
  confirmado.current = aoConfirmar;

  useEffect(() => {
    let vivo = true;
    (async () => {
      const etapa = await etapaDoCodigo();
      if (!vivo) return;
      if (etapa === "ok") return confirmado.current?.();
      if (etapa === "digitar") {
        const { data } = await supabase.auth.mfa.listFactors();
        const f = data?.totp?.find((x) => x.status === "verified");
        if (f) {
          setFator({ id: f.id });
          return setFase("digitar");
        }
      }
      // Cadastro: limpa tentativas antigas não confirmadas e gera o QR code.
      const { data: lista } = await supabase.auth.mfa.listFactors();
      for (const f of lista?.all ?? []) if (f.status !== "verified") await supabase.auth.mfa.unenroll({ factorId: f.id });
      const { data, error } = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `RoVibes Gestão ${new Date().toISOString().slice(0, 10)}` });
      if (!vivo) return;
      if (error || !data) return setErro(mensagemDeErro(error ?? new Error("Não foi possível gerar o código.")));
      setFator({ id: data.id, qr: data.totp.qr_code, segredo: data.totp.secret });
      setFase("cadastrar");
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    if (!fator) return;
    setErro("");
    setOcupado(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: fator.id, code: codigo.replace(/\D/g, "") });
    setOcupado(false);
    if (error) return setErro(/invalid|expired/i.test(error.message) ? "Código incorreto ou vencido. Tente o código atual." : mensagemDeErro(error));
    aoConfirmar?.();
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck className="h-5 w-5 text-destaque" />
        <h1 className="text-xl font-semibold">Código de acesso</h1>
      </div>
      {fase === "carregando" && !erro && <p className="text-sm text-suave">Carregando...</p>}
      {fase === "cadastrar" && fator?.qr && (
        <div className="mb-4 space-y-2 text-center">
          <p className="text-sm text-suave">Leia no app autenticador (Google Authenticator, Microsoft Authenticator...).</p>
          <img src={fator.qr} alt="QR code do autenticador" className="mx-auto h-44 w-44 rounded-lg bg-white p-2" />
          {fator.segredo && <p className="codigo select-all break-all text-[12px] text-suave">{fator.segredo}</p>}
        </div>
      )}
      {fase !== "carregando" && (
        <form onSubmit={confirmar} className="space-y-3.5">
          <input
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            className={clsx(campo, "codigo text-center text-2xl tracking-[0.5em]")}
            placeholder="000000"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6))}
            aria-label="Código de 6 dígitos"
          />
          <Erro texto={erro} />
          <button type="submit" disabled={ocupado || codigo.length < 6} className="botao-principal h-11 w-full">
            {ocupado ? "Confirmando..." : "Entrar"}
          </button>
        </form>
      )}
      {fase === "carregando" && <Erro texto={erro} />}
      <button className="mt-4 block w-full text-center text-[13px] text-suave hover:text-texto" onClick={() => void supabase.auth.signOut()}>
        Sair
      </button>
    </>
  );
}

/** Primeiro CEO: confirma com a conta pessoal que hoje é administradora e cria o acesso da Gestão. */
function ConfigurarCeo({ voltar, pronto }: { voltar: () => void; pronto: () => void }) {
  const [token, setToken] = useState<{ valor: string; encerrar: () => void } | null>(null);
  const [email, setEmail] = useState("");
  const [senhaPessoal, setSenhaPessoal] = useState("");
  const [d, setD] = useState({ nome: "", login: "", senha: "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  useEffect(() => () => token?.encerrar(), [token]);

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    try {
      const c = await confirmarContaPessoal(email, senhaPessoal);
      const { data: p } = await c.cliente.from("perfis").select("nome").eq("id", c.id).maybeSingle();
      if (p?.nome) setD((x) => ({ ...x, nome: String(p.nome) }));
      setToken({ valor: c.token, encerrar: c.encerrar });
    } catch (err) {
      setErro(/Invalid login/i.test(err instanceof Error ? err.message : "") ? "E-mail ou senha incorretos." : mensagemDeErro(err));
    } finally {
      setOcupado(false);
    }
  };

  const criar = async (e: FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setErro("");
    setOcupado(true);
    try {
      await contasGestao("criar_ceo", { token: token.valor, ...d });
      token.encerrar();
      const { error } = await supabase.auth.signInWithPassword({ email: emailGestao(d.login), password: d.senha });
      if (error) throw error;
      pronto();
    } catch (err) {
      setErro(mensagemDeErro(err));
      setOcupado(false);
    }
  };

  return (
    <>
      <div className="mb-4 flex items-center gap-2">
        <button type="button" onClick={voltar} className="-ml-2 rounded-full p-1.5 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-xl font-semibold">Configurar CEO</h1>
      </div>
      {!token ? (
        <form onSubmit={confirmar} className="space-y-3.5">
          <p className="text-sm text-suave">Confirme com a conta de administrador atual.</p>
          <Rotulo nome="E-mail">
            <input required type="email" autoFocus className={campo} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Rotulo>
          <Rotulo nome="Senha">
            <Senha valor={senhaPessoal} mudar={setSenhaPessoal} />
          </Rotulo>
          <Erro texto={erro} />
          <button type="submit" disabled={ocupado} className="botao-principal h-11 w-full">
            Continuar
          </button>
        </form>
      ) : (
        <form onSubmit={criar} className="space-y-3.5">
          <Rotulo nome="Nome">
            <input required minLength={2} className={campo} value={d.nome} onChange={(e) => setD({ ...d, nome: e.target.value })} />
          </Rotulo>
          <Rotulo nome="Usuário do CEO">
            <input required minLength={3} autoCapitalize="none" className={clsx(campo, "codigo")} value={d.login} onChange={(e) => setD({ ...d, login: paraLogin(e.target.value) })} />
          </Rotulo>
          <Rotulo nome="Senha (mín. 10)">
            <Senha nova valor={d.senha} mudar={(v) => setD({ ...d, senha: v })} />
          </Rotulo>
          <Erro texto={erro} />
          <button type="submit" disabled={ocupado} className="botao-principal h-11 w-full">
            {ocupado ? "Criando..." : "Criar CEO"}
          </button>
        </form>
      )}
    </>
  );
}
