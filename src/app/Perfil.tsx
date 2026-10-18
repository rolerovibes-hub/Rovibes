import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Bookmark, Briefcase, ChevronRight, Lock, LogOut, MapPinned, Store, UserPlus, Wallet } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SeletorTema } from "@/components/SeletorTema";
import { useSessao } from "@/lib/sessao";
import { buscarPerfilPessoa, PerfilPessoa } from "@/lib/pessoas";
import { Contadores } from "./PessoaPagina";
import { EditarPerfil } from "./EditarPerfil";
import { buscarStoriesPessoas, GrupoStories } from "./conteudo";
import { AnelStory, VisorStories } from "./VisorStories";

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

function Cabecalho() {
  const { sessao, perfil } = useSessao();
  const [dados, setDados] = useState<PerfilPessoa | null>(null);
  const [pedidos, setPedidos] = useState(0);
  const [stories, setStories] = useState<GrupoStories[]>([]);
  const [visor, setVisor] = useState(false);
  const [editando, setEditando] = useState(false);
  const eu = sessao!.user.id;

  const carregar = useCallback(async () => {
    if (!perfil?.usuario) return;
    const [d, pend, st] = await Promise.all([
      buscarPerfilPessoa(perfil.usuario).catch(() => null),
      supabase.from("seguidores_pessoas").select("seguidor_id", { count: "exact", head: true }).eq("seguido_id", eu).eq("situacao", "pendente"),
      buscarStoriesPessoas(eu, eu),
    ]);
    setDados(d);
    setPedidos(pend.count ?? 0);
    setStories(st);
  }, [perfil?.usuario, eu]);
  useEffect(() => {
    void carregar();
  }, [carregar]);

  if (!perfil) return null;
  const temStory = stories.length > 0;

  return (
    <section>
      <div className="flex items-center gap-5">
        <button onClick={() => temStory && setVisor(true)} disabled={!temStory} aria-label={temStory ? "Ver seu story" : undefined}>
          {temStory ? (
            <AnelStory visto={false}>
              <Avatar nome={perfil.nome || "?"} foto={perfil.foto_url} tamanho="xl" />
            </AnelStory>
          ) : (
            <Avatar nome={perfil.nome || "?"} foto={perfil.foto_url} tamanho="xl" />
          )}
        </button>
        {dados ? <Contadores pessoa={dados} /> : <span className="flex-1" />}
      </div>
      <h1 className="mt-3 flex items-center gap-1.5 text-lg font-semibold">
        {perfil.nome}
        {perfil.privado && <Lock className="h-3.5 w-3.5 text-suave" aria-label="Perfil privado" />}
      </h1>
      {perfil.usuario && <p className="text-sm text-suave">@{perfil.usuario}</p>}
      {perfil.bio && <p className="mt-1 whitespace-pre-line text-[15px]">{perfil.bio}</p>}
      {perfil.suspenso && <p className="mt-2 rounded-lg bg-perigo/10 px-3 py-2 text-sm text-perigo">Sua conta está suspensa pela moderação do RoVibes.</p>}
      <button className="botao mt-4 w-full" onClick={() => setEditando(true)}>
        Editar perfil
      </button>
      {pedidos > 0 && perfil.usuario && (
        <Link to={`/p/${perfil.usuario}/seguidores`} className="cartao mt-3 flex items-center gap-3 border-marca px-4 py-3 hover:bg-elevado">
          <UserPlus className="h-5 w-5 text-destaque" />
          <span className="flex-1 text-sm font-medium">
            {pedidos} {pedidos === 1 ? "pedido" : "pedidos"} para seguir você
          </span>
          <ChevronRight className="h-4 w-4 text-suave" />
        </Link>
      )}
      {editando && (
        <EditarPerfil
          fechar={() => {
            setEditando(false);
            void carregar();
          }}
        />
      )}
      {visor && (
        <VisorStories
          grupos={stories}
          inicio={0}
          usuario={eu}
          fechar={() => {
            setVisor(false);
            void carregar();
          }}
        />
      )}
    </section>
  );
}

export function Perfil() {
  const { sessao, email, sair } = useSessao();
  const [equipe, setEquipe] = useState(false);
  useEffect(() => {
    if (!sessao) return;
    supabase
      .from("membros")
      .select("estabelecimento_id")
      .eq("usuario_id", sessao.user.id)
      .eq("ativo", true)
      .limit(1)
      .then(({ data }) => setEquipe(!!data?.length));
  }, [sessao]);

  return (
    <div className="space-y-6 px-4 py-6">
      {sessao ? (
        <Cabecalho />
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

      {equipe && (
        <Link to="/job" className="cartao flex items-center gap-3 border-marca px-4 py-3.5 hover:bg-elevado">
          <Briefcase className="h-5 w-5 text-destaque" />
          <span className="flex-1">
            <span className="block font-medium">Modo trabalho</span>
            <span className="block text-[13px] text-suave">RoVibes Job: mesas, preparo e entregas</span>
          </span>
          <ChevronRight className="h-4 w-4 text-suave" />
        </Link>
      )}

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
        <>
          <p className="text-center text-[13px] text-suave">Conectado como {email}</p>
          <button onClick={() => void sair()} className="botao w-full text-perigo">
          <LogOut className="h-4 w-4" />
          Sair
          </button>
        </>
      )}
    </div>
  );
}
