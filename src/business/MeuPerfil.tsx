import { FormEvent, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import clsx from "clsx";
import { Briefcase, Camera, KeyRound, LayoutGrid, Lock, MessageSquare, Phone, Save, Settings2, Smartphone, Star, Store, UserRound, X } from "lucide-react";
import { TelaUniversal } from "./TelaUniversal";
import { Aviso, Campo, Secao } from "@/components/Formulario";
import { Avatar } from "@/components/Avatar";
import { SeletorTema } from "@/components/SeletorTema";
import { mensagemDeErro, supabase } from "@/lib/supabase";
import { reduzirImagem } from "@/lib/imagens";
import { useSessao } from "@/lib/sessao";
import { NOME_PAPEL, useBusiness } from "@/lib/acessos";
import { AREAS_NEGOCIO, partesLiberadas } from "@/lib/areasNegocio";

/** Meu perfil: dados pessoais, preferências e os acessos por área. */
export function MeuPerfil() {
  const { perfil, email, ehAdmin, sessao, recarregar } = useSessao();
  const negocio = useBusiness();
  const { atual, temAcesso } = negocio;
  const [nome, setNome] = useState(perfil?.nome ?? "");
  const [telefone, setTelefone] = useState(perfil?.telefone ?? "");
  const [senha, setSenha] = useState<{ nova: string; confirma: string } | null>(null);
  const [aviso, setAviso] = useState<{ tipo: "erro" | "ok"; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const seletorFoto = useRef<HTMLInputElement>(null);
  const minhasAreas = AREAS_NEGOCIO.map((area) => ({
    area,
    partes: partesLiberadas(area, temAcesso).flatMap((g) => g.itens.map((i) => ({ codigo: i.codigo, nome: i.nome ?? i.codigo }))),
  })).filter((x) => x.partes.length > 0);

  useEffect(() => {
    setNome(perfil?.nome ?? "");
    setTelefone(perfil?.telefone ?? "");
  }, [perfil?.nome, perfil?.telefone]);

  const nascimento = perfil?.data_nascimento ? perfil.data_nascimento.split("-").reverse().join("/") : "";
  const funcao = atual ? atual.cargo || NOME_PAPEL[atual.papel] : ehAdmin ? "Administração RoVibes" : "";
  const ultimoAcesso = sessao?.user.last_sign_in_at
    ? new Date(sessao.user.last_sign_in_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;
  const alterado = nome.trim() !== (perfil?.nome ?? "") || telefone.trim() !== (perfil?.telefone ?? "");

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

  const salvar = () =>
    executar(async () => {
      if (nome.trim().length < 2) throw new Error("Informe seu nome.");
      const { error } = await supabase.from("perfis").update({ nome: nome.trim(), telefone: telefone.trim() || null }).eq("id", sessao!.user.id);
      if (error) throw error;
      await recarregar();
    }, "Dados salvos.");

  const trocarFoto = (arquivos: FileList | null) => {
    const arquivo = arquivos?.[0];
    if (seletorFoto.current) seletorFoto.current.value = "";
    if (!arquivo || !sessao) return;
    void executar(async () => {
      const blob = await reduzirImagem(arquivo, 512);
      const caminho = `${sessao.user.id}/foto-${crypto.randomUUID()}.jpg`;
      const { error } = await supabase.storage.from("avatares").upload(caminho, blob, { contentType: "image/jpeg" });
      if (error) throw /bucket/i.test(error.message) ? new Error("Falta aplicar a atualização 012 do banco para guardar fotos de perfil.") : error;
      const url = supabase.storage.from("avatares").getPublicUrl(caminho).data.publicUrl;
      const antiga = perfil?.foto_url?.split("/avatares/")[1];
      const { error: e2 } = await supabase.from("perfis").update({ foto_url: url }).eq("id", sessao.user.id);
      if (e2) throw e2;
      if (antiga) await supabase.storage.from("avatares").remove([decodeURIComponent(antiga)]);
      await recarregar();
    }, "Foto atualizada.");
  };

  const salvarSenha = (e: FormEvent) => {
    e.preventDefault();
    if (!senha) return;
    void executar(async () => {
      if (senha.nova.length < 6) throw new Error("A senha precisa ter pelo menos 6 caracteres.");
      if (senha.nova !== senha.confirma) throw new Error("As duas senhas não são iguais.");
      const { error } = await supabase.auth.updateUser({ password: senha.nova });
      if (error) throw error;
      setSenha(null);
    }, "Senha alterada.");
  };

  return (
    <TelaUniversal
      acoes={
        <>
          <button className="botao-principal col-span-2 sm:col-span-1" disabled={!alterado || ocupado} onClick={() => void salvar()}>
            <Save className="h-4 w-4" />
            Salvar
          </button>
          <button className="botao" disabled={ocupado} onClick={() => seletorFoto.current?.click()}>
            <Camera className="h-4 w-4" />
            Alterar foto
          </button>
          <button className="botao" onClick={() => setSenha({ nova: "", confirma: "" })}>
            <KeyRound className="h-4 w-4" />
            Alterar senha
          </button>
          <hr className="col-span-full my-1 border-borda" />
          <button className="botao" disabled title="Chega com o chat (fase 6)">
            <MessageSquare className="h-4 w-4" />
            Mensagens
          </button>
          <Link to="/job" className="botao">
            <Briefcase className="h-4 w-4" />
            RoVibes Job
          </Link>
          <Link to="/" className="botao">
            <Smartphone className="h-4 w-4" />
            RoVibes App
          </Link>
          <Link to="/business/novo" className="botao">
            <Store className="h-4 w-4" />
            Novo estabelecimento
          </Link>
        </>
      }
    >
      <input ref={seletorFoto} type="file" accept="image/*" className="hidden" onChange={(e) => trocarFoto(e.target.files)} />
      {aviso && <Aviso tipo={aviso.tipo}>{aviso.texto}</Aviso>}

      <section className="cartao flex flex-wrap items-center gap-5 p-5">
        <button onClick={() => seletorFoto.current?.click()} className="relative rounded-full" aria-label="Alterar foto">
          <Avatar nome={perfil?.nome || "?"} tamanho="xl" foto={perfil?.foto_url} />
          <span className="absolute bottom-0 right-0 flex h-8 w-8 items-center justify-center rounded-full border-2 border-superficie bg-elevado text-suave">
            <Camera className="h-4 w-4" />
          </span>
        </button>
        <div className="min-w-0">
          <p className="text-xl font-semibold">{perfil?.nome}</p>
          <p className="text-sm text-suave">{[funcao, atual?.estabelecimento.nome].filter(Boolean).join(" · ")}</p>
          {ultimoAcesso && (
            <p className="mt-1 text-[12px] text-suave">
              Último acesso <span className="codigo">{ultimoAcesso}</span>
            </p>
          )}
        </div>
      </section>

      {senha && (
        <Secao
          titulo="Alterar senha"
          acao={
            <button className="botao h-8 w-8 px-0" onClick={() => setSenha(null)} aria-label="Fechar">
              <X className="h-4 w-4" />
            </button>
          }
        >
          <form onSubmit={salvarSenha} className="flex flex-wrap items-end gap-3">
            <Campo rotulo="Nova senha" className="w-56">
              <input type="password" autoComplete="new-password" autoFocus className="entrada" value={senha.nova} onChange={(e) => setSenha({ ...senha, nova: e.target.value })} />
            </Campo>
            <Campo rotulo="Repita a nova senha" className="w-56">
              <input type="password" autoComplete="new-password" className="entrada" value={senha.confirma} onChange={(e) => setSenha({ ...senha, confirma: e.target.value })} />
            </Campo>
            <button type="submit" className="botao-principal h-10" disabled={ocupado}>
              Salvar senha
            </button>
          </form>
        </Secao>
      )}

      <Secao titulo="Identificação">
        <div className="grid gap-4 md:grid-cols-3">
          <Campo rotulo="Nome de exibição" className="md:col-span-2">
            <input className="entrada" value={nome} onChange={(e) => setNome(e.target.value)} />
          </Campo>
          <Bloqueado rotulo="Data de nascimento" valor={nascimento} />
          <Bloqueado rotulo="E-mail" valor={email ?? ""} />
          <Bloqueado rotulo="Papel" valor={atual ? NOME_PAPEL[atual.papel] : ehAdmin ? "Administração" : "—"} />
          <Bloqueado rotulo="Cargo" valor={atual?.cargo ?? "—"} />
          <Bloqueado rotulo="Estabelecimento" valor={atual?.estabelecimento.nome ?? "—"} className="md:col-span-3" />
        </div>
      </Secao>

      <div className="grid gap-4 lg:grid-cols-2">
        <Secao titulo="Contato">
          <Campo rotulo="Telefone">
            <span className="relative block">
              <Phone className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-suave" />
              <input className="entrada pl-9" inputMode="tel" placeholder="(34) 99999-9999" value={telefone} onChange={(e) => setTelefone(e.target.value)} />
            </span>
          </Campo>
        </Secao>
        <Secao titulo="Preferências">
          <span className="rotulo mb-1 flex items-center gap-1.5">
            <Settings2 className="h-3.5 w-3.5" />
            Tema
          </span>
          <SeletorTema />
        </Secao>
      </div>

      <Secao titulo="Meus acessos">
        {minhasAreas.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-suave">
            <UserRound className="h-4 w-4" />—
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {minhasAreas.map(({ area, partes }) => (
              <li key={area.id} className="rounded-lg border border-borda bg-fundo p-3">
                <Link to={`/business/area/${area.id}`} className="flex items-center gap-2.5 font-semibold">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg text-white" style={{ backgroundColor: area.cor }}>
                    <area.icone className="h-4 w-4" />
                  </span>
                  {area.nome}
                </Link>
                <span className="mt-2 flex flex-wrap gap-1.5">
                  {partes.map((p) => (
                    <Link key={p.codigo} to={`/business/area/${area.id}/${p.codigo}`} className="rounded-full border border-borda px-2.5 py-1 text-[12px] hover:bg-elevado">
                      {p.nome}
                    </Link>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Secao>
    </TelaUniversal>
  );
}

function Bloqueado({ rotulo, valor, className }: { rotulo: string; valor: string; className?: string }) {
  return (
    <div className={className}>
      <span className="rotulo mb-1 flex items-center gap-1">
        <Lock className="h-3 w-3" />
        {rotulo}
      </span>
      <p className="flex h-10 items-center truncate rounded-lg border border-borda bg-elevado px-3 text-sm text-suave">{valor || "—"}</p>
    </div>
  );
}
