import { useEffect } from "react";
import { Link, Navigate, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, LogOut } from "lucide-react";
import { Simbolo } from "@/components/Marca";
import { Avatar } from "@/components/Avatar";
import { Carregando } from "@/components/Carregando";
import { porCodigo } from "@/lib/catalogo";
import { areaPorId, ondeFica } from "@/lib/areasNegocio";
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
          {area ? (
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => navegar("/business")} className="botao h-9 w-9 shrink-0 px-0" aria-label="Voltar à Área de Trabalho">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-white" style={{ backgroundColor: area.cor }}>
                <area.icone className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-[15px] font-semibold">{area.nome}</h1>
                <p className="truncate text-[13px] text-suave">{[parte, negocio.atual?.estabelecimento.nome].filter(Boolean).join(" · ")}</p>
              </div>
            </div>
          ) : (
            <Link to="/business" className="flex min-w-0 items-center gap-3" aria-label="RoVibes Business, Área de Trabalho">
              <Simbolo className="h-8" />
              <span className="min-w-0 leading-tight">
                <span className="block truncate text-[17px] font-semibold">Área de Trabalho</span>
                <span className="block truncate text-[13px] text-suave">
                  RoVibes Business{negocio.atual ? ` · ${negocio.atual.estabelecimento.nome}` : ""}
                </span>
              </span>
            </Link>
          )}

          <div className="ml-auto flex items-center gap-2">
            {negocio.vinculos.length > 0 && (
              <label className="relative hidden sm:block">
                <span className="sr-only">Estabelecimento</span>
                <select
                  value={negocio.atual?.estabelecimento_id ?? ""}
                  onChange={(e) => negocio.escolherEstabelecimento(e.target.value)}
                  className="h-9 max-w-[220px] appearance-none truncate rounded-lg border border-borda bg-superficie pl-3 pr-8 text-sm font-medium hover:bg-elevado"
                >
                  {negocio.vinculos.map((v) => (
                    <option key={v.estabelecimento_id} value={v.estabelecimento_id}>
                      {v.estabelecimento.nome}{v.papel === "suporte" ? " (suporte)" : ""}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-suave" />
              </label>
            )}
            <button onClick={() => navegar("/business/area/pessoas-equipe/G1002")} className="rounded-full ring-2 ring-transparent hover:ring-marca" aria-label="Meu perfil" title="Meu perfil">
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

      <main className="w-full px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
        {semEstabelecimento ? <p className="cartao mx-auto max-w-md p-6 text-center text-sm text-suave">Este usuário não está ativo em nenhum estabelecimento.</p> : <Outlet />}
      </main>

    </div>
  );
}
