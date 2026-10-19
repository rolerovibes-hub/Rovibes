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
import { MarcarRole } from "./app/MarcarRole";
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
import { ListaConexoes, PessoaPagina } from "./app/PessoaPagina";
import { AoVivoPagina } from "./app/AoVivoPagina";
import { AreaPromoter } from "./app/AreaPromoter";
import { ListaPagina } from "./app/ListaPagina";
import { Privacidade } from "./app/Privacidade";
import { ConversaPagina } from "./app/ConversaPagina";
import { LinksDoApp } from "./components/LinksDoApp";
import { BotaoVoltarAparelho } from "./components/BotaoVoltarAparelho";

export default function App() {
  return (
    <>
    <BotaoVoltarAparelho />
    <LinksDoApp />
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
        <Route path="chat/:id" element={<ConversaPagina />} />
        <Route path="ao-vivo/:estab" element={<AoVivoPagina />} />
        <Route path="promoter" element={<AreaPromoter />} />
        <Route path="lista/:id" element={<ListaPagina />} />
        <Route path="privacidade" element={<Privacidade />} />
        <Route path="perfil" element={<Perfil />} />
        <Route path="lugar/:id" element={<LugarPagina />} />
        <Route path="lugar/:id/cardapio" element={<CardapioPagina />} />
        <Route path="lugar/:id/role" element={<MarcarRole />} />
        <Route path="evento/:id" element={<EventoPagina />} />
        <Route path="carteira" element={<Carteira />} />
        <Route path="mesa/:codigo" element={<MesaPagina />} />
        <Route path="comanda/:id" element={<ComandaPagina />} />
        <Route path="p/:usuario" element={<PessoaPagina />} />
        <Route path="p/:usuario/:tipo" element={<ListaConexoes />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
    </>
  );
}
