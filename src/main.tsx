import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "./index.css";
import { TemaProvider } from "./lib/tema";
import { SessaoProvider } from "./lib/sessao";
import App from "./App";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <TemaProvider>
      <SessaoProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </SessaoProvider>
    </TemaProvider>
  </React.StrictMode>,
);
