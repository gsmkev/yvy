/** Análisis de suelo: lectura y alta. GET/POST /org/farms/:id/soil-samples. */
import { useState } from "react";
import { View } from "react-native";
import { Plus } from "lucide-react-native";
import { localDate, SOIL_PARAMS, soilAverage, soilLevel, t, type MessageKey, type SoilParam } from "@yvy/shared";
import { getDb } from "../../../src/lib/db";
import { showToast } from "../../../src/lib/toast";
import { useLocal } from "../../../src/lib/useLocal";
import { useFarmPick } from "../../../src/office/farmPick";
import { fmtNumber, parseDecimal } from "../../../src/office/format";
import { FarmFrame } from "../../../src/office/hub";
import { OnlineState } from "../../../src/office/state";
import { useOnline } from "../../../src/office/useOnline";
import { useOnlineMutation } from "../../../src/office/useOnlineMutation";
import { DataList, DateField, FormSheet, SelectField, StatRow, TextField } from "../../../src/office/ui";
import { SectionHeader, Text } from "../../../src/ui/kit";
import { T } from "../../../src/ui/theme";

interface Sample {
  id: string;
  plotId: string | null;
  plotName: string | null;
  pointLabel: string | null;
  sampledOn: string;
  depthCm: number;
  lab: string | null;
  ph: number | null;
  pMgKg: number | null;
  kCmolKg: number | null;
  omPct: number | null;
}
const SHORT: Record<SoilParam, string> = { ph: "pH", pMgKg: "P", kCmolKg: "K", omPct: "MO" };
const dmy = (iso: string) => `${iso.slice(8)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
const cell = (p: SoilParam, v: number | null) => (v === null ? null : `${SHORT[p]} ${fmtNumber(v, 2)} (${t(`ui.soil.level_${soilLevel(p, v) ?? "medium"}` as MessageKey)})`);

const blank = () => ({ plotId: "", pointLabel: "", sampledOn: localDate(Date.now()), depthCm: "20", lab: "", ph: "", pMgKg: "", kCmolKg: "", omPct: "" });

/** Análisis de suelo por lote. */
export default function Soil() {
  const { farms, farm, setFarmId } = useFarmPick();
  const path = farm ? `/org/farms/${farm.id}/soil-samples` : null;
  const q = useOnline<Sample[]>(path);
  const plots = useLocal(() => (farm ? getDb().plots(farm.id) : []), [farm?.id]);
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank());
  const [formError, setFormError] = useState<string | null>(null);
  const save = useOnlineMutation<Record<string, unknown>, unknown>("POST", path ?? "", { invalidate: path ? [path] : [] });
  const set = (p: Partial<typeof f>) => setF((x) => ({ ...x, ...p }));

  const submit = async () => {
    const vals: Record<string, number | null> = {};
    for (const p of SOIL_PARAMS) {
      const raw = f[p].trim();
      vals[p] = raw === "" ? null : parseDecimal(raw);
      if (raw !== "" && vals[p] === null) return setFormError(t("office.soil.badNumber"));
    }
    if (SOIL_PARAMS.every((p) => vals[p] === null)) return setFormError(t("office.soil.needsValue"));
    const depth = parseDecimal(f.depthCm);
    if (!f.sampledOn || depth === null) return setFormError(t("office.soil.badNumber"));
    setFormError(null);
    const r = await save.mutate({ plotId: f.plotId || null, pointLabel: f.pointLabel.trim() || null, sampledOn: f.sampledOn, depthCm: depth, lab: f.lab.trim() || null, ...vals });
    if (r.ok) {
      setOpen(false);
      showToast(t("ui.soil.saved"));
    }
  };

  return (
    <FarmFrame
      title={t("ui.soil.title")}
      subtitle={t("ui.soil.intro")}
      farms={farms}
      farm={farm}
      setFarmId={setFarmId}
      query={q}
      action={{ label: t("ui.soil.add"), icon: Plus, onPress: () => { save.reset(); setFormError(null); setF(blank()); setOpen(true); } }}
    >
      <OnlineState query={q} empty={{ title: t("office.soil.noneTitle"), hint: t("ui.soil.none") }}>
        {(rows) => {
          const avg = soilAverage(rows);
          return (
            <View>
              {rows.length > 1 && (
                <>
                  <SectionHeader title={t("ui.soil.average")} />
                  <StatRow items={SOIL_PARAMS.filter((p) => avg[p] !== null).map((p) => ({ label: t(`ui.soil.param_${p}` as MessageKey), value: fmtNumber(avg[p]!, 2), unit: t(`ui.soil.level_${soilLevel(p, avg[p]) ?? "medium"}` as MessageKey) }))} />
                </>
              )}
              <DataList
                rows={rows}
                keyOf={(r) => r.id}
                title={(r) => [r.plotName, r.pointLabel].filter(Boolean).join(" · ") || t("ui.soil.farmWide")}
                subtitle={(r) => [`${dmy(r.sampledOn)} · ${r.depthCm} cm`, r.lab, SOIL_PARAMS.map((p) => cell(p, r[p])).filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
                empty={{ title: t("office.soil.noneTitle") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.soil.note")}</Text>
            </View>
          );
        }}
      </OnlineState>
      <FormSheet visible={open} title={t("office.soil.formTitle")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.common.save")} pending={save.pending} error={formError ?? save.error}>
        <SelectField label={t("ui.common.plot")} value={f.plotId} options={[{ value: "", label: t("ui.soil.farmWide") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ plotId: v })} />
        <DateField label={t("ui.soil.date")} value={f.sampledOn} onChange={(v) => set({ sampledOn: v })} />
        <TextField label={t("ui.soil.point")} value={f.pointLabel} onChangeText={(v) => set({ pointLabel: v })} maxLength={60} />
        <TextField label={t("ui.soil.depth")} value={f.depthCm} onChangeText={(v) => set({ depthCm: v })} kind="number" />
        <TextField label={t("ui.soil.lab")} value={f.lab} onChangeText={(v) => set({ lab: v })} maxLength={120} />
        {SOIL_PARAMS.map((p) => (
          <TextField key={p} label={t(`ui.soil.param_${p}` as MessageKey)} value={f[p]} onChangeText={(v) => set({ [p]: v })} kind="decimal" />
        ))}
        <Text style={[T.small, { marginTop: 8 }]}>{t("ui.soil.formHint")}</Text>
      </FormSheet>
    </FarmFrame>
  );
}
