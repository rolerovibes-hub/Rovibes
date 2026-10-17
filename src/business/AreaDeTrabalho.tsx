import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import clsx from "clsx";
import { ChevronLeft, ChevronRight, Lock, Search, Star, X } from "lucide-react";
import { AREAS, Aplicativo, buscar, CATALOGO } from "@/lib/catalogo";
import { tempoRelativo, temAcesso, useAcessos, USUARIO_DEMO } from "@/lib/acessos";
import { Avatar } from "@/components/Avatar";
import { ler } from "@/lib/armazenamento";

export function AreaDeTrabalho() {
  const acessos = useAcessos();
  const navegar = useNavigate();
  const [termo, setTermo] = useState("");
  const [organizando, setOrganizando] = useState(false);
  const campo = useRef<HTMLInputElement>(null);
  const resultados = useMemo(() => buscar(CATALOGO, termo), [termo]);
  const estab = ler("estabelecimento", USUARIO_DEMO.estabelecimento);

  // "/" leva à busca, como no Expedição.
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === "/" && !["INPUT", "TEXTAREA", "SELECT"].includes(alvo.tagName)) {
        e.preventDefault();
        campo.current?.focus();
      }
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, []);

  const abrir = (a: Aplicativo) => navegar(`/business/app/${a.codigo}`);

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-8">
      {/* Coluna do usuário */}
      <aside className="space-y-4">
        <section className="cartao p-5">
          <div className="flex items-center gap-3.5">
            <Avatar nome={USUARIO_DEMO.nome} tamanho="lg" />
            <div className="min-w-0">
              <h2 className="truncate text-lg font-semibold leading-tight">{USUARIO_DEMO.nome}</h2>
              <p className="text-sm text-suave">{USUARIO_DEMO.cargo}</p>
            </div>
          </div>
          <dl className="mt-5 space-y-3 border-t border-borda pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-suave">Estabelecimento</dt>
              <dd className="truncate font-medium">{estab}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-suave">Aplicativos liberados</dt>
              <dd className="codigo text-sm font-medium">{CATALOGO.filter(temAcesso).length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-suave">Situação</dt>
              <dd className="inline-flex items-center gap-1.5 font-medium text-alerta">
                <span className="h-2 w-2 rounded-full bg-alerta" />
                Aguardando aprovação
              </dd>
            </div>
          </dl>
          <Link to="/business/app/G1002" className="botao mt-5 w-full">
            Meu perfil
          </Link>
        </section>

        <section className="cartao hidden p-5 lg:block">
          <h3 className="rotulo">Últimos acessos</h3>
          <ListaRecentes itens={acessos.ultimos} />
        </section>
      </aside>

      {/* Área de trabalho */}
      <div className="min-w-0 space-y-8">
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
            placeholder="Buscar aplicativo por nome ou código"
            aria-label="Buscar aplicativo"
            className="h-12 w-full rounded-cartao border border-borda bg-superficie pl-11 pr-12 text-[15px] placeholder:text-suave focus:border-marca focus:outline-none"
          />
          {termo ? (
            <button
              onClick={() => setTermo("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 rounded p-1 text-suave hover:text-texto"
              aria-label="Limpar busca"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="codigo absolute right-4 top-1/2 hidden -translate-y-1/2 rounded border border-borda px-1.5 py-0.5 text-suave sm:block">
              /
            </kbd>
          )}
        </div>

        {termo ? (
          <section aria-live="polite">
            <h2 className="mb-3 font-semibold">
              {resultados.length === 0 ? "Nenhum aplicativo encontrado" : `${resultados.length} encontrado${resultados.length > 1 ? "s" : ""}`}
            </h2>
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
          <>
            <section>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="font-semibold">Meus aplicativos</h2>
                <button onClick={() => setOrganizando((v) => !v)} className={organizando ? "botao-principal" : "botao"}>
                  {organizando ? "Concluir" : "Organizar"}
                </button>
              </div>
              {acessos.favoritos.length === 0 ? (
                <p className="cartao p-6 text-sm text-suave">
                  Use a busca e marque a estrela dos aplicativos que você mais usa.
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4">
                  {acessos.favoritos.map((a, i) => (
                    <Bloco
                      key={a.codigo}
                      app={a}
                      organizando={organizando}
                      primeiro={i === 0}
                      ultimo={i === acessos.favoritos.length - 1}
                      onAbrir={() => abrir(a)}
                      onMover={(d) => acessos.moverFavorito(a.codigo, d)}
                      onRemover={() => acessos.alternarFavorito(a.codigo)}
                    />
                  ))}
                </div>
              )}
            </section>

            <div className="grid gap-6 md:grid-cols-2">
              <section>
                <h2 className="mb-3 font-semibold">Mais usados</h2>
                <div className="cartao divide-y divide-borda">
                  {acessos.maisUsados.length === 0 ? (
                    <p className="p-4 text-sm text-suave">Os aplicativos que você abrir aparecem aqui.</p>
                  ) : (
                    acessos.maisUsados.map((a) => <LinhaSimples key={a.codigo} app={a} />)
                  )}
                </div>
              </section>
              <section className="lg:hidden">
                <h2 className="mb-3 font-semibold">Últimos acessos</h2>
                <div className="cartao px-4 pb-2">
                  <ListaRecentes itens={acessos.ultimos} />
                </div>
              </section>
            </div>

            <section>
              <h2 className="mb-3 font-semibold">Todos os aplicativos</h2>
              <div className="grid gap-x-8 gap-y-6 sm:grid-cols-2 xl:grid-cols-3">
                {AREAS.map((area) => (
                  <div key={area}>
                    <h3 className="rotulo mb-1.5">{area}</h3>
                    <ul>
                      {CATALOGO.filter((a) => a.area === area).map((a) => (
                        <li key={a.codigo}>
                          <button
                            onClick={() => abrir(a)}
                            className="group flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left text-sm hover:bg-elevado"
                          >
                            <span className="codigo w-12 text-suave">{a.codigo}</span>
                            <span className={clsx("flex-1 truncate", !temAcesso(a) && "text-suave")}>{a.nome}</span>
                            {!temAcesso(a) && <Lock className="h-3.5 w-3.5 text-suave" aria-label="Sem acesso" />}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Bloco({
  app,
  organizando,
  primeiro,
  ultimo,
  onAbrir,
  onMover,
  onRemover,
}: {
  app: Aplicativo;
  organizando: boolean;
  primeiro: boolean;
  ultimo: boolean;
  onAbrir: () => void;
  onMover: (d: -1 | 1) => void;
  onRemover: () => void;
}) {
  const Icone = app.icone;
  return (
    <div className="cartao relative flex flex-col">
      <button
        onClick={onAbrir}
        disabled={organizando}
        className="flex flex-1 flex-col gap-4 rounded-cartao p-4 text-left transition-colors hover:bg-elevado disabled:hover:bg-transparent"
      >
        <div className="flex items-start justify-between">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-destaque-suave text-destaque">
            <Icone className="h-5 w-5" />
          </span>
          <span className="codigo text-suave">{app.codigo}</span>
        </div>
        <span className="text-[15px] font-medium leading-snug">{app.nome}</span>
      </button>
      {organizando && (
        <div className="flex items-center justify-between border-t border-borda px-2 py-1.5">
          <div className="flex">
            <button onClick={() => onMover(-1)} disabled={primeiro} className="rounded p-1.5 text-suave hover:bg-elevado hover:text-texto disabled:opacity-30" aria-label={`Mover ${app.nome} para trás`}>
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button onClick={() => onMover(1)} disabled={ultimo} className="rounded p-1.5 text-suave hover:bg-elevado hover:text-texto disabled:opacity-30" aria-label={`Mover ${app.nome} para frente`}>
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <button onClick={onRemover} className="rounded px-2 py-1 text-[13px] text-perigo hover:bg-elevado">
            Remover
          </button>
        </div>
      )}
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
  const Icone = app.icone;
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className={clsx("flex h-9 w-9 shrink-0 items-center justify-center rounded-lg", liberado ? "bg-destaque-suave text-destaque" : "bg-elevado text-suave")}>
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
          <button onClick={onFavoritar} className="rounded p-2 hover:bg-elevado" aria-label={favorito ? "Tirar dos meus aplicativos" : "Pôr nos meus aplicativos"} aria-pressed={favorito}>
            <Star className={clsx("h-4 w-4", favorito ? "fill-current text-destaque" : "text-suave")} />
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

function LinhaSimples({ app }: { app: Aplicativo }) {
  const Icone = app.icone;
  return (
    <Link to={`/business/app/${app.codigo}`} className="flex items-center gap-3 px-4 py-2.5 hover:bg-elevado">
      <Icone className="h-4 w-4 text-destaque" />
      <span className="flex-1 truncate text-sm">{app.nome}</span>
      <span className="codigo text-suave">{app.codigo}</span>
    </Link>
  );
}

function ListaRecentes({ itens }: { itens: { app: Aplicativo; quando: number }[] }) {
  if (itens.length === 0) return <p className="mt-3 text-sm text-suave">Nenhum acesso ainda.</p>;
  return (
    <ul className="mt-2">
      {itens.map(({ app, quando }) => (
        <li key={app.codigo}>
          <Link to={`/business/app/${app.codigo}`} className="-mx-2 flex items-baseline gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-elevado">
            <span className="flex-1 truncate">{app.nome}</span>
            <span className="shrink-0 text-xs text-suave">{tempoRelativo(quando)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
