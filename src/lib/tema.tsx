import { createContext, ReactNode, useContext, useEffect, useState } from "react";
import { ler, gravar } from "./armazenamento";

export type Tema = "escuro" | "claro" | "sistema";

const TemaContexto = createContext<{ tema: Tema; escuro: boolean; definir: (t: Tema) => void }>({
  tema: "escuro",
  escuro: true,
  definir: () => {},
});

export function TemaProvider({ children }: { children: ReactNode }) {
  const [tema, setTema] = useState<Tema>(() => ler<Tema>("tema", "escuro"));
  const [escuro, setEscuro] = useState(true);

  useEffect(() => {
    const raiz = document.documentElement;
    const meta = document.querySelector('meta[name="theme-color"]');
    const aplicar = (escuro: boolean) => {
      raiz.classList.toggle("dark", escuro);
      setEscuro(escuro);
      meta?.setAttribute("content", escuro ? "#1A1F2B" : "#F4F5F8");
    };
    if (tema !== "sistema") {
      aplicar(tema === "escuro");
      return;
    }
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    aplicar(mql.matches);
    const ouvir = (e: MediaQueryListEvent) => aplicar(e.matches);
    mql.addEventListener("change", ouvir);
    return () => mql.removeEventListener("change", ouvir);
  }, [tema]);

  const definir = (t: Tema) => {
    setTema(t);
    gravar("tema", t);
  };

  return <TemaContexto.Provider value={{ tema, escuro, definir }}>{children}</TemaContexto.Provider>;
}

export const useTema = () => useContext(TemaContexto);
