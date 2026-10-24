import { ReactNode, useEffect, useState } from "react";
import { LogOut } from "lucide-react";
import { Carregando } from "./Carregando";
import { EntrarSistema } from "./EntrarSistema";
import { AcessoGestao } from "./AcessoGestao";
import { Simbolo } from "./Marca";
import { sessaoDoSistema, supabase } from "@/lib/supabase";
import { useSessao } from "@/lib/sessao";

/**
 * Porta do Business e do Job: só entra usuário do sistema do estabelecimento (ou a equipe RoVibes).
 * A conta pessoal do app não acessa: são coisas separadas.
 */
export function PortaSistema({ produto, children }: { produto: "Business" | "Job"; children: ReactNode }) {
  const { carregando, sessao, sair } = useSessao();
  const [acesso, setAcesso] = useState<"verificando" | "liberado" | "pessoal" | "codigo">("verificando");
  const [vez, setVez] = useState(0);
  const usuario = sessao?.user.id;

  useEffect(() => {
    if (!usuario) return setAcesso("verificando");
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.rpc("meu_acesso_sistema");
      const d = data as { conta_sistema?: boolean; admin?: boolean } | null;
      // Banco ainda sem a atualização 047: segue como antes.
      if (error || d?.conta_sistema || d?.admin) return vivo && setAcesso("liberado");
      // Equipe RoVibes (Gestão) que ainda não confirmou o código.
      const g = await supabase.rpc("meu_acesso_gestao");
      const gd = g.data as { gestao?: boolean; confirmada?: boolean } | null;
      if (vivo) setAcesso(gd?.gestao && !gd.confirmada ? "codigo" : "pessoal");
    })();
    return () => {
      vivo = false;
    };
  }, [usuario, vez]);

  if (!sessaoDoSistema || carregando) return <Carregando />;
  if (!sessao) return <EntrarSistema produto={produto} />;
  if (acesso === "verificando") return <Carregando />;
  if (acesso === "codigo")
    return (
      <div className="flex min-h-screen items-center justify-center bg-fundo px-4">
        <div className="cartao w-full max-w-sm p-6">
          <AcessoGestao soCodigo aoConfirmar={() => setVez((v) => v + 1)} />
        </div>
      </div>
    );
  if (acesso === "pessoal") {
    return (
      <div className="flex min-h-screen items-center justify-center bg-fundo px-4">
        <div className="cartao w-full max-w-sm p-6 text-center">
          <Simbolo className="mx-auto h-10" />
          <p className="mt-4 font-semibold">Conta pessoal</p>
          <p className="mt-1 text-sm text-suave">Entre com o usuário do sistema do estabelecimento.</p>
          <button className="botao-principal mt-5 h-11 w-full" onClick={() => void sair()}>
            <LogOut className="h-4 w-4" />
            Trocar de usuário
          </button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
}
