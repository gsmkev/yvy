/** Hacienda: índice con selector de estancia y una fila por módulo de ganadería (funciones 67 a 75). */
import { Beef, CalendarRange, Flame, Footprints, Heart, Scale, ShieldAlert, Sprout, Wheat } from "lucide-react-native";
import { t } from "@yvy/shared";
import { HubScreen, type HubEntry } from "../../src/office/hub";

const entries = (): HubEntry[] => [
  { id: "stock", title: t("office.herdStockTitle"), hint: t("office.herdRowStock"), icon: Beef, path: "/office/herd/stock" },
  { id: "rotation", title: t("ui.herdSectionRotation"), hint: t("office.herdRowRotation"), icon: Footprints, path: "/office/herd/rotation" },
  { id: "forage", title: t("ui.herdSectionForage"), hint: t("office.herdRowForage"), icon: Sprout, path: "/office/herd/forage" },
  { id: "animals", title: t("ui.herdSectionAnimals"), hint: t("office.herdRowAnimals"), icon: Beef, path: "/animals" },
  { id: "plan", title: t("ui.reproPlanSection"), hint: t("office.herdRowPlan"), icon: CalendarRange, path: "/office/herd/plan" },
  { id: "repro", title: t("ui.herdSectionRepro"), hint: t("office.herdRowRepro"), icon: Heart, path: "/office/herd/repro" },
  { id: "weights", title: t("ui.herdSectionWeights"), hint: t("office.herdRowWeights"), icon: Scale, path: "/office/herd/weighings" },
  { id: "supp", title: t("ui.herdSectionSupp"), hint: t("office.herdRowSupp"), icon: Wheat, path: "/office/herd/supplements" },
  { id: "theft", title: t("ui.herdSectionTheft"), hint: t("office.herdRowTheft"), icon: ShieldAlert, path: "/office/herd/theft" },
  { id: "heat", title: t("ui.heatTitle"), hint: t("office.herdRowHeat"), icon: Flame, path: "/office/herd/heat" },
];

export default function Herd() {
  return <HubScreen title={t("office.herdMenu")} entries={entries()} />;
}
