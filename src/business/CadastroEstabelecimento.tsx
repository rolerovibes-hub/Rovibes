import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Store } from "lucide-react";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { useBusiness } from "@/lib/acessos";

interface Categoria {
  id: number;
  nome: string;
}

export function CadastroEstabelecimento() {
  const { recarregar } = useBusiness();
  const navegar = useNavigate();
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [nome, setNome] = useState("");
  const [categoria, setCategoria] = useState("");
  const [bairro, setBairro] = useState("");
  const [endereco, setEndereco] = useState("");
  const [telefone, setTelefone] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState("");

  useEffect(() => {
    supabase
      .from("categorias")
      .select("id, nome")
      .eq("ativa", true)
      .order("nome")
      .then(({ data }) => setCategorias((data ?? []) as Categoria[]));
  }, []);

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setErro("");
    setEnviando(true);
    const { error } = await supabase.rpc("cadastrar_estabelecimento", {
      p_nome: nome,
      p_categoria: categoria ? Number(categoria) : null,
      p_bairro: bairro,
      p_endereco: endereco,
      p_telefone: telefone,
    });
    setEnviando(false);
    if (error) {
      setErro(mensagemDeErro(error));
      return;
    }
    await recarregar();
    navegar("/business");
  };

  const campo = "h-11 w-full rounded-lg border border-borda bg-fundo px-3 placeholder:text-suave focus:border-marca focus:outline-none";

  return (
    <div className="mx-auto max-w-lg">
      <div className="mb-6 flex items-center gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-destaque-suave text-destaque">
          <Store className="h-5 w-5" />
        </span>
        <div>
          <h1 className="text-xl font-semibold">Cadastre seu estabelecimento</h1>
          <p className="text-sm text-suave">Ele aparece no App depois da aprovação do RoVibes.</p>
        </div>
      </div>
      <form onSubmit={enviar} className="cartao space-y-4 p-6">
        <label className="block">
          <span className="rotulo mb-1 block">Nome do estabelecimento</span>
          <input required minLength={2} value={nome} onChange={(e) => setNome(e.target.value)} className={campo} />
        </label>
        <label className="block">
          <span className="rotulo mb-1 block">Categoria</span>
          <select required value={categoria} onChange={(e) => setCategoria(e.target.value)} className={campo}>
            <option value="">Escolha</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="rotulo mb-1 block">Bairro</span>
            <input value={bairro} onChange={(e) => setBairro(e.target.value)} className={campo} />
          </label>
          <label className="block">
            <span className="rotulo mb-1 block">Telefone</span>
            <input type="tel" value={telefone} onChange={(e) => setTelefone(e.target.value)} className={campo} />
          </label>
        </div>
        <label className="block">
          <span className="rotulo mb-1 block">Endereço</span>
          <input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Rua, número" className={campo} />
        </label>
        <p className="text-[13px] text-suave">Cidade: Uberlândia-MG</p>
        {erro && (
          <p role="alert" className="text-sm text-perigo">
            {erro}
          </p>
        )}
        <button type="submit" disabled={enviando} className="botao-principal h-11 w-full">
          {enviando ? "Enviando…" : "Enviar para aprovação"}
        </button>
      </form>
    </div>
  );
}
