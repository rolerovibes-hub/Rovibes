import { Navigate, Route, Routes } from "react-router-dom";
import { BusinessLayout } from "./business/BusinessLayout";
import { AreaDeTrabalho } from "./business/AreaDeTrabalho";
import { TelaAplicativo } from "./business/TelaAplicativo";
import { TelaArea } from "./business/TelaArea";
import { GestaoLayout, InicioGestao } from "./gestao/GestaoLayout";
import { AREAS_GESTAO } from "./lib/areasNegocio";
import { AppLayout } from "./app/AppLayout";
import { Descobrir } from "./app/Descobrir";
import { Mapa } from "./app/Mapa";
import { Feed } from "./app/Feed";
import { Chats } from "./app/Chats";
import { Perfil } from "./app/Perfil";
import { Entrar } from "./Entrar";
import { MarcarRole } from "./app/MarcarRole";
import { PrimeiraVibe } from "./app/PrimeiraVibe";
import { CriarEventoPessoa } from "./app/CriarEventoPessoa";
import { MeusEventosPessoa } from "./app/MeusEventosPessoa";
import { EventoPessoaPagina } from "./app/EventoPessoaPagina";
import { LugarPagina } from "./app/LugarPagina";
import { EventoPagina } from "./app/EventoPagina";
import { PublicacaoPagina } from "./app/PublicacaoPagina";
import { VibeCut } from "./app/VibeCut";
import { CardapioPagina } from "./app/CardapioPagina";
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
import { GuardaSessao } from "./components/GuardaSessao";
import { PuxarParaAtualizar } from "./components/PuxarParaAtualizar";

export default function App() {
  return (
    <>
    <GuardaSessao />
    <BotaoVoltarAparelho />
    <PuxarParaAtualizar />
    <LinksDoApp />
    <Routes>
      <Route path="/business" element={<BusinessLayout />}>
        <Route index element={<AreaDeTrabalho />} />
        <Route path="app/:codigo" element={<TelaAplicativo />} />
        <Route path="area/:area" element={<TelaArea />} />
        <Route path="area/:area/:codigo" element={<TelaArea />} />
        <Route path="novo" element={<Navigate to="/business" replace />} />
      </Route>
      <Route path="/entrar" element={<Entrar />} />
      <Route path="/gestao" element={<GestaoLayout />}>
        <Route index element={<InicioGestao />} />
        <Route path="area/:area" element={<TelaArea areas={AREAS_GESTAO} base="/gestao" />} />
        <Route path="area/:area/:codigo" element={<TelaArea areas={AREAS_GESTAO} base="/gestao" />} />
      </Route>
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
        <Route path="primeira-vibe" element={<PrimeiraVibe />} />
        <Route path="eventos/novo" element={<CriarEventoPessoa />} />
        <Route path="eventos/meus" element={<MeusEventosPessoa />} />
        <Route path="eventos/:id/editar" element={<CriarEventoPessoa />} />
        <Route path="evento-pessoa/:id" element={<EventoPessoaPagina />} />
        <Route path="evento/:id" element={<EventoPagina />} />
        <Route path="publicacao/:tipo/:id" element={<PublicacaoPagina />} />
        <Route path="vibecut" element={<VibeCut />} />
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
