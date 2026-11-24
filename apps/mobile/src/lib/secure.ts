/** Almacenamiento seguro del celular sobre SecureStore (Keystore o Keychain). */
import * as SecureStore from "expo-secure-store";

/** Lee un valor guardado; null si no existe. */
export const secureGet = (k: string) => SecureStore.getItemAsync(k);
/** Guarda un valor bajo la clave `k`. */
export const secureSet = (k: string, v: string) => SecureStore.setItemAsync(k, v);
/** Borra el valor de la clave `k`. */
export const secureDel = (k: string) => SecureStore.deleteItemAsync(k);
