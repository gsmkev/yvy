/** Agronomía: índice con selector de estancia y una fila por herramienta agrícola. */
import { CloudSun, FlaskConical, Home, Leaf, ShieldAlert, SprayCan, Truck } from "lucide-react-native";
import { t } from "@yvy/shared";
import { HubScreen, type HubEntry } from "../../src/office/hub";

const entries = (): HubEntry[] => [
  { id: "sowing-plan", title: t("ui.sow.planTitle"), hint: t("office.agro.rowSowPlan"), icon: Leaf, path: "/office/agro/sowing-plan" },
  { id: "sowing-window", title: t("ui.sow.winTitle"), hint: t("office.agro.rowSowWin"), icon: CloudSun, path: "/office/agro/sowing-window" },
  { id: "spray", title: t("ui.spray.title"), hint: t("office.agro.rowSpray"), icon: SprayCan, path: "/office/agro/spray" },
  { id: "withdrawal", title: t("ui.withdrawal.title"), hint: t("office.agro.rowWithdrawal"), icon: ShieldAlert, path: "/office/agro/withdrawal" },
  { id: "buffer", title: t("ui.buffer.title"), hint: t("office.agro.rowBuffer"), icon: Home, path: "/office/agro/buffer" },
  { id: "soil", title: t("ui.soil.title"), hint: t("office.agro.rowSoil"), icon: FlaskConical, path: "/office/agro/soil" },
  { id: "deliveries", title: t("ui.deliv.title"), hint: t("office.agro.rowDeliveries"), icon: Truck, path: "/office/agro/deliveries" },
];

/** Menú de herramientas agronómicas (ventana de siembra, deriva, suelo, carencia, entregas). */
export default function Agro() {
  return <HubScreen title={t("office.agro.menu")} entries={entries()} />;
}
