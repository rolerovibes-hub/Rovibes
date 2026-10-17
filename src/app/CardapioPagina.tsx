import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, UtensilsCrossed } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { reais } from "@/components/Formulario";
import { agruparCardapio } from "./dados";
import { LugarNaoEncontrado, useLugar } from "./LugarPagina";

export function CardapioPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const dados = useLugar(id);

  if (!dados) return <Carregando />;
  if (!dados.lugar) return <LugarNaoEncontrado />;
  const grupos = agruparCardapio(dados.categorias, dados.itens);

  const irPara = (grupo: string) => document.getElementById(`grupo-${grupo}`)?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div className="pb-6">
      <div className="sticky top-14 z-20 border-b border-borda bg-fundo/95 backdrop-blur">
        <div className="flex items-center gap-3 px-4 py-3">
          <button onClick={() => navegar(-1)} className="botao h-9 w-9 shrink-0 px-0" aria-label="Voltar">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="min-w-0">
            <h1 className="truncate font-semibold leading-tight">Cardápio</h1>
            <p className="truncate text-[13px] text-suave">{dados.lugar.nome}</p>
          </div>
        </div>
        {grupos.length > 1 && (
          <nav aria-label="Categorias" className="flex gap-2 overflow-x-auto px-4 pb-3 [scrollbar-width:none]">
            {grupos.map((g) => (
              <button key={g.id} onClick={() => irPara(g.id)} className="shrink-0 rounded-full border border-borda bg-superficie px-3.5 py-1.5 text-sm hover:bg-elevado">
                {g.nome}
              </button>
            ))}
          </nav>
        )}
      </div>

      {grupos.length === 0 ? (
        <div className="px-6 py-20 text-center">
          <UtensilsCrossed className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Cardápio ainda não publicado</p>
        </div>
      ) : (
        <div className="space-y-6 px-4 pt-5">
          {grupos.map((g) => (
            <section key={g.id} id={`grupo-${g.id}`} className="scroll-mt-32">
              <h2 className="mb-2.5 text-[17px] font-semibold">{g.nome}</h2>
              <ul className="cartao divide-y divide-borda">
                {g.itens.map((i) => (
                  <li key={i.id} className="flex gap-3 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium">{i.nome}</p>
                      {i.descricao && <p className="mt-0.5 text-[13px] text-suave">{i.descricao}</p>}
                      {i.preco != null && <p className="codigo mt-1 text-sm text-destaque">{reais(i.preco)}</p>}
                    </div>
                    {i.foto_url && <img src={i.foto_url} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover" loading="lazy" />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
