import { Newspaper } from "lucide-react";
import { EmBreve } from "./AppLayout";

export function Feed() {
  return (
    <EmBreve
      icone={Newspaper}
      titulo="Feed"
      texto="Publicações e stories dos lugares que você segue aparecem aqui. Entra na fase 3."
    />
  );
}
