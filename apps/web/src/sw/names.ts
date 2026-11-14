/** Nombres compartidos entre el service worker y la página (ADR 0005). */

/** Cáscara de la app: una caché por versión de la build (`yvy-shell-<hash>`). */
export const SHELL_PREFIX = "yvy-shell-";
/** Copias de respaldo de GET /org/* y /me. Se borra al cerrar sesión o cambiar de organización. */
export const DATA_CACHE = "yvy-data-v1";
/** Rangos sueltos de PMTiles vistos con conexión. */
export const TILE_RANGES_CACHE = "yvy-tiles-ranges-v1";
/** PMTiles enteros guardados con "Guardar esta estancia". */
export const TILE_FILES_CACHE = "yvy-tiles-files-v1";
/** CSS y fuentes de Google (otro origen): se sirven de acá si no hay red. */
export const FONTS_CACHE = "yvy-fonts-v1";
/** Cachés que se borran al cerrar sesión o cambiar de organización (la cáscara y las fuentes no tienen datos). */
export const PRIVATE_CACHES = [DATA_CACHE, TILE_RANGES_CACHE, TILE_FILES_CACHE] as const;

/** Mensajes página → service worker. */
export const MSG_SKIP_WAITING = "skip-waiting";
export const MSG_CLEAR_DATA = "clear-data";

/** Cabecera con la que el service worker marca cuándo guardó una copia (epoch ms). */
export const SAVED_AT_HEADER = "x-yvy-saved-at";
/** Cabecera que el service worker agrega a una respuesta servida de la copia porque no hubo red. */
export const FROM_CACHE_HEADER = "x-yvy-from-cache";
