/**
 * Landing pública ("/" sin sesión). Se carga por código diferido desde RootGate: framer-motion, lenis y las
 * tipografías de la landing no se bajan en la app con sesión.
 */
import { useEffect } from "react";
import "./fonts.css";
import "./landing.css";
import { L } from "./content";
import { Hero, Cursor } from "./Hero";
import { SinSenal } from "./SinSenal";
import { ComoFunciona } from "./ComoFunciona";
import { Satelite } from "./Satelite";
import { Imprevistos } from "./Imprevistos";
import { Estancias } from "./Estancias";
import { Reportes } from "./Reportes";
import { ParaQuien, Datos, Tarifas } from "./Cierre";
import { CTA } from "./Probar";
import { Footer } from "./Footer";
import { Grain, SignalIndicator } from "./primitives";

/** Desplazamiento suave (Lenis), solo si la persona no pidió menos movimiento. */
function useLenis() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    let stopped = false;
    let lenis: { raf: (t: number) => void; destroy: () => void } | null = null;
    import("lenis").then(({ default: Lenis }) => {
      if (stopped) return;
      lenis = new Lenis({ lerp: 0.1, anchors: true });
      const loop = (t: number) => {
        lenis?.raf(t);
        raf = requestAnimationFrame(loop);
      };
      raf = requestAnimationFrame(loop);
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
      lenis?.destroy();
    };
  }, []);
}

/** Título de la pestaña y fondo del documento mientras la landing está en pantalla. */
function useDocument() {
  useEffect(() => {
    const prev = document.title;
    document.title = L("meta.title");
    document.body.classList.add("has-landing");
    return () => {
      document.title = prev;
      document.body.classList.remove("has-landing");
    };
  }, []);
}

export function LandingPage() {
  useLenis();
  useDocument();
  return (
    <div className="yvy-landing">
      <a
        href="#contenido"
        className="mono-yvy fixed left-4 top-4 z-[90] -translate-y-24 bg-lino px-3 py-2 text-surco focus:translate-y-0"
      >
        {L("skip")}
      </a>
      <SignalIndicator />
      <Cursor />
      <Grain />
      <main id="contenido" className="bg-surco">
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
      </main>
      <Footer />
    </div>
  );
}
