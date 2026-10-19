import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Ban, CalendarDays, ExternalLink, ImagePlus, Pencil, Plus, Trash2, X } from "lucide-react";
import { EditorIngressos } from "./EditorIngressos";
import { EstilosEvento } from "./GostosDaCasa";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";

type Situacao = "rascunho" | "publicado" | "cancelado";

interface Evento {
  id: string;
  nome: string;
  descricao: string | null;
  inicio: string;
  fim: string | null;
  entrada: string | null;
  capa_url: string | null;
  situacao: Situacao;
}

interface Rascunho {
  id?: string;
  nome: string;
  descricao: string;
  data: string;
  hora: string;
  dataFim: string;
  horaFim: string;
  entrada: string;
  capa_url: string | null;
  situacao: Situacao;
}

const NOME_SITUACAO: Record<Situacao, string> = { rascunho: "Rascunho", publicado: "Publicado", cancelado: "Cancelado" };
const COR: Record<Situacao, string> = { rascunho: "text-suave", publicado: "text-ok", cancelado: "text-perigo" };

// Data e hora locais (horário do aparelho, Brasília) <-> ISO do banco.
const partes = (iso: string | null) => {
  if (!iso) return { data: "", hora: "" };
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`, hora: `${p(d.getHours())}:${p(d.getMinutes())}` };
};
const juntar = (data: string, hora: string) => (data ? new Date(`${data}T${hora || "00:00"}`).toISOString() : null);

export const quandoEvento = (inicio: string) =>
  new Date(inicio).toLocaleString("pt-BR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });

const vazio = (): Rascunho => ({
  nome: "",
  descricao: "",
  data: "",
  hora: "20:00",
  dataFim: "",
  horaFim: "",
  entrada: "",
  capa_url: null,
  situacao: "publicado",
});

export function Eventos() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [eventos, setEventos] = useState<Evento[]>([]);
  const [periodo, setPeriodo] = useState<"proximos" | "passados">("proximos");
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const seletorFoto = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const agora = new Date(Date.now() - 6 * 3600 * 1000).toISOString();
    let q = supabase
      .from("eventos")
      .select("id, nome, descricao, inicio, fim, entrada, capa_url, situacao")
      .eq("estabelecimento_id", id)
      .limit(200);
    q = periodo === "proximos" ? q.gte("inicio", agora).order("inicio") : q.lt("inicio", agora).order("inicio", { ascending: false });
    const { data } = await q;
    setEventos((data ?? []) as Evento[]);
  }, [id, periodo]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;

  const evento = eventos.find((e) => e.id === selecionado) ?? null;

  const executar = async (acao: () => Promise<void>, ok?: string) => {
    setOcupado(true);
    setAviso(null);
    try {
      await acao();
      if (ok) setAviso({ tipo: "ok", texto: ok });
    } catch (err) {
      setAviso({ tipo: "erro", texto: mensagemDeErro(err) });
    } finally {
      setOcupado(false);
    }
  };

  const editar = (e: Evento) => {
    const i = partes(e.inicio);
    const f = partes(e.fim);
    setRascunho({
      id: e.id,
      nome: e.nome,
      descricao: e.descricao ?? "",
      data: i.data,
      hora: i.hora,
      dataFim: f.data,
      horaFim: f.hora,
      entrada: e.entrada ?? "",
      capa_url: e.capa_url,
      situacao: e.situacao,
    });
  };

  const salvar = (ev: FormEvent) => {
    ev.preventDefault();
    if (!rascunho) return;
    void executar(async () => {
      const inicio = juntar(rascunho.data, rascunho.hora);
      if (!inicio) throw new Error("Informe a data do evento.");
      const fim = rascunho.horaFim ? juntar(rascunho.dataFim || rascunho.data, rascunho.horaFim) : null;
      const valores = {
        nome: rascunho.nome.trim(),
        descricao: rascunho.descricao.trim() || null,
        inicio,
        fim: fim && fim <= inicio ? new Date(Date.parse(fim) + 86400000).toISOString() : fim,
        entrada: rascunho.entrada.trim() || null,
        capa_url: rascunho.capa_url,
        situacao: rascunho.situacao,
      };
      if (rascunho.id) {
        const { error } = await supabase.from("eventos").update(valores).eq("id", rascunho.id);
        if (error) throw error;
        setRascunho(null);
      } else {
        // Evento novo: continua aberto para configurar os ingressos à venda.
        const { data, error } = await supabase.from("eventos").insert({ ...valores, estabelecimento_id: id }).select("id").single();
        if (error) throw error;
        setRascunho({ ...rascunho, id: (data as { id: string }).id });
      }
      await carregar();
    }, "Evento salvo.");
  };

  const cancelar = () =>
    evento &&
    void executar(async () => {
      if (!window.confirm(`Cancelar "${evento.nome}"? Ele continua visível como cancelado.`)) return;
      const { error } = await supabase.from("eventos").update({ situacao: "cancelado" }).eq("id", evento.id);
      if (error) throw error;
      await carregar();
    });

  const excluir = () =>
    evento &&
    void executar(async () => {
      if (!window.confirm(`Excluir "${evento.nome}"? Esta ação não pode ser desfeita.`)) return;
      const { error } = await supabase.from("eventos").delete().eq("id", evento.id);
      if (error) throw error;
      const caminho = caminhoDaUrl(evento.capa_url);
      if (caminho) await apagarFoto(caminho);
      setSelecionado(null);
      await carregar();
    }, "Evento excluído.");

  const trocarCapa = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo || !rascunho) return;
    void executar(async () => {
      const { url } = await enviarFoto(id, arquivo, "evento");
      setRascunho((r) => (r ? { ...r, capa_url: url } : r));
    });
    if (seletorFoto.current) seletorFoto.current.value = "";
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setRascunho(vazio())}>
            <Plus className="h-4 w-4" />
            Novo evento
          </button>
          <button className="botao" disabled={!evento} onClick={() => evento && editar(evento)}>
            <Pencil className="h-4 w-4" />
            Editar
          </button>
          <button className="botao" disabled={!evento || evento.situacao === "cancelado" || ocupado} onClick={cancelar}>
            <Ban className="h-4 w-4" />
            Cancelar evento
          </button>
          <hr className="col-span-full my-1 border-borda" />
          {evento ? (
            <Link to={`/evento/${evento.id}`} className="botao">
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </Link>
          ) : (
            <button className="botao" disabled>
              <ExternalLink className="h-4 w-4" />
              Ver no App
            </button>
          )}
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!evento || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {rascunho && (
        <Secao
          titulo={rascunho.id ? "Editar evento" : "Novo evento"}
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setRascunho(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvar} className="grid gap-4 lg:grid-cols-[1fr_240px]">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Nome do evento" className="sm:col-span-2">
                <input required minLength={2} autoFocus className="entrada" value={rascunho.nome} onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })} />
              </Campo>
              <Campo rotulo="Data">
                <input required type="date" className="entrada" value={rascunho.data} onChange={(e) => setRascunho({ ...rascunho, data: e.target.value })} />
              </Campo>
              <Campo rotulo="Começa às">
                <input required type="time" className="entrada" value={rascunho.hora} onChange={(e) => setRascunho({ ...rascunho, hora: e.target.value })} />
              </Campo>
              <Campo rotulo="Termina em (opcional)">
                <input type="date" className="entrada" value={rascunho.dataFim} onChange={(e) => setRascunho({ ...rascunho, dataFim: e.target.value })} />
              </Campo>
              <Campo rotulo="Termina às">
                <input type="time" className="entrada" value={rascunho.horaFim} onChange={(e) => setRascunho({ ...rascunho, horaFim: e.target.value })} />
              </Campo>
              <Campo rotulo="Entrada">
                <input className="entrada" placeholder="Gratuita, R$ 20, Lista até 22h" value={rascunho.entrada} onChange={(e) => setRascunho({ ...rascunho, entrada: e.target.value })} />
              </Campo>
              <Campo rotulo="Situação">
                <select className="entrada" value={rascunho.situacao} onChange={(e) => setRascunho({ ...rascunho, situacao: e.target.value as Situacao })}>
                  <option value="publicado">Publicado</option>
                  <option value="rascunho">Rascunho (só a equipe vê)</option>
                  <option value="cancelado">Cancelado</option>
                </select>
              </Campo>
              <Campo rotulo="Descrição" className="sm:col-span-2">
                <textarea rows={3} maxLength={600} className="entrada" value={rascunho.descricao} onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })} />
              </Campo>
            </div>
            <div>
              <span className="rotulo mb-1 block">Capa</span>
              <button
                type="button"
                onClick={() => seletorFoto.current?.click()}
                className="flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
              >
                {rascunho.capa_url ? <img src={rascunho.capa_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
              </button>
              <input ref={seletorFoto} type="file" accept="image/*" className="hidden" onChange={(e) => trocarCapa(e.target.files)} />
            </div>
            <div className="flex gap-2 lg:col-span-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Salvar evento
              </button>
              <button type="button" className="botao" onClick={() => setRascunho(null)}>
                Cancelar
              </button>
            </div>
          </form>
          {rascunho.id ? (
            <div className="mt-5 space-y-4">
              <EstilosEvento evento={rascunho.id} />
              <EditorIngressos evento={rascunho.id} />
            </div>
          ) : (
            <p className="mt-4 text-[13px] text-suave">Salve o evento para configurar os ingressos à venda (tipos, lotes e regras).</p>
          )}
        </Secao>
      )}

      <section className="cartao flex gap-2 p-3" role="tablist" aria-label="Período">
        {(["proximos", "passados"] as const).map((p) => (
          <button
            key={p}
            role="tab"
            aria-selected={periodo === p}
            onClick={() => {
              setPeriodo(p);
              setSelecionado(null);
            }}
            className={clsx(
              "rounded-lg px-3 py-1.5 text-sm",
              periodo === p ? "bg-destaque-suave font-semibold text-destaque" : "text-suave hover:bg-elevado hover:text-texto",
            )}
          >
            {p === "proximos" ? "Próximos" : "Passados"}
          </button>
        ))}
      </section>

      <section className="cartao overflow-hidden">
        {eventos.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <CalendarDays className="mx-auto h-8 w-8 text-suave" />
            <p className="mt-3 font-medium">{periodo === "proximos" ? "Nenhum evento marcado" : "Nenhum evento passado"}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-borda bg-elevado/60">
                <tr>
                  {["Evento", "Quando", "Entrada", "Situação"].map((c) => (
                    <th key={c} scope="col" className="whitespace-nowrap px-4 py-2.5 text-[13px] font-semibold text-suave">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {eventos.map((e) => (
                  <tr
                    key={e.id}
                    onClick={() => setSelecionado(e.id)}
                    onDoubleClick={() => editar(e)}
                    aria-selected={selecionado === e.id}
                    className={clsx("cursor-pointer border-b border-borda last:border-0", selecionado === e.id ? "bg-destaque-suave" : "hover:bg-elevado")}
                  >
                    <td className="px-4 py-2.5 font-medium">{e.nome}</td>
                    <td className="codigo whitespace-nowrap px-4 py-2.5 text-sm">{quandoEvento(e.inicio)}</td>
                    <td className="px-4 py-2.5 text-suave">{e.entrada ?? "—"}</td>
                    <td className={clsx("whitespace-nowrap px-4 py-2.5 font-medium", COR[e.situacao])}>{NOME_SITUACAO[e.situacao]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </TelaUniversal>
  );
}
