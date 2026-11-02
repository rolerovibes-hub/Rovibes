import { useEffect } from "react";
import { Link, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { Home, LifeBuoy, LogOut } from "lucide-react";
import clsx from "clsx";
import { SeletorContexto } from "./SeletorContexto";
import { Simbolo } from "@/components/Marca";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { porCodigo } from "@/lib/catalogo";
import { areaPorId, INTENCOES, ondeFica, partesLiberadas } from "@/lib/areasNegocio";
import { useSessao } from "@/lib/sessao";
import { BusinessProvider, useBusiness } from "@/lib/acessos";
import { PortaSistema } from "@/components/PortaSistema";

export function BusinessLayout() {
  return (
    <PortaSistema produto="Business">
      <BusinessProvider>
        <Estrutura />
      </BusinessProvider>
    </PortaSistema>
  );
}

function Estrutura() {
  const { perfil, ehAdmin, sair } = useSessao();
  const negocio = useBusiness();
  const rotaArea = useMatch("/business/area/:area/*");
  const area = rotaArea ? areaPorId(rotaArea.params.area ?? "") : undefined;
  const codigoParte = rotaArea?.params["*"]?.split("/")[0];
  const parte = codigoParte ? ondeFica(codigoParte)?.nome ?? porCodigo(codigoParte)?.nome : undefined;
  const navegar = useNavigate();
  const nome = perfil?.nome ?? "";

  useEffect(() => {
    document.title = area ? `${parte ? `${parte} · ` : ""}${area.nome} · RoVibes Business` : "RoVibes Business";
  }, [area, parte]);

  if (negocio.carregando) return <Carregando />;
  const semEstabelecimento = negocio.vinculos.length === 0 && !ehAdmin;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
        <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6 lg:px-8">
          <Link to="/business" className="shrink-0" aria-label="RoVibes Business, Início">
            <Simbolo className="h-8" />
          </Link>
          <SeletorContexto />

          <div className="ml-auto flex items-center gap-2">
            <Link to="/business/area/conta/G1004" className="botao hidden h-9 sm:inline-flex" title="Ajuda RoVibes">
              <LifeBuoy className="h-4 w-4" />
              Ajuda
            </Link>
            <button onClick={() => navegar("/business/area/conta/G1002")} className="rounded-full ring-2 ring-transparent hover:ring-marca" aria-label="Meu perfil" title="Meu perfil">
              <Avatar nome={nome || "?"} tamanho="md" foto={perfil?.foto_url} />
            </button>
            <button
              onClick={async () => {
                await sair();
                navegar("/business");
              }}
              className="botao h-10 w-10 px-0"
              aria-label="Sair"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      <div className="lg:grid lg:grid-cols-[220px_minmax(0,1fr)]">
        {!semEstabelecimento && <MenuIntencoes />}
        <main className="w-full min-w-0 px-4 pb-24 pt-6 sm:px-6 sm:pt-8 lg:px-8 lg:pb-8">
          {semEstabelecimento ? <p className="cartao mx-auto max-w-md p-6 text-center text-sm text-suave">Este usuário não está ativo em nenhum estabelecimento.</p> : <Outlet />}
        </main>
      </div>

    </div>
  );
}

/** Menu principal: Início + as intenções. No computador, coluna à esquerda; no celular, abas embaixo. */
function MenuIntencoes() {
  const { temAcesso } = useBusiness();
  const local = useLocation();
  const intencoes = INTENCOES.filter((a) => partesLiberadas(a, temAcesso).length > 0);
  const itens = [{ id: "inicio", nome: "Início", icone: Home, para: "/business" }, ...intencoes.map((a) => ({ id: a.id, nome: a.nome, icone: a.icone, para: `/business/area/${a.id}` }))];
  const ativo = (id: string) => (id === "inicio" ? local.pathname === "/business" || local.pathname === "/business/" : local.pathname.startsWith(`/business/area/${id}`));
  return (
    <>
      <nav aria-label="Menu principal" className="sticky top-16 hidden h-[calc(100vh-4rem)] flex-col gap-1 border-r border-borda bg-elevado/40 p-3 lg:flex">
        {itens.map((i) => (
          <Link
            key={i.id}
            to={i.para}
            className={clsx("flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14.5px] font-semibold", ativo(i.id) ? "bg-marca text-marca-texto" : "text-texto hover:bg-elevado")}
          >
            <i.icone className="h-[18px] w-[18px]" />
            {i.nome}
          </Link>
        ))}
      </nav>
      <nav aria-label="Menu principal" className="fixed inset-x-0 bottom-0 z-30 grid border-t border-borda bg-superficie pb-[max(6px,env(safe-area-inset-bottom))] pt-1.5 lg:hidden" style={{ gridTemplateColumns: `repeat(${itens.length}, minmax(0, 1fr))` }}>
        {itens.map((i) => (
          <Link key={i.id} to={i.para} className={clsx("flex flex-col items-center gap-0.5 py-1 text-[11px] font-semibold", ativo(i.id) ? "text-destaque" : "text-suave")}>
            <i.icone className="h-5 w-5" />
            {i.nome}
          </Link>
        ))}
      </nav>
    </>
  );
}
