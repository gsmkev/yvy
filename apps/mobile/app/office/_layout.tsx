/** Pila de pantallas de la oficina. */
import { Stack } from "expo-router";
import { stackScreenOptions } from "../../src/ui/stackOptions";

/** Grupo de pantallas de oficina: mismo encabezado (volver, título vacío) que el resto. Cada app/office/x.tsx se registra sola. */
export default function OfficeLayout() {
  return <Stack screenOptions={(p) => ({ ...stackScreenOptions(p), title: "" })} />;
}
