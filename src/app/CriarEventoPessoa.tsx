import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import clsx from "clsx";
import { ArrowLeft, ImagePlus, LocateFixed, Plus, Trash2 } from "lucide-react";
import { Carregando } from "@/components/Carregando";
import { MapaBase, PinMapa, Recentralizar, UBERLANDIA } from "@/components/MapaBase";
import { reais } from "@/components/Formulario";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { reduzirImagem } from "@/lib/imagens";
import { buscarEventoPessoa, buscarRegras, RegrasEventos, salvarEventoPessoa, TIPOS_EVENTO, TipoEventoPessoa, VisibilidadeEvento, VISIBILIDADES_EVENTO } from "@/lib/eventosPessoa";
import { pedirLocalizacao } from "./dados";

interface CotaForm {
  id?: string;
  nome: string;
  descricao: string;
  preco: string;
  quantidade: string;
}

const local = (iso: string | null) => {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const numero = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

/** Criar (ou editar) um evento pessoal: churrasco, aniversário, comemoração... com ingressos e anfitrião. */
export function CriarEventoPessoa() {
  const { id } = useParams();
  const navegar = useNavigate();
  const { sessao } = useSessao();
  const eu = sessao!.user.id;
  const [regras, setRegras] = useState<RegrasEventos | null | undefined>(undefined);
  const [carregado, setCarregado] = useState(!id);
  const [tipo, setTipo] = useState<TipoEventoPessoa>("churrasco");
  const [titulo, setTitulo] = useState("");
  const [descricao, setDescricao] = useState("");
  const [capa, setCapa] = useState<string | null>(null);
  const [enviandoCapa, setEnviandoCapa] = useState(false);
  const [data, setData] = useState("");
  const [hora, setHora] = useState("20:00");
  const [horaFim, setHoraFim] = useState("");
  const [localNome, setLocalNome] = useState("");
  const [endereco, setEndereco] = useState("");
  const [bairro, setBairro] = useState("");
  const [ponto, setPonto] = useState<[number, number] | null>(null);
  const [centro, setCentro] = useState<[number, number] | null>(null);
  const [visibilidade, setVisibilidade] = useState<VisibilidadeEvento>("amigos");
  const [cotas, setCotas] = useState<CotaForm[]>([{ nome: "Cota", descricao: "", preco: "", quantidade: "20" }]);
  const [aceito, setAceito] = useState(false);
  const [jaAceitou, setJaAceitou] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const seletor = useRef<HTMLInputElement>(null);

  useEffect(() => {
    buscarRegras().then(setRegras);
  }, []);
  useEffect(() => {
    if (!id) return;
    buscarEventoPessoa(id)
      .then((e) => {
        if (!e || !e.sou_anfitriao) return navegar("/", { replace: true });
        setTipo(e.tipo);
        setTitulo(e.titulo);
        setDescricao(e.descricao ?? "");
        setCapa(e.capa_url);
        const ini = local(e.inicio);
        setData(ini.data);
        setHora(ini.hora);
        setHoraFim(e.fim ? local(e.fim).hora : "");
        setLocalNome(e.local_nome ?? "");
        setEndereco(e.endereco ?? "");
        setBairro(e.bairro ?? "");
        if (e.latitude != null && e.longitude != null) {
          setPonto([e.latitude, e.longitude]);
          setCentro([e.latitude, e.longitude]);
        }
        setVisibilidade(e.visibilidade);
        setCotas(e.cotas.map((c) => ({ id: c.id, nome: c.nome, descricao: c.descricao ?? "", preco: c.preco ? String(c.preco).replace(".", ",") : "", quantidade: String(c.quantidade) })));
        setJaAceitou(e.cotas.some((c) => c.preco > 0));
        setCarregado(true);
      })
      .catch((e) => {
        setErro(mensagemDeErro(e));
        setCarregado(true);
      });
  }, [id, navegar]);

  const pago = cotas.some((c) => numero(c.preco) > 0);
  const taxa = regras?.taxa_pct ?? 0;
  const exemplo = useMemo(() => cotas.find((c) => numero(c.preco) > 0), [cotas]);

  if (regras === undefined || !carregado) return <Carregando />;
  if (regras === null)
    return <p className="px-6 py-20 text-center text-sm text-suave">A criação de eventos aparece depois que a atualização 037 do banco for aplicada.</p>;
  if (!regras.ativo) return <p className="px-6 py-20 text-center text-sm text-suave">A criação de eventos está pausada no momento. Tente mais tarde.</p>;

  const trocarCapa = async (f: File | undefined) => {
    if (seletor.current) seletor.current.value = "";
    if (!f) return;
    setEnviandoCapa(true);
    setErro("");
    try {
      const blob = await reduzirImagem(f, 1600);
      const caminho = `${eu}/evento-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatares").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      setCapa(supabase.storage.from("avatares").getPublicUrl(caminho).data.publicUrl);
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviandoCapa(false);
  };

  const minhaPosicao = async () => {
    try {
      const p = await pedirLocalizacao(true);
      setPonto(p);
      setCentro(p);
    } catch (e) {
      setErro((e as Error).message);
    }
  };

  const salvar = async () => {
    setErro("");
    if (titulo.trim().length < 3) return setErro("Dê um nome para o evento.");
    if (!data || !hora) return setErro("Escolha o dia e a hora.");
    if (pago && !aceito && !jaAceitou) return setErro("Para vender ingressos, leia e aceite os termos de venda.");
    const inicio = new Date(`${data}T${hora}`);
    let fim: Date | null = null;
    if (horaFim) {
      fim = new Date(`${data}T${horaFim}`);
      if (fim <= inicio) fim = new Date(fim.getTime() + 86400000); // termina no dia seguinte
    }
    setSalvando(true);
    try {
      const novo = await salvarEventoPessoa(
        id ?? null,
        {
          titulo: titulo.trim(),
          tipo,
          descricao: descricao.trim(),
          capa_url: capa ?? "",
          inicio: inicio.toISOString(),
          fim: fim ? fim.toISOString() : "",
          local_nome: localNome.trim(),
          endereco: endereco.trim(),
          bairro: bairro.trim(),
          latitude: ponto ? ponto[0] : "",
          longitude: ponto ? ponto[1] : "",
          visibilidade,
        },
        cotas.map((c) => ({ id: c.id, nome: c.nome.trim(), descricao: c.descricao.trim(), preco: String(numero(c.preco)), quantidade: c.quantidade || "0" })),
        pago && (aceito || jaAceitou) ? regras.termos_versao : null,
      );
      navegar(`/evento-pessoa/${novo}${id ? "" : "?novo=1"}`, { replace: true });
    } catch (e) {
      const m = mensagemDeErro(e);
      if (/termos/i.test(m)) setJaAceitou(false); // os termos mudaram: precisa aceitar a nova versão
      setErro(m);
      setSalvando(false);
    }
  };

  const mudarCota = (i: number, m: Partial<CotaForm>) => setCotas((l) => l.map((c, n) => (n === i ? { ...c, ...m } : c)));
  const chip = (ativo: boolean) => clsx("rounded-xl border p-3 text-left", ativo ? "border-marca bg-destaque-suave" : "border-borda bg-superficie hover:bg-elevado");

  return (
    <div className="mx-auto max-w-xl pb-28">
      <header className="sticky top-14 z-20 flex items-center gap-2 border-b border-borda bg-fundo/95 px-2 py-2 backdrop-blur">
        <button onClick={() => navegar(-1)} className="rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="flex-1 text-[17px] font-semibold">{id ? "Editar evento" : "Criar evento"}</h1>
      </header>

      <div className="space-y-6 px-4 pt-4">
        <section>
          <h2 className="mb-2 font-semibold">Que rolê é esse?</h2>
          <div className="grid grid-cols-2 gap-2">
            {TIPOS_EVENTO.map((t) => (
              <button key={t.valor} onClick={() => setTipo(t.valor)} aria-pressed={tipo === t.valor} className={chip(tipo === t.valor)}>
                <span className="text-2xl">{t.emoji}</span>
                <span className={clsx("mt-1 block text-sm font-semibold", tipo === t.valor && "text-destaque")}>{t.nome}</span>
                <span className="block text-[12px] text-suave">{t.exemplo}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <label className="block">
            <span className="rotulo mb-1 block">Nome do evento</span>
            <input className="entrada" maxLength={80} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder={TIPOS_EVENTO.find((t) => t.valor === tipo)?.exemplo} />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Descrição (o que vai ter, o que levar...)</span>
            <textarea rows={4} maxLength={2000} className="entrada py-2" value={descricao} onChange={(e) => setDescricao(e.target.value)} />
          </label>
          <div>
            <span className="rotulo mb-1 block">Capa (opcional)</span>
            <button onClick={() => seletor.current?.click()} className="flex aspect-[16/9] w-full items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-borda bg-fundo text-suave hover:bg-elevado">
              {capa ? <img src={capa} alt="" className="h-full w-full object-cover" /> : enviandoCapa ? "Enviando..." : <ImagePlus className="h-7 w-7" />}
            </button>
            <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarCapa(e.target.files?.[0])} />
          </div>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Quando</h2>
          <div className="grid grid-cols-3 gap-2">
            <label className="col-span-3 block sm:col-span-1">
              <span className="rotulo mb-1 block">Dia</span>
              <input type="date" className="entrada" value={data} onChange={(e) => setData(e.target.value)} />
            </label>
            <label className="block">
              <span className="rotulo mb-1 block">Começa</span>
              <input type="time" className="entrada" value={hora} onChange={(e) => setHora(e.target.value)} />
            </label>
            <label className="block">
              <span className="rotulo mb-1 block">Termina (opcional)</span>
              <input type="time" className="entrada" value={horaFim} onChange={(e) => setHoraFim(e.target.value)} />
            </label>
          </div>
        </section>

        <section className="space-y-3">
          <h2 className="font-semibold">Onde</h2>
          <input className="entrada" maxLength={80} placeholder="Nome do lugar (ex.: Casa do Caio, Chácara Recanto)" value={localNome} onChange={(e) => setLocalNome(e.target.value)} />
          <div className="grid grid-cols-[1fr_140px] gap-2">
            <input className="entrada" maxLength={200} placeholder="Endereço" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
            <input className="entrada" maxLength={80} placeholder="Bairro" value={bairro} onChange={(e) => setBairro(e.target.value)} />
          </div>
          <div className="relative h-48 overflow-hidden rounded-xl border border-borda">
            <MapaBase centro={ponto ?? UBERLANDIA} zoom={ponto ? 16 : 12} className="h-full w-full" aoClicar={(lat, lng) => setPonto([lat, lng])}>
              <Recentralizar centro={centro} zoom={16} />
              {ponto && <PinMapa posicao={ponto} tamanho="grande" />}
            </MapaBase>
            <button onClick={() => void minhaPosicao()} className="botao absolute bottom-2 right-2 z-[500] h-9 text-[13px] shadow">
              <LocateFixed className="h-4 w-4" />
              Estou no local
            </button>
          </div>
          <p className="text-[12px] text-suave">Toque no mapa para marcar o ponto. O endereço completo só aparece para quem tiver ingresso; antes, os outros veem só o bairro e a região.</p>
        </section>

        <section>
          <h2 className="mb-2 font-semibold">Quem pode ver</h2>
          <div className="space-y-2">
            {VISIBILIDADES_EVENTO.filter((v) => v.valor !== "publico" || regras.permitir_publico).map((v) => (
              <button key={v.valor} onClick={() => setVisibilidade(v.valor)} aria-pressed={visibilidade === v.valor} className={clsx(chip(visibilidade === v.valor), "w-full")}>
                <span className={clsx("block text-sm font-semibold", visibilidade === v.valor && "text-destaque")}>{v.nome}</span>
                <span className="block text-[12px] text-suave">{v.texto}</span>
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-suave">Depois de criar, você convida os amigos e pode impulsionar o evento para mais gente perto do local.</p>
        </section>

        <section>
          <h2 className="font-semibold">Ingressos</h2>
          <p className="mb-2 text-[12px] text-suave">
            Preço vazio ou 0 = grátis (só confirma presença). Pago: entre {reais(regras.preco_min)} e {reais(regras.preco_max)}. Até {regras.max_ingressos} no total.
          </p>
          <div className="space-y-2">
            {cotas.map((c, i) => (
              <div key={c.id ?? i} className="cartao space-y-2 p-3">
                <div className="flex gap-2">
                  <input className="entrada min-w-0 flex-1" maxLength={60} placeholder="Ex.: Cota churrasco, Só bebida" value={c.nome} onChange={(e) => mudarCota(i, { nome: e.target.value })} />
                  <button onClick={() => setCotas((l) => l.filter((_, n) => n !== i))} disabled={cotas.length === 1} className="botao h-10 w-10 shrink-0 px-0 text-perigo disabled:opacity-30" aria-label="Tirar">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="rotulo mb-1 block">Preço (R$)</span>
                    <input className="entrada" inputMode="decimal" placeholder="0 = grátis" value={c.preco} onChange={(e) => mudarCota(i, { preco: e.target.value.replace(/[^\d,.]/g, "") })} />
                  </label>
                  <label className="block">
                    <span className="rotulo mb-1 block">Quantidade</span>
                    <input className="entrada" inputMode="numeric" value={c.quantidade} onChange={(e) => mudarCota(i, { quantidade: e.target.value.replace(/\D/g, "").slice(0, 4) })} />
                  </label>
                </div>
                <input className="entrada" maxLength={200} placeholder="O que inclui (opcional)" value={c.descricao} onChange={(e) => mudarCota(i, { descricao: e.target.value })} />
              </div>
            ))}
          </div>
          {cotas.length < 6 && (
            <button onClick={() => setCotas((l) => [...l, { nome: "", descricao: "", preco: "", quantidade: "10" }])} className="botao mt-2 w-full">
              <Plus className="h-4 w-4" />
              Outro tipo de ingresso
            </button>
          )}
        </section>

        {pago && (
          <section className="space-y-3">
            <div className="cartao p-4 text-sm">
              <h2 className="font-semibold">Você é o anfitrião e recebe o valor</h2>
              <p className="mt-1 text-suave">
                O pagamento (Pix ou cartão) cai na sua conta Mercado Pago. O RoVibes desconta {String(taxa).replace(".", ",")}% de cada venda.
                {exemplo && ` Num ingresso de ${reais(numero(exemplo.preco))}, você recebe ${reais(numero(exemplo.preco) * (1 - taxa / 100))}.`}
              </p>
              {!regras.mp_conectado && (
                <p className="mt-2 rounded-lg bg-alerta/10 px-3 py-2 text-[13px] text-alerta">
                  Em teste: a ligação com a sua conta Mercado Pago ainda está sendo ativada pelo RoVibes. Até lá, os pagamentos funcionam só em modo de teste.
                </p>
              )}
            </div>
            {!jaAceitou && (
              <div className="cartao p-4">
                <h2 className="font-semibold">Termos de venda de ingressos</h2>
                <div className="mt-2 max-h-56 overflow-y-auto whitespace-pre-line rounded-lg bg-fundo p-3 text-[13px] leading-relaxed text-suave">{regras.termos}</div>
                <label className="mt-3 flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[rgb(var(--marca))]" checked={aceito} onChange={(e) => setAceito(e.target.checked)} />
                  Li e aceito os termos de venda de ingressos e tenho 18 anos ou mais.
                </label>
              </div>
            )}
          </section>
        )}

        {erro && <p className="rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">{erro}</p>}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-borda bg-fundo/95 px-4 pb-[max(12px,env(safe-area-inset-bottom))] pt-3 backdrop-blur">
        <button onClick={() => void salvar()} disabled={salvando || (pago && !aceito && !jaAceitou)} className="botao-principal mx-auto flex h-12 w-full max-w-xl rounded-full text-[15px]">
          {salvando ? "Salvando..." : id ? "Salvar alterações" : "Criar evento"}
        </button>
      </div>
    </div>
  );
}
