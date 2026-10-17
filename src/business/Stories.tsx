import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, Film, ImagePlus, Plus, Trash2, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { apagarFoto, caminhoDaUrl, enviarFoto } from "@/lib/imagens";
import { useBusiness } from "@/lib/acessos";

interface Story {
  id: string;
  foto_url: string;
  legenda: string | null;
  criado_em: string;
  expira_em: string;
}

const restante = (iso: string) => {
  const min = Math.max(0, Math.round((Date.parse(iso) - Date.now()) / 60000));
  return min >= 60 ? `${Math.floor(min / 60)} h` : `${min} min`;
};

export function Stories() {
  const { atual } = useBusiness();
  const id = atual?.estabelecimento_id;
  const [lista, setLista] = useState<Story[]>([]);
  const [vistas, setVistas] = useState<Record<string, number>>({});
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [novo, setNovo] = useState<{ foto_url: string | null; legenda: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const seletor = useRef<HTMLInputElement>(null);

  const carregar = useCallback(async () => {
    if (!id) return;
    const desde = new Date(Date.now() - 7 * 86400000).toISOString();
    const [s, v] = await Promise.all([
      supabase.from("stories").select("id, foto_url, legenda, criado_em, expira_em").eq("estabelecimento_id", id).gte("criado_em", desde).order("criado_em", { ascending: false }),
      supabase.rpc("vistas_de_stories", { p_estab: id }),
    ]);
    setLista((s.data ?? []) as Story[]);
    setVistas(Object.fromEntries(((v.data ?? []) as { story_id: string; total: number }[]).map((x) => [x.story_id, x.total])));
  }, [id]);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!atual || !id) return <p className="cartao p-6 text-sm text-suave">Cadastre ou escolha um estabelecimento.</p>;
  const story = lista.find((x) => x.id === selecionado) ?? null;
  const ativos = lista.filter((s) => Date.parse(s.expira_em) > Date.now());
  const antigos = lista.filter((s) => Date.parse(s.expira_em) <= Date.now());

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

  const escolherFoto = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (!arquivo) return;
    void executar(async () => {
      const { url } = await enviarFoto(id, arquivo, "story");
      setNovo((n) => ({ legenda: n?.legenda ?? "", foto_url: url }));
    });
    if (seletor.current) seletor.current.value = "";
  };

  const publicar = (e: FormEvent) => {
    e.preventDefault();
    if (!novo?.foto_url) return;
    void executar(async () => {
      const { error } = await supabase.from("stories").insert({ estabelecimento_id: id, foto_url: novo.foto_url, legenda: novo.legenda.trim() || null });
      if (error) throw error;
      setNovo(null);
      await carregar();
    }, "Story publicado. Ele some em 24 horas.");
  };

  const excluir = () =>
    story &&
    void executar(async () => {
      if (!window.confirm("Excluir este story?")) return;
      const { error } = await supabase.from("stories").delete().eq("id", story.id);
      if (error) throw error;
      const caminho = caminhoDaUrl(story.foto_url);
      if (caminho) await apagarFoto(caminho);
      setSelecionado(null);
      await carregar();
    }, "Story excluído.");

  const grade = (itens: Story[], ativo: boolean) => (
    <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4 lg:grid-cols-6">
      {itens.map((s) => (
        <li key={s.id}>
          <button
            onClick={() => setSelecionado(s.id)}
            aria-pressed={selecionado === s.id}
            className={clsx("relative block w-full overflow-hidden rounded-lg border", selecionado === s.id ? "border-marca ring-2 ring-marca" : "border-borda", !ativo && "opacity-60")}
          >
            <img src={s.foto_url} alt={s.legenda ?? ""} className="aspect-[9/16] w-full object-cover" loading="lazy" />
            <span className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-black/55 px-2 py-1 text-[12px] text-white">
              <span className="inline-flex items-center gap-1">
                <Eye className="h-3 w-3" />
                {vistas[s.id] ?? 0}
              </span>
              <span>{ativo ? restante(s.expira_em) : "Expirado"}</span>
            </span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <TelaUniversal
      acoes={
        <button className="botao-principal col-span-2 sm:col-span-1" onClick={() => (setNovo({ foto_url: null, legenda: "" }), seletor.current?.click())}>
          <Plus className="h-4 w-4" />
          Novo story
        </button>
      }
      rodape={
        <button className="botao w-full text-perigo" disabled={!story || ocupado} onClick={excluir}>
          <Trash2 className="h-4 w-4" />
          Excluir
        </button>
      }
    >
      <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => escolherFoto(e.target.files)} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      {novo && (
        <Secao
          titulo="Novo story"
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setNovo(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={publicar} className="flex flex-wrap items-end gap-4">
            <button
              type="button"
              onClick={() => seletor.current?.click()}
              className="flex aspect-[9/16] w-32 items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado"
            >
              {novo.foto_url ? <img src={novo.foto_url} alt="" className="h-full w-full object-cover" /> : ocupado ? "Enviando…" : <ImagePlus className="h-6 w-6" />}
            </button>
            <div className="min-w-[220px] flex-1 space-y-3">
              <Campo rotulo="Legenda (opcional)">
                <input maxLength={200} className="entrada" value={novo.legenda} onChange={(e) => setNovo({ ...novo, legenda: e.target.value })} />
              </Campo>
              <button type="submit" className="botao-principal" disabled={!novo.foto_url || ocupado}>
                Publicar story
              </button>
            </div>
          </form>
        </Secao>
      )}

      <Secao titulo={`No ar agora (${ativos.length})`}>
        {ativos.length === 0 ? (
          <div className="py-8 text-center">
            <Film className="mx-auto h-7 w-7 text-suave" />
            <p className="mt-2 text-sm text-suave">Nenhum story no ar. Eles aparecem no topo do Feed e na página do lugar por 24 horas.</p>
          </div>
        ) : (
          grade(ativos, true)
        )}
      </Secao>

      {antigos.length > 0 && <Secao titulo="Últimos 7 dias">{grade(antigos, false)}</Secao>}
    </TelaUniversal>
  );
}
