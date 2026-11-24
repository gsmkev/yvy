/**
 * Combustible: litros y consumo por máquina, con filtro por estancia. /org/erp/fuel/report.
 * La carga de combustible es el registro "carga de combustible" de Anotar (funciona sin señal y la sincroniza):
 * el botón abre ese flujo; el ERP descuenta el stock y carga el costo solo.
 */
import { useState } from "react";
import { router, type Href } from "expo-router";
import { Fuel } from "lucide-react-native";
import { t } from "@yvy/shared";
import { AdminGate, useFarmNames } from "../../../src/office/adminKit";
import { fmtNumber } from "../../../src/office/format";
import { fmtQty } from "../../../src/office/money";
import { OfficeScreen } from "../../../src/office/OfficeScreen";
import { OnlineState } from "../../../src/office/state";
import { DataList, FilterChips, StatRow } from "../../../src/office/ui";
import { useOnline } from "../../../src/office/useOnline";

interface MachineFuel {
  machineId: string | null;
  name: string;
  meterKind: "hours" | "km";
  loads: number;
  liters: number;
  firstMeter: number | null;
  lastMeter: number | null;
  litersPerUnit: number | null;
}

/** Combustible: cargas y consumo por máquina. */
export default function FuelScreen() {
  const farmNames = useFarmNames();
  const [farmId, setFarmId] = useState("");
  const q = useOnline<MachineFuel[]>(`/org/erp/fuel/report${farmId ? `?farmId=${farmId}` : ""}`);
  const farms = [...farmNames.entries()];
  const rows = q.data ?? [];
  const liters = rows.reduce((a, r) => a + r.liters, 0);
  const loads = rows.reduce((a, r) => a + r.loads, 0);
  const load = () => router.push({ pathname: "/annotate", params: { kind: "fuel_load", farmLevel: "1" } } as Href);
  return (
    <AdminGate need="stock" title={t("ui.admin.section_fuel")}>
      <OfficeScreen title={t("ui.admin.section_fuel")} query={q} action={{ label: t("ui.fuel.new"), icon: Fuel, onPress: load }}>
        {farms.length > 1 ? <FilterChips value={farmId} onChange={setFarmId} options={[{ value: "", label: t("ui.cost.all") }, ...farms.map(([id, name]) => ({ value: id, label: name }))]} /> : null}
        <OnlineState query={q} empty={{ title: t("ui.empty.fuelTitle"), hint: t("ui.empty.fuelBody") }}>
          {(data) => (
            <>
              <StatRow items={[{ label: `${t("ui.fuel.liters")} · l`, value: fmtNumber(liters, 0) }, { label: t("ui.fuel.loads"), value: loads }]} />
              <DataList
                rows={data}
                keyOf={(m) => m.machineId ?? m.name}
                title={(m) => m.name}
                subtitle={(m) =>
                  [t("office.adm.fuelLoads", { n: m.loads }), m.firstMeter !== null && m.lastMeter !== null ? `${fmtNumber(m.firstMeter)} a ${fmtNumber(m.lastMeter)} ${m.meterKind === "hours" ? "h" : "km"}` : null, m.litersPerUnit !== null ? `${fmtQty(m.litersPerUnit)} ${m.meterKind === "hours" ? t("ui.fuel.perHour") : t("ui.fuel.per100km")}` : null].filter(Boolean).join(" · ")
                }
                right={(m) => fmtQty(m.liters, "l")}
                empty={{ title: t("ui.fuel.empty") }}
              />
            </>
          )}
        </OnlineState>
      </OfficeScreen>
    </AdminGate>
  );
}
