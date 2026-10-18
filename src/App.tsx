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
import { JobLayout } from "./job/JobLayout";
import { ComandaPagina } from "./app/ComandaPagina";
import { Notificacoes } from "./app/Notificacoes";
import { Retirada } from "./app/Retirada";

export default function App() {
  return (
    <Routes>
      <Route path="/business" element={<BusinessLayout />}>
        <Route index element={<AreaDeTrabalho />} />
        <Route path="app/:codigo" element={<TelaAplicativo />} />
        <Route path="novo" element={<CadastroEstabelecimento />} />
      </Route>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/job" element={<JobLayout />} />
      <Route path="/job/:modulo" element={<JobLayout />} />
      <Route path="/" element={<AppLayout />}>
        <Route index element={<Feed />} />
        <Route path="pesquisar" element={<Descobrir />} />
        <Route path="mapa" element={<Mapa />} />
        <Route path="feed" element={<Navigate to="/" replace />} />
        <Route path="notificacoes" element={<Notificacoes />} />
        <Route path="retirada" element={<Retirada />} />
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
