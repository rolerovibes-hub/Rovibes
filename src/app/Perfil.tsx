import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Bookmark, ChevronRight, Grid3x3, Lock, MapPinned, MoreVertical, UserPlus } from "lucide-react";
import clsx from "clsx";
import { GradePublicacoes } from "@/components/GradePublicacoes";
import { Configuracoes } from "./Configuracoes";
import { Avatar } from "@/components/Avatar";
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

function MinhasListas({ usuario, so }: { usuario: string; so: "salvos" | "checkins" }) {
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

  return so === "salvos"
    ? lista("Lugares salvos", Bookmark, salvos, "Toque em Salvar na página de um lugar para guardá-lo aqui.")
    : lista("Meus check-ins", MapPinned, checkins, "Seus check-ins aparecem aqui.");
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
      <h1 className="mt-3 text-lg font-semibold">{perfil.nome}</h1>
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

type Aba = "publicacoes" | "salvos" | "checkins";

export function Perfil() {
  const { sessao, perfil } = useSessao();
  const [config, setConfig] = useState(false);
  const [aba, setAba] = useState<Aba>("publicacoes");
  if (!sessao || !perfil) return null;

  return (
    <div className="pb-6">
      <div className="flex items-center justify-between px-4 pt-2">
        <p className="flex items-center gap-1.5 truncate text-[17px] font-semibold">
          {perfil.usuario ?? perfil.nome}
          {perfil.privado && <Lock className="h-3.5 w-3.5 text-suave" aria-label="Perfil privado" />}
        </p>
        <button onClick={() => setConfig(true)} className="-mr-2 rounded-full p-2 hover:bg-elevado" aria-label="Configurações">
          <MoreVertical className="h-5 w-5" />
        </button>
      </div>
      <div className="px-4 pt-2">
        <Cabecalho />
      </div>

      <div className="mt-5 grid grid-cols-3 border-b border-borda" role="tablist" aria-label="Conteúdo do perfil">
        {(
          [
            ["publicacoes", Grid3x3, "Publicações"],
            ["salvos", Bookmark, "Salvos"],
            ["checkins", MapPinned, "Check-ins"],
          ] as const
        ).map(([id, Icone, nome]) => (
          <button
            key={id}
            role="tab"
            aria-selected={aba === id}
            onClick={() => setAba(id)}
            className={clsx("flex items-center justify-center gap-1.5 border-b-2 py-2.5 text-sm", aba === id ? "border-texto font-semibold" : "border-transparent text-suave")}
          >
            <Icone className="h-4 w-4" />
            {nome}
          </button>
        ))}
      </div>

      {aba === "publicacoes" ? (
        <GradePublicacoes pessoa={sessao.user.id} autor={{ nome: perfil.nome, usuario: perfil.usuario ?? null, foto_url: perfil.foto_url ?? null }} />
      ) : (
        <div className="px-4 pt-4">
          <MinhasListas usuario={sessao.user.id} so={aba} />
        </div>
      )}

      {config && <Configuracoes fechar={() => setConfig(false)} />}
    </div>
  );
}
