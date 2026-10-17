import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, MapPinned, Store, Wallet } from "lucide-react";
import { Avatar } from "@/components/Avatar";
import { SeletorTema } from "@/components/SeletorTema";

const ITENS = [
  { nome: "Salvos", icone: Bookmark, fase: 3 },
  { nome: "Meus check-ins", icone: MapPinned, fase: 3 },
  { nome: "Carteira", icone: Wallet, fase: 4 },
];

export function Perfil() {
  return (
    <div className="space-y-6 px-4 py-6">
      <div className="flex items-center gap-4">
        <Avatar nome="Visitante" tamanho="lg" />
        <div>
          <h1 className="text-lg font-semibold">Visitante</h1>
          <p className="text-sm text-suave">Entrar e criar conta chega na próxima etapa</p>
        </div>
      </div>

      <ul className="cartao divide-y divide-borda">
        {ITENS.map(({ nome, icone: Icone, fase }) => (
          <li key={nome} className="flex items-center gap-3 px-4 py-3.5">
            <Icone className="h-5 w-5 text-destaque" />
            <span className="flex-1">{nome}</span>
            <span className="text-xs text-suave">fase {fase}</span>
          </li>
        ))}
      </ul>

      <section className="space-y-2">
        <h2 className="rotulo">Tema</h2>
        <SeletorTema />
      </section>

      <Link to="/business" className="cartao flex items-center gap-3 px-4 py-3.5 hover:bg-elevado">
        <Store className="h-5 w-5 text-destaque" />
        <span className="flex-1">
          <span className="block font-medium">Tem um estabelecimento?</span>
          <span className="block text-[13px] text-suave">Abrir o RoVibes Business</span>
        </span>
        <ChevronRight className="h-4 w-4 text-suave" />
      </Link>
    </div>
  );
}
