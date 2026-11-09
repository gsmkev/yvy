// Vista previa web: localStorage (en el celular se usa SecureStore).
export const secureGet = async (k: string) => localStorage.getItem(k);
export const secureSet = async (k: string, v: string) => localStorage.setItem(k, v);
export const secureDel = async (k: string) => localStorage.removeItem(k);
