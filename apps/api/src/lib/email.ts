import type { Bindings } from "../types";

/** Envío por Resend (3.000/mes, 100/día gratis). Sin API key, imprime en la consola (desarrollo). */
export async function sendEmail(env: Bindings, to: string, subject: string, text: string): Promise<void> {
  if (!env.RESEND_API_KEY) {
    // El texto lleva el código de ingreso: en producción nunca va a la consola.
    if ((env.APP_ENV as string) === "production") return;
    console.log(`[email:dev] para=${to} asunto="${subject}"\n${text}`);
    return;
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${env.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, text }),
  });
  if (!res.ok) throw new Error(`Resend ${res.status}: ${await res.text()}`);
}
