/** Tema de la web: "auto" sigue al sistema; "light" y "dark" lo fijan. Se guarda en localStorage. */
type Theme = "auto" | "light" | "dark";
const KEY = "yvy.theme";
const listeners = new Set<() => void>();

/** Tema guardado; "auto" si no hay ninguno o no hay storage. */
export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

function applyTheme(theme: Theme = getTheme()) {
  const el = document.documentElement;
  if (theme === "auto") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

/** Guarda el tema elegido y avisa a los suscriptores. */
export function setTheme(theme: Theme) {
  try {
    if (theme === "auto") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, theme);
  } catch {
    /* modo privado o storage bloqueado */
  }
  applyTheme(theme);
  listeners.forEach((l) => l());
}

/**
 * Suscripción para `useSyncExternalStore`.
 * @returns la función que cancela.
 */
export const subscribeTheme = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
