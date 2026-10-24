import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, History, Lock, Search, X, Zap } from "lucide-react";
import { Aplicativo, Area, buscar, CATALOGO } from "@/lib/catalogo";
import { NOME_PAPEL, NOME_SITUACAO, useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { reais } from "@/components/Formulario";
import { AREAS_NEGOCIO, AreaNegocio, linkDoApp, ondeFica, partesLiberadas } from "@/lib/areasNegocio";

interface Resumo {
  vendas_hoje?: number;
  pedidos_abertos?: number;
  pedidos_atrasados?: number;
  estoque_baixo?: number;
  ocorrencias?: number;
  autorizacoes?: number;
  proximo_evento?: { id: string; nome: string; inicio: string; interessados?: number };
  aprovacoes?: number;
  denuncias?: number;
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Aviso curto no bloco de cada área (só quando há algo pendente). */
function selo(area: AreaNegocio, r: Resumo): string | null {
  const n = (v?: number) => v ?? 0;
  switch (area.id) {
    case "produtos-estoque":
      return n(r.estoque_baixo) ? plural(n(r.estoque_baixo), "alerta", "alertas") : null;
    case "vendas-pedidos":
      return n(r.pedidos_atrasados) ? plural(n(r.pedidos_atrasados), "atrasado", "atrasados") : null;
    case "atendimento-operacao":
      return n(r.ocorrencias) + n(r.autorizacoes) ? plural(n(r.ocorrencias) + n(r.autorizacoes), "pendente", "pendentes") : null;
    case "administracao":
      return n(r.aprovacoes) + n(r.denuncias) ? plural(n(r.aprovacoes) + n(r.denuncias), "pendente", "pendentes") : null;
    default:
      return null;
  }
}

/** Cor sólida de cada área nos blocos da Área de Trabalho. */
export const COR_AREA: Record<Area, string> = {
  Estabelecimento: "bg-[#1F4E8C]",
  Vitrine: "bg-[#E06A1B]",
  Conteúdo: "bg-[#7C3AED]",
  Operação: "bg-[#14998A]",
  Equipe: "bg-[#1F8A4C]",
  Administração: "bg-[#B4234A]",
};

const dataLonga = (d: Date) =>
  d
    .toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })
    .split(" ")
    .map((p) => (p === "de" ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");

/** Números do dia (cada um só aparece para quem tem acesso). */
function Resumo({ r }: { r: Resumo }) {
  const itens: { valor: string; nome: string }[] = [];
  if (r.vendas_hoje !== undefined) itens.push({ valor: reais(Number(r.vendas_hoje)) || "R$ 0,00", nome: "vendas hoje" });
  if (r.pedidos_abertos !== undefined) itens.push({ valor: String(r.pedidos_abertos), nome: "pedidos abertos" });
  if (r.estoque_baixo) itens.push({ valor: String(r.estoque_baixo), nome: "abaixo do mínimo" });
  if (r.proximo_evento)
    itens.push({
      valor: r.proximo_evento.interessados ? String(r.proximo_evento.interessados) : new Date(r.proximo_evento.inicio).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
      nome: r.proximo_evento.interessados ? `interessados · ${r.proximo_evento.nome}` : r.proximo_evento.nome,
    });
  if (!itens.length) return null;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {itens.map((i) => (
        <span key={i.nome} className="cartao px-3.5 py-2.5">
          <span className="block text-lg font-semibold leading-tight">{i.valor}</span>
          <span className="block truncate text-[12px] text-suave">{i.nome}</span>
        </span>
      ))}
    </div>
  );
}

export function AreaDeTrabalho() {
  const acessos = useBusiness();
  const { temAcesso, atual } = acessos;
  const { perfil, ehAdmin } = useSessao();
  const navegar = useNavigate();
  const [termo, setTermo] = useState("");
  const [agora, setAgora] = useState(() => new Date());
  const campo = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscar(CATALOGO, termo), [termo]);
  const [resumo, setResumo] = useState<Resumo>({});
  const areas = AREAS_NEGOCIO.filter((a) => partesLiberadas(a, temAcesso).length > 0);
  const estab = atual?.estabelecimento_id ?? null;

  useEffect(() => {
    let vivo = true;
    const carregar = () =>
      supabase.rpc("resumo_area_trabalho", { p_estab: estab }).then(({ data, error }) => {
        if (vivo && !error) setResumo((data ?? {}) as Resumo);
      });
    void carregar();
    const t = window.setInterval(carregar, 60000);
    return () => {
      vivo = false;
      window.clearInterval(t);
    };
  }, [estab]);
  const cargo = atual ? atual.cargo || NOME_PAPEL[atual.papel] : ehAdmin ? "Administração RoVibes" : "";
  const situacao = atual?.estabelecimento.situacao;

  useEffect(() => {
    const t = window.setInterval(() => setAgora(new Date()), 20000);
    return () => window.clearInterval(t);
  }, []);

  // Ctrl+K ou "/" levam à busca.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if ((e.key === "k" && (e.ctrlKey || e.metaKey)) || (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName))) {
        e.preventDefault();
        campo.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const abrir = (a: Aplicativo) => navegar(linkDoApp(a.codigo));

  return (
    <div className="space-y-6">
      {/* Saudação e relógio */}
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-borda pb-6">
        <div>
          <p className="text-sm text-suave">Olá,</p>
          <h1 className="text-[26px] font-semibold leading-tight">{perfil?.nome}</h1>
          <p className="text-sm text-suave">{[cargo, atual?.estabelecimento.nome].filter(Boolean).join(" · ")}</p>
        </div>
        <div className="cartao flex items-center gap-4 px-5 py-3">
          <CalendarDays className="h-6 w-6 text-destaque" />
          <div>
            <p className="text-[13px] font-medium text-suave">{dataLonga(agora)}</p>
            <p className="codigo text-[28px] font-semibold leading-none">{agora.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
          </div>
        </div>
      </header>

      {situacao && situacao !== "aprovado" && (
        <p className={clsx("rounded-cartao border px-4 py-3 text-sm", situacao === "pendente" ? "border-alerta/40 bg-alerta/10" : "border-perigo/40 bg-perigo/10")}>
          <strong>{atual?.estabelecimento.nome}</strong>: {NOME_SITUACAO[situacao]}.{" "}
          {atual?.estabelecimento.motivo_situacao ?? (situacao === "pendente" ? "O cadastro está em análise pela equipe RoVibes." : "")}
        </p>
      )}

      <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Busca e aplicativos */}
        <div className="min-w-0 space-y-6">
          <div className="relative">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-suave" />
            <input
              ref={campo}
              value={termo}
              onChange={(e) => setTermo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && resultados[0]) abrir(resultados[0]);
                if (e.key === "Escape") setTermo("");
              }}
              placeholder="Buscar..."
              aria-label="Buscar aplicativo"
              className="h-12 w-full rounded-cartao border border-borda bg-superficie pl-11 pr-24 text-[15px] placeholder:text-suave focus:border-marca focus:outline-none"
            />
            {termo ? (
              <button onClick={() => setTermo("")} className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-suave hover:text-texto" aria-label="Limpar busca">
                <X className="h-4 w-4" />
              </button>
            ) : (
              <kbd className="codigo absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-borda bg-elevado px-1.5 py-0.5 text-suave sm:block">Ctrl + K</kbd>
            )}
          </div>

          {termo ? (
            <section aria-live="polite">
              <h2 className="mb-3 font-semibold">{resultados.length === 0 ? "Nada encontrado" : `${resultados.length} encontrado${resultados.length > 1 ? "s" : ""}`}</h2>
              <div className="cartao divide-y divide-borda">
                {resultados.map((a) => (
                  <LinhaResultado
                    key={a.codigo}
                    app={a}
                    liberado={temAcesso(a)}
                    solicitado={acessos.foiSolicitado(a.codigo)}
                    onAbrir={() => abrir(a)}
                    onSolicitar={() => acessos.solicitarAcesso(a.codigo)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="space-y-4">
              <Resumo r={resumo} />
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
                {areas.map((a) => {
                  const aviso = selo(a, resumo);
                  return (
                    <Link
                      key={a.id}
                      to={`/business/area/${a.id}`}
                      className="relative flex min-h-[112px] flex-col justify-between rounded-cartao p-4 text-white shadow-sm transition-[filter,transform] hover:brightness-110 active:scale-[0.98]"
                      style={{ backgroundColor: a.cor }}
                    >
                      <a.icone className="h-6 w-6 opacity-95" />
                      <span className="block text-[16px] font-semibold leading-snug">{a.nome}</span>
                      {aviso && <span className="absolute right-3 top-3 rounded-full bg-white/95 px-2 py-0.5 text-[11px] font-bold text-perigo">{aviso}</span>}
                    </Link>
                  );
                })}
              </div>
            </section>
          )}

        </div>

        {/* Lado direito: mais usados e últimos acessos */}
        <aside className="space-y-6">
          <section className="cartao p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Zap className="h-5 w-5 text-magenta" />
                Mais usados
              </h2>
              <span className="text-[12px] text-suave">30 dias</span>
            </div>
            {acessos.usoPercentual.length === 0 ? (
              <p className="py-3 text-sm text-suave">—</p>
            ) : (
              <ul className="divide-y divide-borda">
                {acessos.usoPercentual.map(({ app, pct }) => (
                  <li key={app.codigo}>
                    <Link to={linkDoApp(app.codigo)} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-medium">{ondeFica(app.codigo)?.nome ?? app.nome}</span>
                        <span className="block truncate text-[12px] text-suave">{ondeFica(app.codigo)?.area.nome}</span>
                      </span>
                      <span className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-elevado">
                        <span className="block h-full rounded-full bg-magenta" style={{ width: `${Math.max(4, pct)}%` }} />
                      </span>
                      <span className="codigo w-9 shrink-0 text-right text-[13px] font-semibold">{pct}%</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cartao p-5">
            <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
              <History className="h-5 w-5 text-magenta" />
              Últimos acessos
            </h2>
            {acessos.ultimos.length === 0 ? (
              <p className="py-3 text-sm text-suave">Nenhum acesso ainda.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {acessos.ultimos.map(({ app, quando }) => (
                  <li key={app.codigo}>
                    <Link to={linkDoApp(app.codigo)} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <History className="h-4 w-4 shrink-0 text-suave" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{ondeFica(app.codigo)?.nome ?? app.nome}</span>
                        <span className="block text-[12px] text-suave">
                          {ondeFica(app.codigo)?.area.nome} · {new Date(quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às{" "}
                          {new Date(quando).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                        </span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

function LinhaResultado({
  app,
  liberado,
  solicitado,
  onAbrir,
  onSolicitar,
}: {
  app: Aplicativo;
  liberado: boolean;
  solicitado: boolean;
  onAbrir: () => void;
  onSolicitar: () => void;
}) {
  const onde = ondeFica(app.codigo);
  const Icone = onde?.area.icone ?? app.icone;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white", !liberado && "bg-elevado text-suave")} style={liberado ? { backgroundColor: onde?.area.cor } : undefined}>
        <Icone className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{onde?.nome ?? app.nome}</p>
        <p className="text-[13px] text-suave">
          {onde?.area.nome} · <span className="codigo">{app.codigo}</span>
        </p>
      </div>
      {liberado ? (
        <button onClick={onAbrir} className="botao">
          Abrir
        </button>
      ) : solicitado ? (
        <span className="text-[13px] font-medium text-alerta">Acesso solicitado</span>
      ) : (
        <button onClick={onSolicitar} className="botao">
          <Lock className="h-3.5 w-3.5" />
          Solicitar acesso
        </button>
      )}
    </div>
  );
}
