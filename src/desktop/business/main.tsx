import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter } from "react-router-dom";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "../../index.css";
import { TemaProvider } from "@/lib/tema";
import { SessaoProvider } from "@/lib/sessao";
import { AppDesktop } from "./App";

// Sem o menu do navegador (botão direito) fora dos campos de texto: é um app, não uma página.
window.addEventListener("contextmenu", (e) => {
  const alvo = e.target as HTMLElement;
  if (!alvo.closest("input, textarea, [contenteditable=true]")) e.preventDefault();
});

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TemaProvider>
      <SessaoProvider>
        <HashRouter>
          <AppDesktop />
        </HashRouter>
      </SessaoProvider>
    </TemaProvider>
  </React.StrictMode>,
);
