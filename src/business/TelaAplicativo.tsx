import { useEffect } from "react";
import { TelaUniversal } from "./TelaUniversal";
import { Navigate, useParams } from "react-router-dom";
import { Download, FilePlus2, FolderOpen, Lock, Pencil, Printer, Search, Trash2 } from "lucide-react";
import { Aplicativo } from "@/lib/catalogo";
import { linkDoApp } from "@/lib/areasNegocio";
import { useBusiness } from "@/lib/acessos";
import { AprovacaoEstabelecimentos } from "./AprovacaoEstabelecimentos";
import { PerfilEstabelecimento } from "./PerfilEstabelecimento";
import { Cardapio } from "./Cardapio";
import { Eventos } from "./Eventos";
import { VibesCategorias } from "./VibesCategorias";
import { Organizacao } from "@/gestao/Organizacao";
import { ListaSituacoes } from "@/gestao/Situacoes";
import { SaudePlataforma } from "@/gestao/Central";
import { BaseConhecimento, ContasEstabelecimentos, FichasEstabelecimentos, InteligenciaConfig, ModoSuporteAtivo } from "@/gestao/Partes";
import { AjudaRoVibes } from "./AjudaRoVibes";
import { AREA_DAS_SITUACOES } from "@/lib/areasNegocio";

function SaudeComSituacoes() {
  return (
    <div className="space-y-4">
      <SaudePlataforma />
      <ListaSituacoes area="operacao" titulo="Situações" />
    </div>
  );
}
import { StatusAoVivo } from "./StatusAoVivo";
import { Publicacoes } from "./Publicacoes";
import { Stories } from "./Stories";
import { Indicadores } from "./Indicadores";
import { MeuPerfil } from "./MeuPerfil";
import { Denuncias } from "./Denuncias";
import { MensagensEstab } from "./Mensagens";
import { Pagamentos } from "./Pagamentos";
import { Produtos } from "./Produtos";
import { BibliotecaAdmin } from "./BibliotecaAdmin";
import { MusicasAdmin } from "./MusicasAdmin";
import { EventosPessoasAdmin } from "./EventosPessoasAdmin";
import { ChatAoVivo } from "./ChatAoVivo";
import { Portaria } from "@/job/Portaria";
import { EstoqueEquipe } from "@/job/EstoqueEquipe";
import { Promocoes } from "./Promocoes";
import { Ingressos } from "./Ingressos";
import { ProgramaPontos } from "./ProgramaPontos";
import { Estoque } from "./Estoque";
import { Equipe } from "./Equipe";
import { Salao } from "./Salao";
import { FilaPreparo } from "@/job/Preparo";
import { FilaEntregas } from "@/job/Entregas";
import { VisaoGeral } from "@/job/Geral";
import { Garcom } from "@/job/Garcom";
import { Link } from "react-router-dom";

// Colunas previstas da consulta de cada aplicativo (o conteúdo chega em cada fase).
const COLUNAS: Record<string, string[]> = {
  G1001: ["Campo", "Valor", "Atualizado em"],
  T2001: ["Conversa", "Última mensagem", "Quando"],
  G3001: ["Pessoa", "Cargo", "Aplicativos", "Situação"],
  G4001: ["Item", "Categoria", "Preço", "Disponível"],
  G4002: ["Produto", "Local", "Saldo", "Validade"],
  G5001: ["Evento", "Data", "Confirmados", "Situação"],
  T5002: ["Evento", "Check-ins", "Movimento", "Atualizado"],
  G5003: ["Promoção", "Tipo", "Vigência", "Resgates"],
  G5004: ["Ingresso", "Evento", "Vendidos", "Preço"],
  G6001: ["Publicação", "Publicada em", "Brindes", "Situação"],
  G6002: ["Story", "Expira em", "Visualizações"],
  T7001: ["Mesa", "Zona", "Pessoas", "Situação"],
  T7002: ["Pedido", "Mesa", "Itens", "Situação"],
  C8001: ["Indicador", "Hoje", "7 dias", "30 dias"],
  G9001: ["Cliente", "Pontos", "Último ganho"],
  A1001: ["Estabelecimento", "Responsável", "Enviado em", "Situação"],
  A1002: ["Estabelecimento", "Bairro", "Situação"],
  A1003: ["Denúncia", "Sobre", "Recebida em", "Situação"],
  A1004: ["Nome", "Tipo", "Em uso"],
};

/** Link antigo /business/app/:codigo: leva para a parte certa da área de negócio. */
export function TelaAplicativo() {
  const { codigo = "" } = useParams();
  return <Navigate to={linkDoApp(codigo)} replace />;
}

/** Conteúdo de uma parte (antigo app) dentro da área de negócio. */
export function ConteudoApp({ app, liberado: forcado }: { app: Aplicativo; liberado?: boolean }) {
  const acessos = useBusiness();
  const liberado = forcado ?? acessos.temAcesso(app);

  useEffect(() => {
    if (liberado) acessos.registrarUso(app.codigo);
    // registra uma vez por abertura
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [app.codigo]);

  if (!liberado) {
    const solicitado = acessos.foiSolicitado(app.codigo);
    return (
      <div className="cartao mx-auto max-w-md p-8 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-elevado text-suave">
          <Lock className="h-5 w-5" />
        </span>
        <h2 className="mt-4 text-lg font-semibold">Sem acesso</h2>
        {solicitado ? (
          <p className="mt-6 text-sm font-medium text-alerta">Acesso solicitado. Aguarde a resposta.</p>
        ) : (
          <button onClick={() => acessos.solicitarAcesso(app.codigo)} className="botao-principal mt-6">
            Solicitar acesso
          </button>
        )}
      </div>
    );
  }

  if (app.codigo === "G1002") return <MeuPerfil />;
  if (app.codigo === "A1001") return <AprovacaoEstabelecimentos key="pendente" />;
  if (app.codigo === "A1002") return <AprovacaoEstabelecimentos key="todas" filtroInicial="todas" />;
  if (app.codigo === "A1004") return <VibesCategorias />;
  if (app.codigo === "A1003") return <Denuncias />;
  if (app.codigo === "A1005") return <BibliotecaAdmin />;
  if (app.codigo === "A1006") return <MusicasAdmin />;
  if (app.codigo === "A1007") return <EventosPessoasAdmin />;
  if (app.codigo === "A1008") return <Organizacao />;
  if (AREA_DAS_SITUACOES[app.codigo]) return <ListaSituacoes key={app.codigo} area={AREA_DAS_SITUACOES[app.codigo]} />;
  if (app.codigo === "S2201") return <SaudeComSituacoes />;
  if (app.codigo === "S2202") return <ModoSuporteAtivo />;
  if (app.codigo === "S2203") return <FichasEstabelecimentos />;
  if (app.codigo === "S2204") return <ContasEstabelecimentos />;
  if (app.codigo === "S2205") return <BaseConhecimento />;
  if (app.codigo === "S2206") return <InteligenciaConfig />;
  if (app.codigo === "G1004") return <AjudaRoVibes />;
  if (app.codigo === "G1003") return <Pagamentos />;
  if (app.codigo === "G4003") return <Produtos />;
  if (app.codigo === "T4004") {
    const estab = acessos.atual?.estabelecimento_id;
    if (!estab) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return (
      <div className="mx-auto max-w-3xl">
        <EstoqueEquipe estab={estab} />
      </div>
    );
  }
  if (app.codigo === "T5005") {
    const atual = acessos.atual;
    if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return <Portaria key={atual.estabelecimento_id} estab={atual.estabelecimento_id} />;
  }
  if (app.codigo === "T2002") {
    const atual = acessos.atual;
    if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return <ChatAoVivo key={atual.estabelecimento_id} estab={atual.estabelecimento_id} nomeEstab={atual.estabelecimento.nome} />;
  }
  if (app.codigo === "T2001") {
    const atual = acessos.atual;
    if (!atual) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return <MensagensEstab key={atual.estabelecimento_id} estab={atual.estabelecimento_id} nomeEstab={atual.estabelecimento.nome} />;
  }
  if (app.codigo === "G1001") return <PerfilEstabelecimento />;
  if (app.codigo === "G4001") return <Cardapio />;
  if (app.codigo === "G5001") return <Eventos />;
  if (app.codigo === "T5002") return <StatusAoVivo />;
  if (app.codigo === "G6001") return <Publicacoes />;
  if (app.codigo === "G6002") return <Stories />;
  if (app.codigo === "C8001") return <Indicadores />;
  if (app.codigo === "G5003") return <Promocoes />;
  if (app.codigo === "G5004") return <Ingressos />;
  if (app.codigo === "G9001") return <ProgramaPontos />;
  if (app.codigo === "G3001") return <Equipe />;
  if (app.codigo === "G4002") return <Estoque />;
  if (app.codigo === "T7001") return <Salao />;
  if (app.codigo === "T7004") {
    const estab = acessos.atual?.estabelecimento_id;
    if (!estab) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return (
      <div className="mx-auto max-w-6xl">
        <VisaoGeral estab={estab} />
      </div>
    );
  }
  if (app.codigo === "T7005") {
    const estab = acessos.atual?.estabelecimento_id;
    if (!estab) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex justify-end">
          <Link to="/job/caixa" className="botao">
            Abrir no Job
          </Link>
        </div>
        <Garcom key={`caixa-${estab}`} estab={estab} modo="caixa" />
      </div>
    );
  }
  if (app.codigo === "T7002" || app.codigo === "T7003") {
    const estab = acessos.atual?.estabelecimento_id;
    if (!estab) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
    return (
      <div className="mx-auto max-w-6xl space-y-4">
        <div className="flex justify-end">
          <Link to={app.codigo === "T7002" ? "/job/preparo" : "/job/entregas"} className="botao">
            Abrir no Job
          </Link>
        </div>
        {app.codigo === "T7002" ? <FilaPreparo estab={estab} /> : <FilaEntregas estab={estab} />}
      </div>
    );
  }

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1 xl:col-span-1" disabled title={`Disponível na fase ${app.fase}`}>
            <FilePlus2 className="h-4 w-4" />
            Novo
          </button>
          <button className="botao" disabled title="Selecione uma linha">
            <FolderOpen className="h-4 w-4" />
            Abrir
          </button>
          <button className="botao" disabled title="Selecione uma linha">
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled>
            <Printer className="h-4 w-4" />
            Imprimir
          </button>
          <button className="botao" disabled>
            <Download className="h-4 w-4" />
            Exportar
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled title="Selecione uma linha">
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      <Consulta app={app} />
    </TelaUniversal>
  );
}

function Consulta({ app }: { app: Aplicativo }) {
  const colunas = COLUNAS[app.codigo] ?? ["Registro", "Situação"];
  return (
    <>
      <section className="cartao flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[220px] flex-1">
          <span className="rotulo mb-1 block">Buscar</span>
          <span className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
            <input disabled className="h-10 w-full rounded-lg border border-borda bg-fundo pl-9 pr-3 text-sm disabled:opacity-60" />
          </span>
        </label>
        <label className="w-44">
          <span className="rotulo mb-1 block">Situação</span>
          <select disabled className="h-10 w-full rounded-lg border border-borda bg-fundo px-3 text-sm disabled:opacity-60">
            <option>Todas</option>
          </select>
        </label>
      </section>

      <section className="cartao overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-borda bg-elevado/60">
              <tr>
                {colunas.map((c) => (
                  <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                    {c}
                  </th>
                ))}
              </tr>
            </thead>
          </table>
        </div>
        <div className="px-6 py-14 text-center">
          <app.icone className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nenhum registro ainda</p>
          <p className="mt-1 text-sm text-suave">
            {app.nome} entra na fase {app.fase} da construção.
          </p>
        </div>
      </section>
    </>
  );
}
