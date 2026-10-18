import { Navigate, Route, Routes } from "react-router-dom";
import { BusinessLayout } from "./business/BusinessLayout";
import { AreaDeTrabalho } from "./business/AreaDeTrabalho";
import { TelaAplicativo } from "./business/TelaAplicativo";
import { AppLayout } from "./app/AppLayout";
import { Descobrir } from "./app/Descobrir";
import { Mapa } from "./app/Mapa";
import { Feed } from "./app/Feed";
import { Chats } from "./app/Chats";
import { Perfil } from "./app/Perfil";
import { Entrar } from "./Entrar";
import { LugarPagina } from "./app/LugarPagina";
import { EventoPagina } from "./app/EventoPagina";
import { CardapioPagina } from "./app/CardapioPagina";
import { CadastroEstabelecimento } from "./business/CadastroEstabelecimento";
import { Carteira } from "./app/Carteira";
import { MesaPagina } from "./app/MesaPagina";
import { ComandaPagina } from "./app/ComandaPagina";

export default function App() {
  return (
    <Routes>
      <Route path="/business" element={<BusinessLayout />}>
        <Route index element={<AreaDeTrabalho />} />
        <Route path="app/:codigo" element={<TelaAplicativo />} />
        <Route path="novo" element={<CadastroEstabelecimento />} />
      </Route>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Descobrir />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="feed" element={<Feed />} />
        <Route path="chats" element={<Chats />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="lugar/:id" element={<LugarPagina />} />
        <Route path="lugar/:id/cardapio" element={<CardapioPagina />} />
        <Route path="evento/:id" element={<EventoPagina />} />
        <Route path="carteira" element={<Carteira />} />
        <Route path="mesa/:codigo" element={<MesaPagina />} />
        <Route path="comanda/:id" element={<ComandaPagina />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
