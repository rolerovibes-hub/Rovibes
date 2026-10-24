// Usuários do sistema do estabelecimento (RoVibes Business e Job): login = código do estabelecimento + usuário + senha.
// Não mistura com o perfil pessoal do app: a conta pessoal só serve para provar quem é o responsável
// (cadastrar o estabelecimento, primeiro acesso do proprietário e recuperar a senha dele).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { admin, CHAVE_ANON, cors, resposta, URL_SUPABASE } from "../_compartilhado/mp.ts";

const DOMINIO = "sistema.rovibes.app";
const LOGIN = /^[a-z0-9._]{3,30}$/;
const CODIGO = /^[a-z0-9-]{3,30}$/;
const emailSistema = (login: string, codigo: string) => `${login}.${codigo}@${DOMINIO}`;

type Corpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Conta pessoal (do app) dona do token. Contas do sistema não servem como responsável. */
async function pessoaDoToken(token: unknown) {
  if (typeof token !== "string" || !token) throw new Error("Entre com sua conta pessoal do RoVibes para confirmar quem é você.");
  const { data, error } = await admin().auth.getUser(token);
  if (error || !data.user) throw new Error("Não foi possível confirmar sua conta. Entre de novo.");
  const { data: c } = await admin().from("contas_sistema").select("usuario_id").eq("usuario_id", data.user.id).maybeSingle();
  if (c) throw new Error("Use a sua conta pessoal do RoVibes (a do app), não um usuário do sistema.");
  return data.user;
}

/** Usuário do sistema que está chamando (pelo cabeçalho Authorization). */
async function contaQueChama(req: Request) {
  const aut = req.headers.get("Authorization") ?? "";
  const token = aut.replace(/^Bearer\s+/i, "");
  const { data } = await admin().auth.getUser(token);
  if (!data.user) throw new Error("Entre no sistema de novo.");
  const { data: c } = await admin().from("contas_sistema").select("usuario_id, estabelecimento_id, login").eq("usuario_id", data.user.id).maybeSingle();
  if (!c) throw new Error("Só usuários do sistema do estabelecimento podem fazer isso.");
  const usuario = createClient(URL_SUPABASE, CHAVE_ANON, { global: { headers: { Authorization: `Bearer ${token}` } }, auth: { persistSession: false } });
  const { data: pode } = await usuario.rpc("pode_usar", { p_estab: c.estabelecimento_id, p_codigo: "G3001" });
  const { data: m } = await admin().from("membros").select("papel").eq("estabelecimento_id", c.estabelecimento_id).eq("usuario_id", c.usuario_id).maybeSingle();
  return { ...c, gerencia: !!pode, proprietario: m?.papel === "proprietario" };
}

function validarSenha(senha: string) {
  if (senha.length < 8) throw new Error("A senha precisa ter pelo menos 8 caracteres.");
}

/** Cria o usuário do sistema: conta, perfil interno, vínculo e papel. */
async function criarConta(estab: { id: string; codigo: string }, dados: { login: string; senha: string; nome: string; papel: string; cargo: string | null; criadoPor: string | null }) {
  const login = dados.login.toLowerCase();
  if (!LOGIN.test(login)) throw new Error("Usuário: use de 3 a 30 letras minúsculas, números, ponto ou _ (sem espaço).");
  validarSenha(dados.senha);
  if (dados.nome.length < 2) throw new Error("Informe o nome da pessoa.");
  const { data: existe } = await admin().from("contas_sistema").select("usuario_id").eq("estabelecimento_id", estab.id).eq("login", login).maybeSingle();
  if (existe) throw new Error(`Já existe o usuário "${login}" neste estabelecimento.`);
  const { data: criado, error } = await admin().auth.admin.createUser({
    email: emailSistema(login, estab.codigo),
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome, conta_sistema: true, login, codigo: estab.codigo },
  });
  if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");
  const id = criado.user.id;
  const r1 = await admin().from("contas_sistema").insert({ usuario_id: id, estabelecimento_id: estab.id, login, criado_por: dados.criadoPor });
  const r2 = r1.error ? r1 : await admin().from("membros").insert({ estabelecimento_id: estab.id, usuario_id: id, papel: dados.papel, cargo: dados.cargo });
  if (r2.error) {
    await admin().auth.admin.deleteUser(id);
    throw new Error(r2.error.message);
  }
  return { usuario_id: id, login, codigo: estab.codigo };
}

async function trocarSenha(usuario: string, senha: string) {
  validarSenha(senha);
  const { error } = await admin().auth.admin.updateUserById(usuario, { password: senha });
  if (error) throw new Error(error.message);
}

const acoes: Record<string, (c: Corpo, req: Request) => Promise<unknown>> = {
  // Estabelecimentos em que a conta pessoal é responsável (ou era proprietária antes da separação).
  async meus_estabelecimentos(c) {
    const p = await pessoaDoToken(c.token);
    const { data: legado } = await admin().from("membros_legado").select("estabelecimento_id").eq("usuario_id", p.id).eq("papel", "proprietario");
    const ids = new Set<string>((legado ?? []).map((l) => l.estabelecimento_id as string));
    const { data: resp } = await admin().from("estabelecimentos").select("id").eq("responsavel_id", p.id);
    for (const r of resp ?? []) ids.add(r.id as string);
    if (!ids.size) return { estabelecimentos: [] };
    const { data: estabs } = await admin().from("estabelecimentos").select("id, nome, codigo, situacao").in("id", [...ids]);
    const lista = [];
    for (const e of estabs ?? []) {
      const { data: dono } = await admin().from("membros").select("usuario_id").eq("estabelecimento_id", e.id).eq("papel", "proprietario").limit(1).maybeSingle();
      const { data: conta } = dono ? await admin().from("contas_sistema").select("login").eq("usuario_id", dono.usuario_id).maybeSingle() : { data: null };
      lista.push({ ...e, login_proprietario: (conta?.login as string | undefined) ?? null });
    }
    return { estabelecimentos: lista };
  },

  // Novo estabelecimento: entra em análise e já cria o usuário do proprietário.
  async cadastrar(c) {
    const p = await pessoaDoToken(c.token);
    const e = (c.estab ?? {}) as Corpo;
    const nome = texto(e.nome);
    if (nome.length < 2) throw new Error("Informe o nome do estabelecimento.");
    const codigo = texto(c.codigo).toLowerCase();
    if (!CODIGO.test(codigo)) throw new Error("Código: use de 3 a 30 letras minúsculas, números ou hífen (sem espaço).");
    const { data: usado } = await admin().from("estabelecimentos").select("id").eq("codigo", codigo).maybeSingle();
    if (usado) throw new Error("Esse código já está em uso. Escolha outro.");
    const { data: estab, error } = await admin()
      .from("estabelecimentos")
      .insert({
        nome,
        codigo,
        categoria_id: e.categoria_id ? Number(e.categoria_id) : null,
        bairro: texto(e.bairro) || null,
        endereco: texto(e.endereco) || null,
        telefone: texto(e.telefone) || null,
        criado_por: p.id,
        responsavel_id: p.id,
      })
      .select("id, codigo")
      .single();
    if (error || !estab) throw new Error(error?.message ?? "Não foi possível cadastrar.");
    try {
      return await criarConta(estab as { id: string; codigo: string }, {
        login: texto(c.login),
        senha: String(c.senha ?? ""),
        nome: texto(c.nome) || "Proprietário",
        papel: "proprietario",
        cargo: "Proprietário",
        criadoPor: null,
      });
    } catch (err) {
      await admin().from("estabelecimentos").delete().eq("id", estab.id);
      throw err;
    }
  },

  // Primeiro acesso do proprietário de um estabelecimento que já existia.
  async reivindicar(c) {
    const p = await pessoaDoToken(c.token);
    const estabId = texto(c.estab_id);
    const { data: e } = await admin().from("estabelecimentos").select("id, codigo, responsavel_id").eq("id", estabId).maybeSingle();
    if (!e) throw new Error("Estabelecimento não encontrado.");
    const { data: legado } = await admin().from("membros_legado").select("papel").eq("estabelecimento_id", estabId).eq("usuario_id", p.id).maybeSingle();
    if (e.responsavel_id !== p.id && legado?.papel !== "proprietario") throw new Error("Só o responsável pelo estabelecimento pode criar o usuário do proprietário.");
    const { data: dono } = await admin().from("membros").select("usuario_id").eq("estabelecimento_id", estabId).eq("papel", "proprietario").limit(1).maybeSingle();
    if (dono) throw new Error("Este estabelecimento já tem usuário de proprietário. Use “Esqueci a senha”.");
    const r = await criarConta(e as { id: string; codigo: string }, {
      login: texto(c.login),
      senha: String(c.senha ?? ""),
      nome: texto(c.nome) || "Proprietário",
      papel: "proprietario",
      cargo: "Proprietário",
      criadoPor: null,
    });
    if (!e.responsavel_id) await admin().from("estabelecimentos").update({ responsavel_id: p.id }).eq("id", estabId);
    return r;
  },

  // Esqueci a senha do proprietário: o responsável (conta pessoal) define uma nova.
  async recuperar(c) {
    const p = await pessoaDoToken(c.token);
    const estabId = texto(c.estab_id);
    const { data: e } = await admin().from("estabelecimentos").select("id, codigo, responsavel_id").eq("id", estabId).maybeSingle();
    if (!e || e.responsavel_id !== p.id) throw new Error("Só o responsável pelo estabelecimento pode recuperar a senha do proprietário.");
    const { data: dono } = await admin().from("membros").select("usuario_id").eq("estabelecimento_id", estabId).eq("papel", "proprietario").limit(1).maybeSingle();
    if (!dono) throw new Error("Este estabelecimento ainda não tem usuário de proprietário. Use “Primeiro acesso”.");
    await trocarSenha(dono.usuario_id as string, String(c.senha ?? ""));
    const { data: conta } = await admin().from("contas_sistema").select("login").eq("usuario_id", dono.usuario_id).maybeSingle();
    return { login: conta?.login, codigo: e.codigo };
  },

  // Proprietário/gestão cria um usuário da equipe.
  async criar_usuario(c, req) {
    const quem = await contaQueChama(req);
    if (!quem.gerencia) throw new Error("Você não pode criar usuários neste estabelecimento.");
    const { data: e } = await admin().from("estabelecimentos").select("id, codigo").eq("id", quem.estabelecimento_id).single();
    const papel = c.papel === "gestor" && quem.proprietario ? "gestor" : "equipe";
    return await criarConta(e as { id: string; codigo: string }, {
      login: texto(c.login),
      senha: String(c.senha ?? ""),
      nome: texto(c.nome),
      papel,
      cargo: texto(c.cargo) || null,
      criadoPor: quem.usuario_id,
    });
  },

  // Nova senha para um usuário da equipe (a do proprietário só ele mesmo troca).
  async senha_usuario(c, req) {
    const quem = await contaQueChama(req);
    const alvo = texto(c.usuario_id);
    const { data: conta } = await admin().from("contas_sistema").select("usuario_id, estabelecimento_id").eq("usuario_id", alvo).maybeSingle();
    if (!conta || conta.estabelecimento_id !== quem.estabelecimento_id) throw new Error("Usuário não encontrado neste estabelecimento.");
    const { data: m } = await admin().from("membros").select("papel").eq("estabelecimento_id", conta.estabelecimento_id).eq("usuario_id", alvo).maybeSingle();
    if (alvo !== quem.usuario_id) {
      if (!quem.gerencia) throw new Error("Você não pode trocar a senha de outros usuários.");
      if (m?.papel === "proprietario") throw new Error("A senha do proprietário só ele mesmo troca.");
      if (m?.papel === "gestor" && !quem.proprietario) throw new Error("Só o proprietário troca a senha de um gestor.");
    }
    await trocarSenha(alvo, String(c.senha ?? ""));
    return { ok: true };
  },
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const corpo = (await req.json()) as Corpo;
    const acao = acoes[String(corpo.acao ?? "")];
    if (!acao) return resposta({ erro: "Ação desconhecida." }, 400);
    return resposta(await acao(corpo, req));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro inesperado.";
    return resposta({ erro: /already been registered|already exists/i.test(msg) ? "Esse usuário já existe." : msg }, 400);
  }
});
