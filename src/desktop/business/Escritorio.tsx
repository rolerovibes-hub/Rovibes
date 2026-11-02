import { useMemo, useState } from "react";
import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import clsx from "clsx";
import { Home, LifeBuoy } from "lucide-react";
import { porCodigo } from "@/lib/catalogo";
import { useBusiness } from "@/lib/acessos";
import { AREAS_NEGOCIO, INTENCOES, partesLiberadas } from "@/lib/areasNegocio";
import { AreaDeTrabalho } from "@/business/AreaDeTrabalho";
import { SeletorContexto } from "@/business/SeletorContexto";
import { TelaArea } from "@/business/TelaArea";
import { LugarDasAcoes } from "@/business/TelaUniversal";
import { Estacao } from "../estacao";
import { Moldura } from "./Moldura";

/**
 * Escritório: Início e as intenções (Operar, Acompanhar, Gerenciar, Analisar) à esquerda; a tela aberta no meio;
 * à direita, o "Menu" com as telas da área e as "Ações" da tela aberta.
 */
export function Escritorio({ estacao, configurar }: { estacao: Estacao; configurar?: () => void }) {
  const { temAcesso } = useBusiness();
  const local = useLocation();
  const areas = INTENCOES.filter((a) => partesLiberadas(a, temAcesso).some((g) => g.itens.length));
  const ativa = AREAS_NEGOCIO.find((a) => local.pathname.startsWith(`/business/area/${a.id}`));
  const grupos = ativa ? partesLiberadas(ativa, temAcesso) : [];
  const codigoAtual = local.pathname.split("/")[4];
  const noInicio = local.pathname === "/business";
  const [alvo, setAlvo] = useState<HTMLElement | null>(null);
  const [temAcoes, setTemAcoes] = useState(false);
  const lugar = useMemo(() => ({ alvo, registrar: setTemAcoes }), [alvo]);
  const link = (ativo: boolean) => clsx("flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[14px] font-semibold", ativo ? "bg-marca text-marca-texto" : "hover:bg-elevado");

  return (
    <Moldura
      titulo=""
      extra={
        <>
          <SeletorContexto />
          <NavLink to="/business/area/conta/G1004" className="botao ml-auto h-9 px-3 text-[13px]">
            <LifeBuoy className="h-4 w-4" />
            Ajuda
          </NavLink>
        </>
      }
      estacao={estacao}
      configurar={configurar}
    >
      <div className="grid h-full grid-cols-[220px_minmax(0,1fr)_250px]">
        <nav className="flex min-h-0 flex-col gap-1 overflow-y-auto border-r border-borda bg-elevado/50 p-2.5" aria-label="Menu principal">
          <NavLink to="/business" className={() => link(noInicio)}>
            <Home className="h-[18px] w-[18px] shrink-0" />
            Início
          </NavLink>
          {areas.map((a) => (
            <NavLink key={a.id} to={`/business/area/${a.id}`} className={() => link(ativa?.id === a.id)}>
              <a.icone className="h-[18px] w-[18px] shrink-0" />
              <span className="truncate">{a.nome}</span>
            </NavLink>
          ))}
        </nav>

        <div className="min-h-0 overflow-y-auto px-6 py-5">
          <LugarDasAcoes.Provider value={lugar}>
            <Routes>
              <Route path="/business" element={<AreaDeTrabalho />} />
              <Route path="/business/area/:area" element={<TelaArea semMenu />} />
              <Route path="/business/area/:area/:codigo" element={<TelaArea semMenu />} />
              <Route path="*" element={<Navigate to="/business" replace />} />
            </Routes>
          </LugarDasAcoes.Provider>
        </div>

        <aside className="flex min-h-0 flex-col overflow-y-auto border-l border-borda bg-superficie px-3 py-4" aria-label="Menu">
          {ativa &&
            grupos.map((g) => (
              <div key={g.nome} className="mb-2">
                <p className="px-2.5 pb-1.5 pt-1 text-[11px] font-semibold uppercase tracking-wide text-suave">{grupos.length > 1 ? g.nome : "Menu"}</p>
                {g.itens.map((i) => (
                  <NavLink
                    key={i.codigo}
                    to={`/business/area/${ativa.id}/${i.codigo}`}
                    className={() => clsx("block truncate rounded-lg px-2.5 py-2 text-sm", codigoAtual === i.codigo ? "bg-destaque-suave font-semibold text-destaque" : "hover:bg-elevado")}
                  >
                    {i.nome ?? porCodigo(i.codigo)?.nome}
                  </NavLink>
                ))}
              </div>
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
