import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, useLocation, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { Armchair, Boxes, Briefcase, ChefHat, ChevronDown, LayoutDashboard, LogOut, Menu, MessagesSquare, PackageCheck, Smartphone, X, Radio, ClipboardList, ShieldCheck, Wallet } from "lucide-react";
import { PainelAutorizacoes, useAutorizacoes } from "@/lib/autorizacoes";
import { usePermissoesJob } from "./permissoes";
import { MensagensEstab } from "@/business/Mensagens";
import { EstoqueEquipe } from "./EstoqueEquipe";
import { Marca } from "@/components/Marca";
import { Carregando } from "@/components/Carregando";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { PortaSistema } from "@/components/PortaSistema";
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
  { id: "caixa", nome: "Caixa", descricao: "Receber, fechar contas e vender no balcão", icone: Wallet, codigo: "T7005" },
  { id: "preparo", nome: "Preparo", descricao: "Cozinha e bar", icone: ChefHat, codigo: "T7002" },
  { id: "entregas", nome: "Entregas", descricao: "Cumim: levar e confirmar", icone: PackageCheck, codigo: "T7003" },
  { id: "estoque", nome: "Estoque", descricao: "Saldos dos locais e transferências", icone: Boxes, codigo: "T4004" },
  { id: "mensagens", nome: "Mensagens", descricao: "Responder os clientes pelo chat", icone: MessagesSquare, codigo: "T2001" },
  { id: "ao-vivo", nome: "Chat ao vivo", descricao: "Moderar o chat da noite", icone: Radio, codigo: "T2002" },
  { id: "portaria", nome: "Portaria", descricao: "Conferir as listas de presença", icone: ClipboardList, codigo: "T5005" },
  { id: "geral", nome: "Supervisão", descricao: "Autorizações, ocorrências e visão da operação", icone: LayoutDashboard },
];

/** RoVibes Job: aplicativo de trabalho da equipe, com telas por função. */
export function JobLayout() {
  return (
    <PortaSistema produto="Job">
      <BusinessProvider>
        <Job />
      </BusinessProvider>
    </PortaSistema>
  );
}

function Job() {
  const { modulo } = useParams();
  const negocio = useBusiness();
  const perm = usePermissoesJob();
  const [menu, setMenu] = useState(false);
  const [pedidos, setPedidos] = useState(false);
  const [aviso, setAviso] = useState("");
  const auts = useAutorizacoes(negocio.atual?.estabelecimento_id, (a) =>
    setAviso(`${a.resumo}: ${a.situacao === "aprovada" ? "aprovado" : a.situacao === "recusada" ? `recusado${a.resposta ? ` (${a.resposta})` : ""}` : a.situacao}.`),
  );
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 8000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  useEffect(() => {
    document.title = "RoVibes Job";
  }, []);

  if (negocio.carregando) return <Carregando />;
  const atual = negocio.atual;
  // Supervisão: quem tem alguma ação sensível (gerente, líder de setor, caixa com desconto...).
  const meus = MODULOS.filter((m) => (m.codigo ? negocio.temAcesso(porCodigo(m.codigo)!) : perm.supervisor));
  const pendentesParaMim = auts.paraMim.length;

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
                    {v.estabelecimento.nome}{v.papel === "suporte" ? " (suporte)" : ""}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-2.5 top-2.5 h-4 w-4 text-suave" />
            </label>
          ) : (
            <span className="hidden max-w-[180px] truncate text-sm font-medium sm:block">{atual.estabelecimento.nome}</span>
          )}
          {(pendentesParaMim > 0 || auts.meusPendentes.length > 0) && (
            <button
              onClick={() => setPedidos(true)}
              className={clsx("relative inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold", pendentesParaMim ? "bg-alerta/15 text-alerta" : "bg-elevado text-suave")}
              aria-label="Pedidos de autorização"
            >
              <ShieldCheck className="h-4 w-4" />
              {pendentesParaMim || auts.meusPendentes.length}
            </button>
          )}
          <button onClick={() => setMenu(true)} className="rounded-full p-2 hover:bg-elevado" aria-label="Menu">
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      <main className={clsx("flex-1 px-4 py-4", meus.length > 1 && "pb-24")}>
        {!ativo ? (
          meus.length === 0 ? (
            <Vazio titulo="Nenhuma função liberada" texto="Peça ao gerente para escolher a sua função (Garçom, Caixa, Barman, Cozinha...) em Equipe e permissões, no Business." />
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
        ) : ativo.id === "caixa" ? (
          <Garcom key={`caixa-${atual.estabelecimento_id}`} estab={atual.estabelecimento_id} modo="caixa" />
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
      {aviso && (
        <p role="status" className="surgir fixed inset-x-4 top-16 z-[80] mx-auto max-w-md rounded-cartao border border-borda bg-superficie px-4 py-3 text-sm shadow-lg" onClick={() => setAviso("")}>
          {aviso}
        </p>
      )}
      {pedidos && (
        <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label="Pedidos de autorização" onClick={() => setPedidos(false)}>
          <div className="folha max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie p-4 pb-[max(16px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="font-semibold">Pedidos de autorização</h2>
              <button onClick={() => setPedidos(false)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <PainelAutorizacoes estab={atual.estabelecimento_id} compacto />
          </div>
        </div>
      )}
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
              navegar("/job");
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
    </div>
  );
}
