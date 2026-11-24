import { useEffect, useState, useSyncExternalStore, type RefObject } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { onSession } from "../../lib/api";

/** Bajo lg la navegación es una barra inferior; desde lg, la barra lateral. */
export function useIsDesktop() {
  return useSyncExternalStore(
    (cb) => {
      const m = window.matchMedia?.("(min-width: 1024px)");
      m?.addEventListener("change", cb);
      return () => m?.removeEventListener("change", cb);
    },
    () => window.matchMedia?.("(min-width: 1024px)").matches ?? true,
    () => true,
  );
}

/** Bandera booleana recordada en este navegador (si el almacenamiento falla, vale hasta recargar). */
export function useStoredFlag(key: string): [boolean, (v: boolean) => void] {
  const read = () => {
    try {
      return localStorage.getItem(key) === "1";
    } catch {
      return false;
    }
  };
  const [v, setV] = useState(read);
  return [
    v,
    (n) => {
      setV(n);
      try {
        localStorage.setItem(key, n ? "1" : "0");
      } catch {
        /* sin almacenamiento */
      }
    },
  ];
}

/** Al cerrarse la sesión se vacía la caché y se vuelve a la pantalla de ingreso. */
export function useSignedOutRedirect() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  useEffect(() => {
    const off = onSession((s) => {
      if (!s) {
        qc.clear();
        navigate({ to: "/ingresar" });
      }
    });
    return () => {
      off();
    };
  }, []);
}

/** "/" o Ctrl/Cmd+K enfocan el buscador (salvo que ya se esté escribiendo en otro campo). */
export function useSearchShortcut(searchRef: RefObject<HTMLInputElement | null>) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
      const k = e.key.toLowerCase();
      if ((k === "k" && (e.ctrlKey || e.metaKey)) || (k === "/" && !typing && !e.ctrlKey && !e.metaKey && !e.altKey)) {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}
