import { ReactNode, useCallback, useEffect, useState } from "react";
import { Link, Outlet, useMatch, useNavigate } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { Simbolo } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { AcessoGestao } from "@/components/AcessoGestao";
import { BusinessProvider, useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { AcessoGestao as Acesso, meuAcessoGestao } from "@/lib/gestao";
import { AREAS_GESTAO, areaPorId, ondeFica, partesLiberadas } from "@/lib/areasNegocio";
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
  const navegar = useNavigate();
  const rota = useMatch("/gestao/area/:area/*");
  const area = rota ? areaPorId(rota.params.area ?? "", AREAS_GESTAO) : undefined;
  const codigo = rota?.params["*"]?.split("/")[0];
  const parte = codigo ? ondeFica(codigo, AREAS_GESTAO)?.nome ?? porCodigo(codigo)?.nome : undefined;
  if (negocio.carregando) return <Carregando />;

  return (
    <div className="min-h-screen bg-fundo text-texto">
      <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6 lg:px-8">
          {area ? (
            <>
              <button onClick={() => navegar("/gestao")} className="botao h-9 w-9 shrink-0 px-0" aria-label="Voltar">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: area.cor }}>
                <area.icone className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-[15px] font-semibold">{area.nome}</h1>
                {parte && <p className="truncate text-[13px] text-suave">{parte}</p>}
              </div>
            </>
          ) : (
            <Link to="/gestao" className="flex items-center gap-3">
              <Simbolo className="h-8" />
              <span className="leading-tight">
                <span className="block text-[17px] font-semibold">Gestão RoVibes</span>
                <span className="block text-[13px] text-suave">Plataforma</span>
              </span>
            </Link>
          )}
          <div className="ml-auto flex items-center gap-2">
            <span className="hidden text-right leading-tight sm:block">
              <span className="block text-sm font-semibold">{acesso.nome}</span>
              <span className="block text-[12px] text-suave">
                {acesso.ceo ? "CEO" : acesso.cargo ?? ""} · <span className="codigo">{acesso.login}</span>
              </span>
            </span>
            <button onClick={() => void supabase.auth.signOut()} className="botao h-10 w-10 px-0" aria-label="Sair" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        <Outlet />
      </main>
    </div>
  );
}

/** Tela inicial da Gestão: as áreas que o cargo permite. */
export function InicioGestao() {
  const { temAcesso } = useBusiness();
  const [resumo, setResumo] = useState<{ aprovacoes?: number; denuncias?: number }>({});
  useEffect(() => {
    supabase.rpc("resumo_area_trabalho", { p_estab: null }).then(({ data }) => setResumo((data ?? {}) as typeof resumo));
  }, []);
  const areas = AREAS_GESTAO.filter((a) => partesLiberadas(a, temAcesso).length > 0);
  const selo = (id: string) => (id === "estabelecimentos" ? resumo.aprovacoes : id === "moderacao" ? resumo.denuncias : 0);
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-5">
      {areas.map((a) => (
        <Link
          key={a.id}
          to={`/gestao/area/${a.id}`}
          className="relative flex min-h-[112px] flex-col justify-between rounded-cartao border border-borda bg-superficie p-4 transition-colors hover:bg-elevado"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: a.cor }}>
            <a.icone className="h-5 w-5" />
          </span>
          <span className="text-[16px] font-semibold leading-snug">{a.nome}</span>
          {!!selo(a.id) && <span className="absolute right-3 top-3 rounded-full bg-perigo/15 px-2 py-0.5 text-[11px] font-bold text-perigo">{selo(a.id)}</span>}
        </Link>
      ))}
    </div>
  );
}
