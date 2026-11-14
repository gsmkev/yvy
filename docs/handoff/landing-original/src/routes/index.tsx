import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Hero, Cursor } from "@/components/yvy/Hero";
import { SinSenal } from "@/components/yvy/SinSenal";
import { ComoFunciona } from "@/components/yvy/ComoFunciona";
import { Satelite } from "@/components/yvy/Satelite";
import { Imprevistos } from "@/components/yvy/Imprevistos";
import { Estancias } from "@/components/yvy/Estancias";
import { Reportes } from "@/components/yvy/Reportes";
import { ParaQuien, Datos, Tarifas, CTA, Footer } from "@/components/yvy/Cierre";
import { Grain, SignalIndicator } from "@/components/yvy/primitives";

const TITLE = "Yvy · Gestión de cultivos y estancias que funciona sin señal";
const DESC =
  "Dibujá tus parcelas sobre el satélite, asigná a tus empleados y recibí sus registros aunque no haya internet. Vigor, lluvia y avisos de helada, sequía y fuego por lote.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: TITLE },
      { name: "description", content: DESC },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESC },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function useLenis() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    import("lenis").then(({ default: Lenis }) => {
      lenis = new Lenis({ lerp: 0.1, anchors: true } as any);
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);
}

function Index() {
  useLenis();
  return (
    <main className="bg-surco">
      <SignalIndicator />
      <Cursor />
      <Grain />
      <Hero />
      <SinSenal />
      <ComoFunciona />
      <Satelite />
      <Imprevistos />
      <Estancias />
      <Reportes />
      <ParaQuien />
      <Datos />
      <Tarifas />
      <CTA />
      <Footer />
    </main>
  );
}
