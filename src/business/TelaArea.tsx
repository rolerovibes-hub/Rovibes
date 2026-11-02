import { useEffect } from "react";
import { Navigate, NavLink, useParams } from "react-router-dom";
import clsx from "clsx";
import { Aplicativo, porCodigo } from "@/lib/catalogo";
import { useBusiness } from "@/lib/acessos";
import { AREAS_ANTIGAS, AREAS_NEGOCIO, AreaNegocio, areaPorId, ondeFica, partesLiberadas } from "@/lib/areasNegocio";
import { supabase } from "@/lib/supabase";
import { ConteudoApp } from "./TelaAplicativo";
import { PainelArea } from "./PainelAgora";

/** Uma área de negócio: menu das partes à esquerda (no celular, em cima) e a parte aberta ao lado. */
export function TelaArea({
  areas = AREAS_NEGOCIO,
  base = "/business",
  podeVer,
  semMenu,
}: {
  areas?: AreaNegocio[];
  base?: string;
  /** Regra própria de acesso (Gestão: nível do cargo na área). */
  podeVer?: (codigo: string, area: AreaNegocio) => boolean;
  /** App de computador: as partes ficam no menu lateral do app, não numa segunda coluna. */
  semMenu?: boolean;
}) {
  const { area: id = "", codigo } = useParams();
  const area = areaPorId(id, areas);
  const { temAcesso: temAcessoApp, atual: estabAtual } = useBusiness();
  const temAcesso = (app: Aplicativo) => (podeVer && area ? podeVer(app.codigo, area) : temAcessoApp(app));
  const estab = estabAtual?.estabelecimento_id ?? null;
  const aberta = area ? (codigo ?? `painel:${area.id}`) : null;

  // Registro de uso das telas (instrumento de UX).
  useEffect(() => {
    if (!aberta || podeVer) return;
    void supabase.rpc("registrar_uso", { p_codigo: aberta, p_estab: estab, p_origem: "business" }).then(() => undefined);
  }, [aberta, estab, podeVer]);

  if (!area) {
    // Endereço antigo (antes da reorganização em Operar/Acompanhar/Gerenciar/Analisar).
    if (!podeVer && AREAS_ANTIGAS.includes(id)) {
      const nova = codigo ? ondeFica(codigo, areas) : null;
      return <Navigate to={nova ? `${base}/area/${nova.area.id}/${codigo}` : base} replace />;
    }
    return <Navigate to={base} replace />;
  }

  const grupos = partesLiberadas(area, temAcesso);
  const todas = grupos.flatMap((g) => g.itens);
  if (!todas.length) return <Navigate to={base} replace />;
  const atual = codigo && todas.some((i) => i.codigo === codigo) ? codigo : null;
  if (!atual) {
    // Parte sem acesso (link antigo) cai no aviso de acesso; sem parte, abre a primeira.
    if (codigo && porCodigo(codigo) && area.grupos.some((g) => g.itens.some((i) => i.codigo === codigo))) {
      return <ConteudoApp app={porCodigo(codigo)!} liberado={false} />;
    }
    if (area.painel && !codigo) return <PainelArea area={area} base={base} />;
    return <Navigate to={`${base}/area/${area.id}/${todas[0].codigo}`} replace />;
  }
  const app = porCodigo(atual)!;
  const unica = semMenu || todas.length === 1;

  return (
    <div className={clsx("grid items-start gap-5", !unica && "lg:grid-cols-[210px_minmax(0,1fr)]")}>
      {!unica && (
        <nav aria-label={area.nome} className="cartao -mx-1 flex gap-1 overflow-x-auto p-1.5 lg:sticky lg:top-24 lg:mx-0 lg:block lg:p-2 [scrollbar-width:none]">
          {grupos.map((g, n) => (
            <div key={g.nome} className="flex shrink-0 gap-1 lg:block">
              {grupos.length > 1 && <p className={clsx("hidden px-3 pb-1 text-[11px] font-bold uppercase tracking-wider text-suave lg:block", n === 0 ? "pt-1" : "pt-3")}>{g.nome}</p>}
              {g.itens.map((i) => (
                <NavLink
                  key={i.codigo}
                  to={`${base}/area/${area.id}/${i.codigo}`}
                  className={({ isActive }) =>
                    clsx("block whitespace-nowrap rounded-lg px-3 py-2 text-sm", isActive ? "bg-destaque-suave font-semibold text-destaque" : "text-texto hover:bg-elevado")
                  }
                >
                  {i.nome ?? porCodigo(i.codigo)?.nome}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      )}
      <div className="min-w-0">
        <ConteudoApp key={app.codigo} app={app} liberado={podeVer ? true : undefined} />
      </div>
    </div>
  );
}
