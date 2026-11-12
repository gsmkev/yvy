/** I-02: webhooks de la organización. Los eventos que se pueden pedir y la forma de lo que se envía. */
export const WEBHOOK_EVENTS = ["alert.created", "record.created"] as const;
export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Lo que recibe la URL del cliente (cuerpo JSON). */
export interface WebhookPayload {
  id: string;
  event: WebhookEvent | "ping";
  createdAt: number;
  organizationId: string;
  data: Record<string, unknown>;
}
