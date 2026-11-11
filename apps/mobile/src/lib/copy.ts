import { Platform, Share } from "react-native";

/**
 * Copia un texto. En la web usa el portapapeles; en el celular abre la hoja de compartir del sistema
 * (que trae "Copiar"), porque la app no incluye un módulo de portapapeles. Devuelve true si se copió.
 */
export async function copyText(text: string): Promise<boolean> {
  if (Platform.OS === "web") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      return false;
    }
  }
  try {
    await Share.share({ message: text });
  } catch {
    // El usuario cerró la hoja o el sistema no pudo abrirla.
  }
  return false;
}
