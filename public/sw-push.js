// Service worker do RoVibes: só cuida das notificações (push) no navegador e no iPhone (Tela de Início).
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (evento) => {
  let d = {};
  try {
    d = evento.data ? evento.data.json() : {};
  } catch {
    d = { titulo: "RoVibes", texto: evento.data ? evento.data.text() : "" };
  }
  const titulo = d.titulo || "RoVibes";
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      // App aberto e na frente: avisa a tela em vez de mostrar a notificação do sistema.
      const aberta = janelas.find((j) => j.visibilityState === "visible");
      if (aberta) {
        aberta.postMessage({ tipo: "rovibes:notificacao", titulo, texto: d.texto || "", link: d.link || "/" });
        return;
      }
      return self.registration.showNotification(titulo, {
        body: d.texto || "",
        icon: "/marca/rovibes-icone-192.png",
        badge: "/marca/rovibes-icone-192.png",
        tag: d.tag || undefined,
        renotify: !!d.tag,
        data: { link: d.link || "/" },
      });
    }),
  );
});

self.addEventListener("notificationclick", (evento) => {
  evento.notification.close();
  const link = (evento.notification.data && evento.notification.data.link) || "/";
  const alvo = new URL(link, self.location.origin).href;
  evento.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((janelas) => {
      for (const j of janelas) {
        if (j.url.startsWith(self.location.origin) && "focus" in j) {
          j.postMessage({ tipo: "rovibes:abrir", link });
          return j.focus();
        }
      }
      return self.clients.openWindow(alvo);
    }),
  );
});
