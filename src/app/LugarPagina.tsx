import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, AtSign, Bookmark, CalendarDays, ChevronRight, MapPin, MapPinned, Navigation, Phone, Store, UtensilsCrossed } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { MapaBase, PinMapa } from "@/components/MapaBase";
import { reais } from "@/components/Formulario";
import { abertoAgora, DIAS, hhmm, resumoHorario } from "@/lib/horarios";
import { agruparCardapio, buscarLugar, nomesVibes, quando } from "./dados";
import { useExigirLogin, useRelacao, useResumos } from "./presenca";
import { FolhaCheckin } from "./Checkin";
import { buscarStories, GrupoStories } from "./conteudo";
import { VisorStories } from "./VisorStories";
import { useSessao } from "@/lib/sessao";
import { supabase } from "@/lib/supabase";
import { NotaCompacta, SecaoAvaliacoes } from "./Avaliacoes";
import { MedidorMovimento } from "@/components/Marca";

type Dados = Awaited<ReturnType<typeof buscarLugar>>;

/** Cache simples por id, para a página do cardápio completo abrir sem recarregar. */
const cache = new Map<string, Dados>();

export function useLugar(id: string) {
  const [dados, setDados] = useState<Dados | null>(() => cache.get(id) ?? null);
  useEffect(() => {
    let ativo = true;
    if (!cache.has(id)) setDados(null);
    buscarLugar(id).then((d) => {
      cache.set(id, d);
      if (ativo) setDados(d);
    });
    return () => {
      ativo = false;
    };
  }, [id]);
  useEffect(() => {
    if (dados?.lugar) document.title = `${dados.lugar.nome} · RoVibes`;
  }, [dados]);
  return dados;
}

export function LugarNaoEncontrado() {
  return (
    <div className="px-6 py-20 text-center">
      <Store className="mx-auto h-8 w-8 text-suave" />
      <p className="mt-3 font-medium">Lugar não encontrado</p>
      <Link to="/" className="botao mt-5">
        Voltar ao Descobrir
      </Link>
    </div>
  );
}

const PREVIA = 4;

export function LugarPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const dados = useLugar(id);
  const [foto, setFoto] = useState(0);
  const relacao = useRelacao(id);
  const { resumos, recarregar } = useResumos([id]);
  const exigirLogin = useExigirLogin();
  const [checkinAberto, setCheckinAberto] = useState(false);
  const [versao, setVersao] = useState(0);
  const resumo = resumos.get(id);
  const { sessao } = useSessao();
  const usuario = sessao?.user.id ?? "";
  const [stories, setStories] = useState<GrupoStories[]>([]);
  const [visorAberto, setVisorAberto] = useState(false);

  useEffect(() => {
    if (!usuario) return;
    void supabase.rpc("registrar_visita", { p_estab: id });
    buscarStories(usuario, id).then(setStories);
  }, [id, usuario]);

  if (!dados) return <Carregando />;
  const { lugar, eventos, fotos, categorias, itens } = dados;
  if (!lugar) return <LugarNaoEncontrado />;

  const imagens = fotos.length ? fotos.map((f) => f.url) : lugar.capa_url ? [lugar.capa_url] : [];
  const capa = imagens[foto] ?? null;
  const aberto = abertoAgora(lugar.horarios);
  const vibes = nomesVibes(lugar);
  const ponto: [number, number] | null = lugar.latitude != null && lugar.longitude != null ? [lugar.latitude, lugar.longitude] : null;
  const rota = ponto
    ? `https://www.google.com/maps/dir/?api=1&destination=${ponto[0]},${ponto[1]}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${lugar.endereco ?? lugar.nome}, Uberlândia`)}`;
  const destaques = itens.filter((i) => i.destaque);
  const grupos = agruparCardapio(categorias, itens);
  const previa = grupos.flatMap((g) => g.itens.map((i) => ({ ...i, grupo: g.nome }))).slice(0, PREVIA);
  const restantes = itens.length - previa.length;
  const endereco = [lugar.endereco, lugar.bairro].filter(Boolean).join(" · ");

  return (
    <article className="pb-6">
      {/* Capa com as vibes por cima */}
      <div className="relative">
        {capa ? (
          <img src={capa} alt={`Foto de ${lugar.nome}`} className="aspect-[16/10] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/10] w-full items-center justify-center bg-elevado text-suave">
            <Store className="h-8 w-8" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <button onClick={() => navegar(-1)} className="shrink-0 rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          {vibes.length > 0 && (
            <div className="flex flex-wrap justify-end gap-1.5">
              {vibes.map((v) => (
                <span key={v} className="rounded-full bg-black/45 px-2.5 py-1 text-[12px] font-medium text-white backdrop-blur">
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>
        {imagens.length > 1 && (
          <div className="absolute bottom-9 left-0 right-0 flex justify-center gap-1.5">
            {imagens.map((_, i) => (
              <button
                key={i}
                onClick={() => setFoto(i)}
                aria-label={`Foto ${i + 1}`}
                className={clsx("h-1.5 rounded-full transition-all", i === foto ? "w-5 bg-white" : "w-1.5 bg-white/60")}
              />
            ))}
          </div>
        )}
      </div>

      {/* Identidade: logo sobre a capa, nome e situação */}
      <div className="relative -mt-6 rounded-t-[20px] bg-fundo px-4">
        <div className="flex flex-col items-center text-center">
          <button
            type="button"
            onClick={() => stories.length > 0 && setVisorAberto(true)}
            disabled={stories.length === 0}
            aria-label={stories.length ? `Ver stories de ${lugar.nome}` : undefined}
            className={clsx("-mt-11 rounded-full p-[3px]", stories.length ? (stories[0].vistos ? "bg-borda" : "bg-magenta") : "bg-fundo")}
          >
            <span className="flex h-[84px] w-[84px] items-center justify-center overflow-hidden rounded-full border-[3px] border-fundo bg-superficie">
              {lugar.logo_url ? (
                <img src={lugar.logo_url} alt={`Logo de ${lugar.nome}`} className="h-full w-full object-cover" />
              ) : (
                <Store className="h-7 w-7 text-suave" />
              )}
            </span>
          </button>
          <h1 className="mt-2 text-[22px] font-semibold leading-tight">{lugar.nome}</h1>
          <p className="text-sm text-suave">
            {[lugar.categoria?.nome, lugar.faixa_preco ? "$".repeat(lugar.faixa_preco) : null].filter(Boolean).join(" · ")}
          </p>
          <button
            onClick={() => exigirLogin() && void relacao.alternarSeguir().then(recarregar)}
            aria-pressed={relacao.seguindo}
            className={clsx(
              "mt-3 inline-flex h-8 items-center gap-1.5 rounded-full border px-4 text-[13px] font-medium",
              relacao.seguindo ? "border-borda bg-elevado text-texto" : "border-marca text-destaque hover:bg-destaque-suave",
            )}
          >
            {relacao.seguindo ? "Seguindo" : "Seguir"}
            {resumo && resumo.seguidores > 0 && <span className="font-normal text-suave">· {resumo.seguidores}</span>}
          </button>
        </div>

        <div className="cartao mt-4 px-4 py-3 text-center text-sm">
          <p>
            {lugar.horarios.length > 0 ? (
              <span className={clsx("inline-flex items-center gap-1.5", aberto ? "font-medium text-ok" : "text-suave")}>
                <span className={clsx("h-2 w-2 rounded-full", aberto ? "bg-ok" : "bg-suave")} />
                {resumoHorario(lugar.horarios)}
              </span>
            ) : (
              <span className="text-suave">Horário não informado</span>
            )}
          </p>
          {resumo && (resumo.avaliacoes > 0 || resumo.movimento || resumo.pessoas_2h > 0) && (
            <p className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
              <NotaCompacta nota={resumo.nota} total={resumo.avaliacoes} />
              {resumo.movimento && <MedidorMovimento nivel={resumo.movimento} />}
              {resumo.pessoas_2h > 0 && (
                <span className="text-[13px] text-suave">
                  {resumo.pessoas_2h} {resumo.pessoas_2h === 1 ? "check-in" : "check-ins"} nas últimas 2 h
                </span>
              )}
            </p>
          )}
          {endereco && (
            <p className="mt-1 inline-flex items-center gap-1 text-suave">
              <MapPin className="h-3.5 w-3.5" />
              {endereco}
            </p>
          )}
        </div>

        <div className="mt-4 space-y-2">
          {itens.length > 0 && (
            <Link to={`/lugar/${lugar.id}/cardapio`} className="botao-principal h-11 w-full rounded-full text-[15px]">
              <UtensilsCrossed className="h-4 w-4" />
              Ver cardápio completo
            </Link>
          )}
          <div className="grid grid-cols-3 gap-2">
            <a href={rota} target="_blank" rel="noreferrer" className="botao flex-col gap-1 py-2.5 text-[13px]">
              <Navigation className="h-4 w-4" />
              Como chegar
            </a>
            <button
              onClick={() => exigirLogin() && void relacao.alternarSalvo()}
              aria-pressed={relacao.salvo}
              className={clsx("botao flex-col gap-1 py-2.5 text-[13px]", relacao.salvo && "border-marca text-destaque")}
            >
              <Bookmark className={clsx("h-4 w-4", relacao.salvo && "fill-current")} />
              {relacao.salvo ? "Salvo" : "Salvar"}
            </button>
            <button onClick={() => exigirLogin() && setCheckinAberto(true)} className="botao flex-col gap-1 py-2.5 text-[13px]">
              <MapPinned className="h-4 w-4" />
              Check-in
            </button>
          </div>
        </div>
      </div>

      <div className="mt-7 space-y-7">
        {lugar.descricao && <p className="px-4 text-[15px] leading-relaxed">{lugar.descricao}</p>}

        {destaques.length > 0 && (
          <section>
            <h2 className="mb-3 px-4 text-[17px] font-semibold">Os mais pedidos</h2>
            <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
              {destaques.map((i) => (
                <li key={i.id} className="cartao w-40 shrink-0 overflow-hidden">
                  {i.foto_url ? (
                    <img src={i.foto_url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                  ) : (
                    <div className="flex aspect-square w-full items-center justify-center bg-elevado text-suave">
                      <UtensilsCrossed className="h-6 w-6" />
                    </div>
                  )}
                  <div className="p-3">
                    <p className="truncate text-sm font-medium">{i.nome}</p>
                    {i.preco != null && <p className="codigo mt-0.5 text-sm text-destaque">{reais(i.preco)}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}

        {previa.length > 0 && (
          <section className="px-4">
            <h2 className="mb-3 text-[17px] font-semibold">Prévia do cardápio</h2>
            <div className="cartao overflow-hidden">
              <ul className="divide-y divide-borda">
                {previa.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-4 py-3">
                    {i.foto_url ? (
                      <img src={i.foto_url} alt="" className="h-14 w-14 shrink-0 rounded-lg object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                        <UtensilsCrossed className="h-5 w-5" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{i.nome}</p>
                      <p className="truncate text-[13px] text-suave">{i.descricao || i.grupo}</p>
                    </div>
                    {i.preco != null && <span className="codigo shrink-0 text-sm">{reais(i.preco)}</span>}
                  </li>
                ))}
              </ul>
              {restantes > 0 && (
                <Link
                  to={`/lugar/${lugar.id}/cardapio`}
                  className="flex items-center justify-center gap-1 border-t border-borda px-4 py-3 text-sm font-medium text-destaque hover:bg-elevado"
                >
                  Ver mais {restantes} {restantes === 1 ? "opção" : "opções"} no cardápio completo
                  <ChevronRight className="h-4 w-4" />
                </Link>
              )}
            </div>
          </section>
        )}

        {eventos.length > 0 && (
          <section className="px-4">
            <h2 className="mb-3 text-[17px] font-semibold">Próximos eventos</h2>
            <ul className="cartao divide-y divide-borda">
              {eventos.map((e) => (
                <li key={e.id}>
                  <Link to={`/evento/${e.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
                    <CalendarDays className="h-5 w-5 shrink-0 text-destaque" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{e.nome}</span>
                      <span className="block text-[13px] text-suave">
                        {quando(e.inicio)}
                        {e.entrada ? ` · ${e.entrada}` : ""}
                      </span>
                    </span>
                    <ChevronRight className="h-4 w-4 text-suave" />
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SecaoAvaliacoes estabelecimentoId={lugar.id} versao={versao} aoMudar={() => void recarregar()} />

        {lugar.horarios.length > 0 && (
          <section className="px-4">
            <h2 className="mb-3 text-[17px] font-semibold">Horários</h2>
            <ul className="cartao divide-y divide-borda text-sm">
              {DIAS.map((dia, i) => {
                const h = lugar.horarios.find((x) => x.dia_semana === i);
                const hoje = new Date().getDay() === i;
                return (
                  <li key={dia} className={clsx("flex justify-between px-4 py-2.5", hoje && "font-semibold")}>
                    <span>{dia}</span>
                    <span className={clsx("codigo text-sm", !h && "text-suave")}>{h ? `${hhmm(h.abre)} às ${hhmm(h.fecha)}` : "Fechado"}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <section className="px-4">
          <h2 className="mb-3 text-[17px] font-semibold">Onde fica</h2>
          {ponto && (
            <div className="mb-3 h-44 overflow-hidden rounded-cartao border border-borda">
              <MapaBase centro={ponto} zoom={16} className="h-full w-full">
                <PinMapa posicao={ponto} tamanho="grande" titulo={lugar.nome} />
              </MapaBase>
            </div>
          )}
          <ul className="space-y-2 text-sm">
            {(lugar.endereco || lugar.bairro) && <li>{[lugar.endereco, lugar.bairro, "Uberlândia-MG"].filter(Boolean).join(", ")}</li>}
            {lugar.telefone && (
              <li>
                <a href={`tel:${lugar.telefone.replace(/\D/g, "")}`} className="inline-flex items-center gap-2 text-destaque">
                  <Phone className="h-4 w-4" />
                  {lugar.telefone}
                </a>
              </li>
            )}
            {lugar.instagram && (
              <li>
                <a href={`https://instagram.com/${lugar.instagram}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 text-destaque">
                  <AtSign className="h-4 w-4" />
                  {lugar.instagram}
                </a>
              </li>
            )}
          </ul>
        </section>
      </div>
      {checkinAberto && (
        <FolhaCheckin
          estabelecimentoId={lugar.id}
          nome={lugar.nome}
          vibes={vibes}
          fechar={() => setCheckinAberto(false)}
          concluido={() => {
            setVersao((v) => v + 1);
            void recarregar();
          }}
        />
      )}
      {visorAberto && stories.length > 0 && (
        <VisorStories
          grupos={stories}
          inicio={0}
          usuario={usuario}
          fechar={() => {
            setVisorAberto(false);
            buscarStories(usuario, id).then(setStories);
          }}
        />
      )}
    </article>
  );
}
