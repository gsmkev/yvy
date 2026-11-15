/** Agronomía: índice con selector de estancia y una fila por herramienta agrícola (funciones 76 a 82 y horas para pulverizar). */
import { CloudSun, FlaskConical, Home, Leaf, ShieldAlert, SprayCan, Truck } from "lucide-react-native";
import { t } from "@yvy/shared";
import { HubScreen, type HubEntry } from "../../src/office/hub";

const entries = (): HubEntry[] => [
  { id: "sowing-plan", title: t("ui.sowPlanTitle"), hint: t("office.agroRowSowPlan"), icon: Leaf, path: "/office/agro/sowing-plan" },
  { id: "sowing-window", title: t("ui.sowWinTitle"), hint: t("office.agroRowSowWin"), icon: CloudSun, path: "/office/agro/sowing-window" },
  { id: "spray", title: t("ui.sprayTitle"), hint: t("office.agroRowSpray"), icon: SprayCan, path: "/office/agro/spray" },
  { id: "withdrawal", title: t("ui.withdrawalTitle"), hint: t("office.agroRowWithdrawal"), icon: ShieldAlert, path: "/office/agro/withdrawal" },
  { id: "buffer", title: t("ui.bufferTitle"), hint: t("office.agroRowBuffer"), icon: Home, path: "/office/agro/buffer" },
  { id: "soil", title: t("ui.soilTitle"), hint: t("office.agroRowSoil"), icon: FlaskConical, path: "/office/agro/soil" },
  { id: "deliveries", title: t("ui.delivTitle"), hint: t("office.agroRowDeliveries"), icon: Truck, path: "/office/agro/deliveries" },
];

export default function Agro() {
  return <HubScreen title={t("office.agroMenu")} entries={entries()} />;
}
