import { useRef, useState } from "react";
import clsx from "clsx";
import { Camera, ScanBarcode, Trash2, Wand2 } from "lucide-react";
import { EditorImagem } from "./EditorImagem";
import { LeitorBarras } from "./LeitorBarras";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro } from "@/lib/supabase";
import { DadosBiblioteca, enviarFotoBiblioteca } from "@/lib/biblioteca";
import { UNIDADES } from "@/lib/estoque";

/** Campos do produto da Biblioteca RoVibes (usado no envio pelo estabelecimento e na tela da equipe). */
export function FormularioBiblioteca({ dados, mudar }: { dados: DadosBiblioteca; mudar: (d: DadosBiblioteca) => void }) {
  const { sessao } = useSessao();
  const [camera, setCamera] = useState(false);
  const [enviandoFoto, setEnviandoFoto] = useState(false);
  const [erroFoto, setErroFoto] = useState("");
  const seletor = useRef<HTMLInputElement>(null);
  const set = <K extends keyof DadosBiblioteca>(k: K, v: DadosBiblioteca[K]) => mudar({ ...dados, [k]: v });

  // Toda foto passa pelo editor (enquadra em quadrado com fundo branco e mostra os alertas de qualidade).
  const [editar, setEditar] = useState<File | string | null>(null);
  const escolherArquivo = (l: FileList | null) => {
    const f = l?.[0];
    if (seletor.current) seletor.current.value = "";
    if (f) setEditar(f);
  };
  const usarFoto = async (blob: Blob) => {
    if (!sessao) return;
    setEnviandoFoto(true);
    setErroFoto("");
    try {
      set("foto_url", await enviarFotoBiblioteca(sessao.user.id, blob, true));
      setEditar(null);
    } catch (e) {
      setErroFoto(/bucket/i.test(String((e as Error).message)) ? "Falta aplicar a atualização 021 do banco." : mensagemDeErro(e));
      throw e;
    } finally {
      setEnviandoFoto(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3">
        <div>
          <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => escolherArquivo(e.target.files)} />
          <button type="button" onClick={() => seletor.current?.click()} className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg border border-dashed border-borda bg-fundo text-suave hover:bg-elevado" aria-label="Foto do produto">
            {dados.foto_url ? <img src={dados.foto_url} alt="" className="h-full w-full object-cover" /> : enviandoFoto ? <span className="text-[12px]">Enviando...</span> : <Camera className="h-6 w-6" />}
          </button>
          {dados.foto_url ? (
            <span className="mt-1 flex justify-center gap-1">
              <button type="button" onClick={() => setEditar(dados.foto_url)} className="rounded-md p-1.5 text-suave hover:bg-elevado hover:text-texto" aria-label="Tratar a foto" title="Tratar a foto">
                <Wand2 className="h-4 w-4" />
              </button>
              <button type="button" onClick={() => set("foto_url", null)} className="rounded-md p-1.5 text-suave hover:bg-elevado hover:text-perigo" aria-label="Tirar a foto" title="Tirar a foto">
                <Trash2 className="h-4 w-4" />
              </button>
            </span>
          ) : (
            <span className="mt-1 block text-center text-[11px] text-suave">Foto</span>
          )}
        </div>
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={dados.industrializado} onChange={(e) => set("industrializado", e.target.checked)} className="h-4 w-4 accent-[rgb(var(--marca))]" />
            Tem código de barras (industrializado)
          </label>
          <div className="flex gap-2">
            <label className="min-w-0 flex-1">
              <span className="rotulo mb-1 block">EAN {dados.industrializado ? "(obrigatório)" : "(opcional)"}</span>
              <input value={dados.ean} onChange={(e) => set("ean", e.target.value.replace(/\D/g, "").slice(0, 14))} inputMode="numeric" className="entrada codigo" />
            </label>
            <button type="button" onClick={() => setCamera(!camera)} aria-pressed={camera} className={clsx("botao mt-5 h-10 px-3", camera && "border-marca text-destaque")} aria-label="Ler o código de barras pela câmera">
              <ScanBarcode className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
      {camera && (
        <LeitorBarras
          aoLer={(c) => {
            set("ean", c.replace(/\D/g, "").slice(0, 14));
            setCamera(false);
          }}
        />
      )}
      {erroFoto && <p className="text-sm text-perigo">{erroFoto}</p>}
      {editar && <EditorImagem origem={editar} fechar={() => setEditar(null)} usar={usarFoto} />}
      <label className="block">
        <span className="rotulo mb-1 block">Nome conforme a nota fiscal</span>
        <input value={dados.nome} onChange={(e) => set("nome", e.target.value.slice(0, 160))} placeholder="Ex.: REFRIG COCA COLA LT 350ML" className="entrada" />
      </label>
      <label className="block">
        <span className="rotulo mb-1 block">Descrição</span>
        <textarea rows={2} value={dados.descricao} onChange={(e) => set("descricao", e.target.value.slice(0, 500))} placeholder="Ex.: Refrigerante Coca-Cola lata 350 ml" className="entrada" />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="rotulo mb-1 block">Marca</span>
          <input value={dados.marca} onChange={(e) => set("marca", e.target.value.slice(0, 60))} className="entrada" />
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Categoria</span>
          <input value={dados.categoria} onChange={(e) => set("categoria", e.target.value.slice(0, 60))} placeholder="Ex.: Refrigerantes" className="entrada" />
        </label>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <label className="block">
          <span className="rotulo mb-1 block">Unidade</span>
          <select className="entrada" value={dados.unidade} onChange={(e) => set("unidade", e.target.value)}>
            {UNIDADES.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nome}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Embalagem</span>
          <input value={dados.embalagem_nome} onChange={(e) => set("embalagem_nome", e.target.value.slice(0, 30))} placeholder="Fardo" className="entrada" />
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Qtd. na emb.</span>
          <input value={dados.embalagem_fator} onChange={(e) => set("embalagem_fator", e.target.value.replace(/[^\d,.]/g, ""))} inputMode="decimal" placeholder="12" className="entrada" />
        </label>
      </div>
    </div>
  );
}

/** Converte "12,5" para "12.5" ao enviar para o banco. */
export const dadosParaBanco = (d: DadosBiblioteca) => ({ ...d, embalagem_fator: d.embalagem_fator ? d.embalagem_fator.replace(/\./g, "").replace(",", ".") : "" });
