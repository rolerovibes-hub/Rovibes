import { useEffect, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Aviso, Secao } from "@/components/Formulario";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { reduzirImagem } from "@/lib/imagens";
import { NOME_TIPO_GOSTO, ORDEM_TIPOS, TipoGosto } from "@/lib/gostos";

interface LinhaGosto {
  id: number;
  tipo: TipoGosto;
  nome: string;
  emoji: string | null;
  imagem_url: string | null;
}

/**
 * Fotos dos cards da "Primeira vibe" (onboarding). Sem foto da equipe, o app usa a capa de um lugar com aquele gosto.
 * Use só fotos próprias ou com licença de uso.
 */
export function FotosGostos() {
  const [linhas, setLinhas] = useState<LinhaGosto[] | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [erro, setErro] = useState("");

  const carregar = async () => {
    const { data, error } = await supabase.from("gostos").select("id, tipo, nome, emoji, imagem_url").eq("ativo", true).order("ordem");
    if (error) {
      setLinhas([]);
      setErro("Aplique a atualização 038 do banco para usar as fotos.");
      return;
    }
    setLinhas((data ?? []) as LinhaGosto[]);
  };
  useEffect(() => {
    void carregar();
  }, []);

  const enviar = async (g: LinhaGosto, arquivo: File) => {
    setErro("");
    setEnviando(g.id);
    try {
      const blob = await reduzirImagem(arquivo, 900);
      const caminho = `${g.id}-${Date.now()}.jpg`;
      const { error: e1 } = await supabase.storage.from("gostos").upload(caminho, blob, { contentType: "image/jpeg" });
      if (e1) throw e1;
      const url = supabase.storage.from("gostos").getPublicUrl(caminho).data.publicUrl;
      const { error: e2 } = await supabase.rpc("salvar_imagem_gosto", { p_gosto: g.id, p_url: url });
      if (e2) throw e2;
      await carregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setEnviando(null);
  };

  const remover = async (g: LinhaGosto) => {
    setErro("");
    const { error } = await supabase.rpc("salvar_imagem_gosto", { p_gosto: g.id, p_url: null });
    if (error) return setErro(mensagemDeErro(error));
    const caminho = g.imagem_url?.split("/gostos/")[1];
    if (caminho) await supabase.storage.from("gostos").remove([decodeURIComponent(caminho)]);
    await carregar();
  };

  return (
    <Secao titulo="Fotos da Primeira vibe">
      <p className="-mt-2 mb-3 text-[13px] text-suave">
        Aparecem nos cards do primeiro acesso e em "Meus gostos". Sem foto aqui, o app mostra a capa de um lugar que tem esse gosto. Use só fotos próprias ou
        com licença.
      </p>
      {erro && <Aviso tipo="erro">{erro}</Aviso>}
      {linhas === null ? (
        <Loader2 className="h-5 w-5 animate-spin text-suave" />
      ) : (
        ORDEM_TIPOS.map((t) => {
          const lista = linhas.filter((g) => g.tipo === t);
          if (!lista.length) return null;
          return (
            <div key={t} className="mt-4">
              <h3 className="mb-2 text-sm font-semibold">{NOME_TIPO_GOSTO[t]}</h3>
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-6">
                {lista.map((g) => (
                  <li key={g.id} className="relative aspect-[3/4] overflow-hidden rounded-lg border border-borda bg-elevado">
                    {g.imagem_url ? (
                      <img src={g.imagem_url} alt="" className="absolute inset-0 h-full w-full object-cover" />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-3xl opacity-60">{g.emoji}</span>
                    )}
                    <span className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-[12px] font-semibold text-white">{g.nome}</span>
                    <div className="absolute right-1 top-1 flex gap-1">
                      <label className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-black/55 text-white" title="Enviar foto">
                        {enviando === g.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          disabled={enviando !== null}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            e.target.value = "";
                            if (f) void enviar(g, f);
                          }}
                        />
                      </label>
                      {g.imagem_url && (
                        <button className="flex h-7 w-7 items-center justify-center rounded-full bg-black/55 text-white" title="Tirar foto" onClick={() => void remover(g)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          );
        })
      )}
    </Secao>
  );
}
