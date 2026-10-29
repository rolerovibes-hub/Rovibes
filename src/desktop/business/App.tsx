import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { LogOut } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { PortaSistema } from "@/components/PortaSistema";
import { BusinessProvider, useBusiness } from "@/lib/acessos";
import { useSessao } from "@/lib/sessao";
import { usePermissoesJob } from "@/job/permissoes";
import { Estacao, NOME_FUNCAO, useEstacao } from "../estacao";
import { tituloJanela } from "../nativo";
import { EntrarDesktop } from "./Entrar";
import { ConfigurarEstacao } from "./Estacao";
import { Caixa } from "./Caixa";
import { Cozinha } from "./Cozinha";
import { Escritorio } from "./Escritorio";
import { useAtalhos } from "./Moldura";

/** RoVibes Business para computador: entra com o usuário do sistema e abre na função deste computador. */
export function AppDesktop() {
  const { carregando, sessao } = useSessao();
  if (carregando) return <Carregando />;
  if (!sessao) return <EntrarDesktop />;
  return (
    <PortaSistema produto="Business">
      <BusinessProvider>
        <Area />
      </BusinessProvider>
    </PortaSistema>
  );
}

const PADRAO: Estacao = { funcao: "escritorio", nome: "", impressora: null, papel: 80, setor: "todos", imprimirPedidos: false, som: true };

function Area() {
  const negocio = useBusiness();
  const perm = usePermissoesJob();
  const { sair } = useSessao();
  const { estacao, salvar } = useEstacao();
  const [configurando, setConfigurando] = useState(false);
  const local = useLocation();
  useAtalhos({ "Ctrl+U": () => void sair() });

  // Janela extra (ex.: cozinha no segundo monitor) abre direto naquela função.
  const janela = local.pathname.match(/^\/janela\/(caixa|cozinha)/)?.[1] as "caixa" | "cozinha" | undefined;
  const e: Estacao | null = janela ? { ...(estacao ?? PADRAO), funcao: janela, nome: estacao?.nome || NOME_FUNCAO[janela] } : estacao;

  useEffect(() => {
    if (e && negocio.atual) tituloJanela(`RoVibes Business · ${negocio.atual.estabelecimento.nome} · ${e.nome || NOME_FUNCAO[e.funcao]}`);
  }, [e, negocio.atual]);

  if (negocio.carregando) return <Carregando />;
  const atual = negocio.atual;
  if (!atual)
    return (
      <Aviso texto="Este usuário não está ligado a nenhum estabelecimento." sair={() => void sair()} />
    );
  const chefe = atual.papel !== "equipe";
  if (!e) return <ConfigurarEstacao atual={null} salvar={salvar} />;
  const configurar = chefe && !janela ? () => setConfigurando(true) : undefined;

  let tela;
  if (e.funcao === "caixa") tela = perm.caixa ? <Caixa estacao={e} configurar={configurar} /> : <Aviso texto="Seu usuário não tem acesso ao Caixa." sair={() => void sair()} />;
  else if (e.funcao === "cozinha")
    tela = perm.preparo ? <Cozinha estacao={e} salvar={(x) => !janela && salvar(x)} configurar={configurar} /> : <Aviso texto="Seu usuário não tem acesso à fila de preparo." sair={() => void sair()} />;
  else tela = <Escritorio estacao={e} configurar={configurar} />;

  return (
    <>
      {tela}
      {configurando && (
        <ConfigurarEstacao
          atual={estacao}
          salvar={(x) => {
            salvar(x);
            setConfigurando(false);
          }}
          fechar={() => setConfigurando(false)}
        />
      )}
    </>
  );
}

function Aviso({ texto, sair }: { texto: string; sair: () => void }) {
  return (
    <div className="flex h-screen items-center justify-center bg-fundo text-texto">
      <div className="cartao max-w-sm p-8 text-center">
        <p className="font-semibold">{texto}</p>
        <button className="botao-principal mt-5 h-11 w-full" onClick={sair}>
          <LogOut className="h-4 w-4" />
          Trocar usuário
        </button>
      </div>
    </div>
  );
}
