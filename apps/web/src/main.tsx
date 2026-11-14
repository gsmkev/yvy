import "./lib/locale"; // primero: fija el idioma antes de que otros módulos armen textos
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { NetworkError } from "./lib/api";
import { PwaUpdate } from "./components/PwaUpdate";
import { initMonitoring } from "./lib/monitoring";
import { registerServiceWorker } from "./lib/pwa";
import { router } from "./router";
import "./styles.css";

initMonitoring();
registerServiceWorker();

// Sin conexión se reintenta sin tope (con espera creciente); los demás errores, una vez
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: (n, err) => err instanceof NetworkError || n < 1,
      retryDelay: (n) => Math.min(1000 * 2 ** n, 15_000),
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <PwaUpdate />
    </QueryClientProvider>
  </StrictMode>,
);
