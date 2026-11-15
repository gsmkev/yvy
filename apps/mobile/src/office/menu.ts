import { AlertTriangle, ClipboardCheck } from "lucide-react-native";
import { groupMenu, GROUP_TITLE, type MenuCtx, type MenuGroup, type OfficeMenuItem } from "./menuLogic";

export { groupMenu, GROUP_TITLE };
export type { MenuCtx, MenuGroup, OfficeMenuItem };

/**
 * Registro del menú de la pestaña Gestión.
 *
 * PARA AGREGAR UNA PANTALLA: añadí una entrada AL FINAL de este arreglo y creá `app/office/<id>.tsx`.
 * No hace falta tocar ningún layout. Los grupos vacíos no se muestran.
 */
export const OFFICE_MENU: OfficeMenuItem[] = [
  { group: "campo", id: "alerts", title: "ui.alertsTitle", hint: "office.alertsRowHint", icon: AlertTriangle, href: "/office/alerts" },
  { group: "campo", id: "review", title: "ui.reviewTitle", hint: "office.reviewRowHint", icon: ClipboardCheck, href: "/office/review" },
  // ↓ agregá las nuevas entradas debajo de esta línea (solo al final)
];
