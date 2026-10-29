// Pega o endereço e a chave PÚBLICA (anon) do banco no site publicado, para compilar o app de computador
// com o mesmo banco. Nada secreto: são os mesmos valores que qualquer navegador recebe ao abrir o site.
import { appendFileSync } from "node:fs";

const SITE = process.env.ROVIBES_SITE || "https://rovibes.vercel.app";
let url = process.env.VITE_SUPABASE_URL || "";
let chave = process.env.VITE_SUPABASE_ANON_KEY || "";

if (!url || !chave) {
  const html = await (await fetch(`${SITE}/`)).text();
  const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1]);
  for (const s of scripts) {
    const js = await (await fetch(`${SITE}${s}`)).text();
    url ||= js.match(/https:\/\/[a-z0-9]{20}\.supabase\.co/)?.[0] ?? "";
    if (!chave) {
      for (const m of js.matchAll(/eyJ[A-Za-z0-9_-]+\.eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)) {
        try {
          const carga = JSON.parse(Buffer.from(m[0].split(".")[1], "base64url").toString());
          if (carga.role === "anon") {
            chave = m[0];
            break;
          }
        } catch {
          /* não é a chave */
        }
      }
      chave ||= js.match(/sb_publishable_[A-Za-z0-9_-]+/)?.[0] ?? "";
    }
    if (url && chave) break;
  }
}

if (!url || !chave) {
  console.error("Não encontrei o endereço/chave pública do banco no site publicado.");
  process.exit(1);
}
appendFileSync(process.env.GITHUB_ENV, `VITE_SUPABASE_URL=${url}\nVITE_SUPABASE_ANON_KEY=${chave}\n`);
console.log(`Banco: ${url}`);
