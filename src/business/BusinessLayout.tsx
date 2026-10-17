import { useEffect, useState } from "react";
import { Link, Navigate, Outlet, useLocation, useMatch, useNavigate } from "react-router-dom";
import { ArrowLeft, ChevronDown, LogOut, X } from "lucide-react";
import { Marca } from "@/components/Marca";
import { Avatar } from "@/components/Avatar";
import { SeletorTema } from "@/components/SeletorTema";
import { Carregando } from "@/components/Carregando";
import { porCodigo } from "@/lib/catalogo";
import { useSessao } from "@/lib/sessao";
import { BusinessProvider, NOME_PAPEL, useBusiness } from "@/lib/acessos";
import { CadastroEstabelecimento } from "./CadastroEstabelecimento";

export function BusinessLayout() {
  const { carregando, sessao } = useSessao();
  const local = useLocation();
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to={`/entrar?voltar=${encodeURIComponent(local.pathname)}`} replace />;
  return (
    <BusinessProvider>
      <Estrutura />
    </BusinessProvider>
  );
}

function Estrutura() {
  const { perfil, ehAdmin } = useSessao();
  const negocio = useBusiness();
  const rota = useMatch("/business/app/:codigo");
  const app = rota ? porCodigo(rota.params.codigo ?? "") : undefined;
  const navegar = useNavigate();
  const [perfilAberto, setPerfilAberto] = useState(false);
  const nome = perfil?.nome ?? "";

  useEffect(() => {
    document.title = app ? `${app.nome} · RoVibes Business` : "RoVibes Business";
  }, [app]);

  if (negocio.carregando) return <Carregando />;
  const semEstabelecimento = negocio.vinculos.length === 0 && !ehAdmin;

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-30 border-b border-borda bg-superficie/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:px-6">
          {app ? (
            <div className="flex min-w-0 items-center gap-3">
              <button onClick={() => navegar("/business")} className="botao h-9 w-9 shrink-0 px-0" aria-label="Voltar à Área de Trabalho">
                <ArrowLeft className="h-4 w-4" />
              </button>
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-destaque-suave text-destaque">
                <app.icone className="h-[18px] w-[18px]" />
              </span>
              <div className="min-w-0 leading-tight">
                <h1 className="truncate text-[15px] font-semibold">{app.nome}</h1>
                <p className="truncate text-[13px] text-suave">
                  <span className="codigo">{app.codigo}</span> · {app.area}
                </p>
              </div>
            </div>
          ) : (
            <Link to="/business" aria-label="RoVibes Business, Área de Trabalho">
              <Marca complemento="Business" />
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
                      {v.estabelecimento.nome}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-suave" />
              </label>
            )}
            <button onClick={() => setPerfilAberto(true)} className="rounded-full" aria-label="Abrir meu perfil">
              <Avatar nome={nome || "?"} tamanho="sm" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1440px] px-4 py-6 sm:px-6 sm:py-8">
        {semEstabelecimento ? <CadastroEstabelecimento /> : <Outlet />}
      </main>

      {perfilAberto && <PainelPerfil fechar={() => setPerfilAberto(false)} />}
    </div>
  );
}

function PainelPerfil({ fechar }: { fechar: () => void }) {
  const { perfil, email, ehAdmin, sair } = useSessao();
  const { atual } = useBusiness();
  const navegar = useNavigate();

  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);

  const funcao = atual ? `${atual.cargo || NOME_PAPEL[atual.papel]} · ${atual.estabelecimento.nome}` : ehAdmin ? "Administração RoVibes" : "";

  return (
    <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="Meu perfil">
      <div className="absolute inset-0 bg-black/40" onClick={fechar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-borda bg-superficie">
        <div className="flex items-center justify-between border-b border-borda px-5 py-4">
          <h2 className="font-semibold">Meu perfil</h2>
          <button onClick={fechar} className="botao h-8 w-8 px-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-6 overflow-y-auto px-5 py-5">
          <div className="flex items-center gap-4">
            <Avatar nome={perfil?.nome || "?"} tamanho="lg" />
            <div className="min-w-0">
              <p className="truncate font-semibold">{perfil?.nome}</p>
              {funcao && <p className="text-sm text-suave">{funcao}</p>}
              <p className="truncate text-sm text-suave">{email}</p>
            </div>
          </div>
          <section className="space-y-2">
            <h3 className="rotulo">Tema</h3>
            <SeletorTema />
          </section>
          <Link to="/business/app/G1002" onClick={fechar} className="botao w-full">
            Ver meu perfil
          </Link>
          <Link to="/" onClick={fechar} className="botao w-full">
            Abrir o RoVibes App
          </Link>
        </div>
        <div className="border-t border-borda px-5 py-4">
          <button
            className="botao w-full text-perigo"
            onClick={async () => {
              await sair();
              navegar("/entrar?voltar=/business");
            }}
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>
    </div>
  );
}
