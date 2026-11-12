/**
 * Configuración pública de la web.
 * TODO: reemplazar por el número real de WhatsApp de Yvy (formato internacional, solo dígitos).
 * Se puede fijar al compilar con VITE_WHATSAPP_NUMBER.
 */
export const WHATSAPP_NUMBER: string = import.meta.env.VITE_WHATSAPP_NUMBER ?? "595000000000"; // TODO número real

export const whatsappUrl = (text: string) => `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
