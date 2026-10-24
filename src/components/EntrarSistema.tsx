import { FormEvent, ReactNode, useEffect, useState } from "react";
import clsx from "clsx";
import { ArrowLeft, Check, Eye, EyeOff, Store } from "lucide-react";
import { Simbolo } from "./Marca";
import { AcessoGestao } from "./AcessoGestao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { confirmarContaPessoal, contasSistema, EstabResponsavel, entrarNoSistema, normalizarCodigo, ultimoCodigo } from "@/lib/sistema";

type Modo = "entrar" | "cadastro" | "primeiro" | "esqueci" | "equipe";

const campo = "h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-[15px] placeholder:text-suave focus:border-marca focus:outline-none";
const paraCodigo = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 20);
const paraLogin = (s: string) => s.toLowerCase().replace(/[^a-z0-9._]/g, "").slice(0, 30);

/** Entrada do RoVibes Business e do Job: estabelecimento + usuário + senha (separado do perfil pessoal do app). */
export function EntrarSistema({ produto }: { produto: "Business" | "Job" }) {
  const [modo, setModo] = useState<Modo>("entrar");
  const voltar = () => setModo("entrar");
  useEffect(() => {
    document.title = `Entrar · RoVibes ${produto}`;
  }, [produto]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-fundo px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <Simbolo className="h-9" />
          <span className="text-[17px] font-semibold">
            RoVibes <span className="font-normal text-suave">{produto}</span>
          </span>
        </div>
        <div className="cartao p-6">
          {modo === "entrar" && <Entrar mudar={setModo} />}
          {modo === "equipe" && <EntrarEquipeRoVibes voltar={voltar} />}
          {(modo === "cadastro" || modo === "primeiro" || modo === "esqueci") && <ComResponsavel modo={modo} voltar={voltar} />}
        </div>
      </div>
    </div>
  );
}

function Senha({ valor, mudar, nova = false, autoFocus }: { valor: string; mudar: (v: string) => void; nova?: boolean; autoFocus?: boolean }) {
  const [ver, setVer] = useState(false);
  return (
    <span className="relative block">
      <input
        required
        type={ver ? "text" : "password"}
        minLength={nova ? 8 : undefined}
        autoComplete={nova ? "new-password" : "current-password"}
        autoFocus={autoFocus}
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

function Erro({ texto }: { texto: string }) {
  return texto ? (
    <p role="alert" className="text-sm text-perigo">
      {texto}
    </p>
  ) : null;
}

function Cabecalho({ titulo, voltar }: { titulo: string; voltar?: () => void }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      {voltar && (
        <button type="button" onClick={voltar} className="-ml-2 rounded-full p-1.5 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
      )}
      <h1 className="text-xl font-semibold">{titulo}</h1>
    </div>
  );
}

function Entrar({ mudar }: { mudar: (m: Modo) => void }) {
  const [codigo, setCodigo] = useState(ultimoCodigo);
  const [login, setLogin] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    try {
      await entrarNoSistema(codigo, login, senha);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setOcupado(false);
    }
  };

  return (
    <>
      <Cabecalho titulo="Entrar" />
      <form onSubmit={enviar} className="space-y-3.5">
        <Rotulo nome="Estabelecimento">
          <input required autoCapitalize="none" autoCorrect="off" spellCheck={false} className={campo} placeholder="código" value={codigo} onChange={(e) => setCodigo(e.target.value)} onBlur={() => setCodigo(normalizarCodigo(codigo))} />
        </Rotulo>
        <Rotulo nome="Usuário">
          <input required autoFocus={!!codigo} autoCapitalize="none" autoCorrect="off" spellCheck={false} autoComplete="username" className={campo} value={login} onChange={(e) => setLogin(paraLogin(e.target.value))} />
        </Rotulo>
        <Rotulo nome="Senha">
          <Senha valor={senha} mudar={setSenha} />
        </Rotulo>
        <Erro texto={erro} />
        <button type="submit" disabled={ocupado} className="botao-principal h-11 w-full">
          {ocupado ? "Entrando..." : "Entrar"}
        </button>
      </form>
      <div className="mt-5 space-y-2 text-center text-[13px]">
        <button className="block w-full font-semibold text-destaque" onClick={() => mudar("cadastro")}>
          Cadastrar meu estabelecimento
        </button>
        <div className="flex justify-center gap-4 text-suave">
          <button className="hover:text-texto" onClick={() => mudar("primeiro")}>
            Primeiro acesso do proprietário
          </button>
          <button className="hover:text-texto" onClick={() => mudar("esqueci")}>
            Esqueci a senha
          </button>
        </div>
        <button className="block w-full pt-2 text-[12px] text-suave hover:text-texto" onClick={() => mudar("equipe")}>
          Equipe RoVibes
        </button>
      </div>
    </>
  );
}

/** Equipe RoVibes (modo suporte): entra com o acesso da Gestão (usuário, senha e código). */
function EntrarEquipeRoVibes({ voltar }: { voltar: () => void }) {
  return (
    <>
      <button type="button" onClick={voltar} className="-ml-2 mb-2 rounded-full p-1.5 hover:bg-elevado" aria-label="Voltar">
        <ArrowLeft className="h-5 w-5" />
      </button>
      <AcessoGestao />
    </>
  );
}

interface Categoria {
  id: number;
  nome: string;
}

/** Cadastro, primeiro acesso e esqueci a senha: confirma a conta pessoal do responsável e cria/recupera o usuário do proprietário. */
function ComResponsavel({ modo, voltar }: { modo: "cadastro" | "primeiro" | "esqueci"; voltar: () => void }) {
  const titulo = modo === "cadastro" ? "Cadastrar estabelecimento" : modo === "primeiro" ? "Primeiro acesso" : "Nova senha do proprietário";
  const [conta, setConta] = useState<{ token: string; encerrar: () => void; categorias: Categoria[] } | null>(null);
  const [estabs, setEstabs] = useState<EstabResponsavel[] | null>(null);
  const [email, setEmail] = useState("");
  const [senhaPessoal, setSenhaPessoal] = useState("");
  const [escolhido, setEscolhido] = useState("");
  const [dados, setDados] = useState({ nome: "", categoria: "", bairro: "", endereco: "", telefone: "", codigo: "", codigoMexido: false, responsavel: "", login: "", senha: "" });
  const [erro, setErro] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [pronto, setPronto] = useState<{ codigo: string; login: string } | null>(null);
  const mudar = (p: Partial<typeof dados>) => setDados((d) => ({ ...d, ...p }));

  useEffect(() => () => conta?.encerrar(), [conta]);

  const confirmar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setOcupado(true);
    try {
      const c = await confirmarContaPessoal(email, senhaPessoal);
      const { data: cats } = await c.cliente.from("categorias").select("id, nome").eq("ativa", true).order("nome");
      const { data: perfil } = await c.cliente.from("perfis").select("nome").eq("id", c.id).maybeSingle();
      if (perfil?.nome) mudar({ responsavel: String(perfil.nome) });
      if (modo !== "cadastro") {
        const r = await contasSistema<{ estabelecimentos: EstabResponsavel[] }>("meus_estabelecimentos", { token: c.token });
        const lista = r.estabelecimentos.filter((x) => (modo === "primeiro" ? !x.login_proprietario : !!x.login_proprietario));
        setEstabs(lista);
        if (lista.length === 1) setEscolhido(lista[0].id);
      }
      setConta({ token: c.token, encerrar: c.encerrar, categorias: (cats ?? []) as Categoria[] });
    } catch (err) {
      setErro(/Invalid login/i.test(err instanceof Error ? err.message : "") ? "E-mail ou senha incorretos." : mensagemDeErro(err));
    } finally {
      setOcupado(false);
    }
  };

  const concluir = async (e: FormEvent) => {
    e.preventDefault();
    if (!conta) return;
    setErro("");
    setOcupado(true);
    try {
      let r: { codigo: string; login: string };
      if (modo === "cadastro") {
        r = await contasSistema("cadastrar", {
          token: conta.token,
          estab: { nome: dados.nome, categoria_id: dados.categoria || null, bairro: dados.bairro, endereco: dados.endereco, telefone: dados.telefone },
          codigo: dados.codigo,
          nome: dados.responsavel,
          login: dados.login,
          senha: dados.senha,
        });
      } else if (modo === "primeiro") {
        r = await contasSistema("reivindicar", { token: conta.token, estab_id: escolhido, nome: dados.responsavel, login: dados.login, senha: dados.senha });
      } else {
        r = await contasSistema("recuperar", { token: conta.token, estab_id: escolhido, senha: dados.senha });
      }
      conta.encerrar();
      setPronto(r);
      await entrarNoSistema(r.codigo, r.login, dados.senha);
    } catch (err) {
      setErro(mensagemDeErro(err));
      setOcupado(false);
    }
  };

  if (pronto) {
    return (
      <div className="py-4 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-ok/15 text-ok">
          <Check className="h-6 w-6" />
        </span>
        <p className="mt-3 font-semibold">Pronto</p>
        <p className="mt-2 text-sm">
          Estabelecimento <strong className="codigo">{pronto.codigo}</strong>
          <br />
          Usuário <strong className="codigo">{pronto.login}</strong>
        </p>
      </div>
    );
  }

  if (!conta) {
    return (
      <>
        <Cabecalho titulo={titulo} voltar={voltar} />
        <p className="mb-4 text-sm text-suave">Confirme com a sua conta pessoal do RoVibes.</p>
        <form onSubmit={confirmar} className="space-y-3.5">
          <Rotulo nome="E-mail">
            <input required type="email" autoComplete="email" autoFocus className={campo} value={email} onChange={(e) => setEmail(e.target.value)} />
          </Rotulo>
          <Rotulo nome="Senha">
            <Senha valor={senhaPessoal} mudar={setSenhaPessoal} />
          </Rotulo>
          <Erro texto={erro} />
          <button type="submit" disabled={ocupado} className="botao-principal h-11 w-full">
            {ocupado ? "Confirmando..." : "Continuar"}
          </button>
        </form>
      </>
    );
  }

  if (modo !== "cadastro" && estabs && estabs.length === 0) {
    return (
      <>
        <Cabecalho titulo={titulo} voltar={voltar} />
        <p className="text-sm text-suave">
          {modo === "primeiro" ? "Nenhum estabelecimento aguardando o usuário do proprietário nesta conta." : "Nenhum estabelecimento com usuário de proprietário nesta conta."}
        </p>
      </>
    );
  }

  return (
    <>
      <Cabecalho titulo={titulo} voltar={voltar} />
      <form onSubmit={concluir} className="space-y-3.5">
        {modo !== "cadastro" && estabs && estabs.length > 1 && (
          <div className="space-y-1.5" role="radiogroup" aria-label="Estabelecimento">
            {estabs.map((e) => (
              <button
                key={e.id}
                type="button"
                role="radio"
                aria-checked={escolhido === e.id}
                onClick={() => setEscolhido(e.id)}
                className={clsx("flex w-full items-center gap-2.5 rounded-lg border px-3 py-2.5 text-left text-sm", escolhido === e.id ? "border-marca bg-destaque-suave" : "border-borda")}
              >
                <Store className="h-4 w-4 shrink-0 text-suave" />
                <span className="min-w-0 flex-1 truncate font-medium">{e.nome}</span>
                <span className="codigo text-[12px] text-suave">{e.codigo}</span>
              </button>
            ))}
          </div>
        )}
        {modo !== "cadastro" && estabs?.length === 1 && (
          <p className="flex items-center gap-2 rounded-lg bg-elevado px-3 py-2.5 text-sm">
            <Store className="h-4 w-4 text-suave" />
            <span className="flex-1 font-medium">{estabs[0].nome}</span>
            <span className="codigo text-[12px] text-suave">{estabs[0].codigo}</span>
          </p>
        )}

        {modo === "cadastro" && (
          <>
            <Rotulo nome="Nome do estabelecimento">
              <input
                required
                minLength={2}
                autoFocus
                className={campo}
                value={dados.nome}
                onChange={(e) => mudar({ nome: e.target.value, ...(dados.codigoMexido ? {} : { codigo: paraCodigo(e.target.value) }) })}
              />
            </Rotulo>
            <Rotulo nome="Código do estabelecimento">
              <input
                required
                minLength={3}
                maxLength={30}
                pattern="[a-z0-9\-]{3,30}"
                autoCapitalize="none"
                className={clsx(campo, "codigo")}
                value={dados.codigo}
                onChange={(e) => mudar({ codigo: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""), codigoMexido: true })}
              />
            </Rotulo>
            <Rotulo nome="Categoria">
              <select required className={campo} value={dados.categoria} onChange={(e) => mudar({ categoria: e.target.value })}>
                <option value="">Escolha</option>
                {conta.categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </Rotulo>
            <div className="grid grid-cols-2 gap-3">
              <Rotulo nome="Bairro">
                <input className={campo} value={dados.bairro} onChange={(e) => mudar({ bairro: e.target.value })} />
              </Rotulo>
              <Rotulo nome="Telefone">
                <input type="tel" className={campo} value={dados.telefone} onChange={(e) => mudar({ telefone: e.target.value })} />
              </Rotulo>
            </div>
            <Rotulo nome="Endereço">
              <input className={campo} placeholder="Rua, número" value={dados.endereco} onChange={(e) => mudar({ endereco: e.target.value })} />
            </Rotulo>
            <hr className="border-borda" />
          </>
        )}

        {modo !== "esqueci" && (
          <>
            <Rotulo nome="Nome do proprietário">
              <input required minLength={2} className={campo} value={dados.responsavel} onChange={(e) => mudar({ responsavel: e.target.value })} />
            </Rotulo>
            <Rotulo nome="Usuário do proprietário">
              <input required minLength={3} autoCapitalize="none" autoComplete="username" className={clsx(campo, "codigo")} placeholder="ex.: bia.dono" value={dados.login} onChange={(e) => mudar({ login: paraLogin(e.target.value) })} />
            </Rotulo>
          </>
        )}
        <Rotulo nome={modo === "esqueci" ? "Nova senha" : "Senha"}>
          <Senha nova valor={dados.senha} mudar={(v) => mudar({ senha: v })} autoFocus={modo === "esqueci"} />
        </Rotulo>
        <Erro texto={erro} />
        <button type="submit" disabled={ocupado || (modo !== "cadastro" && !escolhido)} className="botao-principal h-11 w-full">
          {ocupado ? "Salvando..." : modo === "cadastro" ? "Cadastrar" : modo === "primeiro" ? "Criar usuário" : "Salvar senha"}
        </button>
      </form>
    </>
  );
}
