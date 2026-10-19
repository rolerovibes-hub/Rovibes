import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { Armchair, Boxes, Briefcase, ChefHat, ChevronDown, LayoutDashboard, LogOut, Menu, MessagesSquare, PackageCheck, Smartphone, X, Radio, ClipboardList } from "lucide-react";
import { MensagensEstab } from "@/business/Mensagens";
import { EstoqueEquipe } from "./EstoqueEquipe";
import { Marca } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { ChatAoVivo } from "@/business/ChatAoVivo";
import { Portaria } from "./Portaria";
import { BusinessProvider, NOME_PAPEL, useBusiness } from "@/lib/acessos";
import { porCodigo } from "@/lib/catalogo";
import { Garcom } from "./Garcom";
import { FilaPreparo } from "./Preparo";
import { FilaEntregas } from "./Entregas";
import { VisaoGeral } from "./Geral";

interface Modulo {
  id: string;
  nome: string;
  descricao: string;
  icone: typeof Armchair;
  codigo?: string;
}

const MODULOS: Modulo[] = [
  { id: "garcom", nome: "Mesas", descricao: "Garçom: mesas, venda e comandas", icone: Armchair, codigo: "T7001" },
  { id: "preparo", nome: "Preparo", descricao: "Cozinha e bar", icone: ChefHat, codigo: "T7002" },
  { id: "entregas", nome: "Entregas", descricao: "Cumim: levar e confirmar", icone: PackageCheck, codigo: "T7003" },
  { id: "estoque", nome: "Estoque", descricao: "Saldos dos locais e transferências", icone: Boxes, codigo: "T4004" },
  { id: "mensagens", nome: "Mensagens", descricao: "Responder os clientes pelo chat", icone: MessagesSquare, codigo: "T2001" },
  { id: "ao-vivo", nome: "Chat ao vivo", descricao: "Moderar o chat da noite", icone: Radio, codigo: "T2002" },
  { id: "portaria", nome: "Portaria", descricao: "Conferir as listas de presença", icone: ClipboardList, codigo: "T5005" },
  { id: "geral", nome: "Supervisão", descricao: "Ocorrências, atrasos e visão da operação", icone: LayoutDashboard },
];

/** RoVibes Job: aplicativo de trabalho da equipe, com telas por função. */
export function JobLayout() {
  const { carregando, sessao } = useSessao();
  const local = useLocation();
  if (carregando) return <Carregando />;
  if (!sessao) return <Navigate to={`/entrar?voltar=${encodeURIComponent(local.pathname)}`} replace />;
  return (
    <BusinessProvider>
      <Job />
    </BusinessProvider>
  );
}

function Job() {
  const { modulo } = useParams();
  const negocio = useBusiness();
  const { ehAdmin } = useSessao();
  const [menu, setMenu] = useState(false);

  useEffect(() => {
    document.title = "RoVibes Job";
  }, []);

  if (negocio.carregando) return <Carregando />;
  const atual = negocio.atual;
  const gerencia = ehAdmin || atual?.papel === "proprietario" || atual?.papel === "gestor" || negocio.temAcesso(porCodigo("T7004")!);
  const meus = MODULOS.filter((m) => (m.codigo ? negocio.temAcesso(porCodigo(m.codigo)!) : gerencia));

  if (!atual) {
    return (
      <Vazio titulo="Você ainda não faz parte de uma equipe" texto="Peça ao responsável pelo estabelecimento para adicionar você pelo e-mail da sua conta RoVibes." />
    );
  }
  if (!modulo) {
    if (meus.length === 1) return <Navigate to={`/job/${meus[0].id}`} replace />;
  }
  const ativo = meus.find((m) => m.id === modulo);
  if (modulo && !ativo) return <Navigate to="/job" replace />;

  return (
    <div className="mx-auto flex min-h-screen max-w-6xl flex-col">
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-borda bg-fundo/95 px-4 backdrop-blur">
        <Link to="/job" aria-label="Início do RoVibes Job">
          <Marca complemento="Job" />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          {negocio.vinculos.length > 1 ? (
            <label className="relative">
              <span className="sr-only">Estabelecimento</span>
              <select
                value={atual.estabelecimento_id}
                onChange={(e) => negocio.escolherEstabelecimento(e.target.value)}
                className="h-9 max-w-[160px] appearance-none truncate rounded-lg border border-borda bg-superficie pl-3 pr-8 text-sm font-medium"
              >
                {negocio.vinculos.map((v) => (
                  <option key={v.estabelecimento_id} value={v.estabelecimento_id}>
                    {v.estabelecimento.nome}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-suave" />
            </label>
          ) : (
            <span className="hidden max-w-[180px] truncate text-sm font-medium sm:block">{atual.estabelecimento.nome}</span>
          )}
          <button onClick={() => setMenu(true)} className="rounded-full p-2 hover:bg-elevado" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className={clsx("flex-1 px-4 py-4", meus.length > 1 && "pb-24")}>
        {!ativo ? (
          meus.length === 0 ? (
            <Vazio titulo="Nenhuma função liberada" texto="Peça ao gestor para liberar Mesas e comandas, Fila de pedidos ou Entregas para você na tela Equipe e permissões." />
          ) : (
            <div className="space-y-3">
              <h1 className="text-lg font-semibold">O que você vai fazer agora?</h1>
              <ul className="grid gap-3 sm:grid-cols-2">
                {meus.map((m) => (
                  <li key={m.id}>
                    <Link to={`/job/${m.id}`} className="cartao flex items-center gap-4 p-4 hover:bg-elevado">
                      <span className="flex h-12 w-12 items-center justify-center rounded-lg bg-destaque-suave text-destaque">
                        <m.icone className="h-6 w-6" />
                      </span>
                      <span>
                        <span className="block font-semibold">{m.nome}</span>
                        <span className="block text-sm text-suave">{m.descricao}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          )
        ) : ativo.id === "garcom" ? (
          <Garcom key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        ) : ativo.id === "preparo" ? (
          <FilaPreparo key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        ) : ativo.id === "entregas" ? (
          <FilaEntregas key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        ) : ativo.id === "estoque" ? (
          <EstoqueEquipe key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        ) : ativo.id === "portaria" ? (
          <Portaria key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        ) : ativo.id === "ao-vivo" ? (
          <ChatAoVivo key={atual.estabelecimento_id} estab={atual.estabelecimento_id} nomeEstab={atual.estabelecimento.nome} />
        ) : ativo.id === "mensagens" ? (
          <MensagensEstab
            key={atual.estabelecimento_id}
            estab={atual.estabelecimento_id}
            nomeEstab={atual.estabelecimento.nome}
            altura={meus.length > 1 ? "h-[calc(100dvh-180px)]" : "h-[calc(100dvh-100px)]"}
          />
        ) : (
          <VisaoGeral key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />
        )}
      </main>

      {meus.length > 1 && (
        <nav aria-label="Funções" className="pb-seguro fixed inset-x-0 bottom-0 z-30 mx-auto max-w-6xl border-t border-borda bg-superficie">
          <ul className="flex">
            {meus.map((m) => (
              <li key={m.id} className="flex-1">
                <NavLink
                  to={`/job/${m.id}`}
                  className={({ isActive }) => clsx("flex flex-col items-center gap-1 py-2.5 text-[12px]", isActive ? "font-semibold text-destaque" : "text-suave")}
                >
                  <m.icone className="h-[22px] w-[22px]" />
                  {m.nome}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {menu && <MenuJob fechar={() => setMenu(false)} />}
    </div>
  );
}

function MenuJob({ fechar }: { fechar: () => void }) {
  const { perfil, sair } = useSessao();
  const { atual } = useBusiness();
  const navegar = useNavigate();
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="Menu">
      <div className="absolute inset-0 bg-black/40" onClick={fechar} />
      <aside className="absolute right-0 top-0 flex h-full w-full max-w-xs flex-col border-l border-borda bg-superficie">
        <div className="flex items-center justify-between border-b border-borda px-5 py-4">
          <div className="min-w-0">
            <p className="truncate font-semibold">{perfil?.nome}</p>
            {atual && <p className="truncate text-sm text-suave">{atual.cargo || NOME_PAPEL[atual.papel]} · {atual.estabelecimento.nome}</p>}
          </div>
          <button onClick={fechar} className="botao h-8 w-8 px-0" aria-label="Fechar">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 space-y-3 px-5 py-5">
          <SeletorTema />
          <Link to="/" className="botao w-full" onClick={fechar}>
            <Smartphone className="h-4 w-4" />
            Abrir o RoVibes App
          </Link>
          <Link to="/business" className="botao w-full" onClick={fechar}>
            <Briefcase className="h-4 w-4" />
            Abrir o RoVibes Business
          </Link>
        </div>
        <div className="border-t border-borda px-5 py-4">
          <button
            className="botao w-full text-perigo"
            onClick={async () => {
              await sair();
              navegar("/entrar?voltar=/job");
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

function Vazio({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div className="px-6 py-20 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Briefcase className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-suave">{texto}</p>
      <Link to="/" className="botao mt-6">
        Voltar ao RoVibes
      </Link>
    </div>
  );
}
