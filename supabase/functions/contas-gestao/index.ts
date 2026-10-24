// Contas da Gestão RoVibes (equipe da plataforma): login próprio + código do app autenticador.
// O CEO é criado uma única vez, confirmando com a conta pessoal que hoje é administradora.
import { admin, cors, resposta } from "../_compartilhado/mp.ts";

const DOMINIO = "gestao.rovibes.app";
const LOGIN = /^[a-z0-9._]{3,30}$/;
type Corpo = Record<string, unknown>;
const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");

function cargaDoToken(token: string): Record<string, unknown> {
  try {
    const parte = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(parte + "=".repeat((4 - (parte.length % 4)) % 4)));
  } catch {
    return {};
  }
}

/** Quem chama precisa ser CEO ou nível geral da Gestão, com o código confirmado (aal2). */
async function gestorQueChama(req: Request) {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data } = await admin().auth.getUser(token);
  if (!data.user) throw new Error("Entre na Gestão de novo.");
  if (cargaDoToken(token).aal !== "aal2") throw new Error("Confirme o código do autenticador.");
  const { data: g } = await admin().from("gestao_contas").select("usuario_id, ceo, ativo").eq("usuario_id", data.user.id).maybeSingle();
  const { data: a } = await admin().from("administradores").select("niveis").eq("usuario_id", data.user.id).maybeSingle();
  if (!g?.ativo || !(g.ceo || (a?.niveis as string[] | undefined)?.includes("geral"))) throw new Error("Só o CEO e o nível geral mexem na organização.");
  return g;
}

function validar(login: string, senha: string, nome: string) {
  if (!LOGIN.test(login)) throw new Error("Usuário: use de 3 a 30 letras minúsculas, números, ponto ou _ (sem espaço).");
  if (senha.length < 10) throw new Error("A senha da Gestão precisa ter pelo menos 10 caracteres.");
  if (nome.length < 2) throw new Error("Informe o nome.");
}

async function criarConta(dados: { login: string; senha: string; nome: string; ceo: boolean; cargo: string | null; niveis: string[]; criadoPor: string | null }) {
  validar(dados.login, dados.senha, dados.nome);
  const { data: existe } = await admin().from("gestao_contas").select("usuario_id").eq("login", dados.login).maybeSingle();
  if (existe) throw new Error(`Já existe o usuário "${dados.login}" na Gestão.`);
  const { data: criado, error } = await admin().auth.admin.createUser({
    email: `${dados.login}@${DOMINIO}`,
    password: dados.senha,
    email_confirm: true,
    user_metadata: { nome: dados.nome, conta_sistema: true, conta_gestao: true, login: dados.login },
  });
  if (error || !criado.user) throw new Error(error?.message ?? "Não foi possível criar o usuário.");
  const id = criado.user.id;
  const r1 = await admin().from("gestao_contas").insert({ usuario_id: id, login: dados.login, nome: dados.nome, ceo: dados.ceo, cargo_id: dados.cargo, criado_por: dados.criadoPor });
  const r2 = r1.error ? r1 : await admin().from("administradores").upsert({ usuario_id: id, niveis: dados.niveis, adicionado_por: dados.criadoPor });
  if (r2.error) {
    await admin().auth.admin.deleteUser(id);
    throw new Error(r2.error.message);
  }
  return { usuario_id: id, login: dados.login };
}

const acoes: Record<string, (c: Corpo, req: Request) => Promise<unknown>> = {
  // Primeiro CEO: só uma vez, por quem hoje é administrador (conta pessoal).
  async criar_ceo(c) {
    const { data: tem } = await admin().from("gestao_contas").select("usuario_id").eq("ceo", true).maybeSingle();
    if (tem) throw new Error("O CEO já foi configurado.");
    const token = texto(c.token);
    const { data } = await admin().auth.getUser(token);
    if (!data.user) throw new Error("Não foi possível confirmar sua conta. Entre de novo.");
    const { data: adm } = await admin().from("administradores").select("usuario_id").eq("usuario_id", data.user.id).maybeSingle();
    if (!adm) throw new Error("Só quem já é administrador do RoVibes configura o CEO.");
    const r = await criarConta({ login: texto(c.login).toLowerCase(), senha: String(c.senha ?? ""), nome: texto(c.nome), ceo: true, cargo: null, niveis: ["geral"], criadoPor: data.user.id });
    // A administração pelo perfil pessoal deixa de existir.
    const { data: contas } = await admin().from("gestao_contas").select("usuario_id");
    const daGestao = (contas ?? []).map((x) => x.usuario_id as string);
    await admin().from("administradores").delete().not("usuario_id", "in", `(${daGestao.join(",")})`);
    return r;
  },

  async criar_usuario(c, req) {
    const quem = await gestorQueChama(req);
    const cargo = texto(c.cargo_id);
    const { data: cg } = await admin().from("gestao_cargos").select("id, niveis").eq("id", cargo).maybeSingle();
    if (!cg) throw new Error("Escolha o cargo.");
    return await criarConta({ login: texto(c.login).toLowerCase(), senha: String(c.senha ?? ""), nome: texto(c.nome), ceo: false, cargo: cg.id as string, niveis: cg.niveis as string[], criadoPor: quem.usuario_id as string });
  },

  async senha_usuario(c, req) {
    await gestorQueChama(req);
    const alvo = texto(c.usuario_id);
    const senha = String(c.senha ?? "");
    if (senha.length < 10) throw new Error("A senha da Gestão precisa ter pelo menos 10 caracteres.");
    const { data: g } = await admin().from("gestao_contas").select("ceo").eq("usuario_id", alvo).maybeSingle();
    if (!g) throw new Error("Usuário não encontrado.");
    if (g.ceo) throw new Error("A senha do CEO só ele mesmo troca.");
    const { error } = await admin().auth.admin.updateUserById(alvo, { password: senha });
    if (error) throw new Error(error.message);
    return { ok: true };
  },

  // Perdeu o celular: apaga o código do autenticador; no próximo acesso a pessoa cadastra de novo.
  async zerar_codigo(c, req) {
    await gestorQueChama(req);
    const alvo = texto(c.usuario_id);
    const { data: g } = await admin().from("gestao_contas").select("ceo").eq("usuario_id", alvo).maybeSingle();
    if (!g) throw new Error("Usuário não encontrado.");
    if (g.ceo) throw new Error("O código do CEO não pode ser zerado por aqui.");
    const { data: f } = await admin().auth.admin.mfa.listFactors({ userId: alvo });
    for (const fator of f?.factors ?? []) await admin().auth.admin.mfa.deleteFactor({ userId: alvo, id: fator.id });
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
