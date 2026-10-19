import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";

const SECOES: { titulo: string; texto: string[] }[] = [
  {
    titulo: "Quem somos",
    texto: [
      "O RoVibes é uma plataforma para descobrir lugares, eventos e pessoas pela vibe de cada experiência, com os aplicativos RoVibes (público), RoVibes Business (estabelecimentos) e RoVibes Job (equipes).",
    ],
  },
  {
    titulo: "Dados que coletamos",
    texto: [
      "Conta: nome, @usuário, e-mail, foto e bio que você informa.",
      "Uso: lugares que você segue, salva, visita e onde faz check-in; publicações, stories, curtidas, mensagens, listas de presença e avaliações.",
      "Localização: só quando você permite, para mostrar o que está perto e confirmar check-ins. Compartilhar sua localização em um rolê é opcional e pode ser parado a qualquer momento.",
      "Pagamentos: feitos pelo Mercado Pago. O RoVibes não guarda número de cartão.",
    ],
  },
  {
    titulo: "Para que usamos",
    texto: [
      "Mostrar o feed, as sugestões de lugares e pessoas e o que está em alta perto de você.",
      "Permitir pedidos, comandas, ingressos, listas de presença e o chat ao vivo dos lugares.",
      "Segurança: prevenir abusos, analisar denúncias e cumprir obrigações legais.",
    ],
  },
  {
    titulo: "Quem vê o quê",
    texto: [
      "Perfil público: suas publicações aparecem para todos; stories, só para quem segue você.",
      "Perfil privado: publicações e stories só para seguidores que você aprovou.",
      "Chat ao vivo: visível para quem fez check-in no lugar naquela noite e, depois de fechado, só para a equipe do estabelecimento por até 90 dias.",
      "Estabelecimentos veem os dados necessários para atender você (pedidos, comandas, check-ins e listas de presença).",
    ],
  },
  {
    titulo: "Seus direitos (LGPD)",
    texto: [
      "Você pode acessar, corrigir e apagar seus dados, deixar seu perfil privado, bloquear pessoas e pedir a exclusão da conta.",
      "Para qualquer pedido sobre seus dados, fale com a equipe RoVibes pelo e-mail de contato do aplicativo.",
    ],
  },
  {
    titulo: "Guarda e segurança",
    texto: [
      "Os dados ficam em servidores com acesso protegido. Stories somem em 24 horas; o histórico do chat ao vivo é apagado depois de 90 dias.",
      "Esta política pode ser atualizada; avisaremos no aplicativo quando houver mudança importante.",
    ],
  },
];

/** Política de privacidade (Configurações → Política de privacidade). */
export function Privacidade() {
  const navegar = useNavigate();
  return (
    <article className="px-4 py-4">
      <div className="flex items-center gap-2">
        <button onClick={() => (window.history.length > 1 ? navegar(-1) : navegar("/perfil"))} className="-ml-2 rounded-full p-2 hover:bg-elevado" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <h1 className="text-[22px] font-semibold">Política de privacidade</h1>
      </div>
      <p className="mt-1 text-[13px] text-suave">Versão de outubro de 2026</p>
      <div className="mt-4 space-y-5">
        {SECOES.map((s) => (
          <section key={s.titulo}>
            <h2 className="font-semibold">{s.titulo}</h2>
            <ul className="mt-1.5 list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-suave">
              {s.texto.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </article>
  );
}
