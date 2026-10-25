import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { Bell, CalendarDays, ChevronRight, Lock, LogOut, Palette, Sparkles, Volume2, X } from "lucide-react";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { desbloquearPessoa } from "@/lib/pessoas";
import { ativarPush, CATEGORIAS_PUSH, desativarPush, estadoPush, EstadoPush } from "@/lib/push";
import { Tema, useTema } from "@/lib/tema";
import { ligarSomBrinde, somBrindeLigado } from "@/components/Brindar";
import { Avatar } from "@/components/Avatar";

interface Bloqueado {
  id: string;
  nome: string;
  usuario: string;
}

type Secao = "aparencia" | "notificacoes" | "sons" | "privacidade" | "eventos";

const TEMAS: { valor: Tema; nome: string }[] = [
  { valor: "escuro", nome: "Escuro" },
  { valor: "claro", nome: "Claro" },
  { valor: "sistema", nome: "Aparelho" },
];

const ESTADO_PUSH: Record<EstadoPush, string> = {
  ativo: "Ligadas",
  pendente: "Desligadas",
  negado: "Bloqueadas no celular",
  instalar: "Adicione à Tela de Início",
  app_antigo: "Em breve neste app",
  indisponivel: "Indisponível",
};

/**
 * Configurações (três pontinhos do perfil): categorias em lista compacta, com o estado atual,
 * e cada uma abre uma gaveta com as opções (uma aberta por vez).
 */
export function Configuracoes({ fechar }: { fechar: () => void }) {
  const { sessao, perfil, email, recarregar, sair } = useSessao();
  const { tema, definir } = useTema();
  const navegar = useNavigate();
  const eu = sessao?.user.id;
  const [aberta, setAberta] = useState<Secao | null>(null);
  const [erro, setErro] = useState("");

  // Notificações
  const [push, setPush] = useState<EstadoPush | null>(null);
  const [ocupadoPush, setOcupadoPush] = useState(false);
  const [prefs, setPrefs] = useState<Record<string, boolean>>(perfil?.notificacoes ?? {});
  // Sons
  const [somBrinde, setSomBrinde] = useState(somBrindeLigado);
  // Privacidade
  const [privado, setPrivado] = useState(!!perfil?.privado);
  const [salvando, setSalvando] = useState(false);
  const [bloqueados, setBloqueados] = useState<Bloqueado[] | null>(null);
  const [verBloqueados, setVerBloqueados] = useState(false);
  // Contadores
  const [gostos, setGostos] = useState<number | null>(null);
  const [eventos, setEventos] = useState<number | null>(null);

  const carregarBloqueados = () => supabase.rpc("meus_bloqueados").then(({ data }) => setBloqueados((data ?? []) as Bloqueado[]));
  useEffect(() => {
    void carregarBloqueados();
    estadoPush()
      .then(setPush)
      .catch(() => setPush("indisponivel"));
    if (!eu) return;
    void supabase
      .from("perfil_gostos")
      .select("gosto_id", { count: "exact", head: true })
      .eq("usuario_id", eu)
      .eq("origem", "escolha")
      .then(({ count }) => setGostos(count ?? null));
    void supabase
      .from("eventos_pessoa")
      .select("id", { count: "exact", head: true })
      .eq("anfitriao_id", eu)
      .gte("inicio", new Date(Date.now() - 12 * 3600 * 1000).toISOString())
      .then(({ count, error }) => setEventos(error ? null : count ?? 0));
  }, [eu]);

  // A página de trás não rola com a folha aberta.
  useEffect(() => {
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = antes;
    };
  }, []);

  const alternar = (s: Secao) => setAberta((a) => (a === s ? null : s));

  const alternarPush = async () => {
    setOcupadoPush(true);
    setErro("");
    try {
      if (push === "ativo") {
        await desativarPush();
        setPush("pendente");
      } else setPush(await ativarPush());
    } catch (e) {
      setErro(mensagemDeErro(e));
    } finally {
      setOcupadoPush(false);
    }
  };

  const mudarPref = async (id: string, v: boolean) => {
    const antes = prefs;
    const novo = { ...prefs, [id]: v };
    setPrefs(novo);
    const { error } = await supabase.rpc("salvar_preferencias_notificacao", { p: novo });
    if (error) {
      setPrefs(antes);
      return setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 040 do banco." : mensagemDeErro(error));
    }
    void recarregar();
  };

  const mudarPrivado = async (v: boolean) => {
    if (!eu) return;
    setPrivado(v);
    setSalvando(true);
    setErro("");
    const { error } = await supabase.from("perfis").update({ privado: v }).eq("id", eu);
    setSalvando(false);
    if (error) {
      setPrivado(!v);
      return setErro(mensagemDeErro(error));
    }
    await recarregar();
  };

  const tiposLigados = CATEGORIAS_PUSH.filter((c) => prefs[c.id] !== false).length;
  const nomeTema = TEMAS.find((t) => t.valor === tema)?.nome ?? "";
  const nBloq = bloqueados?.length ?? 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Configurações" onClick={fechar}>
      <div
        className="folha flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden rounded-t-[22px] bg-superficie pb-[max(10px,env(safe-area-inset-bottom))] sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-borda sm:hidden" />
        <div className="flex shrink-0 items-center justify-between px-5 pb-2 pt-3">
          <h2 className="text-lg font-semibold">Configurações</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 text-suave hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mx-4 mb-2 flex shrink-0 items-center gap-3 rounded-2xl bg-elevado px-3 py-2.5">
          <Avatar nome={perfil?.nome ?? "?"} foto={perfil?.foto_url} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold">{perfil?.nome}</span>
            <span className="block truncate text-[12px] text-suave">{[perfil?.usuario ? `@${perfil.usuario}` : null, email].filter(Boolean).join(" · ")}</span>
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-2 pb-1">
          <Gaveta id="aparencia" aberta={aberta} alternar={alternar} icone={<Palette />} cor="bg-marca/20 text-destaque" nome="Aparência" estado={nomeTema}>
            <div role="radiogroup" aria-label="Tema" className="my-1 grid grid-cols-3 gap-1 rounded-xl bg-fundo p-1">
              {TEMAS.map((t) => (
                <button
                  key={t.valor}
                  role="radio"
                  aria-checked={tema === t.valor}
                  onClick={() => definir(t.valor)}
                  className={clsx("rounded-lg py-2 text-[13px]", tema === t.valor ? "bg-marca font-semibold text-marca-texto" : "text-suave")}
                >
                  {t.nome}
                </button>
              ))}
            </div>
          </Gaveta>

          <Gaveta
            id="notificacoes"
            aberta={aberta}
            alternar={alternar}
            icone={<Bell />}
            cor="bg-[#f21393]/15 text-[#f472b6]"
            nome="Notificações"
            estado={push ? (push === "ativo" ? `${ESTADO_PUSH.ativo} · ${tiposLigados}/${CATEGORIAS_PUSH.length}` : ESTADO_PUSH[push]) : "…"}
            estadoOk={push === "ativo"}
          >
            <Opcao nome="Neste aparelho">
              {push === "ativo" || push === "pendente" ? (
                <button className={push === "ativo" ? "botao h-8 px-3 text-[13px]" : "botao-principal h-8 px-3 text-[13px]"} disabled={ocupadoPush} onClick={() => void alternarPush()}>
                  {ocupadoPush ? "..." : push === "ativo" ? "Desligar" : "Ligar"}
                </button>
              ) : (
                <span className="text-[12px] text-suave">{push ? ESTADO_PUSH[push] : "…"}</span>
              )}
            </Opcao>
            {CATEGORIAS_PUSH.map((c) => (
              <Opcao key={c.id} nome={c.nome}>
                <Chave ligada={prefs[c.id] !== false} mudar={(v) => void mudarPref(c.id, v)} rotulo={c.nome} />
              </Opcao>
            ))}
          </Gaveta>

          <Gaveta id="sons" aberta={aberta} alternar={alternar} icone={<Volume2 />} cor="bg-azul/15 text-azul" nome="Sons" estado={somBrinde ? "Brinde ligado" : "Brinde desligado"}>
            <Opcao nome="Som ao brindar">
              <Chave
                ligada={somBrinde}
                rotulo="Som ao brindar"
                mudar={(v) => {
                  setSomBrinde(v);
                  ligarSomBrinde(v);
                }}
              />
            </Opcao>
          </Gaveta>

          <Gaveta
            id="privacidade"
            aberta={aberta}
            alternar={alternar}
            icone={<Lock />}
            cor="bg-ok/15 text-ok"
            nome="Privacidade"
            estado={`${privado ? "Privado" : "Público"}${nBloq ? ` · ${nBloq} bloqueada${nBloq > 1 ? "s" : ""}` : ""}`}
          >
            <Opcao nome="Perfil privado">
              <Chave ligada={privado} desligada={salvando} mudar={(v) => void mudarPrivado(v)} rotulo="Perfil privado" />
            </Opcao>
            <button className="flex w-full items-center justify-between border-t border-borda/60 py-2.5 text-left text-sm" onClick={() => setVerBloqueados(!verBloqueados)} aria-expanded={verBloqueados}>
              Contas bloqueadas
              <span className="inline-flex items-center gap-1 text-[12px] text-suave">
                {nBloq}
                <ChevronRight className={clsx("h-4 w-4 transition-transform", verBloqueados && "rotate-90")} />
              </span>
            </button>
            {verBloqueados && (
              <ul className="mb-1 divide-y divide-borda/60 rounded-lg bg-fundo">
                {(bloqueados ?? []).map((b) => (
                  <li key={b.id} className="flex items-center gap-3 px-3 py-2">
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
                {nBloq === 0 && <li className="px-3 py-2.5 text-sm text-suave">Ninguém bloqueado.</li>}
              </ul>
            )}
            <Link to="/privacidade" onClick={fechar} className="flex items-center justify-between border-t border-borda/60 py-2.5 text-sm">
              Política de privacidade
              <ChevronRight className="h-4 w-4 text-suave" />
            </Link>
          </Gaveta>

          <Linha
            icone={<Sparkles />}
            cor="bg-alerta/15 text-alerta"
            nome="Meus gostos"
            estado={gostos != null ? `${gostos} escolhido${gostos === 1 ? "" : "s"}` : undefined}
            onClick={() => {
              fechar();
              navegar("/primeira-vibe?editar=1");
            }}
          />

          <Gaveta
            id="eventos"
            aberta={aberta}
            alternar={alternar}
            icone={<CalendarDays />}
            cor="bg-magenta/15 text-magenta"
            nome="Meus eventos"
            estado={eventos != null ? (eventos ? `${eventos} ativo${eventos > 1 ? "s" : ""}` : "Nenhum") : undefined}
          >
            <Link to="/eventos/novo" onClick={fechar} className="flex items-center justify-between py-2.5 text-sm">
              Criar um evento
              <ChevronRight className="h-4 w-4 text-suave" />
            </Link>
            <Link to="/eventos/meus" onClick={fechar} className="flex items-center justify-between border-t border-borda/60 py-2.5 text-sm">
              Meus eventos
              <span className="inline-flex items-center gap-1 text-[12px] text-suave">
                {eventos ? eventos : ""}
                <ChevronRight className="h-4 w-4" />
              </span>
            </Link>
          </Gaveta>

          {erro && <p className="px-3 py-2 text-sm text-perigo">{erro}</p>}

          <div className="mx-2 my-1.5 h-px bg-borda" />
          <Linha
            icone={<LogOut />}
            cor="bg-perigo/10 text-perigo"
            nome="Sair da conta"
            perigo
            onClick={async () => {
              await sair();
              navegar("/entrar");
            }}
          />
        </div>
      </div>
    </div>
  );
}

/** Linha de categoria: ícone, nome, estado atual e seta. */
function Linha({
  icone,
  cor,
  nome,
  estado,
  estadoOk,
  aberta,
  perigo,
  onClick,
  ...aria
}: {
  icone: ReactNode;
  cor: string;
  nome: string;
  estado?: string;
  estadoOk?: boolean;
  aberta?: boolean;
  perigo?: boolean;
  onClick: () => void;
  "aria-expanded"?: boolean;
}) {
  return (
    <button onClick={onClick} className="flex w-full items-center gap-3 rounded-2xl px-2.5 py-2.5 text-left hover:bg-elevado/60" {...aria}>
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl [&>svg]:h-[18px] [&>svg]:w-[18px]", cor)}>{icone}</span>
      <span className={clsx("min-w-0 flex-1 truncate text-[15px] font-semibold", perigo && "text-perigo")}>{nome}</span>
      {estado && <span className={clsx("shrink-0 text-[12.5px]", estadoOk ? "text-ok" : "text-suave")}>{estado}</span>}
      {!perigo && <ChevronRight className={clsx("h-4 w-4 shrink-0 text-suave transition-transform duration-200", aberta && "rotate-90 text-destaque")} />}
    </button>
  );
}

/** Categoria que abre suavemente e mostra as opções. */
function Gaveta({
  id,
  aberta,
  alternar,
  children,
  ...linha
}: {
  id: Secao;
  aberta: Secao | null;
  alternar: (s: Secao) => void;
  children: ReactNode;
  icone: ReactNode;
  cor: string;
  nome: string;
  estado?: string;
  estadoOk?: boolean;
}) {
  const ativa = aberta === id;
  return (
    <div className={clsx("rounded-2xl transition-colors", ativa && "bg-elevado/40")}>
      <Linha {...linha} aberta={ativa} aria-expanded={ativa} onClick={() => alternar(id)} />
      <div className={clsx("grid transition-[grid-template-rows] duration-300 ease-out", ativa ? "grid-rows-[1fr]" : "grid-rows-[0fr]")}>
        <div className="overflow-hidden">
          <div className="pb-2 pl-[58px] pr-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

function Opcao({ nome, children }: { nome: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-t border-borda/60 py-2 text-sm first:border-t-0">
      <span>{nome}</span>
      {children}
    </div>
  );
}

/** Chave liga/desliga. */
function Chave({ ligada, mudar, rotulo, desligada }: { ligada: boolean; mudar: (v: boolean) => void; rotulo: string; desligada?: boolean }) {
  return (
    <button
      role="switch"
      aria-checked={ligada}
      aria-label={rotulo}
      disabled={desligada}
      onClick={() => mudar(!ligada)}
      className={clsx("relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors disabled:opacity-60", ligada ? "bg-marca" : "bg-borda")}
    >
      <span className={clsx("absolute top-[2px] h-[18px] w-[18px] rounded-full bg-white shadow transition-[left]", ligada ? "left-[18px]" : "left-[2px]")} />
    </button>
  );
}
