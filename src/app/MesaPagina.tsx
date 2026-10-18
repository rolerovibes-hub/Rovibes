import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Armchair, ScanLine } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { codigoDaMesa } from "@/lib/salao";

interface MesaInfo {
  estabelecimento_id: string;
  estabelecimento: string;
  numero: string;
  area: string | null;
}

/** Aberta pelo QR code da mesa: confirma e entra na comanda. */
export function MesaPagina() {
  const { codigo = "" } = useParams();
  const navegar = useNavigate();
  const [mesa, setMesa] = useState<MesaInfo | null | undefined>(undefined);
  const [erro, setErro] = useState("");
  const [entrando, setEntrando] = useState(false);

  useEffect(() => {
    supabase.rpc("mesa_pelo_codigo", { p_codigo: codigoDaMesa(codigo) }).then(({ data }) => setMesa(((data ?? []) as MesaInfo[])[0] ?? null));
  }, [codigo]);

  const entrar = async () => {
    setEntrando(true);
    setErro("");
    const { data, error } = await supabase.rpc("entrar_na_mesa", { p_codigo: codigoDaMesa(codigo) });
    setEntrando(false);
    if (error) return setErro(mensagemDeErro(error));
    navegar(`/comanda/${data as string}`, { replace: true });
  };

  if (mesa === undefined) return <Carregando />;
  if (!mesa) {
    return (
      <div className="px-6 py-20 text-center">
        <ScanLine className="mx-auto h-8 w-8 text-suave" />
        <p className="mt-3 font-medium">Mesa não encontrada</p>
        <p className="mt-1 text-sm text-suave">O QR code pode estar desatualizado. Peça ajuda à equipe.</p>
        <Link to="/" className="botao mt-5">
          Voltar ao Descobrir
        </Link>
      </div>
    );
  }

  return (
    <div className="px-6 py-16 text-center">
      <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Armchair className="h-7 w-7" />
      </span>
      <p className="mt-5 text-sm text-suave">{mesa.estabelecimento}</p>
      <h1 className="text-2xl font-semibold">Mesa {mesa.numero}</h1>
      {mesa.area && <p className="text-sm text-suave">{mesa.area}</p>}
      <p className="mx-auto mt-4 max-w-xs text-sm text-suave">
        Entre na mesa para pedir pelo cardápio. Quem estiver com você e ler o mesmo QR entra na mesma comanda. A conta é paga no caixa.
      </p>
      <button className="botao-principal mt-6 h-11 w-full max-w-xs rounded-full text-[15px]" disabled={entrando} onClick={() => void entrar()}>
        {entrando ? "Entrando..." : "Entrar na mesa"}
      </button>
      {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
    </div>
  );
}
