import { MessageCircle } from "lucide-react";
import { EmBreve } from "./AppLayout";

export function Chats() {
  return (
    <EmBreve
      icone={MessageCircle}
      titulo="Chats"
      texto="Conversas com amigos e com os estabelecimentos. Entra na fase 6."
    />
  );
}
