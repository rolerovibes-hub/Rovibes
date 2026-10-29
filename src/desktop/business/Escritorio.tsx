import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import clsx from "clsx";
import { ChefHat, ExternalLink, Wallet } from "lucide-react";
import { useBusiness } from "@/lib/acessos";
import { AREAS_NEGOCIO, partesLiberadas } from "@/lib/areasNegocio";
import { TelaArea } from "@/business/TelaArea";
import { Estacao } from "../estacao";
import { novaJanela } from "../nativo";
import { Moldura } from "./Moldura";

/** Escritório: todas as áreas do Business num menu lateral, com a parte aberta ao lado. */
export function Escritorio({ estacao, configurar }: { estacao: Estacao; configurar?: () => void }) {
  const { temAcesso } = useBusiness();
  const local = useLocation();
  const areas = AREAS_NEGOCIO.filter((a) => partesLiberadas(a, temAcesso).some((g) => g.itens.length));
  const ativa = areas.find((a) => local.pathname.startsWith(`/business/area/${a.id}`));

  return (
    <Moldura titulo={ativa?.nome ?? "Escritório"} estacao={estacao} configurar={configurar}>
      <div className="grid h-full grid-cols-[230px_minmax(0,1fr)]">
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-borda bg-elevado/50 p-2.5" aria-label="Áreas">
          {areas.map((a) => (
            <NavLink
              key={a.id}
              to={`/business/area/${a.id}`}
              className={() =>
                clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", ativa?.id === a.id ? "bg-destaque-suave font-semibold text-destaque" : "hover:bg-elevado")
              }
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
          <Routes>
            <Route path="/business/area/:area" element={<TelaArea />} />
            <Route path="/business/area/:area/:codigo" element={<TelaArea />} />
            <Route path="*" element={areas[0] ? <Navigate to={`/business/area/${areas[0].id}`} replace /> : <p className="text-suave">Sem acesso a nenhuma área.</p>} />
          </Routes>
        </div>
      </div>
    </Moldura>
  );
}
