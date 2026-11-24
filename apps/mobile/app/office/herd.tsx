/** Hacienda: índice con selector de estancia y una fila por módulo de ganadería (funciones 67 a 75). */
import { Beef, CalendarRange, Flame, Footprints, Heart, Scale, ShieldAlert, Sprout, Wheat } from "lucide-react-native";
import { t } from "@yvy/shared";
import { HubScreen, type HubEntry } from "../../src/office/hub";

const entries = (): HubEntry[] => [
  { id: "stock", title: t("office.herd.stockTitle"), hint: t("office.herd.rowStock"), icon: Beef, path: "/office/herd/stock" },
  { id: "rotation", title: t("ui.herd.sectionRotation"), hint: t("office.herd.rowRotation"), icon: Footprints, path: "/office/herd/rotation" },
  { id: "forage", title: t("ui.herd.sectionForage"), hint: t("office.herd.rowForage"), icon: Sprout, path: "/office/herd/forage" },
  { id: "animals", title: t("ui.herd.sectionAnimals"), hint: t("office.herd.rowAnimals"), icon: Beef, path: "/animals" },
  { id: "plan", title: t("ui.repro.planSection"), hint: t("office.herd.rowPlan"), icon: CalendarRange, path: "/office/herd/plan" },
  { id: "repro", title: t("ui.herd.sectionRepro"), hint: t("office.herd.rowRepro"), icon: Heart, path: "/office/herd/repro" },
  { id: "weights", title: t("ui.herd.sectionWeights"), hint: t("office.herd.rowWeights"), icon: Scale, path: "/office/herd/weighings" },
  { id: "supp", title: t("ui.herd.sectionSupp"), hint: t("office.herd.rowSupp"), icon: Wheat, path: "/office/herd/supplements" },
  { id: "theft", title: t("ui.herd.sectionTheft"), hint: t("office.herd.rowTheft"), icon: ShieldAlert, path: "/office/herd/theft" },
  { id: "heat", title: t("ui.heat.title"), hint: t("office.herd.rowHeat"), icon: Flame, path: "/office/herd/heat" },
];

export default function Herd() {
  return <HubScreen title={t("office.herd.menu")} entries={entries()} />;
}
