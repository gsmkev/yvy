import { C, F } from "./theme";

/** Encabezado de las pantallas apiladas (volver + título vacío). Lo usan app/_layout.tsx y app/office/_layout.tsx. */
export const STACK_SCREEN_OPTIONS = {
  headerStyle: { backgroundColor: C.papel },
  headerShadowVisible: false,
  headerTintColor: C.tinta,
  headerTitleStyle: { fontFamily: F.sansSemi, fontSize: 18 },
  contentStyle: { backgroundColor: C.papel },
} as const;
