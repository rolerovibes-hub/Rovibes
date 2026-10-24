import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import clsx from "clsx";
import { TelaArea } from "@/business/TelaArea";
import { LayoutDashboard, LogOut } from "lucide-react";
import { Simbolo } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { AcessoGestao } from "@/components/AcessoGestao";
import { BusinessProvider, useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { AcessoGestao as Acesso, GestaoContexto, meuAcessoGestao, useGestao } from "@/lib/gestao";
import { AREAS_GESTAO } from "@/lib/areasNegocio";
import { porCodigo } from "@/lib/catalogo";

/** Gestão RoVibes (/gestao): sistema da equipe da plataforma, com identidade escura própria. */
export function GestaoLayout() {
  const { carregando, sessao, recarregar } = useSessao();
  const [acesso, setAcesso] = useState<Acesso | null | "carregando">("carregando");
  const usuario = sessao?.user.id;

  // Identidade escura da Gestão (independe do tema escolhido no app).
  useEffect(() => {
    const html = document.documentElement;
    const antes = html.classList.contains("dark");
    html.classList.add("dark");
    document.title = "Gestão RoVibes";
    return () => {
      if (!antes) html.classList.remove("dark");
    };
  }, []);

  const verificar = useCallback(async () => {
    if (!usuario) return setAcesso(null);
    setAcesso("carregando");
    setAcesso(await meuAcessoGestao());
    await recarregar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usuario]);
  useEffect(() => {
    void verificar();
  }, [verificar]);

  if (carregando || (sessao && acesso === "carregando")) return <Carregando />;
  const tela = (conteudo: ReactNode) => (
    <div className="flex min-h-screen items-center justify-center bg-[radial-gradient(circle_at_20%_20%,#2b1b4f,#0b0d14_60%)] px-4 py-10 text-texto">
      <div className="w-full max-w-sm">
        <div className="mb-5 flex items-center gap-2.5">
          <Simbolo className="h-9" />
          <span className="rounded-full bg-marca/20 px-2.5 py-0.5 text-[11px] font-bold tracking-wider text-destaque">ACESSO RESTRITO</span>
        </div>
        <div className="cartao p-6">{conteudo}</div>
      </div>
    </div>
  );

  if (!sessao) return tela(<AcessoGestao />);
  if (!acesso || acesso === "carregando" || !acesso.gestao)
    return tela(
      <div className="text-center">
        <p className="font-semibold">Esta conta não é da Gestão RoVibes.</p>
        <button className="botao-principal mt-5 h-11 w-full" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
      </div>,
    );
  if (!acesso.ativo)
    return tela(
      <div className="text-center">
        <p className="font-semibold">Usuário desativado.</p>
        <button className="botao mt-5 h-11 w-full" onClick={() => void supabase.auth.signOut()}>
          Sair
        </button>
      </div>,
    );
  if (!acesso.confirmada) return tela(<AcessoGestao soCodigo aoConfirmar={() => void verificar()} />);

  return (
    <BusinessProvider>
      <Estrutura acesso={acesso} />
    </BusinessProvider>
  );
}

function Estrutura({ acesso }: { acesso: Acesso }) {
  const negocio = useBusiness();
  const local = useLocation();
  const [porArea, setPorArea] = useState<Record<string, number>>({});
  const permissoes = acesso.permissoes ?? {};
  const nivel = useCallback((area: string) => (acesso.ceo ? 5 : permissoes[area] ?? 0), [acesso.ceo, permissoes]);

  useEffect(() => {
    const carregar = () => supabase.rpc("resumo_central").then(({ data }) => setPorArea(((data ?? {}) as { por_area?: Record<string, number> }).por_area ?? {}));
    void carregar();
    const t = window.setInterval(carregar, 60000);
    return () => window.clearInterval(t);
  }, [local.pathname]);

  if (negocio.carregando) return <Carregando />;
  const areas = AREAS_GESTAO.filter((a) => nivel(a.id) >= 1);
  const ativa = (id: string) => local.pathname.startsWith(`/gestao/area/${id}`);

  return (
    <GestaoContexto.Provider value={{ acesso, nivel }}>
      <div className="min-h-screen bg-fundo text-texto">
        <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
          <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
            <Link to="/gestao" className="flex items-center gap-2.5">
              <Simbolo className="h-7" />
              <span className="text-[16px] font-semibold">Gestão RoVibes</span>
            </Link>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden text-right leading-tight sm:block">
                <span className="block text-sm font-semibold">{acesso.nome}</span>
                <span className="block text-[12px] text-suave">
                  {acesso.ceo ? "CEO" : acesso.cargo ?? ""} · <span className="codigo">{acesso.login}</span>
                </span>
              </span>
              <button onClick={() => void supabase.auth.signOut()} className="botao h-9 w-9 px-0" aria-label="Sair" title="Sair">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
          {/* Celular: áreas em faixa */}
          <nav className="flex gap-1 overflow-x-auto px-3 pb-2 lg:hidden [scrollbar-width:none]" aria-label="Áreas">
            <NavLink to="/gestao" end className={({ isActive }) => clsx("shrink-0 rounded-full px-3 py-1 text-[13px]", isActive ? "bg-marca text-marca-texto" : "bg-elevado")}>
              Central
            </NavLink>
            {areas.map((a) => (
              <NavLink key={a.id} to={`/gestao/area/${a.id}`} className={() => clsx("shrink-0 rounded-full px-3 py-1 text-[13px]", ativa(a.id) ? "bg-marca text-marca-texto" : "bg-elevado")}>
                {a.nome}
              </NavLink>
            ))}
          </nav>
        </header>
        <div className="lg:grid lg:grid-cols-[210px_minmax(0,1fr)]">
          <nav className="sticky top-14 hidden h-[calc(100vh-56px)] overflow-y-auto border-r border-borda px-2 py-3 lg:block" aria-label="Áreas">
            <ItemMenu para="/gestao" ativo={local.pathname === "/gestao"} nome="Central" total={Object.values(porArea).reduce((a, b) => a + b, 0)} />
            {areas.map((a) => (
              <ItemMenu key={a.id} para={`/gestao/area/${a.id}`} ativo={ativa(a.id)} nome={a.nome} total={porArea[a.id] ?? 0} icone={<a.icone className="h-4 w-4" />} />
            ))}
          </nav>
          <main className="min-w-0 px-4 py-5 sm:px-6">
            <Outlet />
          </main>
        </div>
      </div>
    </GestaoContexto.Provider>
  );
}

function ItemMenu({ para, ativo, nome, total, icone }: { para: string; ativo: boolean; nome: string; total: number; icone?: ReactNode }) {
  return (
    <Link to={para} className={clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", ativo ? "bg-marca/20 font-semibold text-destaque" : "hover:bg-elevado")}>
      {icone ?? <LayoutDashboard className="h-4 w-4" />}
      <span className="min-w-0 flex-1 truncate">{nome}</span>
      {total > 0 && <span className="rounded-full bg-perigo/15 px-1.5 text-[11px] font-bold text-perigo">{total}</span>}
    </Link>
  );
}

/** Área da Gestão: as partes que o nível do cargo naquela área permite. */
export function AreaGestao() {
  const { nivel } = useGestao();
  const { temAcesso } = useBusiness();
  return (
    <TelaArea
      areas={AREAS_GESTAO}
      base="/gestao"
      podeVer={(codigo, area) => {
        if (nivel(area.id) < 1) return false;
        const app = porCodigo(codigo);
        // As telas antigas de administração seguem os níveis que o banco calcula do cargo.
        return codigo.startsWith("A") ? !!app && temAcesso(app) : true;
      }}
    />
  );
}
