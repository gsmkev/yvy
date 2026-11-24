/**
 * Configuración pública de la web.
 * Falta el número real de WhatsApp de Yvy (formato internacional, solo dígitos): mientras no se defina
 * VITE_WHATSAPP_NUMBER al compilar, se usa el provisorio de abajo, que no corresponde a una línea de soporte.
 */
const WHATSAPP_NUMBER: string = import.meta.env.VITE_WHATSAPP_NUMBER ?? "595000000000"; // provisorio, ver arriba

/** Enlace de WhatsApp con el texto ya codificado. */
export const whatsappUrl = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
