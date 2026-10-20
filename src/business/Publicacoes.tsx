import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Heart, ImagePlus, MessageCircle, Newspaper, Plus, Trash2, X } from "lucide-react";
import { contarComentarios, FolhaComentarios } from "@/components/Comentarios";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";

interface Publicacao {
  id: string;
  texto: string | null;
  foto_url: string | null;
  evento_id: string | null;
  situacao: "publicada" | "oculta";
  criado_em: string;
}

export function Publicacoes() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [lista, setLista] = useState<Publicacao[]>([]);
  const [curtidas, setCurtidas] = useState<Record<string, number>>({});
  const [eventos, setEventos] = useState<{ id: string; nome: string }[]>([]);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [nova, setNova] = useState<{ texto: string; foto_url: string | null; evento_id: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [comentarios, setComentarios] = useState<Map<string, number>>(new Map());
  const [vendoComentarios, setVendoComentarios] = useState<string | null>(null);
  const seletor = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const [p, e] = await Promise.all([
      supabase.from("publicacoes").select("id, texto, foto_url, evento_id, situacao, criado_em").eq("estabelecimento_id", id).order("criado_em", { ascending: false }).limit(100),
      supabase.from("eventos").select("id, nome").eq("estabelecimento_id", id).gte("inicio", new Date().toISOString()).order("inicio").limit(30),
    ]);
    const pubs = (p.data ?? []) as Publicacao[];
    setLista(pubs);
    setEventos((e.data ?? []) as { id: string; nome: string }[]);
    if (pubs.length) {
      const { data } = await supabase.rpc("curtidas_de", { p_ids: pubs.map((x) => x.id) });
      setCurtidas(Object.fromEntries(((data ?? []) as { publicacao_id: string; total: number }[]).map((c) => [c.publicacao_id, c.total])));
      setComentarios(await contarComentarios("lugar", pubs.map((x) => x.id)));
    }
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
  const pub = lista.find((x) => x.id === selecionada) ?? null;

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

  const publicar = (e: FormEvent) => {
    e.preventDefault();
    if (!nova) return;
    void executar(async () => {
      if (!nova.texto.trim() && !nova.foto_url) throw new Error("Escreva um texto ou adicione uma foto.");
      const { error } = await supabase.from("publicacoes").insert({
        estabelecimento_id: id,
        texto: nova.texto.trim() || null,
        foto_url: nova.foto_url,
        evento_id: nova.evento_id || null,
      });
      if (error) throw error;
      setNova(null);
      await carregar();
    }, "Publicado.");
  };

  const trocarFoto = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo || !nova) return;
    void executar(async () => {
      const { url } = await enviarFoto(id, arquivo, "pub");
      setNova((n) => (n ? { ...n, foto_url: url } : n));
    });
    if (seletor.current) seletor.current.value = "";
  };

  const alternar = () =>
    pub &&
    void executar(async () => {
      const { error } = await supabase
        .from("publicacoes")
        .update({ situacao: pub.situacao === "publicada" ? "oculta" : "publicada" })
        .eq("id", pub.id);
      if (error) throw error;
      await carregar();
    });

  const excluir = () =>
    pub &&
    void executar(async () => {
      if (!window.confirm("Excluir esta publicação?")) return;
      const { error } = await supabase.from("publicacoes").delete().eq("id", pub.id);
      if (error) throw error;
      const caminho = caminhoDaUrl(pub.foto_url);
      if (caminho) await apagarFoto(caminho);
      setSelecionada(null);
      await carregar();
    }, "Publicação excluída.");

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => setNova({ texto: "", foto_url: null, evento_id: "" })}>
            <Plus className="h-4 w-4" />
            Nova publicação
          </button>
          <button className="botao" disabled={!pub} onClick={() => pub && setVendoComentarios(pub.id)}>
            <MessageCircle className="h-4 w-4" />
            Comentários
          </button>
          <button className="botao" disabled={!pub || ocupado} onClick={alternar}>
            {pub?.situacao === "oculta" ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            {pub?.situacao === "oculta" ? "Mostrar" : "Ocultar"}
          </button>
        </>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!pub || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}
      {vendoComentarios && (
        <FolhaComentarios
          tipo="lugar"
          id={vendoComentarios}
          titulo="Comentários da publicação"
          fechar={() => setVendoComentarios(null)}
          aoMudarTotal={(n) => setComentarios((m) => new Map(m).set(vendoComentarios, n))}
        />
      )}

      {nova && (
        <Secao
          titulo="Nova publicação"
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setNova(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={publicar} className="grid gap-4 sm:grid-cols-[1fr_200px]">
            <div className="space-y-4">
              <Campo rotulo="Texto">
                <textarea rows={4} maxLength={1000} autoFocus className="entrada" value={nova.texto} onChange={(e) => setNova({ ...nova, texto: e.target.value })} />
              </Campo>
              <Campo rotulo="Ligar a um evento (opcional)">
                <select className="entrada" value={nova.evento_id} onChange={(e) => setNova({ ...nova, evento_id: e.target.value })}>
                  <option value="">Nenhum</option>
                  {eventos.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      {ev.nome}
                    </option>
                  ))}
                </select>
              </Campo>
            </div>
            <div>
              <span className="rotulo mb-1 block">Foto</span>
              <button
                type="button"
                onClick={() => seletor.current?.click()}
                className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
              >
                {nova.foto_url ? <img src={nova.foto_url} alt="" className="h-full w-full object-cover" /> : <ImagePlus className="h-6 w-6" />}
              </button>
              <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => trocarFoto(e.target.files)} />
            </div>
            <div className="flex gap-2 sm:col-span-2">
              <button type="submit" className="botao-principal" disabled={ocupado}>
                Publicar
              </button>
              <button type="button" className="botao" onClick={() => setNova(null)}>
                Cancelar
              </button>
            </div>
          </form>
        </Secao>
      )}

      {lista.length === 0 ? (
        <section className="cartao px-6 py-14 text-center">
          <Newspaper className="mx-auto h-8 w-8 text-suave" />
          <p className="mt-3 font-medium">Nenhuma publicação ainda</p>
          <p className="mt-1 text-sm text-suave">As publicações aparecem no Feed de quem segue o estabelecimento.</p>
        </section>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((p) => (
            <li key={p.id}>
              <button
                onClick={() => setSelecionada(p.id)}
                aria-pressed={selecionada === p.id}
                className={clsx("cartao flex h-full w-full flex-col overflow-hidden text-left", selecionada === p.id && "border-marca ring-1 ring-marca")}
              >
                {p.foto_url && <img src={p.foto_url} alt="" className="aspect-[4/3] w-full object-cover" loading="lazy" />}
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {p.texto && <p className="line-clamp-3 text-sm">{p.texto}</p>}
                  <div className="mt-auto flex items-center justify-between text-[13px] text-suave">
                    <span>{new Date(p.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                    <span className="inline-flex items-center gap-3">
                      {p.situacao === "oculta" && <span className="font-medium text-alerta">Oculta</span>}
                      <span className="inline-flex items-center gap-1">
                        <Heart className="h-3.5 w-3.5" />
                        {curtidas[p.id] ?? 0}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MessageCircle className="h-3.5 w-3.5" />
                        {comentarios.get(p.id) ?? 0}
                      </span>
                    </span>
                  </div>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </TelaUniversal>
  );
}
