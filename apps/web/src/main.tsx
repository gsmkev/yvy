import "./lib/locale"; // primero: fija el idioma antes de que otros módulos armen textos
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { NetworkError } from "./lib/api";
import { PwaUpdate } from "./components/PwaUpdate";
import { toast } from "./components/ui";
import { t } from "./lib/i18n";
import { initMonitoring } from "./lib/monitoring";
import { initOffline } from "./lib/offline/session";
import { registerServiceWorker } from "./lib/pwa";
import { router } from "./router";
import "./styles.css";

initMonitoring();
registerServiceWorker();

// Sin conexión se reintenta sin tope (con espera creciente); los demás errores, una vez.
// Las lecturas hacen el primer intento aunque el navegador diga que no hay red (`offlineFirst`): así pasan por el
// service worker, que responde con su copia. Las escrituras corren siempre y fallan en el acto (sin quedar
// "pendientes" para siempre): lo que se puede anotar sin conexión va al outbox, lo demás avisa que necesita conexión.
const queryClient = new QueryClient({
  mutationCache: new MutationCache({
    onError: (err) => {
      if (err instanceof NetworkError) toast(t("offline.needsConnectionBody"), { ms: 5000 });
    },
  }),
  defaultOptions: {
    queries: {
      networkMode: "offlineFirst",
      retry: (n, err) => err instanceof NetworkError || n < 1,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 15_000),
      refetchOnWindowFocus: false,
    },
    mutations: { networkMode: "always" },
  },
});

// La copia de lecturas se restaura antes de dibujar, para que lo visitado aparezca sin esperar a la red.
void initOffline(queryClient).finally(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
        <PwaUpdate />
      </QueryClientProvider>
    </StrictMode>,
  );
});
