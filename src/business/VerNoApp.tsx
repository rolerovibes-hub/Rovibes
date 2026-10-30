import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { abrirNoNavegador, noApp } from "@/desktop/nativo";
import { URL_PUBLICA } from "@/lib/promoters";

/** "Ver no App": no navegador abre a página do App; no app de computador abre no navegador padrão. */
export function VerNoApp({ caminho }: { caminho: string | null }) {
  const conteudo = (
    <>
      <ExternalLink className="h-4 w-4" />
      Ver no App
    </>
  );
  if (!caminho)
    return (
      <button className="botao" disabled>
        {conteudo}
      </button>
    );
  if (noApp())
    return (
      <button type="button" className="botao" onClick={() => abrirNoNavegador(URL_PUBLICA + caminho)}>
        {conteudo}
      </button>
    );
  return (
    <Link to={caminho} className="botao">
      {conteudo}
    </Link>
  );
}
