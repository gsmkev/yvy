/** Formatos de número de la pestaña Hacienda. */

/** Decimales con coma, hasta dos. */
export const dec = new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 });

/** Enteros con separador de miles. */
export const int = new Intl.NumberFormat("es-PY", { maximumFractionDigits: 0 });
