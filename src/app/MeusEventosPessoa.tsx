import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, CalendarPlus, Ticket } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { reais } from "@/components/Formulario";
import { supabase } from "@/lib/supabase";
import { dataEvento, NOME_TIPO, TipoEventoPessoa } from "@/lib/eventosPessoa";

interface Linha {
  id: string;
  titulo: string;
  tipo: TipoEventoPessoa;
  inicio: string;
  situacao: string;
  suspenso: boolean;
  capa_url: string | null;
  vendidos: number;
  arrecadado: number;
  convidados: number;
}

/** Eventos que eu criei como anfitrião. */
export function MeusEventosPessoa() {
  const navegar = useNavigate();
  const [lista, setLista] = useState<Linha[] | null>(null);
  const [erro, setErro] = useState("");
  useEffect(() => {
    supabase.rpc("meus_eventos_pessoa").then(({ data, error }) => {
      if (error) setErro(/function|schema cache/i.test(error.message) ? "Falta aplicar a atualização 037 do banco." : error.message);
      setLista((data ?? []) as Linha[]);
    });
  }, []);

  return (
    <div className="mx-auto max-w-xl pb-10">
      <header className="flex items-center gap-2 px-2 py-2">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold">Meus eventos</h1>
        <Link to="/eventos/novo" className="botao-principal h-9 px-3 text-[13px]">
          <CalendarPlus className="h-4 w-4" />
          Criar
        </Link>
      </header>
      {erro && <p className="px-4 text-sm text-perigo">{erro}</p>}
      {lista === null ? (
        <Carregando />
      ) : lista.length === 0 ? (
        <div className="px-6 py-16 text-center">
          <p className="text-4xl">🍖🎂🥂</p>
          <p className="mt-3 font-medium">Crie o seu primeiro rolê</p>
          <p className="mt-1 text-sm text-suave">Churrasco colaborativo, aniversário, comemoração... você convida os amigos e recebe o valor dos ingressos.</p>
          <Link to="/eventos/novo" className="botao-principal mt-5 h-11 rounded-full px-6">
            Criar evento
          </Link>
        </div>
      ) : (
        <ul className="space-y-2 px-4">
          {lista.map((e) => (
            <li key={e.id}>
              <Link to={`/evento-pessoa/${e.id}`} className="cartao flex items-center gap-3 p-2.5 hover:bg-elevado">
                {e.capa_url ? (
                  <img src={e.capa_url} alt="" className="h-16 w-20 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-16 w-20 shrink-0 items-center justify-center rounded-lg bg-elevado text-2xl">{NOME_TIPO[e.tipo]?.emoji}</span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{e.titulo}</span>
                  <span className="block text-[13px] text-suave">{dataEvento(e.inicio)}</span>
                  <span className="flex items-center gap-2 text-[12px] text-suave">
                    <Ticket className="h-3.5 w-3.5" />
                    {e.vendidos} · {reais(Number(e.arrecadado))} · {e.convidados} convidados
                    {(e.situacao === "cancelado" || e.suspenso) && <span className="font-semibold text-perigo">{e.suspenso ? "Suspenso" : "Cancelado"}</span>}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
