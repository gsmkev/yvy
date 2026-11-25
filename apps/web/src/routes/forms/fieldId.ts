/** Ids y limpieza de los campos propios de los formularios. */
import { FIELD_ID, type FormField } from "@yvy/shared";

/** Id a partir de la etiqueta ("Altura de plantas" -> altura_de_plantas), único entre los campos del tipo. */
export function fieldIdFrom(label: string, taken: string[]): string {
  const base =
    label
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^(\d)/, "c_$1")
      .slice(0, 28) || "campo";
  let id = base;
  for (let n = 2; taken.includes(id); n++) id = `${base}_${n}`;
  return FIELD_ID.test(id) ? id : "campo";
}

/** Un campo nuevo, sin etiqueta, con un id que no choca con los `taken`. */
export const blankField = (taken: string[]): FormField => ({ id: fieldIdFrom("campo", taken), label: "", type: "text" });

/** El campo sin las opciones (si no es de elección) ni la unidad vacía, y sin claves con `undefined`. */
export const compactField = (f: FormField): FormField => {
  const kept = { ...f, options: f.type === "choice" ? f.options : undefined, unit: f.unit ? f.unit : undefined };
  return Object.fromEntries(Object.entries(kept).filter(([, v]) => v !== undefined)) as FormField;
};
