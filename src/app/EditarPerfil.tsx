import { FormEvent, useEffect, useRef, useState } from "react";
import { Camera, Lock, X } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { reduzirImagem } from "@/lib/imagens";
import { desbloquearPessoa, limparUsuario } from "@/lib/pessoas";
import { useSessao } from "@/lib/sessao";
import { mensagemDeErro, supabase } from "@/lib/supabase";

interface Bloqueado {
  id: string;
  nome: string;
  usuario: string;
}

/** Editar o próprio perfil: foto, nome, @usuário, bio, privacidade e bloqueados. */
export function EditarPerfil({ fechar }: { fechar: () => void }) {
  const { sessao, perfil, recarregar } = useSessao();
  const eu = sessao!.user.id;
  const seletor = useRef<HTMLInputElement>(null);
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [usuario, setUsuario] = useState(perfil?.usuario ?? "");
  const [bio, setBio] = useState(perfil?.bio ?? "");
  const [privado, setPrivado] = useState(!!perfil?.privado);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [bloqueados, setBloqueados] = useState<Bloqueado[]>([]);

  const carregarBloqueados = async () => {
    const { data } = await supabase.rpc("meus_bloqueados");
    setBloqueados((data ?? []) as Bloqueado[]);
  };
  useEffect(() => {
    void carregarBloqueados();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const trocarFoto = async (lista: FileList | null) => {
    const arquivo = lista?.[0];
    if (seletor.current) seletor.current.value = "";
    if (!arquivo) return;
    setSalvando(true);
    setErro("");
    try {
      const blob = await reduzirImagem(arquivo, 512);
      const caminho = `${eu}/foto-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatares").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw error;
      const url = supabase.storage.from("avatares").getPublicUrl(caminho).data.publicUrl;
      const antiga = perfil?.foto_url?.split("/avatares/")[1];
      const { error: e2 } = await supabase.from("perfis").update({ foto_url: url }).eq("id", eu);
      if (e2) throw e2;
      if (antiga) await supabase.storage.from("avatares").remove([decodeURIComponent(antiga)]);
      await recarregar();
    } catch (e) {
      setErro(mensagemDeErro(e));
    }
    setSalvando(false);
  };

  const salvar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    const u = limparUsuario(usuario);
    if (nome.trim().length < 2) return setErro("Informe seu nome.");
    if (u.length < 3) return setErro("O @usuário precisa ter pelo menos 3 caracteres.");
    setSalvando(true);
    const { error } = await supabase.from("perfis").update({ nome: nome.trim(), usuario: u, bio: bio.trim() || null, privado }).eq("id", eu);
    setSalvando(false);
    if (error) {
      if (/perfis_usuario_unico|duplicate key/i.test(error.message)) return setErro(`@${u} já está em uso. Escolha outro.`);
      return setErro(mensagemDeErro(error));
    }
    await recarregar();
    fechar();
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/60 sm:items-center" role="dialog" aria-modal="true" aria-label="Editar perfil" onClick={fechar}>
      <form
        onSubmit={(e) => void salvar(e)}
        className="max-h-[94vh] w-full max-w-sm overflow-y-auto rounded-t-2xl bg-superficie p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Editar perfil</h2>
          <button type="button" onClick={fechar} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Fechar">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex flex-col items-center gap-2">
          <Avatar nome={nome || "?"} foto={perfil?.foto_url} tamanho="xl" />
          <input ref={seletor} type="file" accept="image/*" className="hidden" onChange={(e) => void trocarFoto(e.target.files)} />
          <button type="button" className="inline-flex items-center gap-1.5 text-sm font-semibold text-destaque" onClick={() => seletor.current?.click()} disabled={salvando}>
            <Camera className="h-4 w-4" />
            Alterar foto
          </button>
        </div>

        <label className="mt-4 block">
          <span className="rotulo mb-1 block">Nome</span>
          <input value={nome} onChange={(e) => setNome(e.target.value.slice(0, 60))} className="h-11 w-full rounded-lg border border-borda bg-fundo px-3 text-sm focus:border-marca focus:outline-none" />
        </label>
        <label className="mt-3 block">
          <span className="rotulo mb-1 block">Usuário</span>
          <span className="relative block">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-suave">@</span>
            <input
              value={usuario}
              onChange={(e) => setUsuario(limparUsuario(e.target.value))}
              autoCapitalize="none"
              autoCorrect="off"
              className="h-11 w-full rounded-lg border border-borda bg-fundo pl-7 pr-3 text-sm focus:border-marca focus:outline-none"
            />
          </span>
          <span className="mt-1 block text-[12px] text-suave">Letras, números, ponto e sublinhado. É assim que as pessoas acham você.</span>
        </label>
        <label className="mt-3 block">
          <span className="rotulo mb-1 block">Bio</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value.slice(0, 160))}
            rows={3}
            placeholder="Conte um pouco sobre você e seus rolês"
            className="w-full rounded-lg border border-borda bg-fundo px-3 py-2 text-sm focus:border-marca focus:outline-none"
          />
          <span className="block text-right text-[12px] text-suave">{bio.length}/160</span>
        </label>

        <label className="mt-2 flex cursor-pointer items-start gap-3 rounded-lg border border-borda px-3 py-3">
          <input type="checkbox" checked={privado} onChange={(e) => setPrivado(e.target.checked)} className="mt-1 h-4 w-4 accent-[rgb(var(--marca))]" />
          <span>
            <span className="flex items-center gap-1.5 text-sm font-medium">
              <Lock className="h-3.5 w-3.5" />
              Perfil privado
            </span>
            <span className="block text-[12px] text-suave">Quem quiser seguir você precisa da sua aprovação. Seus stories só aparecem para seguidores.</span>
          </span>
        </label>

        {erro && <p className="mt-3 text-sm text-perigo">{erro}</p>}
        <button type="submit" className="botao-principal mt-4 h-11 w-full" disabled={salvando}>
          {salvando ? "Salvando..." : "Salvar"}
        </button>

        {bloqueados.length > 0 && (
          <section className="mt-6 border-t border-borda pt-4">
            <h3 className="rotulo mb-2">Pessoas bloqueadas</h3>
            <ul className="divide-y divide-borda">
              {bloqueados.map((b) => (
                <li key={b.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{b.usuario}</span>
                    <span className="block truncate text-[12px] text-suave">{b.nome}</span>
                  </span>
                  <button
                    type="button"
                    className="botao h-8 px-3 text-[13px]"
                    onClick={() =>
                      void desbloquearPessoa(b.id)
                        .then(carregarBloqueados)
                        .catch((e) => setErro(mensagemDeErro(e)))
                    }
                  >
                    Desbloquear
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </form>
    </div>
  );
}
