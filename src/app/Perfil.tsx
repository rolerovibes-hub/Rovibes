import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Bookmark, ChevronRight, LogOut, MapPinned, Store, Wallet } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";

interface ItemLista {
  id: string;
  nome: string;
  detalhe: string;
}

function MinhasListas({ usuario }: { usuario: string }) {
  const [salvos, setSalvos] = useState<ItemLista[]>([]);
  const [checkins, setCheckins] = useState<ItemLista[]>([]);

  useEffect(() => {
    Promise.all([
      supabase
        .from("salvos")
        .select("criado_em, estabelecimento:estabelecimentos(id, nome, bairro)")
        .eq("usuario_id", usuario)
        .order("criado_em", { ascending: false })
        .limit(30),
      supabase
        .from("checkins")
        .select("id, criado_em, estabelecimento:estabelecimentos(id, nome)")
        .eq("usuario_id", usuario)
        .order("criado_em", { ascending: false })
        .limit(10),
    ]).then(([a, b]) => {
      type Linha = { id?: string; criado_em: string; estabelecimento: { id: string; nome: string; bairro?: string | null } | null };
      setSalvos(
        ((a.data ?? []) as unknown as Linha[])
          .filter((x) => x.estabelecimento)
          .map((x) => ({ id: x.estabelecimento!.id, nome: x.estabelecimento!.nome, detalhe: x.estabelecimento!.bairro ?? "" })),
      );
      setCheckins(
        ((b.data ?? []) as unknown as Linha[])
          .filter((x) => x.estabelecimento)
          .map((x) => ({
            id: x.estabelecimento!.id,
            nome: x.estabelecimento!.nome,
            detalhe: new Date(x.criado_em).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }),
          })),
      );
    });
  }, [usuario]);

  const lista = (titulo: string, Icone: typeof Bookmark, itens: ItemLista[], vazio: string) => (
    <section>
      <h2 className="mb-2 flex items-center gap-2 font-semibold">
        <Icone className="h-4 w-4 text-destaque" />
        {titulo}
      </h2>
      {itens.length === 0 ? (
        <p className="cartao px-4 py-4 text-sm text-suave">{vazio}</p>
      ) : (
        <ul className="cartao divide-y divide-borda">
          {itens.map((i, n) => (
            <li key={`${i.id}-${n}`}>
              <Link to={`/lugar/${i.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-elevado">
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{i.nome}</span>
                  {i.detalhe && <span className="block text-[13px] text-suave">{i.detalhe}</span>}
                </span>
                <ChevronRight className="h-4 w-4 text-suave" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  return (
    <>
      {lista("Salvos", Bookmark, salvos, "Toque em Salvar na página de um lugar para guardá-lo aqui.")}
      {lista("Meus check-ins", MapPinned, checkins, "Seus check-ins aparecem aqui.")}
    </>
  );
}

export function Perfil() {
  const { sessao, perfil, email, sair } = useSessao();

  return (
    <div className="space-y-6 px-4 py-6">
      {sessao ? (
        <div className="flex items-center gap-4">
          <Avatar nome={perfil?.nome || "?"} tamanho="lg" />
          <div className="min-w-0">
            <h1 className="truncate text-lg font-semibold">{perfil?.nome}</h1>
            <p className="truncate text-sm text-suave">{email}</p>
          </div>
        </div>
      ) : (
        <div className="cartao space-y-4 p-5 text-center">
          <h1 className="text-lg font-semibold">Entre no RoVibes</h1>
          <p className="text-sm text-suave">Salve lugares, confirme presença em eventos e converse com quem vai.</p>
          <div className="grid grid-cols-2 gap-2">
            <Link to="/entrar?voltar=/perfil" className="botao">
              Entrar
            </Link>
            <Link to="/entrar?voltar=/perfil&modo=criar" className="botao-principal">
              Criar conta
            </Link>
          </div>
        </div>
      )}

      {sessao && <MinhasListas usuario={sessao.user.id} />}

      <Link to="/carteira" className="cartao flex items-center gap-3 px-4 py-3.5 hover:bg-elevado">
        <Wallet className="h-5 w-5 text-destaque" />
        <span className="flex-1">
          <span className="block">Carteira</span>
          <span className="block text-[13px] text-suave">Cupons, ingressos e pontos</span>
        </span>
        <ChevronRight className="h-4 w-4 text-suave" />
      </Link>

      <section className="space-y-2">
        <h2 className="rotulo">Tema</h2>
        <SeletorTema />
      </section>

      <Link to="/business" className="cartao flex items-center gap-3 px-4 py-3.5 hover:bg-elevado">
        <Store className="h-5 w-5 text-destaque" />
        <span className="flex-1">
          <span className="block font-medium">Tem um estabelecimento?</span>
          <span className="block text-[13px] text-suave">Abrir o RoVibes Business</span>
        </span>
        <ChevronRight className="h-4 w-4 text-suave" />
      </Link>

      {sessao && (
        <button onClick={() => void sair()} className="botao w-full text-perigo">
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      )}
    </div>
  );
}
