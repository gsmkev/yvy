/** Análisis de suelo (función 80): lectura y alta. GET/POST /org/farms/:id/soil-samples. */
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
const cell = (p: SoilParam, v: number | null) => (v === null ? null : `${SHORT[p]} ${fmtNumber(v, 2)} (${t(`ui.soilLevel_${soilLevel(p, v) ?? "medium"}` as MessageKey)})`);

const blank = () => ({ plotId: "", pointLabel: "", sampledOn: localDate(Date.now()), depthCm: "20", lab: "", ph: "", pMgKg: "", kCmolKg: "", omPct: "" });

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
      if (raw !== "" && vals[p] === null) return setFormError(t("office.soilBadNumber"));
    }
    if (SOIL_PARAMS.every((p) => vals[p] === null)) return setFormError(t("office.soilNeedsValue"));
    const depth = parseDecimal(f.depthCm);
    if (!f.sampledOn || depth === null) return setFormError(t("office.soilBadNumber"));
    setFormError(null);
    const r = await save.mutate({ plotId: f.plotId || null, pointLabel: f.pointLabel.trim() || null, sampledOn: f.sampledOn, depthCm: depth, lab: f.lab.trim() || null, ...vals });
    if (r.ok) {
      setOpen(false);
      showToast(t("ui.soilSaved"));
    }
  };

  return (
    <FarmFrame
      title={t("ui.soilTitle")}
      subtitle={t("ui.soilIntro")}
      farms={farms}
      farm={farm}
      setFarmId={setFarmId}
      query={q}
      action={{ label: t("ui.soilAdd"), icon: Plus, onPress: () => { save.reset(); setFormError(null); setF(blank()); setOpen(true); } }}
    >
      <OnlineState query={q} empty={{ title: t("office.soilNoneTitle"), hint: t("ui.soilNone") }}>
        {(rows) => {
          const avg = soilAverage(rows);
          return (
            <View>
              {rows.length > 1 && (
                <>
                  <SectionHeader title={t("ui.soilAverage")} />
                  <StatRow items={SOIL_PARAMS.filter((p) => avg[p] !== null).map((p) => ({ label: t(`ui.soilParam_${p}` as MessageKey), value: fmtNumber(avg[p]!, 2), unit: t(`ui.soilLevel_${soilLevel(p, avg[p]) ?? "medium"}` as MessageKey) }))} />
                </>
              )}
              <DataList
                rows={rows}
                keyOf={(r) => r.id}
                title={(r) => [r.plotName, r.pointLabel].filter(Boolean).join(" · ") || t("ui.soilFarmWide")}
                subtitle={(r) => [`${dmy(r.sampledOn)} · ${r.depthCm} cm`, r.lab, SOIL_PARAMS.map((p) => cell(p, r[p])).filter(Boolean).join(" · ")].filter(Boolean).join("\n")}
                empty={{ title: t("office.soilNoneTitle") }}
              />
              <Text style={[T.small, { marginTop: 16 }]}>{t("ui.soilNote")}</Text>
            </View>
          );
        }}
      </OnlineState>
      <FormSheet visible={open} title={t("office.soilFormTitle")} onClose={() => setOpen(false)} onSubmit={submit} submitLabel={t("ui.save")} pending={save.pending} error={formError ?? save.error}>
        <SelectField label={t("ui.plot")} value={f.plotId} options={[{ value: "", label: t("ui.soilFarmWide") }, ...plots.map((p) => ({ value: p.id, label: p.name }))]} onChange={(v) => set({ plotId: v })} />
        <DateField label={t("ui.soilDate")} value={f.sampledOn} onChange={(v) => set({ sampledOn: v })} />
        <TextField label={t("ui.soilPoint")} value={f.pointLabel} onChangeText={(v) => set({ pointLabel: v })} maxLength={60} />
        <TextField label={t("ui.soilDepth")} value={f.depthCm} onChangeText={(v) => set({ depthCm: v })} kind="number" />
        <TextField label={t("ui.soilLab")} value={f.lab} onChangeText={(v) => set({ lab: v })} maxLength={120} />
        {SOIL_PARAMS.map((p) => (
          <TextField key={p} label={t(`ui.soilParam_${p}` as MessageKey)} value={f[p]} onChangeText={(v) => set({ [p]: v })} kind="decimal" />
        ))}
        <Text style={[T.small, { marginTop: 8 }]}>{t("ui.soilFormHint")}</Text>
      </FormSheet>
    </FarmFrame>
  );
}
