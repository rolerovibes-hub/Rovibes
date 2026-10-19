import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { CalendarDays, History, Lock, Search, Star, X, Zap } from "lucide-react";
import { Aplicativo, Area, buscar, CATALOGO } from "@/lib/catalogo";
import { NOME_PAPEL, NOME_SITUACAO, useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { GradeApps, visualApp } from "./GradeApps";

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

export function AreaDeTrabalho() {
  const acessos = useBusiness();
  const { temAcesso, atual } = acessos;
  const { perfil, ehAdmin } = useSessao();
  const navegar = useNavigate();
  const [termo, setTermo] = useState("");
  const [agora, setAgora] = useState(() => new Date());
  const campo = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscar(CATALOGO, termo), [termo]);
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

  const abrir = (a: Aplicativo) => navegar(`/business/app/${a.codigo}`);

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
              placeholder="Buscar por código ou nome da funcionalidade..."
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
              <h2 className="mb-3 font-semibold">{resultados.length === 0 ? "Nenhum aplicativo encontrado" : `${resultados.length} encontrado${resultados.length > 1 ? "s" : ""}`}</h2>
              <div className="cartao divide-y divide-borda">
                {resultados.map((a) => (
                  <LinhaResultado
                    key={a.codigo}
                    app={a}
                    liberado={temAcesso(a)}
                    solicitado={acessos.foiSolicitado(a.codigo)}
                    favorito={acessos.ehFavorito(a.codigo)}
                    onAbrir={() => abrir(a)}
                    onFavoritar={() => acessos.alternarFavorito(a.codigo)}
                    onSolicitar={() => acessos.solicitarAcesso(a.codigo)}
                  />
                ))}
              </div>
            </section>
          ) : (
            <section className="cartao p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="flex items-center gap-2 text-lg font-semibold">
                  <Star className="h-5 w-5 fill-current text-destaque" />
                  Meus Aplicativos
                </h2>
                <span className="text-[13px] text-suave">
                  {acessos.favoritos.length} {acessos.favoritos.length === 1 ? "favorito" : "favoritos"}
                </span>
              </div>
              {acessos.favoritos.length === 0 ? (
                <div className="rounded-lg border border-dashed border-borda px-6 py-10 text-center text-sm text-suave">
                  Toque na sua foto, no canto superior, e marque a estrela dos aplicativos que você quer aqui. Você também pode buscar um aplicativo acima.
                  <div className="mt-4">
                    <Link to="/business/app/G1002" className="botao">
                      Escolher meus aplicativos
                    </Link>
                  </div>
                </div>
              ) : (
                <GradeApps apps={acessos.favoritos} corArea={COR_AREA} onAbrir={abrir} />
              )}
            </section>
          )}
        </div>

        {/* Lado direito: mais usados e últimos acessos */}
        <aside className="space-y-6">
          <section className="cartao p-5">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <Zap className="h-5 w-5 text-magenta" />
                Apps mais usados
              </h2>
              <span className="text-[12px] text-suave">30 dias</span>
            </div>
            {acessos.usoPercentual.length === 0 ? (
              <p className="py-3 text-sm text-suave">Os aplicativos que você abrir aparecem aqui.</p>
            ) : (
              <ul className="divide-y divide-borda">
                {acessos.usoPercentual.map(({ app, pct }) => (
                  <li key={app.codigo}>
                    <Link to={`/business/app/${app.codigo}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <span className="codigo w-12 shrink-0 text-destaque">{app.codigo}</span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{app.nome}</span>
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
                    <Link to={`/business/app/${app.codigo}`} className="flex items-center gap-3 py-2.5 hover:opacity-80">
                      <History className="h-4 w-4 shrink-0 text-suave" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium">{app.nome}</span>
                        <span className="codigo block text-[12px] text-suave">
                          {app.codigo} · {new Date(quando).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })} às{" "}
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
  favorito,
  onAbrir,
  onFavoritar,
  onSolicitar,
}: {
  app: Aplicativo;
  liberado: boolean;
  solicitado: boolean;
  favorito: boolean;
  onAbrir: () => void;
  onFavoritar: () => void;
  onSolicitar: () => void;
}) {
  const { estiloDe } = useBusiness();
  const { Icone, classe, estilo } = visualApp(app, favorito ? estiloDe(app.codigo) : { cor: null, icone: null }, COR_AREA);
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white", liberado ? classe : "bg-elevado text-suave")} style={liberado ? estilo : undefined}>
        <Icone className="h-[18px] w-[18px]" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{app.nome}</p>
        <p className="text-[13px] text-suave">
          <span className="codigo">{app.codigo}</span> · {app.area}
        </p>
      </div>
      {liberado ? (
        <>
          <button onClick={onFavoritar} className="rounded p-2 hover:bg-elevado" aria-label={favorito ? "Tirar da tela inicial" : "Pôr na tela inicial"} aria-pressed={favorito}>
            <Star className={clsx("h-4 w-4", favorito ? "fill-current text-alerta" : "text-suave")} />
          </button>
          <button onClick={onAbrir} className="botao">
            Abrir
          </button>
        </>
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
