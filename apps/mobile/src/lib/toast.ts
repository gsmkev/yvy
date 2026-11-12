/** Línea de confirmación breve al pie (U-09): un solo mensaje a la vez, desaparece a los 3 s. */
import { useSyncExternalStore } from "react";
import { t } from "@yvy/shared";
import { getDb } from "./db";
import { syncNow } from "./sync";

export const TOAST_MS = 3000;

let current: { id: number; text: string } | null = null;
let seq = 0;
let timer: ReturnType<typeof setTimeout> | null = null;
const subs = new Set<() => void>();

export function showToast(text: string, ms = TOAST_MS): void {
  if (timer) clearTimeout(timer);
  const id = ++seq;
  current = { id, text };
  subs.forEach((f) => f());
  timer = setTimeout(() => {
    if (current?.id === id) {
      current = null;
      subs.forEach((f) => f());
    }
  }, ms);
}

export const useToast = () =>
  useSyncExternalStore(
    (f) => (subs.add(f), () => subs.delete(f)),
    () => current,
  );

/**
 * Después de guardar: avisa al instante que se guardó y que se manda con señal; si el envío termina
 * mientras el aviso sigue a la vista y no queda nada pendiente, lo cambia por "enviado".
 */
export function toastSaved(): void {
  const pendingText = t("app.toastSavedPending");
  showToast(pendingText);
  void syncNow().then(() => {
    if (current?.text === pendingText && getDb().pendingCount() === 0) showToast(t("app.toastSavedSent"));
  });
}
