import { Stack } from "expo-router";
import { STACK_SCREEN_OPTIONS } from "../../src/ui/stackOptions";

/** Grupo de pantallas de oficina: mismo encabezado (volver, título vacío) que el resto. Cada app/office/x.tsx se registra sola. */
export default function OfficeLayout() {
  return <Stack screenOptions={{ ...STACK_SCREEN_OPTIONS, title: "" }} />;
}
