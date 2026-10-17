# RoVibes

Plataforma social para descobrir rolês, lugares, eventos e pessoas pela vibe de cada experiência. Um único projeto, um único banco (Supabase), publicado como site na Vercel e como app Android.

## Áreas

| Endereço | Área | Navegação |
| --- | --- | --- |
| `/` | RoVibes App (público) | Barra inferior: Descobrir, Mapa, Feed, Chats, Perfil |
| `/business` | RoVibes Business e Administração | Área de Trabalho com aplicativos por acesso |

## Estrutura

- `src/app/` telas do App do público
- `src/business/` Área de Trabalho, layout e tela universal dos aplicativos
- `src/lib/catalogo.ts` catálogo único de aplicativos (código, nome, área, fase)
- `src/lib/acessos.ts` acessos, favoritos, mais usados e últimos acessos
- `src/index.css` paleta clara e escura

## Comandos

```
npm install
npm run dev
npm run build
```

A especificação aprovada está no documento "RoVibes — Especificação da Versão 1".
