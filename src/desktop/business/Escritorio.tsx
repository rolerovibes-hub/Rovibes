import { useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import clsx from "clsx";
import { ChefHat, ExternalLink, Wallet } from "lucide-react";
import { porCodigo } from "@/lib/catalogo";
import { useBusiness } from "@/lib/acessos";
import { AREAS_NEGOCIO, partesLiberadas } from "@/lib/areasNegocio";
import { TelaArea } from "@/business/TelaArea";
import { LugarDasAcoes } from "@/business/TelaUniversal";
import { Estacao } from "../estacao";
import { novaJanela } from "../nativo";
import { Moldura } from "./Moldura";

/**
 * Escritório: as áreas do Business no menu da esquerda; a tela aberta no meio;
 * à direita, o "Menu" com as telas da área e as "Ações" da tela aberta.
 */
export function Escritorio({ estacao, configurar }: { estacao: Estacao; configurar?: () => void }) {
  const { temAcesso } = useBusiness();
  const local = useLocation();
  const areas = AREAS_NEGOCIO.filter((a) => partesLiberadas(a, temAcesso).some((g) => g.itens.length));
  const ativa = areas.find((a) => local.pathname.startsWith(`/business/area/${a.id}`));
  const partes = ativa ? partesLiberadas(ativa, temAcesso).flatMap((g) => g.itens) : [];
  const codigoAtual = local.pathname.split("/")[4];
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [temAcoes, setTemAcoes] = useState(false);
  const lugar = useMemo(() => ({ alvo, registrar: setTemAcoes }), [alvo]);

  return (
    <Moldura titulo={ativa?.nome ?? "Escritório"} estacao={estacao} configurar={configurar}>
      <div className="grid h-full grid-cols-[230px_minmax(0,1fr)_250px]">
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-borda bg-elevado/50 p-2.5" aria-label="Áreas">
          {areas.map((a) => (
            <NavLink
              key={a.id}
              to={`/business/area/${a.id}`}
              className={() => clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", ativa?.id === a.id ? "bg-destaque-suave font-semibold text-destaque" : "hover:bg-elevado")}
            >
              <a.icone className="h-4 w-4 shrink-0" />
              <span className="truncate">{a.nome}</span>
            </NavLink>
          ))}
          <div className="my-2 h-px bg-borda" />
          <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-suave">Abrir em outra janela</p>
          <button className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevado" onClick={() => void novaJanela("caixa", "RoVibes Business · Caixa", "/janela/caixa")}>
            <Wallet className="h-4 w-4" />
            Caixa
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-suave" />
          </button>
          <button className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-left text-sm hover:bg-elevado" onClick={() => void novaJanela("cozinha", "RoVibes Business · Cozinha", "/janela/cozinha")}>
            <ChefHat className="h-4 w-4" />
            Cozinha / Bar
            <ExternalLink className="ml-auto h-3.5 w-3.5 text-suave" />
          </button>
        </nav>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <LugarDasAcoes.Provider value={lugar}>
            <Routes>
              <Route path="/business/area/:area" element={<TelaArea semMenu />} />
              <Route path="/business/area/:area/:codigo" element={<TelaArea semMenu />} />
              <Route path="*" element={areas[0] ? <Navigate to={`/business/area/${areas[0].id}`} replace /> : <p className="text-suave">Sem acesso a nenhuma área.</p>} />
            </Routes>
          </LugarDasAcoes.Provider>
        </div>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-borda bg-superficie px-3 py-4" aria-label="Menu">
          <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-suave">Menu</p>
          {partes.map((i) => (
            <NavLink
              key={i.codigo}
              to={`/business/area/${ativa!.id}/${i.codigo}`}
              className={() =>
                clsx("block truncate rounded-lg px-2.5 py-2 text-sm", codigoAtual === i.codigo ? "bg-destaque-suave font-semibold text-destaque" : "hover:bg-elevado")
              }
            >
              {i.nome ?? porCodigo(i.codigo)?.nome}
            </NavLink>
          ))}
          <div className={clsx(!temAcoes && "hidden")}>
            <div className="my-3 h-px bg-borda" />
            <p className="px-2.5 pb-2 text-[11px] font-semibold uppercase tracking-wide text-suave">Ações</p>
          </div>
          <div ref={setAlvo} className="px-0.5" />
        </aside>
      </div>
    </Moldura>
  );
}
