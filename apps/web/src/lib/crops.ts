/** Nombre de un cultivo para mostrar en pantalla. */
import { CROPS } from "@yvy/shared";
import { tk } from "./i18n";

/** Nombre traducido del cultivo ("Soja", "Maíz"); si no es uno de la lista, el texto tal cual. */
export const cropName = (crop: string): string => ((CROPS as readonly string[]).includes(crop) ? tk(`ui.crop.name_${crop}`) : crop);
