import { ReactNode, useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, Award, BadgePercent, ChevronRight, Store, Ticket, X } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { QrCode } from "@/components/Qr";
import { useSessao } from "@/lib/sessao";
import { dataCurta, descreverBeneficio, descreverRegras } from "@/lib/beneficio";
import { quando } from "./dados";
import { buscarCarteira, codigoLegivel, Cupom, fimDoEvento, Ingresso, qrDoIngresso, SaldoPontos } from "./carteira";
import { IngressosCarteira, useMeusIngressos } from "./IngressosPagos";
import { IngressosDeAnfitrioes } from "./EventosDaGalera";

type Aba = "cupons" | "ingressos" | "pontos";
const ABAS: { id: Aba; nome: string }[] = [
  { id: "cupons", nome: "Cupons" },
  { id: "ingressos", nome: "Ingressos" },
  { id: "pontos", nome: "Pontos" },
];

export function Carteira() {
  const { sessao } = useSessao();
  const usuario = sessao!.user.id;
  const navegar = useNavigate();
  const [busca, setBusca] = useSearchParams();
  const aba = (ABAS.find((a) => a.id === busca.get("aba"))?.id ?? "cupons") as Aba;
  const [dados, setDados] = useState<Awaited<ReturnType<typeof buscarCarteira>> | null>(null);
  const [aberto, setAberto] = useState<Ingresso | null>(null);
  const novos = useMeusIngressos();

  useEffect(() => {
    document.title = "Carteira · RoVibes";
    buscarCarteira(usuario).then(setDados);
  }, [usuario]);

  const agora = Date.now();
  const cuponsAtivos = dados?.cupons.filter((c) => c.situacao === "disponivel" && Date.parse(c.validade) > agora) ?? [];
  const cuponsPassados = dados?.cupons.filter((c) => !cuponsAtivos.includes(c)) ?? [];
  const ingressosAtivos = dados?.ingressos.filter((i) => i.situacao === "valido" && i.evento && i.evento.situacao !== "cancelado" && fimDoEvento(i.evento) > agora) ?? [];
  const ingressosPassados = dados?.ingressos.filter((i) => !ingressosAtivos.includes(i)) ?? [];
  const ativosNovos = novos.lista?.filter((i) => i.situacao === "valido" && Date.parse(i.evento.fim ?? i.evento.inicio) + 6 * 3600000 > agora).length;
  const contagem: Record<Aba, number> = { cupons: cuponsAtivos.length, ingressos: ativosNovos ?? ingressosAtivos.length, pontos: dados?.pontos.length ?? 0 };

  return (
    <div className="pb-6">
      <div className="flex items-center gap-2 px-2 pt-3">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-lg font-semibold">Carteira</h1>
      </div>

      <div className="mx-4 mt-3 grid grid-cols-3 gap-1 rounded-lg border border-borda bg-superficie p-1" role="tablist" aria-label="Carteira">
        {ABAS.map((a) => (
          <button
            key={a.id}
            role="tab"
            aria-selected={aba === a.id}
            onClick={() => setBusca({ aba: a.id }, { replace: true })}
            className={clsx("rounded-md py-1.5 text-sm", aba === a.id ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:text-texto")}
          >
            {a.nome}
            {contagem[a.id] > 0 && <span className="codigo ml-1.5">{contagem[a.id]}</span>}
          </button>
        ))}
      </div>

      {!dados ? (
        <Carregando compacto />
      ) : aba === "cupons" ? (
        <div className="space-y-6 px-4 pt-5">
          {cuponsAtivos.length === 0 ? (
            <Vazio icone={BadgePercent} titulo="Nenhum cupom para usar" texto="Resgate cupons nas promoções dos lugares. Eles valem nos pedidos feitos pelo RoVibes." />
          ) : (
            <Grupo titulo="Para usar">
              {cuponsAtivos.map((c) => (
                <CartaoCupom key={c.id} cupom={c} />
              ))}
            </Grupo>
          )}
          {cuponsPassados.length > 0 && (
            <Grupo titulo="Usados ou vencidos">
              {cuponsPassados.map((c) => (
                <CartaoCupom key={c.id} cupom={c} passado />
              ))}
            </Grupo>
          )}
        </div>
      ) : aba === "ingressos" && novos.lista ? (
        <>
          <IngressosDeAnfitrioes />
          <IngressosCarteira lista={novos.lista} recarregar={novos.recarregar} compraVolta={busca.get("compra")} />
        </>
      ) : aba === "ingressos" ? (
        <div className="space-y-6 px-4 pt-5">
          {ingressosAtivos.length === 0 ? (
            <Vazio icone={Ticket} titulo="Nenhum ingresso" texto="Pegue ingressos gratuitos na página dos eventos." />
          ) : (
            <Grupo titulo="Próximos">
              {ingressosAtivos.map((i) => (
                <CartaoIngresso key={i.id} ingresso={i} abrir={() => setAberto(i)} />
              ))}
            </Grupo>
          )}
          {ingressosPassados.length > 0 && (
            <Grupo titulo="Já foram">
              {ingressosPassados.map((i) => (
                <CartaoIngresso key={i.id} ingresso={i} passado />
              ))}
            </Grupo>
          )}
        </div>
      ) : (
        <div className="px-4 pt-5">
          {dados.pontos.length === 0 ? (
            <Vazio icone={Award} titulo="Nenhum ponto ainda" texto="Faça check-in nos lugares com programa de pontos. Cada lugar tem seus próprios pontos e recompensas." />
          ) : (
            <Grupo titulo="Seus pontos por lugar">
              <ul className="cartao divide-y divide-borda">
                {dados.pontos.map((p) => (
                  <LinhaPontos key={p.estabelecimento_id} saldo={p} />
                ))}
              </ul>
              <p className="px-1 text-[13px] text-suave">Abra o lugar para ver as recompensas e trocar seus pontos.</p>
            </Grupo>
          )}
        </div>
      )}

      {aberto?.evento && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Ingresso" onClick={() => setAberto(null)}>
          <div className="w-full max-w-sm rounded-t-2xl bg-superficie p-6 text-center sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-end">
              <button onClick={() => setAberto(null)} className="-mr-2 -mt-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="font-semibold">{aberto.evento.nome}</p>
            <p className="text-sm text-suave">
              {aberto.evento.estabelecimento?.nome} · {quando(aberto.evento.inicio)}
            </p>
            <div className="mt-5">
              <QrCode texto={qrDoIngresso(aberto.codigo)} tamanho={240} />
            </div>
            <p className="codigo mt-3 text-base tracking-widest">{codigoLegivel(aberto.codigo)}</p>
            <p className="mt-2 text-[13px] text-suave">Mostre na entrada. Vale uma vez.</p>
          </div>
        </div>
      )}
    </div>
  );
}

function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <h2 className="rotulo px-1">{titulo}</h2>
      {children}
    </section>
  );
}

function Vazio({ icone: Icone, titulo, texto }: { icone: typeof Ticket; titulo: string; texto: string }) {
  return (
    <div className="px-4 py-12 text-center">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destaque-suave text-destaque">
        <Icone className="h-6 w-6" />
      </span>
      <p className="mt-4 font-semibold">{titulo}</p>
      <p className="mx-auto mt-1 max-w-xs text-sm text-suave">{texto}</p>
    </div>
  );
}

function Logo({ url }: { url: string | null | undefined }) {
  return url ? (
    <img src={url} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-elevado text-suave">
      <Store className="h-4 w-4" />
    </span>
  );
}

function CartaoCupom({ cupom: c, passado }: { cupom: Cupom; passado?: boolean }) {
  const regras = descreverRegras(c);
  const estado = c.situacao === "usado" ? `Usado em ${dataCurta(c.usado_em ?? c.criado_em)}` : c.situacao === "cancelado" ? "Cancelado" : `Venceu em ${dataCurta(c.validade)}`;
  return (
    <article className={clsx("cartao overflow-hidden", passado && "opacity-60")}>
      <div className="flex items-start gap-3 p-4">
        <Logo url={c.estabelecimento?.logo_url} />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-suave">{c.estabelecimento?.nome}</p>
          <p className={clsx("font-semibold", !passado && "text-magenta")}>{descreverBeneficio(c)}</p>
          <p className="text-sm">{c.titulo}</p>
          {regras && <p className="mt-1 text-[12px] text-suave">Vale {regras}</p>}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-dashed border-borda px-4 py-2.5 text-[12px]">
        <span className="text-suave">{passado ? estado : `Vale até ${dataCurta(c.validade)}`}</span>
        <span className="codigo tracking-wider text-suave">{codigoLegivel(c.codigo)}</span>
      </div>
      {!passado && (
        <p className="border-t border-borda bg-elevado/50 px-4 py-2 text-[12px] text-suave">
          {c.recompensa_id ? "Recompensa do programa de pontos. " : ""}Escolha este cupom ao fazer seu pedido pelo RoVibes.
        </p>
      )}
    </article>
  );
}

function CartaoIngresso({ ingresso: i, abrir, passado }: { ingresso: Ingresso; abrir?: () => void; passado?: boolean }) {
  if (!i.evento) return null;
  const conteudo = (
    <>
      {i.evento.capa_url ? (
        <img src={i.evento.capa_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" />
      ) : (
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
          <Ticket className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1 text-left">
        <span className="block truncate font-semibold">{i.evento.nome}</span>
        <span className="block truncate text-[13px] text-suave">
          {i.evento.estabelecimento?.nome} · {quando(i.evento.inicio)}
        </span>
        {passado && <span className="block text-[12px] text-suave">{i.situacao === "usado" ? "Entrada confirmada" : "Não usado"}</span>}
      </span>
      {!passado && <span className="botao h-8 shrink-0 px-3 text-[13px]">Ver QR</span>}
    </>
  );
  return passado ? (
    <div className="cartao flex items-center gap-3 p-3 opacity-60">{conteudo}</div>
  ) : (
    <button onClick={abrir} className="cartao flex w-full items-center gap-3 p-3 hover:bg-elevado">
      {conteudo}
    </button>
  );
}

function LinhaPontos({ saldo: p }: { saldo: SaldoPontos }) {
  return (
    <li>
      <Link to={`/lugar/${p.estabelecimento_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
        <Logo url={p.logo_url} />
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{p.nome}</span>
          {!p.ativo && <span className="block text-[12px] text-suave">Programa pausado</span>}
        </span>
        <span className="codigo text-base font-semibold text-destaque">{p.saldo}</span>
        <span className="text-[12px] text-suave">pts</span>
        <ChevronRight className="h-4 w-4 text-suave" />
      </Link>
    </li>
  );
}
