import type { Bindings } from "../types";

export interface EmailAttachment {
  filename: string;
  /** URL que Resend descarga al enviar (por ejemplo una URL firmada de R2): el Worker no carga el archivo. */
  path: string;
}

/** Envío por Resend (3.000/mes, 100/día gratis). Sin API key, imprime en la consola (desarrollo). */
export async function sendEmail(
  env: Bindings,
  to: string,
  subject: string,
  text: string,
  attachments: EmailAttachment[] = [],
): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // El texto lleva el código de ingreso: en producción nunca va a la consola.
    if ((env.APP_ENV as string) === "production") return;
    const files = attachments.length ? `\n[adjuntos: ${attachments.map((a) => a.filename).join(", ")}]` : "";
    console.log(`[email:dev] para=${to} asunto="${subject}"\n${text}${files}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to,
      subject,
      text,
      ...(attachments.length ? { attachments } : {}),
    }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
