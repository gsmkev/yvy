/**
 * Envío de emails transaccionales por Resend, con salida a consola en desarrollo.
 * Todos los correos salen multiparte (HTML y texto); las plantillas están en `./templates`.
 */
import type { Bindings } from "../../types";
import type { EmailMessage } from "./templates";

export * from "./samples";
export * from "./templates";

/** Adjunto de un email: nombre y URL que Resend descarga. */
export interface EmailAttachment {
  filename: string;
  /** URL que Resend descarga al enviar (por ejemplo una URL firmada de R2): el Worker no carga el archivo. */
  path: string;
}

/** Resend acepta hasta 100 correos por lote. */
const BATCH_MAX = 100;

const payload = (env: Bindings, to: string, m: EmailMessage) => ({
  from: env.EMAIL_FROM,
  to,
  subject: m.subject,
  html: m.html,
  text: m.text,
  ...(m.headers ? { headers: m.headers } : {}),
});

/**
 * Dominios reservados que nunca reciben correo (RFC 2606 y 6761), como los usuarios de la demo (`.invalid`).
 * `.test` queda afuera: el seed local lo usa y en desarrollo el código se imprime en la consola.
 */
const RESERVED = /(\.(invalid|example|localhost)|@example\.(com|net|org))$/i;

/** Si la dirección puede recibir correo; las de dominios reservados se descartan para no generar rebotes. */
export const isDeliverable = (to: string | null | undefined): to is string => !!to && !RESERVED.test(to.trim());

/** Sin clave de Resend (desarrollo) el correo se imprime; en producción nunca va a la consola porque puede llevar un código de ingreso. */
const devPrint = (env: Bindings, to: string, m: EmailMessage, files = ""): boolean => {
  if (env.RESEND_API_KEY) return false;
  if ((env.APP_ENV as string) !== "production") console.log(`[email:dev] para=${to} asunto="${m.subject}"\n${m.text}${files}`);
  return true;
};

/** Envío por Resend (3.000/mes, 100/día gratis). */
export async function sendEmail(env: Bindings, to: string, message: EmailMessage, attachments: EmailAttachment[] = []): Promise<void> {
  const files = attachments.length ? `\n[adjuntos: ${attachments.map((a) => a.filename).join(", ")}]` : "";
  if (devPrint(env, to, message, files)) return;
  if (!isDeliverable(to)) return;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ ...payload(env, to, message), ...(attachments.length ? { attachments } : {}) }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}

/** Envío en lote (un subrequest cada 100 correos). Lanza si Resend rechaza alguna tanda. Los lotes no admiten adjuntos. */
export async function sendEmailBatch(
  env: Bindings,
  items: { to: string; message: EmailMessage }[],
  fetchFn: typeof fetch = fetch,
): Promise<void> {
  items = items.filter((it) => isDeliverable(it.to));
  if (!items.length) return;
  if (!env.RESEND_API_KEY) {
    for (const it of items) devPrint(env, it.to, it.message);
    return;
  }
  for (let i = 0; i < items.length; i += BATCH_MAX) {
    const res = await fetchFn("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify(items.slice(i, i + BATCH_MAX).map((it) => payload(env, it.to, it.message))),
    });
    if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
  }
}
