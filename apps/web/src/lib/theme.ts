/** Tema de la web (U-20): "auto" sigue al sistema; "light" y "dark" lo fijan. Se guarda en localStorage. */
export type Theme = "auto" | "light" | "dark";
const KEY = "yvy.theme";
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "auto";
  } catch {
    return "auto";
  }
}

export function applyTheme(theme: Theme = getTheme()) {
  const el = document.documentElement;
  if (theme === "auto") delete el.dataset.theme;
  else el.dataset.theme = theme;
}

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

export const subscribeTheme = (cb: () => void) => {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
};
