import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Bell, Volume2, CalendarHeart, CalendarPlus, ChevronRight, Lock, LogOut, Shield, Sparkles, UserX, X } from "lucide-react";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { desbloquearPessoa } from "@/lib/pessoas";
import { ativarPush, CATEGORIAS_PUSH, desativarPush, estadoPush, EstadoPush } from "@/lib/push";
import { ligarSomBrinde, somBrindeLigado } from "@/components/Brindar";

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

        <SecaoNotificacoes />

        <section className="border-t border-borda">
          <h3 className="rotulo px-5 pb-1 pt-4">Sons</h3>
          <SomBrinde />
        </section>

        <section className="border-t border-borda">
          <h3 className="rotulo px-5 pb-1 pt-4">Eventos</h3>
          <Link to="/eventos/novo" onClick={fechar} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
            <CalendarPlus className="h-4 w-4 text-destaque" />
            <span className="flex-1">
              <span className="block">Criar um evento</span>
              <span className="block text-[13px] text-suave">Churrasco, aniversário, comemoração... com ingressos para os amigos</span>
            </span>
            <ChevronRight className="h-4 w-4 text-suave" />
          </Link>
          <Link to="/eventos/meus" onClick={fechar} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
            <CalendarHeart className="h-4 w-4 text-destaque" />
            <span className="flex-1">Meus eventos</span>
            <ChevronRight className="h-4 w-4 text-suave" />
          </Link>
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

const TEXTO_ESTADO: Record<EstadoPush, string> = {
  ativo: "Ligadas neste aparelho.",
  pendente: "Desligadas neste aparelho.",
  negado: "Bloqueadas nas configurações do celular. Libere as notificações do RoVibes por lá.",
  instalar: "No iPhone, adicione o RoVibes à Tela de Início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ligar.",
  app_antigo: "Neste app Android as notificações ainda não estão ligadas. Elas chegam numa atualização do app.",
  indisponivel: "Este navegador não recebe notificações.",
};

/** Liga ou desliga as notificações deste aparelho e escolhe o que quer receber. */
function SecaoNotificacoes() {
  const { perfil, recarregar } = useSessao();
  const [estado, setEstado] = useState<EstadoPush | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState("");
  const [prefs, setPrefs] = useState<Record<string, boolean>>(perfil?.notificacoes ?? {});

  useEffect(() => {
    estadoPush()
      .then(setEstado)
      .catch(() => setEstado("indisponivel"));
  }, []);

  const alternar = async () => {
    setOcupado(true);
    setErro("");
    try {
      if (estado === "ativo") {
        await desativarPush();
        setEstado("pendente");
      } else setEstado(await ativarPush());
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupado(false);
    }
  };

  const mudar = async (id: string, v: boolean) => {
    const novo = { ...prefs, [id]: v };
    setPrefs(novo);
    const { error } = await supabase.rpc("salvar_preferencias_notificacao", { p: novo });
    if (error) {
      setPrefs(prefs);
      return setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 040 do banco." : mensagemDeErro(error));
    }
    void recarregar();
  };

  return (
    <section className="border-t border-borda">
      <h3 className="rotulo px-5 pb-1 pt-4">Notificações</h3>
      <div className="flex items-start gap-3 px-5 py-3">
        <Bell className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
        <span className="min-w-0 flex-1">
          <span className="block font-medium">Notificações no celular</span>
          <span className="block text-[13px] text-suave">{estado ? TEXTO_ESTADO[estado] : "Verificando..."}</span>
          {erro && <span className="block text-[13px] text-perigo">{erro}</span>}
        </span>
        {(estado === "ativo" || estado === "pendente") && (
          <button className={estado === "ativo" ? "botao h-9 px-3" : "botao-principal h-9 px-3"} disabled={ocupado} onClick={() => void alternar()}>
            {ocupado ? "..." : estado === "ativo" ? "Desligar" : "Ligar"}
          </button>
        )}
      </div>
      <ul className="pb-2">
        {CATEGORIAS_PUSH.map((c) => (
          <li key={c.id}>
            <label className="flex cursor-pointer items-center gap-3 px-5 py-2">
              <span className="min-w-0 flex-1 pl-7">
                <span className="block text-sm">{c.nome}</span>
                <span className="block text-[12px] text-suave">{c.explica}</span>
              </span>
              <input
                type="checkbox"
                role="switch"
                checked={prefs[c.id] !== false}
                onChange={(e) => void mudar(c.id, e.target.checked)}
                className="h-5 w-5 accent-[rgb(var(--marca))]"
              />
            </label>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Liga ou desliga o "tim-tim" ao brindar (fica salvo neste aparelho). */
function SomBrinde() {
  const [ligado, setLigado] = useState(somBrindeLigado);
  return (
    <label className="flex cursor-pointer items-start gap-3 px-5 py-3">
      <Volume2 className="mt-0.5 h-4 w-4 shrink-0 text-destaque" />
      <span className="flex-1">
        <span className="block font-medium">Som ao brindar</span>
        <span className="block text-[13px] text-suave">O “tim-tim” das taças quando você brinda uma publicação.</span>
      </span>
      <input
        type="checkbox"
        role="switch"
        checked={ligado}
        onChange={(e) => {
          setLigado(e.target.checked);
          ligarSomBrinde(e.target.checked);
        }}
        className="mt-1 h-5 w-5 accent-[rgb(var(--marca))]"
      />
    </label>
  );
}
