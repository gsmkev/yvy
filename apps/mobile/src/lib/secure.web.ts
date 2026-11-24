// Vista previa web: localStorage (en el celular se usa SecureStore).
/** Lee un valor guardado; null si no existe. */
export const secureGet = async (k: string) => localStorage.getItem(k);
/** Guarda un valor bajo la clave `k`. */
export const secureSet = async (k: string, v: string) => localStorage.setItem(k, v);
/** Borra el valor de la clave `k`. */
export const secureDel = async (k: string) => localStorage.removeItem(k);
