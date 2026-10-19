import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import clsx from "clsx";
import {
  ArrowLeft,
  AtSign,
  Bookmark,
  CalendarDays,
  ChevronDown,
  ChevronRight,
  Clock,
  Copy,
  LogOut,
  MapPin,
  MapPinned,
  MessageCircle,
  MoreHorizontal,
  Navigation,
  PartyPopper,
  Phone,
  Play,
  Share2,
  Store,
  UtensilsCrossed,
  X,
} from "lucide-react";
import { abrirConversaEstab } from "@/lib/chat";
import { Carregando } from "@/components/Carregando";
import { MapaBase, PinMapa } from "@/components/MapaBase";
import { reais } from "@/components/Formulario";
import { abertoAgora, DIAS, hhmm, resumoHorario } from "@/lib/horarios";
import { agruparCardapio, buscarLugar, distanciaKm, ehHoje, EventoResumo, km, nomesVibes, quando } from "./dados";
import { useExigirLogin, useRelacao, useResumos } from "./presenca";
import { FolhaCheckin } from "./Checkin";
import { buscarStories, GrupoStories } from "./conteudo";
import { VisorStories } from "./VisorStories";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { NotaCompacta, SecaoAvaliacoes } from "./Avaliacoes";
import { BeneficiosLugar } from "./BeneficiosLugar";
import { Navegacao } from "./Navegacao";
import { ListasPresenca } from "@/components/ListasPresenca";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { capturarRef, compartilhar, linkDivulgacao } from "@/lib/promoters";
import { mudarPresenca, posicaoSeLiberada, sairDoLugar, useAgora, useMinhaPresenca, Visibilidade, VISIBILIDADES } from "@/lib/agora";
import { AmigosAqui, CartaoComoEsta, FolhaComoEsta } from "./AgoraLugar";

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
        Voltar ao início
      </Link>
    </div>
  );
}

type Aba = "destaques" | "programacao" | "cardapio" | "fotos";

interface FotoGrade {
  id: string;
  url: string;
  tipo: "casa" | "comunidade" | "story";
  autor?: string;
}

const horaCurta = (t: string) => hhmm(t).replace(":00", "h").replace(":", "h");

/**
 * Perfil do lugar, em três níveis:
 * 1) decidir (identidade, situação agora, amigos, Marcar rolê);
 * 2) explorar (abas Destaques, Programação, Cardápio, Fotos);
 * 3) sob demanda ("Mais", informações, regras).
 */
export function LugarPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const dados = useLugar(id);
  const [foto, setFoto] = useState(0);
  const relacao = useRelacao(id);
  const { resumos, recarregar } = useResumos([id]);
  const exigirLogin = useExigirLogin();
  const [params, setParams] = useSearchParams();
  const [checkinAberto, setCheckinAberto] = useState(params.get("checkin") === "1");
  const [aba, setAba] = useState<Aba>(() => (["programacao", "cardapio", "fotos"].includes(params.get("aba") ?? "") ? (params.get("aba") as Aba) : "destaques"));
  const [aoVivo, setAoVivo] = useState(false);
  const [versao, setVersao] = useState(0);
  const resumo = resumos.get(id);
  const { sessao } = useSessao();
  const usuario = sessao?.user.id ?? "";
  const [stories, setStories] = useState<GrupoStories[]>([]);
  const [visorAberto, setVisorAberto] = useState(false);
  const [navegando, setNavegando] = useState(false);
  const [comoEsta, setComoEsta] = useState(false);
  const [mais, setMais] = useState(false);
  const [compartilhando, setCompartilhando] = useState(false);
  const [aviso, setAviso] = useState("");
  const [pos, setPos] = useState<[number, number] | null>(null);
  const { agora, recarregar: recarregarAgora } = useAgora(id);
  const { presenca, recarregar: recarregarPresenca } = useMinhaPresenca(id, usuario);

  // Chat ao vivo aberto agora?
  useEffect(() => {
    if (!usuario) return;
    supabase.rpc("sala_ao_vivo", { p_estab: id }).then(({ data }) => setAoVivo(!!data));
    capturarRef("lugar", id);
  }, [id, usuario]);
  useEffect(() => {
    if (params.get("checkin") || params.get("aba")) setParams({}, { replace: true });
    posicaoSeLiberada().then(setPos);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!usuario) return;
    void supabase.rpc("registrar_visita", { p_estab: id });
    buscarStories(usuario, id).then(setStories);
  }, [id, usuario]);

  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(""), 3500);
    return () => window.clearTimeout(t);
  }, [aviso]);

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
  const endereco = [lugar.endereco, lugar.bairro].filter(Boolean).join(" · ");
  const distancia = pos && ponto ? km(distanciaKm(pos, ponto)) : null;
  const hoje = lugar.horarios.find((h) => h.dia_semana === new Date().getDay());
  const linhaHorario = lugar.horarios.length
    ? `${resumoHorario(lugar.horarios)}${aberto && hoje ? ` · ${horaCurta(hoje.abre)} às ${horaCurta(hoje.fecha)}` : ""}`
    : "";
  const abas: { valor: Aba; nome: string }[] = [
    { valor: "destaques", nome: "Destaques" },
    { valor: "programacao", nome: "Programação" },
    ...(itens.length ? [{ valor: "cardapio" as Aba, nome: "Cardápio" }] : []),
    { valor: "fotos", nome: "Fotos" },
  ];

  const abrirMensagem = () =>
    exigirLogin() &&
    abrirConversaEstab(lugar.id)
      .then((c) => navegar(`/chat/${c}`))
      .catch((e) => window.alert(mensagemDeErro(e)));

  const trocarAba = (a: Aba) => {
    setAba(a);
    document.getElementById("abas-lugar")?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <article className="pb-6">
      {/* Capa */}
      <div className="relative">
        {capa ? (
          <img src={capa} alt={`Foto de ${lugar.nome}`} className="aspect-[4/3] max-h-[360px] w-full object-cover sm:aspect-[16/9]" />
        ) : (
          <div className="flex aspect-[16/9] w-full items-center justify-center bg-elevado text-suave">
            <Store className="h-8 w-8" />
          </div>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-fundo to-transparent" />
        <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3">
          <button onClick={() => navegar(-1)} className="rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Voltar">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <span className="flex-1" />
          <button onClick={() => exigirLogin() && setCompartilhando(true)} className="rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Compartilhar">
            <Share2 className="h-5 w-5" />
          </button>
          <button
            onClick={() => exigirLogin() && void relacao.alternarSalvo().then(() => setAviso(relacao.salvo ? "Tirado dos salvos." : "Salvo. Está no seu perfil, em Salvos."))}
            aria-pressed={relacao.salvo}
            className="rounded-full bg-black/45 p-2 text-white backdrop-blur"
            aria-label={relacao.salvo ? "Tirar dos salvos" : "Salvar"}
          >
            <Bookmark className={clsx("h-5 w-5", relacao.salvo && "fill-current")} />
          </button>
          <button onClick={() => setMais(true)} className="rounded-full bg-black/45 p-2 text-white backdrop-blur" aria-label="Mais opções">
            <MoreHorizontal className="h-5 w-5" />
          </button>
        </div>
        {imagens.length > 1 && (
          <div className="absolute bottom-6 right-4 flex gap-1.5">
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

      {/* Nível 1: decidir */}
      <div className="relative -mt-12 px-4">
        <button
          type="button"
          onClick={() => stories.length > 0 && setVisorAberto(true)}
          disabled={stories.length === 0}
          aria-label={stories.length ? `Ver stories de ${lugar.nome}` : undefined}
          className={clsx("rounded-full p-[3px]", stories.length ? (stories[0].vistos ? "bg-borda" : "bg-magenta") : "bg-fundo")}
        >
          <span className="flex h-[76px] w-[76px] items-center justify-center overflow-hidden rounded-full border-[3px] border-fundo bg-superficie">
            {lugar.logo_url ? <img src={lugar.logo_url} alt={`Logo de ${lugar.nome}`} className="h-full w-full object-cover" /> : <Store className="h-7 w-7 text-suave" />}
          </span>
        </button>

        <h1 className="mt-2 text-[24px] font-semibold leading-tight">{lugar.nome}</h1>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-sm text-suave">
          <span>{[lugar.categoria?.nome, ...vibes.slice(0, 2), lugar.faixa_preco ? "$".repeat(lugar.faixa_preco) : null].filter(Boolean).join(" · ")}</span>
          {resumo && resumo.avaliacoes > 0 && (
            <>
              <span>·</span>
              <NotaCompacta nota={resumo.nota} total={resumo.avaliacoes} />
            </>
          )}
        </p>

        <ul className="mt-2.5 space-y-1 text-sm">
          {(endereco || distancia) && (
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
              <span>{[distancia, endereco].filter(Boolean).join(" · ")}</span>
            </li>
          )}
          {linhaHorario && (
            <li className="flex items-center gap-2">
              <span className={clsx("ml-1 mr-1 h-2 w-2 shrink-0 rounded-full", aberto ? "bg-ok" : "bg-suave")} />
              <span className={clsx(aberto ? "font-medium text-ok" : "text-suave")}>{linhaHorario}</span>
            </li>
          )}
        </ul>

        {agora?.amigos && (
          <div className="mt-3">
            <AmigosAqui amigos={agora.amigos} />
          </div>
        )}

        {presenca && (
          <PresencaAtiva
            visibilidade={presenca.visibilidade}
            mudar={(v) =>
              void mudarPresenca(lugar.id, v)
                .then(recarregarPresenca)
                .catch((e) => setAviso(mensagemDeErro(e)))
            }
            sair={() =>
              void sairDoLugar(lugar.id)
                .then(() => {
                  void recarregarPresenca();
                  void recarregarAgora();
                  setAviso("Pronto, você saiu deste lugar.");
                })
                .catch((e) => setAviso(mensagemDeErro(e)))
            }
          />
        )}

        <div className="mt-4 grid grid-cols-[1fr_auto] gap-2">
          <button onClick={() => exigirLogin() && navegar(`/lugar/${lugar.id}/role`)} className="botao-principal h-11 rounded-full text-[15px]">
            <PartyPopper className="h-4 w-4" />
            Marcar rolê
          </button>
          <button
            onClick={() => exigirLogin() && void relacao.alternarSeguir().then(recarregar)}
            aria-pressed={relacao.seguindo}
            className={clsx("botao h-11 rounded-full px-5", relacao.seguindo ? "bg-elevado" : "border-marca text-destaque")}
          >
            {relacao.seguindo ? "Seguindo" : "Seguir"}
            {resumo && resumo.seguidores > 0 && <span className="font-normal text-suave">· {resumo.seguidores}</span>}
          </button>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button onClick={() => exigirLogin() && setCompartilhando(true)} className="botao h-10 rounded-full">
            <Share2 className="h-4 w-4" />
            Compartilhar
          </button>
          <button onClick={() => setMais(true)} className="botao h-10 rounded-full">
            <MoreHorizontal className="h-4 w-4" />
            Mais
          </button>
        </div>

        <div className="mt-4 space-y-2">
          {aoVivo && (
            <Link to={`/ao-vivo/${lugar.id}`} className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-perigo/40 bg-perigo/10 text-[15px] font-semibold text-perigo">
              <span className="h-2 w-2 animate-pulse rounded-full bg-perigo" />
              Chat ao vivo agora
            </Link>
          )}
          <CartaoComoEsta agora={agora} abrir={() => setComoEsta(true)} />
        </div>
      </div>

      {/* Nível 2: explorar */}
      <nav id="abas-lugar" className="sticky top-0 z-20 mt-5 scroll-mt-0 border-b border-borda bg-fundo/95 backdrop-blur" aria-label="Seções do lugar">
        <div className="flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]">
          {abas.map((a) => (
            <button
              key={a.valor}
              onClick={() => setAba(a.valor)}
              aria-current={aba === a.valor ? "page" : undefined}
              className={clsx(
                "relative shrink-0 px-3 py-3 text-sm font-medium",
                aba === a.valor ? "text-texto after:absolute after:inset-x-3 after:bottom-0 after:h-0.5 after:rounded-full after:bg-marca" : "text-suave",
              )}
            >
              {a.nome}
            </button>
          ))}
        </div>
      </nav>

      <div className="pt-5">
        {aba === "destaques" && (
          <AbaDestaques
            dados={dados}
            versao={versao}
            usuario={usuario}
            eventos={eventos}
            aoAvaliar={() => void recarregar()}
            irPara={trocarAba}
          />
        )}
        {aba === "programacao" && <AbaProgramacao eventos={eventos} />}
        {aba === "cardapio" && <AbaCardapio estab={lugar.id} categorias={categorias} itens={itens} />}
        {aba === "fotos" && <AbaFotos estab={lugar.id} fotos={fotos} stories={stories} abrirStories={() => setVisorAberto(true)} />}
      </div>

      {/* Nível 3: sob demanda */}
      {mais && (
        <Folha titulo={lugar.nome} fechar={() => setMais(false)}>
          <ItemFolha icone={MessageCircle} texto="Mandar mensagem" acao={() => (setMais(false), abrirMensagem())} />
          {ponto ? (
            <ItemFolha icone={Navigation} texto="Como chegar" acao={() => (setMais(false), setNavegando(true))} />
          ) : (
            <a href={rota} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-elevado">
              <Navigation className="h-5 w-5 text-destaque" />
              Como chegar
            </a>
          )}
          {presenca ? (
            <ItemFolha icone={LogOut} texto="Saí deste lugar" acao={() => void sairDoLugar(lugar.id).then(() => (setMais(false), recarregarPresenca(), recarregarAgora()))} />
          ) : (
            <ItemFolha icone={MapPinned} texto="Fazer check-in" detalhe="Conta para o movimento e mostra aos amigos que você está aqui" acao={() => exigirLogin() && (setMais(false), setCheckinAberto(true))} />
          )}
          <ItemFolha
            icone={Bookmark}
            texto={relacao.salvo ? "Tirar dos salvos" : "Salvar"}
            acao={() => exigirLogin() && void relacao.alternarSalvo().then(() => setMais(false))}
          />
          <ItemFolha
            icone={Copy}
            texto="Copiar link"
            acao={() =>
              void compartilhar(lugar.nome, linkDivulgacao("lugar", lugar.id)).then((r) => {
                setMais(false);
                setAviso(r === "copiado" ? "Link copiado." : "Link compartilhado.");
              })
            }
          />
          {lugar.telefone && (
            <a href={`tel:${lugar.telefone.replace(/\D/g, "")}`} className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-elevado">
              <Phone className="h-5 w-5 text-destaque" />
              Ligar · {lugar.telefone}
            </a>
          )}
          {lugar.instagram && (
            <a href={`https://instagram.com/${lugar.instagram}`} target="_blank" rel="noreferrer" className="flex w-full items-center gap-3 px-5 py-3.5 hover:bg-elevado">
              <AtSign className="h-5 w-5 text-destaque" />
              Instagram · @{lugar.instagram}
            </a>
          )}
        </Folha>
      )}

      {comoEsta && (
        <FolhaComoEsta
          nome={lugar.nome}
          estab={lugar.id}
          agora={agora}
          ponto={ponto}
          presente={!!presenca}
          fechar={() => setComoEsta(false)}
          verProgramacao={() => trocarAba("programacao")}
          aoMudar={() => void recarregarAgora()}
        />
      )}
      {compartilhando && <CompartilharNoChat tipo="lugar" id={lugar.id} titulo={lugar.nome} fechar={() => setCompartilhando(false)} enviado={setAviso} />}
      {checkinAberto && (
        <FolhaCheckin
          estabelecimentoId={lugar.id}
          nome={lugar.nome}
          vibes={vibes}
          fechar={() => setCheckinAberto(false)}
          concluido={() => {
            setVersao((v) => v + 1);
            void recarregar();
            void recarregarPresenca();
            void recarregarAgora();
          }}
        />
      )}
      {navegando && ponto && <Navegacao destino={{ nome: lugar.nome, lat: ponto[0], lng: ponto[1] }} fechar={() => setNavegando(false)} />}
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
      {aviso && (
        <div role="status" className="fixed inset-x-4 bottom-24 z-[90] mx-auto max-w-sm rounded-xl bg-texto px-4 py-3 text-center text-sm text-fundo shadow-lg">
          {aviso}
        </div>
      )}
    </article>
  );
}

function PresencaAtiva({ visibilidade, mudar, sair }: { visibilidade: Visibilidade; mudar: (v: Visibilidade) => void; sair: () => void }) {
  const [aberto, setAberto] = useState(false);
  const atual = VISIBILIDADES.find((v) => v.valor === visibilidade)!;
  return (
    <div className="mt-3 rounded-xl border border-ok/40 bg-ok/10 px-3 py-2.5 text-sm">
      <div className="flex items-center gap-2">
        <MapPinned className="h-4 w-4 shrink-0 text-ok" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">Você está aqui</span>
          <span className="text-suave"> · {atual.nome.toLowerCase()}</span>
        </span>
        <button onClick={() => setAberto(!aberto)} className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-destaque" aria-expanded={aberto}>
          Mudar <ChevronDown className={clsx("h-3.5 w-3.5 transition-transform", aberto && "rotate-180")} />
        </button>
        <button onClick={sair} className="ml-2 text-[13px] font-semibold text-perigo">
          Saí
        </button>
      </div>
      {aberto && (
        <div className="mt-2 grid grid-cols-3 gap-1.5">
          {VISIBILIDADES.map((v) => (
            <button
              key={v.valor}
              onClick={() => {
                mudar(v.valor);
                setAberto(false);
              }}
              aria-pressed={v.valor === visibilidade}
              title={v.texto}
              className={clsx("rounded-lg border px-2 py-1.5 text-[13px] font-medium", v.valor === visibilidade ? "border-marca bg-destaque-suave text-destaque" : "border-borda bg-superficie")}
            >
              {v.nome}
            </button>
          ))}
          <p className="col-span-3 text-[12px] text-suave">{atual.texto}</p>
        </div>
      )}
    </div>
  );
}

function Folha({ titulo, fechar, children }: { titulo: string; fechar: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [fechar]);
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 sm:items-center" role="dialog" aria-modal="true" aria-label={titulo} onClick={fechar}>
      <div className="folha max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-superficie pb-[max(12px,env(safe-area-inset-bottom))] sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 pb-1 pt-4">
          <h2 className="truncate text-lg font-semibold">{titulo}</h2>
          <button onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ItemFolha({ icone: Icone, texto, detalhe, acao }: { icone: typeof Store; texto: string; detalhe?: string; acao: () => unknown }) {
  return (
    <button onClick={() => void acao()} className="flex w-full items-center gap-3 px-5 py-3.5 text-left hover:bg-elevado">
      <Icone className="h-5 w-5 shrink-0 text-destaque" />
      <span className="min-w-0 flex-1">
        <span className="block">{texto}</span>
        {detalhe && <span className="block text-[12px] text-suave">{detalhe}</span>}
      </span>
    </button>
  );
}

function CartaoEvento({ e }: { e: EventoResumo }) {
  return (
    <Link to={`/evento/${e.id}`} className="cartao flex items-center gap-3 p-2.5 hover:bg-elevado">
      {e.capa_url ? (
        <img src={e.capa_url} alt="" className="h-[72px] w-20 shrink-0 rounded-lg object-cover" loading="lazy" />
      ) : (
        <span className="flex h-[72px] w-20 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
          <CalendarDays className="h-5 w-5" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] text-suave">{quando(e.inicio)}</span>
        <span className="block truncate font-semibold">{e.nome}</span>
        <span className="block truncate text-[13px] text-suave">{e.entrada || e.descricao || "Ver detalhes"}</span>
      </span>
      <ChevronRight className="h-4 w-4 shrink-0 text-suave" />
    </Link>
  );
}

const rodandoOuHoje = (e: EventoResumo) => ehHoje(e.inicio) || (Date.parse(e.inicio) < Date.now() && (!e.fim || Date.parse(e.fim) > Date.now()));

function AbaDestaques({
  dados,
  versao,
  usuario,
  eventos,
  aoAvaliar,
  irPara,
}: {
  dados: Dados;
  versao: number;
  usuario: string;
  eventos: EventoResumo[];
  aoAvaliar: () => void;
  irPara: (a: Aba) => void;
}) {
  const lugar = dados.lugar!;
  const [descricaoInteira, setDescricaoInteira] = useState(false);
  const [horarios, setHorarios] = useState(false);
  const destaques = dados.itens.filter((i) => i.destaque);
  const deHoje = eventos.filter(rodandoOuHoje);
  const proximo = deHoje[0] ?? eventos[0];
  const ponto: [number, number] | null = lugar.latitude != null && lugar.longitude != null ? [lugar.latitude, lugar.longitude] : null;

  return (
    <div className="space-y-7">
      {lugar.descricao && (
        <section className="px-4">
          <p className={clsx("text-[15px] leading-relaxed", !descricaoInteira && "line-clamp-4")}>{lugar.descricao}</p>
          {lugar.descricao.length > 220 && (
            <button onClick={() => setDescricaoInteira(!descricaoInteira)} className="mt-1 text-sm font-semibold text-destaque">
              {descricaoInteira ? "Ver menos" : "Ver mais"}
            </button>
          )}
        </section>
      )}

      {proximo && (
        <section className="px-4">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-[17px] font-semibold">{deHoje.length ? "Hoje" : "Próximo evento"}</h2>
            {eventos.length > 1 && (
              <button onClick={() => irPara("programacao")} className="text-sm font-semibold text-destaque">
                Ver programação
              </button>
            )}
          </div>
          <CartaoEvento e={proximo} />
        </section>
      )}

      <BeneficiosLugar estabelecimentoId={lugar.id} versao={versao} />
      {usuario && <ListasPresenca estab={lugar.id} evento={null} className="px-4" />}

      {destaques.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between px-4">
            <h2 className="text-[17px] font-semibold">Os mais pedidos</h2>
            <button onClick={() => irPara("cardapio")} className="text-sm font-semibold text-destaque">
              Ver cardápio
            </button>
          </div>
          <ul className="flex gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
            {destaques.map((i) => (
              <li key={i.id} className="cartao w-36 shrink-0 overflow-hidden">
                {i.foto_url ? (
                  <img src={i.foto_url} alt="" className="aspect-square w-full object-cover" loading="lazy" />
                ) : (
                  <div className="flex aspect-square w-full items-center justify-center bg-elevado text-suave">
                    <UtensilsCrossed className="h-6 w-6" />
                  </div>
                )}
                <div className="p-2.5">
                  <p className="truncate text-sm font-medium">{i.nome}</p>
                  {i.preco != null && <p className="codigo mt-0.5 text-sm text-destaque">{reais(i.preco)}</p>}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <SecaoAvaliacoes estabelecimentoId={lugar.id} versao={versao} aoMudar={aoAvaliar} />

      {/* Informações práticas: abertas só quando a pessoa precisa */}
      <section className="px-4">
        <h2 className="mb-3 text-[17px] font-semibold">Informações</h2>
        <div className="cartao divide-y divide-borda text-sm">
          {lugar.horarios.length > 0 && (
            <div>
              <button onClick={() => setHorarios(!horarios)} className="flex w-full items-center gap-3 px-4 py-3 text-left" aria-expanded={horarios}>
                <Clock className="h-4 w-4 shrink-0 text-suave" />
                <span className="flex-1">Horários de funcionamento</span>
                <ChevronDown className={clsx("h-4 w-4 text-suave transition-transform", horarios && "rotate-180")} />
              </button>
              {horarios && (
                <ul className="px-4 pb-3">
                  {DIAS.map((dia, i) => {
                    const h = lugar.horarios.find((x) => x.dia_semana === i);
                    return (
                      <li key={dia} className={clsx("flex justify-between py-1", new Date().getDay() === i && "font-semibold")}>
                        <span>{dia}</span>
                        <span className={clsx("codigo", !h && "text-suave")}>{h ? `${hhmm(h.abre)} às ${hhmm(h.fecha)}` : "Fechado"}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
          {(lugar.endereco || lugar.bairro) && (
            <div className="flex items-start gap-3 px-4 py-3">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-suave" />
              <span>{[lugar.endereco, lugar.bairro, "Uberlândia-MG"].filter(Boolean).join(", ")}</span>
            </div>
          )}
          {ponto && (
            <div className="h-40 overflow-hidden">
              <MapaBase centro={ponto} zoom={16} className="h-full w-full">
                <PinMapa posicao={ponto} tamanho="grande" titulo={lugar.nome} />
              </MapaBase>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function AbaProgramacao({ eventos }: { eventos: EventoResumo[] }) {
  const deHoje = eventos.filter(rodandoOuHoje);
  const proximos = eventos.filter((e) => !rodandoOuHoje(e));
  const [sub, setSub] = useState<"hoje" | "proximos">(deHoje.length || !proximos.length ? "hoje" : "proximos");
  const lista = sub === "hoje" ? deHoje : proximos;
  return (
    <div className="px-4">
      <div className="mb-4 grid grid-cols-2 rounded-full bg-elevado p-1 text-sm font-medium">
        {(["hoje", "proximos"] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} className={clsx("rounded-full py-2", sub === s ? "bg-superficie shadow-sm" : "text-suave")}>
            {s === "hoje" ? `Hoje${deHoje.length ? ` (${deHoje.length})` : ""}` : `Próximos dias${proximos.length ? ` (${proximos.length})` : ""}`}
          </button>
        ))}
      </div>
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-suave">{sub === "hoje" ? "Nenhum evento hoje." : "Nenhum evento marcado nos próximos dias."}</p>
      ) : (
        <ul className="space-y-2.5">
          {lista.map((e) => (
            <li key={e.id}>
              <CartaoEvento e={e} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AbaCardapio({ estab, categorias, itens }: { estab: string; categorias: Dados["categorias"]; itens: Dados["itens"] }) {
  const grupos = agruparCardapio(categorias, itens);
  const [filtro, setFiltro] = useState<string>("todos");
  const visiveis = filtro === "todos" ? grupos : grupos.filter((g) => g.id === filtro);
  return (
    <div>
      {grupos.length > 1 && (
        <div className="mb-4 flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]">
          {[{ id: "todos", nome: "Todos" }, ...grupos].map((g) => (
            <button
              key={g.id}
              onClick={() => setFiltro(g.id)}
              className={clsx("h-8 shrink-0 rounded-full border px-3.5 text-[13px] font-medium", filtro === g.id ? "border-marca bg-destaque-suave text-destaque" : "border-borda text-suave")}
            >
              {g.nome}
            </button>
          ))}
        </div>
      )}
      <div className="space-y-6 px-4">
        {visiveis.map((g) => (
          <section key={g.id}>
            <h2 className="mb-2 text-[17px] font-semibold">{g.nome}</h2>
            <ul className="space-y-2">
              {g.itens.slice(0, filtro === "todos" ? 4 : undefined).map((i) => (
                <li key={i.id} className={clsx("cartao flex items-center gap-3 p-2.5", i.esgotado && "opacity-60")}>
                  {i.foto_url ? (
                    <img src={i.foto_url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-lg bg-elevado text-suave">
                      <UtensilsCrossed className="h-5 w-5" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{i.nome}</p>
                    {i.descricao && <p className="line-clamp-2 text-[13px] text-suave">{i.descricao}</p>}
                    <p className="mt-0.5 text-sm">
                      {i.preco != null && <span className="codigo font-semibold">{reais(i.preco)}</span>}
                      {i.esgotado && <span className="ml-2 text-[12px] font-medium text-perigo">Esgotado</span>}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
            {filtro === "todos" && g.itens.length > 4 && (
              <button onClick={() => setFiltro(g.id)} className="botao mt-2 h-10 w-full rounded-full">
                Ver mais {g.itens.length - 4}
              </button>
            )}
          </section>
        ))}
        <Link to={`/lugar/${estab}/cardapio`} className="botao-principal h-11 w-full rounded-full">
          <UtensilsCrossed className="h-4 w-4" />
          Abrir cardápio completo
        </Link>
      </div>
    </div>
  );
}

function AbaFotos({
  estab,
  fotos,
  stories,
  abrirStories,
}: {
  estab: string;
  fotos: Dados["fotos"];
  stories: GrupoStories[];
  abrirStories: () => void;
}) {
  const [sub, setSub] = useState<"destaques" | "fotos" | "stories">("destaques");
  const [comunidade, setComunidade] = useState<FotoGrade[]>([]);
  const [daCasa, setDaCasa] = useState<FotoGrade[]>([]);
  const [ampliada, setAmpliada] = useState<FotoGrade | null>(null);

  useEffect(() => {
    // Publicações da comunidade marcadas no lugar e publicações da própria casa (com foto).
    Promise.all([
      supabase.from("publicacoes_pessoas").select("id, foto_url").eq("estabelecimento_id", estab).eq("oculto", false).order("criado_em", { ascending: false }).limit(30),
      supabase.from("publicacoes").select("id, foto_url").eq("estabelecimento_id", estab).eq("situacao", "publicada").not("foto_url", "is", null).order("criado_em", { ascending: false }).limit(30),
    ]).then(([p, c]) => {
      setComunidade(((p.data ?? []) as { id: string; foto_url: string }[]).map((x) => ({ id: x.id, url: x.foto_url, tipo: "comunidade" })));
      setDaCasa(((c.data ?? []) as { id: string; foto_url: string }[]).map((x) => ({ id: `p-${x.id}`, url: x.foto_url, tipo: "casa" })));
    });
  }, [estab]);

  const casa = useMemo(() => [...fotos.map((f) => ({ id: f.id, url: f.url, tipo: "casa" as const })), ...daCasa], [fotos, daCasa]);
  const storiesDaCasa: FotoGrade[] = (stories[0]?.stories ?? []).map((s) => ({ id: s.id, url: s.foto_url, tipo: "story" }));
  const lista = sub === "fotos" ? casa : sub === "stories" ? storiesDaCasa : [...casa.slice(0, 4), ...comunidade].slice(0, 24);

  return (
    <div className="px-4">
      <div className="mb-4 grid grid-cols-3 rounded-full bg-elevado p-1 text-sm font-medium">
        {(["destaques", "fotos", "stories"] as const).map((s) => (
          <button key={s} onClick={() => setSub(s)} className={clsx("rounded-full py-2 capitalize", sub === s ? "bg-superficie shadow-sm" : "text-suave")}>
            {s === "destaques" ? "Destaques" : s === "fotos" ? "Fotos" : "Stories"}
          </button>
        ))}
      </div>
      {sub === "destaques" && comunidade.length > 0 && <p className="-mt-1 mb-3 text-[13px] text-suave">Fotos da casa e de quem passou por aqui.</p>}
      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-suave">{sub === "stories" ? "Sem stories nas últimas 24 h." : "Ainda não há fotos."}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {lista.map((f, i) => (
            <li key={f.id} className={clsx(sub === "destaques" && i === 0 && "col-span-2 sm:col-span-3")}>
              <button
                onClick={() => (f.tipo === "story" ? abrirStories() : setAmpliada(f))}
                className="relative block w-full overflow-hidden rounded-xl bg-elevado"
              >
                <img src={f.url} alt="" loading="lazy" className={clsx("w-full object-cover", sub === "destaques" && i === 0 ? "aspect-[16/9]" : f.tipo === "story" ? "aspect-[9/16]" : "aspect-square")} />
                {f.tipo === "story" && (
                  <span className="absolute bottom-2 left-2 rounded-full bg-black/55 p-1.5 text-white">
                    <Play className="h-3.5 w-3.5 fill-current" />
                  </span>
                )}
                {f.tipo === "comunidade" && <span className="absolute bottom-2 left-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] text-white">Comunidade</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {ampliada && (
        <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/90 p-4" role="dialog" aria-modal="true" aria-label="Foto" onClick={() => setAmpliada(null)}>
          <img src={ampliada.url} alt="" className="max-h-full max-w-full rounded-lg object-contain" />
          <button className="absolute right-4 top-4 rounded-full bg-white/15 p-2 text-white" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>
      )}
    </div>
  );
}
