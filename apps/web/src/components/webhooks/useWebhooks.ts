/** Datos y acciones de los webhooks: lista, alta (con su secreto), pausa, baja y prueba. */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { WEBHOOK_EVENTS, type WebhookEvent } from "@yvy/shared";
import { del, get, patch, post } from "../../lib/api";

/** Webhook con el resultado de su último envío. */
export interface Hook {
  id: string;
  url: string;
  events: WebhookEvent[];
  enabled: boolean;
  lastStatus: "ok" | "error" | null;
  lastHttpStatus: number | null;
  lastError: string | null;
  lastAttemptAt: number | null;
  consecutiveFailures: number;
}

/** Webhooks de la organización y todo lo que se puede hacer con ellos. */
export function useWebhooks() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ["webhooks"], queryFn: () => get<Hook[]>("/org/webhooks") });
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<WebhookEvent[]>([...WEBHOOK_EVENTS]);
  const [secret, setSecret] = useState<string | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ["webhooks"] });
  const add = useMutation({
    mutationFn: () => post<{ secret: string }>("/org/webhooks", { url: url.trim(), events }),
    onSuccess: (r) => {
      setSecret(r.secret);
      setUrl("");
      void refresh();
    },
  });
  const toggle = useMutation({ mutationFn: (h: Hook) => patch(`/org/webhooks/${h.id}`, { enabled: !h.enabled }), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => del(`/org/webhooks/${id}`), onSuccess: refresh });
  const test = useMutation({
    mutationFn: (id: string) => post(`/org/webhooks/${id}/test`),
    // la entrega pasa por la cola: el estado aparece al recargar la lista unos segundos después
    onSuccess: () => setTimeout(() => void refresh(), 4000),
  });
  return { list, url, setUrl, events, setEvents, secret, setSecret, add, toggle, remove, test };
}

/** Todo lo que devuelve useWebhooks. */
export type WebhooksState = ReturnType<typeof useWebhooks>;
