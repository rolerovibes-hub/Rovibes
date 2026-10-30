import { NavLink, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { porCodigo } from "@/lib/catalogo";
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
  const partes = ativa ? partesLiberadas(ativa, temAcesso) : [];
  const codigoAtual = local.pathname.split("/")[4];
  const parteAtual = partes.flatMap((g) => g.itens).find((i) => i.codigo === codigoAtual);

  return (
    <Moldura
      titulo={parteAtual ? `${ativa!.nome} · ${parteAtual.nome ?? porCodigo(parteAtual.codigo)?.nome ?? ""}` : ativa?.nome ?? "Escritório"}
      estacao={estacao}
      configurar={configurar}
    >
      <div className="grid h-full grid-cols-[230px_minmax(0,1fr)]">
        <nav className="flex min-h-0 flex-col gap-0.5 overflow-y-auto border-r border-borda bg-elevado/50 p-2.5" aria-label="Áreas">
          {areas.map((a) => (
            <div key={a.id}>
              <NavLink
                to={`/business/area/${a.id}`}
                className={() => clsx("flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm", ativa?.id === a.id ? "font-semibold text-destaque" : "hover:bg-elevado")}
              >
                <a.icone className="h-4 w-4 shrink-0" />
                <span className="truncate">{a.nome}</span>
              </NavLink>
              {/* Partes da área aberta, logo abaixo dela (sem segunda coluna de menu) */}
              {ativa?.id === a.id && (
                <div className="mb-1 ml-[22px] border-l border-borda pl-2">
                  {partes.flatMap((g) => g.itens).map((i) => (
                    <NavLink
                      key={i.codigo}
                      to={`/business/area/${a.id}/${i.codigo}`}
                      className={() =>
                        clsx("block truncate rounded-md px-2.5 py-1.5 text-[13px]", codigoAtual === i.codigo ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto")
                      }
                    >
                      {i.nome ?? porCodigo(i.codigo)?.nome}
                    </NavLink>
                  ))}
                </div>
              )}
            </div>
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
            <Route path="/business/area/:area" element={<TelaArea semMenu />} />
            <Route path="/business/area/:area/:codigo" element={<TelaArea semMenu />} />
            <Route path="*" element={areas[0] ? <Navigate to={`/business/area/${areas[0].id}`} replace /> : <p className="text-suave">Sem acesso a nenhuma área.</p>} />
          </Routes>
        </div>
      </div>
    </Moldura>
  );
}
