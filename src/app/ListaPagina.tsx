import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays, Check, ClipboardList, Megaphone, Minus, Plus, Share2, Store } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { CompartilharNoChat } from "@/components/CompartilharNoChat";
import { mensagemDeErro } from "@/lib/supabase";
import { capturarRefLista, ListaPublica, listaPublica, meuCodigoPromoter, refGuardado, rpc } from "@/lib/promoters";
import { quando } from "./dados";

/** Página da lista de presença (link do promoter): entrar com acompanhantes sem precisar procurar o evento. */
export function ListaPagina() {
  const { id = "" } = useParams();
  const navegar = useNavigate();
  const [lista, setLista] = useState<ListaPublica | null | undefined>(undefined);
  const [acomp, setAcomp] = useState(0);
  const [erro, setErro] = useState("");
  const [ok, setOk] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [compartilhar, setCompartilhar] = useState(false);
  const [codigo, setCodigo] = useState<string | null>(null);

  const carregar = useCallback(async () => {
    try {
      const l = await listaPublica(id);
      setLista(l);
      if (l?.meus_acompanhantes != null) setAcomp(l.meus_acompanhantes);
      return l;
    } catch (e) {
      setErro(mensagemDeErro(e));
      setLista(null);
      return null;
    }
  }, [id]);

  useEffect(() => {
    void carregar().then((l) => {
      if (!l) return;
      document.title = `${l.nome} · RoVibes`;
      capturarRefLista(l.evento ? "evento" : "lugar", l.evento?.id ?? l.estab.id);
      void meuCodigoPromoter(l.estab.id).then(setCodigo);
    });
  }, [carregar]);

  if (lista === undefined) return <Carregando />;
  if (!lista)
    return (
      <div className="px-6 py-16 text-center">
        <p className="font-medium">Lista não encontrada</p>
        <p className="mt-1 text-sm text-suave">{erro || "Ela pode ter sido apagada."}</p>
        <Link to="/" className="botao mt-5">
          Ir para o início
        </Link>
      </div>
    );

  const cheia = lista.limite != null && lista.inscritos - (lista.eu_estou ? 1 + (lista.meus_acompanhantes ?? 0) : 0) + 1 + acomp > lista.limite;

  const entrar = async () => {
    setOcupado(true);
    setErro("");
    try {
      await rpc("entrar_na_lista", { p_lista: lista.id, p_acompanhantes: acomp, p_ref: new URLSearchParams(window.location.search).get("ref") ?? refGuardado() });
      setOk(lista.eu_estou ? "Acompanhantes atualizados." : "Seu nome está na lista! É só falar seu nome na portaria.");
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setOcupado(false);
  };
  const sair = async () => {
    if (!window.confirm("Tirar seu nome da lista?")) return;
    try {
      await rpc("sair_da_lista", { p_lista: lista.id });
      setOk("Seu nome saiu da lista.");
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
  };

  return (
    <article className="pb-6">
      <div className="relative">
        {lista.evento?.capa_url ? (
          <img src={lista.evento.capa_url} alt="" className="aspect-[16/9] w-full object-cover" />
        ) : (
          <div className="flex aspect-[16/7] w-full items-center justify-center bg-destaque-suave text-destaque">
            <ClipboardList className="h-10 w-10" />
          </div>
        )}
        <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/"))} className="absolute left-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={() => setCompartilhar(true)} className="absolute right-3 top-3 rounded-full bg-superficie/90 p-2 shadow-sm" aria-label="Compartilhar lista">
          <Share2 className="h-5 w-5" />
        </button>
      </div>

      <div className="space-y-5 px-4 pt-4">
        <header>
          <p className="text-[12px] font-semibold uppercase tracking-wide text-destaque">Lista de presença</p>
          <h1 className="text-[22px] font-semibold leading-tight">{lista.nome}</h1>
          {lista.beneficio && <p className="mt-1 font-medium text-magenta">{lista.beneficio}</p>}
          {lista.promoter && (
            <p className="mt-1 inline-flex items-center gap-1.5 text-sm text-suave">
              <Megaphone className="h-4 w-4" />
              Promoter: {lista.promoter}
            </p>
          )}
        </header>

        <ul className="cartao divide-y divide-borda text-sm">
          {lista.evento && (
            <li>
              <Link to={`/evento/${lista.evento.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
                <CalendarDays className="h-4 w-4 text-destaque" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{lista.evento.nome}</span>
                  <span className="block text-suave">{quando(lista.evento.inicio)}</span>
                </span>
              </Link>
            </li>
          )}
          <li>
            <Link to={`/lugar/${lista.estab.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
              <Store className="h-4 w-4 text-destaque" />
              <span className="min-w-0 flex-1 truncate">
                {lista.estab.nome}
                {lista.estab.bairro ? ` · ${lista.estab.bairro}` : ""}
              </span>
            </Link>
          </li>
          <li className="px-4 py-3 text-suave">
            {lista.limite ? `${lista.inscritos} de ${lista.limite} nomes` : `${lista.inscritos} nomes na lista`}
            {lista.encerra_em ? ` · até ${new Date(lista.encerra_em).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : ""}
          </li>
        </ul>

        {!lista.aberta ? (
          <p className="cartao px-4 py-6 text-center text-sm text-suave">Esta lista está encerrada.</p>
        ) : (
          <section className="cartao space-y-4 p-4">
            {lista.eu_estou && (
              <p className="flex items-center gap-2 font-semibold text-ok">
                <Check className="h-5 w-5" />
                Seu nome está na lista
              </p>
            )}
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm">Acompanhantes</span>
              <span className="inline-flex items-center gap-2">
                <button className="botao h-9 w-9 px-0" onClick={() => setAcomp((a) => Math.max(0, a - 1))} aria-label="Menos">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="codigo w-6 text-center font-semibold">{acomp}</span>
                <button className="botao h-9 w-9 px-0" onClick={() => setAcomp((a) => Math.min(10, a + 1))} aria-label="Mais">
                  <Plus className="h-4 w-4" />
                </button>
              </span>
            </div>
            <button className="botao-principal h-11 w-full" disabled={ocupado || cheia || (lista.eu_estou && acomp === (lista.meus_acompanhantes ?? 0))} onClick={() => void entrar()}>
              {cheia ? "Lista cheia" : lista.eu_estou ? "Atualizar acompanhantes" : "Colocar meu nome na lista"}
            </button>
            {lista.eu_estou && (
              <button className="w-full text-center text-sm text-suave hover:text-perigo" onClick={() => void sair()}>
                Tirar meu nome
              </button>
            )}
          </section>
        )}
        {ok && <p className="rounded-cartao border border-ok/40 bg-ok/10 px-4 py-3 text-sm text-ok">{ok}</p>}
        {erro && <p className="text-sm text-perigo">{erro}</p>}
      </div>

      {compartilhar && (
        <CompartilharNoChat tipo="lista" id={lista.id} titulo={lista.nome} codigo={codigo ?? lista.promoter_codigo} fechar={() => setCompartilhar(false)} enviado={setOk} />
      )}
    </article>
  );
}
